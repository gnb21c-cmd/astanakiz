/* 네이버 재고 자동 오픈 (사장님 10/20) — 가짜 예약상품 화면(mock/naver-stock.html, 사장님 사진 본뜸)에서
   예약상품 → 상품 사진 → [일정/가격] → [재고수정] → 날짜 → [다음] → [모든 회차] → 10 → [저장] → 달력 0/10개
   - 아직 안 연 날(모든 회차 0/0개)만 · 이미 연 날은 건드리지 않음 · 두 상품 같은 날짜
   - 어느 날을 열지(stockPlan): 오늘 + 30일 · 꺼져 있어 못 연 날은 마지막으로 연 날 뒤부터 이어서 · 앞쪽에 비워 둔 날(사람이 닫음)은 안 건드림 */
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { NaverStock, stockPlan } = require("../src/naver-stock");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  ({ chromium } = require("/opt/node-tools/node_modules/playwright"));
}
const MOCK = "file://" + path.join(__dirname, "..", "mock", "naver-stock.html");
const CAL = "file://" + path.join(__dirname, "..", "mock", "naver.html") + "?view=calendar";
const P0 = "평일 무제한 / 휴일 1시간 50분 입장권", P1 = "야간자유 입장권";

async function setup(browser, q = "") {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(MOCK + "?view=items");
  await page.evaluate(() => localStorage.clear());
  await page.goto(MOCK + "?view=items&today=2026-10-20" + q);
  const st = new NaverStock((code) => page.evaluate(code), { urls: { calendar: CAL } });
  const saves = () => page.evaluate(() => JSON.parse(localStorage.getItem("mockStockSaves") || "[]"));
  return { page, st, saves };
}

test("어느 날을 열지: 오늘 + 30일 · 꺼져서 못 연 날 이어서 · 앞쪽에 비워 둔 날 · 건너뛸 날 · 회차 없는 날", () => {
  const set = (cap) => [{ t: "10:00", n: 0, cap }, { t: "10:30", n: 0, cap }];
  const days = {};
  for (let i = 1; i <= 30; i++) { const d = new Date(Date.UTC(2026, 9, 20 + i)).toISOString().slice(0, 10); days[d] = set(i <= 27 ? 10 : 0); }
  days["2026-11-05"] = set(0); // 사람이 닫아 둔 날 (마지막으로 연 날 앞)
  let p = stockPlan({ today: "2026-10-20", days });
  assert.strictEqual(p.target, "2026-11-19");
  assert.strictEqual(p.last, "2026-11-16");
  assert.deepStrictEqual(p.plan, ["2026-11-17", "2026-11-18", "2026-11-19"], "꺼져서 못 연 날까지 이어서");
  p = stockPlan({ today: "2026-10-20", days, skip: ["2026-11-18"] });
  assert.deepStrictEqual([p.plan, p.skipped], [["2026-11-17", "2026-11-19"], ["2026-11-18"]]);
  // 하나도 연 날이 없으면 오늘 + 30일 하루만
  const none = Object.fromEntries(Object.keys(days).map((d) => [d, set(0)]));
  assert.deepStrictEqual(stockPlan({ today: "2026-10-20", days: none }).plan, ["2026-11-19"]);
  // 다 열려 있으면 할 것 없음 · 회차가 없는 날은 따로
  const all = Object.fromEntries(Object.keys(days).map((d) => [d, set(10)]));
  delete all["2026-11-19"];
  all["2026-11-19"] = [];
  const q = stockPlan({ today: "2026-10-20", days: all });
  assert.deepStrictEqual([q.plan, q.noSlots], [[], ["2026-11-19"]]);
});

test("하루 네 번 기회: 10:30 → 실패하면 12:00 → 16:00 → 20:20 · 늦게 켜면 지난 것 한 번 · 다 써 보면 그날은 끝", () => {
  const { stockDue } = require("../src/naver-stock");
  const at = (h, m) => h * 60 + m;
  assert.deepStrictEqual(stockDue({ minutes: at(10, 29) }), [], "10:30 전엔 안 함");
  assert.deepStrictEqual(stockDue({ minutes: at(10, 30) }), [0]);
  assert.deepStrictEqual(stockDue({ minutes: at(11, 59), tried: [0] }), [], "실패 뒤 12:00 까지 기다림");
  assert.deepStrictEqual(stockDue({ minutes: at(12, 0), tried: [0] }), [1]);
  assert.deepStrictEqual(stockDue({ minutes: at(16, 0), tried: [0, 1] }), [2]);
  assert.deepStrictEqual(stockDue({ minutes: at(20, 20), tried: [0, 1, 2] }), [3]);
  assert.deepStrictEqual(stockDue({ minutes: at(23, 0), tried: [0, 1, 2, 3] }), [], "네 번 다 써 보면 그날은 끝");
  assert.deepStrictEqual(stockDue({ minutes: at(13, 10) }), [0, 1], "13:10 에 켬 → 지난 10:30 · 12:00 을 한 번에 (한 번만 함) · 다음은 16:00");
  assert.deepStrictEqual(stockDue({ minutes: at(15, 0), tried: [0, 1] }), []);
});

test("재고 열기: 두 상품 같은 날짜(오늘 + 30일 = 11/19) · 0/0 → 0/10 · 이미 연 날은 그대로 · 저장한 것은 그 날짜 하나", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const { page, st, saves } = await setup(browser);
    // 열기 전: 11/19 는 모든 회차 0/0
    const before = await st.scan(P0, "2026-11-17", "2026-11-19");
    assert.ok(before.ok, before.why);
    assert.ok(before.days["2026-11-18"].every((c) => c.cap === 10) && before.days["2026-11-19"].every((c) => c.cap === 0));
    assert.strictEqual(before.days["2026-11-19"].length, 16, "회차 16개 (10:00 ~ 17:30)");
    for (const p of [P0, P1]) {
      const r = await st.openDay({ product: p, day: "2026-11-19", qty: 10 });
      assert.ok(r.ok && r.done, `${p}: ${r.why}`);
    }
    assert.deepStrictEqual(await saves(), [{ id: 0, from: "2026-11-19", to: "2026-11-19", n: 10 }, { id: 1, from: "2026-11-19", to: "2026-11-19", n: 10 }]);
    const after = await st.scan(P1, "2026-11-19", "2026-11-19");
    assert.deepStrictEqual(after.days["2026-11-19"].map((c) => [c.t, c.cap]), [["18:00", 10], ["18:30", 10], ["19:00", 10], ["19:30", 10]]);
    // 이미 연 날(11/18)은 누르지 않음
    const r = await st.openDay({ product: P0, day: "2026-11-18", qty: 10 });
    assert.ok(r.ok && r.already);
    assert.strictEqual((await saves()).length, 2);
    assert.ok(/view=item/.test(page.url()));
  } finally {
    await browser.close();
  }
});

test("재고 열기: 예약현황 화면에서 시작 · 달을 넘겨야 하는 날(12/1) · 네이버가 느려도 · 로그인 안 됨이면 알려 줌", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const { page, st, saves } = await setup(browser, "&slow=1");
    await page.goto(CAL);
    const r = await st.openDay({ product: P0, day: "2026-12-01", qty: 10 });
    assert.ok(r.ok && r.done, r.why);
    assert.deepStrictEqual(await saves(), [{ id: 0, from: "2026-12-01", to: "2026-12-01", n: 10 }]);
    await page.goto(MOCK + "?login=need");
    const l = await st.openDay({ product: P0, day: "2026-11-19", qty: 10 });
    assert.match(l.why, /로그인/);
  } finally {
    await browser.close();
  }
});
