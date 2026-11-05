/* 숏타임 상품 (사장님 11/05)
   - 방학 · 추운 날 10시부터 매진이면 사장님이 네이버 상품 '10시 매진 시 숏타임 80분'을 10개 엶 (하루 10:00 하나 · 수량 자동조절 안 함)
   - 이 상품 예약 = 1시간 20분: 10:00 입장 → 11:20 퇴장 (입장권 · 예약자 창 · 열쇠 창 · 열쇠판 · 초과요금 · 판매 수량 계산 모두)
   - 카드 · 예약자 창 · 열쇠 창 이름 옆 '숏타임' (1시간 50분 손님과 구분) · 수량 자동조절은 숏타임 칸을 건드리지 않음 */
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
const SHORT = "10시 매진 시 숏타임 80분";

async function enter(page, id) {
  await page.click('.slot[data-s="600"]');
  await page.click(`.res[data-id="${id}"]`);
  for (let i = 0; i < 6 && !(await page.$("#enter-done:not([disabled])")); i++) await page.click(".kpick button:not([disabled]):not(.on) >> nth=0");
  await page.click("#enter-done");
}
const close = (page) => page.click("#sheet [data-act=close] >> nth=0");

test("숏타임: 카드 '숏타임' · 11:20 퇴장 · 입장권 퇴장시간 · 열쇠 창 · 초과요금은 11:20 부터 · 1시간 50분 손님은 그대로", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 10/5 (대체공휴일 · 시간제)
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const ids = await page.evaluate((sp) => {
      const T = window.__deskTest, d = T.today();
      const s = T.addBooking(d, "10:00", "숏손님", "01077778888", 2, { prevDone: 3, naverProduct: sp });
      const n = T.addBooking(d, "10:00", "보통손님", "01066665555", 1, { prevDone: 2, naverProduct: "평일 무제한 / 휴일 1시간 50분 입장권" });
      T.setNow(590);
      return { s, n };
    }, SHORT);
    assert.deepStrictEqual(await page.evaluate(([a, b]) => [window.__deskTest.isShort(a), window.__deskTest.isShort(b)], [ids.s, ids.n]), [true, false]);
    assert.deepStrictEqual(await page.evaluate(([a, b]) => [window.__deskTest.bookMinutes(a), window.__deskTest.bookMinutes(b)], [ids.s, ids.n]), [80, 110], "숏타임 80분 · 보통 110분");

    // 카드: 이름 옆 '숏타임' · 이용일시 옆 '~ 11:20 퇴장' — 보통 손님은 없음
    await page.click('.slot[data-s="600"]');
    const sc = page.locator(`.res[data-id="${ids.s}"]`), nc = page.locator(`.res[data-id="${ids.n}"]`);
    assert.strictEqual((await sc.locator(".name .badge.short").textContent()).trim(), "숏타임");
    assert.match((await sc.textContent()).replace(/\s+/g, " "), /10:00 ~ 11:20 퇴장/);
    assert.strictEqual(await nc.locator(".badge.short").count(), 0);
    assert.doesNotMatch(await nc.textContent(), /퇴장/);

    // 예약자 창: 숏타임 · 10:00 ~ 11:20 (1시간 20분)
    await sc.click();
    assert.match((await page.textContent("#sheet .facts")).replace(/\s+/g, " "), /숏손님 숏타임 미입장.*10:00 ~ 11:20 \(1시간 20분\)/);
    await close(page);
    await page.click('.slot[data-s="600"]');
    await nc.click();
    assert.match((await page.textContent("#sheet .facts")).replace(/\s+/g, " "), /10:00 ~ 11:50 \(1시간 50분\)/);
    await close(page);

    // 입장 → 입장권 퇴장시간 · 열쇠 창
    await enter(page, ids.s);
    await enter(page, ids.n);
    const out = await page.evaluate(([a, b]) => { const T = window.__deskTest, v = (id) => T.keyVals(T.holders().find((h) => h.id === id)).퇴장시간; return [v(a), v(b)]; }, [ids.s, ids.n]);
    assert.deepStrictEqual(out, ["오전 11시 20분", "오전 11시 50분"], "입장권 퇴장시간");
    const ticket = await page.evaluate((id) => { const T = window.__deskTest, h = T.holders().find((x) => x.id === id), v = T.keyVals(h); return T.receiptLines(T.formFor(v), v).map((l) => l.t.trim()).join(" | "); }, ids.s);
    assert.match(ticket, /퇴장 {2}오전 11시 20분/);
    const k = await page.evaluate((id) => window.__deskTest.holders().find((h) => h.id === id).keys[0], ids.s);
    await page.click(`.key[data-k='${k}']`);
    const facts = (await page.textContent("#sheet .facts")).replace(/\s+/g, " ");
    assert.match(facts, /숏손님 숏타임/);
    assert.match(facts, /11:20 반납/);
    await close(page);

    // 초과요금: 숏타임은 11:20 뒤 10분마다 · 보통 손님은 11:50 전엔 없음
    await page.evaluate(() => window.__deskTest.setNow(691)); // 11:31
    const due = await page.evaluate(([a, b]) => [window.__deskTest.overDue(a), window.__deskTest.overDue(b)], [ids.s, ids.n]);
    assert.deepStrictEqual(due, [5000 * 2, 0], "11:31 — 숏타임 2개 열쇠 × 5,000원 · 보통은 아직");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("숏타임: 열쇠 · 수량 계산은 11:20 에 나간다고 · 연속예약 · 어긋남 · 수량 자동조절은 숏타임 칸을 안 건드림", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.evaluate(() => window.__deskTest.setNow(590));
    const k0 = await page.evaluate(() => { const T = window.__deskTest; return [T.capKeysAt(670, []), T.capKeysAt(690, [])]; }); // 숏타임 예약을 넣기 전
    const ids = await page.evaluate((sp) => {
      const T = window.__deskTest, d = T.today();
      const s = T.addBooking(d, "10:00", "숏열쇠", "01012121212", 3, { prevDone: 1, naverProduct: sp });
      const c1 = T.addBooking(d, "10:00", "숏연속", "01034343434", 1, { prevDone: 1, naverProduct: sp });
      const c2 = T.addBooking(d, "11:30", "숏연속", "01034343434", 1, { prevDone: 1, naverProduct: "평일 무제한 / 휴일 1시간 50분 입장권" });
      const o1 = T.addBooking(d, "10:00", "숏어긋남", "01056565656", 1, { prevDone: 1, naverProduct: sp });
      const o2 = T.addBooking(d, "12:30", "숏어긋남", "01056565656", 1, { prevDone: 1, naverProduct: "평일 무제한 / 휴일 1시간 50분 입장권" });
      T.setNow(590);
      return { s, c1, c2, o1, o2 };
    }, SHORT);
    // 아직 안 온 숏타임 예약: 11:10 엔 자리를 차지 · 11:30 엔 빠짐 (1시간 50분이면 11:50 까지)
    const k1 = await page.evaluate(() => { const T = window.__deskTest; return [T.capKeysAt(670, []), T.capKeysAt(690, [])]; });
    assert.deepStrictEqual([k1[0] - k0[0], k1[1] - k0[1]], [3 + 1 + 1, 1], "11:10 = 숏타임 5장 더 · 11:30 = 숏타임은 빠지고 11:30 예약 1장만");
    const pres = await page.evaluate((id) => { window.__deskTest.setNow(605); return window.__deskTest.capPresent().filter((p) => p.n === 3).map((p) => p.to); }, ids.s);
    assert.ok(pres.includes(680), `안에 있다고 보는 끝 = 11:20 (${pres})`);
    // 연속예약: 숏타임 10:00 + 11:30 → 11:30 + 1시간 50분 = 13:20 (200분) · 어긋남: 10:00 숏타임 + 12:30 → 11:20 부터 70분 비어요
    assert.strictEqual(await page.evaluate((id) => window.__deskTest.chainMin(id), ids.c1), 200);
    assert.deepStrictEqual(await page.evaluate((id) => window.__deskTest.oddGaps(id), ids.o1), [70]);
    // 수량 계산 칸: 10:00 칸에 숏타임 장수 · 수량 자동조절 상품(1시간 50분)과 다른 상품
    const s10 = await page.evaluate(() => window.__deskTest.capSlots().find((x) => x.t === 600));
    assert.deepStrictEqual([s10.short, s10.shortStay], [5, 80]);
    assert.deepStrictEqual(await page.evaluate((sp) => [window.__deskTest.capMain(sp, 600), window.__deskTest.capMain("평일 무제한 / 휴일 1시간 50분 입장권", 600)], SHORT), [false, true], "숏타임 칸은 수량 자동조절 안 함");
    // 네 타임 합: 숏타임 손님은 11:30 타임부터 빠짐 (1시간 50분 손님은 11:30 까지 셈)
    const inside = await page.evaluate(() => {
      // 안 시작한 타임 = 예약 5 · 수량 10 (매진이 아니라 계획이 수량을 그대로 둠)
      const T = window.__deskTest, mk = (t, used, o) => Object.assign({ t, used, mainUsed: used, cap: 10, started: false, stay: 110 }, o || {});
      const slots = [mk(600, 20, { mainUsed: 10, started: true, short: 10, shortStay: 80 }), mk(630, 5), mk(660, 5), mk(690, 5), mk(720, 5)];
      const p = T.planCaps(slots, [630, 660, 690, 720], { target: 40, max: 13, base: 10, prio: [], boost: [], state: { loans: [], bonus: {}, locks: [] } });
      const q = T.planCaps(slots.map((x) => Object.assign({}, x, { short: 0 })), [630, 660, 690, 720], { target: 40, max: 13, base: 10, prio: [], boost: [], state: { loans: [], bonus: {}, locks: [] } });
      return [p.inside(660), p.inside(690), q.inside(690)];
    });
    assert.deepStrictEqual(inside, [40, 40, 50], "11:00 = 숏타임 포함 40 · 11:30 = 숏타임 빠져 40 (숏타임이 아니면 50)");
    // '솟타임' 으로 써도 숏타임
    const alt = await page.evaluate(() => { const T = window.__deskTest; return T.isShort(T.addBooking(T.today(), "10:00", "솟", "01090909090", 1, { naverProduct: "솟타임 80분" })); });
    assert.strictEqual(alt, true);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
