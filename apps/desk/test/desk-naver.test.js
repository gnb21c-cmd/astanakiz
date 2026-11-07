/* 데스크 화면 ↔ 가짜 네이버 예약현황 화면을 실제 연동 코드(NaverSync)로 이어서 (앱의 preload 를 흉내 냄)
   - 데스크가 네이버에서 오늘 예약을 불러와 시간표·명단에 보여 주는지
   - 입장 등록 때 네이버에 이용완료가 눌리고, 방문 회차가 네이버 '완료 n' + 1 로 잡히는지 */
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

test("데스크가 네이버 예약을 불러오고, 등록 완료 때 네이버 이용완료까지 처리", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const naverPage = await ctx.newPage();
    await naverPage.goto(NAVER);
    await naverPage.evaluate(() => localStorage.clear());
    await naverPage.goto(NAVER);
    const naver = new NaverSync((code) => naverPage.evaluate(code), { urls: { list: NAVER + "?view=list", calendar: NAVER + "?view=calendar" } });

    const desk = await ctx.newPage();
    await desk.clock.install({ time: new Date("2026-10-05T13:56:00") });
    const loads = [];
    // 앱처럼 네이버 화면 작업은 한 번에 하나씩
    let q = Promise.resolve();
    const serial = (fn) => (q = q.then(fn, fn));
    await desk.exposeFunction("__naverLoad", (day, only) => (only ? null : loads.push(day), serial(() => naver.loadDay(day, { only }))));
    await desk.exposeFunction("__naverComplete", (b) => serial(() => naver.complete(b)));
    await desk.addInitScript(() => {
      window.desk = {
        naver: { load: (d, o) => window.__naverLoad(d, o), complete: (b) => window.__naverComplete(b) },
        // 앱의 저장 파일 대신 (다시 켜도 남는 곳)
        state: { load: (day) => localStorage.getItem("test-state-" + day), save: (day, json) => localStorage.setItem("test-state-" + day, json) },
      };
    });
    const errs = [];
    desk.on("pageerror", (e) => errs.push(e.message));
    await desk.goto(DESK);

    // 오늘 14:00 칸: 네이버 확정 4 (입장권만, 단체 제외)
    await desk.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 30000 });
    const slot14 = await desk.textContent('.slot[data-s="840"]');
    assert.deepStrictEqual(await desk.$$eval('.slot[data-s="840"] .c', (e) => e.map((x) => x.textContent.trim())), ["0", "4", "6"], "14:00 완료 0 · 확정 4 · 잔여 6");

    await desk.click('.slot[data-s="840"]');
    const names = await desk.$$eval(".res .name", (e) => e.map((x) => x.textContent));
    assert.deepStrictEqual(names, ["백연화", "송다온", "허정은"], "이름 가나다순");
    assert.match(await desk.textContent('.res:has-text("허정은")'), /완료 8 · 취소 2 → 9번 완료 예정/);
    assert.match(await desk.textContent('.res:has-text("백연화")'), /완료 0 · 취소 3 → 1번 완료 예정/, "취소만 있는 손님도 신규(완료 0)로");

    // 일찍 입장: 13:56 에 18:00 예약도 열쇠를 고를 수 있음 (5분 전은 손님 안내 기준일 뿐)
    await desk.click('.slot[data-s="1080"]');
    await desk.click('.res:has-text("홍길동")');
    assert.match(await desk.textContent("#sheet"), /일찍 입장 — 근무자 판단으로 가능/);
    assert.ok(await desk.$eval(".kpick button:not([disabled])", (b) => !!b), "열쇠 고를 수 있음");
    await desk.click("[data-act=close] >> nth=0");
    await desk.click('.slot[data-s="840"]');

    // 허정은 입장: 열쇠 1개 고르고 등록 완료 → 네이버 이용완료
    await desk.click('.res:has-text("허정은")');
    await desk.click(".kpick button:not([disabled]) >> nth=0");
    await desk.click("#enter-done");
    await desk.waitForFunction(() => document.getElementById("overlay").hidden, null, { timeout: 30000 });
    assert.match(await desk.textContent('.res:has-text("허정은")'), /이용완료/);
    assert.match(await desk.textContent('.res:has-text("허정은")'), /9번째 예약완료/);
    assert.deepStrictEqual(await desk.$$eval('.slot[data-s="840"] .c', (e) => e.map((x) => x.textContent.trim())), ["1", "3", "6"], "입장하면 확정 → 완료, 잔여 그대로");
    assert.deepStrictEqual(await desk.$$eval(".res .name", (e) => e.map((x) => x.textContent)), ["백연화", "송다온", "허정은"], "입장완료는 밑으로 (허정은은 원래 맨 밑)");

    // 네이버 이용완료는 뒤에서 — 끝날 때까지 기다림 (카드의 '네이버 이용완료 처리 중 · 대기'가 사라짐)
    await desk.waitForFunction(() => { const c = [...document.querySelectorAll(".res")].find((e) => /허정은/.test(e.textContent)); return c && !c.querySelector(".npend"); }, null, { timeout: 60000 });
    // 네이버 화면에서도 완료로 바뀜
    const after = await naver.loadDay("2026-10-05");
    assert.strictEqual(after.bookings.find((b) => b.no === "1368155282").status, "완료");

    // 자동 불러오기: 13:56에 켰으니 다음은 14:20 (팝업이 닫혀 있을 때)
    assert.match(await desk.textContent("#refresh-at"), /다음 14:20/);
    const n0 = loads.length;
    await desk.clock.runFor(20 * 60 * 1000); // 14:16
    assert.strictEqual(loads.length, n0, "14:20 전에는 안 불러옴");
    await desk.clock.runFor(5 * 60 * 1000); // 14:21
    await desk.waitForFunction(() => /14:2\d 불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 30000 });
    assert.strictEqual(loads.length, n0 + 1, "14:20에 한 번만 불러옴");
    assert.match(await desk.textContent("#refresh-at"), /다음 14:50/);

    // 새로고침 버튼: 자동 시각이 아니어도 바로 불러옴
    await desk.click("[data-act=refresh]");
    await desk.waitForFunction((n) => !/불러오는 중/.test(document.getElementById("refresh-at").textContent), null, { timeout: 30000 });
    assert.strictEqual(loads.length, n0 + 2);
    // 프로그램을 껐다 켬 (다시 열기): 입장한 손님의 열쇠가 그대로 — 네이버를 불러오기 전에도, 불러온 뒤에도
    const keysBefore = await desk.$$eval('.res:has-text("허정은") .kchip', (e) => e.map((x) => x.textContent));
    assert.ok(keysBefore.length, "입장 후 열쇠 있음");
    await desk.reload();
    await desk.click('.slot[data-s="840"]').catch(() => {});
    assert.deepStrictEqual(await desk.$$eval('.res:has-text("허정은") .kchip', (e) => e.map((x) => x.textContent)), keysBefore, "다시 켜자마자 열쇠 그대로");
    assert.ok(await desk.$(`.key[data-k="${keysBefore[0]}"]:not(.free)`), "열쇠판에도 지급된 열쇠로");
    await desk.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 60000 });
    await desk.click('.slot[data-s="840"]');
    assert.deepStrictEqual(await desk.$$eval('.res:has-text("허정은") .kchip', (e) => e.map((x) => x.textContent)), keysBefore, "네이버를 다시 불러온 뒤에도 그대로");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("숏타임 (사장님 11/07): 네이버에서 읽은 10:00 칸 = 1시간 50분 + 숏타임 (판매 최대 20) · 숏타임 손님 카드도 10:00 에 [숏타임] · 11:20 퇴장", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const naverPage = await ctx.newPage();
    await naverPage.goto(NAVER + "?short=1");
    await naverPage.evaluate(() => localStorage.clear());
    await naverPage.goto(NAVER + "?short=1");
    const naver = new NaverSync((code) => naverPage.evaluate(code), { urls: { list: NAVER + "?view=list&short=1", calendar: NAVER + "?view=calendar&short=1" } });
    const desk = await ctx.newPage();
    await desk.clock.install({ time: new Date("2026-10-05T09:56:00") });
    let q = Promise.resolve();
    const serial = (fn) => (q = q.then(fn, fn));
    await desk.exposeFunction("__naverLoad", (day, only) => serial(() => naver.loadDay(day, { only })));
    await desk.exposeFunction("__naverComplete", (b) => serial(() => naver.complete(b)));
    await desk.addInitScript(() => {
      window.desk = {
        naver: { load: (d, o) => window.__naverLoad(d, o), complete: (b) => window.__naverComplete(b) },
        state: { load: (day) => localStorage.getItem("test-state-" + day), save: (day, json) => localStorage.setItem("test-state-" + day, json) },
      };
    });
    const errs = [];
    desk.on("pageerror", (e) => errs.push(e.message));
    await desk.goto(DESK);
    await desk.click("[data-act=refresh]");
    await desk.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 30000 });
    assert.deepStrictEqual(await desk.$$eval('.slot[data-s="600"] .c', (e) => e.map((x) => x.textContent.trim())), ["4", "2", "14"], "10:00 완료 4(3 + 숏 1) · 확정 2(숏) · 잔여 14 (판매 20)");
    await desk.click('.slot[data-s="600"]');
    const names = await desk.$$eval(".res .name", (e) => e.map((x) => x.textContent.replace(/\s+/g, " ").trim()));
    assert.ok(names.some((n) => /숏손님/.test(n)) && names.some((n) => /숏완료/.test(n)), `10:00 카드에 숏타임 손님: ${names.join(" / ")}`);
    assert.ok(names.some((n) => /송나라/.test(n)) && names.some((n) => /엄효정/.test(n)), "1시간 50분 손님도 같은 칸");
    const card = desk.locator('.res:has-text("숏손님")');
    assert.strictEqual((await card.locator(".badge.short").textContent()).trim(), "숏타임");
    assert.match((await card.textContent()).replace(/\s+/g, " "), /10:00 ~ 11:20 퇴장/);
    // 이용시간: 숏타임 1시간 20분 · 1시간 50분 손님은 그대로
    const ids = await desk.$$eval(".res", (e) => Object.fromEntries(e.map((x) => [x.querySelector(".name").textContent.replace(/\s+/g, "").replace(/숏타임|첫방문/g, ""), x.dataset.id])));
    assert.deepStrictEqual(await desk.evaluate(([a, b]) => [window.__deskTest.bookMinutes(a), window.__deskTest.bookMinutes(b)], [ids["숏손님"], ids["송나라"]]), [80, 110]);
    // 근무자: 10시 카드에서 숏손님 이름 확인 → 열쇠 → 입장 → 입장권 퇴장시간 11:20 (일반은 11:50)
    await card.click();
    for (let i = 0; i < 6 && !(await desk.$("#enter-done:not([disabled])")); i++) await desk.click(".kpick button:not([disabled]):not(.on) >> nth=0");
    await desk.click("#enter-done");
    const out = await desk.evaluate((id) => { const T = window.__deskTest, h = T.holders().find((x) => x.id === id); const v = T.keyVals(h); return { exit: v.퇴장시간, ticket: T.receiptLines(T.formFor(v), v).map((l) => l.t.trim()).join(" | ") }; }, ids["숏손님"]);
    assert.strictEqual(out.exit, "오전 11시 20분", "숏타임 입장권 퇴장시간");
    assert.match(out.ticket, /퇴장 {2}오전 11시 20분/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
