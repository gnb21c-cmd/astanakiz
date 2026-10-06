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

test("계산: 어느 2시간(4타임)도 상한을 넘지 않음 (열린 수량이 다 팔린다고 봐도) · 한 타임 최대 · 예약보다 적게 안 함 · 인기 타임에 더", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(DESK);
    const run = (slots, adj, o) => page.evaluate(([s, a, x]) => window.__deskTest.planCaps(s, a, x), [slots, adj, o]);
    const S = (t, used, walk, started, cap = 10, extra = {}) => Object.assign({ t, used, mainUsed: used, walk, started, cap, product: "P" }, extra);
    const O = { target: 42, ceiling: 43, max: 13, walkAvg: 0 };
    // 최악 합: 시작한 타임은 실제, 안 시작한 타임은 계획(없으면 지금) 수량이 다 팔린다고 + 현장 + 예상 현장
    const worstWins = (slots, plan, walkAvg = 0) => {
      const occ = (x) => { if (x.started) return x.used + x.walk; const c = plan.find((p) => p.t === x.t); return Math.max(c ? c.to : x.cap, x.used) + x.walk + walkAvg; };
      const out = [];
      for (let st = -3; st < slots.length; st++) { let v = 0; for (let j = Math.max(0, st); j < Math.min(slots.length, st + 4); j++) v += occ(slots[j]); out.push(v); }
      return out;
    };
    const ok = (slots, plan, o = O) => { for (const w of worstWins(slots, plan, o.walkAvg)) assert.ok(w <= o.ceiling, `2시간 합 ${w} > 상한 ${o.ceiling}`); };

    // 아침 (아무도 없음, 먼 타임은 10장씩 열려 있음): 앞 3타임을 열되 먼 타임 10장까지 셈 → 어느 묶음도 42 이하
    let slots = [600, 630, 660, 690, 720].map((t) => S(t, 0, 0, false));
    let plan = await run(slots, [600, 630, 660], O);
    ok(slots, plan);
    assert.ok(plan.every((p) => p.to <= 13));
    assert.ok(Math.max(...worstWins(slots, plan)) >= 40, "40 이상까지는 엶");

    // 13장씩 4타임 = 52 가 되면 안 됨 (사용자 지시 10/6): 먼 타임이 13장씩 열려 있으면 줄임
    slots = [600, 630, 660, 690, 720, 750, 780].map((t) => S(t, 0, 0, false, 13)); // 11:30~13:00 이 13 × 4 = 52
    plan = await run(slots, [600, 630, 660], O);
    ok(slots, plan);
    assert.ok(plan.some((p) => p.far && p.to < p.from), "먼 타임 수량도 줄여 상한 안으로");

    // 이미 손님이 많이 들어온 앞 타임 → 뒤 타임은 남은 자리만큼만
    slots = [S(600, 12, 2, true), S(630, 10, 1, true), S(660, 6, 0, false), S(690, 1, 0, false), S(720, 0, 0, false)];
    plan = await run(slots, [660, 690, 720], O);
    ok(slots, plan);
    assert.ok(plan.find((p) => p.t === 660).to >= 6 && plan.find((p) => p.t === 690).to >= 1, "예약보다 적게 안 함");

    // 인기(예상 수요 10) vs 비인기(예상 수요 2): 남은 자리가 적을 때 인기 타임에 더
    slots = [S(600, 12, 0, true), S(630, 12, 0, true), S(660, 6, 0, false, 10, { demand: 10 }), S(690, 1, 0, false, 10, { demand: 2 })];
    plan = await run(slots, [660, 690], O);
    ok(slots, plan);
    const pop = plan.find((p) => p.t === 660), un = plan.find((p) => p.t === 690);
    assert.ok(pop.open > un.open, `인기 ${pop.open} > 비인기 ${un.open}`);

    // 꽉 찼으면 더 열지 않고 예약 수로 닫음 (줄이기)
    slots = [S(600, 12, 0, true), S(630, 12, 0, true), S(660, 12, 0, true), S(690, 6, 0, false, 10)];
    plan = await run(slots, [690], O);
    assert.deepStrictEqual([plan[0].from, plan[0].to], [10, 6], "남은 자리 0 → 예약 6장으로 닫음");

    // 예약이 최대보다 많으면 그대로 (줄일 수 없음)
    slots = [S(600, 0, 0, false), S(630, 14, 0, false, 14)];
    plan = await run(slots, [600, 630], O);
    assert.strictEqual(plan.find((p) => p.t === 630).to, 14);

    // 현장 추세만큼 자리를 비워 둠
    slots = [600, 630, 660, 690].map((t) => S(t, 0, 0, false));
    const o2 = { target: 42, ceiling: 43, max: 13, walkAvg: 2 };
    plan = await run(slots, [600, 630, 660, 690], o2);
    ok(slots, plan, o2);
    assert.strictEqual(plan.reduce((a, p) => a + p.to, 0), 42 - 8, "4타임 × 현장 2장 = 8장은 현장 몫");

    // 여러 경우를 섞어 봐도 늘 상한 안 (무작위 200번)
    let seed = 7; const rnd = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
    for (let k = 0; k < 200; k++) {
      const n = 8, startedN = rnd(4);
      slots = Array.from({ length: n }, (_, i) => { const st = i < startedN; const used = rnd(st ? 12 : 9); return S(600 + 30 * i, used, rnd(3), st, Math.max(used, 6 + rnd(8)), { demand: used + rnd(5) }); });
      const adj = slots.filter((x) => !x.started).slice(0, 3).map((x) => x.t);
      const o = { target: 42, ceiling: 43, max: 13, walkAvg: rnd(3) };
      plan = await run(slots, adj, o);
      const done = slots.filter((x) => x.started).reduce((a, x, i, arr) => a, 0);
      // 이미 팔린 것만으로 넘는 묶음은 어쩔 수 없음 → 그 외에는 상한 안
      const sold = (x) => x.used + x.walk + (x.started ? 0 : o.walkAvg);
      const wins = worstWins(slots, plan, o.walkAvg);
      wins.forEach((w, wi) => { const st = wi - 3; let soldSum = 0; for (let j = Math.max(0, st); j < Math.min(n, st + 4); j++) soldSum += sold(slots[j]); assert.ok(w <= Math.max(o.ceiling, soldSum), `경우 ${k}: 합 ${w} (이미 팔린 ${soldSum})`); });
      for (const p of plan) assert.ok(p.to >= slots.find((x) => x.t === p.t).mainUsed, "예약보다 적게 안 함");
    }
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
    assert.ok(log.length >= 1 && log.every((x) => x.ok), JSON.stringify(log));
    const s = (await naver.loadDay("2026-10-05")).slots.filter((x) => /1시간 50분/.test(x.product));
    const capAt = (t) => s.find((x) => x.time === t).cap;
    // 바꾼 수량 = 기록대로, 13:30~16:00 사이 어느 2시간도 상한 43 이하 (열린 수량이 다 팔려도)
    for (const x of log) assert.strictEqual(capAt(x.t), x.to, `${x.t} 기록대로`);
    assert.ok(log.some((x) => x.to > x.from), "앞 타임을 더 엶");
    assert.strictEqual(capAt("13:30"), 10, "이미 시작한 타임은 그대로");
    const times = ["13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30"];
    for (let i = 0; i + 4 <= times.length; i++) { const w = times.slice(i, i + 4).reduce((a, t) => a + Math.max(capAt(t), 0), 0); assert.ok(w <= 43, `${times[i]}부터 2시간 ${w}`); }
    // 데스크 시간표 잔여도 바로 반영 (14:00: 수량 − 확정 4)
    const c14 = await desk.$$eval('.slot[data-s="840"] .c', (e) => e.map((x) => x.textContent.trim()));
    assert.deepStrictEqual(c14, ["0", "4", String(capAt("14:00") - 4)]);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
