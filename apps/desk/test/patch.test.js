/* 고친 내용만 바꾸기 (사장님 11/18 — "업뎃해" 하실 때만 · 지웠다가 다시 설치하지 않게) — patch.js
   - 안내(desk-patch.json)만 보고 새 판이 아니면 아무것도 안 받음 · 새 판이면 묶음을 받아 sha512 를 맞춰 보고 patch\<판> 에 풀어 둠
   - 켤 때 판 고르기: 받아 둔 새 판 → 3번 연속 화면까지 못 켜지면 앞 판(없으면 설치한 판) · 켜지다 멈춘 판은 바로 뺌
   - 껍데기(Electron · boot · 꾸러미)가 다른 판은 받지 않음 (설치 파일로만 — 저절로 설치하지 않음)
   - 묶음 안 이상한 파일 이름(.. · 절대 경로)은 막음 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const P = require("../src/patch");
const MP = require("../scripts/make-patch");

const SHELL = "e38-b1-dabcdef12";
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "desk-patch-"));
const files = (mark) => ({ "src/main.js": `// main ${mark}`, "src/preload.js": "// preload", "src/build.json": JSON.stringify({ build: mark }), "desk.html": `<title>${mark}</title>`, "manual/m1-main.jpg": Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x10]) });
const mk = (build, extra = {}) => P.makePatch({ build, sha: "abc1234", tag: `v${build}`, shell: SHELL, files: files(build), at: "2026-11-18T10:00:00Z", ...extra });
/** 가짜 GitHub: 안내 · 묶음 (받은 주소 기록) */
function fakeNet(rel) {
  const hits = [];
  const fetchText = async (url, onPct) => {
    hits.push(url);
    if (url === "INFO") {
      if (!rel.cur) throw new Error("받지 못함 (404)");
      return JSON.stringify(rel.cur.info);
    }
    const m = /^FILES\/(.+)$/.exec(url);
    if (m && rel.cur && m[1] === rel.cur.info.tag) {
      if (onPct) onPct(50);
      return rel.tamper ? rel.cur.text.replace("main", "mAin") : rel.cur.text;
    }
    throw new Error("받지 못함 (404)");
  };
  return { hits, fetchText };
}
function updater(dir, net, { current = "2.30", shell = SHELL } = {}) {
  const ev = [];
  const applied = [];
  const u = new P.PatchUpdater({ dir, current, shell, fetchText: net.fetchText, onApply: (b) => applied.push(b), infoUrl: "INFO", fileUrl: (i) => `FILES/${i.tag}` });
  for (const k of ["checking-for-update", "update-not-available", "update-available", "download-progress", "update-downloaded", "error"]) u.on(k, (x) => ev.push([k, k === "error" ? x.message : x && (x.version || x.percent)]));
  return { u, ev, applied };
}

test("판 비교 · 껍데기 이름 · 묶음 안 파일 이름", () => {
  assert.deepStrictEqual([P.newer("2.30", "2.29"), P.newer("2.29.1", "2.29"), P.newer("2.29", "2.29"), P.newer("2.9", "2.29"), P.newer("2.30", "개발"), P.newer("개발", "2.29"), P.newer("3.0", "2.99")], [true, true, false, false, true, false, true]);
  const a = P.shellId({ electron: "38.8.6", deps: { "electron-updater": "6.8.11" } });
  assert.match(a, /^e38-b1-d[0-9a-f]{8}$/);
  assert.strictEqual(P.shellId({ electron: "38.1.0", deps: { "electron-updater": "6.8.11" } }), a, "Electron 작은 판은 같은 껍데기");
  assert.notStrictEqual(P.shellId({ electron: "39.0.0", deps: { "electron-updater": "6.8.11" } }), a, "큰 판이 바뀌면 다른 껍데기");
  assert.notStrictEqual(P.shellId({ electron: "38.8.6", deps: { "electron-updater": "6.8.11", x: "1" } }), a, "꾸러미가 바뀌면 다른 껍데기");
  assert.notStrictEqual(P.shellId({ electron: "38.8.6", deps: { "electron-updater": "6.8.11" }, boot: 2 }), a, "boot.js 가 바뀌면 다른 껍데기");
  for (const ok of ["desk.html", "src/main.js", "src/sub/x.js", "manual/m1-main.jpg"]) assert.ok(P.safeRel(ok), ok);
  for (const bad of ["../x.js", "src/../../x.js", "/etc/passwd", "C:\\x", "src\\main.js", "src/.hidden", "other/x.js", "src/", "desk.htm", ""]) assert.ok(!P.safeRel(bad), bad);
});

