/* 네이버 판매 수량 자동 조절 시험
   1) 계산(planCaps): 4타임(2시간) 합이 목표를 넘지 않게 · 한 타임 최대 · 예약보다 적게는 안 함 · 인기 타임에 더
   2) 데스크 → 가짜 네이버 예약현황: [지금 한 번 조절] 하면 네이버 칸의 회차당 수량이 실제로 바뀜 */
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

test("계산: 4타임 목표 · 한 타임 최대 · 예약보다 적게 안 함 · 인기 타임에 더", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(DESK);
    const run = (slots, adj, o) => page.evaluate(([s, a, x]) => window.__deskTest.planCaps(s, a, x), [slots, adj, o]);
    const S = (t, used, walk, started, cap = 10) => ({ t, used, mainUsed: used, walk, started, cap, product: "P" });
    const O = { target: 42, max: 13, walkAvg: 0 };
    const sumWin = (slots, plan, st) => { let v = 0; for (let j = Math.max(0, st); j < Math.min(slots.length, st + 4); j++) { const c = plan.find((p) => p.t === slots[j].t); v += c ? c.to + slots[j].walk : slots[j].used + slots[j].walk; } return v; };

    // 아침 (아직 아무도 없음): 앞 3타임은 최대 13까지, 4타임 합은 42 이하
    let slots = [600, 630, 660, 690, 720].map((t) => S(t, 0, 0, false));
    let plan = await run(slots, [600, 630, 660], O);
    assert.deepStrictEqual(plan.map((p) => p.to), [13, 13, 13]);
    for (let st = -3; st < slots.length; st++) assert.ok(sumWin(slots, plan, st) <= 42);

    // 이미 손님이 많이 들어온 앞 타임 → 뒤 타임은 남은 자리만큼만
    slots = [S(600, 12, 2, true), S(630, 10, 1, true), S(660, 6, 0, false), S(690, 1, 0, false), S(720, 0, 0, false)];
    plan = await run(slots, [660, 690, 720], O);
    for (let st = -3; st < slots.length; st++) assert.ok(sumWin(slots, plan, st) <= 42, `묶음 ${st} 넘침`);
    assert.strictEqual(sumWin(slots, plan, 0), 42, "10:00~11:30 묶음은 42에 딱 맞춤");
    assert.ok(plan.find((p) => p.t === 660).to >= 6 && plan.find((p) => p.t === 690).to >= 1, "예약보다 적게 안 함");

    // 인기(예약 8) vs 비인기(예약 1): 남은 자리가 적을 때 인기 타임에 더
    slots = [S(600, 12, 0, true), S(630, 12, 0, true), S(660, 8, 0, false), S(690, 1, 0, false)]; // 남은 자리 9
    plan = await run(slots, [660, 690], O);
    const pop = plan.find((p) => p.t === 660), un = plan.find((p) => p.t === 690);
    assert.ok(pop.open > un.open, `인기 ${pop.open} > 비인기 ${un.open}`);
    assert.strictEqual(sumWin(slots, plan, 0), 42);

    // 꽉 찼으면 더 열지 않고 예약 수로 닫음 (줄이기)
    slots = [S(600, 12, 0, true), S(630, 12, 0, true), S(660, 12, 0, true), S(690, 6, 0, false, 10)];
    plan = await run(slots, [690], O);
    assert.deepStrictEqual([plan[0].from, plan[0].to], [10, 6], "남은 자리 0 → 예약 6장으로 닫음");

    // 예약이 최대보다 많으면 그대로 (줄일 수 없음)
    slots = [S(600, 0, 0, false), S(630, 14, 0, false, 14)];
    plan = await run(slots, [600, 630], O);
    assert.strictEqual(plan.find((p) => p.t === 630).to, 14);
    assert.ok(plan.every((p) => p.to <= 13 || p.to === p.used));

    // 현장 추세(walkAvg)만큼 자리를 비워 둠
    slots = [600, 630, 660, 690].map((t) => S(t, 0, 0, false));
    plan = await run(slots, [600, 630, 660, 690], { target: 42, max: 13, walkAvg: 2 });
    assert.strictEqual(plan.reduce((a, p) => a + p.to, 0), 42 - 8, "4타임 × 현장 2장 = 8장은 현장 몫");
  } finally {
    await browser.close();
  }
});

test("데스크 [지금 한 번 조절] → 네이버 칸의 회차당 수량이 바뀜 (휴일 13:56, 앞 3타임)", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const naverPage = await ctx.newPage();
    await naverPage.goto(NAVER);
    await naverPage.evaluate(() => localStorage.clear());
    await naverPage.goto(NAVER);
    const naver = new NaverSync((code) => naverPage.evaluate(code), { urls: { list: NAVER + "?view=list", calendar: NAVER + "?view=calendar" } });
    const desk = await ctx.newPage();
    await desk.clock.install({ time: new Date("2026-10-05T13:56:00") });
    let q = Promise.resolve();
    const serial = (fn) => (q = q.then(fn, fn));
    await desk.exposeFunction("__naverLoad", (day, only) => serial(() => naver.loadDay(day, { only })));
    await desk.exposeFunction("__naverSetCap", (c) => serial(() => naver.setCap(c)));
    await desk.addInitScript(() => {
      window.desk = {
        naver: { load: (d, o) => window.__naverLoad(d, o), complete: async () => ({ ok: true }), setCap: (c) => window.__naverSetCap(c) },
        state: { load: () => null, save: () => {} },
      };
    });
    const errs = [];
    desk.on("pageerror", (e) => errs.push(e.message));
    await desk.goto(DESK);
    await desk.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 30000 });

    await desk.evaluate(() => window.__deskTest.capRun(true));
    const log = await desk.evaluate(() => window.__deskTest.capLog.slice());
    assert.ok(log.length >= 3 && log.every((x) => x.ok), JSON.stringify(log));
    const s = (await naver.loadDay("2026-10-05")).slots.filter((x) => /1시간 50분/.test(x.product));
    const capAt = (t) => s.find((x) => x.time === t).cap;
    assert.deepStrictEqual([capAt("14:00"), capAt("14:30"), capAt("15:00")], [13, 13, 13], "앞 3타임 13장");
    assert.strictEqual(capAt("13:30"), 10, "이미 시작한 타임은 그대로");
    assert.strictEqual(capAt("15:30"), 10, "앞 3타임 밖은 그대로");
    // 데스크 시간표 잔여도 바로 반영 (14:00: 13 − 확정 4)
    assert.deepStrictEqual(await desk.$$eval('.slot[data-s="840"] .c', (e) => e.map((x) => x.textContent.trim())), ["0", "4", "9"]);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
