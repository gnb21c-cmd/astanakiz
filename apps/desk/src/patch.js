/* 고친 내용만 바꾸기 (사장님 11/18 — "업뎃해" 하실 때만 · 지웠다가 다시 설치하지 않게)
   예전(11/16 ~ 11/17 ver.2.27 ~ 2.29): 새 판이면 설치 파일 전체를 받아 옛 프로그램을 지우고 다시 설치 → 그 사이 프로그램 파일이 없어
     직원이 아이콘을 누르거나 POS 를 끄면 Windows 가 '바로 가기 문제 — 삭제하시겠습니까?'를 띄워 바탕화면 아이콘이 없어질 수 있었음 (11/17 저녁)
   지금:
   - "업뎃해" → 그 판(v2.X)에 desk-patch.json(작은 안내: 판 · sha512 · 껍데기) + desk-patch-files.json(고친 파일 묶음: 화면 desk.html · 동작 파일 src · 설명서 사진)을 올림
   - 앱은 10분마다 desk-patch.json 만 봄 (보기만 · 바꾸지 않음) → 새 판이면 묶음을 받아 sha512 를 맞춰 보고 앱 폴더 patch\<판> 에 풀어 둠
   - 1분 띠 뒤 데스크만 다시 켬 (몇 초) — 설치 프로그램 · 프로그램 폴더 · 바탕화면 아이콘은 건드리지 않음 · 근무자가 끄면 다음에 켤 때
   - 켤 때 boot.js 가 판을 고름 · 그 판이 3번 연속 화면까지 못 켜지면 바로 앞 판(없으면 설치한 판)으로 저절로 돌아감
   - 껍데기(Electron 큰 판 · boot.js · 꾸러미)가 바뀐 판은 이 방식으로 못 바꿈 → 띠에 알림만 (저절로 설치하지 않음)
   받는 곳은 공개 저장소 Releases 뿐 · 아무것도 보내지 않음 · 손님 정보 · 설정(앱 폴더)은 그대로 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const EventEmitter = require("events");

const PATCH_TYPE = "astanakiz-desk-patch";
const FILES_TYPE = "astanakiz-desk-files";
const BOOT_V = 1; // boot.js 가 바뀌면 올림 (껍데기가 바뀜 → 설치 파일로만)
const REPO = "gnb21c-cmd/astanakiz";
const INFO_URL = `https://github.com/${REPO}/releases/latest/download/desk-patch.json`;
const filesUrl = (info) => `https://github.com/${REPO}/releases/download/${encodeURIComponent(info.tag)}/${encodeURIComponent(info.files)}`;
const STATE = "state.json";
const STAGED = "staged.json";
const MAX_TRIES = 3; // 화면까지 못 켜진 채로 이만큼 연속이면 앞 판으로
const NEED = ["src/main.js", "src/preload.js", "desk.html"];

const isVer = (v) => /^\d+(\.\d+){1,2}$/.test(String(v || ""));
/** a 가 b 보다 새 판인가 (2.30 > 2.29 · 2.29.1 > 2.29) · b 가 판 모양이 아니면(개발) a 가 판이면 새 판 */
function newer(a, b) {
  if (!isVer(a)) return false;
  if (!isVer(b)) return true;
  const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const p = x[i] || 0, q = y[i] || 0;
    if (p !== q) return p > q;
  }
  return false;
}
/** 껍데기 이름: Electron 큰 판 · boot.js 판 · 꾸러미(dependencies) — 이게 같아야 고친 내용만으로 바꿀 수 있음 */
function shellId({ electron, deps, boot = BOOT_V }) {
  const major = String(electron || "").split(".")[0] || "?";
  const d = crypto.createHash("sha1").update(JSON.stringify(Object.keys(deps || {}).sort().map((k) => [k, String(deps[k])]))).digest("hex").slice(0, 8);
  return `e${major}-b${boot}-d${d}`;
}
const sha512 = (buf) => crypto.createHash("sha512").update(buf).digest("base64");
/** 묶음 안 파일 이름: desk.html · src/… · manual/… 만 (.. · 절대 경로 · 점으로 시작하는 이름 안 됨) */
const safeRel = (rel) => /^(desk\.html|(src|manual)(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)+)$/.test(String(rel || ""));

function readState(dir) {
  const empty = { use: "", prev: "", bad: [], tries: {}, okAt: {}, note: "" };
  try {
    const s = JSON.parse(fs.readFileSync(path.join(dir, STATE), "utf8"));
    return { use: isVer(s.use) ? s.use : "", prev: isVer(s.prev) ? s.prev : "", bad: Array.isArray(s.bad) ? s.bad.filter(isVer) : [], tries: s.tries && typeof s.tries === "object" ? s.tries : {}, okAt: s.okAt && typeof s.okAt === "object" ? s.okAt : {}, note: typeof s.note === "string" ? s.note.slice(0, 200) : "" };
  } catch (e) {
    return empty;
  }
}
function writeState(dir, s) {
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, STATE);
  fs.writeFileSync(f + ".tmp", JSON.stringify(s, null, 1));
  fs.renameSync(f + ".tmp", f);
}
/** 풀어 둔 판이 쓸 만한가: 끝까지 풀렸고(staged.json) · 껍데기가 같고 · 꼭 있어야 할 파일이 있음 */
function staged(dir, build, shell) {
  if (!isVer(build)) return false;
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dir, build, STAGED), "utf8"));
    return m.build === build && m.shell === shell && NEED.every((f) => fs.existsSync(path.join(dir, build, f)));
  } catch (e) {
    return false;
  }
}

