/* 쿠폰 사용기한 (사장님 10/19) — 방문 이벤트 탭에서 '쿠폰 사용기한'을 1개월 · 30일처럼 정해 두면
   양식에 {사용기한} 만 써 두면 쿠폰이 나가는 날(입장권 날짜) 기준으로 그 날짜가 알아서 찍힘
   - 개월: 같은 날 다음 달 (1월 31일 + 1개월 = 2월 28일 — 그달 마지막 날) · 일: 그날 + n일
   - 해가 바뀌면 "2027년 1월 15일" 처럼 해까지 · 비우면 {사용기한} 이 든 줄은 안 나옴 (값이 빈 줄은 빼는 규칙 그대로) */
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
const GIFT = "===\n^#*수제한돈까스\n^#*1EA 교환권\n^*사용기한: {사용기한}까지\n===\n[자르기]";

test("쿠폰 사용기한: 처음 1개월 · 일로 바꾸면 그날 + n일 · 달 끝 · 해 바뀜 · 비우면 그 줄 없음 · 설정에 저장", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.addInitScript((g) => { if (!localStorage.getItem("astanakiz-visitevent")) localStorage.setItem("astanakiz-visitevent", JSON.stringify({ ver: 2, on: true, from: "2026-10-05", to: "2026-12-31", days: 20, gift: "수제한돈까스", tpl: ["#* 재방문 이벤트\n^*{다음기한}(포함)까지 다시 오시면", "#* 재방문 이벤트 성공!\n[사은품]", g] })); }, GIFT);
    await page.goto(DESK); // 체험판 오늘 = 2026-10-05
    const lines = (v) => page.evaluate((v) => { const T = window.__deskTest; return T.receiptLines(T.EV_().tpl[2], Object.assign(T.evSample(1), v || {})).map((l) => l.t.trim()).filter(Boolean); }, v);
    // 처음 = 1개월 → 10월 5일 발행이면 11월 5일까지
    assert.ok((await lines()).includes("사용기한: 11월 5일까지"), JSON.stringify(await lines()));
    const due = await page.evaluate(() => {
      const T = window.__deskTest, E = T.EV_();
      const r = {};
      E.useN = 1; E.useUnit = "개월";
      r.m31 = T.useDueText("2026-01-31"); r.dec = T.useDueText("2026-12-15"); r.leap = T.useDueText("2028-01-30");
      E.useN = 3; r.m3 = T.useDueText("2026-11-30");
      E.useN = 30; E.useUnit = "일"; r.d30 = T.useDueText("2026-10-05"); r.d30y = T.useDueText("2026-12-10");
      E.useN = 0; r.none = T.useDueText("2026-10-05");
      E.useN = 1; E.useUnit = "개월";
      return r;
    });
    assert.deepStrictEqual(due, { m31: "2월 28일", dec: "2027년 1월 15일", leap: "2월 29일", m3: "2027년 2월 28일", d30: "11월 4일", d30y: "2027년 1월 9일", none: "" });

    // 설정 화면: 방문 이벤트 → 쿠폰 사용기한 30 일 → 미리보기 · 저장
    await page.click("text=운영 설정");
    await page.click('[data-t="event"]');
    await page.click("[data-act=evTpl][data-i='2']");
    assert.strictEqual(await page.inputValue("#ev-use"), "1");
    assert.strictEqual(await page.inputValue("#ev-useu"), "개월");
    assert.match(await page.textContent("#ev-paper"), /사용기한: 11월 5일까지/);
    assert.match(await page.textContent("#ev-usehelp"), /11월 5일까지/);
    await page.fill("#ev-use", "30");
    await page.selectOption("#ev-useu", "일");
    assert.match(await page.textContent("#ev-paper"), /사용기한: 11월 4일까지/, "미리보기 바로 바뀜");
    assert.match(await page.textContent("#ev-usehelp"), /11월 4일까지/);
    const saved = JSON.parse(await page.evaluate(() => localStorage.getItem("astanakiz-visitevent")));
    assert.deepStrictEqual([saved.useN, saved.useUnit], [30, "일"], "설정에 저장");
    assert.match(await page.textContent(".formhelp"), /\{사용기한\}/, "넣을 수 있는 값에 {사용기한}");
    // 비우면 그 줄은 안 나옴
    await page.fill("#ev-use", "");
    assert.doesNotMatch(await page.textContent("#ev-paper"), /사용기한/, "비우면 사용기한 줄 없음");
    assert.match(await page.textContent("#ev-usehelp"), /없음/);
    assert.strictEqual(JSON.parse(await page.evaluate(() => localStorage.getItem("astanakiz-visitevent"))).useN, 0);
    const box = await page.evaluate(() => document.getElementById("sheet").getBoundingClientRect().bottom);
    assert.ok(box <= 768, "설정 화면 안 " + box);

    // 다시 켜도 그대로 · 실제 손님 입장권(오늘 날짜 기준)
    await page.fill("#ev-use", "2");
    await page.selectOption("#ev-useu", "개월");
    await page.reload();
    const real = await page.evaluate(() => {
      const T = window.__deskTest, E = T.EV_();
      const t = (v) => T.receiptLines("^*사용기한 {사용기한}까지", v).map((l) => l.t.trim()).join("|");
      return { n: E.useN, u: E.useUnit, today: t({ 날짜: "2026-10-05" }), other: t({ 날짜: "2026-10-20" }), given: t({ 날짜: "2026-10-05", 사용기한: "직접" }) };
    });
    assert.deepStrictEqual(real, { n: 2, u: "개월", today: "사용기한 12월 5일까지", other: "사용기한 12월 20일까지", given: "사용기한 직접까지" }, "입장권 날짜(쿠폰 나간 날) 기준");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
