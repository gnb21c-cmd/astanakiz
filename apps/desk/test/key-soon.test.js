/* 열쇠판 곧 퇴장 표시 (사장님 11/28 — "곧 퇴장이 되는 사람도 표시를 하자. 1시간 40분이 되면 열쇠번호 색깔만 노란색으로")
   - 이용 시간이 끝나기 10분 전부터 끝날 때까지 열쇠 번호만 노랑 (바탕은 그대로) → 1시간 50분 분홍 · 2시간 넘으면 빨강은 그대로
   - 숏타임(80분)은 1시간 10분부터 · 무제한(18:00 입장 등)은 없음 · 45번 오른쪽 설명 · 근무자 메뉴얼
   체험판 · 지어낸 손님 */
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

async function enter(page, slot, id) {
  await page.click(`.slot[data-s="${slot}"]`);
  await page.click(`.res[data-id="${id}"]`);
  for (let i = 0; i < 6 && !(await page.$("#enter-done:not([disabled])")); i++) await page.click(".kpick button:not([disabled]):not(.on) >> nth=0");
  await page.click("#enter-done");
}

test("열쇠판 곧 퇴장: 1시간 40분부터 번호만 노랑 (바탕 그대로) → 1시간 50분 분홍 · 숏타임은 1시간 10분 · 무제한은 없음 · 설명 '곧 퇴장'", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, colorScheme: "dark" });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 10/5 (시간제 · 18:00 입장부터 무제한)
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const ids = await page.evaluate((sp) => {
      const T = window.__deskTest, d = T.today();
      const s = T.addBooking(d, "10:00", "숏손님", "01077778888", 1, { prevDone: 3, naverProduct: sp });
      const n = T.addBooking(d, "10:00", "보통손님", "01066665555", 1, { prevDone: 2, naverProduct: "평일 무제한 / 휴일 1시간 50분 입장권" });
      const u = T.addBooking(d, "18:00", "야간손님", "01055554444", 1, { prevDone: 1, naverProduct: "야간자유 입장권" });
      T.setNow(590);
      return { s, n, u };
    }, SHORT);
    await enter(page, 600, ids.s);
    await enter(page, 600, ids.n);
    const keyOf = (id) => page.evaluate((i) => window.__deskTest.bk(i).keys[0], id);
    const ks = await keyOf(ids.s), kn = await keyOf(ids.n);
    const look = (k) => page.$eval(`#keys .key[data-k='${k}']`, (e) => ({ cls: e.className.replace(/\s+/g, " ").trim(), color: getComputedStyle(e.querySelector("b")).color }));
    const at = async (m) => { await page.evaluate((x) => window.__deskTest.setNow(x), m); };
    const YELLOW = "rgb(255, 212, 0)";
    // 보통 손님 (10:00 · 1시간 50분 → 11:50 퇴장)
    await at(699);
    assert.doesNotMatch((await look(kn)).cls, /soon/, "1시간 39분은 아직");
    await at(700);
    let r = await look(kn);
    assert.match(r.cls, /\bin\b/, "바탕은 그대로 (이용 중)");
    assert.match(r.cls, /\bsoon\b/, "1시간 40분 = 곧 퇴장");
    assert.strictEqual(r.color, YELLOW, "번호만 노랑");
    await at(709);
    assert.match((await look(kn)).cls, /\bsoon\b/);
    await at(710);
    r = await look(kn);
    assert.match(r.cls, /\bpink\b/, "1시간 50분 = 분홍");
    assert.doesNotMatch(r.cls, /soon/, "분홍부터는 노랑 번호 없음");
    await at(721);
    assert.match((await look(kn)).cls, /\bred\b/, "2시간 넘음 = 빨강 (그대로)");
    // 숏타임 (80분 → 11:20 퇴장): 1시간 10분부터
    await at(669);
    assert.doesNotMatch((await look(ks)).cls, /soon/);
    await at(670);
    assert.match((await look(ks)).cls, /\bsoon\b/, "숏타임은 1시간 10분부터");
    assert.strictEqual((await look(ks)).color, YELLOW);
    await at(680);
    assert.match((await look(ks)).cls, /\bpink\b/);
    // 무제한 (18:00 입장) — 노랑 없음
    await at(1075);
    await enter(page, 1080, ids.u);
    const ku = await keyOf(ids.u);
    for (const m of [1180, 1185, 1190, 1250]) { await at(m); const x = await look(ku); assert.strictEqual(x.cls.includes("soon"), false, `무제한 ${m}`); assert.match(x.cls, /\bin\b/); }
    // 45번 오른쪽 설명 · 근무자 메뉴얼
    assert.match(await page.textContent("#keys .legend"), /곧 퇴장/);
    assert.deepStrictEqual(await page.$$eval("#keys .legend .row", (e) => e.filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.textContent)), [], "설명 글자가 안 잘림");
    await page.click("[data-act=manual]");
    assert.match((await page.textContent("#sheet")).replace(/\s+/g, " "), /번호가 노랑 = 곧 퇴장/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
