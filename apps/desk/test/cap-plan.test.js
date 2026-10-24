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

// 사장님 10/24 다시 짠 계산: 네이버는 예약 합 기준 — 어느 입장 시각도 그 타임 + 앞 3타임 ≤ 40 · 곧 다가오는 타임은 안 늘림 · 황금시간 먼저
const m = (s) => { const [h, mm] = s.split(":").map(Number); return h * 60 + mm; };
/** 행 [시각, 예약, 수량, 예상?] · 지금 시각 → planCaps 결과 + 묶음 합 (시작한 타임은 예약 · 안 시작한 타임은 계획 수량 · 바꾸지 않은 타임은 수량) */
const runPlan = (page, rows, nowS, extra = {}) => page.evaluate(([rows, now, extra, gold]) => {
  const T = window.__deskTest;
  const slots = rows.map(([t, used, cap, demand]) => ({ t, used, mainUsed: used, cap, walk: 0, started: t <= now, product: "P", demand: demand ?? used }));
  const adj = slots.filter((x) => !x.started).slice(0, 6).map((x) => x.t);
  const p = T.planCaps(slots, adj, Object.assign({ target: 40, max: 13, popular: gold, base: 10, walkOut: [], pool: 5 }, extra));
  const to = Object.fromEntries(p.map((c) => [c.t, c.to]));
  const q = slots.map((x) => (x.started ? x.used : to[x.t] != null ? to[x.t] : Math.max(x.cap, x.used)));
  const wins = Object.fromEntries(slots.map((x, i) => [x.t, i >= 3 ? q.slice(i - 3, i + 1).reduce((a, b) => a + b, 0) : null]));
  return { plan: p.map((c) => ({ ...c })), to, wins, goal: Object.fromEntries(slots.map((x) => [x.t, p.goal(x.t)])), adj };
}, [rows.map(([t, ...r]) => [m(t), ...r]), m(nowS), extra, [m("12:30"), m("15:30")]]);

test("예약 합 40 (사장님 10/24): 10/24 15:30 화면 — 예전엔 14:00~15:30 이 42 · 이제 곧 다가오는 15:00 은 그대로, 황금 15:30 은 13, 인기 없는 16:30 은 줄임 · 어느 묶음도 40 이하", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(DESK);
    // 14:35 때로 되돌림 (15:00 · 15:30 예약은 그때 10 · 8)
    const day = [["10:00", 4, 10], ["10:30", 8, 12], ["11:00", 6, 10], ["11:30", 4, 9], ["12:00", 8, 12], ["12:30", 8, 8], ["13:00", 8, 8], ["13:30", 10, 10], ["14:00", 10, 10], ["14:30", 6, 7], ["15:00", 10, 10], ["15:30", 8, 10], ["16:00", 5, 10], ["16:30", 3, 10], ["17:00", 1, 10], ["17:30", 0, 10]];
    const r = await runPlan(page, day, "14:35");
    const at = (t) => r.to[m(t)];
    assert.deepStrictEqual(["15:00", "15:30", "16:00", "16:30", "17:00", "17:30"].map(at), [10, 13, 10, 7, 10, 10], "◐ 15:00 그대로 · 황금 15:30 → 13 · 16:30 → 7");
    assert.ok(r.plan.find((c) => c.t === m("15:00")).soon, "15:00 = 곧 다가오는 타임");
    assert.strictEqual(r.wins[m("15:30")], 39, "14:00~15:30 = 10 + 6 + 10 + 13 (예전 42)");
    for (const t of ["15:00", "15:30", "16:00", "16:30", "17:00", "17:30"]) assert.ok(r.wins[m(t)] <= 40, `${t} 묶음 ${r.wins[m(t)]}`);
    // 일찍 나간 사람이 있어도 네이버는 예약 합 그대로 (계산에 '안에 있는 손님'을 안 씀) — 같은 결과
  } finally {
    await browser.close();
  }
});

