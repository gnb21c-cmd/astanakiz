/* 예약시간 변경 (사용자 지시 10/9): 네이버 예약 시간은 바꿀 수 없어 데스크에서만 카드를 다른 시간으로 옮김
   - 예약자 창 이용일시 옆 ◀ (시간) ▶ [변경] → 그 시간 명단으로 · 카드에 '네이버 14:00' 표시
   - 새로고침 · 다시 켜도 옮긴 시간에 · 입장(이용완료)하면 네이버는 원래 시간 칸에서 이용완료 */
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
const launch = () => chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const names = (page) => page.$$eval("#res .res .name", (e) => e.map((x) => x.firstChild.textContent.trim()));

test("체험판: 예약자 창에서 ◀ ▶ 변경 → 카드가 그 시간으로 · 되돌리기", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    await page.click('.slot[data-s="840"]');
    await page.click('.res:has-text("고은우")');
    await page.click("[data-act=mvSlot][data-d='30']");
    await page.click("[data-act=mvSlot][data-d='30']");
    assert.match(await page.textContent(".mvrow"), /15:00/);
    await page.click("[data-act=mvDo]");
    assert.match((await page.textContent("#sheet")).replace(/\s+/g, " "), /이용일시 ?15:00/);
    await page.click("#sheet [data-act=close] >> nth=0");
    assert.ok((await names(page)).includes("고은우"), "옮긴 시간(15:00) 명단으로 바로 보여 줌");
    assert.match(await page.textContent('.res:has-text("고은우")'), /네이버 14:00/);
    await page.click('.slot[data-s="840"]');
    assert.ok(!(await names(page)).includes("고은우"), "14:00 명단에서는 빠짐");
    // 되돌리기
    await page.click('.slot[data-s="900"]');
    await page.click('.res:has-text("고은우")');
    await page.click("[data-act=mvSlot][data-d='-30']");
    await page.click("[data-act=mvSlot][data-d='-30']");
    await page.click("[data-act=mvDo]");
    await page.click("#sheet [data-act=close] >> nth=0");
    assert.ok((await names(page)).includes("고은우"));
    assert.doesNotMatch(await page.textContent('.res:has-text("고은우")'), /네이버 14:00/, "원래 시간이면 표시 없음");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("설치 앱: 옮긴 카드는 새로고침 · 다시 켜도 그 시간 · 입장하면 네이버 원래 시간 칸에서 이용완료", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const naverPage = await ctx.newPage();
    await naverPage.goto(NAVER);
    await naverPage.evaluate(() => localStorage.clear());
    await naverPage.goto(NAVER);
    const naver = new NaverSync((code) => naverPage.evaluate(code), { urls: { list: NAVER + "?view=list", calendar: NAVER + "?view=calendar" } });
    const desk = await ctx.newPage();
    await desk.clock.install({ time: new Date("2026-10-05T13:56:00") });
    let q = Promise.resolve();
    const serial = (fn) => (q = q.then(fn, fn));
    const completes = [];
    await desk.exposeFunction("__naverLoad", (day, only) => serial(() => naver.loadDay(day, { only })));
    await desk.exposeFunction("__naverComplete", (b) => (completes.push(b), serial(() => naver.complete(b))));
    await desk.addInitScript(() => {
      window.desk = {
        naver: { load: (d, o) => window.__naverLoad(d, o), complete: (b) => window.__naverComplete(b) },
        state: { load: (day) => localStorage.getItem("test-state-" + day), save: (day, json) => localStorage.setItem("test-state-" + day, json) },
      };
    });
    const errs = [];
    desk.on("pageerror", (e) => errs.push(e.message));
    const loaded = () => desk.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 60000 });
    await desk.goto(DESK);
    await loaded();
    await desk.click('.slot[data-s="840"]');
    await loaded();
    await desk.click('.res:has-text("허정은")');
    await desk.click("[data-act=mvSlot][data-d='30']");
    await desk.click("[data-act=mvSlot][data-d='30']");
    await desk.click("[data-act=mvDo]");
    await desk.click("#sheet [data-act=close] >> nth=0");
    // 새로고침 (하루 전체) → 그대로 15:00
    await desk.click("[data-act=refresh]");
    await desk.waitForTimeout(300);
    await loaded();
    await desk.click('.slot[data-s="900"]');
    await loaded();
    assert.ok((await names(desk)).includes("허정은"), "새로고침해도 옮긴 시간");
    await desk.click('.slot[data-s="840"]'); // 14:00 칸만 다시 불러와도
    await loaded();
    assert.ok(!(await names(desk)).includes("허정은"));
    // 다시 켜도
    await desk.reload();
    await loaded();
    await desk.click('.slot[data-s="900"]');
    await loaded();
    assert.ok((await names(desk)).includes("허정은"), "다시 켜도 옮긴 시간");
    assert.match(await desk.textContent('.res:has-text("허정은")'), /네이버 14:00/);
    // 입장 → 네이버는 원래 14:00 칸에서 이용완료
    await desk.click('.res:has-text("허정은")');
    await desk.click(".kpick button:not([disabled]) >> nth=0");
    await desk.click("#enter-done");
    await desk.waitForFunction(() => { const c = [...document.querySelectorAll(".res")].find((e) => /허정은/.test(e.textContent)); return c && /이용완료/.test(c.textContent) && !c.querySelector(".npend"); }, null, { timeout: 60000 });
    assert.strictEqual(completes[0].time, "14:00", "네이버 원래 시간 칸");
    const after = await naver.loadDay("2026-10-05");
    assert.strictEqual(after.bookings.find((b) => b.no === "1368155282").status, "완료");
    // 이용시간은 옮긴 시간부터 (15:00 + 1:50)
    await desk.click('.res:has-text("허정은")');
    assert.match((await desk.textContent("#sheet")).replace(/\s+/g, " "), /이용일시 ?15:00 ~ 16:50/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
