/* 쿠폰 보안 무늬 (사장님 10/16) — 재방문 이벤트 성공 입장권의 제공상품(쿠폰) 줄만 데스크가 그린 그림으로 찍음
   - 바리스타는 따로 확인 없이 받아 폐기 → POS · 감열지 프린터에 글자만 쳐서 찍어 낸 가짜와 한눈에 구별되게
   - 물결 무늬(매장 비밀값 + 날짜) · 위아래 작은 글씨 띠만 — 내용은 제공상품 양식 그대로 (도장 · 번호 · 시각은 빼기로 · 사장님 10/16)
   - ESC/POS(COM) = GS v 0 래스터 · Windows 프린터 = 그림 · 미리보기도 찍히는 그대로 · [쿠폰 보안 무늬] 끄면 예전처럼 글자
   - 현장 10/18 (1.46): 128줄(9KB)씩 한꺼번에 보내니 프린터가 그림을 천천히 찍는 동안 버퍼가 넘쳐 첫 조각만 찍히고 나머지 · 자르기 · 입장권 앞부분이 사라짐
     → 24줄(1.7KB)씩 나누고 조각마다 '다 보내질 때까지 + 찍을 틈'을 기다림 (조각의 w)
   - 현장 10/18: 프린터가 9600bps 만 됨 → 교환권 전체 그림은 30초 넘게 → 사장님 고름 '위아래 띠만 그림': 물결 + 작은 글씨 띠를 위 · 아래 두 장으로,
     가운데 내용은 제공상품 양식 그대로 프린터 글자 (9600bps 에서 10초 안)
   - 현장 10/18 (1.47): 그래도 느림 → 물결 · 세로 두 줄 빼고 가로 두 줄 + 작은 글씨 'ASTANAKIDS·월일' 띠만 (띠 한 장 16줄 · 두 장 2.3KB · 9600bps 2초 남짓 더)
   - 현장 10/18 (1.48 사진): 그림(GS v 0) 바로 앞뒤로 보낸 것이 사라짐 — 교환권 '===' 두 줄 · 자르기 전 여백(그래서 너무 일찍 잘림) · 입장권 열쇠 · 이름 · 전화 줄
     → 그림을 아예 안 씀: 띠(가로 두 줄 + 작은 글씨)를 '사용자 정의 문자'(ESC &, 글꼴 A 12×24 칸)로 프린터에 등록해 보통 글자처럼 한 줄로 찍음 (글자 출력은 늘 잘 됨) */
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
const EVENT = (from) => () => { if (!localStorage.getItem("astanakiz-visitevent")) localStorage.setItem("astanakiz-visitevent", JSON.stringify({ ver: 2, on: true, from: window.__from, to: "2026-10-31", days: 20, gift: "수제돈까스" })); };

/** escpos 조각 → { text, rasters: GS v 0 그림, udc: ESC & 글자 모양 등록 [{ y, c1, c2, xs }], bands: ESC % 1 로 찍은 띠 줄 [{ codes }], bandBytes } */
const parse = (parts) => {
  let text = "", bandBytes = 0;
  const rasters = [], udc = [], bands = [];
  for (const p of parts) {
    if (p.t) text += p.t;
    if (!p.b && !p.r) continue;
    const b = p.r ? [...Buffer.from(p.r, "base64")] : p.b;
    let band = false;
    for (let i = 0; i < b.length; i++) {
      if (b[i] === 0x1d && b[i + 1] === 0x76 && b[i + 2] === 0x30) {
        const bpr = b[i + 4] | (b[i + 5] << 8), h = b[i + 6] | (b[i + 7] << 8);
        rasters.push({ bpr, h });
        i += 7 + bpr * h;
      } else if (b[i] === 0x1b && b[i + 1] === 0x26) {
        const y = b[i + 2], c1 = b[i + 3], c2 = b[i + 4], xs = [];
        let j = i + 5;
        for (let c = c1; c <= c2; c++) { xs.push(b[j]); j += 1 + b[j] * y; }
        udc.push({ y, c1, c2, xs });
        i = j - 1;
        band = true;
      } else if (b[i] === 0x1b && b[i + 1] === 0x25 && b[i + 2] === 1) {
        let j = i + 3; const codes = [];
        while (j < b.length && b[j] !== 0x0a) codes.push(b[j++]);
        bands.push({ codes });
        i = j;
        band = true;
      }
    }
    if (band) bandBytes += b.length;
  }
  return { text, rasters, udc, bands, bandBytes };
};

