/* 재방문 간격 (사장님 10/19) — 이 PC 에만 두는 방문 기록(날마다 네이버 이용완료한 손님) + 보고 앱으로 보낼 일수 모음
   - 손님은 전화번호(없으면 이름)를 비밀값과 섞은 해시로만 (이름 · 전화번호는 파일에 안 남김)
   - 방문 = 그날 네이버 이용완료가 한 건이라도 있음 (같은 날 여러 건 = 한 번)
   - 재방문 간격 = 같은 손님의 바로 앞 방문과 다음 방문 사이 일수
   - 과거(4/1 ~ 10/25) · 이벤트(10/26 ~) 는 두 방문이 모두 그 기간 안일 때만 · 많은 일수 순 7개 (같으면 짧은 일수 먼저)
   - 지난 30일: 30일 안에 온 손님마다 '마지막 방문 − 바로 전 방문' → 가장 많은 일수 · 평균 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const H = require("../src/visit-history");

test("해시: 같은 비밀값이면 늘 같고 · 비밀값이 다르면 다름 · 16자 · 원래 번호가 안 보임", () => {
  const a = H.hashKey("s1", "01012345678"), b = H.hashKey("s1", "01012345678"), c = H.hashKey("s2", "01012345678");
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c);
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.ok(!a.includes("5678"));
});

test("하루 기록: 합쳐 넣음(같은 손님 한 번) · 네이버에서 읽은 날은 'naver' 로 남음 · 저장 · 다시 읽기 · 깨진 파일은 옆에 두고 새로", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vh-"));
  let h = H.load(dir);
  assert.deepStrictEqual(h, { v: 1, days: {} });
  H.setDay(h, "2026-10-26", ["a", "b", "a"], "desk");
  H.setDay(h, "2026-10-26", ["c"], "desk");
  assert.deepStrictEqual(h.days["2026-10-26"], { src: "desk", k: ["a", "b", "c"] });
  H.setDay(h, "2026-10-26", ["b", "d"], "naver");
  assert.deepStrictEqual(h.days["2026-10-26"], { src: "naver", k: ["a", "b", "c", "d"] }, "네이버로 다시 읽어도 데스크 기록은 그대로 + 네이버에만 있던 손님");
  H.setDay(h, "2026-10-26", ["e"], "desk");
  assert.strictEqual(h.days["2026-10-26"].src, "naver", "한 번 네이버로 읽은 날은 그대로");
  H.save(dir, h);
  assert.deepStrictEqual(H.load(dir), h);
  assert.ok(!fs.readFileSync(path.join(dir, H.FILE), "utf8").includes("010"), "파일에 전화번호 없음");
  fs.writeFileSync(path.join(dir, H.FILE), "{깨짐");
  assert.deepStrictEqual(H.load(dir), { v: 1, days: {} });
  assert.ok(fs.readdirSync(dir).some((f) => /^visit-history\.broken-/.test(f)), "깨진 파일은 지우지 않고 옆에");
});

/** 시험 기록: 손님 → 방문일들 */
function hist(people) {
  const h = { v: 1, days: {} };
  for (const [k, days] of Object.entries(people)) for (const d of days) H.setDay(h, d, [k], "naver");
  return h;
}

test("일수 모음: 과거 · 이벤트는 두 방문이 그 기간 안일 때만 · 경계를 넘는 재방문은 어디에도 안 셈 · 지난 30일 요약", () => {
  const h = hist({
    A: ["2026-04-01", "2026-04-08", "2026-04-15", "2026-10-26", "2026-11-02"], // 과거 7 · 7 / (4/15 → 10/26 은 경계 넘음) / 이벤트 7
    B: ["2026-05-01", "2026-05-15", "2026-10-30"], // 과거 14 / 5/15 → 10/30 경계 넘음
    C: ["2026-10-27", "2026-10-28"], // 이벤트 1
    D: ["2026-11-05"], // 한 번뿐 → 재방문 없음
    E: ["2026-10-20", "2026-10-27"], // 10/20(과거) → 10/27(이벤트) 경계 넘음
  });
  H.setDay(h, "2026-10-28", ["C"], "desk"); // 같은 날 또 = 한 번
  const s = H.stats(h, { today: "2026-11-10", past: { from: "2026-04-01", to: "2026-10-25" }, event: { from: "2026-10-26", to: "2027-02-28" } });
  assert.deepStrictEqual(s.history, { from: "2026-04-01", to: "2026-11-05", days: 12 }, "C · E 가 같은 날(10/27) → 날 수 12");
  assert.deepStrictEqual(s.past, { from: "2026-04-01", to: "2026-10-25", revisits: 3, people: 2, top: [{ days: 7, count: 2 }, { days: 14, count: 1 }] });
  assert.deepStrictEqual(s.event, { from: "2026-10-26", to: "2026-11-10", end: "2027-02-28", revisits: 2, people: 2, top: [{ days: 1, count: 1 }, { days: 7, count: 1 }] }, "아직 진행 중이면 오늘까지 · 같은 수면 짧은 일수 먼저");
  // 지난 30일(10/12 ~ 11/10): A 11/2 ← 10/26 = 7 · B 10/30 ← 5/15 = 168 · C 10/28 ← 10/27 = 1 · D 11/5 (전 방문 없음) · E 10/27 ← 10/20 = 7
  assert.deepStrictEqual(s.recent, { from: "2026-10-12", to: "2026-11-10", people: 5, revisits: 4, mode: { days: 7, count: 2 }, avg: 45.8, median: 7 });
});

test("7개까지 · 많은 순 · 같으면 짧은 일수 먼저 · 이벤트 전이면 빈 목록 · 이벤트가 끝나면 끝난 날까지만", () => {
  const people = {};
  // 과거에 간격 1 ~ 9일을 i 번씩 (9일 9번 … 1일 1번) → 9 · 8 · 7 · 6 · 5 · 4 · 3 일 순
  for (let g = 1; g <= 9; g++) for (let i = 0; i < g; i++) people[`p${g}-${i}`] = ["2026-06-01", H.shiftDay("2026-06-01", g)];
  people.Q = ["2027-02-20", "2027-02-27", "2027-03-02"]; // 이벤트 안 7 · 끝난 뒤 3/2 는 안 셈
  const h = hist(people);
  const s = H.stats(h, { today: "2027-03-10", past: { from: "2026-04-01", to: "2026-10-25" }, event: { from: "2026-10-26", to: "2027-02-28" } });
  assert.deepStrictEqual(s.past.top.map((x) => [x.days, x.count]), [[9, 9], [8, 8], [7, 7], [6, 6], [5, 5], [4, 4], [3, 3]]);
  assert.strictEqual(s.past.revisits, 45);
  assert.deepStrictEqual([s.event.to, s.event.revisits, s.event.top], ["2027-02-28", 1, [{ days: 7, count: 1 }]], "끝난 뒤엔 끝난 날까지");
  const before = H.stats(h, { today: "2026-10-19", past: { from: "2026-04-01", to: "2026-10-25" }, event: { from: "2026-10-26", to: "2027-02-28" } });
  assert.deepStrictEqual([before.event.revisits, before.event.top, before.event.started], [0, [], false], "이벤트 시작 전");
  assert.strictEqual(before.past.to, "2026-10-19", "과거도 오늘까지만 (아직 10/25 전)");
  const none = H.stats({ v: 1, days: {} }, { today: "2026-10-19", past: { from: "2026-04-01", to: "2026-10-25" }, event: null });
  assert.deepStrictEqual([none.history, none.recent.people, none.recent.mode, none.recent.avg, none.event], [{ from: "", to: "", days: 0 }, 0, null, null, null]);
});