test("새 판이 아니면 안내만 보고 아무것도 안 받음 · 새 판이면 묶음을 받아 sha512 를 맞춰 보고 풀어 둠 → 1분 띠 뒤 데스크만 다시 켬", async () => {
  const dir = tmp(), rel = { cur: mk("2.30") }, net = fakeNet(rel);
  const { u, ev, applied } = updater(dir, net);
  await u.checkForUpdates();
  assert.deepStrictEqual(ev, [["checking-for-update", undefined], ["update-not-available", "2.30"]]);
  assert.deepStrictEqual(net.hits, ["INFO"], "안내만 봄");
  assert.deepStrictEqual(fs.existsSync(dir) ? fs.readdirSync(dir) : [], [], "아무것도 안 씀");
  // "업뎃해" → 2.31
  rel.cur = mk("2.31");
  ev.length = 0;
  await u.checkForUpdates();
  assert.deepStrictEqual(ev, [["checking-for-update", undefined], ["update-available", "2.31"], ["download-progress", 50], ["update-downloaded", "2.31"]]);
  assert.deepStrictEqual(net.hits, ["INFO", "INFO", "FILES/v2.31"]);
  assert.strictEqual(fs.readFileSync(path.join(dir, "2.31", "desk.html"), "utf8"), "<title>2.31</title>");
  assert.deepStrictEqual([...fs.readFileSync(path.join(dir, "2.31", "manual", "m1-main.jpg"))], [0xff, 0xd8, 0xff, 0x00, 0x10], "사진도 그대로");
  assert.ok(P.staged(dir, "2.31", SHELL));
  assert.deepStrictEqual(P.readState(dir), { use: "2.31", prev: "2.30", bad: [], tries: { "2.31": 0 }, okAt: {}, note: "" }, "다음에 켤 때 2.31 · 앞 판 2.30");
  // 다시 확인해도 다시 받지 않음
  await u.checkForUpdates();
  assert.strictEqual(net.hits.filter((h) => h.startsWith("FILES")).length, 1, "한 번만 받음");
  u.quitAndInstall();
  assert.deepStrictEqual(applied, ["2.31"], "데스크만 다시 켬 (설치 없음)");
});

test("받은 묶음이 안내와 다르면(sha512) 풀지 않음 · 껍데기가 다른 판은 받지 않고 까닭 · 안내가 없으면 확인 못 함", async () => {
  const dir = tmp(), rel = { cur: mk("2.31"), tamper: true }, net = fakeNet(rel);
  const { u, ev } = updater(dir, net);
  await u.checkForUpdates();
  assert.deepStrictEqual(ev.at(-1), ["error", "받은 묶음이 안내와 다름 (sha512)"]);
  assert.ok(!P.staged(dir, "2.31", SHELL));
  assert.deepStrictEqual(P.readState(dir).use, "", "다음에 켤 판도 그대로");
  assert.throws(() => u.quitAndInstall(), /받아 둔 새 판이 없음/);
  // 껍데기가 다름 (Electron 큰 판이 바뀐 판 등)
  rel.tamper = false;
  rel.cur = mk("2.32", { shell: "e39-b1-d00000000" });
  ev.length = 0;
  await u.checkForUpdates();
  assert.match(ev.at(-1)[1], /ver\.2\.32 은 이 방식으로 못 바꾸는 판 .*설치 파일로 \(저절로 설치하지 않음\)/);
  assert.ok(!net.hits.includes("FILES/v2.32"), "묶음을 받지 않음");
  // 안내 없음 (예전 판만 있는 Releases) · 모양이 다름
  rel.cur = null;
  ev.length = 0;
  await u.checkForUpdates();
  assert.deepStrictEqual(ev.at(-1), ["error", "받지 못함 (404)"]);
  rel.cur = { info: { type: "x" }, text: "" };
  await u.checkForUpdates();
  assert.deepStrictEqual(ev.at(-1), ["error", "새 판 안내 모양이 다름"]);
});

