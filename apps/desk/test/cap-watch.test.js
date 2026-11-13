/* 수량 관찰 기록 (사장님 11/13 — 평일에 자동조절을 끄고 사장님이 직접 네이버 수량을 조절하는 날을 배우려고)
   - 5분마다(09:50 ~ 그날 마지막 회차) 네이버 칸 숫자만 읽음(카드는 안 엶): 판매 수량 · 확정 · 완료 · 잔여 + 앞 기록과 달라진 수량(10→12)
   - 그때 데스크: 안에 있는 열쇠 · 빈 열쇠 · 현장 판매 누적 · 현장 가능 · 수량 자동조절 켜짐/꺼짐 → 현장 POS 바탕화면 CSV (손님 정보 없음)
   - 운영 설정 → 네이버 설정에서 끔 · 사무실 PC 는 기록 안 함 */
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

test("readCells: 칸 숫자만 (판매 수량 · 확정 · 완료) — 카드는 안 엶", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(NAVER);
    await page.evaluate(() => localStorage.clear());
    await page.goto(NAVER);
    const naver = new NaverSync((code) => page.evaluate(code), { urls: { list: NAVER + "?view=list", calendar: NAVER + "?view=calendar" }, today: () => "2026-10-05" });
    const r = await naver.readCells("2026-10-05");
    assert.strictEqual(r.ok, true);
    const s14 = r.slots.find((x) => x.time === "14:00" && /1시간 50분/.test(x.product));
    assert.deepStrictEqual([s14.cap, s14.conf, s14.done], [10, 4, 0], "14:00 확정 4 (취소 손님 빼고)");
    assert.ok(r.slots.every((x) => !("cards" in x) && !("name" in x)), "손님 정보 없음");
    assert.strictEqual((await naver.read()).cards.length, 0, "카드 목록을 열지 않음");
  } finally {
    await browser.close();
  }
});

test("수량 관찰 기록: 5분마다 칸 숫자 · 바뀐 수량(10→12) · 열쇠 현황 · 끄면 멈춤", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await page.clock.install({ time: new Date("2026-11-13T13:58:30") });
    await page.addInitScript(() => {
      window.__recs = [];
      window.__caps = { "14:00": 10, "14:30": 10 };
      const cfg = { build: "2.23" };
      window.desk = {
        naver: {
          load: async (day) => ({ ok: true, day, slots: [], bookings: [] }),
          complete: async () => ({ ok: true }),
          cells: async (day) => ({ ok: true, day, slots: Object.entries(window.__caps).map(([time, cap]) => ({ time, product: "평일 무제한 / 휴일 1시간 50분 입장권", cap, conf: 3, done: 2 })) }),
        },
        state: { load: () => null, save: () => {} },
        config: { get: async () => cfg, set: async (p) => { Object.assign(cfg, p); return { ok: true }; } },
        capWatch: { add: async (rec) => { window.__recs.push(JSON.parse(JSON.stringify(rec))); return { ok: true }; } },
      };
    });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    await page.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 15000 });
    const recs = () => page.evaluate(() => window.__recs);
    await page.clock.runFor(95000); // 14:00
    await page.waitForFunction(() => window.__recs.length === 1);
    let r = (await recs())[0];
    assert.deepStrictEqual({ day: r.day, at: r.at }, { day: "2026-11-13", at: "14:00" });
    assert.deepStrictEqual(r.rows.map((x) => [x.t, x.product, x.cap, x.conf, x.done, x.left, x.chg]), [["14:00", "평일 무제한", 10, 3, 2, 5, ""], ["14:30", "평일 무제한", 10, 3, 2, 5, ""]]);
    assert.deepStrictEqual(Object.keys(r.desk).sort(), ["auto", "free", "inside", "walk", "walkable"]);
    assert.strictEqual(r.desk.auto, false, "비수기 평일 = 자동조절 꺼짐");
    // 사장님이 네이버에서 14:00 을 12 로 → 다음 5분 기록에 '10→12'
    await page.evaluate(() => { window.__caps["14:00"] = 12; });
    await page.clock.runFor(60000);
    assert.strictEqual((await recs()).length, 1, "5분이 안 됐으면 기다림");
    await page.clock.runFor(4 * 60000);
    await page.waitForFunction(() => window.__recs.length === 2);
    r = (await recs())[1];
    assert.strictEqual(r.at, "14:05");
    assert.deepStrictEqual(r.rows.map((x) => [x.t, x.cap, x.chg]), [["14:00", 12, "10→12"], ["14:30", 10, ""]]);
    assert.ok(!/010|이름|phone|name/.test(JSON.stringify(await recs())), "손님 정보 없음");
    // 운영 설정 → 네이버 설정: 상태 · 끄기
    await page.dblclick("#now");
    await page.click("[data-t=naver]");
    assert.match(await page.textContent("#cw-text"), /오늘 2번 · 마지막 14:05 바뀐 수량 14:00 10→12/);
    await page.click("[data-act=cwToggle]");
    assert.match(await page.textContent("#toast"), /수량 관찰 기록 끔/);
    await page.click("#sheet [data-act=close]");
    await page.clock.runFor(6 * 60000);
    assert.strictEqual((await recs()).length, 2, "끄면 기록 안 함");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
