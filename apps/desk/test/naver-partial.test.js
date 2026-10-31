/* 네이버를 덜 읽은 채로 숫자를 지우는 문제 (사장님 10/31 — 보고 앱 키즈 실시간이 아침 칸 0 · 완료 35 처럼 일부만 보이다가 돌아옴)
   - 네이버 시간 칸이 덜 뜬 화면이면 불러오기 실패 → 데스크 시간표 숫자 · 손님 목록 · 폰 실시간 현황 숫자는 앞 그대로 · 20초 뒤 다시
   - 오늘 처음 제대로 불러오기 전(켜자마자)에는 폰 실시간 현황에 네이버 숫자를 보내지 않음 (naver.ready = false · 빈 칸) */
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

test("네이버를 덜 읽으면 앞 숫자 · 손님 목록 그대로 · 20초 뒤 다시 · 처음 제대로 불러오기 전에는 폰 현황에 네이버 숫자 없음", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const naverPage = await ctx.newPage();
    await naverPage.goto(NAVER);
    await naverPage.evaluate(() => localStorage.clear());
    await naverPage.goto(NAVER);
    const naver = new NaverSync((code) => naverPage.evaluate(code), { urls: { list: NAVER + "?view=list", calendar: NAVER + "?view=calendar" }, today: () => "2026-10-05" });
    const desk = await ctx.newPage();
    await desk.clock.install({ time: new Date("2026-10-05T13:56:00") });
    let q = Promise.resolve();
    const serial = (fn) => (q = q.then(fn, fn));
    let release;
    const gate = new Promise((r) => (release = r));
    const loads = [];
    await desk.exposeFunction("__naverLoad", (day, only) => serial(async () => { await gate; const r = await naver.loadDay(day, { only }); loads.push(r.ok); return r; }));
    await desk.addInitScript(() => {
      window.desk = {
        naver: { load: (d, o) => window.__naverLoad(d, o), complete: async () => ({ ok: true }) },
        state: { load: () => null, save: () => {} },
      };
    });
    const errs = [];
    desk.on("pageerror", (e) => errs.push(e.message));
    await desk.goto(DESK);
    const snap = () => desk.evaluate(() => { const s = window.__deskTest.liveSnap(); return { ready: s.naver.ready, done: s.naver.done, conf: s.naver.conf, slots: s.naver.slots.length, people: s.people.naver }; });

    // ③ 처음 불러오기 전: 네이버 숫자 없음
    assert.deepStrictEqual(await snap(), { ready: false, done: 0, conf: 0, slots: 0, people: 0 });
    release();
    await desk.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 60000 });
    const s0 = await snap();
    assert.strictEqual(s0.ready, true);
    assert.ok(s0.slots >= 10 && s0.conf > 0, JSON.stringify(s0));
    const sum = () => desk.textContent("#slot-sum");
    const names = () => desk.$$eval("#res .res .name", (e) => e.map((x) => x.firstChild.textContent.trim()));
    await desk.click('.slot[data-s="840"]');
    await desk.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 60000 });
    const sum0 = await sum(), names0 = await names();
    assert.ok(names0.length >= 3, names0.join());

    // ①② 네이버 화면이 덜 뜸 (아침 6줄만 · 로딩 중) → 새로고침해도 앞 숫자 · 명단 그대로
    await naverPage.evaluate(() => localStorage.setItem("mockNaverLag", JSON.stringify({ n: 1, ms: 1e9, keep: 6 })));
    await naverPage.reload();
    const n0 = loads.length;
    await desk.click("[data-act=refresh]");
    for (let i = 0; i < 200 && loads.length <= n0; i++) await new Promise((r) => setTimeout(r, 100));
    assert.strictEqual(loads[loads.length - 1], false, "덜 뜬 화면 = 실패");
    await desk.waitForFunction(() => /덜 뜸/.test(document.getElementById("refresh-at").textContent), null, { timeout: 10000 });
    assert.match(await desk.textContent("#toast"), /덜 뜸.*20초 뒤 다시/);
    assert.strictEqual(await sum(), sum0, "시간표 합 그대로");
    assert.deepStrictEqual(await names(), names0, "명단 그대로");
    assert.deepStrictEqual(await snap(), s0, "폰 현황 숫자 그대로");

    // 20초 뒤 다시 → 이번엔 다 뜸 → 숫자 그대로 맞음
    await naverPage.evaluate(() => localStorage.removeItem("mockNaverLag"));
    await naverPage.reload();
    const n1 = loads.length;
    await desk.clock.runFor(21000);
    for (let i = 0; i < 300 && loads.length <= n1; i++) await new Promise((r) => setTimeout(r, 100));
    assert.strictEqual(loads[loads.length - 1], true, "다시 읽어 성공");
    await desk.waitForFunction(() => !/덜 뜸/.test(document.getElementById("refresh-at").textContent), null, { timeout: 10000 });
    assert.strictEqual(await sum(), sum0);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
