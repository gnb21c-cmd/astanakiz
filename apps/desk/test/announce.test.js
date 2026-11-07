/* 안내 방송 (사장님 11/07): POS PC 스피커 → 매장 방송 · 웹 음성 합성(Windows 한국어 음성)
   - [퇴장 안내 방송] (열쇠판 위 · 숫자 = 분홍 열쇠 수) = 누른 순간 분홍 열쇠 번호를 모아 읽음 (빨강 · 직원 열쇠 뺌) · 알림음 → 멘트 · 되풀이
   - 골든벨이 울리면 배경음악과 함께 골든벨 멘트 자동 · 알림창 [골든벨 방송 다시] · 열쇠는 무제한
   - 운영 설정 → 안내 방송: 멘트 · 목소리 · 빠르기 · 되풀이 · 끄기 (다시 켜도 그대로) · 사무실 PC 에서는 퇴장 안내 방송 못 함
   음성 합성은 시험 브라우저에 목소리가 없어 '읽은 글을 남기는 가짜'로 바꿔 끼움 */
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
async function open(browser) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  page.errs = [];
  page.on("pageerror", (e) => page.errs.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.addInitScript(() => {
    window.__said = []; window.__cancel = 0;
    const voices = [{ name: "Microsoft Zira - English", lang: "en-US", voiceURI: "zira" }, { name: "Microsoft Heami - Korean", lang: "ko-KR", voiceURI: "heami" }, { name: "Google 한국의", lang: "ko-KR", voiceURI: "google-ko" }];
    const fake = { getVoices: () => voices, speak: (u) => { window.__said.push({ text: u.text, voice: u.voice && u.voice.name, rate: u.rate, lang: u.lang }); u.__t = setTimeout(() => u.onend && u.onend(), 120); fake.cur = u; }, cancel: () => { window.__cancel++; if (fake.cur) { clearTimeout(fake.cur.__t); const u = fake.cur; fake.cur = null; if (u.onerror) u.onerror(); } }, addEventListener: () => {} };
    Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  });
  await page.goto(DESK);
  return page;
}
const said = (p) => p.evaluate(() => window.__said.map((x) => x.text));

test("퇴장 안내 방송: 누른 순간 분홍 열쇠만 (빨강 · 직원 열쇠 뺌) · 알림음 → 멘트 · 숫자 = 분홍 열쇠 수 · 방송 중 [방송 멈춤]", async () => {
  const browser = await launch();
  try {
    const page = await open(browser);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const pink = await page.$$eval("#keys .key.pink", (e) => e.map((x) => Number(x.dataset.k)).sort((a, b) => a - b));
    const red = await page.$$eval("#keys .key.red", (e) => e.map((x) => Number(x.dataset.k)));
    assert.ok(pink.length >= 2 && red.length >= 1, `체험판 13:50 분홍 ${pink} · 빨강 ${red}`);
    assert.strictEqual((await page.textContent("#ann-btn")).replace(/\s+/g, " ").trim(), `퇴장 안내 방송 ${pink.length}`);
    await page.click("#ann-btn");
    assert.strictEqual((await page.textContent("#ann-btn")).trim(), "방송 멈춤", "방송 중");
    await page.waitForFunction(() => window.__said.length === 1, null, { timeout: 10000 });
    const s = await page.evaluate(() => window.__said[0]);
    assert.strictEqual(s.text, `퇴장 안내드립니다. ${pink.map((k) => `${k}번`).join(", ")} 고객님 이용 시간이 끝났습니다. 다음 손님 입장을 위해 열쇠 반납해 주세요.`);
    for (const k of red) assert.ok(!s.text.includes(` ${k}번`) && !s.text.startsWith(`${k}번`), `빨강 ${k}번은 뺌`);
    assert.deepStrictEqual([s.voice, s.lang, s.rate], ["Microsoft Heami - Korean", "ko-KR", 0.95], "한국어 목소리 (해미 먼저)");
    assert.strictEqual(await page.evaluate(() => window.__deskTest.ann.state().chimes), 1, "멘트 앞 알림음");
    await page.waitForFunction(() => /퇴장 안내 방송/.test(document.getElementById("ann-btn").textContent));
    // 직원 열쇠(손님과 안 이은 서비스 키)는 분홍이 돼도 안 부름
    const staffPink = await page.evaluate(() => { const T = window.__deskTest, h = T.holders().find((x) => x.svc && !x.of); return h ? h.keys : []; });
    for (const k of staffPink) assert.ok(!(await page.evaluate(() => window.__deskTest.ann.pink())).includes(k));
    // 방송 중 누르면 멈춤
    await page.evaluate(() => { const A = window.__deskTest.ann.ANN; A.repeat = 3; A.chime = false; });
    await page.click("#ann-btn");
    await page.waitForFunction(() => window.__said.length === 2);
    await page.click("#ann-btn");
    assert.match(await page.textContent("#toast"), /방송을 멈췄어요/);
    await page.waitForTimeout(1500);
    assert.strictEqual(await page.evaluate(() => window.__said.length), 2, "멈춘 뒤 되풀이 안 함");
    // 분홍이 없으면 단추가 꺼짐
    await page.evaluate(() => window.__deskTest.setNow(600));
    assert.strictEqual(await page.isDisabled("#ann-btn"), true);
    assert.deepStrictEqual(page.errs, []);
  } finally {
    await browser.close();
  }
});

