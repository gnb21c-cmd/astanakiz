/* 네이버 판매 수량 자동 조절 시험 (사장님 10/24 밤에 다시 정한 방법)
   - 처음엔 모든 타임 10장 · 미리 예상하지 않고 지금까지 들어온 예약만 보고 조금씩
   - 곧 다가오는 타임(A)이 매진이면 한 장 더(최대 13 · 10분에 한 장) — 뒤 3타임 중 예약이 가장 적은 타임에서 한 장 (앞 손님까지 넣은 네 타임 합 ≤ 40)
     늘린 자리가 안 팔리고 A 가 시작하면 돌려줌 · 뒤 3타임이 모두 1순위면 여러 장 산 팀만큼(2장마다 1장) 줄이지 않고 늘리고 그 3타임은 묶음(일찍 반납하면 풀림)
     뒤가 모두 매진이면 최대 11까지 · 18:00 · 18:30(저녁 몰림)은 미리부터 13 넘게 — 3순위 타임에서 줄여 17:00~18:30 · 18:00~19:30 합 ≤ 40
   - 데스크 → 가짜 네이버 예약현황: [지금 한 번 조절] 하면 네이버 칸의 회차당 수량이 실제로 바뀜 · 현장 판매는 열쇠 45개 안에서 계산한 수만큼 초록 · 0이면 빨강 */
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

const m = (s) => { const [h, mm] = s.split(":").map(Number); return h * 60 + mm; };
// 손님이 고르는 순위 (사장님 10/24): 1순위 10:00 · 12:00~15:30 · 18:00 / 2순위 10:30~11:00 · 16:00~16:30 · 18:30 / 3순위 그 밖 (11:30 · 17:00 · 17:30 · 19:00 · 19:30)
const PRIO = [[[600, 600], [720, 930], [1080, 1080]], [[630, 660], [960, 990], [1110, 1110]]];
const BOOST = [[1080, 1110]]; // 저녁 몰림 18:00 · 18:30
/** 한 번 조절: 행 [시각, 예약, 수량, 여러 장 산 팀의 (장수 − 1) 합?] · st = 이어 쓰는 기록 → { to, why, ops, st, wins(네 타임 합) } */
const step = (page, rows, nowS, st, extra = {}) => page.evaluate(([rows, now, st, extra, prio, boost]) => {
  const T = window.__deskTest;
  const slots = rows.map(([t, used, cap]) => ({ t, used, mainUsed: used, cap, started: t <= now, product: "P", stay: 110 }));
  const ext = Object.fromEntries(rows.map((r) => [r[0], r[3] || 0]));
  const adj = slots.filter((x) => !x.started).map((x) => x.t);
  const p = T.planCaps(slots, adj, Object.assign({ target: 40, max: 13, max11: 11, base: 10, prio, boost, state: st, bonus: (t) => ext[t] || 0 }, extra));
  T.capApply(st, p.ops, () => true);
  const to = Object.fromEntries(p.map((c) => [c.t, c.to]));
  const q = slots.map((x) => (x.started ? x.used : to[x.t] != null ? to[x.t] : x.cap));
  const wins = Object.fromEntries(slots.map((x, k) => [x.t, q.reduce((a, v, j) => a + (j <= k && slots[j].t + 110 > x.t ? v : 0), 0)]));
  return { to, why: Object.fromEntries(p.filter((c) => c.why).map((c) => [c.t, c.why])), ops: p.ops, st, wins };
}, [rows.map(([t, ...r]) => [m(t), ...r]), m(nowS), st, extra, PRIO, BOOST]);
const fresh = () => ({ loans: [], bonus: {}, locks: [], seq: 0 });
/** 계획한 수량을 다음 차례의 '지금 수량'으로 · 예약은 set 으로 바꿈 */
const next = (rows, r, set = {}) => rows.map(([t, used, cap, ex]) => [t, set[t] != null ? set[t] : used, r.to[m(t)] != null ? r.to[m(t)] : cap, ex]);

