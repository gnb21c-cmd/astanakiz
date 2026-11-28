/* 예약 없는 손님 (사장님 11/28 — 4장 예약 → 2장 환불 · 2장 100% 수수료 취소 → 예약은 없지만 2장처럼 입장)
   - 예약자 명단 위 [+ 예약 없음]: 이름 · 전화 · 장수 · 날짜 · 시간 → 그 시간 명단에 '예약 없음' 카드 → 카드를 눌러 평소처럼 입장 (열쇠 · 입장권)
   - 네이버 실적이 없어 시간표 숫자 · 총 판매수에 안 셈 · 입장권 목록에는 '예약 없음 · 이름'으로 따로
   - 재방문 이벤트 장부: 입장한 날 방문 한 줄 (man) → 그날부터 20일 · 기한 안에 네이버 예약으로 다시 오면 도전 성공
   - 지난 날짜 = 카드 없이 장부 · 고객 데이터베이스만 · 현장입장 창에서 그 자리 등록 · 입장 · 입장 전 등록 지우기
   체험판 2026-10-05 · 지어낸 손님 */
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
const EVCFG = { ver: 2, on: true, from: "2026-09-10", to: "2026-10-31", days: 20, gift: "수제돈까스" };
const sp = (t) => String(t || "").replace(/\s+/g, " ").trim();

async function open(browser) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await page.addInitScript((cfg) => { if (!sessionStorage.getItem("once")) { sessionStorage.setItem("once", "1"); localStorage.clear(); localStorage.setItem("astanakiz-visitevent", JSON.stringify(cfg)); } }, EVCFG);
  page.errs = [];
  page.on("pageerror", (e) => page.errs.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(DESK);
  return page;
}
async function register(page, o) {
  await page.click("[data-act=manOpen]");
  assert.match(await page.textContent("#sheet-title"), /예약 없는 손님 등록/);
  if (o.day) await page.fill("#man-day", o.day);
  await page.selectOption("#man-slot", String(o.slot));
  await page.fill("#man-name", o.name);
  await page.fill("#man-phone", o.phone);
  await page.selectOption("#man-qty", String(o.qty));
  if (o.note) await page.fill("#man-note", o.note);
  await page.click("[data-act=manSave]");
}
const pickKeys = async (page) => { for (let i = 0; i < 12 && !(await page.$("#enter-done:not([disabled])")); i++) await page.click(".kpick button:not([disabled]):not(.on) >> nth=0"); };

