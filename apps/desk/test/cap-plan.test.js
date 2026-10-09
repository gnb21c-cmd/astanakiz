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

// 사장님 10/9: 좌석(열쇠) 기준 · 비인기 타임은 예상만큼만 팔린다고 보고 남는 열쇠를 인기 타임에
test("좌석 기준: 일찍 나간 자리는 다시 팖 · 비인기 먼 타임은 예상만큼 · 인기 먼 타임은 다 팔린다고 · 예상 비율 70/10/10/10", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(DESK);
    const run = (slots, adj, o) => page.evaluate(([s, a, x]) => { const p = window.__deskTest.planCaps(s, a, x); return { plan: p.map((c) => ({ ...c })), inside: s.filter((y) => !y.started).map((y) => p.inside(y.t)) }; }, [slots, adj, o]);
    const S = (t, used, walk, started, cap = 10, extra = {}) => Object.assign({ t, used, mainUsed: used, walk, started, cap, product: "P" }, extra);
    const sum = (r) => r.plan.reduce((a, c) => a + c.open, 0);
    const O = { target: 42, ceiling: 43, max: 13, walkAvg: 0 };

    // 10:00 에 20장 · 10:30 에 4장 들어옴(시작함), 지금 10:50 · 앞 3타임(11:00~12:00) 조절 · 12:30 은 4장 열려 있음
    const slots = [S(600, 20, 0, true), S(630, 4, 0, true), S(660, 0, 0, false), S(690, 0, 0, false), S(720, 0, 0, false), S(750, 0, 0, false, 4)];
    const old = await run(slots, [660, 690, 720], O); // 예전: 20 + 4 가 4타임 내내 있다고
    // 좌석 기준: 10:00 손님 20명 중 16명이 일찍 나가고 4명만 열쇠를 가짐(11:50 반납), 10:30 손님 4명은 12:20 반납
    const present = [{ from: 650, to: 710, n: 4 }, { from: 650, to: 740, n: 4 }];
    const seat = await run(slots, [660, 690, 720], { ...O, present });
    assert.ok(sum(seat) >= sum(old) + 5, `일찍 나간 자리만큼 더 엶: 예전 ${sum(old)} → 좌석 ${sum(seat)}`);
    assert.ok(seat.inside.every((v) => v <= 43), "어느 시각도 상한 이하 " + seat.inside.join(" "));

    // 먼 타임(12:30 · 13:00 · 13:30)이 13장씩 열려 있음 — 비인기(예상 3, 과거 실적 있음)면 예상만큼, 인기(예상 15)면 다 팔린다고
    const far = (fc) => [S(660, 0, 0, false, 10, { demand: 9 }), S(690, 0, 0, false, 10, { demand: 9 }), S(720, 0, 0, false, 10, { demand: 9 }),
      S(750, 0, 0, false, 13, { demand: fc, fc }), S(780, 0, 0, false, 13, { demand: fc, fc }), S(810, 0, 0, false, 13, { demand: fc, fc })];
    const quiet = await run(far(3), [660, 690, 720], { ...O, forecast: true });
    const busy = await run(far(15), [660, 690, 720], { ...O, forecast: true });
    const worst = await run(far(3), [660, 690, 720], O); // 예상 없이(예전)
    assert.ok(sum(quiet) > sum(busy), `비인기 먼 타임 몫을 앞 타임에: 비인기 ${sum(quiet)} > 인기 ${sum(busy)}`);
    assert.strictEqual(sum(busy), sum(worst), "인기 먼 타임은 예전처럼 다 팔린다고");
    assert.ok(quiet.inside.every((v) => v <= 43), quiet.inside.join(" "));
    // 예상을 모르는 칸(fc = null)은 열린 수량이 다 팔린다고 (계산 함수의 기본)
    const none = await run(far(null).map((x, i) => (i >= 3 ? { ...x, demand: 3 } : x)), [660, 690, 720], { ...O, forecast: true });
    assert.strictEqual(sum(none), sum(worst), "예상 없음 → 열린 수량 다");
    // 과거 같은 요일 실적이 없을 때 예상 (사장님 10/9): 지금 열쇠(예약) 수준 90% · 오늘 추세 10% — 무조건 다 팔린다고 보지 않음
    const nh = await page.evaluate(() => ({ f: window.__deskTest.capNoHist(10, 20), c: window.__deskTest.capForecast({ t: 900, used: 5 }, 1) }));
    assert.ok(Math.abs(nh.f - 11) < 1e-9, "0.9 × 10 + 0.1 × 20 = 11");
    assert.deepStrictEqual([nh.c.past, nh.c.demand, nh.c.fc, nh.c.expWalk], [0, 5, 5, 1], "과거 없음 · 속도 0 → 지금 예약 5 그대로, 먼 타임도 예상(5)만큼");

    // 예상 비율: 같은 요일 지난주 70% · 최근 3주 평균 10% · 추세 10% · 오늘 10%
    const mix = await page.evaluate(() => [window.__deskTest.capMix([10, 6, 4], 8), window.__deskTest.capMix([], 5), window.__deskTest.capMix([10], null)]);
    assert.ok(Math.abs(mix[0] - (0.7 * 10 + 0.1 * (20 / 3) + 0.1 * 13 + 0.1 * 8)) < 1e-9, "70/10/10/10 — 추세 = 10 + (10 − 4) / 2 = 13 · " + mix[0]);
    assert.strictEqual(mix[1], 5, "과거가 없으면 오늘 것만");
    assert.ok(Math.abs(mix[2] - 10) < 1e-9, "있는 것만으로 비율을 나눔");
    // 같은 요일: 월~금 각각 · 토 · 일 · 평일에 낀 공휴일
    const types = await page.evaluate(() => ["2026-10-08", "2026-10-10", "2026-10-11", "2026-10-09", "2026-10-07"].map(window.__deskTest.dayType));
    assert.deepStrictEqual(types, ["목", "토", "일", "공휴일", "수"], "10/9 한글날 = 공휴일");
  } finally {
    await browser.close();
  }
});

