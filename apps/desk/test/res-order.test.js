/* 예약자 카드 순서: 미입장 카드는 위에 가나다순, 입장 완료(이용완료) 카드는 밑으로 내려 다시 가나다순 (사용자 지시 10/8) */
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  ({ chromium } = require("/opt/node-tools/node_modules/playwright"));
}
const DESK = "file://" + path.join(__dirname, "..", "..", "..", "prototype", "desk.html");

test("예약자 카드: 미입장 위 가나다순 · 입장 완료는 밑으로 가나다순", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    page.on("dialog", (d) => d.accept());
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    const names = () => page.$$eval("#res .res .name", (e) => e.map((x) => x.firstChild.textContent.trim()));

    // 13:00 = 오유나 · 서도현 이용완료, 신채원 미입장 → 신채원이 맨 위
    await page.click('.slot[data-s="780"]');
    assert.deepStrictEqual(await names(), ["신채원", "서도현", "오유나"]);

    // 14:00 = 모두 미입장 → 가나다순
    await page.click('.slot[data-s="840"]');
    assert.deepStrictEqual(await names(), ["고은우", "김어긋", "류하린", "송다온", "전시윤", "홍예준"]);

    // 송다온 입장 처리 → 밑으로 내려감
    await page.click('.res:has-text("송다온")');
    await page.click(".kpick button:not([disabled]) >> nth=0");
    await page.click("#enter-done");
    if (await page.isVisible("#sheet [data-act=close]")) await page.click("#sheet [data-act=close] >> nth=0");
    assert.deepStrictEqual(await names(), ["고은우", "김어긋", "류하린", "전시윤", "홍예준", "송다온"]);

    // 고은우도 입장 → 입장 완료끼리도 가나다순 (고은우가 송다온 위)
    await page.click('.res:has-text("고은우")');
    await page.click(".kpick button:not([disabled]) >> nth=0");
    await page.click("#enter-done");
    if (await page.isVisible("#sheet [data-act=close]")) await page.click("#sheet [data-act=close] >> nth=0");
    assert.deepStrictEqual(await names(), ["김어긋", "류하린", "전시윤", "홍예준", "고은우", "송다온"]);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
