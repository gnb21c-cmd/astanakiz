/* 방문 이벤트 참여자 기록: 앱 폴더 + 바탕화면 두 곳 (사장님 10/14 — 이벤트 동안 기록이 없어지면 안 됨)
   - 이용완료마다 두 곳에 한 줄씩 · 읽을 때 합치고 빠진 쪽을 채움 · 반만 써진 줄은 다른 쪽으로 되살림 · 바탕화면 정리본(엑셀) */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const L = require("../src/ledger-store");

const tmp = () => { const r = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-")); return { app: path.join(r, "appdata", "visit-ledger"), desk: path.join(r, "Desktop", L.DESK_FOLDER) }; };
const line = (no, at, n) => JSON.stringify({ at, day: at.slice(0, 10), no, k: "01012345678", name: "홍길동", phone: "01012345678", prev: n - 1, n, base: 7, st: "a" });
const nos = (text) => text.trim().split("\n").map((l) => JSON.parse(l).no);

test("두 곳에 같이 쓰고 합쳐 읽음 · 같은 예약은 한 번 · 시각 순", () => {
  const d = tmp(), F = L.files(d, "2026-11-01");
  assert.strictEqual(L.load(d, "2026-11-01").text, null, "처음엔 없음");
  assert.deepStrictEqual(L.add(d, "2026-11-01", line("N2", "2026-11-09 14:02", 9)), { app: true, desk: true });
  L.add(d, "2026-11-01", line("N1", "2026-11-01 13:55", 8));
  L.add(d, "2026-11-01", line("N1", "2026-11-01 13:55", 8)); // 두 번 와도
  assert.ok(fs.existsSync(F.app) && fs.existsSync(F.desk));
  assert.strictEqual(path.basename(F.desk), "이벤트기록_2026-11-01.jsonl");
  assert.match(fs.readFileSync(F.readme, "utf8"), /지우거나 옮기지 마세요/);
  const r = L.load(d, "2026-11-01");
  assert.deepStrictEqual(nos(r.text), ["N1", "N2"]);
  assert.strictEqual(r.count, 2);
});

test("한쪽이 없어지면 다른 쪽으로 채움 (바탕화면 폴더를 지움 · 앱을 다시 깔음)", () => {
  const d = tmp(), F = L.files(d, "2026-11-01");
  L.add(d, "2026-11-01", line("N1", "2026-11-01 13:55", 8));
  L.add(d, "2026-11-01", line("N2", "2026-11-09 14:02", 9));
  fs.rmSync(d.desk, { recursive: true });
  let r = L.load(d, "2026-11-01");
  assert.deepStrictEqual([nos(r.text), r.repaired], [["N1", "N2"], ["desk"]]);
  assert.deepStrictEqual(nos(fs.readFileSync(F.desk, "utf8")), ["N1", "N2"], "바탕화면 다시 채움");
  fs.rmSync(F.app);
  r = L.load(d, "2026-11-01");
  assert.deepStrictEqual([nos(r.text), r.repaired], [["N1", "N2"], ["app"]]);
  assert.deepStrictEqual(nos(fs.readFileSync(F.app, "utf8")), ["N1", "N2"], "앱 폴더 다시 채움");
  // 한쪽에만 있는 줄(그쪽만 저장됐던 경우)도 서로 채움
  fs.appendFileSync(F.desk, line("N3", "2026-11-15 10:10", 10) + "\n");
  r = L.load(d, "2026-11-01");
  assert.deepStrictEqual(nos(fs.readFileSync(F.app, "utf8")), ["N1", "N2", "N3"]);
  assert.deepStrictEqual(r.repaired, ["app"]);
  assert.deepStrictEqual(L.load(d, "2026-11-01").repaired, [], "다 맞으면 다시 쓰지 않음");
});

test("갑자기 꺼져 반만 써진 줄: 다른 쪽으로 되살리고 · 다음 줄은 새 줄에", () => {
  const d = tmp(), F = L.files(d, "2026-11-01");
  L.add(d, "2026-11-01", line("N1", "2026-11-01 13:55", 8));
  L.add(d, "2026-11-01", line("N2", "2026-11-09 14:02", 9));
  const full = fs.readFileSync(F.app, "utf8");
  fs.writeFileSync(F.app, full.slice(0, full.length - 20)); // N2 줄이 반만
  L.add(d, "2026-11-01", line("N3", "2026-11-15 10:10", 10));
  const r = L.load(d, "2026-11-01");
  assert.deepStrictEqual(nos(r.text), ["N1", "N2", "N3"], "N2 는 바탕화면에서 · N3 는 망가진 줄에 붙지 않음");
  assert.ok(r.repaired.includes("app"));
  assert.deepStrictEqual(nos(fs.readFileSync(F.app, "utf8")), ["N1", "N2", "N3"]);
});

test("바탕화면 정리본(엑셀): 한글이 깨지지 않게 BOM", () => {
  const d = tmp(), F = L.files(d, "2026-11-01");
  assert.strictEqual(L.csv(d, "2026-11-01", '"이름","전화번호"\r\n"홍길동","010-1234-5678"\r\n'), true);
  const b = fs.readFileSync(F.csv);
  assert.deepStrictEqual([...b.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.match(b.toString("utf8"), /홍길동/);
  assert.strictEqual(path.basename(F.csv), "이벤트참여자_2026-11-01.csv");
});
