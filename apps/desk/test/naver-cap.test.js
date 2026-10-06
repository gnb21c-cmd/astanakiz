/* 네이버 판매 수량 바꾸기 시험: 가짜 예약현황(mock/naver.html)에서
   칸의 [예약가능]/[잔여예약] → 예약가능 설정 창 → 수량 → [설정변경] → 확인 창 → 칸 숫자가 바뀌는지 (현장 화면 10/6 본뜸) */
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

test("판매 수량 바꾸기: 예약 없는 칸 10 → 13, 예약 있는 칸 10 → 7, 예약보다 적게는 안 됨", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage();
    await page.goto(MOCK);
    await page.evaluate(() => localStorage.clear());
    await page.goto(MOCK);
    const sync = new NaverSync((code) => page.evaluate(code), { urls: { list: MOCK + "?view=list", calendar: MOCK + "?view=calendar" } });
    const capAt = async (time) => { const s = (await sync.read()).slots.find((x) => x.time === time && x.product === P0); return s.avail + s.conf + s.done + s.apply; };

    let r = await sync.setCap({ day: "2026-10-05", product: P0, time: "11:00", n: 13 });
    assert.ok(r.ok, r.why);
    assert.deepStrictEqual([r.from, r.to], [10, 13]);
    assert.strictEqual(await capAt("11:00"), 13);
    assert.strictEqual((await sync.read()).cap, null, "창이 닫힘");

    // 14:00 은 확정 4장 → [잔여예약 6] 을 눌러 수량 7 (잔여 3)
    r = await sync.setCap({ day: "2026-10-05", product: P0, time: "14:00", n: 7 });
    assert.ok(r.ok, r.why);
    assert.strictEqual(await capAt("14:00"), 7);
    const s14 = (await sync.read()).slots.find((x) => x.time === "14:00" && x.product === P0);
    assert.strictEqual(s14.avail, 3);

    r = await sync.setCap({ day: "2026-10-05", product: P0, time: "14:00", n: 3 });
    assert.ok(!r.ok, "예약 4장보다 적게는 못 줄임");
    assert.strictEqual(await capAt("14:00"), 7);

    // 같으면 누르지 않음
    r = await sync.setCap({ day: "2026-10-05", product: P0, time: "11:00", n: 13 });
    assert.ok(r.ok && r.same);

    // 다른 날짜도 (날짜 이동 후)
    r = await sync.setCap({ day: "2026-10-06", product: P0, time: "10:30", n: 12 });
    assert.ok(r.ok, r.why);
    assert.strictEqual((await sync.read()).date, "2026-10-06");
    assert.strictEqual(await capAt("10:30"), 12);
  } finally {
    await browser.close();
  }
});
