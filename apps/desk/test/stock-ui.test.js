/* 네이버 재고 자동 오픈 (사장님 10/20) — 데스크 운영 설정 → 수량 자동조절 맨 위 줄
   - 켜기 · 끄기 (앱 본체 settings.stockAuto) · [확인만 해 보기](바꾸지 않고 열 날만) · [지금 한 번 열기](묻고 나서) · 진행 · 결과 알림
   - 매일 10:30 → 실패하면 12:00 · 16:00 · 20:20 (앱 본체가 함) — 데스크는 다음 때 · 오늘 끝남을 보여 줌 */
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  ({ chromium } = require("/opt/node-tools/node_modules/playwright"));
}
const DESK = "file://" + path.join(__dirname, "..", "..", "..", "prototype", "desk.html");
const launch = () => chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const P0 = "평일 무제한 / 휴일 1시간 50분 입장권", P1 = "야간자유 입장권";

test("재고 자동 오픈(앱): 켜기 · 확인만 · 지금 한 번(묻고) · 진행 · 실패 알림 · 다음 때 · 성공하면 오늘 끝남", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await page.clock.install({ time: new Date("2026-10-20T11:00:00") });
    await page.addInitScript(([P0, P1]) => {
      const cfg = { build: "1.52" };
      const prod = (name, extra) => Object.assign({ name, plan: ["2026-11-19"], done: [], already: [], failed: [], skipped: [], noSlots: [], last: "2026-11-18", why: "" }, extra || {});
      window.__st = { runs: [], cfgSets: [] };
      let view = { ok: true, job: null, last: null, doneDay: "", tried: { day: "2026-10-20", slots: [0] }, cfg: { on: false, qty: 10, ahead: 30, products: [P0, P1], skip: [] }, times: ["10:30", "12:00", "16:00", "20:20"] };
      let done = null;
      window.__stDone = (v) => done && done(v);
      window.__stView = (patch) => { view = Object.assign({}, view, patch); return view; };
      window.desk = {
        naver: { load: async (day) => ({ ok: true, day, slots: [], bookings: [] }), complete: async () => ({ ok: true }) },
        state: { load: () => null, save: () => {} },
        config: { get: async () => cfg, set: async (p) => { window.__st.cfgSets.push(p); if (p.stockAuto) view.cfg = Object.assign({}, view.cfg, p.stockAuto); return { ok: true }; } },
        stock: {
          job: async () => JSON.parse(JSON.stringify(view)),
          run: async (o) => { window.__st.runs.push(o); view.job = { running: true, dry: !!o.dry, auto: false, today: "2026-10-20", target: "2026-11-19", qty: 10, at: "2026-10-20 11:00", step: "네이버 예약상품 열기", products: [prod(P0), prod(P1)] }; return JSON.parse(JSON.stringify(view)); },
          onDone: (cb) => { done = cb; },
        },
      };
      window.__prod = prod;
    }, [P0, P1]);
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    await page.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 15000 });
    await page.dblclick("#now");
    await page.click('[data-t="naver"]');
    assert.match(await page.textContent("#st-row"), /네이버 재고 자동 오픈 꺼짐[\s\S]*매일 10:30 \(실패하면 12:00 · 16:00 · 20:20\) 오늘 \+ 30일을 두 상품 회차마다 10개/);
    // 켜기
    await page.click("[data-act=stToggle]");
    await page.waitForFunction(() => /켜짐/.test(document.querySelector("[data-act=stToggle]").textContent));
    assert.deepStrictEqual((await page.evaluate(() => window.__st.cfgSets)).filter((p) => p.stockAuto).map((p) => p.stockAuto.on), [true]);
    assert.match(await page.textContent("#st-text"), /다음 12:00/, "10:30 은 써 봤고 지금 11:00 → 다음 12:00");
    assert.match(await page.textContent("#toast"), /켰어요[\s\S]*오늘은 12:00에 처음/, "켜자마자 돌지 않음");
    // 확인만 해 보기 → 진행 → 끝 알림 (열 날)
    await page.click("[data-act=stDry]");
    assert.deepStrictEqual(await page.evaluate(() => window.__st.runs), [{ dry: true }]);
    await page.clock.runFor(2500);
    assert.match(await page.textContent("#st-text"), /확인 중 — 네이버 예약상품 열기/);
    await page.evaluate(() => { const v = window.__stView({}); v.job = Object.assign({}, v.job, { running: false }); window.__stDone(JSON.parse(JSON.stringify(v))); });
    assert.match(await page.textContent("#toast"), /재고 확인만: 평일 무제한 열 날 11\/19 · 야간자유 열 날 11\/19/);
    // 지금 한 번 열기 → 묻고 → 실패 알림 (다음 12:00)
    page.once("dialog", (d) => d.accept());
    await page.click("[data-act=stNow]");
    assert.deepStrictEqual((await page.evaluate(() => window.__st.runs)).slice(-1), [{}]);
    await page.evaluate(() => { const v = window.__stView({ last: { at: "2026-10-20 11:00", auto: false, ok: false, target: "2026-11-19", why: "", products: [{ name: "x", done: [], failed: ["2026-11-19"], why: "기간 선택 창이 안 열림" }] } }); v.job = Object.assign({}, v.job, { running: false, auto: true, ok: false, products: [window.__prod("평일 무제한 / 휴일 1시간 50분 입장권", { why: "기간 선택 창이 안 열림", failed: ["2026-11-19"] })] }); window.__stDone(JSON.parse(JSON.stringify(v))); });
    assert.match(await page.textContent("#toast"), /네이버 재고 열기 실패: 기간 선택 창이 안 열림 — 12:00 다시/);
    assert.match(await page.textContent("#st-text"), /실패: 기간 선택 창이 안 열림 · 다음 12:00/);
    // 성공 → 오늘 끝남 (그날 남은 때는 안 함)
    await page.evaluate(() => { const v = window.__stView({ doneDay: "2026-10-20", last: { at: "2026-10-20 12:00", auto: true, ok: true, target: "2026-11-19", products: [{ name: "평일 무제한 / 휴일 1시간 50분 입장권", done: ["2026-11-19"], failed: [] }, { name: "야간자유 입장권", done: ["2026-11-19"], failed: [] }] } }); v.job = Object.assign({}, v.job, { running: false, dry: false, ok: true, products: [window.__prod("평일 무제한 / 휴일 1시간 50분 입장권", { done: ["2026-11-19"] }), window.__prod("야간자유 입장권", { done: ["2026-11-19"] })] }); window.__stDone(JSON.parse(JSON.stringify(v))); });
    assert.match(await page.textContent("#toast"), /네이버 재고를 열었어요 — 평일 무제한 11\/19 · 야간자유 11\/19 \(회차마다 10개\)/);
    const t = await page.textContent("#st-text");
    assert.match(t, /오늘 끝남 \(→ 11\/19\)/);
    assert.match(t, /마지막 12:00 자동 성공 \(평일 무제한 11\/19 · 야간자유 11\/19\)/);
    assert.doesNotMatch(t, /다음 \d/);
    const box = await page.evaluate(() => document.getElementById("sheet").getBoundingClientRect().bottom);
    assert.ok(box <= 768, "설정 창 안 " + box);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("재고 자동 오픈(체험판): 줄은 보이고 · 설치한 앱에서 한다고", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await page.goto(DESK);
    await page.dblclick("#now");
    await page.click('[data-t="naver"]');
    assert.match(await page.textContent("#st-text"), /체험판/);
    await page.click("[data-act=stNow]");
    assert.match(await page.textContent("#toast"), /설치한 앱/);
  } finally {
    await browser.close();
  }
});