test("처음엔 모두 10 · 매진이 아니면 그대로 (곧 다가오는 타임에 잔여가 있으면 손대지 않음)", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(DESK);
    const rows = [["10:00", 4, 10], ["10:30", 7, 10], ["11:00", 9, 10], ["11:30", 2, 10], ["12:00", 8, 10], ["12:30", 10, 10], ["13:00", 6, 10]];
    const r = await step(page, rows, "10:05", fresh());
    assert.deepStrictEqual(Object.values(r.to), [10, 10, 10, 10, 10, 10], "바꿀 것 없음 (12:30 은 매진이어도 곧 다가오는 타임이 아님)");
    assert.deepStrictEqual(r.ops, []);
  } finally {
    await browser.close();
  }
});

test("곧 다가오는 타임 매진 → 한 장 더 · 뒤 3타임 중 예약이 가장 적은 타임에서 한 장 (앞 손님까지 넣은 네 타임 합 ≤ 40) · 30분에 3번 → 13 · 늘린 자리가 안 팔리면 돌려줌", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(DESK);
    // 14:05: 13:00 은 2장 안 팔림(공회전) · 14:30 매진
    let rows = [["12:30", 10, 10], ["13:00", 8, 10], ["13:30", 10, 10], ["14:00", 9, 10], ["14:30", 10, 10], ["15:00", 8, 10], ["15:30", 5, 10], ["16:00", 3, 10], ["16:30", 2, 10], ["17:00", 1, 10]];
    let st = fresh();
    let r = await step(page, rows, "14:05", st);
    assert.deepStrictEqual([r.to[m("14:30")], r.to[m("16:00")]], [11, 9], "14:30 → 11 · 예약이 가장 적은 16:00 → 9 " + JSON.stringify(r.why));
    for (const t of ["14:30", "15:00", "15:30", "16:00"]) assert.ok(r.wins[m(t)] <= 40, `${t} 네 타임 합 ${r.wins[m(t)]}`);
    st = r.st;
    assert.deepStrictEqual(st.loans.map((L) => [L.a, L.v, L.ok]), [[m("14:30"), m("16:00"), true]], "16:00 에서 빌림");
    // 14:15: 또 매진 → 12 · 16:00 은 15:00 때 네 타임 합(13:30 ~ 15:00)을 못 줄이므로 15:00 에서
    rows = next(rows, r, { "14:30": 11 });
    r = await step(page, rows, "14:15", st); st = r.st;
    assert.deepStrictEqual([r.to[m("14:30")], r.to[m("15:00")], r.to[m("16:00")]], [12, 9, 9]);
    // 14:25: 또 매진 → 13
    rows = next(rows, r, { "14:30": 12 });
    r = await step(page, rows, "14:25", st); st = r.st;
    assert.deepStrictEqual([r.to[m("14:30")], r.to[m("15:00")]], [13, 8]);
    for (const t of ["14:30", "15:00", "15:30", "16:00"]) assert.ok(r.wins[m(t)] <= 40, `${t} 네 타임 합 ${r.wins[m(t)]}`);
    // 14:28: 13 다 팔려도 더는 안 늘림
    rows = next(rows, r, { "14:30": 13 });
    r = await step(page, rows, "14:28", st); st = r.st;
    assert.strictEqual(r.to[m("14:30")], 13);
    assert.match(r.why[m("14:30")], /최대 13/);
    // 14:35: 14:30 이 시작 — 마지막 한 장이 안 팔렸다면(12/13) 마지막에 빌린 15:00 에 돌려줌 · 나머지 빌림은 끝
    rows = next(rows, r, { "14:30": 12 });
    r = await step(page, rows, "14:35", st); st = r.st;
    assert.deepStrictEqual([r.to[m("15:00")], r.to[m("16:00")]], [9, 9], "15:00 8 → 9 (돌려받음) · 16:00 은 그대로 9");
    assert.match(r.why[m("15:00")], /돌려받음/);
    assert.deepStrictEqual(st.loans, [], "빌림 정리");
  } finally {
    await browser.close();
  }
});

