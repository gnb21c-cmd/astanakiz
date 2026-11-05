/* 현장 이벤트 입장(한가위 등) 입장권 양식 (사장님 11/05)
   - 결제 없이 [○○ 이벤트 입장]으로 들어온 손님만 따로 쓰는 입장권 양식 — 프린트물 설정 → 입장권 양식 → 세 번째 칸 [한가위 이벤트 입장]
   - 비어 있으면 지금처럼 현장 입장 양식 (방문 이벤트 중 공통 양식이 있으면 그것) · 쓰면 방문 이벤트 중에도 이 양식
   - 현장 결제 · 네이버 예약 손님 양식은 그대로 · [지금 나가는 양식 가져오기] · [비우기] */
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

/** 열쇠 k 를 가진 손님에게 실제로 나갈 입장권 글 (출력과 같은 길: ticketText → receiptLines) */
const ticket = (page, k) => page.evaluate((key) => {
  const T = window.__deskTest, h = T.holders().find((x) => x.keys.includes(key)), v = T.keyVals(h);
  return T.receiptLines(T.formFor(v), v).map((l) => l.t.trim()).filter(Boolean);
}, k);
const openTicket = async (page) => { await page.dblclick("#now"); await page.click('[data-t="prints"]'); await page.click('[data-s="ticket"]'); };
const close = (page) => page.click("#sheet [data-act=close] >> nth=0");
const FORM = "#* 한가위 이벤트\n^* {구분} 무료 입장\n#*{열쇠}번\n#*퇴장  {퇴장시간}\n^11월 30일까지 · 다음에 또 오세요";

