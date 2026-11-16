/* 재방문 안내 → 네이버 톡톡 보내기 (사장님 11/16 화면 사진 순서)
   스마트플레이스 [고객] → 예약·주문 → 검색 선택 '전화번호' → 뒷번호 4자리 → 목록에서 맞추기 → 고객 카드 확인 → [톡톡 대화하기] 새 창 → 글 · 사진
   가짜 화면(mock/smartplace.html · talkchat.html)의 손님은 모두 지어낸 이름 · 번호 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { TalkSend, pickRow, cardOk, nameLike } = require("../src/naver-talksend");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  ({ chromium } = require("/opt/node-tools/node_modules/playwright"));
}
const SP = "file://" + path.join(__dirname, "..", "mock", "smartplace.html");
const launch = () => chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});

test("nameLike · pickRow · cardOk: 번호가 보이면 번호로 · 가려진 줄은 이름 모양 + 뒷번호가 하나일 때만", () => {
  assert.ok(nameLike("유*석", "유민석"));
  assert.ok(nameLike("남궁*진", "남궁민진"));
  assert.ok(!nameLike("유*석", "유석"), "길이가 다르면 아님");
  assert.ok(!nameLike("유*석", "류민석"));
  assert.ok(nameLike("김가람", "김가람") && !nameLike("김가람", "김가란"));
  const rows = [
    { name: "김가람", phone: "010-3000-1313" },
    { name: "유*석", phone: "***-****-1313" },
    { name: "정*림", phone: "***-****-1313" },
    { name: "정*림", phone: "***-****-1313" },
    { name: "나단비", phone: "010-3300-2424" },
    { name: "나*비", phone: "***-****-2424" },
  ];
  assert.deepStrictEqual(pickRow(rows, { name: "김가람", phone: "01030001313" }), { i: 0, how: "번호" });
  assert.deepStrictEqual(pickRow(rows, { name: "김가람 ", phone: "010-3000-1313" }), { i: 0, how: "번호" }, "이름이 조금 달라도 번호가 다 같으면 그 사람");
  assert.deepStrictEqual(pickRow(rows, { name: "유민석", phone: "010-3100-1313" }), { i: 1, how: "가린 번호 · 이름" });
  assert.match(pickRow(rows, { name: "정수림", phone: "010-3400-1313" }).why, /2명/, "정*림 둘 → 건너뜀");
  assert.deepStrictEqual(pickRow(rows, { name: "나단비", phone: "010-3300-2424" }), { i: 4, how: "번호" }, "번호가 다 보이는 줄이 먼저 (가린 '나*비'보다)");
  assert.deepStrictEqual(pickRow(rows, { name: "나보비", phone: "010-3600-2424" }), { i: 5, how: "가린 번호 · 이름" });
  assert.match(pickRow(rows, { name: "박하나", phone: "010-1111-1313" }).why, /못 찾음/);
  assert.match(pickRow([], { name: "박하나", phone: "010-1111-7777" }).why, /찾은 사람이 없음/);
  assert.match(pickRow(rows, { name: "박하나", phone: "1313" }).why, /전화번호/);
  // 카드
  assert.ok(cardOk({ name: "김가람", phone: "010-3000-1313" }, { name: "김가람", phone: "01030001313" }).ok);
  assert.match(cardOk({ name: "김가람", phone: "010-3000-1314" }, { name: "김가람", phone: "01030001313" }).why, /전화번호가 다름/);
  assert.ok(cardOk({ name: "유*석", phone: "***-****-1313" }, { name: "유민석", phone: "01031001313" }).ok);
  assert.match(cardOk({ name: "정*림", phone: "***-****-1313" }, { name: "유민석", phone: "01031001313" }).why, /이름이 다름/);
  assert.match(cardOk({ name: "", phone: "***-****-1313" }, { name: "유민석", phone: "01031001313" }).why, /확인할 수 없음/);
  assert.match(cardOk(null, { name: "유민석", phone: "01031001313" }).why, /카드가 안 뜸/);
});

/** 가짜 스마트플레이스 처음 화면(?home=1)에서 TalkSend */
async function open(browser, extra = "") {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const page = await ctx.newPage();
  await page.goto(SP + "?home=1" + extra);
  await page.evaluate(() => { localStorage.removeItem("mockTalkSent"); localStorage.removeItem("mockSpData"); });
  const steps = [], pops = [];
  const ts = new TalkSend((code) => page.evaluate(code), {
    home: SP + "?home=1" + extra,
    go: (u) => page.goto(u),
    popup: async () => {
      const p = await page.waitForEvent("popup", { timeout: 15000 });
      await p.waitForLoadState();
      pops.push(p.url());
      return { exec: (c) => p.evaluate(c), setFile: (sel, f) => p.setInputFiles(sel, f), close: () => p.close() };
    },
    onStep: (t) => steps.push(t),
  });
  const sent = () => page.evaluate(() => JSON.parse(localStorage.getItem("mockTalkSent") || "[]"));
  return { ctx, page, ts, steps, pops, sent };
}
const IMG = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tsend-")), "재방문안내_D-5_2026-11-16.jpg");
fs.writeFileSync(IMG, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 0xff, 0xd9]));
/** 한글 이름 파일은 영문 이름 복사본으로 넣음 (브라우저가 한글 경로를 못 읽는 언어 설정이 있음 — 이 시험 환경도 그럼) */
const SENT_NAME = "astanakiz-" + require("crypto").createHash("sha256").update(path.basename(IMG)).digest("hex").slice(0, 8) + ".jpg";
const TEXT = "(광고) 아스타나키즈\n돈까스까지 5일 남았어요\n무료 수신거부 080-000-0000";

