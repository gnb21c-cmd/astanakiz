/* 네이버 재고 자동 오픈 (사장님 10/20) — 가짜 예약상품 화면(mock/naver-stock.html, 사장님 사진 본뜸)에서
   예약상품 → 상품 사진 → [일정/가격] → [재고수정] → 날짜 → [다음] → [모든 회차] → 10 → [저장] → 달력 0/10개
   - 아직 안 연 날(모든 회차 0/0개)만 · 이미 연 날은 건드리지 않음 · 두 상품 같은 날짜
   - 어느 날을 열지(stockPlan): 오늘 + 30일 · 꺼져 있어 못 연 날은 마지막으로 연 날 뒤부터 이어서 · 앞쪽에 비워 둔 날(사람이 닫음)은 안 건드림
   - 1.53 (현장 10/20 20:24): 누르지 않고 주소로 — 예약상품 목록 · 상품 일정/가격(번호는 목록에서 이름으로 찾아 남김) · 바깥 링크 · 새 창 링크는 안 누름 */
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

// 가짜 화면 주소 모양 (실제: …/bizes/{업체}/biz-items · …/biz-items/{상품}/schedules)
const URLS = { calendar: CAL, items: MOCK + "?view=items", schedule: MOCK + "?view=item&id={id}&tab=schedules" };
const PAT = { list: "[?&]view=items(?:&|$)", id: "[?&]view=item&id=(\\d+)" };
const mkStock = (page, o = {}) => {
  const learned = {};
  const st = new NaverStock((code) => page.evaluate(code), Object.assign({ urls: URLS, pat: PAT, onLearn: (n, id) => { learned[n] = id; } }, o));
  return { st, learned };
};
async function setup(browser, q = "", o = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(MOCK + "?view=items");
  await page.evaluate(() => localStorage.clear());
  await page.goto(MOCK + "?view=items&today=2026-10-20" + q);
  const { st, learned } = mkStock(page, o);
  const saves = () => page.evaluate(() => JSON.parse(localStorage.getItem("mockStockSaves") || "[]"));
  return { page, st, saves, learned };
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
  assert.strictEqual(q.unread, true, "오늘 + 30일 회차를 못 읽으면 '할 것 없음'이 아니라 못 읽음 (현장 10/20 20:55)");
  // 오늘 + 30일이 아예 안 읽힘 (달력 모양이 다름) → 못 읽음 · 읽혔으면 무엇을 봤는지
  const miss = Object.fromEntries(Object.keys(days).filter((d) => d !== "2026-11-19").map((d) => [d, set(10)]));
  assert.deepStrictEqual((({ plan, unread }) => ({ plan, unread }))(stockPlan({ today: "2026-10-20", days: miss })), { plan: [], unread: true });
  assert.deepStrictEqual((({ unread, seen }) => ({ unread, seen }))(stockPlan({ today: "2026-10-20", days: Object.assign({}, miss, { "2026-11-19": set(10) }) })), { unread: false, seen: "2회차 재고 10" });
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
  // 스위치를 켤 때는 지난 때를 써 본 것으로 남김 (앱 본체 stockArm) → 18:40 에 켜면 바로 안 하고 20:20 에 처음
  const armed = stockDue({ minutes: at(18, 40) });
  assert.deepStrictEqual(armed, [0, 1, 2]);
  assert.deepStrictEqual(stockDue({ minutes: at(20, 19), tried: armed }), [], "20:20 전엔 안 함");
  assert.deepStrictEqual(stockDue({ minutes: at(20, 20), tried: armed }), [3], "20:20 에 처음");
});

