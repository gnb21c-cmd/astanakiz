/* 재방문 간격 (사장님 10/19) — 이 PC 에만 두는 방문 기록(날마다 네이버 이용완료한 손님) + 보고 앱으로 보낼 일수 모음
   - 손님은 전화번호(없으면 이름)를 비밀값과 섞은 해시로만 (이름 · 전화번호는 파일에 안 남김)
   - 방문 = 그날 네이버 이용완료가 한 건이라도 있음 (같은 날 여러 건 = 한 번)
   - 재방문 간격 = 같은 손님의 바로 앞 방문과 다음 방문 사이 일수
   - 과거 = 4/1 이후 처음 온 날(10/25까지) → 다음 방문 · 이벤트 = 10/26 뒤 처음 온 날 → 다음 방문 · 손님마다 기간별로 한 번 · 많은 순 10개 (사장님 10/31)
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

test("일수 모음 (사장님 10/31): 손님마다 기간별로 한 번 — 과거 = 4/1 이후 처음 온 날(10/25까지) → 다음 방문 · 이벤트 = 10/26 뒤 처음 온 날 → 다음 방문 · 지난 30일 요약", () => {
  const h = hist({
    A: ["2026-04-01", "2026-04-08", "2026-04-15", "2026-10-26", "2026-11-02"], // 과거 4/1 → 4/8 = 7 (뒤 간격은 안 셈) · 이벤트 10/26 → 11/2 = 7
    B: ["2026-05-01", "2026-05-15", "2026-10-30"], // 과거 14 · 이벤트 10/30 → 다음 없음
    C: ["2026-10-27", "2026-10-28"], // 과거 아님(처음 온 날이 10/26 뒤) · 이벤트 1
    D: ["2026-11-05"], // 한 번뿐
    E: ["2026-10-20", "2026-10-27"], // 과거 10/20 → 10/27 = 7 (다음 방문이 10/26 뒤여도 과거) · 이벤트 10/27 → 다음 없음
  });
  H.setDay(h, "2026-10-28", ["C"], "desk"); // 같은 날 또 = 한 번
  const s = H.stats(h, { today: "2026-11-10", past: { from: "2026-04-01", to: "2026-10-25" }, event: { from: "2026-10-26", to: "2027-02-28" } });
  assert.deepStrictEqual(s.history, { from: "2026-04-01", to: "2026-11-05", days: 12 }, "C · E 가 같은 날(10/27) → 날 수 12");
  assert.deepStrictEqual(s.past, { from: "2026-04-01", to: "2026-10-25", revisits: 3, people: 3, top: [{ days: 7, count: 2 }, { days: 14, count: 1 }] });
  assert.deepStrictEqual(s.event, { from: "2026-10-26", to: "2026-11-10", end: "2027-02-28", revisits: 2, people: 2, top: [{ days: 1, count: 1 }, { days: 7, count: 1 }] }, "아직 진행 중이면 오늘까지 · 같은 수면 짧은 일수 먼저");
  // 지난 30일(10/12 ~ 11/10): A 11/2 ← 10/26 = 7 · B 10/30 ← 5/15 = 168 · C 10/28 ← 10/27 = 1 · D 11/5 (전 방문 없음) · E 10/27 ← 10/20 = 7
  assert.deepStrictEqual(s.recent, { from: "2026-10-12", to: "2026-11-10", people: 5, revisits: 4, mode: { days: 7, count: 2 }, avg: 45.8, median: 7 });
  // 사장님 예: 갑 5/3 · 5/20 · 6/10 · 10/28 · 11/2 → 과거 17일 · 이벤트 5일 / 을 10/20 · 11/1 → 과거 12일 · 이벤트는 다음 방문이 오면
  const ex = H.stats(hist({ 갑: ["2026-05-03", "2026-05-20", "2026-06-10", "2026-10-28", "2026-11-02"], 을: ["2026-10-20", "2026-11-01"] }), { today: "2026-11-03", past: { from: "2026-04-01", to: "2026-10-25" }, event: { from: "2026-10-26", to: "" } });
  assert.deepStrictEqual(ex.past.top, [{ days: 12, count: 1 }, { days: 17, count: 1 }]);
  assert.deepStrictEqual([ex.event.people, ex.event.top], [1, [{ days: 5, count: 1 }]]);
});

test("10개까지 · 많은 순 · 같으면 짧은 일수 먼저 · 이벤트 전이면 빈 목록 · 이벤트가 끝나면 끝난 날까지", () => {
  const people = {};
  // 과거에 간격 1 ~ 12일을 g 명씩 (12일 12명 … 1일 1명) → 12 · 11 · … · 3 일 순
  for (let g = 1; g <= 12; g++) for (let i = 0; i < g; i++) people[`p${g}-${i}`] = ["2026-06-01", H.shiftDay("2026-06-01", g)];
  people.Q = ["2027-02-20", "2027-02-27", "2027-03-02"]; // 이벤트 2/20 → 2/27 = 7 (그다음은 안 셈)
  const h = hist(people);
  const s = H.stats(h, { today: "2027-03-10", past: { from: "2026-04-01", to: "2026-10-25" }, event: { from: "2026-10-26", to: "2027-02-28" } });
  assert.deepStrictEqual(s.past.top.map((x) => [x.days, x.count]), [[12, 12], [11, 11], [10, 10], [9, 9], [8, 8], [7, 7], [6, 6], [5, 5], [4, 4], [3, 3]]);
  assert.deepStrictEqual([s.past.revisits, s.past.people], [78, 78]);
  assert.deepStrictEqual([s.event.to, s.event.revisits, s.event.top], ["2027-02-28", 1, [{ days: 7, count: 1 }]], "끝난 뒤엔 끝난 날까지");
  const before = H.stats(h, { today: "2026-10-19", past: { from: "2026-04-01", to: "2026-10-25" }, event: { from: "2026-10-26", to: "2027-02-28" } });
  assert.deepStrictEqual([before.event.revisits, before.event.top, before.event.started], [0, [], false], "이벤트 시작 전");
  assert.strictEqual(before.past.to, "2026-10-19", "과거도 오늘까지만 (아직 10/25 전)");
  const none = H.stats({ v: 1, days: {} }, { today: "2026-10-19", past: { from: "2026-04-01", to: "2026-10-25" }, event: null });
  assert.deepStrictEqual([none.history, none.recent.people, none.recent.mode, none.recent.avg, none.event], [{ from: "", to: "", days: 0 }, 0, null, null, null]);
});

/* 신규 · 기존 (사장님 10/31): 4/1 이후 처음 온 날의 네이버 '완료 n'
   네이버 카드의 '완료 n'은 읽은 때까지 센 수 → 처음 온 날의 n = 읽은 n − (처음 온 날 뒤 ~ 읽은 날까지 이용완료 건수) · 그 앞(4/1 전 교환권 무료) = n − 그날 건수
   0 이면 신규 · 1 이상이면 기존 · 모르거나 앞뒤가 안 맞으면 전체에만 */