/** 켤 때 쓸 판 고르기 (boot.js) → { root: 판 폴더 또는 ""(설치한 판), build, why }
   bundled = 설치한 판 · shell = 이 껍데기 · 고른 판의 '켜 본 횟수'를 하나 올려 둠 (화면까지 켜지면 markOk 가 0 으로) */
function pick(dir, { bundled, shell, maxTries = MAX_TRIES }) {
  const s = readState(dir);
  const why = [];
  const usable = (b) => b && !s.bad.includes(b) && newer(b, bundled) && staged(dir, b, shell);
  // 연속으로 화면까지 못 켜진 판 → 빼고 앞 판으로
  if (s.use && (Number(s.tries[s.use]) || 0) >= maxTries) {
    why.push(`ver.${s.use} 이 ${maxTries}번 연속 켜지지 않아 앞 판으로 돌아감`);
    if (!s.bad.includes(s.use)) s.bad.push(s.use);
    s.use = s.prev && s.prev !== s.use ? s.prev : "";
    s.prev = "";
  }
  if (s.use && !usable(s.use)) {
    why.push(newer(s.use, bundled) ? `ver.${s.use} 을 쓸 수 없어 ${usable(s.prev) ? `ver.${s.prev}` : "설치한 판"}으로` : `설치한 판(ver.${bundled})이 더 새 판`);
    s.use = usable(s.prev) ? s.prev : "";
    s.prev = "";
  }
  if (s.note) {
    why.unshift(s.note); // 켜지다 멈춰 뺀 판 (markBad) — 한 번만 알림
    s.note = "";
  }
  const b = s.use;
  if (b) s.tries[b] = (Number(s.tries[b]) || 0) + 1;
  writeState(dir, s);
  return { root: b ? path.join(dir, b) : "", build: b || bundled, why: why.join(" · ") };
}
/** 고른 판이 화면까지 켜짐 → 켜 본 횟수 0 */
function markOk(dir, build) {
  const s = readState(dir);
  if (s.use !== build) return;
  s.tries[build] = 0;
  s.okAt[build] = Date.now();
  writeState(dir, s);
}
/** 켜다가 바로 멈춘 판(파일이 깨짐 등) → 빼고 앞 판으로 (boot.js) */
function markBad(dir, build) {
  const s = readState(dir);
  if (!s.bad.includes(build)) s.bad.push(build);
  s.note = `ver.${build} 이 켜지다 멈춰 앞 판으로 돌아감`;
  if (s.use === build) {
    s.use = s.prev && s.prev !== build ? s.prev : "";
    s.prev = "";
  }
  writeState(dir, s);
}
/** 받은 묶음 풀기: sha512 · 모양 · 파일 이름을 맞춰 보고 <판>.tmp 에 다 쓴 뒤 <판> 으로 (중간에 꺼져도 반쯤 풀린 판은 안 씀) */
function stage(dir, info, text) {
  if (sha512(Buffer.from(text, "utf8")) !== info.sha512) throw new Error("받은 묶음이 안내와 다름 (sha512)");
  let bundle;
  try {
    bundle = JSON.parse(text);
  } catch (e) {
    throw new Error("받은 묶음을 읽지 못함");
  }
  if (!bundle || bundle.type !== FILES_TYPE || bundle.build !== info.build || !bundle.files || typeof bundle.files !== "object") throw new Error("받은 묶음 모양이 다름");
  const rels = Object.keys(bundle.files);
  const odd = rels.find((r) => !safeRel(r) || typeof bundle.files[r] !== "string");
  if (odd !== undefined) throw new Error(`묶음에 이상한 파일 이름: ${String(odd).slice(0, 60)}`);
  const miss = NEED.find((r) => !rels.includes(r));
  if (miss) throw new Error(`묶음에 ${miss} 이 없음`);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, info.build + ".tmp");
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const r of rels) {
    const f = path.join(tmp, ...r.split("/"));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, Buffer.from(bundle.files[r], "base64"));
  }
  fs.writeFileSync(path.join(tmp, STAGED), JSON.stringify({ build: info.build, sha: info.sha || "", shell: info.shell, at: Date.now() }));
  const fin = path.join(dir, info.build);
  fs.rmSync(fin, { recursive: true, force: true });
  fs.renameSync(tmp, fin);
  return fin;
}
/** 새 판을 다음에 켤 때 쓰게 (지금 판은 바로 앞 판으로 기억 · 문제 나면 돌아감) */
function setUse(dir, build, running) {
  const s = readState(dir);
  if (s.use !== build) {
    s.prev = isVer(running) && running !== build ? running : s.use;
    s.use = build;
  }
  s.tries[build] = 0;
  s.bad = s.bad.filter((b) => b !== build);
  writeState(dir, s);
}
/** 쓰지 않는 옛 판 폴더 지우기 (지금 판 · 앞 판 · 다음 판만 남김) */
function prune(dir, keep) {
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch (e) {
    return;
  }
  for (const n of names) {
    if (n === STATE || keep.includes(n)) continue;
    if (isVer(n) || /\.tmp$/.test(n)) fs.rmSync(path.join(dir, n), { recursive: true, force: true });
  }
}
function checkInfo(info) {
  if (!info || info.type !== PATCH_TYPE || Number(info.v) !== 1) throw new Error("새 판 안내 모양이 다름");
  if (!isVer(info.build) || !info.tag || !info.files || !info.sha512 || !info.shell) throw new Error("새 판 안내에 빠진 칸이 있음");
  return info;
}