test("예약 없는 손님: 미리 등록 → 그 시간 '예약 없음' 카드 → 입장(열쇠 · 입장권) · 시간표 · 총 판매수 그대로 · 입장권 목록에 따로 · 장부 도전 시작(20일) · 고객 데이터베이스", async () => {
  const browser = await launch();
  try {
    const page = await open(browser);
    await page.click('.slot[data-s="840"]');
    const before = { sold: sp(await page.textContent("#sold")), sum: sp(await page.textContent("#slot-sum")), slot: sp(await page.textContent('.slot[data-s="840"]')) };
    await register(page, { slot: 840, name: "구본희", phone: "010-2468-1357", qty: 2, note: "4장 중 2장 수수료 취소" });
    assert.strictEqual(await page.evaluate(() => document.getElementById("overlay").hidden), true, "등록하면 창 닫힘");
    const card = sp(await page.textContent('.res:has-text("구본희")'));
    assert.match(card, /예약 없음/, "카드 배지");
    assert.match(card, /이벤트 도전 시작/, "장부에 없는 손님 = 도전 시작");
    assert.match(card, /010-2468-1357/, "전체 번호");
    assert.strictEqual(sp(await page.textContent('.slot[data-s="840"]')), before.slot, "시간표 숫자에 안 셈");
    assert.strictEqual(sp(await page.textContent("#slot-sum")), before.sum);
    // 입장 창: 예약 없는 손님 · 예약시간 변경 없음 · 등록 지우기
    await page.click('.res:has-text("구본희")');
    assert.match(await page.textContent("#sheet-title"), /예약 없는 손님/);
    const sheet = sp(await page.textContent("#sheet"));
    assert.match(sheet, /네이버 예약은 취소\(4장 중 2장 수수료 취소\)/);
    assert.match(sheet, /예약 없음 · 4장 중 2장 수수료 취소/, "결제상태 자리에 사유");
    assert.strictEqual(await page.$("#sheet .mvrow"), null, "예약시간 변경 없음");
    assert.ok(await page.$("#sheet [data-act=manDel]"), "입장 전엔 등록 지우기");
    await page.evaluate(() => { const T = window.__deskTest; T.PRINT_().sel = "POS-80C (USB001)"; T.PRINT_().mode = "win"; }); // 프린터를 고른 것처럼
    await pickKeys(page);
    await page.click("#enter-done");
    const h = await page.evaluate(() => { const T = window.__deskTest, x = T.holders().find((y) => y.name === "구본희"); return { keys: x.keys.slice(), manual: !!x.manual, status: x.status, v: T.keyVals(x) }; });
    assert.strictEqual(h.keys.length, 2, "2장 = 열쇠 2개");
    assert.ok(h.manual);
    assert.strictEqual(h.status, "완료");
    assert.strictEqual(h.v._이벤트, true, "입장권 = 재방문 이벤트 안내");
    assert.strictEqual(h.v._성공, false);
    assert.strictEqual(h.v.다음기한, "10월 25일", "오늘부터 20일");
    assert.ok(await page.evaluate(() => window.__deskTest.lastPrint() && window.__deskTest.lastPrint().kind === "enter"), "입장권 출력");
    assert.match(sp(await page.textContent("#toast")), /구본희님 입장 \(예약 없음 · 판매 아님\) · 열쇠 .* · 이벤트 도전 시작 · 10\/25까지 · 입장권 출력/);
    // 열쇠판에 올라감
    await page.waitForSelector(`#keys .key[data-k='${h.keys[0]}'].in`);
    // 총 판매수 · 시간표 그대로
    assert.strictEqual(sp(await page.textContent("#sold")), before.sold, "총 판매수에 안 셈");
    assert.strictEqual(sp(await page.textContent('.slot[data-s="840"]')), before.slot);
    // 입장권 목록: 따로
    const rows = await page.evaluate(() => window.__deskTest.man.rows());
    assert.deepStrictEqual(rows.filter((r) => r.man), [{ name: "예약 없음 · 구본희", qty: 2, man: true }]);
    await page.click("#sold");
    assert.match(sp(await page.textContent("#sheet")), /예약 없음 2장은 판매 아님 · 따로/);
    await page.keyboard.press("Escape");
    // 장부: 그날 방문 한 줄 (man · 네이버 순번 없음)
    const L = await page.evaluate(() => window.__deskTest.evLog().people);
    const p = L["m:구희1357"];
    assert.ok(p, Object.keys(L).join(", "));
    assert.deepStrictEqual(p.visits.map((v) => [v.day, v.st, v.due, v.man]), [["2026-10-05", "안내", "2026-10-25", 1]]);
    assert.strictEqual(p.base, null, "네이버 기준 없음");
    assert.strictEqual(p.phone, "01024681357");
    // 고객 데이터베이스
    const db = await page.evaluate(() => window.__deskTest.cdb());
    const c = Object.values(db.c).find((x) => x.nm === "구*희" && x.p4 === "1357");
    assert.ok(c, "고객 데이터베이스에 남음");
    assert.strictEqual(c.ph, "01024681357");
    assert.deepStrictEqual(c.v.map((v) => [v[0], v[2]]), [["2026-10-05", 2]]);
    // 네이버를 다시 불러와도 카드는 남음 (열쇠 · 입장 그대로)
    await page.evaluate(() => { const T = window.__deskTest; T.naverApply(T.today(), { slots: [{ time: "14:00", product: "평일 무제한 / 휴일 1시간 50분 입장권", cap: 17, conf: 1, done: 0 }], bookings: [{ no: "7300001", time: "14:00", name: "새손님", phone: "010-1212-3434", qty: 1, status: "확정", doneCount: 0, product: "평일 무제한 / 휴일 1시간 50분 입장권", qtyText: "4인 입장권 1", pay: "결제완료" }] }); });
    const cards = await page.evaluate(() => window.__deskTest.man.cards());
    assert.deepStrictEqual(cards.map((x) => [x.name, x.status, x.keys.length]), [["구본희", "완료", 2]]);
    // 등록 목록: 입장함 · 못 지움
    await page.click("[data-act=manOpen]");
    const list = sp(await page.textContent("#sheet .manlist"));
    assert.match(list, /오늘 14:00\s*구본희 010-2468-1357 · 2장 · 4장 중 2장 수수료 취소\s*입장함/);
    assert.strictEqual(await page.$("#sheet .manlist [data-act=manDel]"), null, "입장한 손님은 못 지움");
    assert.deepStrictEqual(page.errs, []);
  } finally {
    await browser.close();
  }
});

