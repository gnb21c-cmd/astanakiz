/* 네이버 판매 수량 자동 조절 시험
   1) 계산(planCaps): 4타임(2시간) 합이 목표를 넘지 않게 · 한 타임 최대 · 예약보다 적게는 안 함 · 인기 타임에 더
   2) 데스크 → 가짜 네이버 예약현황: [지금 한 번 조절] 하면 네이버 칸의 회차당 수량이 실제로 바뀜
   3) 10/24: 네이버만 합쳐 목표(40) · 가까운 타임부터 · 뒤 3타임은 남는 자리만큼 · 인기 시간 (현장 손님은 계획에 안 넣음)
      현장 몫 5장(45 − 40) · 넘게 나간 현장 열쇠만큼 그 동안 네이버 목표를 낮춤 · 네이버 40 + 현장 5 면 현장 판매 불가 */
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

// 사장님 10/24: 네이버만 합쳐 40 (현장 손님은 그 위로 45개까지) · 앞 타임에 덜 온 만큼 가까운 타임부터 채움 · 뒤 3타임은 남는 자리만큼 · 인기 시간(12:30~15:30) 최대한
test("네이버만 40: 가까운 타임부터 · 뒤 3타임은 남는 자리만큼 · 인기 시간은 앞(인기 밖) 타임이 못 가져감 · 상한 안 (무작위)", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(DESK);
    const run = (slots, adj, o) => page.evaluate(([s, a, x]) => { const p = window.__deskTest.planCaps(s, a, x); return { plan: p.map((c) => ({ ...c })), inside: Object.fromEntries(s.filter((y) => !y.started).map((y) => [y.t, p.inside(y.t)])) }; }, [slots, adj, o]);
    const m = (s) => { const [h, mm] = s.split(":").map(Number); return h * 60 + mm; };
    const to = (r, t) => (r.plan.find((c) => c.t === m(t)) || {}).to;
    // 10/24(토) 12:35 사장님 폰 화면 그대로: 시각 · 완료 · 미입장 · 잔여
    const rows = [["11:00", 6, 0, 4], ["11:30", 4, 0, 5], ["12:00", 8, 0, 4], ["12:30", 5, 3, 0], ["13:00", 0, 8, 0], ["13:30", 1, 9, 0], ["14:00", 0, 10, 0], ["14:30", 0, 3, 7], ["15:00", 0, 5, 5], ["15:30", 0, 7, 3], ["16:00", 0, 0, 10], ["16:30", 0, 0, 10], ["17:00", 0, 2, 8], ["17:30", 0, 0, 10]];
    const now = m("12:35");
    const present = rows.filter(([t]) => m(t) <= now && m(t) + 110 > now).map(([t, d, u]) => ({ from: now, to: m(t) + 110, n: d + u }));
    const slots = rows.map(([t, d, u, rem]) => ({ t: m(t), used: d + u, mainUsed: d + u, cap: d + u + rem, walk: 0, started: m(t) <= now, product: "P", demand: d + u, fc: m(t) >= m("12:30") && m(t) <= m("15:30") ? null : d + u }));
    const adj = [m("13:00"), m("13:30"), m("14:00")];
    const O = { target: 40, ceiling: 43, max: 13, walkAvg: 0, present, forecast: true, near: true, popular: [m("12:30"), m("15:30")] };
    const r = await run(slots, adj, O);
    assert.deepStrictEqual(["13:00", "13:30", "14:00"].map((t) => to(r, t)), [12, 10, 10], "가까운 13:00 부터 — 14:00 때 네이버 40 (12:30 8 + 12 + 10 + 10)");
    assert.strictEqual(r.inside[m("14:00")], 40);
    assert.deepStrictEqual(["14:30", "15:00", "15:30"].map((t) => to(r, t)), [8, 12, 10], "뒤 3타임은 남는 자리만큼 (늘리거나 줄임)");
    assert.ok(["14:30", "15:00", "15:30"].every((t) => r.plan.find((c) => c.t === m(t)).near));
    for (const t of ["14:00", "14:30", "15:00", "15:30"]) assert.strictEqual(r.inside[m(t)], 40, `${t} 때 네이버 40`);
    // 예전(현장 예상 타임당 2명을 비워 둠)이면 13:00 ~ 14:00 이 닫혔음 (폰 화면 잔여 0)
    const old = await run(slots.map((x) => ({ ...x, fc: x.used })), adj, { target: 42, ceiling: 43, max: 13, walkAvg: 2, present, forecast: true });
    assert.deepStrictEqual(["13:00", "13:30", "14:00"].map((t) => to(old, t)), [8, 10, 10], "예전: 현장 몫 때문에 닫힘");

    // 인기 시간 지키기: 아침 10:35 · 앞 3타임(11:00~12:00, 인기 밖)이 뒤 인기 타임(12:30~13:30) 열린 수량을 못 가져감
    const morning = [["10:00", 4, 10], ["10:30", 6, 10], ["11:00", 2, 10], ["11:30", 2, 10], ["12:00", 3, 10], ["12:30", 6, 10], ["13:00", 6, 10], ["13:30", 6, 10], ["14:00", 4, 10]];
    const now2 = m("10:35");
    const pres2 = morning.filter(([t]) => m(t) <= now2).map(([t, u]) => ({ from: now2, to: m(t) + 110, n: u }));
    const s2 = morning.map(([t, u, cap]) => ({ t: m(t), used: u, mainUsed: u, cap, walk: 0, started: m(t) <= now2, product: "P", demand: u, fc: m(t) >= m("12:30") && m(t) <= m("15:30") ? null : u }));
    const adj2 = [m("11:00"), m("11:30"), m("12:00")];
    const guard = await run(s2, adj2, { ...O, present: pres2 });
    const noGuard = await run(s2, adj2, { ...O, present: pres2, popular: null });
    assert.ok(to(guard, "12:30") >= 10, "인기 첫 타임 12:30 은 열린 10장 그대로 (12:00 이 못 가져감) " + to(guard, "12:30"));
    assert.ok(to(noGuard, "12:30") < 10, "인기 시간을 안 정하면 12:00 이 가져가 12:30 이 닫힘 " + to(noGuard, "12:30"));
    const sumAdj = (x) => ["11:00", "11:30", "12:00"].reduce((a, t) => a + to(x, t), 0);
    assert.ok(sumAdj(guard) < sumAdj(noGuard), `인기 밖 앞 타임은 남는 만큼만 ${sumAdj(guard)} < ${sumAdj(noGuard)}`);
    assert.ok(Object.values(guard.inside).every((v) => v <= 43), JSON.stringify(guard.inside));

    // 인기 시간 바로 앞 타임은 예약이 많아도 기본 10장까지만 — 늘리는 몫은 인기 시간에 (사장님 10/24)
    const busy = [["10:00", 8], ["10:30", 9], ["11:00", 9], ["11:30", 9], ["12:00", 9], ["12:30", 4], ["13:00", 5], ["13:30", 6], ["14:00", 6], ["14:30", 3]];
    const pres3 = busy.filter(([t]) => m(t) <= now2).map(([t, u]) => ({ from: now2, to: m(t) + 110, n: u }));
    const s3 = busy.map(([t, u]) => ({ t: m(t), used: u, mainUsed: u, cap: 10, walk: 0, started: m(t) <= now2, product: "P", demand: u, fc: m(t) >= m("12:30") ? null : u }));
    const lead = await run(s3, adj2, { ...O, present: pres3, base: 10 });
    const noBase = await run(s3, adj2, { ...O, present: pres3 });
    assert.deepStrictEqual(["11:00", "11:30", "12:00"].map((t) => to(lead, t)), [10, 10, 10], "11:00 ~ 12:00 (손님이 12:30 뒤까지 남음) = 기본 10까지만");
    assert.deepStrictEqual(["12:30", "13:00", "13:30"].map((t) => to(lead, t)), [10, 10, 10], "인기 타임 몫 그대로");
    assert.ok(["11:00", "11:30", "12:00"].some((t) => to(noBase, t) > 10) && ["12:30", "13:00", "13:30"].some((t) => to(noBase, t) < 10), "기본 수량을 안 정하면 앞 타임이 늘고 인기 타임이 줄어듦");
    // 인기 시간과 겹치지 않는 아침 타임(10:30 손님은 12:20 반납)은 늘릴 수 있음
    const early = busy.map(([t, u]) => ({ t: m(t), used: Math.min(u, 3), mainUsed: Math.min(u, 3), cap: 10, walk: 0, started: m(t) <= m("09:30"), product: "P", demand: Math.min(u, 3), fc: m(t) >= m("12:30") ? null : Math.min(u, 3) }));
    const ear = await run(early, [m("10:00"), m("10:30"), m("11:00")], { ...O, present: [], base: 10 });
    assert.ok(to(ear, "10:00") > 10, "10:00 은 인기 시간 전에 나가서 늘릴 수 있음 " + to(ear, "10:00"));
    assert.ok(to(ear, "11:00") <= 10, "11:00 은 12:30 뒤까지 남아 기본까지만 " + to(ear, "11:00"));

    // 무작위 300번: 시작 안 한 어느 시각도 상한 안 (이미 팔린 것만으로 넘는 때 빼고) · 예약 밑으로 안 줄임 · 한 타임 최대
    let seed = 11; const rnd = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
    for (let k = 0; k < 300; k++) {
      const n = 12, nowR = 600 + 30 * rnd(4) + 5;
      const ss = Array.from({ length: n }, (_, i) => { const t = 600 + 30 * i, st = t <= nowR, used = rnd(st ? 12 : 11); return { t, used, mainUsed: used, cap: Math.max(used, 6 + rnd(8)), walk: 0, started: st, product: "P", demand: used + rnd(4), fc: rnd(3) ? used + rnd(4) : null }; });
      const pr = ss.filter((x) => x.started && x.t + 110 > nowR).map((x) => ({ from: nowR, to: x.t + 110, n: Math.max(0, x.used - rnd(3)) }));
      const aj = ss.filter((x) => !x.started).slice(0, 3).map((x) => x.t);
      const o = { target: 38 + rnd(4), ceiling: 43, max: 13, walkAvg: 0, present: pr, forecast: true, near: true, popular: rnd(2) ? [720, 930] : null };
      const res = await run(ss, aj, o);
      const toOf = (x) => { const c = res.plan.find((p) => p.t === x.t); return c ? c.to : null; };
      for (const c of res.plan) { const x = ss.find((y) => y.t === c.t); assert.ok(c.to >= x.mainUsed, `경우 ${k}: ${c.t} 예약 밑`); assert.ok(c.to <= Math.max(o.max, x.mainUsed), `경우 ${k}: ${c.t} 최대 넘음`); }
      // 계획대로(바꾼 칸) · 안 바꾼 먼 칸은 열린 수량이 다 팔려도
      for (let i = 0; i < n; i++) {
        if (ss[i].started) continue;
        let v = pr.reduce((a, p) => a + (p.from <= ss[i].t && ss[i].t < p.to ? p.n : 0), 0), sold = v;
        for (let j = Math.max(0, i - 3); j <= i; j++) { if (ss[j].started) continue; const t = toOf(ss[j]); v += t != null ? Math.max(t, ss[j].used) : Math.max(ss[j].cap, ss[j].used); sold += ss[j].used; }
        assert.ok(v <= Math.max(o.ceiling, sold), `경우 ${k}: ${ss[i].t} 때 ${v} (이미 팔린 ${sold})`);
      }
    }
  } finally {
    await browser.close();
  }
});

