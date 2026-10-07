/* 맨 위 '입장권 총 판매수' 버튼 → 입장권 목록 · 기록 삭제 (시험으로 잡힌 손님을 판매수 · 통계에서 뺌, 사용자 지시 10/7)
   앱처럼 네이버 · 저장 파일을 붙여, 다시 켜도 지운 기록이 남는지 본다 */
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
const NAVER = "file://" + path.join(__dirname, "..", "mock", "naver.html");
const DESK = "file://" + path.join(__dirname, "..", "..", "..", "prototype", "desk.html");

test("입장권 목록: 네이버 이용완료 · 현장구매자 · 기록 삭제 → 판매수에서 빠지고 다시 켜도 그대로", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const naverPage = await ctx.newPage();
    await naverPage.goto(NAVER);
    await naverPage.evaluate(() => localStorage.clear());
    await naverPage.goto(NAVER);
    const naver = new NaverSync((code) => naverPage.evaluate(code), { urls: { list: NAVER + "?view=list", calendar: NAVER + "?view=calendar" } });
    const desk = await ctx.newPage();
    desk.on("dialog", (d) => d.accept());
    await desk.clock.install({ time: new Date("2026-10-05T13:56:00") });
    let q = Promise.resolve();
    const serial = (fn) => (q = q.then(fn, fn));
    await desk.exposeFunction("__naverLoad", (day, only) => serial(() => naver.loadDay(day, { only })));
    await desk.addInitScript(() => {
      window.desk = {
        naver: { load: (d, o) => window.__naverLoad(d, o), complete: async () => ({ ok: true }) },
        state: { load: (day) => localStorage.getItem("test-state-" + day), save: (day, json) => localStorage.setItem("test-state-" + day, json) },
      };
    });
    const errs = [];
    desk.on("pageerror", (e) => errs.push(e.message));
    await desk.goto(DESK);
    await desk.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 30000 });
    // 현장구매 2장 (12:40 접수 → 12:30 입장)
    await desk.evaluate(() => { window.__deskTest.walkin("01012345678", [20, 21], 760); });
    await desk.evaluate(() => window.__deskTest.setNow(836));
    const sold = () => desk.$eval("#sold", (e) => +e.querySelector("b").textContent);
    assert.strictEqual(await sold(), 3 + 2, "네이버 이용완료 3장(송나라 1 · 엄효정 2) + 현장 2장");

    await desk.$eval("#sold", (e) => e.click());
    const rows = await desk.$$eval(".soldlist > div", (e) => e.map((x) => [...x.children].map((c) => c.textContent.trim()).join(" ")));
    assert.ok(rows.some((r) => /송나라 10:00 입장 1장/.test(r)), rows.join(" | "));
    assert.ok(rows.some((r) => /현장구매자 12:30 입장 2장/.test(r)), rows.join(" | "));

    // 시험으로 잡힌 손님: 엄효정(네이버 2장) · 현장구매자 2장 삭제
    await desk.click('.soldlist > div:has-text("엄효정") [data-act=soldDel]');
    await desk.click('.soldlist > div:has-text("현장구매자") [data-act=soldDel]');
    assert.strictEqual(await sold(), 1);
    const used10 = await desk.evaluate(() => window.__deskTest.capPlan().slots.find((x) => x.t === 600).used);
    assert.strictEqual(used10, 1, "수량 조절 통계에서도 빠짐");

    // 다시 켜도 그대로
    await desk.reload();
    await desk.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 30000 });
    assert.strictEqual(await sold(), 1, "다시 켜도 지운 기록은 빠진 채로");
    await desk.$eval("#sold", (e) => e.click());
    await desk.click('.soldlist > div:has-text("엄효정") [data-act=soldBack]');
    assert.strictEqual(await sold(), 3, "되살리기");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
