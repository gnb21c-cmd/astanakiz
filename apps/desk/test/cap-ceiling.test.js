/* 상한 = 네이버 + 현장 열쇠 (사장님 11/07): 수량 자동조절이 현장에서 내준 열쇠까지 넣어 '안에 있을 손님'이 운영 설정의 상한을 넘지 않게
   안에 있을 손님 = 지금 나간 열쇠(현장 · 서비스 키 포함, 반납 시각까지) + 아직 안 온 예약 + 네이버 남은 수량(다 팔린다고)
   - 현장 가능 = 상한 − 그 손님이 있을 1시간 50분 동안 가장 많을 때 (계산된 수 그대로 · 0 이면 판매 안 함)
     11/17 부터: 뒤 타임 '안 팔린' 네이버 수량은 세지 않음 · 현장 1명 = 그 손님이 있는 동안 네이버 1장 (첫 명부터 · test/cap-walk.test.js)
   - 넘으면 아직 안 팔린 네이버 수량을 줄임 (3 → 2 → 1순위 · 예약이 적은 · 뒤 타임부터 · 예약 밑으로는 안 줄임) · 현장 열쇠가 반납되면 돌려놓음
   가짜 네이버(mock/naver.html 10/5 — 14:00 확정 4 · 15:30 · 16:00 · 18:00 각 1 · 칸마다 10)를 실제 연동 코드로 */
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
const P0 = "평일 무제한 / 휴일 1시간 50분 입장권";