test("곧 다가오는 타임은 늘리지 않음 · 황금 타임에 자리가 필요하면 예약 수까지 줄임 · 황금인 곧 다가오는 타임은 황금 밖 타임 때문에 안 줄임 · 황금 밖은 빨리 차면 13까지", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(DESK);
    // ◐ 15:00(황금 · 예약 6 · 수량 10) 은 뒤 황금 15:30 에 양보 → 7
    let r = await runPlan(page, [["13:30", 10, 10], ["14:00", 10, 10], ["14:30", 10, 10], ["15:00", 6, 10], ["15:30", 9, 10], ["16:00", 2, 10], ["16:30", 0, 10], ["17:00", 0, 10], ["17:30", 0, 10]], "14:35");
    assert.deepStrictEqual([r.to[m("15:00")], r.to[m("15:30")]], [7, 13], "곧 다가오는 15:00 은 뒤 황금 15:30(13)에 양보");
    // ◐ 15:30(황금 · 예약 8 · 수량 10) 뒤가 모두 황금 밖 → 15:30 은 그대로 10 (황금 밖 타임 때문에는 안 줄임) · 뒤 타임이 남는 만큼
    r = await runPlan(page, [["14:00", 10, 10], ["14:30", 10, 10], ["15:00", 10, 10], ["15:30", 8, 10], ["16:00", 9, 10], ["16:30", 2, 10], ["17:00", 0, 10], ["17:30", 0, 10]], "15:05");
    assert.strictEqual(r.to[m("15:30")], 10, "황금 15:30 은 그대로");
    assert.ok(r.wins[m("16:00")] <= 40 && r.wins[m("16:30")] <= 40);
    // 곧 다가오는 타임은 자리가 남아도 늘리지 않음 (남는 자리는 현장 키 몫)
    r = await runPlan(page, [["10:00", 2, 10], ["10:30", 2, 10], ["11:00", 2, 10], ["11:30", 3, 10], ["12:00", 1, 10]], "11:05");
    assert.strictEqual(r.to[m("11:30")], 10, "11:30 은 수량 그대로 10 (13으로 안 늘림)");
    // 황금 밖: 예약이 빨리 차면(예상 ≥ 수량) 13까지 · 아니면 10까지
    const after = (dem) => [["14:30", 10, 10], ["15:00", 10, 10], ["15:30", 6, 10], ["16:00", 5, 10], ["16:30", 9, 10, dem], ["17:00", 0, 10], ["17:30", 0, 10]];
    const quick = await runPlan(page, after(12), "15:35");
    const slow = await runPlan(page, after(9), "15:35");
    assert.ok(quick.to[m("16:30")] > 10, "빨리 차는 16:30 → 10 넘게 " + quick.to[m("16:30")]);
    assert.ok(slow.to[m("16:30")] <= 10, "보통 16:30 → 10까지 " + slow.to[m("16:30")]);
    // 황금 밖 타임은 황금 타임이 쓰고 남는 만큼 — 아침(인기 없는 11:30 · 12:00)이 황금 12:30 ~ 13:30 의 10장을 못 가져감
    // (황금시간 안은 4타임이 다 황금이라 묶음 40 = 10장씩 — 13은 황금 밖 타임과 같은 묶음일 때 그 몫으로: 위 15:30 처럼)
    const morning = [["10:00", 8, 10], ["10:30", 9, 10], ["11:00", 9, 10], ["11:30", 9, 10], ["12:00", 9, 10], ["12:30", 4, 10], ["13:00", 5, 10], ["13:30", 6, 10], ["14:00", 2, 10]];
    r = await runPlan(page, morning, "10:35");
    assert.deepStrictEqual(["12:30", "13:00", "13:30"].map((t) => r.to[m(t)]), [10, 10, 10], "황금 타임 10장씩 그대로");
    const noGold = await runPlan(page, morning, "10:35", { popular: null });
    assert.ok(noGold.to[m("11:30")] + noGold.to[m("12:00")] >= r.to[m("11:30")] + r.to[m("12:00")], "황금시간을 안 정하면 아침 타임이 더 가져갈 수 있음");
    for (const t of ["11:30", "12:00", "12:30", "13:00", "13:30", "14:00"]) assert.ok(r.wins[m(t)] <= 40, `${t} 묶음 ${r.wins[m(t)]}`);
  } finally {
    await browser.close();
  }
});

