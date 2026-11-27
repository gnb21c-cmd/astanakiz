/* 네이버 '개인정보 조회' (사장님 11/27 — 네이버 오른쪽 위 [개인정보 조회] 를 누르면 이름 · 전화번호가 예전처럼 보임) → 데스크 오류 없나
   - 가린 채(11/26 ~) · 보임 · 다시 가림(조회 시간이 끝남)을 오가도: 같은 손님 장부 · 고객 데이터베이스가 이어짐 · 오류 없음
   - 보이면 입장 창이 가운데 4자리를 안 묻고 · 네이버가 보여 준 이름 · 전체 번호를 기억 → 다시 가려져도 카드 · 열쇠 창에 그대로 (열쇠 반납 · 사무실 연락)
   - 근무자가 넣은 가운데 4자리가 네이버가 보여 준 번호와 다르면 네이버 것으로
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
const P = "평일 무제한 / 휴일 1시간 50분 입장권";
const bk = (no, name, phone, st = "확정", done = 1) => ({ no, time: "16:30", name, phone, qty: 1, status: st, doneCount: done, product: P, qtyText: "4인 입장권 1", pay: "결제완료" });
const load = (page, list) => page.evaluate(([L, p]) => { const T = window.__deskTest; T.naverApply(T.today(), { slots: [{ time: "16:30", product: p, cap: 20, conf: L.length, done: 0 }], bookings: L }); }, [list, P]);

test("네이버 개인정보 조회: 가림 → 보임 → 다시 가림 — 오류 없음 · 맨 위 '개인정보 보임 · 가림·인증' 칩 (누르면 네이버 창 · 다시 가려지면 알림) · 보이면 가운데 4자리 안 물음 · 보인 이름 · 번호를 기억 · 장부 · 고객 데이터베이스 이어짐", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    page.on("dialog", (d) => d.accept());
    await page.addInitScript(() => { if (!sessionStorage.getItem("once")) { sessionStorage.setItem("once", "1"); localStorage.clear(); localStorage.setItem("astanakiz-visitevent", JSON.stringify({ ver: 2, on: true, from: "2026-09-10", to: "2026-10-31", days: 20, gift: "수제돈까스" })); } });
    await page.goto(DESK);
    const text = async (name) => { await page.click('.slot[data-s="990"]'); return (await page.textContent(`.res:has-text("${name}")`)).replace(/\s+/g, " "); };
    // 맨 위 '개인정보' 칩 (11/27): 오늘 네이버를 불러오기 전엔 없음
    const chip = async () => ((await page.$eval("#maskchip", (e) => (e.hidden ? "" : e.textContent + "|" + e.className))) || "").trim();
    assert.strictEqual(await chip(), "", "불러오기 전엔 칩 없음");
    // ① 가린 채 (11/26 ~)
    await load(page, [bk("u1", "은*인", "***-****-1252"), bk("u2", "박*준", "***-****-3333"), bk("u3", "도*희", "***-****-4321")]);
    assert.strictEqual(await chip(), "개인정보가림·인증|synchip warn");
    await page.click("#maskchip");
    assert.match(await page.textContent("#toast"), /\[개인정보 조회\] → 휴대폰 · 네이버 인증서로 인증.*로그아웃은 하지 마세요/);
    assert.match(await text("은*인"), /\*\*\*-\*\*\*\*-1252/);
    await page.click('.res:has-text("은*인")');
    assert.ok(await page.$("#e-mid"), "가리면 가운데 4자리를 물음");
    await page.click(".kpick button:not([disabled]) >> nth=0");
    for (const n of "5678") await page.click(`[data-act=midKey][data-n="${n}"]`);
    await page.click("#enter-done");
    // 도*희: 가운데 4자리를 잘못 넣음 (1111)
    await page.click('.res:has-text("도*희")');
    await page.click(".kpick button:not([disabled]) >> nth=0");
    for (const n of "1111") await page.click(`[data-act=midKey][data-n="${n}"]`);
    await page.click("#enter-done");
    // ② 개인정보 조회 → 다음 불러오기에서 이름 · 번호가 보임 (네이버도 이용완료)
    await load(page, [bk("u1", "은지인", "010-5678-1252", "완료", 3), bk("u2", "박서준", "010-4444-3333"), bk("u3", "도지희", "010-2222-4321", "완료", 2)]);
    assert.match(await text("박서준"), /010-4444-3333/);
    assert.strictEqual(await chip(), "개인정보보임|synchip ok");
    await page.click('.res:has-text("박서준")');
    assert.strictEqual(await page.$("#e-mid"), null, "보이면 가운데 4자리를 안 물음");
    await page.click(".kpick button:not([disabled]) >> nth=0");
    assert.ok(!(await page.isDisabled("#enter-done")));
    await page.click("#enter-done");
    // ③ 다시 가려짐 (조회 시간이 끝남) → 기억한 이름 · 전체 번호 그대로
    await load(page, [bk("u1", "은*인", "***-****-1252", "완료", 3), bk("u2", "박*준", "***-****-3333", "완료", 2), bk("u3", "도*희", "***-****-4321", "완료", 2)]);
    assert.strictEqual(await chip(), "개인정보가림·인증|synchip warn");
    assert.match(await page.textContent("#toast"), /네이버 개인정보가 다시 가려졌어요/, "보이다가 다시 가려지면 한 번 알림");
    const t2 = await text("박서준");
    assert.match(t2, /박서준.*010-4444-3333/, "다시 가려져도 기억한 이름 · 번호 " + t2);
    assert.match(await text("은지인"), /010-5678-1252/);
    assert.match(await text("도지희"), /010-2222-4321/, "근무자가 넣은 1111 대신 네이버가 보여 준 번호");
    const k = await page.evaluate(() => window.__deskTest.holders().find((h) => h.no === "u2").keys[0]);
    await page.click(`.key[data-k='${k}']`);
    assert.match((await page.textContent("#sheet")).replace(/\s+/g, " "), /박서준[\s\S]*010-4444-3333/, "열쇠 창에도 전체 번호");
    await page.click("#sheet [data-act=close] >> nth=0");
    // 장부 · 고객 데이터베이스: 같은 손님으로 이어짐 (이름 첫 · 끝 + 뒷 4자리)
    const L = await page.evaluate(() => window.__deskTest.evLog().people);
    assert.deepStrictEqual(["m:은인1252", "m:박준3333", "m:도희4321"].map((x) => L[x] && L[x].visits.length), [1, 1, 1]);
    await page.waitForTimeout(900);
    const C = Object.values(await page.evaluate(() => window.__deskTest.cdb().c)).filter((r) => ["1252", "3333", "4321"].includes(r.p4)).map((r) => [r.nm, r.p4, r.ph]).sort();
    assert.deepStrictEqual(C, [["도*희", "4321", "01022224321"], ["박*준", "3333", "01044443333"], ["은*인", "1252", "01056781252"]], "고객 데이터베이스는 이름 '홍*동' 모양 · 잘못 넣은 가운데 4자리(1111)는 네이버가 보여 준 번호로 바로잡음");
    // 앱의 네이버 읽기가 알려 주는 mask (11/27 — 이번에 새로 연 카드 기준): 모름(null)이면 칩 그대로 · '보임' · '가림'은 기억한 카드 모양과 상관없이 그대로
    const loadM = (list, mask) => page.evaluate(([L, p, m]) => { const T = window.__deskTest; T.naverApply(T.today(), { mask: m, slots: [{ time: "16:30", product: p, cap: 20, conf: L.length, done: 0 }], bookings: L }); }, [list, P, mask]);
    await loadM([bk("u1", "은지인", "010-5678-1252", "완료", 3)], "보임");
    assert.strictEqual(await chip(), "개인정보보임|synchip ok");
    await loadM([bk("u1", "은*인", "***-****-1252", "완료", 3)], null);
    assert.strictEqual(await chip(), "개인정보보임|synchip ok", "모름(새로 연 카드 없음)이면 그대로");
    await loadM([bk("u1", "은지인", "010-5678-1252", "완료", 3)], "가림");
    assert.strictEqual(await chip(), "개인정보가림·인증|synchip warn", "기억한 카드는 보여도 새로 연 카드가 가렸으면 '가림'");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