test("앞 손님이 꽉 차 있으면(네 타임 합이 40을 넘으면) 매진이어도 안 늘림 · 뒤 3타임이 모두 매진이면 줄이지 않고 최대 11까지", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(DESK);
    const full = [["13:00", 10, 10], ["13:30", 10, 10], ["14:00", 10, 10], ["14:30", 10, 10], ["15:00", 4, 10], ["15:30", 3, 10], ["16:00", 2, 10]];
    let r = await step(page, full, "14:05", fresh());
    assert.strictEqual(r.to[m("14:30")], 10, "13:00 ~ 14:00 이 꽉 차 14:30 때 41이 됨");
    assert.match(r.why[m("14:30")], /앞 손님까지/);
    // 뒤 3타임이 모두 매진 (줄일 곳 없음) → 11까지만
    let rows = [["13:00", 8, 10], ["13:30", 9, 10], ["14:00", 8, 10], ["14:30", 10, 10], ["15:00", 10, 10], ["15:30", 10, 10], ["16:00", 10, 10]];
    let st = fresh();
    r = await step(page, rows, "14:05", st); st = r.st;
    assert.strictEqual(r.to[m("14:30")], 11);
    assert.deepStrictEqual(r.ops.map((o) => o.kind), ["max11"]);
    rows = next(rows, r, { "14:30": 11 });
    r = await step(page, rows, "14:15", st);
    assert.strictEqual(r.to[m("14:30")], 11, "11 다 팔려도 그대로");
    assert.match(r.why[m("14:30")], /최대 11/);
  } finally {
    await browser.close();
  }
});

test("뒤 3타임이 모두 1순위: 여러 장 산 팀(2장 2건 · 3장 1건 → 한 장)만큼 줄이지 않고 늘림 · 그 3타임은 묶음 · 여러 장이 없으면 예약이 가장 적은 타임에서 (순위 상관없이)", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(DESK);
    // 11:30(3순위) 매진 · 뒤 12:00 · 12:30 · 13:00 은 1순위 · 11:30 에 여러 장 산 팀 (장수 − 1)의 합 = 2
    let rows = [["10:00", 6, 10], ["10:30", 7, 10], ["11:00", 8, 10], ["11:30", 10, 10, 2], ["12:00", 6, 10], ["12:30", 4, 10], ["13:00", 3, 10], ["13:30", 2, 10]];
    let st = fresh();
    let r = await step(page, rows, "11:05", st); st = r.st;
    assert.deepStrictEqual([r.to[m("11:30")], r.to[m("12:00")], r.to[m("12:30")], r.to[m("13:00")]], [11, 10, 10, 10], "줄이지 않고 11:30 → 11");
    assert.deepStrictEqual(st.locks, [m("12:00"), m("12:30"), m("13:00")], "뒤 1순위 3타임 묶음");
    assert.deepStrictEqual(st.bonus, { [m("11:30")]: 1 });
    // 11:15 또 매진 — 여러 장은 다 씀 · 뒤 3타임은 묶음이라 못 줄임 → 11 그대로
    rows = next(rows, r, { "11:30": 11 });
    r = await step(page, rows, "11:15", st); st = r.st;
    assert.strictEqual(r.to[m("11:30")], 11);
    // 묶인 12:00 이 곧 다가오는 타임이 되어 매진이어도 안 늘림
    rows = next(rows, r, { "12:00": 10 });
    r = await step(page, rows, "11:35", st);
    assert.strictEqual(r.to[m("12:00")], 10, "묶음 — 일찍 반납한 열쇠가 생길 때까지");
    // 여러 장이 없으면: 순위 상관없이 뒤 3타임 중 예약이 가장 적은 13:00 에서
    rows = [["10:00", 6, 10], ["10:30", 7, 10], ["11:00", 8, 10], ["11:30", 10, 10, 1], ["12:00", 6, 10], ["12:30", 4, 10], ["13:00", 3, 10], ["13:30", 2, 10]];
    r = await step(page, rows, "11:05", fresh());
    assert.deepStrictEqual([r.to[m("11:30")], r.to[m("13:00")]], [11, 9]);
  } finally {
    await browser.close();
  }
});