test("데스크 계획(네이버만): 현장 손님은 네이버 수에 안 들어감 · 현장 몫 5장을 넘게 나가면 그만큼 목표를 낮춤 · 표에 네이버 · 현장 따로", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 10/5(휴일) 13:50
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const plan = () => page.evaluate(() => { const p = window.__deskTest.capPlan(); return { to: p.plan.map((c) => `${c.t}:${c.to}`).join(" "), inside: p.inside, walk: p.insideWalk, out: p.walkOut, goal: p.goal(840), win: p.slots.filter((x) => !x.started).map((x) => p.win(x.t)) }; });
    const a = await plan();
    assert.ok(a.win.every((v) => v <= 43), a.win.join(" "));
    // 현장 손님 6명(13:30 타임 · 15:20 반납) 더 들어옴 → 네이버 손님 수는 그대로 · 현장만 늘어남
    await page.evaluate(() => { const T = window.__deskTest; T.walkin("01011110000", [41, 42, 43], 830, 810); T.walkin("01011110001", [44, 45, 40], 830, 810); });
    const b = await plan();
    assert.deepStrictEqual([b.inside, b.walk, b.out], [a.inside, a.walk + 6, a.out + 6], "안에 있는 손님: 네이버 그대로 · 현장 +6");
    // 현장 몫 5장을 넘은 열쇠(반납이 늦은 새 손님 것)만큼 14:00 네이버 목표가 낮아짐
    assert.strictEqual(a.goal, 40 - Math.max(0, a.out - 5));
    assert.strictEqual(b.goal, 40 - Math.max(0, b.out - 5), `현장 열쇠 ${b.out}개 → 14:00 목표 ${b.goal}`);
    assert.ok(b.win.every((v) => v <= 40), b.win.join(" "));
    // 기본: 네이버 목표 40 · 인기 시간 12:30 ~ 15:30
    const A = await page.evaluate(() => window.__deskTest.RULES.capAuto);
    assert.deepStrictEqual([A.target, A.popular], [40, { from: "12:30", to: "15:30" }]);
    // 운영 설정 → 네이버 설정: 네이버 목표 · 인기 시간 · 표(● 앞 3타임 · ○ 뒤 3타임 · 인기)
    await page.dblclick("#now"); await page.click('[data-t="naver"]');
    assert.match(await page.textContent("#sheet"), /네이버 목표/);
    const marks = await page.$$eval("#sheet .captable tr td:first-child", (e) => e.map((x) => x.textContent.replace(/\s+/g, " ").trim()));
    assert.ok(marks.some((x) => /● 인기/.test(x)) && marks.some((x) => /○/.test(x)), marks.join(" | "));
    assert.match(await page.textContent("#sheet"), /네이버만 합쳐 목표 40 \(현장은 계획에 안 넣고 늘 5장을 씀/);
    await page.selectOption("#cap-pop-to", "16:00");
    assert.deepStrictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("astanakiz-capauto")).popular), { from: "12:30", to: "16:00" }, "인기 시간 저장");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