test("예약 없는 손님: 지난 날짜 = 카드 없이 장부 · 고객 데이터베이스만 → 기한 안 네이버 예약(가린 정보)으로 오면 이벤트 도전 성공 · 마일리지 셈은 네이버 이용완료만", async () => {
  const browser = await launch();
  try {
    const page = await open(browser);
    await register(page, { day: "2026-09-28", slot: 840, name: "한서윤", phone: "01097531234", qty: 2 });
    assert.match(sp(await page.textContent("#toast")), /한서윤님 9\/28 방문을 기록했어요/);
    assert.deepStrictEqual(await page.evaluate(() => window.__deskTest.man.cards("2026-09-28").concat(window.__deskTest.man.cards())), [], "지난 날짜는 카드 없음");
    let p = (await page.evaluate(() => window.__deskTest.evLog().people))["m:한윤1234"];
    assert.ok(p);
    assert.deepStrictEqual(p.visits.map((v) => [v.day, v.st, v.due, v.man]), [["2026-09-28", "안내", "2026-10-18", 1]]);
    const db = await page.evaluate(() => window.__deskTest.cdb());
    assert.ok(Object.values(db.c).some((x) => x.p4 === "1234" && x.nm === "한*윤" && x.v.some((v) => v[0] === "2026-09-28")), "고객 데이터베이스 (9/28)");
    // 목록: 장부에 적음 · 못 지움
    await page.click("[data-act=manOpen]");
    assert.match(sp(await page.textContent("#sheet .manlist")), /9\/28 14:00\s*한서윤 010-9753-1234 · 2장\s*지난 방문 · 장부에 적음/);
    assert.strictEqual(await page.$("#sheet .manlist [data-act=manDel]"), null);
    await page.keyboard.press("Escape");
    // 오늘 네이버 예약 (가린 이름 · 번호) — 9/28 + 20일 안 → 도전 성공
    const id = await page.evaluate(() => { const T = window.__deskTest; return T.addBooking(T.today(), "16:30", "한*윤", "***-****-1234", 1, { prevDone: 5 }); });
    await page.click('.slot[data-s="990"]');
    assert.match(sp(await page.textContent(`.res[data-id="${id}"]`)), /이벤트 도전 성공/);
    await page.click(`.res[data-id="${id}"]`);
    await page.click(".kpick button:not([disabled]) >> nth=0");
    await page.fill("#e-mid", "9753");
    await page.click("#enter-done");
    p = (await page.evaluate(() => window.__deskTest.evLog().people))["m:한윤1234"];
    assert.deepStrictEqual(p.visits.map((v) => [v.day, v.st, v.man]), [["2026-09-28", "안내", 1], ["2026-10-05", "성공", 0]]);
    assert.strictEqual(p.base, 5, "네이버 기준은 네이버 예약 줄에서");
    assert.strictEqual(await page.evaluate(() => window.__deskTest.evSub("한*윤")), 1, "마일리지에서 뺄 수 = 네이버 이용완료 1건 (예약 없는 방문은 안 셈)");
    assert.deepStrictEqual(page.errs, []);
  } finally {
    await browser.close();
  }
});

test("예약 없는 손님: 현장입장 창에서 그 자리 등록 · 입장 (총 판매수 · 현장 인원 그대로) · 미리 등록은 입장 전에 지울 수 있음 · 잘못 넣으면 안내", async () => {
  const browser = await launch();
  try {
    const page = await open(browser);
    const sold0 = sp(await page.textContent("#sold"));
    const walk0 = await page.evaluate(() => window.__deskTest.holders().filter((h) => h.walk).length);
    await page.click("#keys .key[data-k='5']");
    await page.click("#sheet [data-act=manWalk]");
    assert.match(await page.textContent("#sheet-title"), /현장입장 · 예약 없는 손님/);
    assert.ok(await page.isDisabled("#w-done"), "이름 · 전화 전엔 못 누름");
    await page.fill("#w-manname", "오세진");
    for (const n of "11223344") await page.click(`#sheet [data-act=kp][data-k="${n}"]`);
    await page.click("#sheet [data-act=qty][data-d='1']");
    assert.ok(!(await page.isDisabled("#w-done")));
    await page.click("#w-done");
    const cards = await page.evaluate(() => window.__deskTest.man.cards());
    assert.deepStrictEqual(cards.map((x) => [x.name, x.slot, x.qty, x.status, x.keys.length]), [["오세진", 810, 2, "완료", 2]], "13:30 타임 카드 · 열쇠 2개 (5번부터)");
    assert.ok(cards[0].keys.includes(5));
    assert.strictEqual(sp(await page.textContent("#sold")), sold0, "총 판매수 그대로");
    assert.strictEqual(await page.evaluate(() => window.__deskTest.holders().filter((h) => h.walk).length), walk0, "현장입장자로 안 셈");
    const L = await page.evaluate(() => window.__deskTest.evLog().people);
    assert.deepStrictEqual(L["m:오진3344"].visits.map((v) => [v.day, v.st, v.man]), [["2026-10-05", "안내", 1]]);
    // 미리 등록 (내일 10:30) → 내일 명단에 카드 → 입장 전 지우기
    await register(page, { day: "2026-10-06", slot: 630, name: "남궁민", phone: "01055556666", qty: 1 });
    assert.deepStrictEqual(await page.evaluate(() => window.__deskTest.man.cards("2026-10-06").map((x) => [x.name, x.slot, x.status])), [["남궁민", 630, "확정"]]);
    assert.match(sp(await page.textContent('.res:has-text("남궁민")')), /예약 없음/, "명단이 그날 · 그 시간으로");
    await page.click('.res:has-text("남궁민")');
    assert.match(sp(await page.textContent("#sheet")), /이용일\(10\/06\)에 입장 처리할 수 있어요/);
    await page.click("#sheet [data-act=manDel]");
    assert.deepStrictEqual(await page.evaluate(() => window.__deskTest.man.cards("2026-10-06")), []);
    assert.deepStrictEqual(await page.evaluate(() => window.__deskTest.man.list().map((g) => g.name)), ["오세진"]);
    // 잘못 넣으면 안내 · 등록 안 됨
    for (const [q, why] of [[{ name: "", phone: "01011112222", qty: 1, day: "2026-10-05", slot: 840 }, /이름/], [{ name: "가나", phone: "0101111", qty: 1, day: "2026-10-05", slot: 840 }, /전화번호/], [{ name: "가나", phone: "01011112222", qty: 11, day: "2026-10-05", slot: 840 }, /장수/], [{ name: "가나", phone: "01011112222", qty: 1, day: "2026-08-01", slot: 840 }, /날짜/], [{ name: "가*나", phone: "01011112222", qty: 1, day: "2026-10-05", slot: 840 }, /\*/]]) {
      const r = await page.evaluate((x) => window.__deskTest.man.add(x), q);
      assert.strictEqual(r.ok, false);
      assert.match(r.why, why);
    }
    // 다시 켜도 등록은 그대로 (체험판 = 이 브라우저)
    await page.reload();
    assert.deepStrictEqual(await page.evaluate(() => window.__deskTest.man.list().map((g) => [g.name, g.day, g.slot, g.qty])), [["오세진", "2026-10-05", 810, 2]]);
    assert.deepStrictEqual(page.errs, []);
  } finally {
    await browser.close();
  }
});