test("신규 · 기존 나눔: 하루 기록에 손님마다 [완료 n, 그날 건수, 읽은 날] · 처음 온 날의 '완료 n' 으로 가름 · 모르면 전체에만", () => {
  const h = { v: 1, days: {} };
  const put = (k, day, src, c) => H.setDay(h, day, [k], src, c ? { [k]: c } : null);
  put("N1", "2026-05-03", "naver", [2, 1, "2026-10-31"]); put("N1", "2026-05-20", "naver", [2, 1, "2026-10-31"]); // 신규: 2 − 1(5/20) = 1 → 앞 0
  put("O1", "2026-06-01", "naver", [5, 1, "2026-10-31"]); put("O1", "2026-06-08", "naver", [5, 1, "2026-10-31"]); // 기존: 5 − 1 = 4 → 앞 3
  put("N2", "2026-08-01", "naver", [3, 2, "2026-10-31"]); put("N2", "2026-08-10", "naver", [3, 1, "2026-10-31"]); // 첫날 2건: 3 − 1 = 2 → 앞 0 → 신규
  put("U1", "2026-07-01", "naver"); put("U1", "2026-07-03", "naver"); // 완료 n 모름 → 전체에만
  put("X", "2026-09-01", "naver", [1, 1, "2026-10-31"]); put("X", "2026-09-05", "naver", [1, 1, "2026-10-31"]); // 앞뒤가 안 맞음(1 − 1 = 0 → 앞 −1) → 전체에만
  put("D1", "2026-10-27", "desk", [3, 1, "2026-10-27"]); put("D1", "2026-10-29", "desk", [4, 1, "2026-10-29"]); // 데스크 입장(그날 읽음): 4 − 1 = 3 → 앞 2 → 기존
  const s = H.stats(h, { today: "2026-10-31", past: { from: "2026-04-01", to: "2026-10-25" }, event: { from: "2026-10-26", to: "" } });
  assert.deepStrictEqual([s.past.people, s.past.top], [5, [{ days: 2, count: 1 }, { days: 4, count: 1 }, { days: 7, count: 1 }, { days: 9, count: 1 }, { days: 17, count: 1 }]]);
  assert.deepStrictEqual(s.past.groups, {
    new: { revisits: 2, people: 2, top: [{ days: 9, count: 1 }, { days: 17, count: 1 }] },
    old: { revisits: 1, people: 1, top: [{ days: 7, count: 1 }] },
  });
  assert.deepStrictEqual(s.event.groups, { old: { revisits: 1, people: 1, top: [{ days: 2, count: 1 }] } }, "한쪽만 있으면 그쪽만");
  // 완료 n 이 하나도 없으면 groups 없음 (예전 기록)
  assert.strictEqual(H.stats(hist({ A: ["2026-05-01", "2026-05-08"] }), { today: "2026-10-31", past: { from: "2026-04-01", to: "2026-10-25" }, event: null }).past.groups, undefined);
});