test("골든벨: 울리는 순간 배경음악과 함께 골든벨 멘트 자동 · [골든벨 방송 다시] · 열쇠 무제한 · 끄면 안 함", async () => {
  const browser = await launch();
  try {
    const page = await open(browser);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.evaluate(() => window.__deskTest.setNow(1050)); // 17:30 — 열쇠 19개 · 남은 예약 2장 → 골든벨
    assert.ok(await page.isVisible("#golden"));
    await page.waitForFunction(() => window.__said.length === 1, null, { timeout: 15000 });
    assert.deepStrictEqual(await said(page), ["지금부터 모든 고객의 퇴장 시간 제한이 없어집니다. 자유로이 퇴장하시며 열쇠만 꼭 반납해 주세요."]);
    assert.strictEqual(await page.evaluate(() => window.__deskTest.ann.state().bgms), 1, "배경음악");
    assert.strictEqual(await page.$$eval("#keys .key.pink, #keys .key.red", (e) => e.length), 0, "열쇠 무제한");
    await page.waitForFunction(() => !window.__deskTest.ann.state().busy, null, { timeout: 15000 });
    await page.click("[data-act=annGolden]");
    await page.waitForFunction(() => window.__said.length === 2, null, { timeout: 15000 });
    assert.strictEqual(await page.evaluate(() => window.__deskTest.ann.state().bgms), 2);
    // 골든벨 자동 방송을 끄면 안 함
    const p2 = await open(browser);
    await p2.evaluate(() => { localStorage.clear(); localStorage.setItem("astanakiz-announce", JSON.stringify({ golden: false })); });
    await p2.reload();
    await p2.evaluate(() => window.__deskTest.setNow(1050));
    assert.ok(await p2.isVisible("#golden"));
    await p2.waitForTimeout(3000);
    assert.deepStrictEqual(await said(p2), []);
    assert.deepStrictEqual(page.errs.concat(p2.errs), []);
  } finally {
    await browser.close();
  }
});

test("운영 설정 → 안내 방송: 멘트 · 목소리 · 되풀이 · 끄기 (다시 켜도 그대로) · 시험 방송 · 사무실 PC 는 퇴장 안내 방송 못 함", async () => {
  const browser = await launch();
  try {
    const page = await open(browser);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.dblclick("#now");
    await page.click('[data-t="announce"]');
    assert.match(await page.textContent('[data-t="announce"]'), /안내 방송\s*켜짐 · 골든벨/);
    assert.match(await page.textContent("#setbody"), /이 PC 한국어 음성 2개/);
    assert.deepStrictEqual(await page.$$eval("#ann-voice option", (e) => e.map((x) => x.textContent)), ["Microsoft Heami - Korean (ko-KR)", "Google 한국의 (ko-KR)"], "한국어 목소리만");
    await page.selectOption("#ann-voice", "google-ko");
    await page.selectOption("#ann-rep", "2");
    await page.uncheck("#ann-chime");
    await page.fill("#ann-exit", "{열쇠} 손님 반납 시간입니다.");
    await page.waitForTimeout(800);
    await page.click("[data-act=annTest][data-k=exit]");
    await page.waitForFunction(() => window.__said.length === 2, null, { timeout: 10000 });
    assert.deepStrictEqual(await page.evaluate(() => window.__said.map((x) => [x.text, x.voice])), [["3번, 12번 손님 반납 시간입니다.", "Google 한국의"], ["3번, 12번 손님 반납 시간입니다.", "Google 한국의"]], "고친 멘트 · 고른 목소리 · 두 번");
    // 다시 켜도 그대로
    await page.reload();
    assert.deepStrictEqual(await page.evaluate(() => { const A = window.__deskTest.ann.ANN; return [A.repeat, A.chime, A.exitText]; }), [2, false, "{열쇠} 손님 반납 시간입니다."]);
    assert.strictEqual(await page.evaluate(() => localStorage.getItem("astanakiz-annvoice")), "google-ko");
    // 끄면 열쇠판 위 단추가 없어짐
    await page.dblclick("#now");
    await page.click('[data-t="announce"]');
    await page.uncheck("#ann-on");
    await page.click("#sheet [data-act=close] >> nth=0");
    assert.strictEqual(await page.isHidden("#ann-btn"), true);
    // 사무실 PC (미리 보기): 퇴장 안내 방송 · 골든벨 방송은 막힘 · 시험 방송은 됨
    await page.evaluate(() => { window.__deskTest.ann.ANN.on = true; window.__deskTest.sync.demo(true); });
    assert.strictEqual(await page.isHidden("#ann-btn"), true, "사무실 PC 에는 단추 없음");
    assert.deepStrictEqual(await page.evaluate(() => ["annExit", "annGolden", "annTest", "annStop"].map((a) => window.__deskTest.sync.gate(a))), [false, false, true, true]);
    assert.deepStrictEqual(page.errs, []);
  } finally {
    await browser.close();
  }
});
