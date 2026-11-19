/* 부분취소 (사장님 11/11 — 5장 예약 → 4장 부분취소 → 1장 입장인데 데스크 카드는 5장 · 열쇠를 5개 눌러야 입장 등록이 됨)
   네이버는 부분취소를 예약현황 칸 숫자(확정 · 이용완료 · 잔여)에는 바로 반영하지만 예약 카드의 '수량'은 처음 결제한 수 그대로
   - 예약 상세정보의 '결제/환불정보 → 환불정보' 환불내역 "[평일할인]4인 입장권(12,000X1)" 의 X n 을 더하면 정확한 취소 장수
   - 목록 요약 카드(칸에 예약이 여럿)는 환불정보가 없음 → 칸 숫자 − 카드 합으로: 여러 장 산 카드가 하나면 그 카드 · 둘 이상이면 상세를 열어 봄
   - 그래도 모르면 데스크 입장 창에서 근무자가 실제 장수를 고름 (고르기 전에는 열쇠를 못 고름)
   → 카드 수량 · 지급할 열쇠 수 · 입장권 · 명단 '수량' · 폰 현황 손님 줄이 모두 남은 장수 (보고 앱 장수 · 매출은 원래 네이버 칸 숫자) */
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { NaverSync, partialFix } = require("../src/naver-sync");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  ({ chromium } = require("/opt/node-tools/node_modules/playwright"));
}
const NAVER = "file://" + path.join(__dirname, "..", "mock", "naver.html");
const DESK = "file://" + path.join(__dirname, "..", "..", "..", "prototype", "desk.html");
const launch = () => chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});

test("partialFix: 칸 숫자 − 카드 합 = 부분취소 장수 · 예약 상세 환불정보를 읽은 카드만 줄임 · 모르는 여러 장 카드는 물음(앱이 상세를 열어 봄) — 칸 숫자만으로는 안 줄임 (11/19)", () => {
  const c = (no, qty, status = "확정", refund) => ({ no, qty, status, refund });
  const fix = (cards, n, kind = "확정") => Object.fromEntries(partialFix(cards, n, kind));
  assert.deepStrictEqual(fix([c("a", 5), c("b", 1)], 2), { a: { ask: { n: 2, sum: 6, cut: 4 } } }, "5장 + 1장인데 칸 2 → 5장 카드가 모름 (상세를 열어 봄 · 예전엔 칸 숫자만으로 4장 취소)");
  assert.deepStrictEqual(fix([c("a", 5, "확정", 4), c("b", 1)], 2), { a: { qty: 1, booked: 5, cut: 4, src: "detail" } }, "상세 환불정보로 4장 취소");
  // 사장님 11/19: 같은 손님이 같은 시간 2장 + 1장 · 1장은 방금 예약해 칸 숫자에 아직 없음(칸 2) → 예전엔 2장 카드를 1장으로 줄여 열쇠 2개 · 두 예약 함께 이용완료
  assert.deepStrictEqual(fix([c("a", 2), c("b", 1)], 2), { a: { ask: { n: 2, sum: 3, cut: 1 } } }, "칸이 늦게 따라옴 — 칸 숫자만으로는 안 줄임");
  assert.deepStrictEqual(fix([c("a", 2, "확정", 0), c("b", 1)], 2), {}, "상세에 환불이 없으면 그대로 (2장 + 1장 = 열쇠 3개)");
  assert.deepStrictEqual(fix([c("a", 2), c("b", 1)], 3), {}, "맞으면 그대로");
  assert.deepStrictEqual(fix([c("a", 2)], 3), {}, "카드를 덜 읽었으면(합 < 칸) 손대지 않음");
  assert.deepStrictEqual(fix([c("a", 2), c("b", 3)], 4), { a: { ask: { n: 4, sum: 5, cut: 1 } }, b: { ask: { n: 4, sum: 5, cut: 1 } } }, "여러 장 산 카드가 둘 → 누구 것인지 모름");
  assert.deepStrictEqual(fix([c("a", 2, "확정", 0), c("b", 3, "확정", 1)], 4), { b: { qty: 2, booked: 3, cut: 1, src: "detail" } }, "상세 환불정보를 읽은 카드는 그대로");
  assert.deepStrictEqual(fix([c("a", 2, "확정", 0), c("b", 3)], 4), { b: { ask: { n: 4, sum: 5, cut: 1 } } }, "하나를 상세로 알아도 나머지는 칸 숫자만으로 안 줄임 (상세를 열어 봄)");
  assert.deepStrictEqual(fix([c("a", 4, "확정", 2)], 2), { a: { qty: 2, booked: 4, cut: 2, src: "detail" } }, "칸에 1건 = 예약 상세 (환불내역 X1 두 건)");
  assert.deepStrictEqual(fix([c("a", 4, "이용완료"), c("x", 3, "신청")], 2, "이용완료"), { a: { ask: { n: 2, sum: 4, cut: 2 } } }, "다른 상태 카드는 셈에서 뺌");
});

