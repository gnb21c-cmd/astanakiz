/* 네이버 블랙리스트 (사장님 11/16 — 네이버 예약 카드 이름 옆 빨간 '블랙리스트' 표시)
   ① 데스크가 처음 한 번 BC 원아웃 (이미 원아웃 이상이면 그대로 · 그 뒤 근무자가 바꾸면 그대로)
   ② 예약 상세의 '특이사항'을 데스크 메모로 (비었으면 넣고 · 근무자 메모가 한 줄이고 120자 안이면 아래 줄에 · 한 번만)
   가짜 네이버(?black=1)의 손님은 지어낸 이름 · 번호 */
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
const NOTE = "* 10/1 - 30분 늦게 나오심, 패널티 안 내고 가심. 예약자와 오신 분이 다름";

test("앱 본체: 목록 카드의 '블랙리스트' 표시 · 블랙리스트 카드만 예약 상세를 열어 '특이사항' · 다시 불러와도 이어받음", async () => {
  const browser = await launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await p.goto(NAVER + "?black=1");
    await p.evaluate(() => localStorage.clear());
    await p.goto(NAVER + "?black=1");
    const naver = new NaverSync((c) => p.evaluate(c), { urls: { list: NAVER + "?black=1&view=list", calendar: NAVER + "?black=1&view=calendar" }, today: () => "2026-10-05" });
    const steps = [];
    naver.onStep = (m) => steps.push(m);
    const r = await naver.loadDay("2026-10-05");
    assert.strictEqual(r.ok, true, r.why);
    const pick = (rr) => Object.fromEntries(rr.bookings.filter((x) => /차가온|한별이|탁보람|송다온/.test(x.name)).map((x) => [x.name, [x.black, x.bnote]]));
    assert.deepStrictEqual(pick(r), { 송다온: [false, null], 차가온: [true, NOTE], 한별이: [false, null], 탁보람: [true, ""] }, "블랙리스트만 · 칸에 1건(탁보람)은 바로 뜬 상세에서 · 특이사항이 비면 ''");
    assert.strictEqual(steps.filter((s) => /블랙리스트 특이사항/.test(s)).length, 1, "상세는 블랙리스트 카드(차가온)만 엶");
    steps.length = 0;
    const r2 = await naver.loadDay("2026-10-05", { only: "15:00" });
    assert.deepStrictEqual(pick(r2).차가온, [true, NOTE], "칸을 다시 읽어도 특이사항 이어받음");
    assert.strictEqual(steps.filter((s) => /블랙리스트 특이사항/.test(s)).length, 0, "다시 열지 않음");
  } finally {
    await browser.close();
  }
});

/** 데스크(앱처럼) + 가짜 네이버 + 메모 저장소(이 시험 안) */
async function openDesk(browser, notes0) {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const np = await ctx.newPage();
  await np.goto(NAVER + "?black=1");
  await np.evaluate(() => localStorage.clear());
  await np.goto(NAVER + "?black=1");
  const naver = new NaverSync((c) => np.evaluate(c), { urls: { list: NAVER + "?black=1&view=list", calendar: NAVER + "?black=1&view=calendar" }, today: () => "2026-10-05" });
  const desk = await ctx.newPage();
  await desk.clock.install({ time: new Date("2026-10-05T14:00:00") });
  let q = Promise.resolve();
  await desk.exposeFunction("__naverLoad", (day, only) => (q = q.then(() => naver.loadDay(day, { only }))));
  await desk.addInitScript((notes0) => {
    window.__notes = notes0; window.__sets = [];
    window.desk = {
      naver: { load: (d, o) => window.__naverLoad(d, o), complete: async () => ({ ok: true }) },
      state: { load: () => null, save: () => {} },
      config: { get: async () => ({ build: "2.23" }), set: async () => ({ ok: true }) },
      notes: {
        get: async ({ keys }) => ({ ok: true, notes: Object.fromEntries(keys.filter((k) => window.__notes[k]).map((k) => [k, window.__notes[k]])) }),
        set: async (job) => { const { key, ...n } = job; window.__sets.push(JSON.parse(JSON.stringify(job))); window.__notes[key] = Object.assign({}, n, { at: "2026-10-05 14:00" }); return { ok: true, note: window.__notes[key] }; },
        list: async () => ({ ok: true, list: [] }),
        patch: async () => ({ ok: true }),
      },
    };
  }, notes0);
  const errs = [];
  desk.on("pageerror", (e) => errs.push(e.message));
  await desk.goto(DESK);
  await desk.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 90000 });
  return { desk, errs };
}