test("묶음 안 이상한 파일 이름(..)은 막음 · 꼭 있어야 할 파일(main · preload · 화면)이 없으면 막음 · 만들 때도 막음", () => {
  const dir = tmp();
  const evil = JSON.stringify({ type: P.FILES_TYPE, build: "2.31", files: { "src/main.js": "", "src/preload.js": "", "desk.html": "", "src/../../evil.js": Buffer.from("x").toString("base64") } });
  const info = { build: "2.31", shell: SHELL, sha512: P.sha512(Buffer.from(evil, "utf8")) };
  assert.throws(() => P.stage(dir, info, evil), /이상한 파일 이름/);
  assert.ok(!fs.existsSync(path.join(dir, "..", "evil.js")));
  const miss = JSON.stringify({ type: P.FILES_TYPE, build: "2.31", files: { "src/main.js": "", "desk.html": "" } });
  assert.throws(() => P.stage(dir, { build: "2.31", shell: SHELL, sha512: P.sha512(Buffer.from(miss, "utf8")) }, miss), /src\/preload\.js 이 없음/);
  assert.throws(() => P.makePatch({ build: "2.31", tag: "v2.31", shell: SHELL, files: { ...files("2.31"), "../x": "1" } }), /묶을 수 없는 파일 이름/);
  assert.throws(() => P.makePatch({ build: "2.31", tag: "v2.31", shell: SHELL, files: { "src/main.js": "1" } }), /꼭 있어야 할/);
});

test("켤 때 판 고르기: 받아 둔 새 판 · 화면까지 켜지면 횟수 0 · 3번 연속 못 켜지면 앞 판 → 설치한 판 · 켜지다 멈춘 판은 바로 뺌 · 설치한 판이 더 새 판이면 설치한 판", () => {
  const dir = tmp();
  const pick = () => { const p = P.pick(dir, { bundled: "2.30", shell: SHELL }); return [p.root ? path.basename(p.root) : "", p.build, p.why]; };
  assert.deepStrictEqual(pick(), ["", "2.30", ""], "받아 둔 판 없음 → 설치한 판");
  for (const b of ["2.31", "2.32"]) P.stage(dir, mk(b).info, mk(b).text);
  P.setUse(dir, "2.31", "2.30");
  assert.deepStrictEqual(pick(), ["2.31", "2.31", ""]);
  P.markOk(dir, "2.31");
  assert.strictEqual(P.readState(dir).tries["2.31"], 0);
  P.setUse(dir, "2.32", "2.31");
  // 2.32 가 화면까지 못 켜짐 × 3 → 네 번째는 앞 판 2.31
  assert.deepStrictEqual(pick(), ["2.32", "2.32", ""]);
  assert.deepStrictEqual(pick(), ["2.32", "2.32", ""]);
  assert.deepStrictEqual(pick(), ["2.32", "2.32", ""]);
  assert.deepStrictEqual(pick(), ["2.31", "2.31", "ver.2.32 이 3번 연속 켜지지 않아 앞 판으로 돌아감"]);
  assert.deepStrictEqual(P.readState(dir).bad, ["2.32"]);
  // 켜지다 바로 멈춘 판(boot.js) → 빼고 설치한 판
  P.markBad(dir, "2.31");
  assert.deepStrictEqual(pick(), ["", "2.30", "ver.2.31 이 켜지다 멈춰 앞 판으로 돌아감"], "한 번 알림");
  assert.deepStrictEqual(pick(), ["", "2.30", ""]);
  // 다시 "업뎃해"(2.33) → 씀
  P.stage(dir, mk("2.33").info, mk("2.33").text);
  P.setUse(dir, "2.33", "2.30");
  assert.deepStrictEqual(pick(), ["2.33", "2.33", ""]);
  // 껍데기가 다르면 (설치 파일로 새 껍데기를 깔았을 때) 받아 둔 판은 안 씀
  assert.deepStrictEqual(P.pick(dir, { bundled: "2.30", shell: "e39-b1-d00000000" }).build, "2.30");
  // 설치한 판이 더 새 판 (설치 파일로 2.40 을 깔았을 때)
  P.setUse(dir, "2.33", "2.30");
  const p = P.pick(dir, { bundled: "2.40", shell: SHELL });
  assert.deepStrictEqual([p.root, p.build, p.why], ["", "2.40", "설치한 판(ver.2.40)이 더 새 판"]);
  // 반쯤 풀린 판(.tmp)은 안 씀
  fs.mkdirSync(path.join(dir, "2.50.tmp", "src"), { recursive: true });
  P.setUse(dir, "2.50", "2.30");
  assert.strictEqual(P.pick(dir, { bundled: "2.30", shell: SHELL }).build, "2.30");
});

