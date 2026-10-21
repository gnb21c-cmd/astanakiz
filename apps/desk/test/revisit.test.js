/* 재방문 간격 (사장님 10/19) — 데스크 화면 쪽: 입장 처리 때마다 그날 손님을 방문 기록에 · 매일 20:00 일수 모음을 보고 앱으로 · 지난 방문 기록 읽기
   - 방문 기록 · 일수 계산은 main(visit-history.js) — 여기서는 데스크가 무엇을 언제 넘기는지
   - 과거 = 4/1 ~ 이벤트 전날 · 이벤트 = 이벤트 시작일 ~ 종료일 · 보고 열쇠가 있을 때만 · 실패하면 10분 뒤 다시
   - 20:00 기준 (POS 가 켜져 있는 때 · 사장님 10/19): 보낸 뒤 이어서 지난 방문 기록 읽기(4/1 ~ 어제 · 그날 한 번) → 새로 읽은 날이 있으면 다 읽은 뒤 한 번 더 보냄
   - [지난 방문 기록 읽기]로 지금 바로도 · 영업 중(20:00 전)에는 한 번 더 눌러야 (네이버 불러오기가 느려져서) · 읽는 동안 진행 · 다 읽으면 바로 보냄 */
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

const STATS = { history: { from: "2026-04-01", to: "2026-10-26", days: 205 }, recent: { from: "2026-09-27", to: "2026-10-26", people: 120, revisits: 48, mode: { days: 7, count: 9 }, avg: 12.4, median: 9 },
  past: { from: "2026-04-01", to: "2026-10-25", revisits: 900, people: 400, top: [{ days: 7, count: 80 }, { days: 14, count: 61 }] }, event: { from: "2026-10-26", to: "2026-10-26", end: "2027-02-28", revisits: 0, people: 0, top: [] } };

async function setup(ctx, opts = {}) {
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date(opts.time || "2026-10-26T19:58:00") });
  await page.addInitScript((o) => {
    window.__hv = { add: [], stats: [], send: [], backfill: [], stop: 0, fail: !!o.fail, hist: o.hist || { from: "2026-10-26", to: "2026-10-26", days: 1, naver: 0 } };
    const cfg = { build: "1.50", hasSurveyKey: o.key !== false, surveyKeyTail: "ab12", visitEvent: { ver: 2, on: true, from: "2026-10-26", to: "2027-02-28", days: 20, gift: "수제돈까스" } };
    const BK = (no, time, name, phone, done) => ({ no, time, name, phone, qty: 1, qtyText: "1시간 50분 1", product: "1시간 50분", status: "확정", pay: "결제완료", doneCount: done, cancelCount: 0 });
    let job = null;
    const cp = (x) => JSON.parse(JSON.stringify(x)); // 앱 본체(IPC)처럼 복사본으로
    window.desk = {
      naver: { load: async (day) => ({ ok: true, day, slots: day === "2026-10-26" ? [{ time: "14:00", product: "1시간 50분", cap: 10, conf: 2, done: 0 }] : [], bookings: day === "2026-10-26" ? [BK("N1", "14:00", "김재방", "010-7777-0001", 3), BK("N2", "14:00", "이처음", "010-7777-0002", 0)] : [] }), complete: async () => ({ ok: true }) },
      state: { load: () => null, save: () => {} },
      config: { get: async () => cfg, set: async (patch) => { Object.assign(cfg, patch); window.__cfg = cfg; return { ok: true }; } },
      history: {
        add: async (j) => { window.__hv.add.push(j); return { ok: true }; },
        stats: async (q) => { window.__hv.stats.push(q); return { ok: true, stats: JSON.parse(JSON.stringify(window.__STATS)) }; },
        send: async (j) => { window.__hv.send.push(j); return window.__hv.fail ? { ok: false, code: 403, why: "열쇠나 모양이 틀림 (403)" } : { ok: true, code: 200 }; },
        backfill: async (j) => { window.__hv.backfill.push(j); job = { running: true, from: j.from, to: j.to, day: j.to, done: 0, total: 208, visits: 0, why: "" }; return cp({ ok: true, job, history: { from: "2026-10-26", to: "2026-10-26", days: 1, naver: 0 } }); },
        job: async () => cp({ ok: true, job, history: window.__hv.hist }),
        stop: async () => { window.__hv.stop++; if (job) job.stop = true; return cp({ ok: true, job }); },
      },
    };
    window.__job = (o2) => { Object.assign(job, o2); if (!job.running) window.__hv.hist = { from: "2026-04-01", to: "2026-10-26", days: 205, naver: 204 }; };
  }, opts);
  await page.addInitScript((s) => { window.__STATS = s; }, STATS);
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(DESK);
  await page.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 15000 });
  return { page, errs, hv: () => page.evaluate(() => window.__hv) };
}