test("저녁 몰림 18:00 · 18:30: 곧 다가오지 않아도 매진이면 한 장씩 · 13 넘게 · 3순위(17:00 · 17:30 · 19:00 · 19:30)에서 예약이 적은 순으로 줄여 17:00~18:30 · 18:00~19:30 합 ≤ 40 · 2순위 16:30 은 안 줄임", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(DESK);
    let rows = [["15:00", 10, 10], ["15:30", 9, 10], ["16:00", 9, 10], ["16:30", 6, 10], ["17:00", 3, 10], ["17:30", 2, 10], ["18:00", 10, 10], ["18:30", 6, 10], ["19:00", 2, 10], ["19:30", 1, 10]];
    let st = fresh();
    let r = await step(page, rows, "16:05", st); st = r.st;
    assert.strictEqual(r.to[m("18:00")], 11, JSON.stringify(r.why));
    assert.deepStrictEqual([r.to[m("17:30")], r.to[m("19:30")]], [9, 9], "17:30(예약 2) · 19:30(예약 1)에서 한 장씩");
    assert.strictEqual(r.to[m("16:30")], 10, "2순위는 안 줄임");
    // 18:00 이 계속 팔림 → 한 장씩 13 넘게
    let b18 = 11;
    for (const now of ["16:15", "16:25", "16:35", "16:45", "16:55"]) {
      rows = next(rows, r, { "18:00": b18 });
      r = await step(page, rows, now, st); st = r.st;
      b18 = r.to[m("18:00")];
      for (const t of ["18:00", "18:30", "19:00", "19:30"]) assert.ok(r.wins[m(t)] <= 40, `${now} ${t} 네 타임 합 ${r.wins[m(t)]}`);
    }
    assert.ok(b18 >= 14, "18:00 → " + b18);
    for (const t of ["17:00", "17:30", "19:00", "19:30"]) assert.ok(r.to[m(t)] >= rows.find((x) => x[0] === t)[1], `${t} 예약 밑으로는 안 줄임`);
  } finally {
    await browser.close();
  }
});

test("무작위 300번: 예약 밑으로 안 줄임 · 늘리는 건 매진된 곧 다가오는 타임(최대 13) · 저녁 몰림 타임 · 돌려받는 타임뿐 · 한 번에 한 장 · 줄이는 타임은 잔여가 있던 타임", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(DESK);
    const bad = await page.evaluate(([prio, boost]) => {
      const T = window.__deskTest, bad = [];
      let seed = 41; const rnd = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
      for (let k = 0; k < 300; k++) {
        const now = 595 + 10 * rnd(57);
        const slots = Array.from({ length: 20 }, (_, i) => { const t = 600 + 30 * i, cap = 6 + rnd(9), used = Math.min(cap, rnd(cap + 3)); return { t, used, mainUsed: used, cap, started: t <= now, product: "P", stay: 110 }; });
        const adj = slots.filter((x) => !x.started).map((x) => x.t);
        if (!adj.length) continue;
        const st = { loans: [], bonus: {}, locks: [], seq: 0 };
        const p = T.planCaps(slots, adj, { target: 40, max: 13, max11: 11, base: 10, prio, boost, state: st, bonus: () => rnd(4) });
        const A = adj[0];
        for (const c of p) {
          const x = slots.find((y) => y.t === c.t);
          if (c.to < x.mainUsed) bad.push(`${k} ${c.t} 예약 밑 ${c.to} < ${x.mainUsed}`);
          if (c.to > x.cap + 1) bad.push(`${k} ${c.t} 한 번에 두 장 넘게`);
          if (c.to > x.cap && c.t !== A && !boost.some((r) => c.t >= r[0] && c.t <= r[1])) bad.push(`${k} ${c.t} 곧 다가오는 타임도 저녁 몰림도 아닌데 늘림`);
          if (c.to > x.cap && x.mainUsed < x.cap) bad.push(`${k} ${c.t} 매진이 아닌데 늘림`);
          if (c.t === A && c.to > Math.max(13, x.cap) && !boost.some((r) => c.t >= r[0] && c.t <= r[1])) bad.push(`${k} ${c.t} 13 넘음`);
          if (c.to < x.cap && x.cap - x.mainUsed <= 0) bad.push(`${k} ${c.t} 잔여 없는 타임을 줄임`);
        }
      }
      return bad;
    }, [PRIO, BOOST]);
    assert.deepStrictEqual(bad.slice(0, 5), []);
  } finally {
    await browser.close();
  }
});