/** 가짜 네이버(?partial=1) → 앱 본체 NaverSync → 데스크 */
async function open(browser, extra = "", pre = null) {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const np = await ctx.newPage();
  const q = "?partial=1" + extra;
  await np.goto(NAVER + q);
  await np.evaluate(() => localStorage.clear());
  await np.goto(NAVER + q);
  if (pre) await np.evaluate(pre);
  const naver = new NaverSync((code) => np.evaluate(code), { urls: { list: NAVER + "?view=list&partial=1" + extra, calendar: NAVER + "?view=calendar&partial=1" + extra } });
  const desk = await ctx.newPage();
  await desk.clock.install({ time: new Date("2026-10-05T10:56:00") });
  let qq = Promise.resolve();
  const serial = (fn) => (qq = qq.then(fn, fn));
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
  await desk.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 60000 });
  return { desk, errs, np };
}
const cells = (desk, t) => desk.$$eval(`.slot[data-s="${t}"] .c`, (e) => e.map((x) => x.textContent.trim()));
const qtyRows = (desk) => desk.$$eval(".res", (e) => Object.fromEntries(e.map((x) => [x.querySelector(".name").textContent.replace(/\s+|첫방문/g, ""), [...x.querySelectorAll("dt")].find((d) => d.textContent === "수량").nextElementSibling.textContent.replace(/\s+/g, " ").trim()])));

