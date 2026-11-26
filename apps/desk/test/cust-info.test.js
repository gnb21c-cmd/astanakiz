/* 손님 확인 (사장님 11/26 — 네이버가 미리 알림 없이 이름 가운데 · 전화번호 앞 · 가운데를 * 로 가림: "은*인" · "***-****-1252")
   앱 본체(naver-sync custInfo)가 예약마다 ① 예약 상세의 이메일(앞 2자리 · 도메인) ② '완료 n >'를 눌러 고객정보 맨 아래 '지난 예약'의 이용완료 날짜
   (보이는 줄이 취소뿐이면 [더보기]) 를 읽어 데스크에 줌 — 가짜 네이버 화면(mock/naver.html ?mask=1 · 지어낸 손님)으로 */
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
const NAVER = "file://" + path.join(__dirname, "..", "mock", "naver.html");
const launch = () => chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});

test("손님 확인: 가린 이름 · 전화 그대로 읽음 · 예약 상세 이메일 · 고객정보 지난 예약 이용완료 날짜 (최근이 취소뿐이면 더보기) · 신규예약은 고객정보 안 엶 · 한 번 읽으면 다시 안 엶", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(NAVER + "?mask=1");
    await page.evaluate(() => localStorage.clear());
    await page.goto(NAVER + "?mask=1");
    const steps = [];
    const naver = new NaverSync((code) => page.evaluate(code), { urls: { list: NAVER + "?mask=1&view=list", calendar: NAVER + "?mask=1&view=calendar" }, today: () => "2026-10-05", onStep: (s) => steps.push(s) });
    // 불러오기: 이름 · 전화는 네이버가 가린 그대로 (데스크가 이름 첫 · 끝 + 뒷 4자리로 견줌)
    const day = await naver.loadDay("2026-10-05");
    assert.ok(day.ok, day.why);
    const eun = day.bookings.find((b) => b.no === "1379100101");
    assert.deepStrictEqual([eun.name, eun.phone], ["은*인", "***-****-1252"]);
    assert.strictEqual(day.bookings.find((b) => b.no === "1379100103").name, "한*", "두 글자 이름");
    const P = "평일 무제한 / 휴일 1시간 50분 입장권";
    const r = await naver.custInfo("2026-10-05", [{ no: "1379100101", time: "17:00", product: P }, { no: "1379100102", time: "17:00", product: P }, { no: "1379100103", time: "17:30", product: P }]);
    assert.ok(r.ok, r.why);
    const pick = (x) => ({ ok: x.ok, email: x.email, past: x.past, done: x.done });
    assert.deepStrictEqual(pick(r.info["1379100101"]), { ok: true, email: "bl****@naver.com", past: ["2026-09-20", "2025-10-18"], done: 2 }, "이용완료 날짜 (최근 것부터)");
    assert.deepStrictEqual(pick(r.info["1379100102"]), { ok: true, email: "pa***@gmail.com", past: ["2026-09-25", "2026-08-01", "2026-07-11"], done: 3 }, "보이는 두 줄이 취소뿐 → 더보기 → 이용완료");
    assert.ok(steps.some((s) => /지난 예약 더보기/.test(s)));
    assert.deepStrictEqual(pick(r.info["1379100103"]), { ok: true, email: "st**@daum.net", past: [], done: 0 }, "신규예약 = 칸에 하나라 상세가 바로 · 고객정보는 안 엶");
    // 다 읽고 나면 오른쪽 창을 닫아 둠 (다음 이용완료 · 불러오기가 칸을 누를 수 있게)
    assert.strictEqual((await naver.read()).cards.length, 0);
    assert.ok(!(await page.evaluate(() => /고객정보/.test(document.body.innerText))));
    // 같은 예약은 다시 안 엶 (그날)
    const n0 = steps.length;
    const again = await naver.custInfo("2026-10-05", [{ no: "1379100101", time: "17:00", product: P }]);
    assert.deepStrictEqual(again.info["1379100101"].past, ["2026-09-20", "2025-10-18"]);
    assert.strictEqual(steps.slice(n0).filter((s) => /손님 확인/.test(s)).length, 0, "다시 안 엶");
  } finally {
    await browser.close();
  }
});

test("손님 확인 hist: false = 이메일만 (현장 POS 고객 데이터베이스 · 고객정보는 안 엶) → 나중에 지난 예약이 필요하면 그때 엶", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(NAVER + "?mask=1");
    await page.evaluate(() => localStorage.clear());
    await page.goto(NAVER + "?mask=1");
    const steps = [];
    const naver = new NaverSync((code) => page.evaluate(code), { urls: { list: NAVER + "?mask=1&view=list", calendar: NAVER + "?mask=1&view=calendar" }, today: () => "2026-10-05", onStep: (s) => steps.push(s) });
    assert.ok((await naver.loadDay("2026-10-05")).ok);
    const P = "평일 무제한 / 휴일 1시간 50분 입장권";
    const r = await naver.custInfo("2026-10-05", [{ no: "1379100102", time: "17:00", product: P, hist: false }]);
    assert.ok(r.ok, r.why);
    assert.deepStrictEqual(r.info["1379100102"], { ok: true, email: "pa***@gmail.com", done: 3 });
    assert.ok(!steps.some((s) => /고객정보/.test(s)), "고객정보는 안 엶");
    // 같은 날 다시 (이메일만) → 안 엶
    const n0 = steps.length;
    assert.strictEqual((await naver.custInfo("2026-10-05", [{ no: "1379100102", time: "17:00", product: P, hist: false }])).info["1379100102"].email, "pa***@gmail.com");
    assert.strictEqual(steps.slice(n0).filter((s) => /손님 확인/.test(s)).length, 0);
    // 이벤트 판정에 지난 예약이 필요해지면 그때 고객정보까지
    const r2 = await naver.custInfo("2026-10-05", [{ no: "1379100102", time: "17:00", product: P }]);
    assert.deepStrictEqual(r2.info["1379100102"].past, ["2026-09-25", "2026-08-01", "2026-07-11"]);
  } finally {
    await browser.close();
  }
});