test("하루 기록의 완료 n: 네이버로 읽으면 바꿔 넣음 · 데스크는 비었거나 데스크가 그날 넣은 것만 · 저장 · 다시 읽기 · 지난 기록 읽을 날 차례", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vh-"));
  const h = H.load(dir);
  assert.strictEqual(H.setDay(h, "2026-10-27", ["a", "b"], "desk", { a: [3, 1, "2026-10-27"] }), true);
  assert.strictEqual(H.setDay(h, "2026-10-27", ["a"], "desk", { a: [4, 2, "2026-10-27"] }), true, "그날 데스크가 넣은 것은 새로");
  H.setDay(h, "2026-10-27", ["a", "b"], "naver", { a: [6, 2, "2026-10-31"], b: [1, 1, "2026-10-31"] });
  assert.deepStrictEqual(h.days["2026-10-27"], { src: "naver", k: ["a", "b"], c: { a: [6, 2, "2026-10-31"], b: [1, 1, "2026-10-31"] } });
  assert.strictEqual(H.setDay(h, "2026-10-27", ["a"], "desk", { a: [9, 1, "2026-11-02"] }), false, "네이버로 읽은 값은 데스크가 안 덮음");
  H.save(dir, h);
  assert.deepStrictEqual(H.load(dir), h);
  // 지난 기록 읽을 날: 아직 네이버로 안 읽은 날(최근 → 옛날) 먼저, 그다음 네이버로 읽었지만 완료 n 이 없는 날(예전 판)
  const g = { v: 1, days: {} };
  H.setDay(g, "2026-10-28", ["x"], "naver"); // 완료 n 없음 (예전 판에서 읽음)
  H.setDay(g, "2026-10-27", ["x"], "naver", { x: [2, 1, "2026-10-31"] }); // 다 읽음
  H.setDay(g, "2026-10-26", ["x"], "desk", { x: [1, 1, "2026-10-26"] }); // 데스크만
  assert.deepStrictEqual(H.backfillDays(g, "2026-10-25", "2026-10-29"), ["2026-10-29", "2026-10-26", "2026-10-25", "2026-10-28"]);
});
