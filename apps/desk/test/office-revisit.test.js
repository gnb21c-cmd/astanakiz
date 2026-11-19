/* 사무실 PC 재방문 정보 (사장님 11/19 — "재방문 정보도 보여야지 · 가려야 하는 내용이 아니야")
   예전(11/06 ~ 11/19): 사무실 PC 는 재방문 장부가 없어 이벤트 기간 카드마다 '이용완료 횟수 확인 중'만 보였음
   지금: 현장 POS 가 장부를 연결 코드로 잠가 사무실로 보냄(desk-sync.test.js) → 사무실도 같은 장부로 같게 판정
   여기서는 체험판 '사무실 PC 화면 미리 보기' — 같은 장부 · 같은 예약이면 현장 POS 와 사무실 카드가 같음 */
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
// 장부 줄 (가짜 손님 · 시작일 10/26)
const line = (k, name, day, n, st, due, no) => JSON.stringify({ k, name, phone: k, n, base: 3, no, at: `${day} 11:00`, day, st, due });
const LEDGER = [
  line("01011110001", "가손님", "2026-11-02", 4, "안내", "2026-11-22", "a1"), // 20일 안 → 오늘 오면 성공
  line("01011110002", "나손님", "2026-10-20", 4, "안내", "2026-11-09", "b1"), // 기한 지남 → 다시 시작
].join("\n") + "\n";

test("사무실 PC 카드에도 재방문 정보 (11/19): 현장 POS 와 같게 '이벤트 도전 성공 · 시작 · 첫 방문' — 예전엔 '이용완료 횟수 확인 중'", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await page.addInitScript((led) => {
      window.__today = "2026-11-15";
      if (!localStorage.getItem("astanakiz-visitlog-2026-10-26")) {
        localStorage.setItem("astanakiz-visitevent", JSON.stringify({ ver: 2, on: true, from: "2026-10-26", to: "2026-11-30", days: 20, gift: "수제돈까스" }));
        localStorage.setItem("astanakiz-visitlog-2026-10-26", led);
      }
    }, LEDGER);
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    await page.waitForFunction(() => !!window.__deskTest);
    await page.evaluate(() => {
      const T = window.__deskTest;
      T.addBooking(T.today(), "14:00", "가손님", "01011110001", 1, { prevDone: 4 });
      T.addBooking(T.today(), "14:00", "나손님", "01011110002", 2, { prevDone: 4 });
      T.addBooking(T.today(), "14:00", "새손님", "01011110009", 1, { prevDone: 0 });
      T.setNow(830);
    });
    const cards = async () => { await page.click('.slot[data-s="840"]'); return page.$$eval(".res", (e) => Object.fromEntries(e.map((x) => [x.querySelector(".name").textContent.replace(/\s+|첫방문/g, ""), x.querySelector(".visits").textContent.replace(/\s+/g, " ").trim()]))); };
    const pos = await cards();
    assert.deepStrictEqual({ 가: pos["가손님"], 나: pos["나손님"], 새: pos["새손님"] }, { 가: "이벤트 도전 성공", 나: "이벤트 도전 시작", 새: "첫 방문 · 이벤트 도전 시작" }, "현장 POS");
    // 사무실 PC 미리 보기 (같은 장부)
    await page.evaluate(() => window.__deskTest.sync.demo(true));
    assert.strictEqual(await page.evaluate(() => window.__deskTest.sync.office()), true);
    const off = await cards();
    assert.deepStrictEqual({ 가: off["가손님"], 나: off["나손님"], 새: off["새손님"] }, { 가: "이벤트 도전 성공", 나: "이벤트 도전 시작", 새: "첫 방문 · 이벤트 도전 시작" }, "사무실 PC 도 같게 (예전: 모두 '이용완료 횟수 확인 중')");
    assert.ok(!Object.values(off).some((t) => /이용완료 횟수 확인 중/.test(t)));
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