test("무작위 300번: 어느 입장 시각도 그 타임 + 앞 3타임 ≤ 목표(이미 팔린 것만으로 넘는 때 빼고) · 예약 밑으로 안 줄임 · 한 타임 최대 · 곧 다가오는 타임은 안 늘림", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(DESK);
    const r = await page.evaluate(() => {
      const T = window.__deskTest, bad = [];
      let seed = 23; const rnd = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
      for (let k = 0; k < 300; k++) {
        const n = 16, now = 600 + 30 * rnd(10) + 5, gold = rnd(4) ? [750, 930] : null;
        const slots = Array.from({ length: n }, (_, i) => { const t = 600 + 30 * i, st = t <= now, used = rnd(st ? 13 : 12); return { t, used, mainUsed: used, cap: Math.max(used, 6 + rnd(8)), walk: 0, started: st, product: "P", demand: used + rnd(5) }; });
        const adj = slots.filter((x) => !x.started).slice(0, 6).map((x) => x.t);
        const walkOut = Array.from({ length: rnd(8) }, () => ({ to: now + 10 + rnd(110) }));
        const o = { target: 38 + rnd(4), max: 13, popular: gold, base: 10, walkOut, pool: 5 };
        const p = T.planCaps(slots, adj, o);
        const to = Object.fromEntries(p.map((c) => [c.t, c.to]));
        const q = slots.map((x) => (x.started ? x.used : to[x.t] != null ? to[x.t] : Math.max(x.cap, x.used)));
        for (const c of p) {
          const x = slots.find((y) => y.t === c.t);
          if (c.to < x.mainUsed) bad.push(`${k}: ${c.t} 예약 밑`);
          if (c.to > Math.max(o.max, x.mainUsed)) bad.push(`${k}: ${c.t} 최대 넘음`);
          if (c.soon && c.to > Math.max(x.cap, x.mainUsed)) bad.push(`${k}: ${c.t} 곧 다가오는 타임을 늘림`);
        }
        for (let i = 3; i < n; i++) {
          if (slots[i].started) continue;
          const v = q.slice(i - 3, i + 1).reduce((a, b) => a + b, 0), sold = slots.slice(i - 3, i + 1).reduce((a, x) => a + x.used, 0);
          if (v > Math.max(p.goal(slots[i].t), sold)) bad.push(`${k}: ${slots[i].t} 묶음 ${v} > 목표 ${p.goal(slots[i].t)} (이미 팔린 ${sold})`);
        }
      }
      return bad;
    });
    assert.deepStrictEqual(r.slice(0, 5), []);
  } finally {
    await browser.close();
  }
});

test("예상(먼 타임 · 빨리 차는지): 같은 요일 지난주 70% · 3주 평균 10% · 추세 10% · 오늘 10% · 기록이 없으면 지금 수준", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(DESK);
    const nh = await page.evaluate(() => ({ f: window.__deskTest.capNoHist(10, 20), c: window.__deskTest.capForecast({ t: 900, used: 5 }, 1) }));
    assert.ok(Math.abs(nh.f - 11) < 1e-9, "0.9 × 10 + 0.1 × 20 = 11");
    assert.deepStrictEqual([nh.c.past, nh.c.demand], [0, 5], "과거 없음 · 속도 0 → 지금 예약 5 그대로");
    const mix = await page.evaluate(() => [window.__deskTest.capMix([10, 6, 4], 8), window.__deskTest.capMix([], 5), window.__deskTest.capMix([10], null)]);
    assert.ok(Math.abs(mix[0] - (0.7 * 10 + 0.1 * (20 / 3) + 0.1 * 13 + 0.1 * 8)) < 1e-9, "70/10/10/10 — 추세 = 10 + (10 − 4) / 2 = 13 · " + mix[0]);
    assert.strictEqual(mix[1], 5, "과거가 없으면 오늘 것만");
    assert.ok(Math.abs(mix[2] - 10) < 1e-9, "있는 것만으로 비율을 나눔");
    const types = await page.evaluate(() => ["2026-10-08", "2026-10-10", "2026-10-11", "2026-10-09", "2026-10-07"].map(window.__deskTest.dayType));
    assert.deepStrictEqual(types, ["목", "토", "일", "공휴일", "수"], "10/9 한글날 = 공휴일");
  } finally {
    await browser.close();
  }
});

