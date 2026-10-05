/* 네이버 연동 시험: 캡처를 본뜬 가짜 예약현황 화면(mock/naver.html)에서
   하루 예약 읽기(입장권만, 완료 n · 취소 n 포함) · 날짜 이동 · 이용완료 처리를 해 본다 */
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
const MOCK = "file://" + path.join(__dirname, "..", "mock", "naver.html");

async function open(query = "") {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage();
  await page.goto(MOCK + query);
  await page.evaluate(() => localStorage.clear());
  await page.goto(MOCK + query);
  return { browser, page, sync: new NaverSync((code) => page.evaluate(code), { urls: { list: MOCK + "?view=list", calendar: MOCK + "?view=calendar" } }) };
}

test("하루 예약 읽기: 예약 목록 + 예약현황 카드 (입장권만, 취소 뺌, 완료 n · 취소 n)", async () => {
  const { browser, sync } = await open();
  try {
    const r = await sync.loadDay("2026-10-05");
    assert.ok(r.ok, r.why);
    const by = Object.fromEntries(r.bookings.map((b) => [b.no, b]));
    assert.strictEqual(r.bookings.length, 6, "입장권만 · 취소 뺌");
    assert.ok(!r.bookings.some((b) => /단체/.test(b.product) || b.status === "취소"));
    const h = by["1368155282"];
    assert.deepStrictEqual(
      { name: h.name, phone: h.phone, time: h.time, qty: h.qty, status: h.status, done: h.doneCount, cancel: h.cancelCount, pay: h.pay },
      { name: "허정은", phone: "010-4674-0736", time: "14:00", qty: 1, status: "확정", done: 8, cancel: 2, pay: "결제완료" },
    );
    assert.strictEqual(by["1368177001"].qty, 2);
    assert.strictEqual(by["1367156204"].status, "완료");
    assert.strictEqual(by["1367156204"].doneCount, 11, "이용완료 손님은 완료 n 에 이번 방문이 들어 있음");
    assert.strictEqual(by["1370988026"].time, "18:00");
    const s14 = r.slots.find((s) => s.time === "14:00" && /1시간 50분/.test(s.product));
    assert.deepStrictEqual({ cap: s14.cap, conf: s14.conf }, { cap: 10, conf: 4 });
    assert.ok(!r.slots.some((s) => /단체/.test(s.product)), "단체 칸 뺌");
  } finally {
    await browser.close();
  }
});

test("날짜 이동: 다른 날로 갔다가 돌아옴 · 두 번째 읽기는 카드를 다시 열지 않음", async () => {
  const { browser, sync } = await open();
  try {
    let r = await sync.loadDay("2026-10-07");
    assert.ok(r.ok, r.why);
    assert.strictEqual(r.bookings.length, 0);
    r = await sync.loadDay("2026-10-05");
    assert.strictEqual(r.bookings.length, 6);
    const t0 = Date.now();
    r = await sync.loadDay("2026-10-05");
    assert.ok(r.ok);
    assert.strictEqual(r.bookings.find((b) => b.no === "1368155282").doneCount, 8, "기억한 값");
  } finally {
    await browser.close();
  }
});

test("이용완료: 카드의 [이용완료] → 확인 → 완료로 바뀜, 완료 수 +1", async () => {
  const { browser, sync } = await open();
  try {
    const r = await sync.complete({ day: "2026-10-05", no: "1368155282", time: "14:00", product: "평일 무제한 / 휴일 1시간 50분 입장권" });
    assert.ok(r.ok, r.why);
    const d = await sync.loadDay("2026-10-05");
    const b = d.bookings.find((x) => x.no === "1368155282");
    assert.strictEqual(b.status, "완료");
    assert.strictEqual(b.doneCount, 9, "완료 수 +1 (다시 읽어 확인)");
  } finally {
    await browser.close();
  }
});

test("로그인이 풀린 화면이면 로그인하라고 알려 줌", async () => {
  const { browser, sync } = await open("?login=need");
  try {
    const r = await sync.loadDay("2026-10-05");
    assert.strictEqual(r.ok, false);
    assert.match(r.why, /로그인/);
  } finally {
    await browser.close();
  }
});