test("확인만: 메뉴 [고객] → 전화번호로 → 뒷번호 → 맞춤 → 카드 → 대화창이 열리고 글 칸 · 전송 · 사진 칸 확인 · 아무것도 안 보냄", async () => {
  const browser = await launch();
  try {
    const { page, ts, steps, pops, sent } = await open(browser);
    const r = await ts.one({ name: "김가람", phone: "010-3000-1313", text: TEXT, image: IMG }, true);
    assert.deepStrictEqual(r, { ok: true, dry: true, step: "확인만", how: "이름 · 고객 정보 번호", chat: { input: true, send: true, file: true } }, JSON.stringify({ r, steps }));
    assert.strictEqual(pops.length, 1);
    assert.match(pops[0], /talkchat\.html\?u=c1&frm=prsv&mode=popup/, "김가람 대화창");
    assert.deepStrictEqual(await sent(), [], "확인만은 안 보냄");
    const u = new URL(page.url());
    assert.strictEqual(u.searchParams.get("type"), "전화번호", "검색 선택이 전화번호");
    assert.strictEqual(u.searchParams.get("q"), "1313", "뒷번호 4자리로 찾음");
    assert.strictEqual(u.searchParams.get("sel"), "c1");
    assert.strictEqual(browser.contexts()[0].pages().length, 1, "대화창은 닫힘");
  } finally {
    await browser.close();
  }
});

test("보내기: 글([전송]) → 사진(파일 고르기 창 없이 사진 칸에 바로) · 가려진 손님(유*석)은 이름 모양 + 뒷번호로", async () => {
  const browser = await launch();
  try {
    const { ts, steps, sent } = await open(browser);
    const r = await ts.one({ name: "김가람", phone: "010-3000-1313", text: TEXT, image: IMG }, false);
    assert.deepStrictEqual(r, { ok: true, step: "보냄", how: "이름 · 고객 정보 번호", sent: { text: true, image: true } }, JSON.stringify({ r, steps }));
    const r2 = await ts.one({ name: "유민석", phone: "010-3100-1313", text: TEXT, image: IMG }, false);
    assert.deepStrictEqual(r2, { ok: true, step: "보냄", how: "가린 이름 · 뒷번호", sent: { text: true, image: true } }, JSON.stringify({ r2, steps }));
    const s = (await sent()).map(({ u, kind, text, file }) => [u, kind, kind === "text" ? text : file]);
    assert.deepStrictEqual(s, [
      ["c1", "text", TEXT.replace(/\s+$/, "")],
      ["c1", "image", SENT_NAME],
      ["c2", "text", TEXT],
      ["c2", "image", SENT_NAME],
    ]);
  } finally {
    await browser.close();
  }
});

test("여러 사람: 같은 이름 모양이 둘 · 톡톡 단추 없음 · 네이버에 없음은 건너뛰고 나머지는 보냄 · 번호가 보이는 줄이 가려진 줄보다 먼저", async () => {
  const browser = await launch();
  try {
    const { ts, sent } = await open(browser);
    const each = [];
    const jobs = [
      { key: "a", name: "정수림", phone: "010-3400-1313", text: TEXT, image: IMG },
      { key: "b", name: "톡없음", phone: "010-3700-5555", text: TEXT, image: IMG },
      { key: "c", name: "박하나", phone: "010-1111-8888", text: TEXT, image: IMG },
      { key: "d", name: "나단비", phone: "010-3300-2424", image: IMG },
      { key: "e", name: "나보비", phone: "010-3600-2424", image: IMG },
    ];
    const out = await ts.run(jobs, { each: (j, r) => each.push(j.key) });
    assert.deepStrictEqual(each, ["a", "b", "c", "d", "e"]);
    const brief = out.map((r) => [r.key, r.ok, r.skip || false, r.how || r.why]);
    assert.deepStrictEqual(brief.map((x) => x.slice(0, 3)), [["a", false, true], ["b", false, true], ["c", false, true], ["d", true, false], ["e", true, false]], JSON.stringify(out));
    assert.match(brief[0][3], /이름 · 뒷번호가 같은 사람이 2명/);
    assert.match(brief[1][3], /톡톡 대화하기\]가 없는/);
    assert.match(brief[2][3], /찾은 사람이 없음/);
    assert.deepStrictEqual([brief[3][3], brief[4][3]], ["이름 · 고객 정보 번호", "가린 이름 · 뒷번호"]);
    assert.deepStrictEqual((await sent()).map((x) => [x.u, x.kind]), [["c6", "image"], ["c7", "image"]], "나단비 · 나보비에게 사진만 (글 없으면 사진만)");
  } finally {
    await browser.close();
  }
});