// 사장님 10/24: 현장은 늘 5장(열쇠 45 − 네이버 40)을 씀 · 6개 나가면 넘은 1개(반납이 늦은 것)가 있는 동안 네이버 39 · 7개면 38
test("현장 몫 5장: 현장 열쇠가 5개를 넘게 나가면 넘은 열쇠(반납이 늦은 것부터)가 안에 있는 동안 그 시각 네이버 목표를 그만큼 낮춤 (6 → 39 · 7 → 38)", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(DESK);
    const rows = [["12:00", 8, 12], ["12:30", 8, 8], ["13:00", 8, 8], ["13:30", 10, 10], ["14:00", 6, 10], ["14:30", 3, 10], ["15:00", 5, 10], ["15:30", 4, 10], ["16:00", 0, 10], ["16:30", 0, 10]];
    const five = ["14:20", "14:20", "14:50", "15:00", "15:00"].map((t) => ({ to: m(t) }));
    const none = await runPlan(page, rows, "13:35");
    const r5 = await runPlan(page, rows, "13:35", { walkOut: five });
    const r6 = await runPlan(page, rows, "13:35", { walkOut: five.concat([{ to: m("15:10") }]) });
    const r7 = await runPlan(page, rows, "13:35", { walkOut: five.concat([{ to: m("15:10") }, { to: m("15:40") }]) });
    assert.deepStrictEqual(r5.to, none.to, "현장 5개까지는 네이버 그대로");
    const g = (r) => ["14:00", "14:30", "15:00", "15:30", "16:00"].map((t) => r.goal[m(t)]);
    assert.deepStrictEqual(g(r6), [39, 39, 39, 40, 40], "6개: 넘은 1개(15:10 반납)가 있는 동안 39");
    assert.deepStrictEqual(g(r7), [38, 38, 38, 39, 40], "7개: 반납이 늦은 2개 — 15:10 까지 38 · 15:40 까지 39");
    for (const t of ["14:30", "15:00"]) assert.ok(r7.wins[m(t)] <= r7.goal[m(t)], `${t} 묶음 ${r7.wins[m(t)]} ≤ ${r7.goal[m(t)]}`);
  } finally {
    await browser.close();
  }
});

