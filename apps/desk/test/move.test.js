/* 예약시간 변경 (사용자 지시 10/9): 네이버 예약 시간은 바꿀 수 없어 데스크에서만 카드를 다른 시간으로 옮김
   - 예약자 창 이용일시 옆 ◀ (시간) ▶ [변경] → 그 시간 명단으로 · 카드에 '네이버 14:00' 표시
   - 새로고침 · 다시 켜도 옮긴 시간에 · 입장(이용완료)하면 네이버는 원래 시간 칸에서 이용완료 */
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
const names = (page) => page.$$eval("#res .res .name", (e) => e.map((x) => x.firstChild.textContent.trim()));

test("체험판: 예약자 창에서 ◀ ▶ 변경 → 카드가 그 시간으로 · 되돌리기", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    await page.click('.slot[data-s="840"]');
    await page.click('.res:has-text("고은우")');
    await page.click("[data-act=mvSlot][data-d='30']");
    await page.click("[data-act=mvSlot][data-d='30']");
    assert.match(await page.textContent(".mvrow"), /15:00/);
    await page.click("[data-act=mvDo]");
    assert.match((await page.textContent("#sheet")).replace(/\s+/g, " "), /이용일시 ?15:00/);
    await page.click("#sheet [data-act=close] >> nth=0");
    assert.ok((await names(page)).includes("고은우"), "옮긴 시간(15:00) 명단으로 바로 보여 줌");
    assert.match(await page.textContent('.res:has-text("고은우")'), /네이버 14:00/);
    await page.click('.slot[data-s="840"]');
    assert.ok(!(await names(page)).includes("고은우"), "14:00 명단에서는 빠짐");
    // 원래 시간 명단 맨 위에 '옮긴 카드' 줄 (사장님 10/31 — 왼쪽 확정 숫자는 네이버 그대로라 카드가 없어 헷갈림) → 누르면 옮긴 시간 명단
    assert.strictEqual(await page.$eval("#res > :first-child", (e) => e.className), "mvnote");
    assert.match((await page.textContent("#res .mvnote")).replace(/\s+/g, " "), /고은우님 카드 → 15:00 으로 옮김 · 네이버는 14:00 그대로/);
    await page.click("#res .mvnote");
    assert.strictEqual(await page.getAttribute(".slot.on", "data-s"), "900");
    assert.ok((await names(page)).includes("고은우"));
    await page.click('.slot[data-s="840"]');
    // 되돌리기
    await page.click('.slot[data-s="900"]');
    await page.click('.res:has-text("고은우")');
    await page.click("[data-act=mvSlot][data-d='-30']");
    await page.click("[data-act=mvSlot][data-d='-30']");
    await page.click("[data-act=mvDo]");
    await page.click("#sheet [data-act=close] >> nth=0");
    assert.ok((await names(page)).includes("고은우"));
    assert.doesNotMatch(await page.textContent('.res:has-text("고은우")'), /네이버 14:00/, "원래 시간이면 표시 없음");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("설치 앱: 옮긴 카드는 새로고침 · 다시 켜도 그 시간 · 입장하면 네이버 원래 시간 칸에서 이용완료", async () => {
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
    const completes = [];
    await desk.exposeFunction("__naverLoad", (day, only) => serial(() => naver.loadDay(day, { only })));
    await desk.exposeFunction("__naverComplete", (b) => (completes.push(b), serial(() => naver.complete(b))));
    await desk.addInitScript(() => {
      window.desk = {
        naver: { load: (d, o) => window.__naverLoad(d, o), complete: (b) => window.__naverComplete(b) },
        state: { load: (day) => localStorage.getItem("test-state-" + day), save: (day, json) => localStorage.setItem("test-state-" + day, json) },
      };
    });
    const errs = [];
    desk.on("pageerror", (e) => errs.push(e.message));
    const loaded = () => desk.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 60000 });
    await desk.goto(DESK);
    await loaded();
    await desk.click('.slot[data-s="840"]');
    await loaded();
    await desk.click('.res:has-text("허정은")');
    await desk.click("[data-act=mvSlot][data-d='30']");
    await desk.click("[data-act=mvSlot][data-d='30']");
    await desk.click("[data-act=mvDo]");
    await desk.click("#sheet [data-act=close] >> nth=0");
    // 새로고침 (하루 전체) → 그대로 15:00
    await desk.click("[data-act=refresh]");
    await desk.waitForTimeout(300);
    await loaded();
    await desk.click('.slot[data-s="900"]');
    await loaded();
    assert.ok((await names(desk)).includes("허정은"), "새로고침해도 옮긴 시간");
    await desk.click('.slot[data-s="840"]'); // 14:00 칸만 다시 불러와도
    await loaded();
    assert.ok(!(await names(desk)).includes("허정은"));
    // 다시 켜도
    await desk.reload();
    await loaded();
    await desk.click('.slot[data-s="900"]');
    await loaded();
    assert.ok((await names(desk)).includes("허정은"), "다시 켜도 옮긴 시간");
    assert.match(await desk.textContent('.res:has-text("허정은")'), /네이버 14:00/);
    // 입장 → 네이버는 원래 14:00 칸에서 이용완료
    await desk.click('.res:has-text("허정은")');
    await desk.click(".kpick button:not([disabled]) >> nth=0");
    await desk.click("#enter-done");
    await desk.waitForFunction(() => { const c = [...document.querySelectorAll(".res")].find((e) => /허정은/.test(e.textContent)); return c && /이용완료/.test(c.textContent) && !c.querySelector(".npend"); }, null, { timeout: 60000 });
    assert.strictEqual(completes[0].time, "14:00", "네이버 원래 시간 칸");
    const after = await naver.loadDay("2026-10-05");
    assert.strictEqual(after.bookings.find((b) => b.no === "1368155282").status, "완료");
    // 이용시간은 옮긴 시간부터 (15:00 + 1:50)
    await desk.click('.res:has-text("허정은")');
    assert.match((await desk.textContent("#sheet")).replace(/\s+/g, " "), /이용일시 ?15:00 ~ 16:50/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

/* 카드 시간을 옮기면 네이버 판매 수량도 (사장님 10/31): 네이버 예약은 원래 시간 그대로라 원래 시간은 한 자리가 비고 · 옮긴 시간은 한 자리가 더 참
   → 수량 자동조절이 도는 날이면 옮기는 순간 원래 시간 +장수 · 옮긴 시간 −장수 (잔여만큼만 · 이미 시작한 시간은 그대로) · 되돌리면 반대로 */
test("카드 시간을 옮기면 네이버 판매 수량도: 원래 시간 +장수 · 옮긴 시간 −장수 · 되돌리면 그대로 · 시작한 시간 · 매진 칸은 그대로", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const naverPage = await ctx.newPage();
    await naverPage.goto(NAVER);
    // 13:30(이미 시작한 타임) 예약 2장을 더함 (가짜 손님)
    await naverPage.evaluate(() => { const d = seed(); d["2026-10-05"].push({ no: "1374100001", name: "늦은손님", phone: "010-2000-0003", time: "13:30", product: 0, qty: 2, status: "확정", done: 1, cancel: 0 }); localStorage.setItem("mockNaver3", JSON.stringify(d)); });
    await naverPage.goto(NAVER);
    const naver = new NaverSync((code) => naverPage.evaluate(code), { urls: { list: NAVER + "?view=list", calendar: NAVER + "?view=calendar" } });
    const desk = await ctx.newPage();
    await desk.clock.install({ time: new Date("2026-10-05T13:56:00") }); // 휴일 (시간제) 13:56 — 14:00 은 아직 시작 전
    let q = Promise.resolve();
    const serial = (fn) => (q = q.then(fn, fn));
    const sets = [];
    await desk.exposeFunction("__naverLoad", (day, only) => serial(() => naver.loadDay(day, { only })));
    await desk.exposeFunction("__naverSetCap", (c) => (sets.push(`${c.time} ${c.n}`), serial(() => naver.setCap(c))));
    await desk.addInitScript(() => {
      window.desk = {
        naver: { load: (d, o) => window.__naverLoad(d, o), complete: async () => ({ ok: true }), setCap: (c) => window.__naverSetCap(c) },
        state: { load: () => null, save: () => {} },
      };
    });
    const errs = [];
    desk.on("pageerror", (e) => errs.push(e.message));
    const loaded = () => desk.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 60000 });
    const caps = async () => Object.fromEntries((await serial(() => naver.loadDay("2026-10-05"))).slots.filter((x) => /1시간 50분/.test(x.product)).map((x) => [x.time, x.cap]));
    const move = async (from, who, steps) => {
      const n = sets.length;
      await desk.click(`.slot[data-s="${from}"]`);
      await loaded();
      await desk.click(`.res:has-text("${who}")`);
      for (let i = 0; i < Math.abs(steps); i++) await desk.click(`[data-act=mvSlot][data-d='${steps > 0 ? 30 : -30}']`);
      await desk.click("[data-act=mvDo]");
      await desk.click("#sheet [data-act=close] >> nth=0");
      await desk.waitForFunction(() => !window.__deskTest.capMoving(), null, { timeout: 60000 });
      return sets.slice(n);
    };
    await desk.goto(DESK);
    await loaded();
    await desk.evaluate(() => { window.__deskTest.RULES.capAuto.on = true; }); // 수량 자동조절 켠 날
    const c0 = await caps();

    // ① 허정은 14:00 → 15:00 : 14:00 +1 · 15:00 −1 (줄이는 칸부터)
    assert.deepStrictEqual(await move(840, "허정은", 2), [`15:00 ${c0["15:00"] - 1}`, `14:00 ${c0["14:00"] + 1}`]);
    let c = await caps();
    assert.deepStrictEqual([c["14:00"], c["15:00"]], [c0["14:00"] + 1, c0["15:00"] - 1]);
    const log = await desk.evaluate(() => window.__deskTest.capLog.filter((x) => x.t && /허정은/.test(x.msg || "")).map((x) => [x.t, x.from, x.to, x.ok]));
    assert.deepStrictEqual(log, [["14:00", c0["14:00"], c0["14:00"] + 1, true], ["15:00", c0["15:00"], c0["15:00"] - 1, true]], "수량 조절 기록에 남김");
    const left = async (t) => (await desk.$$eval(`.slot[data-s="${t}"] .c`, (e) => e.map((x) => x.textContent.trim())))[2];
    assert.strictEqual(await left(840), String(c0["14:00"] + 1 - 4), "시간표 잔여도 바로 (14:00 예약 4장)");

    // ② 되돌리기 15:00 → 14:00 : 원래 수량
    await move(900, "허정은", -2);
    c = await caps();
    assert.deepStrictEqual([c["14:00"], c["15:00"]], [c0["14:00"], c0["15:00"]]);

    // ③ 이미 시작한 13:30 의 늦은손님(2장) → 16:00 : 13:30 은 그대로 · 16:00 −2
    assert.deepStrictEqual(await move(810, "늦은손님", 5), [`16:00 ${c0["16:00"] - 2}`]);
    assert.strictEqual((await caps())["13:30"], c0["13:30"]);

    // ④ 매진 칸(15:30 = 예약 1장뿐 · 수량 1)으로 옮기면 줄일 잔여가 없어 그대로
    await serial(() => naver.setCap({ day: "2026-10-05", product: "평일 무제한 / 휴일 1시간 50분 입장권", time: "15:30", n: 1 }));
    await desk.click("[data-act=refresh]");
    await desk.waitForTimeout(300);
    await loaded();
    assert.deepStrictEqual(await move(840, "백연화", 3), [`14:00 ${c0["14:00"] + 1}`], "14:00 만 +1");
    assert.strictEqual((await caps())["15:30"], 1);
    assert.ok(await desk.evaluate(() => window.__deskTest.capLog.some((x) => /백연화/.test(x.msg || "") && /잔여가 없어/.test(x.msg))), "기록: 잔여가 없어 그대로");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("체험판: 수량 자동조절이 꺼진 날은 카드를 옮겨도 판매 수량 그대로 · 켠 날은 원래 시간 +1 · 옮긴 시간 −1", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    const caps = () => page.evaluate(() => [840, 870].map((t) => window.__deskTest.capDemo[t] ?? null));
    const move = async (from, d) => {
      await page.click(`.slot[data-s="${from}"]`);
      await page.click('.res:has-text("고은우")');
      await page.click(`[data-act=mvSlot][data-d='${d}']`);
      await page.click("[data-act=mvDo]");
      await page.click("#sheet [data-act=close] >> nth=0");
      await page.waitForFunction(() => !window.__deskTest.capMoving());
    };
    await page.evaluate(() => { window.__deskTest.setNow(600); window.__deskTest.RULES.capAuto.on = false; });
    const c0 = await caps();
    await move(840, 30);
    assert.deepStrictEqual(await caps(), c0, "꺼진 날: 그대로");
    assert.ok(!(await page.evaluate(() => window.__deskTest.capLog.some((x) => /고은우/.test(x.msg || "")))), "기록 없음");
    await page.evaluate(() => { window.__deskTest.RULES.capAuto.on = true; }); // 체험판 오늘 10/5 = 휴일 (시간제)
    const left = async (t) => Number((await page.$$eval(`.slot[data-s="${t}"] .c`, (e) => e.map((x) => x.textContent.trim())))[2]);
    const l0 = [await left(840), await left(870)];
    await move(870, -30); // 14:30 → 14:00 (원래 시간) : 14:30 +1 · 14:00 −1
    assert.deepStrictEqual([await left(840), await left(870)], [l0[0] - 1, l0[1] + 1]);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
