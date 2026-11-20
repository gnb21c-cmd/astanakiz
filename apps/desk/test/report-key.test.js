/* 보고 열쇠 · 설문조사 뺌 (사장님 11/20 — "설문 하는 것은 이제 더이상 쓰지 않으니 설문 기능과 설정은 제거해 · 나중에 다시 하게 될 때 추가 요청")
   - 운영 설정 → 기타 → 보고 앱: 보고 열쇠만 (폰 실시간 현황 · 재방문 간격 · 이벤트 입장 수 · 방문 기록 · 두 PC 연결이 같이 씀)
   - 예전 설문 설정(survey)이 남아 있어도 예약자 · 현장입장 창에 설문 번호가 안 나오고 바로 입장 · 20:00 설문 보고 없음
   - 첫 방문(네이버 완료 0) 표시는 그대로 */
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
const openEtc = async (page) => { await page.dblclick("#now"); await page.click('[data-t="etc"]'); };
const close = (page) => page.click("#sheet [data-act=close] >> nth=0");

test("설문조사 뺌(앱): 예전 설문 설정이 남아 있어도 설문 번호 없이 바로 입장 · 기타에 설문 칸 없음 · 20:00 설문 보고 없음 · 보고 열쇠는 그대로 (11/20)", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date("2026-10-14T19:58:00") });
    await page.addInitScript(() => {
      window.__set = []; window.__calls = [];
      // 예전 판에서 켜 둔 설문 설정 (기간 안 · 신규 · 현장구매자 · 보내기 켬)
      const cfg = { build: "2.34", hasSurveyKey: false, surveyKeyTail: "", survey: { on: true, from: "2026-10-01", to: "2026-10-31", send: true, naverNew: true, walkin: true, all: true, opts: ["네이버 검색", "인스타그램", "지인 소개"] } };
      const day = { ok: true, day: "2026-10-14", slots: [{ time: "14:00", booked: 2, cap: 30 }], bookings: [
        { no: "9001", time: "14:00", name: "처음손님", phone: "010-1111-2222", qty: 1, product: "키즈 입장권", pay: "결제완료", status: "확정", prevDone: 0 },
        { no: "9002", time: "14:00", name: "단골손님", phone: "010-1111-3333", qty: 1, product: "키즈 입장권", pay: "결제완료", status: "확정", prevDone: 4 }] };
      window.desk = {
        naver: { load: async () => day, complete: async () => ({ ok: true }) },
        state: { load: () => null, save: () => {} },
        config: { get: async () => cfg, set: async (patch) => { window.__set.push(patch); if (patch.surveyKey !== undefined) { cfg.hasSurveyKey = !!patch.surveyKey; cfg.surveyKeyTail = String(patch.surveyKey).slice(-4); } else Object.assign(cfg, patch); return { ok: true }; } },
        // 예전 판이 쓰던 설문 보고 (이제 데스크가 부르지 않음)
        survey: { send: async (job) => { window.__calls.push(job); return { ok: true }; } },
      };
    });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    await page.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 15000 });

    // 예약자 창: 첫 방문 손님도 설문 번호 없이 바로 열쇠
    await page.click('.slot[data-s="840"]');
    await page.click('.res:has-text("처음손님")');
    const sheet = (await page.textContent("#sheet")).replace(/\s+/g, " ");
    assert.doesNotMatch(sheet, /설문|어떻게 알게 되었는지/);
    assert.strictEqual(await page.$("#sheet .svbox, #sheet .svb"), null, "설문 번호 버튼 없음");
    await page.click(".kpick button:not([disabled]) >> nth=0");
    assert.ok(!(await page.isDisabled("#enter-done")), "열쇠만 고르면 등록 가능");
    await page.click("#enter-done");
    assert.match(await page.textContent('.res:has-text("처음손님")'), /이용완료/);

    // 현장입장 창: 설문 없이 전화번호 → 이벤트 입장도 바로
    await page.click('.key[data-k="20"]');
    assert.strictEqual(await page.$("#sheet .svwalk, #sheet .svb"), null, "현장입장 창에 설문 없음");
    assert.doesNotMatch(await page.textContent("#sheet"), /설문/);
    await close(page);

    // 운영 설정 → 기타: 설문 칸 없음 · 보고 열쇠는 그대로
    await openEtc(page);
    const etc = (await page.textContent("#sheet")).replace(/\s+/g, " ");
    assert.doesNotMatch(etc, /설문/);
    assert.strictEqual(await page.$("#sv-from, #sv-send, [data-act=svSendNow], [data-act=svToggle], .svopts"), null, "설문 기간 · 보내기 · 선택지 없음");
    assert.match(etc, /보고 앱 폰 실시간 현황 · 재방문 간격 · 이벤트 입장 수 · 방문 기록 · 두 PC 연결 — 같은 보고 열쇠/);
    assert.match(etc, /보고 열쇠를 넣으면 폰 실시간 현황 · 재방문 간격 · 이벤트 입장 수를 보고 앱에 보내요/);
    assert.strictEqual(await page.getAttribute("#sv-key", "type"), "password", "비밀번호처럼 가려서");
    await page.fill("#sv-key", "too_short");
    await page.click("[data-act=svKeySave]");
    assert.match(await page.textContent("#toast"), /16~64자 영문 · 숫자 · _ - 만/);
    await page.fill("#sv-key", "Board_key-0123456789xyz");
    await page.click("[data-act=svKeySave]");
    assert.deepStrictEqual(await page.evaluate(() => window.__set.filter((p) => "surveyKey" in p)), [{ surveyKey: "Board_key-0123456789xyz" }], "열쇠는 앱 본체(암호화 저장)로");
    assert.match(await page.textContent("#toast"), /보고 열쇠를 저장했어요 — 폰 실시간 현황을 바로 보내요/);
    assert.match(await page.getAttribute("#sv-key", "placeholder"), /저장됨 \(끝 ••9xyz\)/);
    assert.strictEqual(await page.inputValue("#sv-key"), "", "화면에 열쇠를 다시 보여 주지 않음");
    assert.match(await page.textContent("#sheet"), /보고 열쇠 있음/);
    await page.click("[data-act=svKeyDel]");
    assert.deepStrictEqual(await page.evaluate(() => window.__set.filter((p) => "surveyKey" in p).pop()), { surveyKey: "" });
    assert.match(await page.textContent("#toast"), /보고 열쇠를 지웠어요/);
    await close(page);

    // 20:00 지나도 설문 보고 없음 · 설정에 설문을 다시 쓰지 않음
    await page.clock.runFor(5 * 60000);
    assert.deepStrictEqual(await page.evaluate(() => window.__calls), [], "설문 보고를 부르지 않음");
    assert.ok(!(await page.evaluate(() => window.__set.some((p) => "survey" in p))), "설문 설정을 쓰지 않음");
    assert.strictEqual(await page.evaluate(() => "SV" in window.__deskTest), false);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("첫 방문 (사장님 10/27): 이벤트가 아니어도 네이버 완료 0 손님 카드 · 예약자 창에 '첫 방문' — 처음 온 손님이 바로 보이게", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 10/5 13:50 · 이벤트 없음
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.evaluate(() => { const T = window.__deskTest; T.addBooking("2026-10-05", "14:00", "처음손님", "01099990001", 1, { prevDone: 0 }); T.addBooking("2026-10-05", "14:00", "단골손님", "01099990002", 1, { prevDone: 3 }); });
    await page.click('.slot[data-s="840"]');
    const text = async (n) => (await page.textContent(`.res:has-text("${n}")`)).replace(/\s+/g, " ");
    assert.match(await text("처음손님"), /첫 방문\s*·\s*완료 0 → 1번 완료 예정/);
    assert.doesNotMatch(await text("처음손님"), /도전 시작|첫 방문!/, "이벤트가 아니면 '이벤트 도전 시작'은 없음");
    assert.doesNotMatch(await text("단골손님"), /첫 방문/);
    await page.click('.res:has-text("처음손님")');
    assert.match(await page.textContent("#sheet .facts"), /첫 방문/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