test("데스크 계획: 현장 손님은 네이버 수에 안 들어감 · 현장 몫 5장을 넘게 나가면 목표를 낮춤 · 표(◐ 곧 다가오는 타임 · ● 바꾸는 타임 · 황금) · 황금시간 저장", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 10/5(휴일) 13:50
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const plan = () => page.evaluate(() => { const p = window.__deskTest.capPlan(); return { to: p.plan.map((c) => `${c.t}:${c.to}`).join(" "), inside: p.inside, walk: p.insideWalk, out: p.walkOut, goal: p.goal(840), adj: p.adj, win: p.slots.filter((x) => !x.started).map((x) => p.win(x.t)) }; });
    const a = await plan();
    assert.strictEqual(a.adj.length, 6, "곧 다가오는 타임 + 뒤 5타임");
    assert.ok(a.win.every((v) => v <= 40), a.win.join(" "));
    await page.evaluate(() => { const T = window.__deskTest; T.walkin("01011110000", [41, 42, 43], 830, 810); T.walkin("01011110001", [44, 45, 40], 830, 810); });
    const b = await plan();
    assert.deepStrictEqual([b.inside, b.walk, b.out], [a.inside, a.walk + 6, a.out + 6], "안에 있는 손님: 네이버 그대로 · 현장 +6");
    assert.strictEqual(b.goal, 40 - Math.max(0, b.out - 5), `현장 열쇠 ${b.out}개 → 14:00 목표 ${b.goal}`);
    const A = await page.evaluate(() => window.__deskTest.RULES.capAuto);
    assert.deepStrictEqual([A.target, A.max, A.popular], [40, 13, { from: "12:30", to: "15:30" }]);
    await page.dblclick("#now"); await page.click('[data-t="naver"]');
    const marks = await page.$$eval("#sheet .captable tr td:first-child", (e) => e.map((x) => x.textContent.replace(/\s+/g, " ").trim()));
    assert.ok(marks.some((x) => /◐/.test(x)) && marks.some((x) => /● 황금/.test(x)), marks.join(" | "));
    assert.match(await page.textContent("#sheet"), /황금시간/);
    assert.match(await page.textContent("#sheet"), /곧 다가오는 타임 \(늘리지 않음 · 남는 자리는 현장 키 몫\)/);
    await page.selectOption("#cap-pop-to", "16:00");
    assert.deepStrictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("astanakiz-capauto")).popular), { from: "12:30", to: "16:00" }, "황금시간 저장");
    assert.deepStrictEqual(errs, []);
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

test("수량조절 설정 2번 모양 (사장님 10/24): 한 타임 최대 13 그대로 · 예전에 저장된 목표 42는 한 번만 네이버 40으로 바꿔 저장 · 그 뒤에 바꾼 값은 그대로", async () => {
  const browser = await launch();
  try {
    const load = async (saved) => {
      const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
      const page = await ctx.newPage();
      await page.addInitScript((sv) => {
        window.__sets = [];
        const cfg = { build: "2.3", capAuto: sv };
        window.desk = {
          naver: { load: async (day) => ({ ok: true, day, slots: [], bookings: [] }), complete: async () => ({ ok: true }) },
          state: { load: () => null, save: () => {} },
          config: { get: async () => cfg, set: async (patch) => { window.__sets.push(JSON.parse(JSON.stringify(patch))); Object.assign(cfg, patch); return { ok: true }; } },
        };
      }, saved);
      await page.goto(DESK);
      await page.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 15000 });
      const r = await page.evaluate(() => ({ A: window.__deskTest.RULES.capAuto, sets: window.__sets.filter((x) => x.capAuto).map((x) => x.capAuto) }));
      await ctx.close();
      return r;
    };
    const old = await load({ on: true, target: 42, ceiling: 43, max: 13, visible: 10, ahead: 3, every: 10, product: "1시간 50분" });
    assert.deepStrictEqual([old.A.max, old.A.target, old.A.v, old.A.on], [13, 40, 2, true], "예전 기본 목표 42 → 네이버 40 · 최대 13 그대로 (켜 둔 것도 그대로)");
    assert.ok(old.sets.some((x) => x.target === 40 && x.v === 2), "바꾼 값을 저장");
    const mine = await load({ on: true, target: 38, ceiling: 43, max: 12, v: 1 });
    assert.deepStrictEqual([mine.A.max, mine.A.target], [12, 38], "사장님이 바꾼 값(예전 기본이 아님)은 그대로");
    const now = await load({ v: 2, on: true, target: 42, ceiling: 43, max: 13 });
    assert.deepStrictEqual([now.A.target, now.sets.length], [42, 0], "새 모양으로 저장한 값은 사장님이 고른 값 → 그대로 · 저장 안 함");
    const none = await load(undefined);
    assert.deepStrictEqual([none.A.max, none.A.target], [13, 40], "처음 설치 = 다음 타임 최대 13 · 네이버 40");
  } finally {
    await browser.close();
  }
});