test("재방문 간격(앱): 입장 처리 때마다 그날 손님 · 20:00 일수 모음을 보고 앱으로 (과거 4/1 ~ 이벤트 전날 · 이벤트 기간) · 실패 10분 뒤 다시", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const { page, errs, hv } = await setup(ctx, { fail: true, hist: { from: "2026-04-01", to: "2026-10-26", days: 205, naver: 204 } });
    // 입장 → 그날 이용완료 손님(전화번호)을 방문 기록에
    await page.click('.slot[data-s="840"]');
    await page.click('.res:has-text("김재방")');
    await page.click(".kpick button:not([disabled]):not(.on) >> nth=0");
    await page.click("#enter-done");
    await page.clock.runFor(1500);
    const adds = (await hv()).add;
    assert.deepStrictEqual(adds[adds.length - 1], { day: "2026-10-26", keys: ["01077770001"] }, "이용완료한 네이버 손님만 (이처음은 아직)");
    assert.strictEqual((await hv()).send.length, 0, "20:00 전엔 안 보냄");
    // 20:00 → 일수 모음을 보냄 (실패 → 10분 뒤 다시)
    await page.clock.runFor(2.5 * 60 * 1000);
    let h = await hv();
    assert.deepStrictEqual(h.stats[h.stats.length - 1], { today: "2026-10-26", past: { from: "2026-04-01", to: "2026-10-25" }, event: { from: "2026-10-26", to: "2027-02-28" } });
    assert.strictEqual(h.send.length, 1);
    const p = JSON.parse(h.send[0].json);
    assert.deepStrictEqual([p.type, p.v, p.day], ["astanakiz-revisit", 1, "2026-10-26"]);
    for (const k of ["history", "recent", "past", "event"]) assert.deepStrictEqual(p[k], STATS[k], k);
    assert.match(h.send[0].at, /^2026-10-26 20:0\d$/);
    assert.ok(!/010|김재방/.test(h.send[0].json), "손님 정보 없음");
    // 보낸 뒤(실패해도) 이어서 지난 방문 기록 읽기 — 4/1 ~ 어제 (POS 가 켜져 있는 20:00)
    assert.deepStrictEqual(h.backfill, [{ from: "2026-04-01", to: "2026-10-25" }], "20:00 보낸 뒤 저절로 지난 기록 읽기");
    assert.strictEqual((await page.evaluate(() => window.__cfg.revisit)).fillDay, "2026-10-26", "그날 한 번 (다시 켜도 그날 또 시작 안 함)");
    await page.clock.runFor(5 * 60 * 1000);
    assert.strictEqual((await hv()).send.length, 1, "실패 뒤 10분 안에는 안 보냄");
    await page.evaluate(() => { window.__hv.fail = false; });
    await page.clock.runFor(6 * 60 * 1000);
    h = await hv();
    assert.strictEqual(h.send.length, 2, "10분 뒤 다시");
    await page.clock.runFor(30 * 60 * 1000);
    assert.strictEqual((await hv()).send.length, 2, "그날은 한 번 (보낸 뒤엔 안 보냄)");
    // 읽기가 끝남(어제 하루 새로 읽음) → 바로 한 번 더 보냄 (20:00 것보다 새 것) · 그날 다시 읽기 시작은 안 함
    await page.evaluate(() => window.__job({ running: false, day: "2026-10-25", done: 1, total: 1, visits: 12, why: "" }));
    await page.clock.runFor(2500);
    assert.strictEqual((await hv()).send.length, 3, "새로 읽은 날이 있으면 다 읽은 뒤 한 번 더");
    await page.clock.runFor(10 * 60 * 1000);
    h = await hv();
    assert.deepStrictEqual([h.send.length, h.backfill.length], [3, 1], "그 뒤로 그날은 더 안 보내고 · 안 읽음");
    assert.strictEqual((await page.evaluate(() => window.__cfg.revisit)).sentDay, "2026-10-26", "보낸 날 저장 (다시 켜도 그날 또 안 보냄)");
    // 설정 → 설문조사 탭: 재방문 간격 줄
    await page.dblclick("#now");
    await page.click('[data-t="etc"]');
    assert.match(await page.textContent("#hv-text"), /기록 4\/1 ~ 10\/26 · 205일 · 마지막 20:\d\d 보냄/);
    const box = await page.evaluate(() => document.getElementById("sheet").getBoundingClientRect().bottom);
    assert.ok(box <= 768, "설정 화면 안 " + box);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("재방문 간격(앱): [지난 방문 기록 읽기] 4/1 ~ 어제 · 영업 중엔 한 번 더 눌러야 · 진행 · 멈춤 · 다 읽으면 바로 보냄 · 보고 열쇠가 없으면 안 보냄", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const { page, errs, hv } = await setup(ctx, { time: "2026-10-26T15:00:00" });
    await page.dblclick("#now");
    await page.click('[data-t="etc"]');
    assert.match(await page.textContent("#hv-text"), /^지난 기록은 20:00 에 저절로 읽어요 · 기록 10\/26 ~ 10\/26 · 1일 · 매일 20:00 보내요$/, "설정을 열면 앱 본체에 방문 기록을 다시 물음");
    await page.click("#sheet [data-act=hvBackfill]");
    assert.strictEqual((await hv()).backfill.length, 0, "영업 중 첫 누름은 안내만");
    assert.match(await page.textContent("#toast"), /영업 중.*한 번 더/);
    await page.click("#sheet [data-act=hvBackfill]");
    assert.deepStrictEqual((await hv()).backfill, [{ from: "2026-04-01", to: "2026-10-25" }], "4/1 ~ 어제");
    await page.evaluate(() => window.__job({ day: "2026-06-14", done: 134, visits: 4210 }));
    await page.clock.runFor(2500);
    assert.match(await page.textContent("#hv-text"), /읽는 중 6\/14 · 134 \/ 208일/);
    assert.match(await page.textContent("#sheet [data-act=hvStop]"), /멈춤/);
    await page.click("#sheet [data-act=hvStop]");
    assert.strictEqual((await hv()).stop, 1);
    // 다 읽음 → 알림 · 바로 보냄
    await page.evaluate(() => window.__job({ running: false, day: "2026-04-01", done: 208, why: "" }));
    await page.clock.runFor(2500);
    assert.match(await page.textContent("#toast"), /지난 방문 기록을 다 읽었어요/);
    const h = await hv();
    assert.strictEqual(h.send.length, 1, "다 읽으면 바로 보냄 (20:00 기다리지 않음)");
    assert.match(await page.textContent("#hv-text"), /기록 4\/1 ~ 10\/26 · 205일/);
    assert.deepStrictEqual(errs, []);

    // 보고 열쇠가 없으면 20:00 에도 안 보냄
    const { page: p2, hv: hv2 } = await setup(ctx, { key: false, time: "2026-10-26T19:59:00" });
    await p2.clock.runFor(3 * 60 * 1000);
    assert.deepStrictEqual([(await hv2()).send.length, (await hv2()).backfill.length], [0, 0], "보내지도 · 저절로 읽지도 않음");
    await p2.dblclick("#now");
    await p2.click('[data-t="etc"]');
    assert.match(await p2.textContent("#hv-text"), /보고 열쇠를 넣으면/);
  } finally {
    await browser.close();
  }
});

test("재방문 간격(체험판): 설정에 줄은 보이고 · 설치한 앱에서만 읽고 보낸다고 알림", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await page.goto(DESK);
    await page.dblclick("#now");
    await page.click('[data-t="etc"]');
    assert.match(await page.textContent("#hv-text"), /체험판/);
    await page.click("#sheet [data-act=hvBackfill]");
    assert.match(await page.textContent("#toast"), /설치한 앱/);
  } finally {
    await browser.close();
  }
});
