/* 같은 사람이 같은 시간에 예약을 나눠 한 경우 (1장 + 1장): 한 번에 입장 · 열쇠 합친 수 · 둘 다 이용완료 · 입장권 누계는 함께 완료한 뒤의 수 (사용자 지시 10/7)
   카드 문구: 완료 = "N번째 예약완료", 입장 전 = "완료 8 → 9번 완료 예정" (같은 시간 나눈 예약의 대표 카드 = "완료 8 → 9 · 10번 완료 예정 · 함께 2건" — 10/20) */
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

test("같은 시간 나눠 한 예약은 함께 입장 · 카드 문구", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    await page.click('.slot[data-s="900"]');
    const cards = page.locator('.res:has-text("나분할")');
    assert.strictEqual(await cards.count(), 2);
    // 대표 카드는 함께 처리하는 두 건을 같이 셈 (사장님 10/20: 입장 전에도 10번째 사은권이 보여야)
    assert.match((await cards.nth(0).textContent()).replace(/\s+/g, " "), /완료 8( · 취소 \d+)? → 9 · 10번 완료 예정 · 함께 2건 2만원 사은권 증정/);
    // 두 번째 카드도 입장 가능 (사장님 11/20 — 예전엔 "같은 시간 첫 카드에서 함께 입장 처리"라 첫 카드에서만)
    assert.match((await cards.nth(1).textContent()).replace(/\s+/g, " "), /눌러서 입장 · 열쇠 지급 ›\s*같은 시간 2건 함께 · 열쇠 2개/);
    await cards.nth(1).click();
    assert.match((await page.textContent("#sheet")).replace(/\s+/g, " "), /같은 시간 예약 2건 \(1장 \+ 1장\) — 같은 손님이 나눠 예약했어요\. 이 카드에서 한 번에 입장 · 열쇠 2개/);
    assert.match(await page.textContent("#sheet .field .label"), /같은 시간 예약 합계 2개만큼/);
    assert.ok((await page.$$eval(".kpick button:not([disabled])", (e) => e.length)) > 0, "열쇠를 고를 수 있음");
    await page.click("#sheet [data-act=close] >> nth=0");
    // 첫 카드: 열쇠 2개 → 등록
    await cards.nth(0).click();
    assert.match(await page.textContent("#sheet"), /같은 시간 예약 2건.*열쇠 2개/);
    await page.click(".kpick button:not([disabled]) >> nth=0");
    assert.ok(await page.isDisabled("#enter-done"), "1개만으로는 안 됨");
    await page.click(".kpick button:not([disabled]):not(.on) >> nth=0");
    await page.click("#enter-done");
    const st = await page.evaluate(() => window.__deskTest.holders().filter((h) => h.name === "나분할").map((h) => ({ keys: h.keys.length, v: h.visitNo, end: h.visitEnd })));
    assert.deepStrictEqual(st, [{ keys: 2, v: 9, end: 10 }], "열쇠 2개는 대표에게, 함께 완료 → 10");
    const kv = await page.evaluate(() => { const h = window.__deskTest.holders().find((x) => x.name === "나분할"); return window.__deskTest.keyVals(h); });
    assert.strictEqual(kv.누계, "10");
    assert.strictEqual(kv._사은권, true, "9 · 10 중 10번째 → 사은권");
    const txt = await page.$$eval('.res', (e) => e.filter((x) => /나분할/.test(x.textContent)).map((x) => x.textContent));
    assert.ok(txt.every((t) => /이용완료/.test(t)), "둘 다 이용완료");
    assert.ok(txt.some((t) => /9 · 10번째 예약완료/.test(t)) && txt.some((t) => /10번째 예약완료/.test(t) && !/9 · 10번째/.test(t)), txt.join(" | ")); // 대표 카드는 함께 완료한 두 건 (10/20)
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("같은 시간 묶음 — 둘째 카드에서 입장해도 열쇠 합계 · 둘 다 이용완료 · 회차 그대로 (사장님 11/20)", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    await page.click('.slot[data-s="900"]');
    const cards = page.locator('.res:has-text("나분할")');
    await cards.nth(1).click();
    await page.click(".kpick button:not([disabled]) >> nth=0");
    assert.ok(await page.isDisabled("#enter-done"), "1개만으로는 안 됨");
    await page.click(".kpick button:not([disabled]):not(.on) >> nth=0");
    await page.click("#enter-done");
    const st = await page.evaluate(() => window.__deskTest.holders().filter((h) => h.name === "나분할").map((h) => ({ keys: h.keys.length, v: h.visitNo, end: h.visitEnd })));
    assert.deepStrictEqual(st, [{ keys: 2, v: 9, end: 10 }], "열쇠 2개는 누른 카드에 · 함께 완료 → 10");
    const txt = await page.$$eval(".res", (e) => e.filter((x) => /나분할/.test(x.textContent)).map((x) => x.textContent.replace(/\s+/g, " ")));
    assert.ok(txt.every((t) => /이용완료/.test(t)), "둘 다 이용완료");
    assert.ok(txt.some((t) => /같은 시간 예약 — \d\d:\d\d 함께 입장 \(열쇠 \d+, \d+번\)/.test(t)), txt.join(" | "));
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("같은 시간 묶음 — 같은 전화번호면 이름이 조금 달라도 (띄어쓰기 · 휴대폰 한글 저장 방식) 묶음 · 어느 카드든 열쇠 합계 (사장님 11/20 — 현장은 1개만 골라져 서비스 키로 처리했음)", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    const nfd = "한솔이".normalize("NFD");
    await page.evaluate((nfd) => {
      const T = window.__deskTest, d = T.today();
      T.addBooking(d, "16:30", "한솔이", "01055551001", 1, { prevDone: 2 });
      T.addBooking(d, "16:30", nfd, "010-5555-1001", 1, { prevDone: 2 }); // 같은 이름 · 다른 한글 저장 방식
      T.addBooking(d, "16:30", "한솔 엄마", "01055551001", 2, { prevDone: 2 }); // 이름이 다름 · 전화 같음
    }, nfd);
    await page.click('.slot[data-s="990"]');
    const n = await page.$$eval(".res", (e) => e.filter((x) => /같은 시간 예약 \d\/3/.test(x.textContent)).length);
    assert.strictEqual(n, 3, "세 카드 모두 묶음 (1/3 · 2/3 · 3/3)");
    for (const i of [0, 1, 2]) {
      await page.click(`.res:has-text("같은 시간 예약") >> nth=${i}`);
      assert.match(await page.textContent("#sheet .field .label"), /같은 시간 예약 합계 4개만큼/, `${i + 1}번째 카드도 합계 4개`);
      if (i === 2) assert.match((await page.textContent("#sheet")).replace(/\s+/g, " "), /이름 한솔이 · .* · 전화번호 같음/);
      await page.click("#sheet [data-act=close] >> nth=0");
    }
    // 마지막 카드에서 4개 → 세 건 모두 이용완료
    await page.click('.res:has-text("한솔 엄마")');
    for (let k = 0; k < 4; k++) await page.click(".kpick button:not([disabled]):not(.on) >> nth=0");
    await page.click("#enter-done");
    const done = await page.$$eval(".res", (e) => e.filter((x) => /같은 시간 예약 \d\/3/.test(x.textContent)).map((x) => /이용완료/.test(x.textContent)));
    assert.deepStrictEqual(done, [true, true, true]);
    assert.deepStrictEqual(await page.evaluate(() => window.__deskTest.holders().filter((h) => /한솔/.test(h.name.normalize("NFC"))).map((h) => [h.name, h.keys.length])), [["한솔 엄마", 4]]);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
