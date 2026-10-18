/* 쿠폰 보안 무늬 (사장님 10/16) — 재방문 이벤트 성공 입장권의 제공상품(쿠폰) 줄만 데스크가 그린 그림으로 찍음
   - 바리스타는 따로 확인 없이 받아 폐기 → POS · 감열지 프린터에 글자만 쳐서 찍어 낸 가짜와 한눈에 구별되게
   - 물결 무늬(매장 비밀값 + 날짜) · 위아래 작은 글씨 띠만 — 내용은 제공상품 양식 그대로 (도장 · 번호 · 시각은 빼기로 · 사장님 10/16)
   - ESC/POS(COM) = GS v 0 래스터 · Windows 프린터 = 그림 · 미리보기도 찍히는 그대로 · [쿠폰 보안 무늬] 끄면 예전처럼 글자
   - 현장 10/18 (1.46): 128줄(9KB)씩 한꺼번에 보내니 프린터가 그림을 천천히 찍는 동안 버퍼가 넘쳐 첫 조각만 찍히고 나머지 · 자르기 · 입장권 앞부분이 사라짐
     → 24줄(1.7KB)씩 나누고 조각마다 '다 보내질 때까지 + 찍을 틈'을 기다림 (조각의 w)
   - 현장 10/18: 프린터가 9600bps 만 됨 → 교환권 전체 그림은 30초 넘게 → 사장님 고름 '위아래 띠만 그림': 물결 + 작은 글씨 띠를 위 · 아래 두 장으로,
     가운데 내용은 제공상품 양식 그대로 프린터 글자 (9600bps 에서 10초 안) */
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

/** escpos 조각 → { text, rasters: [{ bpr, h, n, w }] } (w = 그 조각 뒤 기다림 ms) */
const parse = (parts) => {
  let text = "";
  const rasters = [];
  for (const p of parts) {
    if (p.r && !(p.w > 0)) throw new Error("그림 조각에 기다림(w)이 없음");
    if (p.t) text += p.t;
    if (!p.b && !p.r) continue;
    const b = p.r ? [...Buffer.from(p.r, "base64")] : p.b;
    for (let i = 0; i + 7 < b.length; i++) {
      if (b[i] === 0x1d && b[i + 1] === 0x76 && b[i + 2] === 0x30) {
        const bpr = b[i + 4] | (b[i + 5] << 8), h = b[i + 6] | (b[i + 7] << 8);
        rasters.push({ bpr, h, n: Math.min(bpr * h, b.length - i - 8), w: p.w || 0 });
        i += 7 + bpr * h;
      }
    }
  }
  return { text, rasters };
};

