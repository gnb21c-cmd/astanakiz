/* 비수기 평일(무제한)에 [오늘 수량조절]을 켠 날 (사장님 11/20 — "무제한이어도 중간 중간 나간단 말이지 · 무조건 0으로 만들면 장사하지 말라는 거야")
   10/21 정한 것: 켠 평일은 18:00 전 입장을 1시간 50분 머문다고 봄 (capForce · capMinutes · 현장 손님 반납 시각)
   그런데 11/07 상한 · 11/17 '현장 1명 = 네이버 1장'이 쓰는 자리 셈(capKeysParts)이 무제한을 '문 닫을 때까지'로 셈
   → 앞 타임의 안 온 예약 · 열린 잔여가 저녁까지 쌓여 상한 43을 넘었다고 보고 뒤 타임을 예약 수까지(잔여 0) 줄였음 (11/20 11:30 · 12:00 · 14:00 ~ 16:30 잔여 0)
   가짜 네이버 10/7(수 · 비수기 평일) — 실제 연동 코드로 */
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
const DAY = "2026-10-07";
const P0 = "평일 무제한 / 휴일 1시간 50분 입장권";
const launch = () => chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});

async function setup(browser, extra) {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const naverPage = await ctx.newPage();
  const q = `?day=${DAY}`;
  await naverPage.goto(NAVER + q);
  await naverPage.evaluate(() => localStorage.clear());
  await naverPage.goto(NAVER + q);
  await naverPage.evaluate(([day, extra]) => {
    let i = 0;
    db[day] = db[day] || []; // eslint-disable-line no-undef
    for (const [time, n, status] of extra) for (let k = 0; k < n; k++) db[day].push({ no: String(1388000000 + i), name: `평일${++i}`, phone: `010-7400-${String(1000 + i)}`, time, product: 0, qty: 1, status, done: 1, cancel: 0 }); // eslint-disable-line no-undef
    save(); // eslint-disable-line no-undef
  }, [DAY, extra]);
  await naverPage.goto(NAVER + q);
  const naver = new NaverSync((code) => naverPage.evaluate(code), { urls: { list: NAVER + `?view=list&day=${DAY}`, calendar: NAVER + `?view=calendar&day=${DAY}` }, today: () => DAY });
  const desk = await ctx.newPage();
  await desk.clock.install({ time: new Date(`${DAY}T10:55:00`) });
  let qq = Promise.resolve();
  const serial = (fn) => (qq = qq.then(fn, fn));
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
  // 맨 위 [오늘 수량조절] 켬 (그날만)
  await desk.evaluate((day) => { const A = window.__deskTest.RULES.capAuto; Object.assign(A, { target: 40, ceiling: 43, today: { day, on: true } }); window.__deskTest.setNow(655); }, DAY);
  const T = (fn, a) => desk.evaluate(fn, a);
  const plan = () => T(() => { const p = window.__deskTest.capPlan(); return p.skip ? { skip: p.skip } : Object.fromEntries(p.plan.map((c) => [c.t, [c.from, c.to, c.why || ""]])); });
  const capAt = async (time) => { const s = (await naver.read()).slots.find((x) => x.time === time && x.product === P0); return s ? s.avail + s.conf + s.done + s.apply : null; };
  return { desk, naver, T, plan, capAt, errs };
}