test("데스크: 여러 장 산 팀 셈 (같은 전화번호는 나눠 예약해도 합침) · 매시 5 · 15 · 25 … 분에만 조절 · 일찍 반납하면 묶음이 풀림", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 10/5(휴일) 13:50
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const ex = await page.evaluate(() => {
      const T = window.__deskTest, d = T.today(), base = T.capTeamExtra(1110);
      T.addBooking(d, "18:30", "가", "01011112222", 2, {}); T.addBooking(d, "18:30", "나", "01011113333", 2, {}); // 2장 2건 → 2
      const a = T.capTeamExtra(1110) - base;
      T.addBooking(d, "18:30", "다", "01011114444", 1, {}); T.addBooking(d, "18:30", "다", "01011114444", 1, {}); // 나눠서 1 + 1 = 2장 → 1
      const b = T.capTeamExtra(1110) - base - a;
      T.addBooking(d, "18:30", "라", "01011115555", 3, {}); // 3장 1건 → 2
      return [a, b, T.capTeamExtra(1110) - base - a - b];
    });
    assert.deepStrictEqual(ex, [2, 1, 2]);
    // 매시 5분 단위로만 (10:00 · 10:04 는 안 함)
    const runs = await page.evaluate(() => {
      const T = window.__deskTest; T.RULES.capAuto.on = true;
      const seen = [];
      for (const t of [595, 600, 604, 605, 609, 615, 620, 625]) { T.setNow(t); const n = T.capLog.length; T.capTick(); seen.push([t, T.capLog.length > n]); }
      return seen;
    });
    await page.waitForTimeout(300);
    assert.deepStrictEqual(runs.filter(([, r]) => r).map(([t]) => t), [595, 605, 615, 625], JSON.stringify(runs));
    // 묶음은 예정보다 일찍 반납한 열쇠가 생기면 풀림 (예정 시간이 지난 반납은 그대로)
    const lk = await page.evaluate(() => {
      const T = window.__deskTest; T.setNow(830);
      T.capLock([900, 930]);
      const late = T.holders2().find((h) => h.end != null && h.end <= 830);
      if (late) T.returnKeys(late.id, late.keys.slice(0, 1));
      const kept = T.capState().locks.length;
      const early = T.holders2().find((h) => h.end != null && h.end > 840 && h.keys.length);
      T.returnKeys(early.id, early.keys.slice(0, 1));
      return { late: !!late, kept, after: T.capState().locks.length, msg: T.capLog[0].msg || "" };
    });
    assert.ok(!lk.late || lk.kept === 2, "늦은 반납은 그대로");
    assert.deepStrictEqual([lk.after, /일찍 반납/.test(lk.msg)], [0, true], JSON.stringify(lk));
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("데스크 계획 화면: 순위 · 저녁 몰림 칸 저장 (17:00 은 3순위) · 표(◐ 곧 다가오는 타임 · 순위 · 까닭) · 예전 기본 순위는 한 번만 새 기본으로", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 10/5(휴일) 13:50
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const A = await page.evaluate(() => window.__deskTest.RULES.capAuto);
    assert.deepStrictEqual([A.target, A.max, A.prio, A.boost], [40, 13, { p1: "10:00, 12:00~15:30, 18:00", p2: "10:30~11:00, 16:00~16:30, 18:30", p3: "11:30, 17:00, 17:30, 19:00, 19:30" }, "18:00, 18:30"]);
    const rk = await page.evaluate(() => { const p = window.__deskTest.capPlan(); return ["10:00", "11:30", "12:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00"].map((t) => p.rankOf(+t.slice(0, 2) * 60 + +t.slice(3))); });
    assert.deepStrictEqual(rk, [1, 3, 1, 2, 3, 3, 1, 2, 3]);
    const plan = await page.evaluate(() => window.__deskTest.capPlan().adj);
    assert.strictEqual(plan[0], 840, "곧 다가오는 타임 14:00 부터 오늘 끝까지");
    await page.dblclick("#now"); await page.click('[data-t="naver"]');
    const marks = await page.$$eval("#sheet .captable tr td:first-child", (e) => e.map((x) => x.textContent.replace(/\s+/g, " ").trim()));
    assert.ok(marks.some((x) => /◐/.test(x)) && marks.some((x) => /저녁 몰림/.test(x)) && marks.every((x) => /[123]순위/.test(x)), marks.join(" | "));
    assert.match(await page.textContent("#sheet"), /매시 5 · 15 · 25 · 35 · 45 · 55분/);
    await page.fill("#cap-boost", "18:00");
    await page.press("#cap-boost", "Tab");
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("astanakiz-capauto")).boost), "18:00", "저녁 몰림 저장");
    await page.fill("#cap-p1", "10:00, 12:00~16:00, 18:00");
    await page.press("#cap-p1", "Tab");
    assert.strictEqual(await page.evaluate(() => window.__deskTest.capPlan().rankOf(960)), 1, "16:00 → 1순위로");
    assert.deepStrictEqual(errs, []);
    // 예전(ver.2.5) 기본 순위로 저장된 PC → 17:00 을 3순위로 한 번만 바꿈 · 사장님이 고친 순위는 그대로
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await p2.addInitScript(() => { if (!sessionStorage.getItem("x")) { sessionStorage.setItem("x", 1); localStorage.setItem("astanakiz-capauto", JSON.stringify({ v: 2, on: true, target: 40, max: 13, prio: { p1: "10:00, 12:00~15:30, 18:00", p2: "10:30~11:00, 16:00~17:00, 18:30", p3: "11:30, 17:30, 19:00, 19:30" } })); } });
    await p2.goto(DESK);
    const B = await p2.evaluate(() => window.__deskTest.RULES.capAuto);
    assert.deepStrictEqual([B.v, B.prio.p2, B.prio.p3, B.boost, B.on], [3, "10:30~11:00, 16:00~16:30, 18:30", "11:30, 17:00, 17:30, 19:00, 19:30", "18:00, 18:30", true]);
    await ctx.close();
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