// 사장님 10/9: 고객에게 보이는 잔여(회차당 수량 − 예약)는 10장을 넘지 않게 — 목표 13이어도 한 번에 열지 않고 예약이 늘수록 천천히
test("네이버에 보이는 잔여는 10장 이하: 목표 13이면 10 → 예약 2명 때 잔여 9 → … → 13 · 이미 13 열린 먼 타임은 예약 + 10으로", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 10/5(휴일) 13:50
    const v = await page.evaluate(() => [[13, 0], [13, 1], [13, 2], [13, 6], [13, 12], [13, 13], [8, 0], [10, 3], [13, 15]].map(([p, b]) => window.__deskTest.capVisible(p, b)));
    assert.deepStrictEqual(v, [10, 11, 11, 12, 13, 13, 8, 10, 15], "회차당 수량 = 예약 + ⌈10 × (목표 − 예약) ÷ 목표⌉, 10 이하 목표는 그대로");
    const left = [[13, 0], [13, 2], [13, 6], [13, 12]].map(([p, b], i) => v[[0, 2, 3, 4][i]] - b);
    assert.deepStrictEqual(left, [10, 9, 6, 1], "보이는 잔여가 천천히 줄어듦");
    // 먼 타임(17:30)에 이미 13장 · 예약 0 → 잔여 13이 보임 → 예약 + 10 = 10으로 줄임
    const p = await page.evaluate(() => { window.__deskTest.capDemo[1050] = 13; const r = window.__deskTest.capPlan(); return { plan: r.plan.map((c) => ({ ...c })), slots: r.slots.map((x) => ({ t: x.t, mainUsed: x.mainUsed, started: x.started })) }; });
    const fix = p.plan.find((c) => c.t === 1050);
    assert.ok(fix && fix.to === 10, "17:30 → 10 " + JSON.stringify(fix));
    for (const c of p.plan) {
      const x = p.slots.find((s) => s.t === c.t);
      assert.ok(c.to - x.mainUsed <= 10 || c.to <= c.from, `${c.t}: 보이는 잔여 ${c.to - x.mainUsed} ≤ 10`);
    }
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("데스크: 열쇠를 일찍 반납하면 앞 타임 '그때 안' 손님이 줄어듦 (좌석 기준)", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 10/5(휴일) 13:50
    const inside = () => page.evaluate(() => window.__deskTest.capPlan().win(840));
    const before = await inside();
    await page.click('.key[data-k="7"]'); // 서도현 13:00 입장 · 14:50 반납 예정 → 지금 반납(일찍 나감)
    await page.click("[data-act=returnAll]");
    const after = await inside();
    assert.strictEqual(after, before - 1, `14:00 때 안에 있을 손님 ${before} → ${after}`);
    assert.deepStrictEqual(errs, []);
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
    // 좌석 기준 · 예상(10/9): 어느 타임 시작 때도 안에 있을 손님(지금 안 + 아직 안 온 예약 + 팔릴 수 + 예상 현장)이 상한 이하
    const inside = await desk.evaluate(() => { const p = window.__deskTest.capPlan(); return p.slots.filter((x) => !x.started).map((x) => p.win(x.t)); });
    assert.ok(inside.every((v) => v <= 43), "어느 타임 시작 때도 안에 있을 손님 ≤ 43: " + inside.join(" "));
    // 데스크 시간표 잔여도 바로 반영 (14:00: 수량 − 확정 4)
    const c14 = await desk.$$eval('.slot[data-s="840"] .c', (e) => e.map((x) => x.textContent.trim()));
    assert.deepStrictEqual(c14, ["0", "4", String(capAt("14:00") - 4)]);

    // 한 칸 시험: 운영 설정 → 수량 자동조절 → 다음 날 10:30 을 12장으로
    await desk.click("text=운영 설정"); await desk.click('[data-t="cap"]');
    await desk.fill("#cap-t-day", "2026-10-06");
    await desk.selectOption("#cap-t-time", "10:30");
    await desk.fill("#cap-t-n", "12");
    await desk.click("[data-act=capTry]");
    await desk.waitForFunction(() => window.__deskTest.capLog.some((x) => /시험/.test(x.t || "")), null, { timeout: 30000 });
    const tl = await desk.evaluate(() => window.__deskTest.capLog.find((x) => /시험/.test(x.t || "")));
    assert.ok(tl.ok, JSON.stringify(tl));
    const s6 = (await naver.loadDay("2026-10-06")).slots.find((x) => x.time === "10:30" && /1시간 50분/.test(x.product));
    assert.strictEqual(s6.cap, 12, "다음 날 10:30 이 12장으로");

    // 새벽(02:27)에 눌러도 그날 첫 3타임을 조절 (현장 10/7)
    const adj = await desk.evaluate(() => { window.__deskTest.setNow(147); return window.__deskTest.capPlan().adj; });
    assert.deepStrictEqual(adj, [600, 630, 660]);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
