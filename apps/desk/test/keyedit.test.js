/* 열쇠 창에서 반납 시각 바꾸기 · +1타임 (사용자 지시 10/9)
   현장 손님이 네이버로 이어 예약하거나 현장에서 다시 사면 이름 · 전화로 이어 붙일 수 없음 → 근무자가 열쇠 창에서 직접
   - ◀ 시간 ▶ [변경] = 반납 시각만 (판매수 · 인원 그대로)
   - [+1타임] = 다음 타임 1시간 50분 (연속예약과 같이 +2시간) + 입장권 1장 더 산 것으로 판매수 · 인원에 넣음 (열쇠 수만큼) */
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

test("열쇠 창: 반납 시각 변경(판매수 그대로) · +1타임(+2시간 · 판매수 +열쇠 수)", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 13:50
    const sold = () => page.$eval("#sold b", (e) => +e.textContent);
    const sheet = async () => (await page.textContent("#sheet")).replace(/\s+/g, " ");
    const use = (k) => page.evaluate((k) => { const h = window.__deskTest.holders().find((x) => x.keys.includes(k)); return window.__deskTest.useOf(h, k); }, k);
    const s0 = await sold();

    // 7번 서도현 (13:00 예약 · 14:50 반납) → 15:20 으로 (반납 시각만)
    await page.click('.key[data-k="7"]');
    assert.match(await sheet(), /14:50 반납/);
    for (let i = 0; i < 3; i++) await page.click("#sheet [data-act=endSlot][data-d='10']");
    assert.match(await page.textContent("#sheet .mvrow"), /15:20/);
    await page.click("#sheet [data-act=endDo]");
    assert.match(await sheet(), /15:20 반납/);
    assert.strictEqual(await use(7), 140, "13:00 + 2:20");
    assert.strictEqual(await sold(), s0, "판매수 그대로");

    // +1타임: 15:20 → 17:20 (다음 타임 1시간 50분) · 판매수 +1 (열쇠 1개)
    await page.click("#sheet [data-act=plusSlot]");
    assert.match(await sheet(), /17:20 반납/);
    assert.strictEqual(await use(7), 260);
    assert.strictEqual(await sold(), s0 + 1, "입장권 1장 더");
    await page.click("#sheet [data-act=close] >> nth=0");

    // 현장 손님(30 · 31번, 13:12 접수 → 13:00 입장 · 14:50 반납) +1타임 → 16:50 · 열쇠 2개 = 2장
    await page.click('.key[data-k="30"]');
    assert.match(await sheet(), /14:50 반납/);
    await page.click("#sheet [data-act=plusSlot]");
    assert.match(await sheet(), /16:50 반납/);
    assert.deepStrictEqual([await use(30), await use(31)], [230, 230]);
    assert.strictEqual(await sold(), s0 + 3, "열쇠 2개 → 2장");
    await page.click("#sheet [data-act=close] >> nth=0");

    // 입장권 목록에 '추가 1타임'
    await page.$eval("#sold", (e) => e.click());
    const list = (await page.textContent(".soldlist")).replace(/\s+/g, " ");
    assert.match(list, /추가 1타임 · 서도현 7번/);
    assert.match(list, /추가 1타임 · 현장 30, 31번/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