test("켜지지 않아 뺀 판은 GitHub 에 그대로 있어도 다시 받지 않음 (껐다 켜기를 되풀이하지 않게) · 고친 다음 판은 받음", async () => {
  const dir = tmp(), rel = { cur: mk("2.32") }, net = fakeNet(rel);
  P.stage(dir, mk("2.32").info, mk("2.32").text);
  P.setUse(dir, "2.32", "2.31");
  P.markBad(dir, "2.32");
  const { u, ev, applied } = updater(dir, net, { current: "2.31" });
  await u.checkForUpdates();
  assert.deepStrictEqual(ev.at(-1), ["update-not-available", "2.32"]);
  assert.deepStrictEqual([P.readState(dir).use, P.readState(dir).bad], ["2.31", ["2.32"]], "앞 판 그대로 · 2.32 는 다시 쓰지 않음");
  rel.cur = mk("2.33");
  await u.checkForUpdates();
  assert.deepStrictEqual(ev.at(-1), ["update-downloaded", "2.33"]);
  u.quitAndInstall();
  assert.deepStrictEqual(applied, ["2.33"]);
});

test("쓰지 않는 옛 판 폴더는 지움 (지금 판 · 앞 판 · 다음 판만 남김)", async () => {
  const dir = tmp(), rel = { cur: mk("2.31") }, net = fakeNet(rel);
  for (const b of ["2.27", "2.28"]) P.stage(dir, mk(b).info, mk(b).text);
  fs.mkdirSync(path.join(dir, "2.29.tmp"));
  const { u } = updater(dir, net, { current: "2.28" });
  await u.checkForUpdates();
  assert.deepStrictEqual(fs.readdirSync(dir).sort(), ["2.28", "2.31", "state.json"]);
});

test("만들기(scripts/make-patch.js): 설치본과 같은 파일 — 동작 파일 src 전부 · 화면 desk.html · 설명서 사진 · 껍데기 이름", () => {
  const f = MP.collect();
  const names = Object.keys(f);
  for (const n of ["src/boot.js", "src/main.js", "src/patch.js", "src/preload.js", "src/updater.js", "src/icon.png", "desk.html"]) assert.ok(names.includes(n), n);
  assert.ok(names.some((n) => /^manual\/.+\.jpg$/.test(n)), "설명서 사진");
  assert.ok(names.every(P.safeRel), "모든 이름이 풀 수 있는 모양");
  const src = fs.readdirSync(path.join(__dirname, "..", "src")).filter((n) => !["build.json", "shell.json"].includes(n));
  assert.deepStrictEqual(names.filter((n) => n.startsWith("src/") && !/\/(build|shell)\.json$/.test(n)).map((n) => n.slice(4)).sort(), src.sort(), "src 폴더 그대로");
  const { info, text } = P.makePatch({ build: "2.31", tag: "v2.31", shell: SHELL, files: f });
  assert.ok(info.size < 4 * 1024 * 1024, `묶음 ${Math.round(info.size / 1024)}KB`);
  const dir = tmp();
  P.stage(dir, info, text);
  assert.strictEqual(fs.readFileSync(path.join(dir, "2.31", "desk.html"), "utf8"), fs.readFileSync(path.join(__dirname, "..", "..", "..", "prototype", "desk.html"), "utf8"));
  // 껍데기 이름 (Electron 이 깔린 곳 — GitHub 이 만들 때는 늘 있음)
  let hasElectron = true;
  try { require.resolve("electron/package.json", { paths: [path.join(__dirname, "..")] }); } catch (e) { hasElectron = false; }
  if (hasElectron) assert.match(MP.shellNow().shell, /^e\d+-b1-d[0-9a-f]{8}$/);
});
