/* 네이버 [개인정보 조회] 뒤 가린 채 읽어 둔 손님 (사장님 11/27 — "새로 고침을 하면 이미 처리된 * 고객도 이름 · 전화번호가 보이게 바뀌어야"
   · "가려져 있을 고객카드만 30분 단위로 다시 읽거나 근무자가 시간을 클릭하면 그 시간대만 다시 확인하면 되잖어")
   데스크 네이버 읽기는 칸 숫자가 그대로면 기억한 카드를 다시 안 엶 → 인증해도 가린 채 읽어 둔 손님은 * 그대로였음
   - 근무자가 시간 칸을 누르면 그 칸만 다시 (그 칸 손님만 보이게 · 다른 시간은 그대로)
   - 자동 불러오기: 가린 채 기억한 칸이 있으면 30분에 한 번 한 칸만 열어 봄 → 보이면 가린 칸만 다시 읽음 · 아직 가려져 있으면 더 안 엶
   - 근무자 [새로고침]은 바로 한 칸 열어 봄 · 결과 mask = 보임 · 가림 · 모름(null) → 맨 위 '개인정보' 칩
   가짜 네이버 화면(mock/naver.html ?mask=1 · localStorage naver-unmask = 인증 흉내) · 지어낸 손님 */
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
const DAY = "2026-10-05";

test("가린 채 읽어 둔 손님: 시간 칸을 누르면 그 칸만 · 자동은 30분에 한 칸 열어 보고 보이면 가린 칸만 다시 · 새로고침은 바로 확인 · 다시 가려지면 '가림'", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(NAVER + "?mask=1");
    await page.evaluate(() => localStorage.clear());
    await page.goto(NAVER + "?mask=1");
    const steps = [];
    const naver = new NaverSync((code) => page.evaluate(code), { urls: { list: NAVER + "?mask=1&view=list", calendar: NAVER + "?mask=1&view=calendar" }, today: () => DAY, onStep: (s) => steps.push(s) });
    const nm = (r, no) => r.bookings.find((b) => b.no === no).name;
    const ph = (r, no) => r.bookings.find((b) => b.no === no).phone;
    const masked = (r) => r.bookings.filter((b) => /\*/.test(b.phone)).length;
    // ① 가린 채 (11/26 ~)
    const r1 = await naver.loadDay(DAY);
    assert.ok(r1.ok, r1.why);
    assert.strictEqual(r1.mask, "가림");
    assert.deepStrictEqual([nm(r1, "1379100101"), ph(r1, "1379100101"), nm(r1, "1379100103")], ["은*인", "***-****-1252", "한*"]);
    const all = r1.bookings.length;
    assert.strictEqual(masked(r1), all, "모두 가림");
    // ② 사장님이 네이버 창에서 [개인정보 조회] 인증 → 근무자가 17:00 칸을 누름 → 그 칸만 보이게 (17:30 한별 · 다른 시간은 그대로)
    await page.evaluate(() => localStorage.setItem("naver-unmask", "1"));
    let n0 = steps.length;
    const r2 = await naver.loadDay(DAY, { only: "17:00" });
    assert.strictEqual(r2.mask, "보임", "그 칸에서 새로 연 카드로");
    assert.deepStrictEqual([nm(r2, "1379100101"), ph(r2, "1379100101"), nm(r2, "1379100102")], ["은지인", "010-5678-1252", "박서준"]);
    assert.strictEqual(nm(r2, "1379100103"), "한*", "다른 시간(17:30)은 그대로");
    assert.ok(!steps.slice(n0).some((s) => /다시 읽음/.test(s)), "시간 칸을 누르면 그 칸만");
    // ③ 자동 불러오기 (칸 숫자 그대로 · 새로 연 카드 없음) → 한 칸 열어 봄 → 보이면 가린 칸만 다시 읽음
    n0 = steps.length;
    const r3 = await naver.loadDay(DAY);
    assert.strictEqual(r3.mask, "보임");
    assert.strictEqual(nm(r3, "1379100103"), "한별");
    assert.strictEqual(masked(r3), 0, "가린 채 읽어 둔 손님이 모두 보임");
    assert.strictEqual(r3.bookings.length, all, "예약은 그대로");
    assert.ok(steps.slice(n0).some((s) => /보이는지 확인/.test(s)) && steps.slice(n0).some((s) => /가린 채 읽어 둔 칸 \d+개를 다시 읽음/.test(s)), steps.slice(n0).join(" | "));
    // ④ 바로 또 자동 불러오기 (30분 안) → 칸을 안 엶 · 모름(null) → 데스크는 앞 상태 그대로
    n0 = steps.length;
    const r4 = await naver.loadDay(DAY);
    assert.strictEqual(r4.mask, null);
    assert.ok(!steps.slice(n0).some((s) => /보이는지 확인|다시 읽음/.test(s)), "30분 안엔 안 엶");
    // ⑤ 로그아웃 (다시 가림) → 근무자 [새로고침] → 바로 한 칸 열어 봄 → '가림' (읽어 둔 이름 · 번호는 그대로 둠 · 데스크도 기억)
    await page.evaluate(() => localStorage.removeItem("naver-unmask"));
    n0 = steps.length;
    const r5 = await naver.loadDay(DAY, { probe: true });
    assert.strictEqual(r5.mask, "가림");
    assert.ok(steps.slice(n0).some((s) => /보이는지 확인/.test(s)));
    assert.ok(!steps.slice(n0).some((s) => /다시 읽음/.test(s)), "가려져 있으면 더 안 엶");
    // ⑥ 30분이 지나 자동 불러오기 → 한 칸만 열어 봄 (가림이면 더 안 엶)
    naver.maskProbeAt.set(DAY, Date.now() - 31 * 60000);
    n0 = steps.length;
    const r6 = await naver.loadDay(DAY);
    assert.strictEqual(r6.mask, "가림");
    assert.strictEqual(steps.slice(n0).filter((s) => /보이는지 확인/.test(s)).length, 1, "한 칸만");
  } finally {
    await browser.close();
  }
});
