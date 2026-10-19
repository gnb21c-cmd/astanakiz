/* 재방문 이벤트가 끝난 뒤 마일리지 — 사장님 10/19 시나리오 그대로 하루씩 (이벤트 2026-10-26 ~ 2027-02-28)
   - 홍길동: 이벤트 전(10/25까지) 완료 5 → 기간에 6번 더 와서 네이버 완료 11 → 3월에 오면 '완료 5 → 6번 완료 예정' (네이버 11 · 12번째가 아님)
   - 김철수: 이벤트 전 완료 3 · 기간에 한 번도 안 옴 → 3월에 오면 '완료 3 → 4번 완료 예정' (그대로)
   - 기간 중 카드: '이벤트 시작' / '{사은품} 쿠폰 지급하세요' 둘 중 하나만 (횟수 · 마일리지 · 사은권 안 보임) · 끝나면(3/1~) 원래 모양
   - 같은 날 두 건(나눠 예약)이면 네이버도 2번 → 장부도 2번 → 끝나면 2를 뺌 (이영희)
   - 사람마다 따로 (전화번호로) · 10회 사은권도 마일리지 기준 · 입장권 {누계}도 마일리지
   - 체험판 '오늘'을 바꾸는 시험용 window.__today (설치한 앱은 PC 날짜) · 장부 · 설정은 브라우저 저장소로 날마다 이어짐 */
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

const HONG = ["홍길동님", "010-9999-0001"], KIM = ["김철수님", "010-9999-0002"], LEE = ["이영희님", "010-9999-0003"];
const SLOT = 840; // 14:00 (체험판 지금 13:50)

/** 그날 데스크를 열어 fn(page) — 저장소(이벤트 설정 · 장부)는 같은 브라우저라 이어짐 */
async function onDay(ctx, day, fn) {
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.addInitScript((d) => { window.__today = d; }, day);
  await page.goto(DESK);
  try {
    assert.strictEqual(await page.evaluate(() => document.title.length > 0 && window.__deskTest.today()), day, "체험판 오늘 = " + day);
    return await fn(page);
  } finally {
    assert.deepStrictEqual(errs, [], day + " 화면 오류");
    await page.close();
  }
}
const add = (page, day, [name, phone], prevDone, n = 1) => page.evaluate(([d, nm, ph, pd, k]) => { for (let i = 0; i < k; i++) window.__deskTest.addBooking(d, "14:00", nm, ph, 1, { prevDone: pd }); }, [day, name, phone, prevDone, n]);
const card = async (page, [name]) => { await page.click(`.slot[data-s="${SLOT}"]`); return (await page.textContent(`.res:has-text("${name}") >> nth=0`)).replace(/\s+/g, " "); };
async function enter(page, [name]) {
  await page.click(`.slot[data-s="${SLOT}"]`);
  await page.click(`.res:has-text("${name}") >> nth=0`);
  for (let i = 0; i < 6 && !(await page.$("#enter-done:not([disabled])")); i++) await page.click(".kpick button:not([disabled]):not(.on) >> nth=0");
  await page.click("#enter-done");
}
const ticket = (page, [name]) => page.evaluate((n) => { const T = window.__deskTest, h = T.holders().find((x) => x.name === n); return T.receiptLines(T.form(), T.keyVals(h)).map((l) => l.t.trim()).filter(Boolean); }, name);
const ledger = (page, [, phone]) => page.evaluate((k) => { const p = window.__deskTest.evLog("2026-10-26").people[k]; return p ? { base: p.base, last: p.last, n: p.visits.map((v) => v.n), st: p.visits.map((v) => v.st || "") } : null; }, phone.replace(/\D/g, ""));
const NO_COUNT = /완료 \d|번째|마일리지|사은권|이벤트 \d/; // 이벤트 기간 카드에는 횟수가 안 보임