test("상한 42: 현장 열쇠 없음 → 현장 가능 38 (안 팔린 수량은 안 셈 · 11/17) · 현장 3개 → 13:30 네이버 10 → 7 (현장 1명 = 네이버 1장) · 반납 → 10 으로 돌려놓음", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const naverPage = await ctx.newPage();
    await naverPage.goto(NAVER);
    await naverPage.evaluate(() => localStorage.clear());
    await naverPage.goto(NAVER);
    const naver = new NaverSync((code) => naverPage.evaluate(code), { urls: { list: NAVER + "?view=list", calendar: NAVER + "?view=calendar" } });
    const desk = await ctx.newPage();
    await desk.clock.install({ time: new Date("2026-10-05T12:25:00") }); // 10/5 대체공휴일 = 시간제 · 12:30 타임 시작 전
    let q = Promise.resolve();
    const serial = (fn) => (q = q.then(fn, fn));
    await desk.exposeFunction("__naverLoad", (day, only) => serial(() => naver.loadDay(day, { only })));
    await desk.exposeFunction("__naverSetCap", (c) => serial(() => naver.setCap(c)));
    await desk.addInitScript(() => {
      window.desk = {
        naver: { load: (d, o) => window.__naverLoad(d, o), complete: () => Promise.resolve({ ok: true }), setCap: (c) => window.__naverSetCap(c) },
        state: { load: (day) => localStorage.getItem("test-state-" + day), save: (day, json) => localStorage.setItem("test-state-" + day, json) },
      };
    });
    const errs = [];
    desk.on("pageerror", (e) => errs.push(e.message));
    await desk.goto(DESK);
    await desk.click("[data-act=refresh]");
    await desk.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 30000 });
    await desk.evaluate(() => { Object.assign(window.__deskTest.RULES.capAuto, { on: true, target: 40, ceiling: 42 }); window.__deskTest.setNow(745); });
    const T = (fn, a) => desk.evaluate(fn, a);
    const capAt = async (time) => { const s = (await naver.read()).slots.find((x) => x.time === time && x.product === P0); return s.avail + s.conf + s.done + s.apply; };

    // 1) 현장 열쇠 없음: 14:00 무렵 안에 있을 손님 = 이미 팔린 14:00 예약 4 (안 팔린 36장은 안 셈 — 현장을 팔면 그만큼 네이버를 줄임 · 11/17)
    assert.strictEqual(await T(() => window.__deskTest.projection().all), 38, "현장 가능 = 상한 42 − 안 온 예약 4");
    assert.match(await desk.textContent("#key-stat"), /현장 가능 38/);
    assert.match(await desk.getAttribute("#key-stat", "title"), /상한 42 − 열쇠 0 − 안 온 예약 4 = 현장 38/);
    let p = await T(() => { const p = window.__deskTest.capPlan(); return { trims: p.plan.filter((c) => c.trim > 0).map((c) => c.t), peak: p.peak.n }; });
    assert.deepStrictEqual(p, { trims: [], peak: 40 });
    // 상한을 바꾸면 현장 가능도 (설정한 숫자 그대로 대입)
    assert.deepStrictEqual(await T(() => { const A = window.__deskTest.RULES.capAuto, P = window.__deskTest.projection, out = []; for (const c of [40, 41, 45, 60]) { A.ceiling = c; out.push(P().all); } A.ceiling = 42; return out; }), [36, 37, 41, 41], "상한 40 → 0 · 41 → 1 · 45 → 5 · 열쇠 45개를 넘지 않음");
    // 자동조절을 안 하는 날은 예전처럼 열쇠 45개 기준 (네이버 남은 수량도 안 셈)
    assert.ok(await T(() => { const A = window.__deskTest.RULES.capAuto; A.on = false; const v = window.__deskTest.projection().all; A.on = true; return v; }) > 5);

    // 2) 현장 3개 (12:30 타임 · 14:20 반납): 그 손님이 있는 동안 네이버 몫 40 − 3 = 37 → 13:30 을 세 장 줄임 (모두 1순위 · 예약 0 인 타임 중 뒤 타임)
    const wid = await T(() => { const w = window.__deskTest.walkin("01012340000", [21, 22, 23], 745, 750); window.__deskTest.setNow(745); return w.id; });
    assert.strictEqual(await T(() => window.__deskTest.projection().all), 35, "현장 가능 = 42 − 열쇠 3 − 안 온 예약 4");
    p = await T(() => { const p = window.__deskTest.capPlan(); return { trims: p.plan.filter((c) => c.trim > 0).map((c) => [c.t, c.from, c.to, c.why]), peak: p.peak.n }; });
    assert.deepStrictEqual(p.trims.map((x) => x.slice(0, 3)), [[810, 10, 7]], "13:30 10 → 7");
    assert.match(p.trims[0][3], /현장 손님이 있는 동안 3장 줄임 \(현장 1명 = 네이버 1장\)/);
    assert.strictEqual(p.peak, 40, "줄인 뒤 가장 많을 때 40 (네이버 37 + 현장 3)");
    await T(() => window.__deskTest.capRun(true));
    await desk.waitForFunction(() => !window.__deskTest.capMoving() && /13:30/.test(JSON.stringify(window.__deskTest.capLog)), null, { timeout: 60000 });
    assert.strictEqual(await capAt("13:30"), 7, "네이버 13:30 판매 수량 7");
    assert.deepStrictEqual(await T(() => window.__deskTest.capState().trims), { 810: 3 }, "줄인 수를 기억");

    // 3) 현장 열쇠 반납 → 다음 조절 때 13:30 을 10 으로 돌려놓음
    await T((id) => window.__deskTest.returnKeys(id, [21, 22, 23]), wid);
    p = await T(() => { const p = window.__deskTest.capPlan(); return p.plan.filter((c) => c.t === 810).map((c) => [c.from, c.to, c.trim]); });
    assert.deepStrictEqual(p, [[7, 10, 0]], "자리가 나 10 으로");
    await T(() => window.__deskTest.capRun(true));
    await desk.waitForFunction(() => window.__deskTest.capLog.filter((x) => x.t === "13:30").length >= 2, null, { timeout: 60000 });
    assert.strictEqual(await capAt("13:30"), 10, "네이버 13:30 다시 10");
    assert.deepStrictEqual(await T(() => window.__deskTest.capState().trims), {});
    assert.strictEqual(await T(() => window.__deskTest.projection().all), 38, "현장 가능 다시 38");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
