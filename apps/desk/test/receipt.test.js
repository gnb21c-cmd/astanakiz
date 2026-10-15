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
    // 현장입장 입장시간 = 접수 시각 직전 30분 칸 (체험 예시: 12:40 접수 → 12:30 입장, 13:12 → 13:00)
    const walkTimes = await page.evaluate(() => window.__deskTest.holders().filter((x) => x.walk).map((w) => window.__deskTest.keyVals(w).입장시간));
    assert.deepStrictEqual(walkTimes, ["오후 12시 30분", "오후 1시 00분"]);
    assert.ok(walk.some((l) => /네이버 예약하고/.test(l.t)), "현장 손님에게 네이버 예약 안내");
    assert.ok(!walk.some((l) => /네이버 예약 \d+번/.test(l.t)), "현장 손님은 이용완료 횟수 없음");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("[자르기]: 양식 한 줄로 그 자리에서 종이를 자름 (쿠폰 떼기) — COM 은 그 자리에 자르기 명령 · Windows 프린터는 조각마다 출력 + 자르기 · 미리보기 표시 · 조건", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    const FORM = "^위 입장권\n[자르기]\n#* [ 수제돈까스 쿠폰 ]\n[이벤트][자르기]\n^아래 안내";
    const r = await page.evaluate((f) => {
      const T = window.__deskTest, h = T.holders().find((x) => !x.walk), v = T.keyVals(h);
      const lines = T.receiptLines(f, v).map((l) => l.k + ":" + l.t);
      const flat = (parts) => parts.flatMap((p) => (p.b ? p.b.map((x) => "b" + x) : ["t:" + p.t.trim()]));
      return { lines, on: flat(T.escposParts(f, v, true)), off: flat(T.escposParts(f, v, false)), docs: T.receiptDocs(f, v), whole: T.receiptDocs(f, v, true) };
    }, FORM);
    assert.deepStrictEqual(r.lines, ["ctr:위 입장권", "cut:", "big:[ 수제돈까스 쿠폰 ]", "ctr:아래 안내"], "조건 [이벤트] 가 안 맞으면 그 자르기는 없음");
    const CUT = ["b29", "b86", "b1"];
    const at = (arr, from) => arr.findIndex((x, i) => i >= from && x === "b29" && arr[i + 1] === "b86" && arr[i + 2] === "b1");
    for (const [name, arr, end] of [["끝 자르기 켬", r.on, true], ["끝 자르기 끔", r.off, false]]) {
      const top = arr.indexOf("t:위 입장권"), coupon = arr.indexOf("t:[ 수제돈까스 쿠폰 ]"), mid = at(arr, top);
      assert.ok(top >= 0 && mid > top && mid < coupon, `${name}: 위 입장권 → 자르기 → 쿠폰`);
      assert.deepStrictEqual(arr.slice(mid - 2, mid), ["b100", "b4"], `${name}: 자르기 전에 4줄 올림`);
      assert.strictEqual(at(arr, coupon) >= 0, end, `${name}: 맨 끝 자르기는 설정대로`);
    }
    assert.strictEqual(r.docs.length, 2, "Windows 프린터: [자르기] 에서 두 조각");
    assert.ok(r.docs[0].includes("위 입장권") && !r.docs[0].includes("쿠폰") && r.docs[1].includes("수제돈까스 쿠폰") && r.docs.every((d) => !d.includes("여기서 자름")));
    assert.strictEqual(r.whole.length, 1, "인쇄 창 확인용은 하나로");

    // Windows 프린터로 출력: 조각마다 차례로 · 사이는 꼭 자르고 · 끝은 설정대로 · 짧은 조각 허용
    const calls = await page.evaluate(async (f) => {
      const T = window.__deskTest, h = T.holders().find((x) => !x.walk), v = T.keyVals(h), calls = [];
      window.desk = { print: { html: async (j) => { calls.push({ cut: j.cut, minMm: j.minMm, coupon: j.html.includes("쿠폰") }); return { ok: true }; } } };
      Object.assign(T.PRINT, { mode: "win", sel: "POS-80", cut: false });
      await T.sendPrint(f, v);
      Object.assign(T.PRINT, { cut: true });
      await T.sendPrint(f, v);
      await T.sendPrint(f, v, { dialog: true });
      delete window.desk;
      return calls;
    }, FORM);
    assert.deepStrictEqual(calls, [
      { cut: true, minMm: 10, coupon: false }, { cut: false, minMm: 10, coupon: true },
      { cut: true, minMm: 10, coupon: false }, { cut: true, minMm: 10, coupon: true },
      { cut: false, minMm: undefined, coupon: true },
    ]);

    // 미리보기: 자르는 자리 표시 · 설명
    await page.click("text=운영 설정");
    await page.click('[data-t="printer"]');
    await page.fill("#form-text", FORM);
    assert.deepStrictEqual(await page.$$eval("#paper .pl", (e) => e.map((x) => x.textContent.trim()).filter(Boolean)), ["위 입장권", "✂ 여기서 자름", "[ 수제돈까스 쿠폰 ]", "아래 안내"]);
    assert.match(await page.textContent("#sheet .formhelp"), /\[자르기\] 한 줄 = 그 자리에서 종이 자름/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
