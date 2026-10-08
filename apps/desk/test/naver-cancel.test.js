/* 대리예약 읽기 · 입금대기 예약 취소 (현장 화면 10/8 본뜸)
   - 대리예약: 예약자 옆 '대리예약' 스티커 + 방문자 "박소희(010-…)" → 둘 다 읽음
   - 입금대기: [이용완료] 없이 [예약취소]만 → 취소하면 칸의 확정 숫자가 줆 · 결제한 예약은 취소하지 않음 */
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { NaverSync } = require("../src/naver-sync");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  ({ chromium } = require("/opt/node-tools/node_modules/playwright"));
}
const MOCK = "file://" + path.join(__dirname, "..", "mock", "naver.html");
const P0 = "평일 무제한 / 휴일 1시간 50분 입장권";

test("대리예약 · 입금대기 읽기 → 입금대기만 취소, 결제한 예약은 안 함", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage();
    await page.goto(MOCK);
    await page.evaluate(() => localStorage.clear());
    await page.goto(MOCK);
    const sync = new NaverSync((code) => page.evaluate(code), { urls: { list: MOCK + "?view=list", calendar: MOCK + "?view=calendar" } });
    let r = await sync.loadDay("2026-10-05");
    assert.ok(r.ok, r.why);
    const by = Object.fromEntries(r.bookings.map((b) => [b.no, b]));
    assert.deepStrictEqual({ proxy: by["1372961203"].proxy, visitor: by["1372961203"].visitor, unpaid: by["1372961203"].unpaid }, { proxy: true, visitor: "박소희(010-2785-4295)", unpaid: false });
    assert.strictEqual(by["1373000111"].unpaid, true, "입금대기");
    assert.strictEqual(by["1368155282"].unpaid, false, "결제완료");

    // 결제한 예약은 취소하지 않음
    let c = await sync.cancel({ day: "2026-10-05", time: "16:00", product: P0, no: "1372961203", qty: 1 });
    assert.ok(!c.ok && c.paid, "결제한 대리예약은 그대로");
    // 입금대기 취소
    c = await sync.cancel({ day: "2026-10-05", time: "15:30", product: P0, no: "1373000111", qty: 1 });
    assert.ok(c.ok, c.why);
    r = await sync.loadDay("2026-10-05");
    assert.ok(!r.bookings.some((b) => b.no === "1373000111"), "취소됨");
    assert.ok(r.bookings.some((b) => b.no === "1372961203"), "대리예약은 그대로");
  } finally {
    await browser.close();
  }
});

test("데스크: 네이버를 불러오면 2시간 안의 입금대기 예약을 자동 취소 · 대리예약 카드에 방문자", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const naverPage = await ctx.newPage();
    await naverPage.goto(MOCK);
    await naverPage.evaluate(() => localStorage.clear());
    await naverPage.goto(MOCK);
    const naver = new NaverSync((code) => naverPage.evaluate(code), { urls: { list: MOCK + "?view=list", calendar: MOCK + "?view=calendar" } });
    const desk = await ctx.newPage();
    await desk.clock.install({ time: new Date("2026-10-05T13:56:00") });
    let q = Promise.resolve();
    const serial = (fn) => (q = q.then(fn, fn));
    await desk.exposeFunction("__naverLoad", (day, only) => serial(() => naver.loadDay(day, { only })));
    await desk.exposeFunction("__naverCancel", (b) => serial(() => naver.cancel(b)));
    await desk.addInitScript(() => {
      window.desk = { naver: { load: (d, o) => window.__naverLoad(d, o), complete: async () => ({ ok: true }), cancel: (b) => window.__naverCancel(b) }, state: { load: () => null, save: () => {} } };
    });
    const errs = [];
    desk.on("pageerror", (e) => errs.push(e.message));
    await desk.goto(path.join("file://", __dirname, "..", "..", "..", "prototype", "desk.html"));
    // 15:30 입금대기(13:56 + 2시간 안) → 자동 취소
    await desk.waitForFunction(() => /자동 취소/.test(document.getElementById("toast").textContent), null, { timeout: 60000 });
    const r = await naver.loadDay("2026-10-05");
    assert.ok(!r.bookings.some((b) => b.no === "1373000111"), "네이버에서 취소됨");
    // 대리예약 카드: 예약자 + 방문자
    await desk.click('.slot[data-s="960"]');
    const card = await desk.textContent('.res:has-text("양용수")');
    assert.match(card, /대리예약/);
    assert.match(card, /방문자\s*박소희 010-2785-4295/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