test("데스크: 네이버가 40(아직 안 온 예약 포함) + 현장 5 = 열쇠 45 → 빈 열쇠가 있어도 현장입장 판매 불가 · [POS로 이동] 빨강 · 노랑(빈 좌석 확인) 없이 초록(그 수만큼) · 빨강", async () => {
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
    // 사장님 10/24 밤: 근무자에게 '빈 좌석 확인' 선택을 주지 않음 — 판매 가능 수만큼 초록
    await page.evaluate(() => window.__deskTest.setNow(990));
    const g = await page.evaluate(() => window.__deskTest.projection());
    assert.strictEqual(g.base, g.all, "기본 · 유동 구분 없음");
    if (g.all > 0) {
      await page.click(".key[data-k='41']");
      assert.match(await page.textContent("#sheet .banner"), /판매 가능/);
      assert.strictEqual(await page.$("#sheet [data-act=flexOk]"), null, "[빈 좌석 확인했어요] 없음");
      await page.click("#sheet [data-act=close]");
    }
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
    assert.deepStrictEqual([old.A.max, old.A.target, old.A.v, old.A.on], [13, 40, 3, true], "예전 기본 목표 42 → 네이버 40 · 최대 13 그대로 (켜 둔 것도 그대로)");
    assert.ok(old.sets.some((x) => x.target === 40), "바꾼 값을 저장");
    const mine = await load({ on: true, target: 38, ceiling: 43, max: 12, v: 1 });
    assert.deepStrictEqual([mine.A.max, mine.A.target], [12, 38], "사장님이 바꾼 값(예전 기본이 아님)은 그대로");
    const now = await load({ v: 3, on: true, target: 42, ceiling: 43, max: 13 });
    assert.deepStrictEqual([now.A.target, now.sets.length], [42, 0], "새 모양으로 저장한 값은 사장님이 고른 값 → 그대로 · 저장 안 함");
    const none = await load(undefined);
    assert.deepStrictEqual([none.A.max, none.A.target], [13, 40], "처음 설치 = 다음 타임 최대 13 · 네이버 40");
  } finally {
    await browser.close();
  }
});

// 사장님 10/9: 고객에게 보이는 잔여(회차당 수량 − 예약)는 10장을 넘지 않게 — 목표 13이어도 한 번에 열지 않고 예약이 늘수록 천천히

