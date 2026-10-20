/* 네이버 재고 자동 오픈 (사장님 10/20) — 가짜 예약상품 화면(mock/naver-stock.html, 사장님 사진 · 실제 화면 저장본 본뜸)에서
   1.54 (사장님 10/20 21:1x): 큰 달력을 읽어 확인하지 않고 바로 — 상품 일정/가격 주소 → [재고수정] → 작은 달력 ▶ → 날짜 → [다음] → [모든 회차] → 키보드로 10 → [저장]
   - 두 상품 같은 날짜 · 이미 넣은 날도 10개로 · 어느 날을 열지(stockDays): 오늘 + 30일 · 이 PC 가 마지막으로 연 날 뒤부터 이어서 (7일까지)
   - 1.53 (현장 10/20 20:55): 큰 달력을 달 넘기자마자 읽어 10월 19일을 11월 19일로 알고 '이미 열려 있음' → 이제 큰 달력을 안 읽음
   - 1.52 (현장 10/20 20:24): 가게 사진 링크 → 스마트플레이스 → 리뷰 작성자 MY플레이스 새 창 → 주소로만 · 바깥 · 새 창 링크는 안 누름 */
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { NaverStock, stockDays, stockDue } = require("../src/naver-stock");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  ({ chromium } = require("/opt/node-tools/node_modules/playwright"));
}
const MOCK = "file://" + path.join(__dirname, "..", "mock", "naver-stock.html");
const CAL = "file://" + path.join(__dirname, "..", "mock", "naver.html") + "?view=calendar";
const P0 = "평일 무제한 / 휴일 1시간 50분 입장권", P1 = "야간자유 입장권";
const launch = () => chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});

// 가짜 화면 주소 모양 (실제: …/bizes/{업체}/biz-items · …/biz-items/{상품}/schedules)
const URLS = { calendar: CAL, items: MOCK + "?view=items", schedule: MOCK + "?view=item&id={id}&tab=schedules" };
const PAT = { list: "[?&]view=items(?:&|$)", id: "[?&]view=item&id=(\\d+)" };
const mkStock = (page, o = {}) => {
  const learned = {};
  const st = new NaverStock((code) => page.evaluate(code), Object.assign({ urls: URLS, pat: PAT, onLearn: (n, id) => { learned[n] = id; }, type: (t) => page.keyboard.type(t) }, o));
  return { st, learned };
};
async function setup(browser, q = "", o = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(MOCK + "?view=items");
  await page.evaluate(() => localStorage.clear());
  await page.goto(MOCK + "?view=items&today=2026-10-20" + q);
  const { st, learned } = mkStock(page, o);
  const saves = () => page.evaluate(() => JSON.parse(localStorage.getItem("mockStockSaves") || "[]"));
  const caps = (id, day) => page.evaluate(([id, day]) => JSON.parse(localStorage.getItem("mockStock1")).stock[id][day].map((c) => c.cap), [id, day]);
  return { page, st, saves, learned, caps };
}

test("어느 날을 열지: 처음엔 오늘 + 30일 하나 · 이 PC 가 마지막으로 연 날 뒤부터 이어서 · 오래 비면 7일만(앞쪽은 직접) · 건너뛸 날", () => {
  const T = "2026-10-20";
  assert.deepStrictEqual(stockDays({ today: T }), { target: "2026-11-19", plan: ["2026-11-19"], missed: [], skipped: [] }, "처음 (기록 없음)");
  assert.deepStrictEqual(stockDays({ today: T, last: "2026-11-18" }).plan, ["2026-11-19"], "어제 연 다음 날");
  assert.deepStrictEqual(stockDays({ today: T, last: "2026-11-19" }).plan, [], "오늘 것 이미 엶");
  assert.deepStrictEqual(stockDays({ today: T, last: "2026-11-16" }).plan, ["2026-11-17", "2026-11-18", "2026-11-19"], "POS 를 꺼서 못 연 날까지");
  const far = stockDays({ today: T, last: "2026-11-05" });
  assert.deepStrictEqual([far.plan[0], far.plan.length, far.missed], ["2026-11-13", 7, ["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"]]);
  assert.deepStrictEqual(stockDays({ today: T, last: "2026-09-01" }).plan.slice(-1), ["2026-11-19"], "아주 오래전 기록이어도 오늘 + 30일은 오늘");
  const sk = stockDays({ today: T, last: "2026-11-17", skip: ["2026-11-18"] });
  assert.deepStrictEqual([sk.plan, sk.skipped], [["2026-11-19"], ["2026-11-18"]]);
});

