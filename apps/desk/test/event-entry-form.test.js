/* 이벤트 조각 양식 (사장님 11/05 한가위 입장권 → 11/06 그림판 배치로 다시)
   - 프린트물 설정 → 이벤트 묶음: (재)공통양식 + 조각 양식 (재)도전 · 성공 · 제공상품 · (한)한가위 · 새로 만든 것 — 이름에서 {코드}가 생김
   - 조각 양식은 (재)공통양식(어느 양식이든) 안 {코드} 한 줄 자리에 — 그 손님에게 맞을 때만 (한가위 = 현장 이벤트 입장 손님)
   - 맨 위 '현재 기본 적용 템플릿' 이벤트 = (재)공통양식 · 기본 입장권 = 네이버 예약용 · 현장입장자용
   - 이름을 바꾸면 코드도 바뀌고 양식 안 예전 코드 줄도 따라 바뀜 · [+ 새 양식] (나오는 손님 고름) · [삭제] = 양식 안 코드 줄도 지움 */
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

/** 열쇠 k 를 가진 손님에게 실제로 나갈 입장권 글 (출력과 같은 길: ticketText → receiptLines) */
const ticket = (page, k) => page.evaluate((key) => {
  const T = window.__deskTest, h = T.holders().find((x) => x.keys.includes(key)), v = T.keyVals(h);
  return T.receiptLines(T.formFor(v), v).map((l) => l.t.trim()).filter(Boolean);
}, k);
const naverTicket = (page) => page.evaluate(() => { const T = window.__deskTest, h = T.holders().find((x) => !x.walk && !x.svc), v = T.keyVals(h); return T.receiptLines(T.formFor(v), v).map((l) => l.t.trim()).filter(Boolean); });
const openPrints = async (page) => { await page.dblclick("#now"); await page.click('[data-t="prints"]'); };
const pick = (page, k) => page.click(`#sheet .tplrow[data-k="${k}"]`); // 모든 묶음이 한 목록 (11/26)
const close = (page) => page.click("#sheet [data-act=close] >> nth=0");
const FRAG = "#* 한가위 이벤트\n^11월 30일까지 · 다음에 또 오세요";
const COMMON = "#* 아스타나키즈\n^* {구분} 입장권\n#*{열쇠}번\n#*퇴장  {퇴장시간}\n{한가위양식}\n^이용 수칙을 지켜 주세요";