test("부분취소: 카드 · 명단 수량은 남은 장수 · 열쇠도 남은 장수만큼 · 누구 것인지 모르면 예약 상세 환불정보를 열어 봄 · 폰 현황 손님 줄도", async () => {
  const browser = await launch();
  try {
    const { desk, errs } = await open(browser);
    // 11:00 — 5장 예약 · 4장 부분취소 + 1장 손님 → 네이버 칸 확정 2
    assert.deepStrictEqual(await cells(desk, 660), ["0", "2", "8"]);
    await desk.click('.slot[data-s="660"]');
    assert.strictEqual((await desk.textContent("#res-sub")).trim(), "2명 · 수량 2", "명단 머리 수량도 남은 장수");
    assert.deepStrictEqual(await qtyRows(desk), { "부분취소가": "4인 입장권 1 부분취소 4장 · 처음 5장", "한장손님가": "4인 입장권 1" });
    // 입장: 열쇠 1개만 누르면 됨 (예전엔 5개를 눌러야 등록)
    await desk.click('.res:has-text("부분취소가")');
    assert.match((await desk.textContent("#sheet")).replace(/\s+/g, " "), /부분취소 — 처음 5장 중 4장 취소 · 남은 1장만 입장 \(네이버 예약 상세의 환불정보로 맞춤\)/, "칸 숫자만으로는 안 줄이고 상세를 열어 봄 (11/19)");
    assert.match(await desk.textContent("#sheet .field .label"), /예약 수량 1개만큼/);
    await desk.click(".kpick button:not([disabled]) >> nth=0");
    assert.strictEqual(await desk.isEnabled("#enter-done"), true, "열쇠 1개로 입장 등록");
    await desk.click("#enter-done");
    await desk.waitForFunction(() => window.__deskTest.holders().some((h) => h.name === "부분취소가" && h.keys.length === 1));
    const live = await desk.evaluate(() => window.__deskTest.liveSnap().keys.holders.find((h) => h.name === "부분취소가"));
    assert.strictEqual(live.qty, 1, "폰 현황(보고 앱) 손님 줄도 1장");
    // 12:30 — 2장 · 3장(1장 부분취소) → 칸 4: 누구 것인지 몰라 예약 상세를 열어 환불정보로 맞춤
    assert.deepStrictEqual(await cells(desk, 750), ["0", "4", "6"]);
    await desk.click('.slot[data-s="750"]');
    assert.deepStrictEqual(await qtyRows(desk), { "두장손님나": "4인 입장권 2", "세장손님나": "4인 입장권 2 부분취소 1장 · 처음 3장" });
    await desk.click('.res:has-text("세장손님나")');
    assert.match((await desk.textContent("#sheet")).replace(/\s+/g, " "), /남은 2장만 입장 \(네이버 예약 상세의 환불정보로 맞춤\)/);
    await desk.click("#sheet [data-act=close]");
    // 13:00 — 이용완료 4장 중 2장 부분취소 (칸에 1건 → 예약 상세가 바로 뜸)
    await desk.click('.slot[data-s="780"]');
    assert.deepStrictEqual(await qtyRows(desk), { "완료부분다": "[평일할인] 4인 입장권 2 부분취소 2장 · 처음 4장" });
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("부분취소: 예약 상세를 못 열면 '부분취소 확인' → 근무자가 실제 장수를 고름 (고르기 전 열쇠 못 고름) · 하나를 고르면 나머지는 셈으로 · 다시 켜도 그대로", async () => {
  const browser = await launch();
  try {
    const { desk, errs } = await open(browser, "&nodetail=1");
    await desk.click('.slot[data-s="750"]');
    assert.deepStrictEqual(await qtyRows(desk), { "두장손님나": "4인 입장권 2 부분취소 확인", "세장손님나": "4인 입장권 3 부분취소 확인" });
    await desk.click('.res:has-text("두장손님나")');
    const sheet = (await desk.textContent("#sheet")).replace(/\s+/g, " ");
    assert.match(sheet, /⚠ 부분취소 확인 — 12:30 네이버 칸은 4장인데 예약 카드 합은 5장이에요 \(1장 부분취소\)\. .*이 손님 실제 장수를 골라 주세요/);
    assert.deepStrictEqual(await desk.$$eval("#sheet [data-act=qtyPick]", (e) => e.map((x) => x.textContent)), ["1장", "2장"]);
    assert.strictEqual(await desk.$$eval(".kpick button:not([disabled])", (e) => e.length), 0, "장수를 고르기 전에는 열쇠를 못 고름");
    await desk.click('#sheet [data-act=qtyPick][data-n="2"]'); // 이 손님은 취소 없음 → 1장 취소는 세장손님나 것
    assert.match(await desk.textContent("#toast"), /두장손님나님 2장으로 맞춤/);
    assert.match(await desk.textContent("#sheet .field .label"), /예약 수량 2개만큼/);
    await desk.click("#sheet [data-act=close]");
    assert.deepStrictEqual(await qtyRows(desk), { "두장손님나": "4인 입장권 2", "세장손님나": "4인 입장권 2 부분취소 1장 · 처음 3장" });
    assert.strictEqual((await desk.textContent("#res-sub")).trim(), "2명 · 수량 4");
    assert.deepStrictEqual(await desk.evaluate(() => window.__deskTest.qtyPicks()), { 1375200103: 2 });
    // 11:00 은 여러 장 산 카드가 하나라 그대로 맞춤 (상세를 못 열어도)
    await desk.click('.slot[data-s="660"]');
    assert.match((await qtyRows(desk))["부분취소가"], /1 부분취소 4장 · 처음 5장/);
    // 다시 불러와도 고른 것 그대로 (오늘 저장 파일 pq)
    await desk.click("[data-act=refresh]");
    await desk.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 60000 });
    await desk.click('.slot[data-s="750"]');
    assert.deepStrictEqual(await qtyRows(desk), { "두장손님나": "4인 입장권 2", "세장손님나": "4인 입장권 2 부분취소 1장 · 처음 3장" });
    assert.deepStrictEqual(JSON.parse(await desk.evaluate(() => localStorage.getItem("test-state-2026-10-05"))).pq, { 1375200103: 2 });
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("부분취소: 예약 상세를 처음에 못 열어도 다음 불러오기 때 앱이 다시 열어 맞춤 (근무자가 고르지 않음)", async () => {
  const browser = await launch();
  try {
    const { desk, errs, np } = await open(browser, "", () => localStorage.setItem("mockNoDetail", "1"));
    await desk.click('.slot[data-s="750"]');
    assert.deepStrictEqual(await qtyRows(desk), { "두장손님나": "4인 입장권 2 부분취소 확인", "세장손님나": "4인 입장권 3 부분취소 확인" });
    await np.evaluate(() => localStorage.removeItem("mockNoDetail")); // 네이버 상세가 다시 열림
    await desk.click("[data-act=refresh]"); // 자동 불러오기와 같은 길 (칸 숫자는 그대로여도 못 맞춘 칸은 다시 읽음)
    await desk.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 60000 });
    await desk.click('.slot[data-s="750"]');
    assert.deepStrictEqual(await qtyRows(desk), { "두장손님나": "4인 입장권 2", "세장손님나": "4인 입장권 2 부분취소 1장 · 처음 3장" });
    assert.deepStrictEqual(await desk.evaluate(() => window.__deskTest.qtyPicks()), {}, "근무자가 고른 것 없음");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("칸 숫자가 늦게 따라옴 (사장님 11/19): 같은 손님 같은 시간 2장 + 1장 · 1장은 방금 예약해 칸 숫자 2 → 예약 상세를 열어 환불 없음 → 2장 그대로 · 열쇠 3개 · 두 예약 함께 이용완료 · 더 누르면 창 안 빨간 경고", async () => {
  // 실제(11/19 12:00): 칸 숫자만 보고 2장 카드를 '1장 부분취소'로 줄여 → 입장 창이 열쇠 2개만 받음(9번 안 눌림) → 그래도 두 예약 모두 이용완료 → 9번을 서비스 키로 줬음
  const browser = await launch();
  try {
    const { desk, errs } = await open(browser, "&late=1");
    assert.deepStrictEqual(await cells(desk, 990), ["0", "2", "8"], "네이버 칸 확정 2 · 잔여 8 (방금 한 1장 예약이 칸에 아직 없음)");
    await desk.click('.slot[data-s="990"]');
    const rows = () => desk.$$eval(".res", (e) => e.map((x) => [...x.querySelectorAll("dt")].find((d) => d.textContent === "수량").nextElementSibling.textContent.replace(/\s+/g, " ").trim()));
    assert.deepStrictEqual(await rows(), ["4인 입장권 2", "4인 입장권 1"], "2장 카드를 줄이지 않음 (예전: '4인 입장권 1 부분취소 1장 · 처음 2장')");
    await desk.click(".res >> nth=0");
    const sheet = () => desk.textContent("#sheet").then((t) => t.replace(/\s+/g, " "));
    assert.match(await sheet(), /같은 시간 예약 2건 \(2장 \+ 1장\)/);
    assert.match(await desk.textContent("#sheet .field .label"), /같은 시간 예약 합계 3개만큼/);
    const free = await desk.$$eval(".kpick button:not([disabled])", (e) => e.slice(0, 4).map((x) => Number(x.dataset.k)));
    for (const k of free.slice(0, 3)) await desk.click(`.kpick [data-k="${k}"]`);
    // 하나 더 누르면 안 눌리고 창 안에 남는 빨간 경고 (사라지는 알림만으로는 놓침)
    await desk.click(`.kpick [data-k="${free[3]}"]`);
    assert.match(await desk.textContent("#sheet .keyover"), new RegExp(`${free[3]}번은 안 눌렸어요 — 이 입장은 열쇠 3개까지예요 \\(같은 시간 예약 2장 \\+ 1장\\) · 고른 열쇠 ${free.slice(0, 3).join(", ")}번`));
    await desk.click("#enter-done");
    await desk.waitForFunction(() => window.__deskTest.holders().some((h) => h.name === "늦은칸가" && h.keys.length === 3), null, { timeout: 10000 });
    const st = await desk.$$eval(".res", (e) => e.map((x) => x.innerText.replace(/\s+/g, " ")));
    assert.ok(st.every((t) => /이용완료/.test(t)), "두 예약 모두 이용완료");
    assert.ok(st.some((t) => new RegExp(`같은 시간 예약 — \\d\\d:\\d\\d 첫 카드와 함께 입장 \\(열쇠 ${free.slice(0, 3).join(", ")}번\\)`).test(t)), "1장 카드: '연속예약'이 아니라 같은 시간 첫 카드와 함께 · 열쇠 번호");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
