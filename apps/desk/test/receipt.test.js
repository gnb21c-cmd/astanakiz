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
      const v = T.keyVals(T.holders().find((x) => x.walk));
      return T.receiptLines(T.form(v), v); // 현장 손님 = 현장 입장 양식 (10/28)
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
    await page.dblclick("#now");
    await page.click('[data-t=\"prints\"]'); await page.click('[data-s=\"ticket\"]');
    await page.fill("#form-text", FORM);
    assert.deepStrictEqual(await page.$$eval("#paper .pl", (e) => e.map((x) => x.textContent.trim()).filter(Boolean)), ["위 입장권", "✂ 여기서 자름", "[ 수제돈까스 쿠폰 ]", "아래 안내"]);
    assert.match(await page.textContent("#sheet .formhelp"), /\[자르기\] 한 줄 = 그 자리에서 종이 자름/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("자르기 전 여백(줄): 처음 4줄 · 프린터 탭에서 줄이면 끝 · [자르기] · Windows 프린터 모두 그만큼 (10/16)", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    const run = () => page.evaluate(async () => {
      const T = window.__deskTest, h = T.holders().find((x) => !x.walk), v = T.keyVals(h), f = "^위\n[자르기]\n^아래";
      const flat = T.escposParts(f, v, true).flatMap((p) => (p.b ? p.b : []));
      const feeds = []; for (let i = 0; i < flat.length - 2; i++) if (flat[i] === 0x1b && flat[i + 1] === 0x64) feeds.push(flat[i + 2]);
      const calls = [];
      window.desk = { print: { html: async (j) => { calls.push(j.feed); return { ok: true }; } } };
      const mode = T.PRINT.mode; Object.assign(T.PRINT, { mode: "win", sel: "POS-80" });
      await T.sendPrint(f, v); T.PRINT.mode = mode; delete window.desk;
      return { feeds, calls, pad: /padding: 2mm 4mm ([\d.]+)mm/.exec(T.receiptDocs("^위", v)[0])[1] };
    });
    assert.deepStrictEqual(await run(), { feeds: [4, 4], calls: [4, 4], pad: "6.0" }, "처음 4줄 (예전과 같음)");
    await page.dblclick("#now");
    await page.click('[data-t="printer"]');
    assert.strictEqual(await page.inputValue("#print-feed"), "4");
    await page.fill("#print-feed", "2");
    assert.match(await page.textContent("#print-feed-mm"), /약 8mm/);
    assert.deepStrictEqual(await run(), { feeds: [2, 2], calls: [2, 2], pad: "3.0" }, "줄이면 [자르기] · 끝 · Windows 모두");
    await page.fill("#print-feed", "99");
    assert.strictEqual(await page.evaluate(() => window.__deskTest.PRINT.feed), 8, "1 ~ 8줄");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("+ = 세로 2배 (기본과 2배 사이 중간 크기 · 폭 그대로 42칸) — ESC/POS GS ! 1 · FS ! 8 · 미리보기 (10/16)", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    const r = await page.evaluate(() => {
      const T = window.__deskTest, h = T.holders().find((x) => !x.walk), v = T.keyVals(h), f = "^+* 중간 크기\n# 두 배\n^보통";
      const L = T.receiptLines(f, v).map((l) => [l.k, l.size, !!l.tall, !!l.bold, l.t]);
      const parts = T.escposParts(f, v, false);
      const before = (txt) => { const i = parts.findIndex((p) => p.t && p.t.startsWith(txt)); return parts[i - 1].b; };
      return { L, mid: before("중간 크기"), big: before("두 배"), plain: before("보통") };
    });
    assert.deepStrictEqual(r.L, [["ctr", 1, true, true, "중간 크기"], ["big", 2, false, false, "두 배"], ["ctr", 1, false, false, "보통"]]);
    assert.deepStrictEqual(r.mid, [0x1b, 0x45, 1, 0x1d, 0x21, 0x01, 0x1c, 0x21, 0x08], "굵게 + 세로 2배 (영문 · 한글)");
    assert.deepStrictEqual(r.big, [0x1b, 0x45, 0, 0x1d, 0x21, 0x11, 0x1c, 0x21, 0x0c], "2배는 그대로");
    assert.deepStrictEqual(r.plain, [0x1b, 0x45, 0], "보통은 그대로");
    await page.dblclick("#now");
    await page.click('[data-t=\"prints\"]'); await page.click('[data-s=\"ticket\"]');
    await page.fill("#form-text", "^+* 중간 크기\n^보통");
    const hgt = await page.$$eval("#paper .pl", (e) => e.map((x) => x.getBoundingClientRect().height));
    assert.ok(hgt[0] > hgt[1] * 1.6, `미리보기도 세로로 커짐 ${hgt}`);
    assert.match(await page.textContent("#sheet .formhelp"), /\+ 세로 2배\(중간\)/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("입장권 양식 네이버 · 현장 따로 (사장님 10/28): 예전 한 칸 양식은 둘로 나눠 옮김 · 손님 따라 그 양식 · 설정은 이벤트 양식처럼 골라서", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  // 예전(2.10 까지) 한 칸 양식 — 네이버 · 현장 줄이 섞여 있음 (가짜 예시)
  const OLD = ["#* {열쇠} 번", "", "*{구분}  {입장시간} 예약 | {고객}({전화뒤4})", "===", "[네이버]#*{누계}번째 예약 이용완료", "#*퇴장  {퇴장시간}", "[현장]===", "[현장]#* 네이버 예약하고", "[현장]", "[네이버][사은권]^*사은권 드려요", "[현장][기한]^현장 기한 줄", "^{날짜} {시각}"].join("\n");
  const NAVER = ["#* {열쇠} 번", "", "*{구분}  {입장시간} 예약 | {고객}({전화뒤4})", "===", "[네이버]#*{누계}번째 예약 이용완료", "#*퇴장  {퇴장시간}", "[네이버][사은권]^*사은권 드려요", "^{날짜} {시각}"].join("\n");
  const WALK = ["#* {열쇠} 번", "", "*{구분}  {입장시간} 예약 | {고객}({전화뒤4})", "===", "#*퇴장  {퇴장시간}", "===", "#* 네이버 예약하고", "", "[기한]^현장 기한 줄", "^{날짜} {시각}"].join("\n");
  try {
    // ① 앱: 예전 한 칸 양식이 저장된 PC → 켜면 둘로 나눠 저장 · 현장 손님은 현장 양식으로 출력
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await ctx.newPage();
    await page.addInitScript((old) => {
      window.__jobs = [];
      window.__cfg = { build: "2.10", printMode: "com", comPort: "COM3", printForm: { text: old, auto: true, ver: 4 } };
      window.desk = {
        naver: { load: async (day) => ({ ok: true, day, slots: [], bookings: [] }), complete: async () => ({ ok: true }) },
        state: { load: (day) => localStorage.getItem("test-state-" + day), save: (day, json) => localStorage.setItem("test-state-" + day, json) },
        config: { get: async () => window.__cfg, set: async (patch) => { Object.assign(window.__cfg, patch); return { ok: true }; } },
        print: { escpos: async (j) => { window.__jobs.push(j); return { ok: true }; } },
      };
    }, OLD);
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    await page.waitForFunction(() => window.__cfg.printForm && typeof window.__cfg.printForm.walk === "string", null, { timeout: 15000 });
    const saved = await page.evaluate(() => window.__cfg.printForm);
    assert.strictEqual(saved.text, NAVER, "네이버 = [현장] 줄만 뺌 ([네이버] 는 마일리지 줄이라 그대로)");
    assert.strictEqual(saved.walk, WALK, "현장 = [네이버] · [사은권] 줄 빼고 [현장] 표시만 지움");
    assert.deepStrictEqual(await page.evaluate(() => [window.__cfg.comPort, window.__cfg.printMode]), ["COM3", "com"], "나눠 저장해도 프린터 설정(COM 포트)은 그대로");
    const again = await page.evaluate(([n, w]) => { const T = window.__deskTest; return [T.splitForm(n).naver, T.splitForm(w).walk]; }, [NAVER, WALK]);
    assert.deepStrictEqual(again, [NAVER, WALK], "이미 나눈 양식은 다시 나눠도 그대로");
    assert.deepStrictEqual(await page.evaluate(([n, w]) => { const T = window.__deskTest, j = T.joinForms(n, w); return [T.splitForm(j).naver, T.splitForm(j).walk]; }, [NAVER, WALK]), [NAVER, WALK], "이벤트 공통 양식(한 칸)으로 합쳐도 나누면 그대로");
    await page.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 15000 });
    await page.evaluate(() => { const T = window.__deskTest; T.walkin("01055556666", [44, 45], 840, 840); T.setNow(845); });
    await page.click(".key[data-k='44']");
    await page.click("#sheet [data-act=reprint]"); // 입장권 다시 출력 = 그 손님 양식 그대로
    await page.waitForFunction(() => window.__jobs.length === 1);
    const job = await page.evaluate(() => window.__jobs[0].parts.map((p) => p.t || "").join(""));
    assert.match(job, /네이버 예약하고/, "현장 손님 = 현장 양식");
    assert.doesNotMatch(job, /번째 예약 이용완료|\[현장\]/);
    const nv = await page.evaluate(() => { const T = window.__deskTest; return T.formFor({ _현장: false }) === T.PRINT_().forms.enter.text && T.formFor({ _현장: true }) === T.PRINT_().forms.enter.walk; });
    assert.ok(nv, "네이버 손님 = 네이버 양식 · 현장 손님 = 현장 양식");
    assert.deepStrictEqual(errs, []);
    await ctx.close();

    // ② 체험판 설정: 프린트물 → 입장권 양식 — [네이버 예약] [현장 입장] 골라서 따로 고침 · 미리보기 · 기본 양식으로는 고른 쪽만
    const p2 = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs2 = [];
    p2.on("pageerror", (e) => errs2.push(e.message));
    await p2.goto(DESK);
    await p2.dblclick("#now");
    await p2.click('[data-t="prints"]'); await p2.click('[data-s="ticket"]');
    assert.deepStrictEqual(await p2.$$eval("#sheet .evrules .evno", (e) => e.map((x) => x.textContent.trim())), ["네이버 예약", "현장 입장"]);
    const nText = await p2.inputValue("#form-text");
    assert.ok(!/\[현장\]/.test(nText) && /\{누계\}/.test(nText), "네이버 양식엔 [현장] 줄 없음");
    await p2.click("#sheet .evno[data-k=walk]");
    const wText = await p2.inputValue("#form-text");
    assert.ok(!/\[현장\]|\[네이버\]/.test(wText) && /네이버 예약하고/.test(wText), "현장 양식엔 표시 없이 현장 줄만");
    assert.match(await p2.textContent("#paper"), /네이버 예약하고/, "미리보기 = 현장 예시");
    await p2.fill("#form-text", "^* 현장 전용\n#{열쇠}번");
    const after = await p2.evaluate(() => { const P = window.__deskTest.PRINT_().forms.enter; return { walk: P.walk, naver: P.text }; });
    assert.strictEqual(after.walk, "^* 현장 전용\n#{열쇠}번");
    assert.strictEqual(after.naver, nText, "네이버 양식은 그대로");
    assert.match(await p2.textContent("#paper"), /현장 전용/);
    await p2.click("#sheet [data-act=resetForm]");
    assert.strictEqual(await p2.inputValue("#form-text"), wText, "기본 양식으로 = 현장 양식만");
    assert.strictEqual(await p2.evaluate(() => window.__deskTest.PRINT_().forms.enter.text), nText);
    await p2.click("#sheet .evno[data-k=naver]");
    assert.strictEqual(await p2.inputValue("#form-text"), nText);
    assert.deepStrictEqual(errs2, []);
  } finally {
    await browser.close();
  }
});