test("재고 열기: 두 상품 같은 날짜(오늘 + 30일 = 11/19) · 0/0 → 0/10 · 이미 연 날은 그대로 · 저장한 것은 그 날짜 하나", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const { page, st, saves, learned } = await setup(browser);
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
    assert.deepStrictEqual(learned, { [P0]: "0", [P1]: "1" }, "상품 번호: 카드 링크(0) · 링크 없는 카드는 이름을 눌러 간 주소(1)");
    const after = await st.scan(P1, "2026-11-19", "2026-11-19");
    assert.deepStrictEqual(after.days["2026-11-19"].map((c) => [c.t, c.cap]), [["18:00", 10], ["18:30", 10], ["19:00", 10], ["19:30", 10]]);
    // 이미 연 날(11/18)은 누르지 않음
    const r = await st.openDay({ product: P0, day: "2026-11-18", qty: 10 });
    assert.ok(r.ok && r.already);
    assert.strictEqual((await saves()).length, 2);
    assert.ok(/view=item&id=0&tab=schedules/.test(page.url()), "아는 번호는 일정/가격 주소로 바로 " + page.url());
    assert.strictEqual(browser.contexts()[0].pages().length, 1, "새 창 없음");
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

test("현장 10/20 (1.52): 스마트플레이스 첫 화면 · 가게 사진 링크 · 리뷰 작성자 새 창 링크 — 안 누르고 주소로 예약상품 · 상품 · 번호가 틀리면 다시 찾음", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const { page, saves } = await setup(browser);
    const ctx = page.context();
    // 1.52 가 간 곳: 스마트플레이스 첫 화면 (리뷰에 '야간자유 입장권' · 작성자 사진 = 새 창 링크)
    await page.goto(MOCK + "?view=home");
    const { st, learned } = mkStock(page);
    assert.deepStrictEqual(await st.call(`window.__naverStock.openItem(${JSON.stringify(P1)})`), { ok: false, why: "예약상품 목록 화면이 아님" }, "목록이 아니면 아무것도 안 누름");
    assert.strictEqual((await st.read(P1)).card, false);
    const r = await st.openDay({ product: P1, day: "2026-11-19", qty: 10 });
    assert.ok(r.ok && r.done, r.why);
    assert.deepStrictEqual(await saves(), [{ id: 1, from: "2026-11-19", to: "2026-11-19", n: 10 }]);
    assert.deepStrictEqual(learned, { [P1]: "1" });
    assert.strictEqual(ctx.pages().length, 1, "새 창(MY플레이스) 없음");
    // 바깥 링크 · 새 창 링크는 눌러도 안 눌림 (가게 사진 → 스마트플레이스 · 리뷰 작성자)
    await page.goto(MOCK + "?view=items");
    const out = await st.call(`window.__naverStock.click("아스타나키즈")`);
    assert.ok(!out.ok && /밖/.test(out.why), JSON.stringify(out));
    assert.ok(/view=items/.test(page.url()), "그대로 예약상품 목록");
    await page.goto(MOCK + "?view=home");
    assert.ok(!(await st.call(`window.__naverStock.click("리뷰어A")`)).ok || ctx.pages().length === 1);
    assert.strictEqual(ctx.pages().length, 1);
    // 남겨 둔 번호가 틀리면(상품이 바뀜) → 목록에서 다시 찾아 고침
    const w = mkStock(page, { ids: { [P0]: "1" } });
    const r2 = await w.st.openDay({ product: P0, day: "2026-11-19", qty: 10 });
    assert.ok(r2.ok && r2.done, r2.why);
    assert.deepStrictEqual((await saves()).slice(-1), [{ id: 0, from: "2026-11-19", to: "2026-11-19", n: 10 }], "다른 상품(1)을 바꾸지 않음");
    assert.deepStrictEqual(w.learned, { [P0]: "0" });
  } finally {
    await browser.close();
  }
});

test("재고 수 칸: 커서를 놓고 키보드로 쳐야 [저장]이 켜지는 칸 (사장님 10/20 사진) — 키보드로 10 · 키보드가 없으면 못 넣었다고 알리고 저장 안 함", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const { page, saves } = await setup(browser, "&strict=1");
    const { st: noKeys } = mkStock(page);
    const bad = await noKeys.openDay({ product: P1, day: "2026-11-19", qty: 10 });
    assert.ok(!bad.ok && /재고 칸에 10이 안 들어감/.test(bad.why), JSON.stringify(bad));
    assert.deepStrictEqual(await saves(), [], "저장 안 누름");
    assert.strictEqual((await noKeys.read(P1)).pop, null, "창은 [취소]로 닫음");
    const { st } = mkStock(page, { type: (t) => page.keyboard.type(t) });
    const r = await st.openDay({ product: P1, day: "2026-11-19", qty: 10 });
    assert.ok(r.ok && r.done, r.why);
    assert.deepStrictEqual(await saves(), [{ id: 1, from: "2026-11-19", to: "2026-11-19", n: 10 }]);
  } finally {
    await browser.close();
  }
});