// 사장님 10/9: 고객에게 보이는 잔여(회차당 수량 − 예약)는 10장을 넘지 않게 — 목표 13이어도 한 번에 열지 않고 예약이 늘수록 천천히
test("네이버에 보이는 잔여는 10장 이하: 목표 13이면 10 → 예약 1명 잔여 9 → 2명 9 → 3명 8 → … → 13 · 이미 13 열린 먼 타임은 예약 + 10으로", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 10/5(휴일) 13:50
    const v = await page.evaluate(() => [[13, 0], [13, 1], [13, 2], [13, 6], [13, 12], [13, 13], [8, 0], [10, 3], [13, 15]].map(([p, b]) => window.__deskTest.capVisible(p, b)));
    assert.deepStrictEqual(v, [10, 10, 11, 11, 13, 13, 8, 10, 15], "회차당 수량 = 예약 + ⌊10 × (목표 − 예약) ÷ 목표 + 0.6⌋, 10 이하 목표는 그대로");
    // 사장님 10/24: 예약할 때마다 보이는 잔여가 줄어야 — 예약 0 → 10 · 1 → 9 · 2 → 9 · 3 → 8 … (예약한 사람이 다시 봐도 '10팀'이 맞게)
    const left = await page.evaluate(() => Array.from({ length: 14 }, (_, b) => window.__deskTest.capVisible(13, b) - b));
    assert.deepStrictEqual(left, [10, 9, 9, 8, 7, 6, 5, 5, 4, 3, 2, 2, 1, 0], "보이는 잔여가 예약마다 줄어듦");
    assert.ok(left.every((x, i) => i === 0 || x <= left[i - 1]), "늘어나지 않음");
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

test("데스크: 열쇠를 일찍 반납하면 — 네이버 계획(예약 합)은 그대로 · 그 자리는 현장 판매 가능 수로 (사장님 10/24)", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 10/5(휴일) 13:50
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const look = () => page.evaluate(() => ({ win: window.__deskTest.capPlan().win(840), all: window.__deskTest.projection().all }));
    const before = await look();
    await page.click('.key[data-k="7"]'); // 서도현 13:00 입장 · 14:50 반납 예정 → 지금 반납(일찍 나감)
    await page.click("[data-act=returnAll]");
    const after = await look();
    assert.strictEqual(after.win, before.win, `네이버 14:00 묶음은 예약대로 ${before.win}`);
    assert.strictEqual(after.all, before.all + 1, `일찍 비운 자리 → 현장 판매 가능 ${before.all} → ${after.all}`);
    // 수량 자동조절을 하는 날은 아직 시작 안 한 타임의 네이버 남은 수량도 다 팔린다고 셈 → 현장 판매 가능이 그만큼 줄어듦 (사장님 10/24)
    const on = await page.evaluate(() => { window.__deskTest.RULES.capAuto.on = true; return window.__deskTest.projection().all; });
    assert.ok(on < after.all, `네이버 남은 수량 몫을 남김 ${after.all} → ${on}`);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("데스크 [지금 한 번 조절] → 네이버 칸의 회차당 수량이 바뀜 (휴일 13:56 · 곧 다가오는 타임 + 뒤 5타임)", async () => {
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
    // 바꾼 수량 = 기록대로 · 곧 다가오는 14:00 은 안 늘림 · 어느 입장 시각도 그 타임 + 앞 3타임 네이버 수 ≤ 40
    for (const x of log) assert.strictEqual(capAt(x.t), x.to, `${x.t} 기록대로`);
    assert.ok(!log.some((x) => x.t === "14:00" && x.to > x.from), "곧 다가오는 14:00 은 안 늘림");
    assert.strictEqual(capAt("13:30"), 10, "이미 시작한 타임은 그대로");
    const inside = await desk.evaluate(() => { const p = window.__deskTest.capPlan(); return p.slots.filter((x) => !x.started).map((x) => p.win(x.t)); });
    assert.ok(inside.every((v) => v <= 40), "어느 입장 시각도 네이버 ≤ 40: " + inside.join(" "));
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
    assert.deepStrictEqual(adj, [600, 630, 660, 690, 720, 750], "그날 첫 타임부터 6타임");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