test("현장 이벤트 입장 양식: 세 번째 칸 · 비면 현장 입장 양식 · 쓰면 이벤트 입장 손님만 · 비우기 · 가져오기", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 10/5 13:50
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // 이름: 기타 → 현장 이벤트 입장 (입장권 양식 칸 안내도 거기)
    await page.dblclick("#now"); await page.click("[data-t=etc]");
    await page.fill("#wev-name", "한가위");
    assert.match(await page.textContent("#sheet .setcard"), /입장권 양식 → \[한가위 이벤트 입장\] 칸에 따로 쓸 수 있어요 \(비어 있어 현장 입장 양식\)/);
    await close(page);

    // 손님 셋: 한가위 이벤트 입장(44) · 현장 결제(45) · 서비스 키 없음 — 네이버는 체험판 손님
    await page.evaluate(() => { const T = window.__deskTest; T.walkin("01011112222", [44], 830, 830, "한가위"); T.walkin("01033332222", [45], 830, 830); T.setNow(835); });
    const walk0 = await ticket(page, 45);
    assert.deepStrictEqual(await ticket(page, 44), walk0.map((l) => l.replace("현장 입장권", "한가위 이벤트 입장권").replace(/^45번$/, "44번")), "비어 있으면 현장 입장 양식 그대로 ({구분} 만 '한가위 이벤트')");

    // 프린트물 설정 → 입장권 양식: [네이버 예약] [현장 입장] [한가위 이벤트 입장]
    await openTicket(page);
    assert.deepStrictEqual(await page.$$eval("#sheet .evrules .evno", (e) => e.map((x) => x.textContent.trim())), ["네이버 예약", "현장 입장", "한가위 이벤트 입장"]);
    assert.match(await page.textContent("#sheet .evrules"), /현장 결제 · 이벤트 입장 · 서비스 키 입장권.*\[한가위 이벤트 입장\]으로 들어온 손님만 · 비어 있으면 현장 입장 양식/);
    const walkText = await (async () => { await page.click("#sheet .evno[data-k=walk]"); return page.inputValue("#form-text"); })();
    await page.click("#sheet .evno[data-k=ev]");
    assert.strictEqual(await page.inputValue("#form-text"), "", "처음엔 비어 있음");
    assert.match(await page.textContent("#sheet .prn .label:has(#evw-note)"), /한가위 이벤트 입장 ?\(비어 있어 현장 입장 양식\)/);
    assert.ok(await page.isVisible("#evw-note") && await page.isVisible("#sheet [data-act=evwCopy]"), "비었다는 설명 · 가져오기 단추가 바로 보임 ([?] 뒤 · 큰 글 칸 아래로 숨지 않음)");
    assert.match(await page.textContent("#paper"), /한가위 이벤트 입장권.*네이버 예약하고/, "미리보기 = 지금 나가는 현장 입장 양식 · {구분} = 한가위 이벤트");
    assert.ok(await page.isDisabled("#sheet [data-act=resetForm]"), "비어 있으면 [비우기] 못 누름");
    assert.strictEqual(await page.$$eval("#sheet [data-act=previewKind]", (e) => e.length), 0, "보통 · 이벤트 미리보기 단추는 네이버 칸에만");

    // 쓰면 → 이벤트 입장 손님만 이 양식 · 현장 결제 · 네이버는 그대로
    await page.fill("#form-text", FORM);
    assert.strictEqual(await page.evaluate(() => window.__deskTest.PRINT_().forms.enter.ev), FORM);
    assert.strictEqual(await page.evaluate(() => window.__deskTest.PRINT_().forms.enter.walk), walkText, "현장 입장 양식은 그대로");
    assert.match(await page.textContent("#paper"), /한가위 이벤트.*한가위 이벤트 무료 입장.*30번.*11월 30일까지/);
    assert.strictEqual(await page.textContent("#evw-note"), "", "비어 있다는 설명이 사라짐");
    await close(page);
    assert.deepStrictEqual(await ticket(page, 44), ["한가위 이벤트", "한가위 이벤트 무료 입장", "44번", "퇴장  오후 3시 40분", "11월 30일까지 · 다음에 또 오세요"]);
    assert.deepStrictEqual(await ticket(page, 45), walk0, "현장 결제 손님은 현장 입장 양식 그대로");
    const nv = await page.evaluate(() => { const T = window.__deskTest; return T.formFor({ _현장: false }) === T.PRINT_().forms.enter.text; });
    assert.ok(nv, "네이버 손님은 네이버 예약 양식 그대로");
    // 현장 입장 칸 설명: 이벤트 입장은 따로 쓰는 중이라 빠짐
    await openTicket(page);
    assert.match(await page.textContent("#sheet .evrules"), /현장 결제 · 서비스 키 입장권.*이 양식으로 나가요/);
    assert.doesNotMatch(await page.textContent("#sheet .evrules"), /현장 결제 · 이벤트 입장/);

    // [비우기] → 다시 현장 입장 양식 · [지금 나가는 양식 가져오기] → 그 글로 시작
    await page.click("#sheet .evno[data-k=ev]");
    await page.click("#sheet [data-act=resetForm]");
    assert.strictEqual(await page.evaluate(() => window.__deskTest.PRINT_().forms.enter.ev), "");
    assert.strictEqual(await page.inputValue("#form-text"), "");
    await page.click("#sheet [data-act=evwCopy]");
    assert.strictEqual(await page.inputValue("#form-text"), walkText, "가져오기 = 지금 나가는 현장 입장 양식");
    assert.match(await page.textContent("#toast"), /한가위 이벤트 입장 양식으로 가져왔어요/);
    await page.fill("#form-text", "   ");
    assert.strictEqual(await page.evaluate(() => window.__deskTest.PRINT_().forms.enter.ev), "", "빈칸만 = 비움");
    await close(page);
    assert.deepStrictEqual(await ticket(page, 44), walk0.map((l) => l.replace("현장 입장권", "한가위 이벤트 입장권").replace(/^45번$/, "44번")));
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("현장 이벤트 입장 양식은 방문 이벤트(돈까스) 중에도 먼저 · 비면 방문 이벤트 공통 양식 · 실제 [이벤트 입장]으로 등록한 손님 · 다시 출력도", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    const COMMON = "#* 아스타나키즈 공통\n^* {구분} 입장권\n#*{열쇠}번\n[이벤트]";
    await page.addInitScript((form) => { if (!localStorage.getItem("astanakiz-visitevent")) localStorage.setItem("astanakiz-visitevent", JSON.stringify({ ver: 2, on: true, from: "2026-09-10", to: "2026-10-31", days: 20, gift: "수제돈까스", form })); localStorage.setItem("astanakiz-walkevent", "한가위"); }, COMMON);
    await page.goto(DESK);
    // 현장입장 창 → 전화번호 → [한가위 이벤트 입장]
    await page.click(".key[data-k='32']");
    for (const k of "12345678") await page.click(`.keypad [data-k="${k}"]`);
    await page.click("#w-event");
    assert.deepStrictEqual(await ticket(page, 32), ["아스타나키즈 공통", "한가위 이벤트 입장권", "32번"], "비어 있으면 방문 이벤트 공통 양식 (이벤트 안내 줄은 없음)");
    await openTicket(page);
    await page.click("#sheet .evno[data-k=ev]");
    assert.match(await page.textContent("#evw-note"), /비어 있어 방문 이벤트 공통 양식/);
    assert.match(await page.textContent("#paper"), /아스타나키즈 공통.*한가위 이벤트 입장권/);
    await page.click("#sheet [data-act=evwCopy]");
    assert.strictEqual(await page.inputValue("#form-text"), COMMON, "가져오기 = 지금 나가는 방문 이벤트 공통 양식");
    await page.fill("#form-text", FORM);
    await close(page);
    assert.deepStrictEqual(await ticket(page, 32), ["한가위 이벤트", "한가위 이벤트 무료 입장", "32번", "퇴장  오후 3시 20분", "11월 30일까지 · 다음에 또 오세요"], "방문 이벤트 중에도 이벤트 입장 양식이 먼저");
    // 다시 출력(열쇠 창 [입장권 다시 출력])도 같은 양식 — 출력 흉내 앱으로 확인
    await page.evaluate(() => { const T = window.__deskTest; T.PRINT_().sel = "POS-80C (USB001)"; T.PRINT_().mode = "win"; });
    await page.click(".key[data-k='32']");
    await page.click("#sheet [data-act=reprint]");
    const last = await page.evaluate(() => window.__deskTest.lastPrint());
    assert.strictEqual(last && last.text, FORM, "다시 출력도 이벤트 입장 양식");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
