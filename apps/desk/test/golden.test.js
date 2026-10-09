/* 골든벨 (사용자 지시 10/9): 1시간 50분 제한이 있는 날 16:00 이후 안에 있는 열쇠가 20개 이하이면
   근무자에게 알림창 + 그때부터 모든 손님 무제한 (지금 열쇠 · 새로 들어오는 손님 · 시간 색 · 초과요금 없음) */
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
const launch = () => chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const MSG = "골든벨 울려주세요~!! 지금 시간부터 모든 고객 시간제한 없는 무제한 이용임을 알려주세요~~!!";

test("골든벨: 16:00 이후 열쇠 20개 이하 → 알림창 · 모든 열쇠 무제한 (색 · 초과요금 없음) · 한 번만", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 10/5(휴일 · 시간제) · 열쇠 19개 사용 중
    const used = () => page.evaluate(() => window.__deskTest.holders().reduce((a, h) => a + h.keys.length, 0));
    const colors = () => page.$$eval("#keys .key.pink, #keys .key.red", (e) => e.length);
    assert.strictEqual(await used(), 19);
    await page.evaluate(() => window.__deskTest.setNow(959)); // 15:59
    assert.ok(await page.isHidden("#golden"), "16:00 전에는 안 뜸");
    assert.ok((await colors()) > 0, "반납 시간 지난 열쇠는 아직 분홍 · 빨강");

    await page.evaluate(() => window.__deskTest.setNow(960)); // 16:00
    assert.ok(await page.isVisible("#golden"), "알림창");
    assert.strictEqual((await page.innerText("#golden .gmsg")).replace(/\s+/g, " ").trim(), MSG);
    assert.strictEqual(await colors(), 0, "모든 열쇠 무제한 → 시간 색 없음");
    const uses = await page.evaluate(() => window.__deskTest.holders().map((h) => window.__deskTest.useOf(h)));
    assert.ok(uses.every((m) => m == null), "열쇠마다 무제한");
    assert.match(await page.textContent("#date"), /골든벨/, "날짜 밑에 골든벨 무제한 표시");
    // 현장 판매 가능: 안 온 지난 예약(14:00 등)이 무제한으로 자리를 계속 막지 않음
    assert.ok(+(await page.$eval("#key-stat b:nth-of-type(2)", (e) => e.textContent)) > 0, "현장 가능 > 0");
    // 반납 시간이 지났던 손님(찟재명)도 초과요금 없음
    await page.click("#golden [data-act=goldenOk]");
    assert.ok(await page.isHidden("#golden"));
    await page.click('.key[data-k="4"]');
    assert.doesNotMatch(await page.textContent("#sheet"), /초과/);
    await page.click("#sheet [data-act=close] >> nth=0");
    await page.evaluate(() => window.__deskTest.setNow(990));
    assert.ok(await page.isHidden("#golden"), "한 번만");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("골든벨: 열쇠가 20개보다 많으면 기다렸다가 반납으로 20개가 되면", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await page.goto(DESK);
    await page.evaluate(() => { window.__deskTest.walkin("01011112222", [40, 41], 950); window.__deskTest.setNow(960); }); // 21개
    assert.ok(await page.isHidden("#golden"), "21개 → 아직");
    assert.ok(await page.$("#keys .key.red"), "아직 시간제");
    await page.click('.key[data-k="41"]');
    await page.click("#sheet [data-act=returnKey][data-k='41']");
    assert.ok(await page.isVisible("#golden"), "반납해서 20개 → 알림창");
  } finally {
    await browser.close();
  }
});