test("멈춤: 대화창이 안 열리면(새 창 없음) 거기서 멈추고 다음 사람은 하지 않음 · stop() 이면 시작 전에 멈춤", async () => {
  const browser = await launch();
  try {
    const { page, ts } = await open(browser);
    await page.evaluate(() => { window.open = () => null; }); // 처음 화면에서 막아도 다시 열리면 풀리므로 init 스크립트로
    await page.context().addInitScript(() => { window.open = () => null; });
    ts.opts.popup = () => page.waitForEvent("popup", { timeout: 2500 }).then(() => null);
    const out = await ts.run([
      { key: "a", name: "김가람", phone: "010-3000-1313", image: IMG },
      { key: "b", name: "나단비", phone: "010-3300-2424", image: IMG },
    ]);
    assert.strictEqual(out.length, 1, "첫 사람에서 멈춤");
    assert.deepStrictEqual([out[0].ok, out[0].skip, out[0].step], [false, undefined, "대화창"]);
    assert.match(out[0].why, /대화창\(새 창\)이 안 열림/);
    const none = await ts.run([{ key: "a", name: "김가람", phone: "010-3000-1313" }], { stop: () => true });
    assert.deepStrictEqual(none, []);
  } finally {
    await browser.close();
  }
});

/* 데스크 재방문 안내 창: [확인만 해 보기] · [톡톡으로 보내기 n명](한 번 더 눌러야) · 진행 · 줄마다 결과 · 보낸 사람은 '보냄 톡톡 hh:mm' */
const DESK = "file://" + path.join(__dirname, "..", "..", "..", "prototype", "desk.html");
const line = (k, name, day, n, st, due, no) => JSON.stringify({ k, name, phone: k, n, base: 3, no, at: `${day} 11:00`, day, st, due });
const LEDGER = [
  line("01011110001", "가손님", "2026-11-03", 4, "안내", "2026-11-23", "a1"), // D-8
  line("01011110002", "나손님", "2026-10-27", 4, "안내", "2026-11-16", "b1"),
  line("01011110002", "나손님", "2026-11-03", 5, "성공", "2026-11-23", "b2"), // D-8
  line("01011110003", "다손님", "2026-11-03", 4, "안내", "2026-11-23", "c1"),
  line("01011110003", "다손님", "2026-11-15", 5, "성공", "2026-11-30", "c2"), // 오늘 옴 → 안 보냄
  line("01011110006", "바손님", "2026-10-27", 4, "안내", "2026-11-23", "f1"), // D-8 (영수증 기한)
].join("\n") + "\n";
async function openDesk(browser, optout = "무료수신거부 080-000-0000") {
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await page.clock.install({ time: new Date("2026-11-15T10:00:00") }); // 앱은 이 PC 날짜가 오늘
  await page.addInitScript(([led, optout]) => {
    window.__today = "2026-11-15";
    if (!localStorage.getItem("astanakiz-visitlog-2026-10-26")) {
      localStorage.setItem("astanakiz-visitevent", JSON.stringify({ ver: 2, on: true, from: "2026-10-26", to: "2026-11-30", days: 20, gift: "수제돈까스", optout }));
      localStorage.setItem("astanakiz-visitlog-2026-10-26", led);
    }
    window.__runs = []; window.__saves = []; window.__cb = {};
    const cfg = { build: "2.23", visitEvent: { ver: 2, on: true, from: "2026-10-26", to: "2026-11-30", days: 20, gift: "수제돈까스", optout } }; // 앱은 이벤트 설정을 앱 설정에서
    window.desk = {
      naver: { load: async (day) => ({ ok: true, day, slots: [], bookings: [] }), complete: async () => ({ ok: true }) },
      state: { load: () => null, save: () => {} },
      config: { get: async () => cfg, set: async (p) => { Object.assign(cfg, p); return { ok: true }; } },
      revImg: { save: async (j) => { window.__saves.push(j.name); return { ok: true }; } },
      talkSend: {
        run: async (req) => { window.__runs.push(JSON.parse(JSON.stringify(req))); return { ok: true, job: { running: true, dry: !!req.dry, at: "2026-11-15 10:00", total: req.list.length, step: "", why: "", results: [] } }; },
        status: async () => ({ ok: true, job: null }),
        stop: async () => ({ ok: true, job: null }),
        setHome: async () => ({ ok: true }),
        onProgress: (cb) => { window.__cb.progress = cb; },
        onDone: (cb) => { window.__cb.done = cb; },
      },
    };
  }, [LEDGER, optout]);
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(DESK);
  await page.waitForTimeout(300);
  return { page, errs };
}
const rowsOf = (page) => page.$$eval("#sheet .rvrow", (e) => e.map((r) => [...r.children].map((c) => c.textContent.trim()).filter(Boolean).join(" | ")));

