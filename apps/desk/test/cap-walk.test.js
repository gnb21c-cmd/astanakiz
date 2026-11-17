/* 현장 가능 · 현장 1명 = 네이버 1장 (사장님 11/17)
   - 현장 가능 = 상한 − (나간 열쇠 + 이미 팔린 예약 중 그때 안에 있을 손님) — 뒤 타임 '안 팔린' 네이버 수량은 세지 않음
     (예전: 다 팔린다고 세서 예약이 느린 · 인기 없는 시간에 자리가 비어도 현장을 못 팔았음)
   - 현장을 팔면 그 손님이 머무는 동안 네이버 몫(네 타임 합 40)을 현장 수만큼 낮춤 → 넘는 만큼 안 팔린 네이버 수량을 한 장씩 (3 → 2 → 1순위 · 예약이 적은 · 뒤 타임부터)
     예약이 느려 몫이 남는 시간은 안 줄임 · 줄일 곳이 없으면(뒤가 모두 매진) 상한까지는 현장 (6년 운영: 40명이 들어와도 2~3자리가 남음) · 반납하면 돌려놓음
   - 현장을 팔면 10분을 기다리지 않고 다음 분에 조절
   가짜 네이버(mock/naver.html 10/5 — 14:00 확정 4 · 칸마다 10)에 예약을 더 넣어 실제 연동 코드로 · 지금 12:25 · 상한 42 · 네 타임 합 40 */
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

/** 가짜 네이버 10/5 에 예약을 더 넣고(시각 → 장수) 데스크를 연결 · 12:25 · 상한 42 */
async function setup(browser, extra) {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const naverPage = await ctx.newPage();
  await naverPage.goto(NAVER);
  await naverPage.evaluate(() => localStorage.clear());
  await naverPage.goto(NAVER);
  await naverPage.evaluate((extra) => {
    let i = 0;
    for (const [time, n] of Object.entries(extra)) for (let k = 0; k < n; k++) db["2026-10-05"].push({ no: String(1379000000 + i), name: `채움${++i}`, phone: `010-7300-${String(1000 + i)}`, time, product: 0, qty: 1, status: "확정", done: 1, cancel: 0 }); // eslint-disable-line no-undef
    save(); // eslint-disable-line no-undef
  }, extra);
  await naverPage.goto(NAVER);
  const naver = new NaverSync((code) => naverPage.evaluate(code), { urls: { list: NAVER + "?view=list", calendar: NAVER + "?view=calendar" } });
  const desk = await ctx.newPage();
  await desk.clock.install({ time: new Date("2026-10-05T12:25:00") });
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
  const pj = () => T(() => { const p = window.__deskTest.projection(); return { all: p.all, why: p.why }; });
  const plan = () => T(() => { const p = window.__deskTest.capPlan(); return Object.fromEntries(p.plan.filter((c) => c.to !== c.from || c.trim).map((c) => [c.t, [c.from, c.to, c.why]])); });
  const capAt = async (time) => { const s = (await naver.read()).slots.find((x) => x.time === time && x.product === P0); return s.avail + s.conf + s.done + s.apply; };
  const walk = (keys) => T((ks) => { const w = window.__deskTest.walkin("01012340000", ks, 745, 750); window.__deskTest.setNow(745); return w.id; }, keys);
  return { desk, naver, T, pj, plan, capAt, walk, errs };
}
const launch = () => chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});

