/* 키즈 실시간 (사장님 10/16) — 총괄 관리자가 보고 앱 '입장권 판매' → 세부 화면에서 지금 키즈를 봄 (docs/LIVE.md)
   - 통합데스크가 현황 글(astanakiz-live)을 만들어 1분마다 · 바뀌면 5초 안에 같은 보고 열쇠로 클라우드 deskLive/now 에 덮어씀
   - 네이버(완료 · 미입장 · 잔여 · 시간 칸) · 총 판매수(네이버 + 현장) · 서비스 키(판매 아님) · 초과요금 · 열쇠 번호 · 색 · 손님 이름 · 전화 */
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  ({ chromium } = require("/opt/node-tools/node_modules/playwright"));
}
const ROOT = path.join(__dirname, "..", "..", "..");
const DESK = "file://" + path.join(ROOT, "prototype", "desk.html");
const launch = () => chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const close = (page) => page.click("#sheet [data-act=close] >> nth=0");
const num = (t) => Number(String(t).replace(/\D/g, ""));

test("키즈 실시간: 현황 글이 데스크 화면과 같음 (네이버 합 · 총 판매수 · 열쇠 색 · 손님 이름 · 전화 · 서비스 키)", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 10/5 13:50
    await page.click('.key[data-k="6"]');
    await page.click("#sheet [data-act=svcPick]");
    await page.click('#sheet [data-act=svcGive][data-k="40"]');
    await close(page);
    const s = await page.evaluate(() => window.__deskTest.liveSnap());
    assert.strictEqual(s.type, "astanakiz-live");
    assert.strictEqual(s.day, "2026-10-05");
    assert.match(s.at, /^2026-10-05 13:50:\d{2}$/);
    // 총 판매수 = 맨 위 숫자 · 네이버 + 현장 (서비스 키는 안 셈)
    assert.strictEqual(s.people.total, num(await page.textContent("#sold")));
    assert.strictEqual(s.people.total, s.people.naver + s.people.walk);
    assert.strictEqual(s.walk.service, 1);
    // 네이버 오늘 합 = 왼쪽 '오늘 합' 줄 (완료 · 확정 · 잔여)
    const sum = await page.$$eval("#slot-sum span:not(.lb)", (e) => e.map((x) => Number(x.textContent)));
    assert.deepStrictEqual([s.naver.done, s.naver.conf, s.naver.left], sum);
    assert.strictEqual(s.naver.slots.length, await page.$$eval("#slots .slot", (e) => e.length));
    assert.strictEqual(s.naver.slots.reduce((a, x) => a + x.done, 0), s.naver.done);
    // 열쇠: 열쇠판과 같은 번호 · 색 · 빈 열쇠
    const board = await page.$$eval(".keys .key", (e) => e.map((x) => ({ k: Number(x.dataset.k), c: (x.className.match(/\b(in|pink|red)\b/) || [])[1] || "" })));
    for (const b of board) {
      const m = s.keys.map[b.k];
      if (!b.c) assert.strictEqual(m, undefined, `${b.k}번 빈 열쇠`);
      else assert.strictEqual(m && m.c, b.c, `${b.k}번 색`);
    }
    assert.strictEqual(s.keys.used, Object.keys(s.keys.map).length);
    assert.strictEqual(s.keys.used + s.keys.free, 45);
    // 번호를 누르면 손님 이름 · 전화 그대로 (관리자 전화 대응)
    const h1 = s.keys.holders[s.keys.map[1].h];
    assert.strictEqual(h1.kind, "n");
    assert.strictEqual(h1.name, "장시우");
    assert.match(h1.phone, /^010\d{8}$/);
    assert.ok(h1.no && h1.over > 0, "예약번호 · 받을 초과요금");
    const h40 = s.keys.holders[s.keys.map[40].h];
    assert.deepStrictEqual([h40.kind, h40.name, h40.qty, h40.of], ["s", "오유나", 0, "6번 오유나님에게 추가 서비스 지급된 열쇠"]);
    const hw = s.keys.holders[s.keys.map[29].h];
    assert.deepStrictEqual([hw.kind, hw.name], ["w", "현장구매자"]);
    assert.ok(hw.pos, "현장 POS 번호");
    assert.ok(s.keys.holders.every((h) => h.keys.every((k) => s.keys.map[k] && s.keys.holders[s.keys.map[k].h] === h)), "번호 → 손님이 맞물림");
    assert.ok(JSON.stringify(s).length < 100000, "규칙의 크기 안");

    // 미리보기(prototype/live-phone.html)의 예시 글이 지금 모양과 같음 (보고 시스템에 넘길 화면)
    const html = fs.readFileSync(path.join(ROOT, "prototype", "live-phone.html"), "utf8");
    const sample = JSON.parse(/<script type="application\/json" id="sample">([\s\S]*?)<\/script>/.exec(html)[1]);
    const shape = (o) => Object.keys(o).sort().join(",");
    for (const k of ["", "naver", "people", "walk", "over", "keys", "rules"]) assert.strictEqual(shape(k ? sample[k] : sample), shape(k ? s[k] : s), `예시 글 ${k || "맨 위"} 칸`);
    assert.strictEqual(shape(sample.keys.holders[0]), shape(s.keys.holders[0]), "예시 글 손님 칸");

    // 운영 설정 → 설문조사: 보고 열쇠 밑 '폰 실시간 현황' (체험판은 보내지 않음)
    await page.dblclick("#now");
    await page.click('[data-t="etc"]');
    assert.match(await page.textContent("#sheet [data-act=liveToggle]"), /폰 실시간 현황 켜짐/);
    assert.match(await page.textContent("#live-last"), /보고 열쇠를 넣으면 보내요/);
    const box = await page.evaluate(() => { const r = document.getElementById("sheet").getBoundingClientRect(); return r.bottom; });
    assert.ok(box <= 768, "설정 화면 안 " + box);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("키즈 실시간(앱): 열쇠가 있으면 바로 · 바뀌면 5초 안에 · 그대로면 1분마다 · 실패 30초 뒤 · 끄면 멈춤", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date("2026-10-16T14:05:00") });
    await page.addInitScript(() => {
      window.__live = [];
      window.__liveFail = false;
      const cfg = { build: "1.44", hasSurveyKey: true, surveyKeyTail: "ab12" };
      const BK = (no, time, name, phone, qty) => ({ no, time, name, phone, qty, qtyText: `1시간 50분 ${qty}`, product: "1시간 50분", status: "확정", pay: "결제완료", doneCount: 3, cancelCount: 0 });
      window.desk = {
        naver: { load: async (day) => ({ ok: true, day, slots: day === "2026-10-16" ? [{ time: "14:00", product: "1시간 50분", cap: 10, conf: 2, done: 0 }] : [], bookings: day === "2026-10-16" ? [BK("N1", "14:00", "김실시", "010-7777-0001", 2)] : [] }), complete: async () => ({ ok: true }) },
        state: { load: () => null, save: () => {} },
        config: { get: async () => cfg, set: async (patch) => { Object.assign(cfg, patch); window.__cfg = cfg; return { ok: true }; } },
        live: { send: async (job) => { window.__live.push({ t: Date.now(), json: job.json, at: job.at }); return window.__liveFail ? { ok: false, code: 403, why: "열쇠나 모양이 틀림 (403)" } : { ok: true, code: 200 }; } },
      };
    });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    await page.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 15000 });
    await page.clock.runFor(2000);
    const n = () => page.evaluate(() => window.__live.length);
    assert.ok((await n()) >= 1, "켜자마자 한 번");
    const first = JSON.parse(await page.evaluate(() => window.__live[window.__live.length - 1].json));
    assert.strictEqual(first.type, "astanakiz-live");
    assert.deepStrictEqual([first.naver.conf, first.people.total, first.keys.used], [2, 0, 0]);
    const n0 = await n();
    await page.clock.runFor(30000);
    assert.strictEqual(await n(), n0, "그대로면 1분 안에는 안 보냄");
    await page.clock.runFor(31000);
    assert.strictEqual(await n(), n0 + 1, "그대로여도 1분마다 (폰이 몇 초 전 기준인지 알게)");

    // 입장 → 5초 안에 열쇠 · 손님 이름 · 전화
    await page.click('.slot[data-s="840"]');
    await page.click('.res:has-text("김실시")');
    await page.click(".kpick button:not([disabled]):not(.on) >> nth=0");
    await page.click(".kpick button:not([disabled]):not(.on) >> nth=0");
    await page.click("#enter-done");
    await page.clock.runFor(6000);
    assert.strictEqual(await n(), n0 + 2, "바뀌면 바로 (5초 간격)");
    const s = JSON.parse(await page.evaluate(() => window.__live[window.__live.length - 1].json));
    assert.strictEqual(s.keys.used, 2);
    const h = s.keys.holders[0];
    assert.deepStrictEqual([h.kind, h.name, h.phone, h.keys.length, h.no], ["n", "김실시", "01077770001", 2, "N1"]);
    assert.strictEqual(s.people.total, 2, "이용완료 2장 = 총 판매수");

    // 설정 화면: 마지막 보낸 시각
    await page.dblclick("#now");
    await page.click('[data-t="etc"]');
    assert.match(await page.textContent("#live-last"), /마지막: 14:\d\d:\d\d 보냄/);
    // 실패하면 30초 뒤 다시 (그 사이 바뀌어도 안 보냄)
    await page.evaluate(() => { window.__liveFail = true; });
    await page.clock.runFor(61000);
    const nf = await n();
    assert.match(await page.textContent("#live-last"), /실패 열쇠나 모양이 틀림 \(403\) — 30초 뒤 다시/);
    await page.clock.runFor(20000);
    assert.strictEqual(await n(), nf, "30초 안에는 다시 안 보냄");
    await page.evaluate(() => { window.__liveFail = false; });
    await page.clock.runFor(12000);
    assert.strictEqual(await n(), nf + 1, "30초 뒤 다시");
    // 끄면 멈춤 (설정에 저장)
    await page.click("#sheet [data-act=liveToggle]");
    assert.strictEqual(await page.evaluate(() => window.__cfg.liveOn), false);
    const nOff = await n();
    await page.clock.runFor(130000);
    assert.strictEqual(await n(), nOff, "꺼짐");
    assert.match(await page.textContent("#live-last"), /꺼짐/);
    await page.click("#sheet [data-act=liveToggle]");
    await page.clock.runFor(2000);
    assert.strictEqual(await n(), nOff + 1, "다시 켜면 바로");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("키즈 실시간(앱): 보고 열쇠가 없으면 보내지 않음", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await page.clock.install({ time: new Date("2026-10-16T14:05:00") });
    await page.addInitScript(() => {
      window.__live = [];
      window.desk = {
        naver: { load: async (day) => ({ ok: true, day, slots: [], bookings: [] }), complete: async () => ({ ok: true }) },
        state: { load: () => null, save: () => {} },
        config: { get: async () => ({ build: "1.44", hasSurveyKey: false }), set: async () => ({ ok: true }) },
        live: { send: async (job) => { window.__live.push(job); return { ok: true }; } },
      };
    });
    await page.goto(DESK);
    await page.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 15000 });
    await page.clock.runFor(70000);
    assert.strictEqual(await page.evaluate(() => window.__live.length), 0);
  } finally {
    await browser.close();
  }
});
