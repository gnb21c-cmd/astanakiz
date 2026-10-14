/* 방문 이벤트 참여자 기록 저장 (사장님 10/14) — 이벤트 동안 기록이 없어져 손님과 다툼이 생기면 안 되니 두 곳에 같이
   - 앱 폴더:   %APPDATA%\아스타나키즈 입장 데스크\visit-ledger\기준일.jsonl
   - 바탕화면: 바탕화면\아스타나키즈-이벤트\이벤트기록_기준일.jsonl (+ 사람이 여는 이벤트참여자_기준일.csv · 읽어 주세요.txt)
   - 이용완료(네이버 예약 1건)마다 두 곳에 한 줄씩 덧붙임 (통째로 다시 쓰지 않음 → 월 3,000건이 넘어도 가벼움)
   - 읽을 때 두 곳을 예약번호(no)로 합침 → 한쪽에 빠진 줄이 있으면 그쪽 파일을 합친 내용으로 다시 써서 채움
     (바탕화면 폴더를 지웠거나, 앱을 지우고 다시 깔았거나, 갑자기 꺼져 한 줄이 반만 써졌어도 다른 쪽으로 되살림)
   - 지우는 기능은 없음 */
const fs = require("fs");
const path = require("path");

const DESK_FOLDER = "아스타나키즈-이벤트";
const clean = (from) => String(from || "").replace(/[^0-9-]/g, "") || "x";
/** dirs = { app: 앱 폴더의 visit-ledger, desk: 바탕화면\아스타나키즈-이벤트 } */
function files(dirs, from) {
  const d = clean(from);
  return { app: path.join(dirs.app, `${d}.jsonl`), desk: path.join(dirs.desk, `이벤트기록_${d}.jsonl`), csv: path.join(dirs.desk, `이벤트참여자_${d}.csv`), readme: path.join(dirs.desk, "읽어 주세요.txt") };
}
function readLines(f) {
  try {
    return fs.readFileSync(f, "utf8").split(/\r?\n/).filter((l) => l.trim());
  } catch (e) {
    return null; // 파일 없음
  }
}
const parse = (l) => { try { const r = JSON.parse(l); return r && r.no != null ? r : null; } catch (e) { return null; } };
function writeAll(f, text) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + ".tmp", text, "utf8");
  fs.renameSync(f + ".tmp", f);
}
const README = [
  "이 폴더는 통합 데스크가 방문 이벤트 참여자 기록을 저장하는 곳이에요. 지우거나 옮기지 마세요.",
  "",
  "- 이벤트기록_기준일.jsonl : 데스크가 읽고 쓰는 기록 (이용완료마다 한 줄 · 고치지 마세요)",
  "- 이벤트참여자_기준일.csv : 엑셀로 여는 정리본 (손님마다 한 줄 · 데스크가 자동으로 다시 씀)",
  "",
  "앱 폴더(%APPDATA%\\아스타나키즈 입장 데스크\\visit-ledger)에도 같은 기록이 있어서,",
  "한쪽이 없어져도 데스크를 켜면 다른 쪽으로 다시 채워요.",
  "손님 이름 · 전화번호가 들어 있으니 밖으로 보내지 마세요.",
  "",
].join("\r\n");

/** 두 곳을 합쳐 읽고, 빠진 쪽을 채움 → { text, count, repaired: ["app" | "desk"], from: { app, desk } } */
function load(dirs, from) {
  const F = files(dirs, from), a = readLines(F.app), b = readLines(F.desk);
  if (!a && !b) return { text: null, count: 0, repaired: [], from: { app: 0, desk: 0 } };
  const seen = new Set(), rows = [];
  for (const l of [...(a || []), ...(b || [])]) {
    const r = parse(l);
    if (!r || seen.has(String(r.no))) continue; // 반만 써진 줄 · 같은 예약은 건너뜀
    seen.add(String(r.no));
    rows.push({ l: l.trim(), at: String(r.at || "") });
  }
  rows.sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0)); // 시각 순 (같으면 원래 순서)
  const text = rows.map((x) => x.l + "\n").join("");
  const has = (arr) => new Set((arr || []).map(parse).filter(Boolean).map((r) => String(r.no)));
  const ha = has(a), hb = has(b), repaired = [];
  const whole = (arr) => (arr || []).every((l) => parse(l)); // 반만 써진 줄이 있으면 다시 씀
  if (rows.length && (rows.some((x) => !ha.has(String(parse(x.l).no))) || !whole(a))) { try { writeAll(F.app, text); repaired.push("app"); } catch (e) { /* 다음에 다시 */ } }
  if (rows.length && (rows.some((x) => !hb.has(String(parse(x.l).no))) || !whole(b))) { try { writeAll(F.desk, text); repaired.push("desk"); } catch (e) { /* 다음에 다시 */ } }
  return { text, count: rows.length, repaired, from: { app: ha.size, desk: hb.size } };
}

/** 한 줄을 두 곳에 덧붙임 → { app: true/false, desk: true/false } */
function add(dirs, from, line) {
  const F = files(dirs, from), l = String(line).replace(/[\r\n]+/g, " ") + "\n", ok = {};
  for (const [k, f] of [["app", F.app], ["desk", F.desk]]) {
    try {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      // 앞 줄이 반만 써진 채(줄바꿈 없이) 끝났으면 줄을 바꾸고 씀
      let pre = "";
      try { const st = fs.statSync(f); if (st.size) { const fd = fs.openSync(f, "r"), buf = Buffer.alloc(1); fs.readSync(fd, buf, 0, 1, st.size - 1); fs.closeSync(fd); if (buf[0] !== 10) pre = "\n"; } } catch (e) { /* 새 파일 */ }
      fs.appendFileSync(f, pre + l, "utf8");
      ok[k] = true;
    } catch (e) {
      ok[k] = false;
    }
  }
  try { if (ok.desk && !fs.existsSync(F.readme)) fs.writeFileSync(F.readme, "﻿" + README, "utf8"); } catch (e) { /* 안내 글은 없어도 됨 */ }
  return ok;
}

/** 바탕화면 정리본(엑셀) — 손님마다 한 줄 (데스크가 만든 글을 그대로 씀, 엑셀이 한글을 읽게 BOM) */
function csv(dirs, from, text) {
  const F = files(dirs, from);
  try { writeAll(F.csv, "﻿" + String(text)); return true; } catch (e) { return false; }
}

module.exports = { DESK_FOLDER, files, load, add, csv, README };
