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

async function open(query = "", extra = "") {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage();
  await page.goto(MOCK + query);
  await page.evaluate(() => localStorage.clear());
  await page.goto(MOCK + query);
  return { browser, page, sync: new NaverSync((code) => page.evaluate(code), { urls: { list: MOCK + "?view=list" + extra, calendar: MOCK + "?view=calendar" + extra } }) };
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
    assert.strictEqual(by["1368177001"].doneCount, 9, "목록 아래(세 번째 카드)도 내려서 읽음");
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

test("목록 아래쪽 카드도 내려서 이용완료 · 칸이 좁아 오전·오후가 없어도 시각을 맞게 읽음 (1:00 = 13:00)", async () => {
  const { browser, sync } = await open("?view=calendar&compact=1", "&compact=1");
  try {
    const d0 = await sync.loadDay("2026-10-05");
    assert.ok(d0.ok, d0.why);
    assert.ok(d0.slots.some((s) => s.time === "14:00" && s.conf === 4), "2:00 → 14:00");
    assert.ok(d0.slots.some((s) => s.time === "19:30"), "7:30 → 19:30");
    assert.ok(d0.slots.some((s) => s.time === "12:00") && d0.slots.some((s) => s.time === "10:00"));
    // 송다온은 14:00 목록의 세 번째 카드 (처음엔 안 보이고 내려야 나옴)
    const r = await sync.complete({ day: "2026-10-05", no: "1368177001", time: "14:00", product: "평일 무제한 / 휴일 1시간 50분 입장권" });
    assert.ok(r.ok, r.why);
    const d = await sync.loadDay("2026-10-05");
    assert.strictEqual(d.bookings.find((x) => x.no === "1368177001").status, "완료");
  } finally {
    await browser.close();
  }
});

test("예약현황이 '일간'이 아니라 기간으로 보이면 날짜를 왔다갔다 하지 않고 바로 알려 줌", async () => {
  const { browser, sync } = await open("?view=calendar&range=1", "&range=1");
  try {
    const r = await sync.loadDay("2026-10-05");
    assert.strictEqual(r.ok, false);
    assert.match(r.why, /일간/);
  } finally {
    await browser.close();
  }
});

test("칸을 눌러도 카드가 안 나오면 못 읽은 칸을 알려 주고, 진행 단계를 알림", async () => {
  const { browser, page } = await open("?view=calendar&nocards=1");
  try {
    const steps = [];
    const sync = new NaverSync((code) => page.evaluate(code), { urls: { list: MOCK + "?view=list&nocards=1", calendar: MOCK + "?view=calendar&nocards=1" }, timeout: 3000, onStep: (m) => steps.push(m) });
    const r = await sync.loadDay("2026-10-05");
    assert.ok(r.ok, r.why);
    assert.match(r.warn, /14:00 확정/);
    assert.ok(steps.some((m) => /14:00 확정 칸 여는 중/.test(m)), steps.join(" / "));
    assert.ok(steps.some((m) => /카드 0장/.test(m)));
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
    assert.match(r.why, /로그인 상태 유지/, "다시 풀리지 않게 안내");
  } finally {
    await browser.close();
  }
});