test("예약 없는 손님: 사무실 PC 는 현장 POS 화면 그대로 ('예약 없음' 카드 · 입장 전 · 입장함 · 이벤트) · 사무실에서도 등록 창을 엶", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext();
    const A = await ctx.newPage({ viewport: { width: 1024, height: 768 } });
    A.errs = [];
    A.on("pageerror", (e) => A.errs.push(e.message));
    A.on("dialog", (d) => d.accept());
    await A.addInitScript((cfg) => { if (!sessionStorage.getItem("once")) { sessionStorage.setItem("once", "1"); localStorage.clear(); localStorage.setItem("astanakiz-visitevent", JSON.stringify(cfg)); } }, EVCFG);
    await A.goto(DESK);
    await register(A, { slot: 840, name: "구본희", phone: "01024681357", qty: 2 });
    await register(A, { slot: 840, name: "윤하람", phone: "01080801212", qty: 1 });
    await A.click('.res:has-text("구본희")');
    await pickKeys(A);
    await A.click("#enter-done");
    const snap = await A.evaluate(() => JSON.stringify(window.__deskTest.sync.snap()));
    const B = await ctx.newPage({ viewport: { width: 1024, height: 768 } });
    B.errs = [];
    B.on("pageerror", (e) => B.errs.push(e.message));
    await B.goto(DESK);
    await B.evaluate(() => window.__deskTest.sync.demo(true));
    await B.evaluate((s) => window.__deskTest.sync.apply(JSON.parse(s), window.__deskTest.today() + " 13:50:00"), snap);
    await A.click('.slot[data-s="840"]'); await B.click('.slot[data-s="840"]');
    const names = (p) => p.$$eval("#res .res", (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()).filter((t) => /예약 없음/.test(t)));
    const a = await names(A), b = await names(B);
    assert.strictEqual(a.length, 2);
    assert.deepStrictEqual(b, a, "사무실에도 같은 카드");
    assert.ok(b.some((t) => t.includes("구본희") && t.includes("이벤트 도전 시작")));
    assert.strictEqual(await B.textContent('.slot[data-s="840"]'), await A.textContent('.slot[data-s="840"]'), "시간 칸 숫자 그대로");
    await B.click("[data-act=manOpen]");
    assert.match(await B.textContent("#sheet-title"), /예약 없는 손님 등록/, "사무실에서도 등록 창");
    assert.match(await B.textContent("#sheet .banner"), /사무실 PC 에서 등록하면 현장 POS 명단에도 바로/);
    assert.deepStrictEqual(A.errs, []);
    assert.deepStrictEqual(B.errs, []);
  } finally {
    await browser.close();
  }
});
