/* 설문조사 (사용자 지시 10/14)
   - 운영 설정 → 설문조사: 설문 기간 · 보고앱에 보내기(매일 20:00) · 대상(신규고객 / 현장구매자 / 전체고객) · 선택지 1~n (+ 추가)
   - 대상 손님: 예약자 창 오른쪽에 "신규고객께 아스타나키즈를 어떻게 알게 되었는지 물어봐주세요" + 번호 버튼 → 번호를 눌러야 열쇠를 고르고 등록
   - 현장구매자도 대상이면 현장입장 창 위에 같은 안내 + 번호 + [제외] (신규가 아니면 제외) → 눌러야 등록
   - 누른 번호는 예약 · 현장입장 기록에 남아 기간 누적 · 오늘 수로 셈 → 20:00 보고앱에 보냄 */
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
const Q = "신규고객께 아스타나키즈를 어떻게 알게 되었는지 물어봐주세요";
const openSurvey = async (page) => { await page.click("text=운영 설정"); await page.click('[data-t="survey"]'); };
const close = (page) => page.click("#sheet [data-act=close] >> nth=0");

test("설문조사: 신규 예약자는 번호를 눌러야 열쇠 · 현장구매자는 번호 또는 제외 · 기간 누적 · 20:00 보고", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 10/5 13:50
    await page.evaluate(() => window.__deskTest.addBooking("2026-10-05", "14:00", "신규손님", "01099990000", 1, { prevDone: 0 }));
    // 설문 기간 전: 신규 손님이어도 그대로
    await page.click('.slot[data-s="840"]');
    await page.click('.res:has-text("신규손님")');
    assert.strictEqual(await page.$("#sheet .svbox"), null);
    await close(page);

    // 운영 설정 → 설문조사 (마지막 탭)
    const tabs = await page.$$eval("#sheet .tabs button", (e) => e.map((x) => x.textContent.trim())).catch(() => []);
    await openSurvey(page);
    assert.strictEqual((await page.$$eval("#sheet .tabs button", (e) => e.map((x) => x.textContent.trim()))).pop(), "설문조사", "아마노 · POS 다음 " + tabs);
    await page.fill("#sv-from", "2026-10-05");
    await page.fill("#sv-to", "2026-10-31");
    assert.match(await page.textContent("#sheet .evstate"), /진행 중/);
    assert.deepStrictEqual(await page.$$eval("#sheet .svopt", (e) => e.length), 5, "선택지 기본 5개");
    await page.fill(".svlabel[data-i='0']", "네이버 검색");
    await page.fill(".svlabel[data-i='1']", "인스타그램");
    await page.click("[data-act=svAdd]");
    assert.strictEqual(await page.$$eval("#sheet .svopt", (e) => e.length), 6, "+ 로 6번");
    assert.ok(await page.isChecked("#sv-new") && !(await page.isChecked("#sv-walk")) && !(await page.isChecked("#sv-all")), "기본 대상 = 신규고객");
    await close(page);

    // 신규 예약자: 오른쪽에 안내 + 번호 1~6 (제외 없음) · 번호 전엔 열쇠 · 등록 잠김
    await page.click('.res:has-text("신규손님")');
    assert.match(await page.textContent("#sheet .svbox"), new RegExp(Q));
    assert.deepStrictEqual(await page.$$eval("#sheet .svbox .svb", (e) => e.map((x) => x.querySelector("b") ? x.querySelector("b").textContent : x.textContent.trim())), ["1", "2", "3", "4", "5", "6"]);
    assert.ok(await page.$eval("#sheet .kpick button:not(.on)", (b) => b.disabled), "번호 전엔 열쇠를 못 고름");
    assert.ok(await page.isDisabled("#enter-done"));
    assert.match(await page.textContent("#sheet"), /설문 번호를 먼저 눌러 주세요/);
    await page.click("#sheet .svb[data-n='2']");
    await page.click(".kpick button:not([disabled]) >> nth=0");
    await page.click("#enter-done");
    const sv = await page.evaluate(() => window.__deskTest.holders().find((h) => h.name === "신규손님").sv);
    assert.strictEqual(sv, 2);
    // 기존 손님은 설문 없음
    await page.click('.res:has-text("전시윤")');
    assert.strictEqual(await page.$("#sheet .svbox"), null);
    await close(page);

    // 현장구매자 대상 → 현장입장 창 위에 안내 + 번호 + [제외], 눌러야 등록
    await page.click('.key[data-k="43"]');
    assert.strictEqual(await page.$("#sheet .svwalk"), null, "현장구매자는 대상이 아니면 그대로");
    await close(page);
    await openSurvey(page);
    await page.check("#sv-walk");
    await close(page);
    await page.click('.key[data-k="43"]');
    assert.match(await page.textContent("#sheet .svwalk"), new RegExp(Q));
    assert.match(await page.textContent("#sheet .svwalk"), /제외/);
    for (const k of "12345678") await page.click(`.keypad [data-k="${k}"]`);
    assert.ok(await page.isDisabled("#w-done"), "번호 전엔 등록 잠김");
    await page.click("#sheet .svb.skip");
    assert.ok(await page.isEnabled("#w-done"), "제외 → 등록");
    await page.click("#w-done");
    const ws = await page.evaluate(() => window.__deskTest.holders().filter((h) => h.walk && h.keys.includes(43)).map((h) => h.sv));
    assert.deepStrictEqual(ws, [0], "제외 = 0");
    await page.click('.key[data-k="44"]');
    for (const k of "12345679") await page.click(`.keypad [data-k="${k}"]`);
    await page.click("#sheet .svb[data-n='1']");
    await page.click("#w-done");

    // 집계: 번호별 오늘 · 누적 · 제외
    await openSurvey(page);
    const rows = await page.$$eval("#sheet .svopt", (e) => e.map((x) => x.textContent.replace(/\s+/g, " ")));
    assert.match(rows[0], /오늘 1 · 누적 1/);
    assert.match(rows[1], /오늘 1 · 누적 1/);
    assert.match(rows[2], /오늘 0 · 누적 0/);
    assert.match(await page.textContent("#sheet"), /응답 오늘 2 · 누적 2 · 제외 오늘 1 · 누적 1/);
    const p = await page.evaluate(() => window.__deskTest.svPayload());
    assert.deepStrictEqual(p.options.slice(0, 3).map((o) => [o.no, o.label, o.today, o.total]), [[1, "네이버 검색", 1, 1], [2, "인스타그램", 1, 1], [3, "", 0, 0]]);
    assert.deepStrictEqual([p.answered.total, p.excluded.total, p.period], [2, 1, { from: "2026-10-05", to: "2026-10-31" }]);
    // 전체고객: 기존 예약자도 (문구는 '고객께' · 제외 있음)
    await page.check("#sv-all");
    assert.ok(await page.isDisabled("#sv-new") && await page.isDisabled("#sv-walk"));
    // 20:00 자동 보고 (보내기 켬)
    await page.check("#sv-send");
    await close(page);
    await page.click('.res:has-text("홍예준")');
    assert.match(await page.textContent("#sheet .svbox"), /^고객께|[^신]고객께 아스타나키즈/);
    assert.match(await page.textContent("#sheet .svbox"), /제외/);
    await close(page);
    await page.evaluate(() => window.__deskTest.setNow(1199));
    await page.waitForTimeout(1300);
    assert.strictEqual(await page.evaluate(() => window.__deskTest.SV.sentDay), "", "20:00 전엔 안 보냄");
    await page.evaluate(() => window.__deskTest.setNow(1200));
    await page.waitForFunction(() => window.__deskTest.SV.sentDay === "2026-10-05", null, { timeout: 4000 });
    assert.match(await page.textContent("#toast"), /보고 파일로 남기는 흉내/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("설문조사(앱): 20:00 에 보고앱으로 한 번 · 다시 켜도 누적 그대로", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date("2026-10-14T19:58:30") });
    await page.addInitScript(() => {
      window.__sent = JSON.parse(localStorage.getItem("test-sent") || "[]");
      const cfg = JSON.parse(localStorage.getItem("test-cfg") || "null") || { build: "1.38", survey: { from: "2026-10-14", to: "2026-10-31", send: true, naverNew: true, opts: ["네이버 검색", "인스타그램", "지인 소개", "블로그", "기타"] } };
      const BK = (no, time, name, phone, done) => ({ no, time, name, phone, qty: 1, qtyText: "1시간 50분 1", product: "1시간 50분", status: "확정", pay: "결제완료", doneCount: done, cancelCount: 0 });
      window.desk = {
        naver: { load: async (day) => ({ ok: true, day, slots: day === "2026-10-14" ? [{ time: "19:30", cap: 10, conf: 2, done: 0 }] : [], bookings: day === "2026-10-14" ? [BK("S1", "19:30", "김신규", "010-7777-0001", 0), BK("S2", "19:30", "박단골", "010-7777-0002", 6)] : [] }), complete: async () => ({ ok: true }) },
        state: { load: (day) => localStorage.getItem("test-state-" + day), save: (day, json) => localStorage.setItem("test-state-" + day, json) },
        config: { get: async () => cfg, set: async (patch) => { Object.assign(cfg, patch); localStorage.setItem("test-cfg", JSON.stringify(cfg)); return { ok: true }; } },
        survey: { send: async (job) => { window.__sent.push(job); localStorage.setItem("test-sent", JSON.stringify(window.__sent)); return { ok: true, file: "C:/report-outbox/survey-2026-10-14.json" }; } },
      };
    });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    await page.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 15000 });
    await page.click('.slot[data-s="1170"]');
    await page.click('.res:has-text("박단골")');
    assert.strictEqual(await page.$("#sheet .svbox"), null, "완료 6 = 기존 손님");
    await close(page);
    await page.click('.res:has-text("김신규")');
    assert.match(await page.textContent("#sheet .svbox"), /신규고객께/);
    await page.click("#sheet .svb[data-n='3']");
    await page.click(".kpick button:not([disabled]) >> nth=0");
    await page.click("#enter-done");
    assert.deepStrictEqual(await page.evaluate(() => window.__sent), [], "20:00 전");
    await page.clock.runFor(95000); // 20:00 지남
    await page.waitForFunction(() => window.__sent.length === 1);
    const [job] = await page.evaluate(() => window.__sent);
    assert.strictEqual(job.url, undefined, "보고앱 주소로 보내지 않음 — 파일만 (보고 시스템이 POS PC 폴더에서 가져감)");
    const pl = JSON.parse(job.json);
    assert.strictEqual(pl.type, "astanakiz-survey");
    assert.deepStrictEqual(pl.options.map((o) => [o.no, o.label, o.today, o.total]), [[1, "네이버 검색", 0, 0], [2, "인스타그램", 0, 0], [3, "지인 소개", 1, 1], [4, "블로그", 0, 0], [5, "기타", 0, 0]]);
    await page.clock.runFor(120000);
    assert.strictEqual(await page.evaluate(() => window.__sent.length), 1, "하루 한 번 (바뀐 게 없으면)");

    // [+] 예약 없이 이벤트로 들어온 손님 등 확인된 수 (사장님 10/15) — 20:00 뒤에 바뀌면 그날 파일을 다시 씀 · 따로 기록 없음
    await openSurvey(page);
    assert.strictEqual(await page.$("#sv-url"), null, "보고앱 주소 칸 없음");
    await page.click("[data-act=svPlus][data-n='1']");
    await page.click("[data-act=svPlus][data-n='1']");
    await page.click("[data-act=svPlus][data-n='3']");
    await page.click("[data-act=svMinus][data-n='1']"); // 잘못 누른 것 되돌리기
    const rows = await page.$$eval("#sheet .svopt", (e) => e.map((x) => x.textContent.replace(/\s+/g, " ")));
    assert.match(rows[0], /오늘 1 \(직접 \+1\) · 누적 1/);
    assert.match(rows[2], /오늘 2 \(직접 \+1\) · 누적 2/);
    assert.strictEqual(await page.$("[data-act=svMinus][data-n='2']"), null, "직접 더한 게 없으면 [−] 없음");
    await close(page);
    await page.clock.runFor(12000);
    await page.waitForFunction(() => window.__sent.length === 2);
    const p2 = JSON.parse((await page.evaluate(() => window.__sent))[1].json);
    assert.deepStrictEqual(p2.options.map((o) => [o.no, o.today, o.total]).slice(0, 3), [[1, 1, 1], [2, 0, 0], [3, 2, 2]]);
    assert.deepStrictEqual(p2.answered, { today: 3, total: 3 }, "직접 더한 수도 응답 수에");
    const saved = JSON.parse(await page.evaluate(() => localStorage.getItem("test-state-2026-10-14")));
    assert.deepStrictEqual(saved.sa, { 1: 1, 3: 1 }, "그날 저장 파일에 번호별 수만");

    // 다시 켜기: 오늘 기록(저장 파일)에서 누적 그대로 · 이미 보냈으니 또 안 보냄
    await page.goto(DESK);
    await page.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 15000 });
    await page.clock.runFor(15000);
    assert.strictEqual(await page.evaluate(() => window.__sent.length), 2, "다시 켜도 같은 숫자면 또 안 씀");
    await openSurvey(page);
    assert.match((await page.$$eval("#sheet .svopt", (e) => e.map((x) => x.textContent.replace(/\s+/g, " "))))[2], /오늘 2 \(직접 \+1\) · 누적 2/, "다시 켜도 직접 더한 수 그대로");
    assert.match(await page.textContent("#sheet"), /마지막: 2026-10-14 20:0\d 자동 · 파일로 남김/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