test("켠 평일 (무제한): 예약이 적으면 뒤 타임을 0 으로 줄이지 않음 — 18:00 전 입장은 1시간 50분 머문다고 봄 (10/21 정한 대로)", async () => {
  const browser = await launch();
  try {
    // 11/20 화면과 비슷하게: 10:00 이용완료 1 · 11:00 이용완료 2 + 확정 1 · 11:30 확정 1 · 16:30 확정 1
    const { T, plan, errs } = await setup(browser, [["10:00", 1, "완료"], ["11:00", 2, "완료"], ["11:00", 1, "확정"], ["11:30", 1, "확정"], ["16:30", 1, "확정"]]);
    assert.strictEqual(await T(() => window.__deskTest.capPlan().skip || ""), "", "켠 평일이라 계획을 세움");
    const p = await plan();
    const cut = Object.entries(p).filter(([, [from, to, why]]) => to < from && /상한|현장 손님/.test(why)).map(([t, v]) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")} ${v[0]}→${v[1]} ${v[2]}`);
    assert.deepStrictEqual(cut, [], "상한 때문에 줄인 타임 없음 (예전: 11:30 · 12:00 · 14:00 ~ 16:30 을 예약 수까지)");
    const late = Object.entries(p).filter(([t]) => Number(t) >= 840 && Number(t) < 1080).map(([, [, to]]) => to);
    assert.ok(late.length && late.every((n) => n >= 9), `14:00 ~ 17:30 은 그대로 팔 수 있게 (${late.join(", ")})`);
    // 현장 가능도 '끝까지'로 세지 않음 (42 − 열쇠 0 − 안 온 예약 1 = 41 무렵)
    const pj = await T(() => window.__deskTest.projection());
    assert.ok(pj.all >= 38, `현장 가능 ${pj.all} — ${pj.why}`);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("켠 평일 (무제한): 현장 2명 → 그 손님이 있을 1시간 50분 동안의 타임에서만 네이버 2장 (뒤 타임 전부가 아님)", async () => {
  const browser = await launch();
  try {
    const { T, plan, errs } = await setup(browser, [["11:00", 9, "확정"], ["11:30", 10, "확정"], ["12:00", 8, "확정"]]);
    await T(() => { window.__deskTest.walkin("01012340000", [21, 22], 655, 660); window.__deskTest.setNow(655); });
    const p = await plan();
    const cuts = Object.entries(p).filter(([, [from, to]]) => to < from).map(([t, [from, to]]) => [Number(t), from - to]);
    const total = cuts.reduce((a, [, n]) => a + n, 0);
    assert.ok(total <= 2, `현장 2명이면 2장까지 (${JSON.stringify(cuts)})`);
    assert.ok(cuts.every(([t]) => t < 655 + 110), `그 손님이 나가기(12:45) 전 타임에서만 (${JSON.stringify(cuts)})`);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("켠 평일: 깎였던 칸은 다음 조절 때 돌려놓음 (줄인 수를 기억 — 11/20 POS 처럼 이미 0 이 된 칸)", async () => {
  const browser = await launch();
  try {
    const { T, capAt, desk, errs } = await setup(browser, [["10:00", 1, "완료"], ["11:00", 1, "확정"]]);
    // 상한을 낮춰 일부러 많이 깎음 → 네이버에 넣음 (줄인 수 기억)
    await T(() => { window.__deskTest.RULES.capAuto.ceiling = 3; window.__deskTest.capRun(true); });
    await desk.waitForFunction(() => window.__deskTest.capLog.some((x) => x.t === "14:00") && window.__deskTest.capLog.some((x) => x.t === "16:00"), null, { timeout: 120000 }); // 한 칸씩 차례로 네이버에
    await desk.waitForTimeout(500);
    const cutNow = await capAt("14:00");
    assert.ok(cutNow < 10, `14:00 깎임 (${cutNow})`);
    assert.ok(Object.keys(await T(() => window.__deskTest.capState().trims || {})).length > 0, "줄인 수를 기억");
    // 상한을 43 으로 → 다음 조절에 돌려놓음
    await T(() => { window.__deskTest.RULES.capAuto.ceiling = 43; window.__deskTest.setNow(660); window.__deskTest.capRun(true); });
    const ok = await desk.waitForFunction(() => ["14:00", "16:00"].every((t) => window.__deskTest.capLog.some((x) => x.t === t && x.to === 10)), null, { timeout: 120000 }).then(() => true, () => false);
    if (!ok) console.log("DBG", JSON.stringify(await T(() => ({ log: window.__deskTest.capLog.slice(0, 30), plan: (() => { const p = window.__deskTest.capPlan(); return p.skip || p.plan.map((c) => [c.t, c.from, c.to, c.why]); })() }))));
    assert.strictEqual(await capAt("14:00"), 10, "14:00 다시 10");
    assert.strictEqual(await capAt("16:00"), 10, "16:00 다시 10");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