// 사장님 10/24: 현장은 늘 5장(열쇠 45 − 네이버 40)을 알아서 씀 · 6개 나가면 넘은 1개(반납이 늦은 것)가 있는 동안 네이버 39 · 7개면 38
test("현장 몫 5장: 현장 열쇠가 5개를 넘게 나가면 넘은 열쇠(반납이 늦은 것부터)가 안에 있는 동안 네이버 목표를 그만큼 낮춤 (6 → 39 · 7 → 38)", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(DESK);
    const m = (s) => { const [h, mm] = s.split(":").map(Number); return h * 60 + mm; };
    const r = await page.evaluate(([M]) => {
      const T = window.__deskTest, m = (s) => M[s];
      const rows = [["11:00", 6, 0, 4], ["11:30", 4, 0, 5], ["12:00", 8, 0, 4], ["12:30", 5, 3, 0], ["13:00", 0, 8, 0], ["13:30", 1, 9, 0], ["14:00", 0, 10, 0], ["14:30", 0, 3, 7], ["15:00", 0, 5, 5], ["15:30", 0, 7, 3], ["16:00", 0, 0, 10], ["16:30", 0, 0, 10]];
      const now = m("12:35");
      const present = rows.filter(([t]) => m(t) <= now && m(t) + 110 > now).map(([t, d, u]) => ({ from: now, to: m(t) + 110, n: d + u }));
      const slots = rows.map(([t, d, u, rem]) => ({ t: m(t), used: d + u, mainUsed: d + u, cap: d + u + rem, walk: 0, started: m(t) <= now, product: "P", demand: d + u, fc: null }));
      const run = (walkOut) => { const p = T.planCaps(slots, [m("13:00"), m("13:30"), m("14:00")], { target: 40, ceiling: 40, max: 13, walkAvg: 0, present, forecast: true, near: true, popular: [m("12:30"), m("15:30")], walkOut, pool: 5 }); return { to: p.map((c) => c.to), goal: ["13:00", "13:30", "14:00", "14:30", "15:00"].map((t) => p.goal(m(t))), inside: ["13:00", "13:30", "14:00", "14:30", "15:00"].map((t) => p.inside(m(t))) }; };
      const five = [m("13:50"), m("13:50"), m("13:50"), m("14:20"), m("14:20")].map((to) => ({ to }));
      return { none: run([]), five: run(five), six: run(five.concat([{ to: m("14:20") }])), seven: run(five.concat([{ to: m("14:20") }, { to: m("15:10") }])) };
    }, [Object.fromEntries(["11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "13:50", "14:00", "14:20", "14:30", "15:00", "15:10", "15:30", "16:00", "16:30"].map((t) => [t, m(t)]))]);
    assert.deepStrictEqual(r.five, r.none, "현장 5개까지는 현장 몫 — 네이버 그대로 40");
    assert.deepStrictEqual(r.six.goal, [39, 39, 39, 40, 40], "6개: 넘은 1개(14:20 반납)가 있는 동안 39");
    assert.deepStrictEqual(r.seven.goal, [38, 38, 38, 39, 39], "7개: 넘은 2개 — 14:20 까지 38 · 15:10 까지 39 (반납이 늦은 2개)");
    for (const k of ["six", "seven"]) r[k].inside.forEach((v, i) => assert.ok(v <= r[k].goal[i], `${k}: 그때 안 ${v} ≤ 목표 ${r[k].goal[i]}`));
    assert.ok(r.seven.to[0] < r.none.to[0], `빌린 만큼 가까운 13:00 을 덜 엶 ${r.none.to[0]} → ${r.seven.to[0]}`);
  } finally {
    await browser.close();
  }
});

test("데스크: 네이버가 40(아직 안 온 예약 포함) + 현장 5 = 열쇠 45 → 빈 열쇠가 있어도 현장입장 판매 불가 · [POS로 이동] 빨강 · 계획은 현장 열쇠로 목표를 낮춤", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 10/5(휴일) 13:50
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const p0 = await page.evaluate(() => window.__deskTest.projection());
    assert.ok(p0.all > 0, "처음엔 현장 판매 가능 " + JSON.stringify(p0));
    // 13:30 예약 손님이 아직 안 옴 (남은 자리만큼) → 빈 열쇠는 있어도 그 손님 몫
    await page.evaluate((n) => window.__deskTest.addBooking(window.__deskTest.today(), "13:30", "아직안옴", "01077770000", n, {}), p0.all);
    const p1 = await page.evaluate(() => window.__deskTest.projection());
    assert.strictEqual(p1.all, 0, "아직 안 온 예약 몫까지 남겨 둠 → 현장 판매 0");
    const free = await page.$$eval(".key", (e) => e.filter((x) => !/현장|[가-힣]{2,}/.test(x.textContent.replace(/^\d+/, ""))).length);
    assert.ok(free > 0, "빈 열쇠는 있음");
    await page.click(".key[data-k='41']");
    assert.match(await page.textContent("#sheet .banner"), /지금은 판매 불가/);
    assert.match(await page.getAttribute("#sheet [data-act=pay]", "class"), /\bno\b/, "[POS로 이동] 빨강");
    await page.click("#sheet [data-act=pay]", { force: true });
    assert.ok(await page.isHidden("#pos"), "POS로 안 넘어감");
    await page.click("#sheet [data-act=close]");
    // 계획: 지금 나간 현장 열쇠 수 · 현장 몫(45 − 40 = 5)
    const c = await page.evaluate(() => { const p = window.__deskTest.capPlan(); return { pool: p.pool, out: p.walkOut, n: window.__deskTest.capWalkOut().length, walkKeys: window.__deskTest.holders().filter((h) => h.walk && !h.svc).reduce((a, h) => a + h.keys.length, 0) }; });
    assert.deepStrictEqual([c.pool, c.out], [5, c.walkKeys]);
    assert.deepStrictEqual(errs, []);
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
    await desk.dblclick("#now"); await desk.click('[data-t="naver"]');
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
