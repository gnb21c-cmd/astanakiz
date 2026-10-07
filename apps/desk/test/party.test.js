/* 같은 사람이 같은 시간에 예약을 나눠 한 경우 (1장 + 1장): 한 번에 입장 · 열쇠 합친 수 · 둘 다 이용완료 · 입장권 누계는 함께 완료한 뒤의 수 (사용자 지시 10/7)
   카드 문구: 완료 = "N번째 예약완료", 입장 전 = "완료 8 → 9번 완료 예정" */
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

test("같은 시간 나눠 한 예약은 함께 입장 · 카드 문구", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    await page.click('.slot[data-s="900"]');
    const cards = page.locator('.res:has-text("나분할")');
    assert.strictEqual(await cards.count(), 2);
    assert.match(await cards.nth(0).textContent(), /완료 8 · .*→ 9번 완료 예정|완료 8 → 9번 완료 예정/);
    assert.match(await cards.nth(1).textContent(), /같은 시간 첫 카드에서 함께 입장 처리/);
    // 두 번째 카드는 입장 못 함
    await cards.nth(1).click();
    assert.match(await page.textContent("#sheet"), /같은 시간 예약 2\/2/);
    assert.ok(await page.isDisabled("#enter-done"));
    await page.click("#sheet [data-act=close] >> nth=0");
    // 첫 카드: 열쇠 2개 → 등록
    await cards.nth(0).click();
    assert.match(await page.textContent("#sheet"), /같은 시간 예약 2건.*열쇠 2개/);
    await page.click(".kpick button:not([disabled]) >> nth=0");
    assert.ok(await page.isDisabled("#enter-done"), "1개만으로는 안 됨");
    await page.click(".kpick button:not([disabled]):not(.on) >> nth=0");
    await page.click("#enter-done");
    const st = await page.evaluate(() => window.__deskTest.holders().filter((h) => h.name === "나분할").map((h) => ({ keys: h.keys.length, v: h.visitNo, end: h.visitEnd })));
    assert.deepStrictEqual(st, [{ keys: 2, v: 9, end: 10 }], "열쇠 2개는 대표에게, 함께 완료 → 10");
    const kv = await page.evaluate(() => { const h = window.__deskTest.holders().find((x) => x.name === "나분할"); return window.__deskTest.keyVals(h); });
    assert.strictEqual(kv.누계, "10");
    assert.strictEqual(kv._사은권, true, "9 · 10 중 10번째 → 사은권");
    const txt = await page.$$eval('.res', (e) => e.filter((x) => /나분할/.test(x.textContent)).map((x) => x.textContent));
    assert.ok(txt.every((t) => /이용완료/.test(t)), "둘 다 이용완료");
    assert.ok(txt.some((t) => /9번째 예약완료/.test(t)) && txt.some((t) => /10번째 예약완료/.test(t)), txt.join(" | "));
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
