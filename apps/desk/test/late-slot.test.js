/* 기본 칸(10:00 ~ 19:30) 뒤 회차 (사장님 11/12 — 이벤트로 날마다 무제한 상품에 21:00 회차를 만듦)
   - 시간표: 네이버 칸대로 21:00 줄이 생김 (원래 그랬음)
   - 켤 때 고르는 칸이 19:30 에 머물러 21:00 손님 카드가 안 보였음 → 오늘 네이버를 읽은 뒤 19:30 이 지났으면 지금 다음 회차(21:00)로 · 근무자가 시간 칸을 누르면 그대로
   - 네이버 자동 불러오기는 19:20 이 끝이었음 → 오늘 더 늦은 회차가 있으면 그 회차 10분 전까지 (21:00 이면 19:50 · 20:20 · 20:50)
   - 21:00 입장은 '18:00 부터 무제한' (휴일 시간제여도) */
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

async function open(browser, at, extra = "?night21=1") {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const np = await ctx.newPage();
  await np.goto(NAVER + extra);
  await np.evaluate(() => localStorage.clear());
  await np.goto(NAVER + extra);
  const q = extra.replace(/^\?/, "&");
  const naver = new NaverSync((code) => np.evaluate(code), { urls: { list: NAVER + "?view=list" + q, calendar: NAVER + "?view=calendar&compact=1" + q } }); // compact = 칸에 오전 · 오후 없음 ('9:00' = 21:00)
  const desk = await ctx.newPage();
  await desk.clock.install({ time: new Date(`2026-10-05T${at}:00`) });
  const loads = [];
  let qq = Promise.resolve();
  const serial = (fn) => (qq = qq.then(fn, fn));
  await desk.exposeFunction("__naverLoad", (day, only) => { loads.push(only || "all"); return serial(() => naver.loadDay(day, { only })); });
  await desk.exposeFunction("__naverComplete", (b) => serial(() => naver.complete(b)));
  await desk.addInitScript(() => {
    window.desk = {
      naver: { load: (d, o) => window.__naverLoad(d, o), complete: (b) => window.__naverComplete(b) },
      state: { load: (day) => localStorage.getItem("test-state-" + day), save: (day, json) => localStorage.setItem("test-state-" + day, json) },
    };
  });
  const errs = [];
  desk.on("pageerror", (e) => errs.push(e.message));
  await desk.goto(DESK);
  await desk.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 60000 });
  return { desk, errs, loads };
}
const row = (desk, s) => desk.$$eval(`.slot[data-s="${s}"] .c`, (e) => e.map((x) => x.textContent.trim()));
const sel = (desk) => desk.$eval(".slot.on", (x) => Number(x.dataset.s));

test("21:00 회차: 시간표 줄 · 켜면 21:00 손님 카드가 바로 · 20:50 까지 자동 불러오기 · 입장은 무제한 · 시간 칸을 누르면 그대로", async () => {
  const browser = await launch();
  try {
    const { desk, errs, loads } = await open(browser, "20:40");
    assert.deepStrictEqual(await row(desk, 1260), ["0", "3", "7"], "21:00 줄 (확정 3 · 잔여 7)");
    assert.strictEqual(await sel(desk), 1260, "19:30 이 지났으니 21:00 칸");
    assert.deepStrictEqual([(await desk.textContent("#res-title")).trim(), (await desk.textContent("#res-sub")).trim()], ["21:00 예약자", "2명 · 수량 3"]);
    assert.deepStrictEqual(await desk.$$eval(".res .name", (e) => e.map((x) => x.textContent.replace(/\s+|첫방문/g, ""))), ["밤손님가", "밤손님나"]);
    assert.match(await desk.textContent("#refresh-at"), /다음 20:50/, "19:20 뒤에도 자동 불러오기");
    if (await desk.isVisible("#golden")) await desk.click("[data-act=goldenOk]");
    // 입장 (열쇠 2개) → 무제한
    await desk.click('.res:has-text("밤손님가")');
    for (let i = 0; i < 2; i++) await desk.click(".kpick button:not([disabled]):not(.on) >> nth=0");
    await desk.click("#enter-done");
    await desk.waitForFunction(() => window.__deskTest.holders().some((h) => h.name === "밤손님가" && h.keys.length === 2));
    assert.strictEqual(await desk.evaluate(() => window.__deskTest.bookMinutes(window.__deskTest.holders().find((h) => h.name === "밤손님가").id)), null, "21:00 입장 = 무제한");
    if (await desk.isVisible("#golden")) await desk.click("[data-act=goldenOk]");
    // 근무자가 19:30 칸을 누름 → 자동 불러오기 뒤에도 그대로
    await desk.click('.slot[data-s="1170"]');
    loads.length = 0;
    await desk.clock.runFor(11 * 60000); // 20:51
    await desk.waitForFunction(() => /20:5\d 불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 30000 });
    assert.ok(loads.includes("all"), `20:50 자동 불러오기 ${loads}`);
    assert.strictEqual(await sel(desk), 1170, "근무자가 고른 칸 그대로");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("늦은 회차: 낮에는 고르는 칸 그대로 · 늦은 회차가 없는 날은 자동 불러오기 19:20 끝 (예전 그대로)", async () => {
  const browser = await launch();
  try {
    let { desk, errs } = await open(browser, "13:56");
    assert.strictEqual(await sel(desk), 870, "낮에는 예전 그대로 (13:56 → 14:30) — 21:00 으로 안 감");
    assert.deepStrictEqual(await row(desk, 1260), ["0", "3", "7"]);
    assert.deepStrictEqual(errs, []);
    ({ desk, errs } = await open(browser, "19:10", ""));
    assert.match(await desk.textContent("#refresh-at"), /다음 19:20/);
    assert.strictEqual(await desk.$('.slot[data-s="1260"]'), null, "21:00 회차가 없는 날은 줄도 없음");
    await desk.clock.runFor(11 * 60000); // 19:21
    await desk.waitForFunction(() => /19:2\d 불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 30000 });
    assert.doesNotMatch(await desk.textContent("#refresh-at"), /다음/, "19:20 이 마지막");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