test("하루 네 번 기회: 10:30 → 실패하면 12:00 → 16:00 → 20:20 · 늦게 켜면 지난 것 한 번 · 다 써 보면 그날은 끝", () => {
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

test("재고 넣기: 두 상품 같은 날짜(11/19) · 작은 달력 ▶ 한 번 · 키보드로 10 · 이미 넣은 날도 그대로 진행 · 확인만은 '모든 회차' 창까지 가 보고 취소", async () => {
  const browser = await launch();
  try {
    const { page, st, saves, learned, caps } = await setup(browser);
    // 확인만: 바꾸지 않음
    const dry = await st.setDay({ product: P0, day: "2026-11-19", qty: 10, dry: true });
    assert.ok(dry.ok && dry.dry, dry.why);
    assert.deepStrictEqual(await saves(), [], "확인만은 저장 안 함");
    assert.strictEqual((await st.read(P0)).pop, null, "창은 [취소]로 닫음");
    for (const p of [P0, P1]) {
      const r = await st.setDay({ product: p, day: "2026-11-19", qty: 10 });
      assert.ok(r.ok && r.done && r.toast, `${p}: ${r.why}`);
    }
    assert.deepStrictEqual(await saves(), [{ id: 0, from: "2026-11-19", to: "2026-11-19", n: 10 }, { id: 1, from: "2026-11-19", to: "2026-11-19", n: 10 }]);
    assert.deepStrictEqual(await caps(1, "2026-11-19"), [10, 10, 10, 10]);
    assert.deepStrictEqual(learned, { [P0]: "0", [P1]: "1" }, "상품 번호: 카드 링크(0) · 링크 없는 카드는 이름을 눌러 간 주소(1)");
    // 이미 넣은 날(11/18 = 10)도 확인하지 않고 그대로 진행 (사장님 10/20)
    const r = await st.setDay({ product: P0, day: "2026-11-18", qty: 10 });
    assert.ok(r.ok && r.done, r.why);
    assert.strictEqual((await saves()).length, 3);
    assert.ok(/view=item&id=0&tab=schedules/.test(page.url()), "아는 번호는 일정/가격 주소로 바로 " + page.url());
    assert.strictEqual(browser.contexts()[0].pages().length, 1, "새 창 없음");
  } finally {
    await browser.close();
  }
});

test("재고 넣기: 예약현황 화면에서 시작 · 작은 달력 ▶ 두 번(12/1) · 네이버가 느려도 · 달력 글자만 먼저 바뀌어도 · 로그인 안 됨이면 알려 줌", async () => {
  const browser = await launch();
  try {
    const { page, st, saves } = await setup(browser, "&slow=1&stale=1");
    await page.goto(CAL);
    const r = await st.setDay({ product: P0, day: "2026-12-01", qty: 10 });
    assert.ok(r.ok && r.done, r.why);
    assert.deepStrictEqual(await saves(), [{ id: 0, from: "2026-12-01", to: "2026-12-01", n: 10 }]);
    await page.goto(MOCK + "?login=need");
    const l = await st.setDay({ product: P0, day: "2026-11-19", qty: 10 });
    assert.match(l.why, /로그인/);
  } finally {
    await browser.close();
  }
});

test("현장 10/20 (1.52): 스마트플레이스 첫 화면 · 가게 사진 링크 · 리뷰 작성자 새 창 링크 — 안 누르고 주소로 예약상품 · 상품 · 번호가 틀리면 다시 찾음", async () => {
  const browser = await launch();
  try {
    const { page, saves } = await setup(browser);
    const ctx = page.context();
    await page.goto(MOCK + "?view=home");
    const { st, learned } = mkStock(page);
    assert.deepStrictEqual(await st.call(`window.__naverStock.openItem(${JSON.stringify(P1)})`), { ok: false, why: "예약상품 목록 화면이 아님" }, "목록이 아니면 아무것도 안 누름");
    assert.strictEqual((await st.read(P1)).card, false);
    const r = await st.setDay({ product: P1, day: "2026-11-19", qty: 10 });
    assert.ok(r.ok && r.done, r.why);
    assert.deepStrictEqual(await saves(), [{ id: 1, from: "2026-11-19", to: "2026-11-19", n: 10 }]);
    assert.deepStrictEqual(learned, { [P1]: "1" });
    assert.strictEqual(ctx.pages().length, 1, "새 창(MY플레이스) 없음");
    await page.goto(MOCK + "?view=items");
    const out = await st.call(`window.__naverStock.click("아스타나키즈")`);
    assert.ok(!out.ok && /밖/.test(out.why), JSON.stringify(out));
    assert.ok(/view=items/.test(page.url()), "그대로 예약상품 목록");
    assert.strictEqual(ctx.pages().length, 1);
    // 남겨 둔 번호가 틀리면(상품이 바뀜) → 목록에서 다시 찾아 고침 · 다른 상품을 바꾸지 않음
    const w = mkStock(page, { ids: { [P0]: "1" } });
    const r2 = await w.st.setDay({ product: P0, day: "2026-11-19", qty: 10 });
    assert.ok(r2.ok && r2.done, r2.why);
    assert.deepStrictEqual((await saves()).slice(-1), [{ id: 0, from: "2026-11-19", to: "2026-11-19", n: 10 }]);
    assert.deepStrictEqual(w.learned, { [P0]: "0" });
  } finally {
    await browser.close();
  }
});

test("재고 수 칸: 커서를 놓고 키보드로 쳐야 [저장]이 켜지는 칸 (사장님 10/20 사진) — 키보드로 10 · 키보드가 없으면 못 넣었다고 알리고 저장 안 함", async () => {
  const browser = await launch();
  try {
    const { page, saves } = await setup(browser, "&strict=1");
    const snaps = [];
    const { st: noKeys } = mkStock(page, { type: null, onSnap: async (label) => snaps.push([label, ((await page.evaluate(() => document.body.innerText)).match(/변경할 재고 수를 입력해주세요/) || [""])[0]]) });
    const bad = await noKeys.setDay({ product: P1, day: "2026-11-19", qty: 10 });
    assert.ok(!bad.ok && /재고 칸에 10이 안 들어감/.test(bad.why), JSON.stringify(bad));
    assert.deepStrictEqual(snaps, [["stock-qty", "변경할 재고 수를 입력해주세요"]], "진단 화면은 창을 닫기 전에 (문제 창이 보이게)");
    assert.deepStrictEqual(await saves(), [], "저장 안 누름");
    assert.strictEqual((await noKeys.read(P1)).pop, null, "창은 [취소]로 닫음");
    const { st } = mkStock(page);
    const r = await st.setDay({ product: P1, day: "2026-11-19", qty: 10 });
    assert.ok(r.ok && r.done, r.why);
    assert.deepStrictEqual(await saves(), [{ id: 1, from: "2026-11-19", to: "2026-11-19", n: 10 }]);
  } finally {
    await browser.close();
  }
});

test("[저장] 뒤 네이버가 거절하는 경고 창이 뜨면 성공이 아님 (원래 떠 있던 창은 상관없음)", async () => {
  const browser = await launch();
  try {
    const { st, saves } = await setup(browser, "&reject=1");
    const r = await st.setDay({ product: P0, day: "2026-11-19", qty: 10 });
    assert.ok(!r.ok && /저장 뒤 네이버 알림: 재고 수량은 예약된 수량보다/.test(r.why), JSON.stringify(r));
    assert.deepStrictEqual(await saves(), []);
  } finally {
    await browser.close();
  }
});

test("현장 10/20 21:47 (1.54): '모든 회차'가 value 붙은 버튼이거나 버튼이 아닌 칸이어도 누름 · 못 찾으면 창 안 글자를 알려 줌", async () => {
  const browser = await launch();
  try {
    const { page, st, saves } = await setup(browser, "&opt=div");
    const r = await st.setDay({ product: P0, day: "2026-11-19", qty: 10 });
    assert.ok(r.ok && r.done, r.why);
    assert.deepStrictEqual(await saves(), [{ id: 0, from: "2026-11-19", to: "2026-11-19", n: 10 }]);
    // value 붙은 버튼 (기본 가짜 화면): 글자로 찾음
    await page.evaluate(() => localStorage.removeItem("mockStockOpt"));
    const r2 = await st.setDay({ product: P1, day: "2026-11-19", qty: 10 });
    assert.ok(r2.ok && r2.done, r2.why);
    // 없는 글자 → 창 안에 보이는 글자를 알려 줌
    await st.until(P1, (x) => x.stockOn && !x.pop, 5000, "");
    await st.call(`window.__naverStock.click("재고수정")`);
    assert.ok((await st.until(P1, (x) => x.pop && x.pop.kind === "period", 5000, "")).ok);
    const miss = await st.call(`window.__naverStock.click("저장")`);
    assert.ok(!miss.ok && /창 안: .*취소/.test(miss.why), JSON.stringify(miss));
  } finally {
    await browser.close();
  }
});
