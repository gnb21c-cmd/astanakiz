/* 데스크 화면 ↔ 가짜 네이버 예약현황 화면을 실제 연동 코드(NaverSync)로 이어서 (앱의 preload 를 흉내 냄)
   - 데스크가 네이버에서 오늘 예약을 불러와 시간표·명단에 보여 주는지
   - 입장 등록 때 네이버에 이용완료가 눌리고, 방문 회차가 네이버 '완료 n' + 1 로 잡히는지 */
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

test("데스크가 네이버 예약을 불러오고, 등록 완료 때 네이버 이용완료까지 처리", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const naverPage = await ctx.newPage();
    await naverPage.goto(NAVER);
    await naverPage.evaluate(() => localStorage.clear());
    await naverPage.goto(NAVER);
    const naver = new NaverSync((code) => naverPage.evaluate(code), { urls: { list: NAVER + "?view=list", calendar: NAVER + "?view=calendar" } });

    const desk = await ctx.newPage();
    await desk.clock.install({ time: new Date("2026-10-05T13:56:00") });
    const loads = [];
    await desk.exposeFunction("__naverLoad", (day) => (loads.push(day), naver.loadDay(day)));
    await desk.exposeFunction("__naverComplete", (b) => naver.complete(b));
    await desk.addInitScript(() => {
      window.desk = { naver: { load: (d) => window.__naverLoad(d), complete: (b) => window.__naverComplete(b) } };
    });
    const errs = [];
    desk.on("pageerror", (e) => errs.push(e.message));
    await desk.goto(DESK);

    // 오늘 14:00 칸: 네이버 확정 4 (입장권만, 단체 제외)
    await desk.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 30000 });
    const slot14 = await desk.textContent('.slot[data-s="840"]');
    assert.deepStrictEqual(await desk.$$eval('.slot[data-s="840"] .c', (e) => e.map((x) => x.textContent.trim())), ["4", "6"], "14:00 확정 4 · 잔여 6");

    await desk.click('.slot[data-s="840"]');
    const names = await desk.$$eval(".res .name", (e) => e.map((x) => x.textContent));
    assert.deepStrictEqual(names, ["백연화", "송다온", "허정은"], "이름 가나다순");
    assert.match(await desk.textContent('.res:has-text("허정은")'), /완료 8 · 취소 2 → 이번 9번째 방문/);

    // 허정은 입장: 열쇠 1개 고르고 등록 완료 → 네이버 이용완료
    await desk.click('.res:has-text("허정은")');
    await desk.click(".kpick button:not([disabled]) >> nth=0");
    await desk.click("#enter-done");
    await desk.waitForFunction(() => document.getElementById("overlay").hidden, null, { timeout: 30000 });
    assert.match(await desk.textContent('.res:has-text("허정은")'), /이용완료/);
    assert.match(await desk.textContent('.res:has-text("허정은")'), /9번째 방문/);
    assert.deepStrictEqual(await desk.$$eval(".res .name", (e) => e.map((x) => x.textContent)), ["백연화", "송다온", "허정은"], "입장해도 순서 그대로");

    // 네이버 화면에서도 완료로 바뀜
    const after = await naver.loadDay("2026-10-05");
    assert.strictEqual(after.bookings.find((b) => b.no === "1368155282").status, "완료");

    // 자동 불러오기: 13:56에 켰으니 다음은 14:20 (팝업이 닫혀 있을 때)
    assert.match(await desk.textContent("#refresh-at"), /다음 14:20/);
    const n0 = loads.length;
    await desk.clock.runFor(20 * 60 * 1000); // 14:16
    assert.strictEqual(loads.length, n0, "14:20 전에는 안 불러옴");
    await desk.clock.runFor(5 * 60 * 1000); // 14:21
    await desk.waitForFunction(() => /14:2\d 불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 30000 });
    assert.strictEqual(loads.length, n0 + 1, "14:20에 한 번만 불러옴");
    assert.match(await desk.textContent("#refresh-at"), /다음 14:50/);

    // 새로고침 버튼: 자동 시각이 아니어도 바로 불러옴
    await desk.click("[data-act=refresh]");
    await desk.waitForFunction((n) => !/불러오는 중/.test(document.getElementById("refresh-at").textContent), null, { timeout: 30000 });
    assert.strictEqual(loads.length, n0 + 2);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