test("쿠폰 보안 띠: 성공 입장권의 쿠폰 위아래에 등록 글자(ESC &)로 띠 · 그림(GS v 0) 없음 · 날마다 · 매장마다 다름 · 끄면 글자", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.addInitScript(() => { window.__from = "2026-10-05"; });
    await page.addInitScript(EVENT());
    await page.goto(DESK); // 체험판 10/5 13:50 · 이벤트 진행 중
    const r = await page.evaluate(() => {
      const T = window.__deskTest;
      const ok = T.evSample(1), guide = T.evSample(0);
      return { ok: T.escposParts(T.form(), ok, true), guide: T.escposParts(T.form(), guide, true), docs: T.receiptDocs(T.form(), ok), docsGuide: T.receiptDocs(T.form(), guide) };
    });
    const ok = parse(r.ok), guide = parse(r.guide);
    // 성공: 쿠폰 위아래 띠 = 등록 글자 한 줄씩 (현장 10/18 1.48: 그림 앞뒤로 글이 사라짐 → 그림 없음) · 쿠폰 글은 프린터 글자
    assert.strictEqual(ok.rasters.length, 0, "그림(GS v 0) 없음");
    assert.strictEqual(ok.bands.length, 2, "띠 두 줄");
    assert.strictEqual(ok.udc.length, 2, "띠마다 글자 모양 등록");
    assert.ok(ok.udc.every((d) => d.y === 3 && d.xs.length >= 5 && d.xs.length <= 12 && d.xs.every((x) => x === 12)), "글꼴 A 12×24 칸 " + JSON.stringify(ok.udc.map((d) => [d.y, d.c1, d.c2])));
    assert.ok(ok.bands.every((x, i) => x.codes.length === 42 && x.codes.every((c) => c >= ok.udc[i].c1 && c <= ok.udc[i].c2)), "한 줄 42칸 · 등록한 글자만");
    assert.notStrictEqual(ok.udc[0].c1, ok.udc[1].c1, "위 띠 · 아래 띠는 다른 글자 자리");
    assert.ok(ok.bandBytes < 1200, "띠 두 줄 1.2KB 안 (9600bps 1초 남짓) " + ok.bandBytes);
    assert.match(ok.text, /\[ 수제돈까스 무료 증정 \]/, "쿠폰 글은 프린터 글자로 (띠 사이)");
    // 순서: 위 띠 그림 → 쿠폰 글 → 아래 띠 그림
    const iGift = r.ok.findIndex((p) => p.t && p.t.includes("무료 증정")), iR = r.ok.map((p, i) => (p.b && p.b.some((x, j) => x === 0x1b && p.b[j + 1] === 0x25 && p.b[j + 2] === 1) ? i : -1)).filter((i) => i >= 0);
    assert.ok(iR[0] < iGift && iR[iR.length - 1] > iGift, "띠 · 글 · 띠 순서 " + JSON.stringify({ iGift, iR }));
    assert.ok(iR.some((i) => i > iGift) && iR.some((i) => i < iGift));
    assert.match(ok.text, /재방문 이벤트 성공!/, "2번 성공 글은 그대로 글자");
    assert.match(ok.text, /또 드려요/);
    // 안내(1번): 쿠폰 없음 → 그림 없음
    assert.strictEqual(guide.rasters.length + guide.bands.length + guide.udc.length, 0);
    // Windows 프린터 · 미리보기: 그림 한 장
    assert.match(r.docs.join(""), /<div class="pl seal[^"]*"><img src="data:image\/png;base64,/);
    assert.strictEqual((r.docs.join("").match(/class="pl seal/g) || []).length, 2, "Windows 프린터 · 미리보기도 위아래 띠 두 장");
    assert.doesNotMatch(r.docsGuide.join(""), /class="pl seal/);

    // 같은 날 · 같은 비밀값이면 늘 같은 그림 · 날짜나 비밀값이 바뀌면 다른 무늬
    const same = await page.evaluate(() => {
      const T = window.__deskTest;
      const mk = (day) => ({ k: "seal", part: "top", meta: { day } });
      const a = T.sealOf(mk("2026-10-05")).url;
      T.sealClear();
      const a2 = T.sealOf(mk("2026-10-05")).url, b = T.sealOf(mk("2026-10-06")).url;
      // 비밀값마다 시작 칸이 다름 — 칸이 k(6~12)개뿐이라 두 비밀값이 우연히 같을 수 있어 정해 둔 비밀값 넷으로 (무작위 비밀값 하나와 견주면 1/k 쯤 같게 나와 시험이 흔들림)
      const key = T.SEAL.key, urls = new Set();
      for (const k of ["0123456789abcdef0123456789abcdef", "fedcba9876543210fedcba9876543210", "00112233445566778899aabbccddeeff", "a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5"]) { T.SEAL.key = k; T.sealClear(); urls.add(T.sealOf(mk("2026-10-05")).url); }
      T.SEAL.key = key; T.sealClear();
      const bot = T.sealOf({ k: "seal", part: "bot", meta: { day: "2026-10-05" } });
      return { same: a === a2, day: a !== b, key: urls.size >= 2, keyLen: key.length, botDiff: bot.url !== a, size: [T.sealOf(mk("2026-10-05")).w, T.sealOf(mk("2026-10-05")).h, bot.w, bot.h] };
    });
    assert.deepStrictEqual(same.size, [504, 24, 504, 24], "띠 미리보기 = 42칸 × 12점 · 24줄");
    delete same.size;
    // 프린터처럼 읽기: ESC & 로 등록한 모양(세로 3바이트 · 위가 높은 비트)을 ESC % 1 줄의 글자 순서대로 이어 붙이면 미리보기와 점 하나까지 같아야 함
    const emu = await page.evaluate(async () => {
      const T = window.__deskTest, res = [];
      for (const part of ["top", "bot"]) {
        const s = T.sealOf({ k: "seal", part, meta: { day: "2026-10-05" } }), b = s.bytes;
        let i = b.indexOf(0x26) - 1; const y = b[i + 2], c1 = b[i + 3], c2 = b[i + 4], gl = {}; let j = i + 5;
        for (let c = c1; c <= c2; c++) { const x = b[j]; gl[c] = b.slice(j + 1, j + 1 + x * y); j += 1 + x * y; }
        const p1 = b.findIndex((v, n) => v === 0x1b && b[n + 1] === 0x25 && b[n + 2] === 1), codes = [];
        for (let n = p1 + 3; b[n] !== 0x0a; n++) codes.push(b[n]);
        const W = codes.length * 12, on = (xx, yy) => { const g = gl[codes[Math.floor(xx / 12)]], col = xx % 12; return (g[col * 3 + (yy >> 3)] >> (7 - (yy & 7))) & 1; };
        const im = await new Promise((ok) => { const m = new Image(); m.onload = () => ok(m); m.src = s.url; });
        const cv = document.createElement("canvas"); cv.width = im.width; cv.height = im.height; const g = cv.getContext("2d"); g.drawImage(im, 0, 0);
        const d = g.getImageData(0, 0, im.width, im.height).data;
        let diff = 0, ink = 0;
        for (let yy = 0; yy < 24; yy++) for (let xx = 0; xx < W; xx++) { const pv = d[(yy * im.width + xx) * 4] < 128 ? 1 : 0, e = on(xx, yy); ink += e; if (pv !== e) diff++; }
        const rowInk = (yy) => { let n = 0; for (let xx = 0; xx < W; xx++) n += on(xx, yy); return n; };
        res.push({ part, W, diff, ink, lineRows: [0, 1, 4, 15, 18, 19].map(rowInk) });
      }
      return res;
    });
    for (const e of emu) {
      assert.strictEqual(e.W, 504);
      assert.strictEqual(e.diff, 0, e.part + " 띠: 프린터로 찍히는 점 = 미리보기");
      assert.ok(e.ink > 800, e.part + " 띠에 작은 글씨 " + e.ink);
    }
    assert.deepStrictEqual(emu[0].lineRows.slice(0, 3), [504, 504, 504], "위 띠 가로 두 줄 (1 · 2 · 5번째 줄 꽉 참)");
    assert.deepStrictEqual(emu[1].lineRows.slice(3), [504, 504, 504], "아래 띠 가로 두 줄");
    assert.deepStrictEqual(same, { same: true, day: true, key: true, keyLen: 32, botDiff: true });
    assert.match(await page.evaluate(() => localStorage.getItem("astanakiz-sealkey")), /^[0-9a-f]{32}$/, "체험판 비밀값은 이 브라우저에 (앱은 이 PC 설정에)");

    // 운영 설정 → 방문 이벤트 → 2번 성공 미리보기에 그림 · [쿠폰 보안 무늬] 끄면 글자
    await page.dblclick("#now");
    await page.click('[data-t=\"prints\"]'); await page.click('[data-s=\"event\"]');
    await page.click("[data-act=evTpl][data-i='1']");
    assert.strictEqual(await page.$eval("#ev-paper .seal img", (im) => im.naturalWidth), 504);
    assert.ok(await page.isChecked("#ev-seal"), "처음엔 켜짐");
    await page.uncheck("#ev-seal");
    assert.strictEqual(await page.$("#ev-paper .seal img"), null);
    assert.match(await page.textContent("#ev-paper"), /\[ 수제돈까스 무료 증정 \]/);
    assert.strictEqual(JSON.parse(await page.evaluate(() => localStorage.getItem("astanakiz-visitevent"))).seal, false, "설정에 저장");
    const off = parse(await page.evaluate(() => { const T = window.__deskTest; return T.escposParts(T.form(), T.evSample(1), true); }));
    assert.strictEqual(off.rasters.length + off.bands.length + off.udc.length, 0, "끄면 띠 없음");
    assert.match(off.text, /\[ 수제돈까스 무료 증정 \]/, "끄면 예전처럼 글자");
    const box = await page.evaluate(() => document.getElementById("sheet").getBoundingClientRect().bottom);
    assert.ok(box <= 768, "설정 화면 안 " + box);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("실제 손님: 기한 안 재방문(성공) 입장권에 보안 무늬 · 처음 온 손님(안내)은 없음", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.addInitScript(() => { window.__from = "2026-09-10"; });
    await page.addInitScript(EVENT());
    await page.goto(DESK);
    await page.evaluate(() => window.__deskTest.evInject("홍예준", { day: "2026-09-20" })); // 기한 안 → 오늘 성공
    const enter = async (name) => {
      await page.click('.slot[data-s="840"]');
      await page.click(`.res:has-text("${name}") >> nth=0`);
      for (let i = 0; i < 6 && !(await page.$("#enter-done:not([disabled])")); i++) await page.click(".kpick button:not([disabled]):not(.on) >> nth=0");
      await page.click("#enter-done");
    };
    await enter("홍예준");
    await enter("고은우");
    const r = await page.evaluate(() => {
      const T = window.__deskTest;
      const p = (n) => T.escposParts(T.form(), T.keyVals(T.holders().find((h) => h.name === n)), true);
      return { ok: p("홍예준"), first: p("고은우") };
    });
    assert.strictEqual(parse(r.ok).bands.length, 2, "성공 손님 입장권에 보안 띠");
    assert.strictEqual(parse(r.first).bands.length, 0, "처음 온 손님(안내)은 쿠폰 없음");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("사장님 양식: 공통 양식 맨 앞 [사은품] → 위 띠 · 교환권 · 아래 띠 · [자르기] · 입장권(열쇠 · 이름 · 전화부터) 그대로 · 그림 없음", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const GIFT = "===\n\n^#*수제한돈까스\n\n^#*1EA 교환권\n\n^*분실 시 이벤트 교환권 재발행 불가합니다.\n^*당일 준비량이 소진 되었을 수 있습니다.\n^*본 사은권의 사용기한은 없습니다.\n\n===\n[자르기]";
    await page.addInitScript((g) => { localStorage.setItem("astanakiz-visitevent", JSON.stringify({ ver: 2, on: true, from: "2026-10-05", to: "2026-10-31", days: 20, gift: "수제돈까스", tpl: ["#* 재방문 이벤트\n^*{다음기한}(포함)까지 다시 오시면\n[기한]^*{사은품} 무료 증정!", "#* 재방문 이벤트 성공!\n^*{다음기한}(포함)까지 또 오시면\n[기한]^*{사은품} 또 드려요", g] })); }, GIFT);
    await page.goto(DESK);
    const r = await page.evaluate(() => {
      const T = window.__deskTest, E = T.EV_();
      E.form = "[사은품]\n" + T.form();
      const v = T.evSample(1);
      const parts = T.escposParts(T.form(), v, true);
      const isBand = (x) => x.b && x.b.some((c, j) => c === 0x1b && x.b[j + 1] === 0x25 && x.b[j + 2] === 1);
      const seq = parts.map((x) => (x.r ? "그림" : isBand(x) ? "띠" : x.t ? x.t.trim() : x.b && x.b.length === 9 && x.b[7] === 0x56 ? "자르기" : null)).filter((x) => x != null && x !== "");
      const bytes = parts.reduce((a, p) => a + (p.r ? atob(p.r).length : p.b ? p.b.length : p.t ? [...p.t].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x7f ? 2 : 1), 0) : 0), 0);
      const rasterBytes = parts.reduce((a, p) => a + (p.r ? atob(p.r).length : 0), 0);
      const P = T.PRINT_(); P.port = "COM1"; P.baud = 9600;
      return { seq, bytes, rasterBytes, secs9600: T.printSecs(T.form(), v), docs: T.receiptDocs(T.form(), v).map((d) => (d.includes('class="pl seal') ? "그림" : "글자")) };
    });
    // 위 띠 → 교환권 글(=== 두 줄 그대로) → 아래 띠 → 자르기 → 입장권
    assert.strictEqual(r.seq[0], "띠", "교환권 맨 앞은 위 띠");
    const iCut = r.seq.indexOf("자르기");
    assert.strictEqual(r.seq[iCut - 1], "띠", "아래 띠 바로 뒤 자르기");
    const mid = r.seq.slice(1, iCut - 1);
    assert.strictEqual(mid.filter((x) => /^=+$/.test(x)).length, 2, "교환권 === 두 줄 (1.48 사진엔 빠짐)");
    assert.deepStrictEqual(mid.filter((x) => !/^=+$/.test(x)), ["수제한돈까스", "1EA 교환권", "분실 시 이벤트 교환권 재발행 불가합니다.", "당일 준비량이 소진 되었을 수 있습니다.", "본 사은권의 사용기한은 없습니다."], "가운데는 사장님이 쓴 그대로 글자");
    assert.strictEqual(r.seq.filter((x) => x === "띠").length, 2, "띠 두 줄");
    assert.strictEqual(r.rasterBytes, 0, "그림 없음");
    assert.ok(r.secs9600 < 3.5, "교환권 + 입장권 9600bps 3.5초 안 " + JSON.stringify([r.bytes, r.secs9600]));
    assert.match(r.seq[iCut + 1] || "", /아스타나키즈|3, 13/, "자르기 바로 뒤 입장권 첫 줄 (1.48 사진엔 열쇠 · 이름 · 전화가 빠짐)");
    const rest = r.seq.slice(iCut + 1).join("\n");
    assert.match(rest, /재방문 이벤트 성공!/, "2번 성공은 입장권 안에 글자로");
    assert.doesNotMatch(rest, /수제한돈까스|교환권 재발행/, "교환권 글은 자르기 앞에만");
    assert.deepStrictEqual(r.docs, ["그림", "글자"], "Windows 프린터: 교환권 장 · 입장권 장");
  } finally {
    await browser.close();
  }
});

test("시험 출력 시간 어림 (현장 10/17 'COM1 액세스 거부'): 쿠폰 그림은 속도에 따라 몇 초 ~ 30초 넘게 → 보내는 중이라고 알림 · 글만이면 금방", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.addInitScript(() => { window.__from = "2026-10-05"; });
    await page.addInitScript(EVENT());
    await page.goto(DESK);
    const r = await page.evaluate(() => {
      const T = window.__deskTest, P = T.PRINT_(), E = T.EV_();
      P.port = "COM1";
      const s = (baud, seal) => { P.baud = baud; E.seal = seal; T.sealClear(); return T.printSecs(T.form(), T.evSample(1)); };
      const out = { fast: s(115200, true), slow: s(9600, true), text: s(9600, false), guide: (() => { P.baud = 9600; E.seal = true; return T.printSecs(T.form(), T.evSample(0)); })() };
      P.mode = "win"; out.win = T.printSecs(T.form(), T.evSample(1)); P.mode = "com"; P.baud = 9600; E.seal = true;
      return out;
    });
    assert.ok(r.fast < 0.5, "115200bps 쿠폰 띠 " + r.fast);
    assert.ok(r.slow - r.text > 0.3 && r.slow - r.text < 1.3, "9600bps 띠 때문에 더 걸리는 시간 1초 남짓 " + JSON.stringify(r));
    assert.ok(r.text < 3 && r.guide < 3, "글만이면 금방 " + JSON.stringify(r));
    assert.strictEqual(r.win, 0, "Windows 프린터는 어림 없음");
    // 체험판 [2번 성공으로 시험 출력]: 걸리는 초를 알려 줌
    await page.dblclick("#now");
    await page.click('[data-t=\"prints\"]'); await page.click('[data-s=\"event\"]');
    await page.click("[data-act=evTpl][data-i='1']");
    await page.click("[data-act=evTest]");
    assert.match(await page.textContent("#toast"), /시험 출력 \(COM1 · 9600, 체험\)/);
    assert.strictEqual(await page.$$eval("#ev-paper .seal img", (a) => a.length), 2, "미리보기도 위아래 띠 두 장");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