test("한가위 조각 양식: 공통양식 {한가위양식} 자리에 이벤트 입장 손님만 · '이벤트' 적용일 때 · 이름 바꾸면 코드도 · 새 양식(나오는 손님) · 삭제", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    page.on("dialog", (d) => d.accept());
    await page.goto(DESK); // 체험판 10/5 13:50
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // 이름: 기타 → 현장 이벤트 입장 (조각 양식 안내 · [양식 고치기 ›])
    await page.dblclick("#now"); await page.click("[data-t=etc]");
    await page.fill("#wev-name", "한가위");
    assert.match(await page.textContent("#sheet .setcard"), /입장권: 프린트물 설정 → 이벤트 묶음 '\(한\)한가위양식' 조각 양식 — \(재\)공통양식의 \{한가위양식\} 자리에 \(비어 있음\)/);
    await close(page);
    // 손님: 한가위 이벤트 입장(44) · 현장 결제(45) · 네이버(체험판)
    await page.evaluate(() => { const T = window.__deskTest; T.walkin("01011112222", [44], 830, 830, "한가위"); T.walkin("01033332222", [45], 830, 830); T.setNow(835); });
    const walk0 = await ticket(page, 45);
    const asEv = (l) => l.replace("현장 입장권", "한가위 이벤트 입장권").replace(/^45번$/, "44번");
    assert.deepStrictEqual(await ticket(page, 44), walk0.map(asEv), "기본 입장권 적용 = 현장입장자용 그대로");

    // 기타 → [양식 고치기 ›] = 이벤트 묶음 · (한)한가위양식
    await page.dblclick("#now"); await page.click("[data-t=etc]");
    await page.click("[data-act=tplGo][data-k=evw]");
    assert.strictEqual(await page.getAttribute("#sheet .tplrow.on", "data-g"), "event");
    assert.strictEqual(await page.getAttribute("#sheet .tplrow.on", "data-k"), "evw");
    assert.match(await page.textContent("#sheet .tplrow.on"), /\(한\)한가위양식\s*\{한가위양식\}\s*어느 양식에도 없음/);
    assert.match(await page.textContent("#sheet .tpldesc"), /현장 이벤트 입장 손님\(결제 없이 \[한가위 이벤트 입장\]\)에게만/);
    assert.match(await page.textContent("#sheet .evwarn"), /어느 양식에도 \{한가위양식\} 줄이 없어 안 나와요/);
    await page.fill("#tpl-text", FRAG);
    await page.click("#tpl-save");
    // (재)공통양식에 {한가위양식} 자리 · 맨 위 '이벤트'
    await pick(page, "evbase");
    await page.fill("#tpl-text", COMMON);
    await page.click("#sheet [data-act=tplSamp][data-s=walkev]");
    assert.match((await page.textContent("#tpl-paper")).replace(/\s+/g, " "), /한 가 위 이 벤 트|한가위 이벤트/, "이벤트 입장 손님 예시 = 조각이 그 자리에");
    await page.click("#tpl-save");
    await page.selectOption("#tpl-apply", "event");
    assert.strictEqual(JSON.parse(await page.evaluate(() => localStorage.getItem("astanakiz-printset"))).apply, "event", "이 PC 에 저장");
    assert.doesNotMatch(await page.textContent("#sheet .tplrow.on"), /어느 양식에도 없음/);
    await close(page);
    assert.deepStrictEqual(await ticket(page, 44), ["아스타나키즈", "한가위 이벤트 입장권", "44번", "퇴장  오후 3시 40분", "한가위 이벤트", "11월 30일까지 · 다음에 또 오세요", "이용 수칙을 지켜 주세요"]);
    assert.deepStrictEqual(await ticket(page, 45), ["아스타나키즈", "현장 입장권", "45번", "퇴장  오후 3시 40분", "이용 수칙을 지켜 주세요"], "현장 결제 손님은 조각 없이");
    assert.ok(!(await naverTicket(page)).includes("한가위 이벤트"), "네이버 손님도 조각 없이");

    // 이름을 바꾸면 코드도 · 공통양식 안 줄도 따라 바뀜
    await openPrints(page); await pick(page, "evw");
    await page.fill("#tpl-name", "(추)추석양식"); await page.press("#tpl-name", "Enter");
    assert.match(await page.textContent("#sheet .tplrow.on"), /\(추\)추석양식\s*\{추석양식\}/);
    assert.match(await page.evaluate(() => window.__deskTest.EV_().form), /^\{추석양식\}$/m, "공통양식의 {한가위양식} → {추석양식}");
    assert.match(await page.textContent("#sheet .tplcodes"), /\{추석양식\}/);
    // 새 양식: 네이버 예약 손님에게만 · 코드는 이름으로
    await page.click("[data-act=tplNew]");
    assert.match(await page.textContent("#sheet .tplrow.on"), /\(새\)새양식1\s*\{새양식1\}/);
    await page.fill("#tpl-name", "(네)네이버안내"); await page.press("#tpl-name", "Enter");
    await page.selectOption("#tpl-cond", "naver");
    await page.fill("#tpl-text", "^네이버 손님 안내");
    await page.click("#tpl-save");
    await pick(page, "evbase");
    await page.focus("#tpl-text");
    await page.evaluate(() => { const t = document.getElementById("tpl-text"); t.setSelectionRange(t.value.length, t.value.length); });
    await page.click('#sheet .tplcode[data-c="{네이버안내}"]');
    assert.match(await page.inputValue("#tpl-text"), /\n\{네이버안내\}$/, "조각 코드는 새 줄로");
    await page.click("#tpl-save");
    await close(page);
    assert.ok((await naverTicket(page)).includes("네이버 손님 안내"), "네이버 손님에게 새 조각");
    assert.ok(!(await ticket(page, 45)).includes("네이버 손님 안내"), "현장 손님은 아님");
    assert.ok((await ticket(page, 44)).includes("한가위 이벤트"), "이름을 바꿔도 이벤트 입장 손님 조각 그대로");
    const kept = JSON.parse(await page.evaluate(() => localStorage.getItem("astanakiz-printset")));
    assert.deepStrictEqual([kept.names.evw, kept.frags.map((f) => [f.name, f.code, f.cond, f.text])], ["(추)추석양식", [["(네)네이버안내", "네이버안내", "naver", "^네이버 손님 안내"]]]);
    // 삭제 → 공통양식 안 코드 줄도 지움
    await openPrints(page); await pick(page, kept.frags[0] ? "u:" + kept.frags[0].id : "");
    await page.click("[data-act=tplDel]");
    assert.doesNotMatch(await page.evaluate(() => window.__deskTest.EV_().form), /네이버안내/);
    // 맨 위 '기본 입장권' → 현장입장자용 (조각 없음)
    await page.selectOption("#tpl-apply", "base");
    await close(page);
    assert.deepStrictEqual(await ticket(page, 44), walk0.map(asEv));
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("재방문 이벤트(돈까스) 중 [이벤트 입장]으로 등록한 손님: 공통양식 + 한가위 조각 · 재방문 안내는 없음 · 다시 출력도", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    const BASE = "#* 아스타나키즈 공통\n^* {구분} 입장권\n#*{열쇠}번\n[이벤트]\n{한가위양식}";
    await page.addInitScript((form) => { if (!localStorage.getItem("astanakiz-visitevent")) localStorage.setItem("astanakiz-visitevent", JSON.stringify({ ver: 2, on: true, from: "2026-09-10", to: "2026-10-31", days: 20, gift: "수제돈까스", form })); localStorage.setItem("astanakiz-walkevent", "한가위"); }, BASE);
    await page.goto(DESK);
    // 현장입장 창 → 전화번호 → [한가위 이벤트 입장]
    await page.click(".key[data-k='32']");
    for (const k of "12345678") await page.click(`.keypad [data-k="${k}"]`);
    await page.click("#w-event");
    assert.deepStrictEqual(await ticket(page, 32), ["아스타나키즈 공통", "한가위 이벤트 입장권", "32번"], "조각이 비어 있으면 그 줄 없음 (재방문 안내도 없음)");
    await openPrints(page);
    assert.strictEqual(await page.inputValue("#tpl-apply"), "event", "예전처럼: 재방문 이벤트 기간 + 공통양식 = 이벤트");
    await pick(page, "evw");
    await page.fill("#tpl-text", FRAG);
    await page.click("#tpl-save");
    await close(page);
    assert.deepStrictEqual(await ticket(page, 32), ["아스타나키즈 공통", "한가위 이벤트 입장권", "32번", "한가위 이벤트", "11월 30일까지 · 다음에 또 오세요"]);
    // 다시 출력(열쇠 창 [입장권 다시 출력])도 같은 양식
    await page.evaluate(() => { const T = window.__deskTest; T.PRINT_().sel = "POS-80C (USB001)"; T.PRINT_().mode = "win"; });
    await page.click(".key[data-k='32']");
    await page.click("#sheet [data-act=reprint]");
    const last = await page.evaluate(() => window.__deskTest.lastPrint());
    assert.strictEqual(last && last.text, BASE, "다시 출력도 공통양식 (조각은 출력 때 끼움)");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("모든 양식 샘플 출력 (사장님 11/06): 맨 위 [모든 양식 샘플 출력] → 확인 한 번 → 저장된 양식을 손님마다 한 장씩 (기본 입장권 · 이벤트 도전 · 성공 · 이벤트 입장 · 현장 결제 · 써 둔 BC) · 장마다 맨 위 [샘플] 이름 · 양식마다 [샘플 출력]", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [], dialogs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    page.on("dialog", (d) => { dialogs.push(d.message()); d.accept(); });
    const BASE = "#* 아스타나키즈 공통\n^* {구분} 입장권\n#*{열쇠}번\n[이벤트]\n{한가위양식}";
    await page.addInitScript((form) => { if (!sessionStorage.getItem("once")) { sessionStorage.setItem("once", "1"); localStorage.clear(); localStorage.setItem("astanakiz-visitevent", JSON.stringify({ ver: 2, on: true, from: "2026-09-10", to: "2026-10-31", days: 20, gift: "수제돈까스", form })); localStorage.setItem("astanakiz-walkevent", "한가위"); localStorage.setItem("astanakiz-bc2forms", JSON.stringify({ v: 2, f1: "", f2: "^투아웃 안내\n{열쇠}번" })); } }, BASE);
    await page.goto(DESK);
    await page.evaluate((f) => { window.__deskTest.PRINT_().forms.enter.ev = f; }, FRAG);
    // 프린터를 안 정했으면 안내만
    await openPrints(page);
    await page.click("[data-act=tplSampleAll]");
    assert.match(await page.textContent("#toast"), /영수증 프린터를 먼저 정해 주세요/);
    assert.deepStrictEqual(dialogs, []);
    await page.evaluate(() => { const P = window.__deskTest.PRINT_(); P.mode = "win"; P.sel = "POS-80C (USB001)"; });
    await page.click("[data-act=tplSampleAll]");
    assert.match(dialogs[0], /^모든 양식 샘플 8장을 차례로 출력할까요\?/);
    const titles = ["기본 입장권 · 네이버 예약용 (지금 적용 안 함)", "기본 입장권 · 현장입장자용 (지금 적용 안 함)", "이벤트 · 도전 손님", "이벤트 · 성공 손님", "이벤트 · 한가위 이벤트 입장 손님", "이벤트 · 현장 결제 손님", "이벤트 · (재)제공상품 (쿠폰만)", "BC · 2아웃용"];
    assert.deepStrictEqual(await page.evaluate(() => window.__deskTest.lastSamples()), titles, "1아웃용은 비어 있어 빠짐");
    assert.match(await page.textContent("#toast"), /모든 양식 샘플 8장 출력 \(POS-80C \(USB001\), 체험\)/);
    const jobs = await page.evaluate(() => window.__deskTest.sampleJobs());
    assert.deepStrictEqual(jobs.map((j) => j.lines[0]), titles.map((t) => `[샘플] ${t}`), "장마다 맨 위 [샘플] 이름");
    assert.ok(jobs[4].lines.includes("한가위 이벤트") && !jobs[2].lines.includes("한가위 이벤트"), "이벤트 입장 손님 장에만 한가위 조각");
    assert.ok(jobs[3].lines.some((l) => /재방문 이벤트 성공!/.test(l)), "성공 손님 장 = 성공 양식 (쿠폰)");
    assert.deepStrictEqual(jobs[6].lines.slice(-2), ["[ 수제돈까스 무료 증정 ]", "이 영수증을 보여 주세요"], "쿠폰만 한 장 (11/26)");
    assert.ok(!jobs[6].lines.some((l) => /아스타나키즈|퇴장/.test(l)), "쿠폰만 — 입장권 머리 없음");
    assert.ok(jobs[7].lines.includes("투아웃 안내"), "BC 2아웃용");
    // 양식마다 [샘플 출력] = 그 양식 미리보기 그대로
    assert.strictEqual((await page.textContent("#sheet [data-act=tplTest]")).trim(), "샘플 출력");
    await page.click("#sheet [data-act=tplTest]");
    assert.match(await page.textContent("#toast"), /샘플 출력 \(POS-80C \(USB001\), 체험\)/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("프린트물 설정 (사장님 11/26 — 쿠폰만 따로 출력이 안 됨 · 모든 양식을 골라 고치고 시험 출력): 모든 묶음이 한 목록 · 조각 양식은 '이 양식만' 미리보기 · 출력 (쿠폰은 보안 무늬까지) · '입장권에 넣어'", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await page.addInitScript(() => {
      window.__jobs = [];
      window.__cfg = { build: "2.35", printMode: "com", comPort: "COM3", visitEvent: { ver: 2, on: true, from: "2026-09-10", to: "2026-10-31", days: 20, gift: "수제돈까스" } };
      window.desk = {
        naver: { load: async (day) => ({ ok: true, day, slots: [], bookings: [] }), complete: async () => ({ ok: true }) },
        state: { load: () => null, save: () => {} },
        config: { get: async () => window.__cfg, set: async (patch) => { Object.assign(window.__cfg, patch); return { ok: true }; } },
        print: { escpos: async (j) => { window.__jobs.push(j); return { ok: true }; } },
      };
    });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    await page.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 15000 });
    await openPrints(page);
    // 묶음을 고르지 않아도 모든 양식이 한 목록 (예전엔 맨 위 '기본 입장권 ▾'를 바꿔야 이벤트 · BC 양식이 보였음)
    assert.strictEqual(await page.$("#tpl-group"), null, "묶음 고르기 칸 없음");
    assert.deepStrictEqual(await page.$$eval("#sheet .tplgh", (e) => e.map((x) => x.textContent)), ["기본 입장권", "이벤트", "BC"]);
    assert.deepStrictEqual(await page.$$eval("#sheet .tplrow", (e) => e.map((x) => x.dataset.k)), ["naver", "walk", "evbase", "ev1", "ev2", "ev3", "evw", "evwalk", "bc1", "bc2"]);
    assert.match(await page.textContent('#sheet .tplrow[data-k="ev3"]'), /\(재\)제공상품\s*쿠폰/);
    // 쿠폰 (재)제공상품 → '쿠폰만' 미리보기 = 쿠폰 글 + 보안 무늬 (입장권 머리 · 열쇠 없음)
    await page.click('#sheet .tplrow[data-k="ev3"]');
    assert.strictEqual(await page.getAttribute('#sheet [data-act=tplView][data-v="only"]', "aria-pressed"), "true");
    const paper = (await page.textContent("#tpl-paper")).replace(/\s+/g, " ").trim();
    assert.match(paper, /\[ 수제돈까스 무료 증정 \]\s*이 영수증을 보여 주세요/);
    assert.doesNotMatch(paper, /아스타나키즈|입장|퇴장/, "쿠폰만");
    assert.strictEqual((await page.$$("#tpl-paper .seal img")).length, 2, "보안 무늬 위 · 아래");
    assert.strictEqual((await page.textContent("#sheet [data-act=tplTest]")).trim(), "쿠폰만 출력");
    await page.click("#sheet [data-act=tplTest]");
    await page.waitForFunction(() => window.__jobs.length === 1);
    const job = await page.evaluate(() => window.__jobs[0].parts.map((p) => p.t || "").join(""));
    assert.match(job, /수제돈까스 무료 증정/);
    assert.doesNotMatch(job, /아스타나키즈|퇴장|\[샘플\]/, "쿠폰만 · [샘플] 머리 없음");
    assert.ok(await page.evaluate(() => window.__jobs[0].parts.some((p) => p.b)), "보안 무늬도 보냄");
    assert.deepStrictEqual(await page.evaluate(() => window.__deskTest.lastSamples()), ["(재)제공상품 쿠폰만"]);
    // 고쳐서 바로 (저장 전에도) 미리보기 · 출력
    await page.fill("#tpl-text", "^*[ 돈까스 쿠폰 ]\n^{사용기한}까지");
    assert.match(await page.textContent("#tpl-paper"), /돈까스 쿠폰/);
    // 입장권에 넣어 = 예전처럼 (재)공통양식 안 그 자리
    await page.click('#sheet [data-act=tplView][data-v="full"]');
    assert.match((await page.textContent("#tpl-paper")).replace(/\s+/g, " "), /재방문 이벤트 성공!.*돈까스 쿠폰/);
    assert.strictEqual((await page.textContent("#sheet [data-act=tplTest]")).trim(), "샘플 출력");
    // 도전양식 '이 양식만' = 그 문구만 · 기본 입장권은 전과 같이 입장권 전체
    await page.click('#sheet .tplrow[data-k="ev1"]');
    await page.click('#sheet [data-act=tplView][data-v="only"]');
    assert.match((await page.textContent("#tpl-paper")).replace(/\s+/g, " "), /^\s*재방문 이벤트/);
    assert.strictEqual((await page.textContent("#sheet [data-act=tplTest]")).trim(), "이 양식만 출력");
    await page.click('#sheet .tplrow[data-k="naver"]');
    assert.strictEqual(await page.$("#sheet [data-act=tplView]"), null, "입장권 양식은 늘 전체");
    assert.match(await page.textContent("#tpl-paper"), /아스타나키즈/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