test("사장님 시나리오: 홍길동 이벤트 전 5 + 기간 6번(네이버 11) → 3월 '완료 5 → 6번' · 김철수 3 → '완료 3 → 4번' · 같은 날 두 건도 정확히 · 기간 중 카드는 시작 / 쿠폰만", async () => {
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  try {
    // 이벤트 설정 (10/19 에 미리 해 둠): 10/26 ~ 2027-02-28 · 기한 20일 · 수제돈까스
    await onDay(ctx, "2026-10-19", async (page) => {
      await page.evaluate(() => localStorage.setItem("astanakiz-visitevent", JSON.stringify({ ver: 2, on: true, from: "2026-10-26", to: "2027-02-28", days: 20, gift: "수제돈까스" })));
    });

    // 10/25 (이벤트 전날): 원래대로 — 홍길동 4 → 5번째 · 김철수 2 → 3번째 · 이영희 6 → 7번째 · 장부 없음
    await onDay(ctx, "2026-10-25", async (page) => {
      await add(page, "2026-10-25", HONG, 4); await add(page, "2026-10-25", KIM, 2); await add(page, "2026-10-25", LEE, 6);
      assert.match(await card(page, HONG), /완료 4 → 5번 완료 예정/);
      assert.match(await card(page, KIM), /완료 2 → 3번 완료 예정/);
      for (const p of [HONG, KIM, LEE]) await enter(page, p);
      assert.match(await card(page, HONG), /5번째 예약완료/);
      assert.ok((await ticket(page, KIM)).some((l) => /네이버 예약 3번/.test(l)), "이벤트 전 입장권은 마일리지 그대로");
      assert.strictEqual(await ledger(page, HONG), null, "이벤트 전엔 장부에 안 적음");
    });

    // 기간 중 홍길동 6번 (네이버 5 → 11): 10/26 시작 · 11/3 성공(8일) · 11/20 성공(17일) · 12/24 시작(34일 지남) · 1/10 성공(17일) · 2/28 시작(마지막 날 · 49일)
    const visits = [["2026-10-26", 5, "시작"], ["2026-11-03", 6, "쿠폰"], ["2026-11-20", 7, "쿠폰"], ["2026-12-24", 8, "시작"], ["2027-01-10", 9, "쿠폰"], ["2027-02-28", 10, "시작"]];
    for (const [day, prev, want] of visits) {
      await onDay(ctx, day, async (page) => {
        await add(page, day, HONG, prev);
        const c = await card(page, HONG);
        assert.match(c, want === "쿠폰" ? /수제돈까스 쿠폰 지급하세요/ : /이벤트 시작/, `${day} 홍길동 카드 = ${want}: ${c}`);
        assert.doesNotMatch(c, NO_COUNT, `${day} 기간 중에는 횟수 안 보임: ${c}`);
        await enter(page, HONG);
        const t = await ticket(page, HONG);
        assert.ok(!t.some((l) => /네이버 예약 \d+번/.test(l)), `${day} 기간 입장권엔 누계 없음: ${t.join(" | ")}`);
        assert.ok(t.some((l) => (want === "쿠폰" ? /재방문 이벤트 성공/ : /재방문 이벤트/).test(l)), `${day} 입장권 이벤트 안내: ${t.join(" | ")}`);
        if (day === "2026-11-03") {
          // 이영희: 같은 날 같은 시간에 나눠 예약 두 건 → 한 번에 입장 → 네이버 7 → 9 (2번)
          await add(page, day, LEE, 7, 2);
          assert.match(await card(page, LEE), /이벤트 시작/);
          await enter(page, LEE);
          assert.deepStrictEqual(await ledger(page, LEE), { base: 7, last: 9, n: [8, 9], st: ["안내", ""] }, "두 건 모두 장부에 (영수증 기록은 대표 한 건)");
        }
      });
    }

    // 3/1 (끝난 다음 날) 김철수는 아직 안 옴 · 장부 확인: 홍길동 base 5 · last 11 · 6줄 / 김철수 없음
    await onDay(ctx, "2027-03-01", async (page) => {
      assert.deepStrictEqual(await ledger(page, HONG), { base: 5, last: 11, n: [6, 7, 8, 9, 10, 11], st: ["안내", "성공", "성공", "안내", "성공", "안내"] });
      assert.strictEqual(await ledger(page, KIM), null, "김철수는 기간에 안 옴 → 장부에 없음");
      await page.click("text=운영 설정"); await page.click('[data-t="event"]');
      assert.match(await page.textContent("#sheet .evstate"), /끝남 — 10월 26일 ~ 2월 28일/);
      await page.fill("#ev-q", "0001");
      assert.match((await page.textContent("#ev-hits")).replace(/\s+/g, " "), /홍길동님 010-9999-0001 · 마일리지 5 \(네이버 완료 11 − 이벤트 6\).*방문 6일 · 성공 3번/);
    });

    // 3/5: 홍길동(네이버 완료 11) → 완료 5 → 6번 · 김철수(완료 3) → 완료 3 → 4번 · 이영희(완료 9) → 완료 7 → 8번
    await onDay(ctx, "2027-03-05", async (page) => {
      await add(page, "2027-03-05", HONG, 11); await add(page, "2027-03-05", KIM, 3); await add(page, "2027-03-05", LEE, 9);
      const h = await card(page, HONG), k = await card(page, KIM), l = await card(page, LEE);
      assert.match(h, /완료 5 → 6번 완료 예정 \(네이버 완료 11 − 이벤트 6\)/, "홍길동: 12번째가 아니라 6번째 — " + h);
      assert.doesNotMatch(h, /12번|이벤트 시작|쿠폰 지급/);
      assert.match(k, /완료 3 → 4번 완료 예정/, "김철수: 그대로 — " + k);
      assert.doesNotMatch(k, /이벤트|네이버 완료/, "김철수는 뺄 것이 없음");
      assert.match(l, /완료 7 → 8번 완료 예정 \(네이버 완료 9 − 이벤트 2\)/, "이영희: 같은 날 두 건도 2를 뺌 — " + l);
      for (const p of [HONG, KIM, LEE]) await enter(page, p);
      assert.match(await card(page, HONG), /6번째 예약완료 \(네이버 12 − 이벤트 6\)/);
      assert.match(await card(page, KIM), /4번째 예약완료/);
      assert.ok((await ticket(page, HONG)).some((x) => /네이버 예약 6번/.test(x)), "홍길동 입장권 누계 6");
      assert.ok((await ticket(page, KIM)).some((x) => /네이버 예약 4번/.test(x)), "김철수 입장권 누계 4");
      assert.ok((await ticket(page, LEE)).some((x) => /네이버 예약 8번/.test(x)), "이영희 입장권 누계 8");
      assert.ok(!(await ticket(page, HONG)).some((x) => /재방문 이벤트/.test(x)), "끝난 뒤 입장권엔 이벤트 안내 없음");
    });

    // 그 뒤로도 계속 뺌: 3/20 홍길동(네이버 12) → 완료 6 → 7번 · 마일리지 10번째(네이버 16)에 2만원 사은권 (네이버 10번째였던 1/10 엔 기간이라 없음)
    await onDay(ctx, "2027-03-20", async (page) => {
      await add(page, "2027-03-20", HONG, 12);
      assert.match(await card(page, HONG), /완료 6 → 7번 완료 예정 \(네이버 완료 12 − 이벤트 6\)/);
      assert.doesNotMatch(await card(page, HONG), /사은권/);
    });
    await onDay(ctx, "2027-04-10", async (page) => {
      await add(page, "2027-04-10", HONG, 15);
      assert.match(await card(page, HONG), /완료 9 → 10번 완료 예정 2만원 사은권 증정 \(네이버 완료 15 − 이벤트 6\)/, "마일리지 10번째 = 사은권");
      await enter(page, HONG);
      assert.match(await page.textContent("#toast"), /10번째 예약완료, 2만원 사은권을 드리세요/);
    });
  } finally {
    await browser.close();
  }
});
