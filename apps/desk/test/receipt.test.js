/* 입장권 출력 시험: 실제로 입장 처리한 손님(체험판 예시)으로 입장권을 만들어
   - {전화뒤4} · {열쇠} 같은 빈칸이 글자 그대로 남지 않는지 (현장 출력 10/6 에 남았던 문제)
   - 입장시간이 예약 시간인지
   - 줄마다 OK-50 한 줄(42칸)에 들어가는지 (한글 2칸 · 2배 글씨는 두 배) */
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
const cols = (t) => [...t].reduce((a, c) => a + (c.charCodeAt(0) < 128 ? 1 : 2), 0);

test("입장권: 빈칸이 다 채워지고 · 입장시간은 예약 시간 · 줄마다 42칸 안", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    // 14:00 예약 손님 한 명 입장 (체험 시계 13:50 — 일찍 입장)
    await page.click('.slot[data-s="840"]');
    await page.click(".res >> nth=0");
    const qty = await page.$$eval(".kpick", () => 0);
    for (;;) {
      const btn = await page.$("#enter-done:not([disabled])");
      if (btn) break;
      await page.click(".kpick button:not([disabled]):not(.on) >> nth=0");
    }
    await page.click("#enter-done");
    const out = await page.evaluate(() => {
      const T = window.__deskTest;
      const h = T.holders().filter((x) => !x.walk).sort((a, b) => b.enteredAt - a.enteredAt || b.id.localeCompare(a.id))[0];
      const v = T.keyVals(h);
      const lines = T.receiptLines(T.form(), v);
      return { v, lines, slot: h.slot, phone: h.phone, keys: h.keys };
    });
    for (const l of out.lines) assert.ok(!/\{[^}]+\}/.test(l.t), `빈칸이 남음: ${l.t}`);
    assert.strictEqual(out.v.전화뒤4, out.phone.replace(/\D/g, "").slice(-4));
    assert.strictEqual(out.v.열쇠, out.keys.join(", "));
    assert.strictEqual(out.v.입장시간, "오후 2시 00분", "예약 시간 14:00 (지금 시각 13:50 이 아님)");
    for (const l of out.lines) {
      if (l.k === "hr" || l.k === "hr2") continue;
      assert.ok(cols(l.t) * (l.size || 1) <= 42, `42칸 넘음 (${cols(l.t) * (l.size || 1)}칸): ${l.t}`);
    }
    // 현장 입장권도
    const walk = await page.evaluate(() => {
      const T = window.__deskTest;
      const w = T.holders().find((x) => x.walk);
      return T.receiptLines(T.form(), T.keyVals(w));
    });
    for (const l of walk) assert.ok(!/\{[^}]+\}/.test(l.t), `현장 입장권 빈칸이 남음: ${l.t}`);
    assert.ok(walk.some((l) => /네이버 예약하고/.test(l.t)), "현장 손님에게 네이버 예약 안내");
    assert.ok(!walk.some((l) => /번째 방문입니다/.test(l.t)), "현장 손님은 방문 횟수 없음");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