test("골든벨이 켜져도 저녁 잔여를 모두 0으로 만들지 않음 (사장님 10/24 저녁 ver.2.5): 계획은 원래 판 시간(1시간 50분)으로 · 지금 안에 있는 손님만 문 닫을 때까지", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 10/5(휴일)
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const at = (t) => page.evaluate((t) => {
      const T = window.__deskTest; T.setNow(t);
      const p = T.capPlan();
      const keys = T.holders().filter((h) => !h.walk && !h.svc).reduce((a, h) => a + h.keys.length, 0);
      return { golden: !document.getElementById("golden").hidden, stays: p.slots.filter((x) => x.t < 1080).map((x) => x.stay), tail: p.slots.reduce((a, x) => a + (x.tail || 0), 0), keys, plan: p.plan.filter((c) => c.t >= 1080).map((c) => ({ t: c.t, to: c.to, used: c.used })), win: p.slots.filter((x) => !x.started).map((x) => p.win(x.t)) };
    }, t);
    const before = await at(990);
    assert.strictEqual(before.golden, false);
    for (const t of [1050, 1085]) {
      const r = await at(t);
      assert.ok(r.golden, "골든벨 켜짐 (16:00 뒤 · 열쇠 20개 이하 · 남은 예약 5장 이하)");
      assert.ok(r.stays.every((v) => v === 110), "계획은 원래 판 시간 " + r.stays.join(","));
      assert.ok(r.tail <= r.keys + 5, `문 닫을 때까지 있는 손님 ${r.tail} = 지금 안에 있는 네이버 손님(${r.keys}) + 아직 안 온 예약(5장 이하)`);
      assert.ok(r.plan.some((c) => c.to > c.used), "저녁 타임에 잔여가 남음 " + JSON.stringify(r.plan));
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

test("데스크 [지금 한 번 조절] → 네이버 칸의 회차당 수량이 바뀜 (휴일 13:56 · 곧 다가오는 14:00 이 매진 → 한 장 더 · 뒤 3타임 중 예약이 가장 적은 타임에서 한 장)", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const naverPage = await ctx.newPage();
    await naverPage.goto(NAVER);
    await naverPage.evaluate(() => localStorage.clear());
    await naverPage.goto(NAVER);
    const naver = new NaverSync((code) => naverPage.evaluate(code), { urls: { list: NAVER + "?view=list", calendar: NAVER + "?view=calendar" } });
    // 14:00 을 매진으로 (수량 = 예약)
    const s0 = (await naver.loadDay("2026-10-05")).slots.filter((x) => /1시간 50분/.test(x.product));
    const b14 = s0.find((x) => x.time === "14:00");
    assert.ok((await naver.setCap({ day: "2026-10-05", product: b14.product, time: "14:00", n: b14.conf + b14.done })).ok);
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
    const log = await desk.evaluate(() => window.__deskTest.capLog.filter((x) => x.t));
    assert.ok(log.length >= 1 && log.every((x) => x.ok), JSON.stringify(log));
    const s = (await naver.loadDay("2026-10-05")).slots.filter((x) => /1시간 50분/.test(x.product));
    const capAt = (t) => s.find((x) => x.time === t).cap;
    for (const x of log) assert.strictEqual(capAt(x.t), x.to, `${x.t} 기록대로`);
    const n14 = b14.conf + b14.done;
    assert.strictEqual(capAt("14:00"), n14 + 1, "매진인 14:00 → 한 장 더");
    const cut = log.filter((x) => x.to < x.from);
    assert.ok(cut.length === 1 && ["14:30", "15:00", "15:30"].includes(cut[0].t), "뒤 3타임 중 한 타임에서 한 장 " + JSON.stringify(log));
    const fewest = Math.min(...["14:30", "15:00", "15:30"].map((t) => { const x = s0.find((y) => y.time === t); return x.conf + x.done; }));
    const cx = s0.find((y) => y.time === cut[0].t);
    assert.strictEqual(cx.conf + cx.done, fewest, "예약이 가장 적은 타임");
    assert.strictEqual(capAt("13:30"), 10, "이미 시작한 타임은 그대로");
    // 데스크 시간표 잔여도 바로 반영 (14:00: 매진 → 한 장 더 = 잔여 1)
    const c14 = await desk.$$eval('.slot[data-s="840"] .c', (e) => e.map((x) => x.textContent.trim()));
    assert.strictEqual(c14[2], "1");
    const st = await desk.evaluate(() => window.__deskTest.capState());
    assert.deepStrictEqual(st.loans.map((L) => [L.a, L.ok]), [[840, true]], "14:00 이 빌린 한 장 기록 (안 팔리면 돌려줌)");

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

    // 새벽(02:27)에 눌러도 그날 첫 타임부터 (현장 10/7)
    const adj = await desk.evaluate(() => { window.__deskTest.setNow(147); return window.__deskTest.capPlan().adj; });
    assert.strictEqual(adj[0], 600, "그날 첫 타임부터");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("이용완료가 먼저 (사장님 10/24 저녁 ver.2.5 — 이용완료가 갑자기 안 됨): 이용완료할 예약이 있으면 자동 수량 조절은 기다리고 이용완료부터 · 조절하는 중에 생기면 남은 칸은 다음 차례로", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const naverPage = await ctx.newPage();
    await naverPage.goto(NAVER);
    await naverPage.evaluate(() => localStorage.clear());
    await naverPage.goto(NAVER);
    const naver = new NaverSync((code) => naverPage.evaluate(code), { urls: { list: NAVER + "?view=list", calendar: NAVER + "?view=calendar" } });
    const b14 = (await naver.loadDay("2026-10-05")).slots.find((x) => x.time === "14:00" && /1시간 50분/.test(x.product));
    await naver.setCap({ day: "2026-10-05", product: b14.product, time: "14:00", n: b14.conf + b14.done }); // 14:00 매진 → 조절할 칸이 생김
    const desk = await ctx.newPage();
    await desk.clock.install({ time: new Date("2026-10-05T13:56:00") });
    let q = Promise.resolve();
    const serial = (fn) => (q = q.then(fn, fn));
    const calls = [];
    let inject = false;
    const pend = (no) => desk.evaluate((no) => { const T = window.__deskTest; const id = T.addBooking(T.today(), "13:30", "완료대기", "0105555" + no.slice(-4), 1, {}); Object.assign(T.bk(id), { no, status: "완료", naverPending: true, naverWhy: "" }); }, no);
    await desk.exposeFunction("__naverLoad", (day, only) => serial(() => naver.loadDay(day, { only })));
    await desk.exposeFunction("__naverComplete", (b) => serial(async () => { calls.push("완료 " + b.no); return { ok: true }; }));
    await desk.exposeFunction("__naverSetCap", (c) => serial(async () => {
      calls.push("수량 " + c.time);
      const r = await naver.setCap(c);
      if (inject) { inject = false; await pend("999002"); } // 조절하는 중에 근무자가 입장시킴
      return r;
    }));
    await desk.addInitScript(() => {
      window.desk = {
        naver: { load: (d, o) => window.__naverLoad(d, o), complete: (b) => window.__naverComplete(b), setCap: (c) => window.__naverSetCap(c) },
        state: { load: () => null, save: () => {} },
      };
    });
    const errs = [];
    desk.on("pageerror", (e) => errs.push(e.message));
    await desk.goto(DESK);
    await desk.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 30000 });

    // ① 이용완료할 예약이 있으면 10분 자동 조절은 기다리고(wait) 이용완료부터
    await pend("999001");
    assert.strictEqual(await desk.evaluate(() => window.__deskTest.capRun(false)), "wait");
    for (let i = 0; i < 50 && !calls.includes("완료 999001"); i++) await new Promise((r) => setTimeout(r, 100));
    assert.deepStrictEqual(calls, ["완료 999001"], "수량 조절 없이 이용완료만");

    // ② 조절하는 중에 이용완료할 예약이 생기면 → 그 칸까지만 하고 멈춤 → 이용완료 → 남은 칸은 다음 차례
    calls.length = 0; inject = true;
    await desk.evaluate(() => window.__deskTest.capRun(false));
    for (let i = 0; i < 50 && !calls.includes("완료 999002"); i++) await new Promise((r) => setTimeout(r, 100));
    assert.strictEqual(calls.filter((x) => /^수량/.test(x)).length, 1, "수량 한 칸만 바꾸고 멈춤: " + calls.join(" · "));
    assert.strictEqual(calls[calls.length - 1], "완료 999002", calls.join(" · "));
    const log = await desk.evaluate(() => window.__deskTest.capLog.slice());
    assert.ok(log.some((x) => /이용완료 먼저/.test(x.msg || "")), JSON.stringify(log));
    assert.ok(log.every((x) => x.ok), "미룬 칸은 실패로 안 셈 " + JSON.stringify(log));

    // ③ 근무자가 [지금 한 번 조절]을 누르면 기다리지 않음
    await pend("999003");
    calls.length = 0;
    await desk.evaluate(() => window.__deskTest.capRun(true));
    assert.ok(calls.some((x) => /^수량/.test(x)) || (await desk.evaluate(() => window.__deskTest.capLog[0].msg || "")).includes("바꿀 것 없음"), calls.join(" · "));
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