test("쿠폰 보안 무늬: 성공 입장권의 쿠폰 줄만 그림(래스터)으로 · 나머지는 글자 · 날마다 · 매장마다 무늬가 다름 · 끄면 글자", async () => {
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
    // 성공: 쿠폰 위아래 띠만 그림(576점 = 72바이트 폭, 24줄씩 나누고 조각마다 기다림 · 현장 10/18) · 쿠폰 글은 프린터 글자
    assert.ok(ok.rasters.length >= 2, "래스터 조각 " + ok.rasters.length);
    assert.ok(ok.rasters.every((x) => x.bpr === 72 && x.h <= 24 && x.n === x.bpr * x.h && x.w >= 100), JSON.stringify(ok.rasters));
    assert.ok(r.ok.filter((p) => p.r).every((p) => Buffer.from(p.r, "base64").length <= 8 + 72 * 24), "조각 하나 = GS v 0 한 번 (1.7KB 이하)");
    const H = ok.rasters.reduce((a, x) => a + x.h, 0);
    assert.ok(H >= 60 && H <= 100, `위아래 띠 두 장 높이 합 ${H}점 (9600bps 에서 빨리)`);
    assert.match(ok.text, /\[ 수제돈까스 무료 증정 \]/, "쿠폰 글은 프린터 글자로 (띠 사이)");
    // 순서: 위 띠 그림 → 쿠폰 글 → 아래 띠 그림
    const iGift = r.ok.findIndex((p) => p.t && p.t.includes("무료 증정")), iR = r.ok.map((p, i) => (p.r ? i : -1)).filter((i) => i >= 0);
    assert.ok(iR[0] < iGift && iR[iR.length - 1] > iGift, "띠 · 글 · 띠 순서 " + JSON.stringify({ iGift, iR }));
    assert.ok(iR.some((i) => i > iGift) && iR.some((i) => i < iGift));
    assert.match(ok.text, /재방문 이벤트 성공!/, "2번 성공 글은 그대로 글자");
    assert.match(ok.text, /또 드려요/);
    // 안내(1번): 쿠폰 없음 → 그림 없음
    assert.strictEqual(guide.rasters.length, 0);
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
      const key = T.SEAL.key; T.SEAL.key = "0123456789abcdef0123456789abcdef"; T.sealClear();
      const c = T.sealOf(mk("2026-10-05")).url;
      T.SEAL.key = key; T.sealClear();
      const bot = T.sealOf({ k: "seal", part: "bot", meta: { day: "2026-10-05" } });
      return { same: a === a2, day: a !== b, key: a !== c, keyLen: key.length, botDiff: bot.url !== a, rows: [T.sealOf(mk("2026-10-05")).h, bot.h] };
    });
    assert.ok(same.rows.every((h) => h >= 30 && h <= 48), "띠 한 장 높이 " + same.rows);
    delete same.rows;
    assert.deepStrictEqual(same, { same: true, day: true, key: true, keyLen: 32, botDiff: true });
    assert.match(await page.evaluate(() => localStorage.getItem("astanakiz-sealkey")), /^[0-9a-f]{32}$/, "체험판 비밀값은 이 브라우저에 (앱은 이 PC 설정에)");

    // 운영 설정 → 방문 이벤트 → 2번 성공 미리보기에 그림 · [쿠폰 보안 무늬] 끄면 글자
    await page.click("text=운영 설정");
    await page.click('[data-t="event"]');
    await page.click("[data-act=evTpl][data-i='1']");
    assert.strictEqual(await page.$eval("#ev-paper .seal img", (im) => im.naturalWidth), 576);
    assert.ok(await page.isChecked("#ev-seal"), "처음엔 켜짐");
    await page.uncheck("#ev-seal");
    assert.strictEqual(await page.$("#ev-paper .seal img"), null);
    assert.match(await page.textContent("#ev-paper"), /\[ 수제돈까스 무료 증정 \]/);
    assert.strictEqual(JSON.parse(await page.evaluate(() => localStorage.getItem("astanakiz-visitevent"))).seal, false, "설정에 저장");
    const off = parse(await page.evaluate(() => { const T = window.__deskTest; return T.escposParts(T.form(), T.evSample(1), true); }));
    assert.strictEqual(off.rasters.length, 0, "끄면 그림 없음");
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
    assert.ok(parse(r.ok).rasters.length >= 1, "성공 손님 입장권에 보안 무늬");
    assert.strictEqual(parse(r.first).rasters.length, 0, "처음 온 손님(안내)은 쿠폰 없음");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("사장님 양식: 공통 양식 맨 앞 [사은품] → 제공상품(교환권)이 먼저 그림으로 · [자르기] · 그 뒤 입장권은 글자 (2번 성공 글은 글자 그대로)", async () => {
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
      const seq = parts.map((x) => (x.r ? "그림" : x.t ? x.t.trim() : x.b && x.b.length === 9 && x.b[7] === 0x56 ? "자르기" : null)).filter((x, i, a) => x != null && x !== "" && !(x === "그림" && a[i - 1] === "그림")); // 그림 조각들은 하나로
      const bytes = parts.reduce((a, p) => a + (p.r ? atob(p.r).length : p.b ? p.b.length : p.t ? [...p.t].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x7f ? 2 : 1), 0) : 0), 0);
      const P = T.PRINT_(); P.port = "COM1"; P.baud = 9600;
      return { seq, bytes, secs9600: T.printSecs(T.form(), v), docs: T.receiptDocs(T.form(), v).map((d) => (d.includes('class="pl seal') ? "그림" : "글자")) };
    });
    // 위 띠 그림 → 교환권 글(프린터 글자) → 아래 띠 그림 → 자르기 → 입장권
    assert.strictEqual(r.seq[0], "그림", "교환권 맨 앞은 위 띠");
    const iCut = r.seq.indexOf("자르기");
    assert.strictEqual(r.seq[iCut - 1], "그림", "아래 띠 바로 뒤 자르기");
    assert.deepStrictEqual(r.seq.slice(1, iCut - 1).filter((x) => !/^=+$/.test(x)), ["수제한돈까스", "1EA 교환권", "분실 시 이벤트 교환권 재발행 불가합니다.", "당일 준비량이 소진 되었을 수 있습니다.", "본 사은권의 사용기한은 없습니다."], "가운데는 사장님이 쓴 그대로 글자");
    assert.strictEqual(r.seq.filter((x) => x === "그림").length, 2, "그림은 위아래 띠 두 장");
    assert.ok(r.bytes < 8500 && r.secs9600 < 10, "9600bps 에서 10초 안 " + JSON.stringify([r.bytes, r.secs9600]));
    const rest = r.seq.slice(iCut + 1).join("\n");
    assert.match(rest, /재방문 이벤트 성공!/, "2번 성공은 입장권 안에 글자로");
    assert.doesNotMatch(rest, /수제한돈까스|교환권 재발행/, "교환권 글은 그림 안에만");
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
    assert.ok(r.fast > 0.3 && r.fast < 3, "115200bps 쿠폰 띠 (조각마다 기다림 포함) " + r.fast);
    assert.ok(r.slow > 3 && r.slow < 10, "9600bps 도 10초 안 (위아래 띠만 그림) " + r.slow);
    assert.ok(r.text < 3 && r.guide < 3, "글만이면 금방 " + JSON.stringify(r));
    assert.strictEqual(r.win, 0, "Windows 프린터는 어림 없음");
    // 체험판 [2번 성공으로 시험 출력]: 걸리는 초를 알려 줌
    await page.click("text=운영 설정");
    await page.click('[data-t="event"]');
    await page.click("[data-act=evTpl][data-i='1']");
    await page.click("[data-act=evTest]");
    assert.match(await page.textContent("#toast"), /시험 출력 \(COM1 · 9600, 체험\) \(쿠폰 그림이라 \d+초쯤 걸려요\)/);
    assert.strictEqual(await page.$$eval("#ev-paper .seal img", (a) => a.length), 2, "미리보기도 위아래 띠 두 장");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