test("데스크: 확인만 해 보기 → 진행 → 줄마다 맞춘 방법 · 보내기는 한 번 더 눌러야 → 보낸 사람 '보냄 톡톡' · 건너뜀 · 글만 보냄", async () => {
  const browser = await launch();
  try {
    const { page, errs } = await openDesk(browser);
    await page.click("#rev-btn");
    const bar = () => page.$eval("#rt-bar", (e) => [...e.children].map((c) => c.textContent.replace(/\s+/g, " ").trim()).filter(Boolean).join(" "));
    assert.match(await bar(), /확인만 해 보기 톡톡으로 보내기 3명/);
    // 확인만
    await page.click("#rt-bar [data-act=rtRun][data-dry]");
    await page.waitForFunction(() => window.__runs.length === 1);
    const r1 = await page.evaluate(() => window.__runs[0]);
    assert.strictEqual(r1.dry, true);
    assert.deepStrictEqual(r1.list, [
      { key: "8|01011110001", name: "가손님", phone: "01011110001", left: 8 },
      { key: "8|01011110002", name: "나손님", phone: "01011110002", left: 8 },
      { key: "8|01011110006", name: "바손님", phone: "01011110006", left: 8 },
    ], "오늘 온 다손님은 빼고 · 기한 8일 남은 사람");
    assert.match(r1.text[8], /^\(광고\) 아스타나키즈\n고객님 아직 7일 남았습니다\. 7일 안에 방문하셔서 수제돈까스 받아가세요\.[\s\S]*무료수신거부 080-000-0000$/);
    assert.deepStrictEqual(Object.keys(r1.text), ["8"]);
    assert.deepStrictEqual(await page.evaluate(() => window.__saves), ["재방문안내_D-8_2026-11-15.jpg"], "그날 안내 이미지를 먼저 바탕화면 폴더에");
    assert.match(await bar(), /네이버 톡톡 확인 중 0\/3 멈추기/);
    const job = (o) => Object.assign({ running: false, dry: true, at: "2026-11-15 10:00", total: 3, step: "", why: "", end: "2026-11-15 10:02", results: [] }, o);
    await page.evaluate((j) => window.__cb.progress({ ok: true, job: j }), job({ running: true, step: "가손님: 뒷번호 0001 검색", end: undefined, results: [{ key: "8|01011110001", name: "가손님", at: "10:01", ok: true, skip: false, step: "확인만", how: "번호", why: "" }] }));
    assert.match(await bar(), /확인 중 1\/3 가손님: 뒷번호 0001 검색/);
    await page.evaluate((j) => window.__cb.done({ ok: true, job: j }), job({ results: [
      { key: "8|01011110001", name: "가손님", at: "10:01", ok: true, skip: false, step: "확인만", how: "번호", why: "" },
      { key: "8|01011110006", name: "바손님", at: "10:01", ok: false, skip: true, step: "맞추기", how: "", why: "가려진 손님 중 이름 · 뒷번호가 같은 사람이 2명 — 근무자가 확인" },
      { key: "8|01011110002", name: "나손님", at: "10:02", ok: true, skip: false, step: "확인만", how: "가린 번호 · 이름", why: "" },
    ] }));
    let rows = await rowsOf(page);
    assert.match(rows[0], /가손님 .* 직접 보냄 표시 \| 톡톡 확인 ✓ 번호로 맞춤 \(안 보냄\)$/);
    assert.match(rows[2], /바손님 .* 직접 보냄 표시 \| 톡톡 확인: 가려진 손님 중 이름 · 뒷번호가 같은 사람이 2명/);
    assert.match(rows[1], /나손님 .* 직접 보냄 표시 \| 톡톡 확인 ✓ 가린 번호 · 이름으로 맞춤/);
    assert.match(await bar(), /톡톡으로 보내기 3명 지난번: 확인만 2명 · 건너뜀 1명 \(10:02\)/, "확인만은 '보냄'으로 안 바꿈");
    // 보내기: 한 번 누르면 묻기만
    await page.click("#rt-bar [data-act=rtRun]:not([data-dry])");
    assert.match(await bar(), /한 번 더 누르면 3명에게 보내요/);
    assert.strictEqual(await page.evaluate(() => window.__runs.length), 1, "아직 안 보냄");
    await page.click("#rt-bar [data-act=rtRun]:not([data-dry])");
    await page.waitForFunction(() => window.__runs.length === 2);
    assert.strictEqual(await page.evaluate(() => window.__runs[1].dry), false);
    await page.evaluate((j) => window.__cb.done({ ok: true, job: j }), job({ dry: false, at: "2026-11-15 10:05", end: "2026-11-15 10:07", why: "나손님: 사진이 대화창에 안 보임", results: [
      { key: "8|01011110001", name: "가손님", at: "10:05", ok: true, skip: false, step: "보냄", how: "번호", why: "", sent: { text: true, image: true } },
      { key: "8|01011110006", name: "바손님", at: "10:06", ok: false, skip: true, step: "맞추기", how: "", why: "가려진 손님 중 이름 · 뒷번호가 같은 사람이 2명 — 근무자가 확인" },
      { key: "8|01011110002", name: "나손님", at: "10:07", ok: false, skip: false, step: "사진", how: "", why: "사진이 대화창에 안 보임", sent: { text: true } },
    ] }));
    rows = await rowsOf(page);
    assert.match(rows[0], /가손님 .* 톡톡 보냄 ✓ 10:05$/, "보낸 사람 = 톡톡 보냄 ✓ hh:mm");
    assert.match(rows[2], /바손님 .* \| 직접 보냄 표시 \| 톡톡 건너뜀: 가려진 손님 중 .* — 번호 복사로 직접$/);
    assert.match(rows[1], /나손님 .* \| 직접 보냄 표시 \| 톡톡 글만 보냄 — 사진은 직접 \(사진이 대화창에 안 보임\)$/);
    assert.match(await bar(), /톡톡으로 보내기 2명 지난번: 보냄 1명 · 건너뜀 1명 · 멈춤: 나손님: 사진이 대화창에 안 보임 \(10:07\)/);
    assert.strictEqual((await page.textContent("#rev-btn")).trim(), "재방문 안내2", "남은 사람 2");
    // 다시 그려도(같은 결과가 또 와도) 근무자가 푼 '보냄'은 되살리지 않음
    await page.click("#sheet .rvrow >> nth=0 >> [data-act=revSentT]");
    await page.evaluate((j) => window.__cb.progress({ ok: true, job: j }), job({ dry: false, at: "2026-11-15 10:05", end: "2026-11-15 10:07", results: [{ key: "8|01011110001", name: "가손님", at: "10:05", ok: true, skip: false, step: "보냄", how: "번호", why: "" }] }));
    assert.match((await rowsOf(page))[0], /\| 직접 보냄 표시$/);
    // 운영 설정 → 재방문 이벤트: 톡톡 자동알림 기록 (그날 대상 · 사람마다 결과 · 이름 + 뒷번호 4자리)
    await page.click("#sheet [data-act=close]");
    await page.dblclick("#now");
    await page.click("[data-t=event]");
    const sum = await page.$eval(".rtlogs details summary", (e) => e.textContent.replace(/\s+/g, " ").trim());
    assert.match(sum, /대상 4명 \(D-8 4\) 성공 1 · 글만 1 · 건너뜀 1 · 보낸 때 직접 10:05/, "보낸 때 = 시작 시각");
    const logRows = await page.$$eval(".rtlogs .rtlrow", (e) => e.map((r) => [...r.children].map((c) => c.textContent.trim()).filter(Boolean).join(" | ")));
    assert.deepStrictEqual(logRows, [
      "가손님 | 뒷번호 0001 | D-8 | 성공 10:05",
      "나손님 | 뒷번호 0002 | D-8 | 글만 10:07 | 사진이 대화창에 안 보임",
      "바손님 | 뒷번호 0006 | D-8 | 건너뜀 10:06 | 가려진 손님 중 이름 · 뒷번호가 같은 사람이 2명 — 근무자가 확인",
      "다손님 | 뒷번호 0003 | D-8 | 오늘 방문",
    ], "근무자가 '보냄'을 풀어도 톡톡 성공은 그대로");
    const raw = await page.evaluate(() => localStorage.getItem("astanakiz-revtalklog"));
    assert.ok(!/0101111000\d/.test(raw), "전화번호 전체는 안 남김");
    // 근무자가 바손님에게 문자로 보내고 '보냄' → 기록은 '직접' (톡톡 건너뜀 까닭은 남김)
    await page.click("#sheet [data-act=close]");
    await page.click("#rev-btn");
    await page.click("#sheet .rvrow >> nth=2 >> [data-act=revSentT]");
    await page.click("#sheet [data-act=close]");
    await page.dblclick("#now");
    await page.click("[data-t=event]");
    assert.match((await page.$$eval(".rtlogs .rtlrow", (e) => e.map((r) => [...r.children].map((c) => c.textContent.trim()).join(" "))))[2], /바손님 뒷번호 0006 D-8 직접 10:0\d 톡톡 건너뜀: 가려진 손님/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("데스크: 수신거부 안내가 없으면 [톡톡으로 보내기]는 막힘 (확인만은 됨) · 체험판(앱 아님)은 안내만", async () => {
  const browser = await launch();
  try {
    const { page } = await openDesk(browser, "");
    await page.click("#rev-btn");
    assert.strictEqual(await page.$eval("#rt-bar [data-act=rtRun]:not([data-dry])", (b) => b.disabled), true);
    assert.strictEqual(await page.$eval("#rt-bar [data-act=rtRun][data-dry]", (b) => b.disabled), false);
    const p2 = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await p2.addInitScript((led) => {
      window.__today = "2026-11-15";
      localStorage.setItem("astanakiz-visitevent", JSON.stringify({ ver: 2, on: true, from: "2026-10-26", to: "2026-11-30", days: 20, gift: "수제돈까스", optout: "무료수신거부 080-000-0000" }));
      localStorage.setItem("astanakiz-visitlog-2026-10-26", led);
    }, LEDGER);
    await p2.goto(DESK);
    await p2.waitForTimeout(300);
    await p2.click("#rev-btn");
    assert.match(await p2.$eval("#rt-bar", (e) => e.textContent), /현장 POS 앱에서 \[톡톡으로 보내기\]/);
    assert.strictEqual(await p2.$$eval("#rt-bar button", (b) => b.length), 0);
  } finally {
    await browser.close();
  }
});

test("매일 자동으로 보내기: 켜 두면 정한 시각(11:00) 뒤 한 번 — 아직 안 보낸 사람에게 · 그날 다시 안 함 · 기록에 (자동)", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await page.clock.install({ time: new Date("2026-11-15T10:58:00") });
    await page.addInitScript((led) => {
      if (!localStorage.getItem("astanakiz-visitlog-2026-10-26")) localStorage.setItem("astanakiz-visitlog-2026-10-26", led);
      window.__runs = []; window.__cb = {};
      const cfg = { build: "2.23", revTalkAuto: { on: true, at: "11:00" }, visitEvent: { ver: 2, on: true, from: "2026-10-26", to: "2026-11-30", days: 20, gift: "수제돈까스", optout: "무료수신거부 080-000-0000" } };
      window.desk = {
        naver: { load: async (day) => ({ ok: true, day, slots: [], bookings: [] }), complete: async () => ({ ok: true }) },
        state: { load: () => null, save: () => {} },
        config: { get: async () => cfg, set: async (p) => { Object.assign(cfg, p); return { ok: true }; } },
        revImg: { save: async () => ({ ok: true }) },
        talkSend: {
          run: async (req) => { window.__runs.push(JSON.parse(JSON.stringify(req))); return { ok: true, job: { running: true, dry: false, auto: !!req.auto, at: "2026-11-15 11:00", total: req.list.length, step: "", why: "", results: [] } }; },
          status: async () => ({ ok: true, job: null }), stop: async () => ({ ok: true, job: null }), setHome: async () => ({ ok: true }),
          onProgress: (cb) => { window.__cb.progress = cb; }, onDone: (cb) => { window.__cb.done = cb; },
        },
      };
    }, LEDGER);
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    await page.clock.runFor(60000); // 10:59
    assert.strictEqual(await page.evaluate(() => window.__runs.length), 0, "시각 전에는 안 함");
    await page.clock.runFor(62000); // 11:00
    await page.waitForFunction(() => window.__runs.length === 1);
    const r = await page.evaluate(() => window.__runs[0]);
    assert.deepStrictEqual([r.dry, r.auto, r.list.map((x) => x.name)], [false, true, ["가손님", "나손님", "바손님"]]);
    await page.evaluate(() => window.__cb.done({ ok: true, job: { running: false, dry: false, auto: true, at: "2026-11-15 11:00", end: "2026-11-15 11:02", total: 3, step: "", why: "", results: [
      { key: "8|01011110001", name: "가손님", at: "11:01", ok: true, skip: false, step: "보냄", how: "번호", why: "", sent: { text: true, image: true } },
      { key: "8|01011110006", name: "바손님", at: "11:01", ok: true, skip: false, step: "보냄", how: "가린 번호 · 이름", why: "", sent: { text: true, image: true } },
      { key: "8|01011110002", name: "나손님", at: "11:02", ok: false, skip: true, step: "맞추기", how: "", why: "네이버 고객에서 뒷번호로 찾은 사람이 없음" },
    ] } }));
    await page.clock.runFor(10 * 60000);
    assert.strictEqual(await page.evaluate(() => window.__runs.length), 1, "그날 한 번만 (건너뛴 사람이 남아도)");
    assert.strictEqual((await page.textContent("#rev-btn")).trim(), "재방문 안내1");
    await page.dblclick("#now");
    await page.click("[data-t=event]");
    assert.match(await page.textContent("#rt-auto"), /매일 자동으로 보내기 켜짐[\s\S]*매일 11:00 뒤 한 번/);
    assert.match(await page.$eval(".rtlogs details summary", (e) => e.textContent.replace(/\s+/g, " ")), /대상 4명 \(D-8 4\) 성공 2 · 건너뜀 1 · 보낸 때 자동 11:00/);
    assert.match((await page.$$eval(".rtlogs .rtlrow", (e) => e.map((r) => [...r.children].map((c) => c.textContent.trim()).join(" "))))[0], /가손님 뒷번호 0001 D-8 성공 11:01 \(자동\)/);
    // 끄기 → 저장
    await page.click("[data-act=rtAutoToggle]");
    assert.deepStrictEqual(await page.evaluate(() => window.desk.config.get().then((c) => c.revTalkAuto)), { on: false, at: "11:00" });
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("기준이 바뀐 날(5일 · 3일 → 8일): 아침에 적힌 5일 · 3일 줄은 기록에서 빠짐(보낸 줄은 남김) · 안내 글도 8일 · 수신거부 안내가 없으면 자동은 기다렸다가 넣은 뒤 그날 보냄", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await page.clock.install({ time: new Date("2026-11-15T10:58:00") });
    await page.addInitScript((led) => {
      if (!localStorage.getItem("astanakiz-visitlog-2026-10-26")) {
        localStorage.setItem("astanakiz-visitlog-2026-10-26", led);
        // 2.23 이 아침에 적은 기록 (5일 · 3일 기준)
        localStorage.setItem("astanakiz-revtalklog", JSON.stringify({ "2026-11-15": { t: { 5: 2, 3: 1 }, p: { "5|aa": { n: "옛손님가", d: "1111", l: 5, s: "안 보냄", w: "", at: "" }, "5|bb": { n: "옛손님나", d: "2222", l: 5, s: "성공", w: "", at: "09:10" }, "3|cc": { n: "옛손님다", d: "3333", l: 3, s: "오늘 방문", w: "", at: "" } }, runs: [] } }));
      }
      window.__runs = []; window.__cb = {};
      const cfg = { build: "2.24", revTalkAuto: { on: true, at: "11:00" }, visitEvent: { ver: 2, on: true, from: "2026-10-26", to: "2026-11-30", days: 20, gift: "수제돈까스", optout: "" } };
      window.desk = {
        naver: { load: async (day) => ({ ok: true, day, slots: [], bookings: [] }), complete: async () => ({ ok: true }) },
        state: { load: () => null, save: () => {} },
        config: { get: async () => cfg, set: async (p) => { Object.assign(cfg, p); return { ok: true }; } },
        revImg: { save: async () => ({ ok: true }) },
        talkSend: {
          run: async (req) => { window.__runs.push(JSON.parse(JSON.stringify(req))); return { ok: true, job: { running: true, dry: false, auto: !!req.auto, at: "2026-11-15 11:00", total: req.list.length, step: "", why: "", results: [] } }; },
          status: async () => ({ ok: true, job: null }), stop: async () => ({ ok: true, job: null }), setHome: async () => ({ ok: true }),
          onProgress: (cb) => { window.__cb.progress = cb; }, onDone: (cb) => { window.__cb.done = cb; },
        },
      };
    }, LEDGER);
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    await page.clock.runFor(3 * 60000); // 11:01 — 수신거부 안내가 없어 기다림
    assert.strictEqual(await page.evaluate(() => window.__runs.length), 0, "수신거부 안내가 없으면 안 보냄");
    await page.dblclick("#now");
    await page.click("[data-t=event]");
    assert.match(await page.textContent("#rt-auto"), /기한 8일 남은 손님\(손님께는 '7일'\) 중 아직 안 보낸 사람에게/);
    assert.ok(!/D-5 · D-3/.test(await page.textContent("#rt-auto")));
    assert.match(await page.textContent("#rt-auto"), /수신거부 안내가 있어야 보내요/);
    const sum = await page.$eval(".rtlogs details summary", (e) => e.textContent.replace(/\s+/g, " "));
    assert.match(sum, /대상 5명 \(D-8 4\) 성공 1 /, "5일 · 3일 '안 보냄' · '오늘 방문' 줄은 빠지고 보낸 줄(옛손님나)은 남음");
    const names = await page.$$eval(".rtlogs .rtlrow b", (e) => e.map((x) => x.textContent));
    assert.ok(names.includes("옛손님나") && !names.includes("옛손님가") && !names.includes("옛손님다"), names.join());
    // 수신거부 안내를 넣으면 그날 안에 한 번
    await page.fill("#ev-optout", "무료수신거부 080-000-0000");
    await page.click("#sheet [data-act=close]");
    await page.clock.runFor(3000);
    await page.waitForFunction(() => window.__runs.length === 1);
    const run = await page.evaluate(() => window.__runs[0]);
    assert.deepStrictEqual([run.auto, run.list.map((x) => [x.name, x.left])], [true, [["가손님", 8], ["나손님", 8], ["바손님", 8]]], "8일 남은 사람만");
    assert.match(run.text[8], /고객님 아직 7일 남았습니다\. 7일 안에 방문하셔서 수제돈까스 받아가세요\.[\s\S]*무료수신거부 080-000-0000$/);
    await page.clock.runFor(60000);
    assert.strictEqual(await page.evaluate(() => window.__runs.length), 1, "그날 한 번만");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("안내 그림을 데스크에서 고르기 (사장님 11/16): [그림 고르기] → 미리보기 · '고른 그림: 이름' · [그림 빼기] · 체험판은 브라우저 파일 고르기", async () => {
  const browser = await launch();
  try {
    const { page, errs } = await openDesk(browser);
    await page.evaluate(() => {
      window.__own = null;
      window.desk.revImg.get = async () => (window.__own ? { ok: true, from: "app", name: window.__own, at: "2026-11-15 10:00", dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" } : { ok: false, files: [] });
      window.desk.revImg.pick = async () => { window.__own = "재방문 홍보.png"; return { ok: true, name: window.__own, at: "2026-11-15 10:00" }; };
      window.desk.revImg.clear = async () => { window.__own = null; return { ok: true }; };
    });
    await page.click("#rev-btn");
    await page.waitForFunction(() => /데스크가 만든 안내 그림/.test(document.getElementById("rev-imgcap-8").textContent));
    assert.strictEqual(await page.isHidden("#rev-imgclr-8"), true);
    await page.click('[data-act=revPick][data-l="8"]');
    await page.waitForFunction(() => /고른 그림: 재방문 홍보\.png/.test(document.getElementById("rev-imgcap-8").textContent));
    assert.match(await page.getAttribute("#rev-img-8", "src"), /^data:image\/png/);
    assert.strictEqual(await page.isHidden("#rev-imgclr-8"), false);
    // 톡톡 보내기: 고른 그림이 있으면 데스크 그림을 따로 저장하지 않음 (앱이 고른 그림을 보냄)
    await page.click("#rt-bar [data-act=rtRun][data-dry]");
    await page.waitForFunction(() => window.__runs.length === 1);
    assert.deepStrictEqual(await page.evaluate(() => window.__saves), []);
    await page.click('[data-act=revClear][data-l="8"]');
    await page.waitForFunction(() => /데스크가 만든 안내 그림/.test(document.getElementById("rev-imgcap-8").textContent));
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("실제 화면 구조 (11/16 저장본): 목록에 이름만 → 이름이 같은 줄을 눌러 고객 정보 번호로 확인 · 동명이인은 번호가 같은 사람 · 넓은 화면(목록에 번호)도", async () => {
  const browser = await launch();
  try {
    const { ts, steps, sent, page } = await open(browser);
    const r = await ts.one({ name: "김가람", phone: "010-3999-1313", image: IMG }, false); // 동명이인: 첫 김가람(010-3000-…)은 번호가 달라 넘어감
    assert.deepStrictEqual([r.ok, r.how], [true, "이름 · 고객 정보 번호"], JSON.stringify({ r, steps }));
    assert.deepStrictEqual((await sent()).map((x) => [x.u, x.kind]), [["c9", "image"]]);
    await page.goto(SP + "?home=1&wide=1");
    ts.opts.home = SP + "?home=1&wide=1";
    const r2 = await ts.one({ name: "유민석", phone: "010-3100-1313", image: IMG }, true);
    assert.deepStrictEqual([r2.ok, r2.how], [true, "가린 번호 · 이름"], JSON.stringify(r2));
    const r3 = await ts.one({ name: "나단비", phone: "010-3300-2424", image: IMG }, true);
    assert.deepStrictEqual([r3.ok, r3.how], [true, "번호"], JSON.stringify(r3));
  } finally {
    await browser.close();
  }
});

test("데스크: 줄 단추는 '직접 보냄 표시'(보내지 않음) · 모두 표시해도 확인만 해 보기는 전체로 · [표시 모두 풀기]는 직접 표시만 풂", async () => {
  const browser = await launch();
  try {
    const { page, errs } = await openDesk(browser);
    await page.click("#rev-btn");
    for (let i = 0; i < 3; i++) await page.click(`#sheet .rvrow >> nth=${i} >> [data-act=revSentT]`);
    const rows = await rowsOf(page);
    assert.match(rows[0], /직접 보냄 ✓ \d\d:\d\d$/);
    const bar = () => page.$eval("#rt-bar", (e) => [...e.children].map((c) => c.textContent.replace(/\s+/g, " ").trim()).filter(Boolean).join(" "));
    assert.match(await bar(), /확인만 해 보기 \(보낸 사람 포함 3명\) 톡톡으로 보내기 0명/);
    await page.click("#rt-bar [data-act=rtRun][data-dry]");
    await page.waitForFunction(() => window.__runs.length === 1);
    assert.deepStrictEqual(await page.evaluate(() => window.__runs[0].list.map((x) => x.name)), ["가손님", "나손님", "바손님"]);
    await page.evaluate(() => window.__cb.done({ ok: true, job: { running: false, dry: true, at: "2026-11-15 10:00", end: "2026-11-15 10:01", total: 3, step: "", why: "", results: [] } }));
    await page.click("[data-act=revSentClear]");
    assert.match(await page.textContent("#toast"), /직접 표시한 '보냄' 3개를 풀었어요/);
    assert.match(await bar(), /톡톡으로 보내기 3명/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