test("예약이 느린 시간 (3-1 · 3-2): 안 팔린 네이버 수량은 세지 않음 → 실제로 빈 만큼 현장 가능 · 현장을 팔아도 네이버 몫이 남으면 안 줄임", async () => {
  const browser = await launch();
  try {
    // 12:30 · 13:00 · 13:30 예약 0 · 14:00 예약 4 (가짜 네이버 그대로) — 예전엔 안 팔린 36장을 다 팔린다고 세서 현장 가능 2
    const { T, pj, plan, walk, errs } = await setup(browser, {});
    let p = await pj();
    assert.strictEqual(p.all, 38, JSON.stringify(p));
    assert.match(p.why, /상한 42 − 열쇠 0 − 안 온 예약 4 = 현장 38/);
    assert.deepStrictEqual(await plan(), {}, "현장이 없으면 바꿀 것 없음");
    // 현장 3명: 그 시각 네이버 몫 = 40 − 3 = 37 · 계획한 네이버(14:00 에 예약 4 + 안 팔린 36 = 40)가 넘음 → 3장 줄임 (모두 1순위 · 예약 0 인 타임 중 뒤 타임 13:30)
    await walk([21, 22, 23]);
    assert.deepStrictEqual(await plan(), { 810: [10, 7, "현장 손님이 있는 동안 3장 줄임 (현장 1명 = 네이버 1장)"] });
    p = await pj();
    assert.strictEqual(p.all, 35, "현장 가능 = 42 − 열쇠 3 − 안 온 예약 4");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("예약이 잘 차는 시간 (4 · 5): 현장 1명마다 그 손님이 있는 동안 네이버 1장 — 첫 명부터 (예전엔 상한 42 − 40 = 2명까지 안 줄임) · 가장 인기 없는 타임에서 · 반납하면 돌려놓음", async () => {
  const browser = await launch();
  try {
    // 12:30 9 · 13:00 10 · 13:30 7 · 14:00 4 (곧 다가오는 12:30 은 매진 아님 — 매진이면 '한 장 더'가 따로 돎) → 안 팔린 12:30 1 · 13:30 3 · 14:00 6
    const { T, pj, plan, walk, capAt, desk, errs } = await setup(browser, { "12:30": 9, "13:00": 10, "13:30": 7 });
    let p = await pj();
    assert.strictEqual(p.all, 12, "42 − 이미 팔린 30 (14:00 무렵 안에 있을 예약) = 12 — " + p.why);
    assert.deepStrictEqual(await plan(), {});
    // 현장 1명 → 14:00 (예약 4 — 가장 적음) 한 장
    const wid = await walk([21]);
    assert.deepStrictEqual(await plan(), { 840: [10, 9, "현장 손님이 있는 동안 1장 줄임 (현장 1명 = 네이버 1장)"] }, "첫 명부터");
    // 현장 2명 더 → 14:00 이 계속 예약이 적어 거기서 (10 → 7)
    const wid2 = await walk([22, 23]);
    assert.deepStrictEqual(await plan(), { 840: [10, 7, "현장 손님이 있는 동안 3장 줄임 (현장 1명 = 네이버 1장)"] });
    // 네이버에 넣기 (현장을 판 뒤 10분을 기다리지 않고 다음 분에)
    await T(() => { window.__deskTest.capWalkSold(); window.__deskTest.setNow(747); window.__deskTest.capTick(); });
    await desk.waitForFunction(() => !window.__deskTest.capMoving() && /14:00/.test(JSON.stringify(window.__deskTest.capLog)), null, { timeout: 60000 });
    assert.strictEqual(await capAt("14:00"), 7, "네이버 14:00 판매 수량 7");
    assert.strictEqual(await T(() => window.__deskTest.capWalkDue()), false);
    // 14:00 이 시작하기 전에 현장 3명 모두 반납 → 다음 조절 때 14:00 다시 10
    await T(([a, b]) => { window.__deskTest.returnKeys(a, [21]); window.__deskTest.returnKeys(b, [22, 23]); window.__deskTest.setNow(780); }, [wid, wid2]);
    assert.deepStrictEqual(await plan(), { 840: [7, 10, ""] }, "자리가 나 10 으로");
    await T(() => window.__deskTest.capRun(true));
    await desk.waitForFunction(() => window.__deskTest.capLog.filter((x) => x.t === "14:00").length >= 2, null, { timeout: 60000 });
    assert.strictEqual(await capAt("14:00"), 10, "네이버 14:00 다시 10");
    p = await pj();
    assert.ok(p.all >= 12, JSON.stringify(p));
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("뒤 타임이 모두 매진 (줄일 곳 없음): 상한까지는 현장 (40명이 들어와도 2~3자리가 남음 — 6년 운영) · 그 위는 판매 안 함 · 네이버는 그대로", async () => {
  const browser = await launch();
  try {
    // 12:30 · 13:00 · 13:30 · 14:00 모두 10 (네 타임 합 40)
    const { pj, plan, walk, errs } = await setup(browser, { "12:30": 10, "13:00": 10, "13:30": 10, "14:00": 6 });
    let p = await pj();
    assert.strictEqual(p.all, 2, "42 − 40 = 2 — " + p.why);
    await walk([21, 22]);
    assert.deepStrictEqual(await plan(), {}, "줄일 곳이 없어 네이버 그대로");
    p = await pj();
    assert.strictEqual(p.all, 0, "상한 42 다 참 → 판매 안 함");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
