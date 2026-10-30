/* 열쇠 자리 맞바꿈 · 옮기기 (사장님 10/29): 근무자가 열쇠 번호를 잘못 넣었을 때
   - 쓰는 중인 열쇠를 1초 꾹 누르면 떠오름 → 끌어서 다른 쓰는 중인 열쇠에 놓으면 두 손님 자리가 맞바뀜 · 빈 열쇠에 놓으면 그 번호로 옮김
   - 짧게 누르면 예전처럼 열쇠 창 · 1초 전에 손가락이 움직이면 아무것도 안 함 */
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

test("열쇠 1초 꾹 → 끌어서 놓기: 쓰는 열쇠끼리 맞바꿈 · 빈 열쇠로 옮김 · 열쇠별 이용시간 · 쓴 열쇠 기록도 · 짧게 누르면 열쇠 창", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    const who = (k) => page.evaluate((x) => { const h = window.__deskTest.holders().find((y) => y.keys.includes(x)); return h ? h.id : null; }, k);
    const center = async (k) => { const b = await page.locator(`.keys .key[data-k="${k}"]`).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
    const drag = async (from, to, holdMs = 1200) => {
      const [x0, y0] = await center(from), [x1, y1] = await center(to);
      await page.mouse.move(x0, y0);
      await page.mouse.down();
      await page.waitForTimeout(holdMs);
      await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 5 });
      await page.mouse.move(x1, y1, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(150);
    };
    // 쓰는 중인 열쇠 둘(다른 손님) · 빈 열쇠 하나 찾기
    const pick = await page.evaluate(() => {
      const T = window.__deskTest, hs = T.holders().filter((h) => !h.svc);
      const a = hs.find((h) => h.keys.length === 1), b = hs.find((h) => h !== a && h.keys.length === 1);
      const used = new Set(T.holders().flatMap((h) => h.keys));
      const free = [...Array(45)].map((_, i) => i + 1).filter((k) => !used.has(k));
      return { ka: a.keys[0], kb: b.keys[0], ia: a.id, ib: b.id, free: free[free.length - 1] };
    });
    // 1번 손님 열쇠에 열쇠별 이용시간을 넣어 둠 (연속예약처럼)
    await page.evaluate(({ ia, ka }) => { const h = window.__deskTest.holders().find((x) => x.id === ia); h.keyUse = { [ka]: 170 }; h.keysTaken = [ka]; }, pick);

    // ① 맞바꿈
    await drag(pick.ka, pick.kb);
    assert.strictEqual(await page.isHidden("#overlay"), true, "열쇠 창이 안 열림");
    assert.deepStrictEqual([await who(pick.ka), await who(pick.kb)], [pick.ib, pick.ia], "두 손님 자리가 바뀜");
    const a = await page.evaluate((id) => { const h = window.__deskTest.holders().find((x) => x.id === id); return { keyUse: h.keyUse, taken: h.keysTaken }; }, pick.ia);
    assert.deepStrictEqual(a, { keyUse: { [pick.kb]: 170 }, taken: [pick.kb] }, "열쇠별 이용시간 · 쓴 열쇠 기록도 새 번호로");
    assert.match(await page.textContent("#toast"), new RegExp(`${pick.ka}번 ↔ ${pick.kb}번 자리 바꿈`));
    assert.match(await page.textContent(`.keys .key[data-k="${pick.kb}"]`), new RegExp(String(pick.kb)));

    // ② 빈 열쇠로 옮김
    await drag(pick.kb, pick.free);
    assert.deepStrictEqual([await who(pick.kb), await who(pick.free)], [null, pick.ia], "빈 칸으로 옮김");
    assert.match(await page.textContent("#toast"), new RegExp(`${pick.kb}번 → ${pick.free}번으로 옮김`));
    assert.ok(await page.$(`.keys .key.free[data-k="${pick.kb}"]`), "원래 칸은 빈 열쇠");

    // ③ 1초 전에 움직이면 아무것도 안 함 · ④ 짧게 누르면 열쇠 창
    const [x0, y0] = await center(pick.free);
    await page.mouse.move(x0, y0); await page.mouse.down(); await page.waitForTimeout(600); // 1초 안 됨
    await page.mouse.move(x0 + 80, y0, { steps: 4 }); await page.waitForTimeout(1200); await page.mouse.up();
    assert.strictEqual(await who(pick.free), pick.ia, "그대로");
    await page.click(`.keys .key[data-k="${pick.free}"]`);
    assert.strictEqual(await page.isHidden("#overlay"), false, "짧게 누르면 열쇠 창");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