test("데스크: 블랙리스트 손님 → 처음 한 번 BC 원아웃 · 특이사항을 메모로 · 이미 투아웃이면 그대로 · 근무자가 풀면 다시 안 올림", async () => {
  const browser = await launch();
  try {
    // 탁보람은 이미 투아웃 · 메모 있음 (특이사항은 비어 있음)
    const { desk, errs } = await openDesk(browser, { "01083003003": { m: "근무자 메모", k3: false, bc: 2, bl: true, nm: "탁보람", p4: "3003" } });
    await desk.waitForFunction(() => window.__sets.length >= 2, null, { timeout: 30000 });
    const N = () => desk.evaluate(() => window.__notes);
    let n = await N();
    assert.deepStrictEqual([n["01083003001"].bc, n["01083003001"].m, n["01083003001"].nm, n["01083003001"].p4, !!n["01083003001"].nb, !!n["01083003001"].nn], [1, NOTE, "차가온", "3001", true, true], "차가온: 원아웃 · 특이사항 → 메모");
    assert.deepStrictEqual([n["01083003003"].bc, n["01083003003"].m, !!n["01083003003"].nb, !!n["01083003003"].nn], [2, "근무자 메모", true, true], "탁보람: 투아웃 그대로 · 메모 그대로 (특이사항 없음)");
    assert.ok(!n["01083003002"], "한별이(블랙 아님)는 손대지 않음");
    assert.match(await desk.textContent("#toast"), /네이버 블랙리스트 손님: 차가온 — BC 원아웃 · 특이사항을 메모로/);
    // 고객 카드: '네이버 블랙리스트' · BC ① · 메모
    await desk.click('.slot[data-s="900"]');
    await desk.waitForFunction(() => [...document.querySelectorAll("#res .res")].some((e) => /차가온/.test(e.textContent)), null, { timeout: 60000 });
    const card = desk.locator("#res .res", { hasText: "차가온" }).first();
    assert.match(await card.getAttribute("class"), /bc1|bc2/, "카드 테두리 (원아웃 대응이 켜져 있으면)");
    await card.click();
    assert.match(await desk.textContent("#sheet"), /네이버 블랙리스트/);
    assert.strictEqual(await desk.inputValue("#note-m"), NOTE);
    assert.strictEqual(await desk.$eval('#sheet .bcdot[data-n="1"]', (e) => e.getAttribute("aria-pressed")), "true");
    // 근무자가 BC 를 풀고 메모를 지움 → 다시 불러와도 다시 안 올림
    await desk.click('#sheet .bcdot[data-n="1"]');
    await desk.fill("#note-m", "");
    await desk.click("#sheet [data-act=close]");
    await desk.clock.runFor(1000);
    n = await N();
    assert.deepStrictEqual([n["01083003001"].bc, n["01083003001"].m, !!n["01083003001"].nb], [0, "", true]);
    await desk.click('.slot[data-s="900"]');
    await desk.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 60000 });
    await desk.clock.runFor(2000);
    n = await N();
    assert.deepStrictEqual([n["01083003001"].bc, n["01083003001"].m], [0, ""], "근무자가 바꾼 대로");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("데스크: 근무자 메모가 한 줄이면 특이사항을 아래 줄에 · 넘치면 근무자 메모 그대로", async () => {
  const browser = await launch();
  try {
    const { desk, errs } = await openDesk(browser, { "01083003001": { m: "주차 자주 함", k3: false, bc: 0, bl: false } });
    await desk.waitForFunction(() => window.__notes["01083003001"] && window.__notes["01083003001"].nn, null, { timeout: 30000 });
    assert.strictEqual(await desk.evaluate(() => window.__notes["01083003001"].m), "주차 자주 함\n" + NOTE);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
  const b2 = await launch();
  try {
    const long = "가".repeat(80);
    const { desk } = await openDesk(b2, { "01083003001": { m: long, k3: false, bc: 0, bl: false } });
    await desk.waitForFunction(() => window.__notes["01083003001"] && window.__notes["01083003001"].nn, null, { timeout: 30000 });
    assert.deepStrictEqual(await desk.evaluate(() => [window.__notes["01083003001"].m, window.__notes["01083003001"].bc]), [long, 1], "넘치면 근무자 메모 그대로 · BC 원아웃은 함");
  } finally {
    await b2.close();
  }
});