/** electron-updater 의 autoUpdater 와 같은 모양 (updater.js 의 DeskUpdater 가 그대로 씀)
   fetchText(url, onPercent) → 글 · onApply(build) = 데스크 다시 켜기 · current = 지금 켜진 판 */
class PatchUpdater extends EventEmitter {
  constructor({ dir, current, shell, fetchText, onApply, infoUrl = INFO_URL, fileUrl = filesUrl, log = () => {} }) {
    super();
    Object.assign(this, { dir, current, shell, fetchText, onApply, infoUrl, fileUrl, log });
    this.readyBuild = "";
    this.busyNow = false;
  }
  async checkForUpdates() {
    if (this.busyNow) return null;
    this.busyNow = true;
    this.emit("checking-for-update");
    try {
      const info = checkInfo(JSON.parse(await this.fetchText(this.infoUrl)));
      if (!newer(info.build, this.current)) {
        this.emit("update-not-available", { version: info.build });
        return info;
      }
      if (readState(this.dir).bad.includes(info.build)) {
        // 켜지지 않아 뺀 판은 다시 받지 않음 (같은 판으로 껐다 켜기를 되풀이하지 않게) — 고친 다음 판을 기다림
        if (this.skipped !== info.build) this.log(`ver.${info.build} 은 켜지지 않아 뺀 판 — 다시 받지 않고 다음 판을 기다림`);
        this.skipped = info.build;
        this.emit("update-not-available", { version: info.build });
        return info;
      }
      if (info.shell !== this.shell) throw new Error(`ver.${info.build} 은 이 방식으로 못 바꾸는 판 (껍데기가 다름 ${info.shell}) — 설치 파일로 (저절로 설치하지 않음)`);
      if (!staged(this.dir, info.build, this.shell)) {
        this.emit("update-available", { version: info.build });
        this.log(`새 판 ver.${info.build} 받는 중 (고친 내용만)`);
        const text = await this.fetchText(this.fileUrl(info), (p) => this.emit("download-progress", { percent: p }));
        stage(this.dir, info, text);
        this.log(`새 판 ver.${info.build} 받음 · sha512 맞음 · 풀어 둠`);
      }
      setUse(this.dir, info.build, this.current);
      prune(this.dir, [this.current, info.build, readState(this.dir).prev]);
      this.readyBuild = info.build;
      this.emit("update-downloaded", { version: info.build });
      return info;
    } catch (e) {
      this.emit("error", e);
      return null;
    } finally {
      this.busyNow = false;
    }
  }
  /** DeskUpdater 가 1분 띠 뒤 부름 — 데스크만 다시 켬 (설치 없음) */
  quitAndInstall() {
    if (!this.readyBuild) throw new Error("받아 둔 새 판이 없음");
    this.onApply(this.readyBuild);
  }
}

/** 만들 때(workflow · scripts/make-patch.js): 고친 파일 묶음과 안내 만들기 — files = { "src/main.js": Buffer, … } */
function makePatch({ build, sha = "", tag, shell, files, at = new Date().toISOString(), filesName = "desk-patch-files.json" }) {
  const rels = Object.keys(files).sort();
  const bad = rels.find((r) => !safeRel(r));
  if (bad !== undefined) throw new Error(`묶을 수 없는 파일 이름: ${bad}`);
  const miss = NEED.find((r) => !rels.includes(r));
  if (miss) throw new Error(`꼭 있어야 할 ${miss} 이 없음`);
  const text = JSON.stringify({ type: FILES_TYPE, build, files: Object.fromEntries(rels.map((r) => [r, Buffer.from(files[r]).toString("base64")])) });
  const info = { type: PATCH_TYPE, v: 1, build, sha, tag, shell, files: filesName, size: Buffer.byteLength(text), sha512: sha512(Buffer.from(text, "utf8")), count: rels.length, at };
  return { info, text };
}

module.exports = { PatchUpdater, pick, markOk, markBad, stage, setUse, prune, readState, staged, newer, shellId, makePatch, safeRel, sha512, BOOT_V, INFO_URL, filesUrl, MAX_TRIES, PATCH_TYPE, FILES_TYPE };
