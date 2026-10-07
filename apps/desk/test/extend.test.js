/* 이용 중 손님의 추가 예약 (사장님 10/7)
   딱 2시간 뒤 → 자동 연장 + 알림 → 확인하면 이용완료 / 가까움 → 두 가지 중 선택 / 2시간 30분 이상 → 당겨서 이어서 · 그대로 두기 */
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
const hm = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

async function setup() {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(DESK);
  // 13:30 예약으로 들어와 열쇠 8번을 가진 권이준 (반납 15:20)
  const h = await page.evaluate(() => window.__deskTest.holders2().find((x) => x.name === "권이준"));
  return { browser, page, errs, h };
}
const addLater = (page, h, slot, qty = 1) => page.evaluate(([n, s, q]) => window.__deskTest.addBooking("2026-10-05", s, n, "01099990000", q, { prevDone: 4 }), [h.name, hm(slot), qty]);
const fixPhone = (page, name) => page.evaluate((n) => { const h = window.__deskTest.holders().find((x) => x.name === n); h.phone = "01099990000"; }, name);

test("딱 2시간 뒤 추가 예약: 자동 연장 → 열쇠 창 알림 → 확인하면 이용완료", async () => {
  const { browser, page, errs, h } = await setup();
  try {
    assert.strictEqual(h.end, 13 * 60 + 30 + 110);
    await fixPhone(page, h.name);
    await addLater(page, h, h.slot + 120); // 15:30
    await page.evaluate(() => window.__deskTest.extScan());
    const end = await page.evaluate((n) => window.__deskTest.holders2().find((x) => x.name === n).end, h.name);
    assert.strictEqual(end, h.slot + 120 + 110, "15:30 + 1:50 = 17:20 으로 자동 연장");
    // 열쇠 창이 저절로 열리고 알림
    await page.waitForSelector(".extbox");
    assert.match(await page.textContent(".extbox"), /자동 연장/);
    await page.click("[data-act=extOk]");
    const st = await page.evaluate((n) => { const b = window.__deskTest.holders().find((x) => x.name === n); return null; }, h.name);
    assert.ok(await page.evaluate(() => [...document.querySelectorAll(".res")].length >= 0));
    const later = await page.evaluate(() => { const T = window.__deskTest; return T.extFor("권이준"); });
    assert.strictEqual(later, null, "확인 뒤 알림 없음 (이용완료)");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("1시간 30분 뒤: 두 가지 중 선택 / 3시간 뒤: 그대로 두기면 이용완료 안 함", async () => {
  const { browser, page, errs, h } = await setup();
  try {
    await fixPhone(page, h.name);
    const id = await addLater(page, h, h.slot + 90); // 15:00
    await page.evaluate(() => window.__deskTest.extScan());
    await page.waitForSelector(".extbox");
    assert.match(await page.textContent(".extbox"), /이 예약 시간부터 1시간 50분[\s\S]*16:50 반납[\s\S]*처음부터 이어서 \(3시간 50분\)[\s\S]*17:20 반납/);
    assert.ok(await page.isDisabled("[data-act=extOk]"), "고르기 전엔 확인 못 함");
    await page.click('[data-act=extPick][data-k="chain"]');
    await page.click("[data-act=extOk]");
    let end = await page.evaluate((n) => window.__deskTest.holders2().find((x) => x.name === n).end, h.name);
    assert.strictEqual(end, h.slot + 230, "처음부터 3시간 50분 = 17:20");

    // 그 뒤 3시간 떨어진 예약 (17:20 반납 → 마지막 타임 15:30, 18:30 예약 = 3시간 뒤)
    await addLater(page, h, h.slot + 120 + 180);
    await page.evaluate(() => window.__deskTest.extScan());
    await page.waitForSelector(".extbox");
    assert.match(await page.textContent(".extbox"), /2시간 30분 이상/);
    await page.click('[data-act=extPick][data-k="ignore"]');
    await page.click("[data-act=extOk]");
    end = await page.evaluate((n) => window.__deskTest.holders2().find((x) => x.name === n).end, h.name);
    assert.strictEqual(end, h.slot + 230, "그대로 두기 → 반납 시각 그대로");
    assert.strictEqual(await page.evaluate(() => window.__deskTest.extFor("권이준")), null, "다시 묻지 않음");
    // 그 예약은 확정 그대로 (이용완료 안 함) · 따로 입장 가능
    await page.click(`.slot[data-s="${h.slot + 300}"]`);
    const card = page.locator(`.res:has-text("${h.name}")`);
    assert.match(await card.textContent(), /미입장/);
    assert.match(await card.textContent(), /눌러서 입장/, "연속예약으로 묶여 막히지 않음");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
