/* 고객 세부 관리 (사장님 10/26) — 운영 설정 → 고객 세부 관리: [BC 관리] [마일리지 SKIP]
   - BC(블랙컨슈머) ①②③: 예약자 창 · 열쇠 창 이름 옆 [3자녀] 다음 동그라미 세 개 · 야구 아웃처럼 쌓임 · 같은 단계를 다시 누르면 한 단계 내림
     원아웃 = 고객 카드 테두리 빨강 · 투아웃 = 마일리지 미적용 · 쓰리아웃 = 예약 불가(알림 + [전액 취소]) — 아웃마다 스위치
   - 마일리지 SKIP: 고객명 · 전화번호 · N번째 → 그 손님의 N번째 예약완료에는 사은권을 안 띄움 */
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

test("BC ①②③ (체험판): 쌓임 · 다시 누르면 한 단계 내림 · ③ 은 사유 창에 쓰고 [확인]해야 · 원아웃 테두리 빨강 · 투아웃 마일리지 미적용(사은권 · 입장권 누계 없음) · 쓰리아웃 '자동 전액 취소' 안내 · 스위치를 끄면 그 대응만 빠짐 · 다시 켜도 그대로", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 10/5 13:50
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // 완료 9 → 이번이 10번째 = 사은권
    const id = await page.evaluate(() => { const T = window.__deskTest; const id = T.addBooking(T.today(), "14:30", "시험손님", "01055556666", 1, { prevDone: 9 }); T.setNow(830); return id; });
    const card = page.locator(`.res[data-id="${id}"]`);
    await page.click('.slot[data-s="870"]');
    assert.match(await card.locator(".visits").textContent(), /10번 완료 예정.*사은권 증정/);
    await card.click();
    assert.match(await page.textContent("#sheet .facts"), /3자녀\s*BC\s*123/, "[3자녀] 다음 BC ①②③");
    const dots = () => page.$$eval("#sheet .bcdot", (e) => e.map((x) => (x.classList.contains("on") ? 1 : 0)).join(""));
    await page.click('#sheet [data-act=bcSet][data-n="2"]');
    assert.strictEqual(await dots(), "110", "투아웃 → ① ② 채움");
    assert.match(await page.textContent("#toast"), /BC 투아웃 — 카드 테두리 빨강 · 마일리지 미적용/);
    assert.ok(await page.evaluate(() => document.getElementById("sheet").classList.contains("bcred")), "예약자 창 테두리 빨강");
    assert.match(await card.getAttribute("class"), /\bbc2\b/, "예약 카드 테두리 빨강 (투아웃 = 점선 · 사장님 10/27)");
    assert.ok(await card.locator(".name .nm-bl").count(), "이름 빨강");
    const v = await card.locator(".visits").textContent();
    assert.ok(/마일리지 미적용/.test(v) && !/사은권 증정/.test(v), v);
    await page.click('#sheet [data-act=bcSet][data-n="2"]');
    assert.strictEqual(await dots(), "100", "같은 단계를 다시 누르면 한 단계 내림");
    assert.match(await card.locator(".visits").textContent(), /사은권 증정/, "원아웃은 마일리지 그대로");
    // ③ 은 사유 창 — [취소]면 그대로 · 빈칸이면 안 됨 · 쓰고 [확인]하면 그때부터 쓰리아웃 (사장님 10/26)
    await page.click('#sheet [data-act=bcSet][data-n="3"]');
    assert.ok(await page.isVisible(".bcask #bc-why"), "쓰리아웃 사유 창");
    await page.click(".bcask [data-act=bc3No]");
    assert.strictEqual(await dots(), "100", "취소 → 그대로 원아웃");
    await page.click('#sheet [data-act=bcSet][data-n="3"]');
    await page.click(".bcask [data-act=bc3Ok]");
    assert.match(await page.textContent("#toast"), /사유를 적어 주세요/);
    assert.ok(await page.isVisible(".bcask"), "빈칸이면 창이 그대로");
    await page.fill("#bc-why", "직원에게 폭언 (시험)");
    await page.click(".bcask [data-act=bc3Ok]");
    assert.strictEqual(await page.$(".bcask"), null);
    assert.strictEqual(await dots(), "111");
    assert.match(await page.textContent("#toast"), /쓰리아웃 — .*예약 불가 · 사유를 남겼어요/);
    assert.match(await page.textContent("#sheet .facts"), /쓰리아웃 사유\s*직원에게 폭언 \(시험\)/, "고객 카드에 사유");
    assert.match(await page.textContent("#sheet .bc3"), /쓰리아웃 · 예약 불가 — 설치한 앱은 네이버를 불러올 때 자동으로 전액 취소/);
    assert.match(await card.locator(".bc3").textContent(), /자동으로 전액 취소/);
    assert.strictEqual(await page.$("#sheet [data-act=bcCancel]"), null, "근무자가 누르는 버튼은 없음 (자동 · 실패했을 때만 [다시 취소])");
    await page.click("#sheet [data-act=close]");
    // 운영 설정 → 고객 세부 관리 → BC 관리: 스위치 · 목록
    await page.dblclick("#now"); await page.click('[data-t="cust"]');
    assert.match(await page.textContent(".setnav"), /네이버 설정.*고객 세부 관리.*기타/, "네이버 설정과 기타 사이");
    assert.match(await page.textContent("#sheet .bclist"), /시험손님 · 010-\*\*\*\*-6666 · 쓰리아웃 사유: 직원에게 폭언 \(시험\)/, "목록에 사유");
    for (const k of [1, 2, 3]) await page.click(`[data-act=bcToggle][data-k="${k}"]`);
    assert.deepStrictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("astanakiz-bc"))), { o1: false, o2: false, o3: false }, "스위치 저장");
    await page.click("#sheet .x");
    assert.doesNotMatch(await card.getAttribute("class"), /\bbc[12]\b/, "원아웃 · 투아웃 대응 끔 → 테두리 없음");
    assert.strictEqual(await card.locator(".bc3").count(), 0, "쓰리아웃 대응 끔 → 알림 없음");
    assert.match(await card.locator(".visits").textContent(), /사은권 증정/, "투아웃 대응 끔 → 마일리지 그대로");
    assert.ok(await card.locator(".name .nm-bl").count(), "BC 이름 빨강은 그대로");
    // 다시 켜도 단계 · 스위치 그대로
    await page.reload();
    const st = await page.evaluate(() => ({ bc: window.__deskTest.RULES.bc, n: Object.values(window.__deskTest.notes()).map((x) => [x.bc, x.r3]) }));
    assert.deepStrictEqual(st, { bc: { o1: false, o2: false, o3: false }, n: [[3, "직원에게 폭언 (시험)"]] });
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("마일리지 SKIP (체험판): 고객명 · 전화번호 · N번째 등록 → 그 회차 사은권 안내가 빠지고 'N번째 사은권 SKIP' · 지우면 다시 · 잘못 넣으면 안내", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const id = await page.evaluate(() => { const T = window.__deskTest; const id = T.addBooking(T.today(), "14:30", "스킵손님", "010-2222-3333", 1, { prevDone: 9 }); T.setNow(830); return id; });
    await page.click('.slot[data-s="870"]');
    const card = page.locator(`.res[data-id="${id}"]`);
    assert.match(await card.locator(".visits").textContent(), /사은권 증정/);
    await page.dblclick("#now"); await page.click('[data-t="cust"]'); await page.click("[data-act=csub][data-s=skip]");
    await page.fill("#sk-name", "스킵손님"); await page.fill("#sk-phone", "0102222"); await page.fill("#sk-n", "10");
    await page.click("[data-act=skipAdd]");
    assert.match(await page.textContent("#toast"), /전화번호를 다 넣어/);
    await page.fill("#sk-phone", "010-2222-3333");
    await page.click("[data-act=skipAdd]");
    await page.waitForTimeout(400);
    assert.match(await page.textContent("#sheet .bclist"), /10번째\s*스킵손님 · 010-\*\*\*\*-3333/);
    const v = await card.locator(".visits").textContent();
    assert.ok(/10번째 사은권 SKIP/.test(v) && !/사은권 증정/.test(v), v);
    // 같은 사람 같은 회차는 한 번만
    await page.fill("#sk-name", "스킵손님"); await page.fill("#sk-phone", "01022223333"); await page.fill("#sk-n", "10");
    await page.click("[data-act=skipAdd]");
    assert.match(await page.textContent("#toast"), /이미 등록됨/);
    await page.click('[data-act=skipDel][data-n="10"]');
    await page.waitForTimeout(300);
    assert.match(await card.locator(".visits").textContent(), /사은권 증정/, "지우면 다시 사은권");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("BC (앱): 쓰리아웃 손님 예약은 네이버를 불러올 때 알아서 전액 취소 (근무자 확인 없이) → 카드가 빠짐 · 기록 · 실패하면 다음 불러오기 때 한 번 더 · 두 번 안 되면 카드에 [다시 취소] · 목록은 앱 본체에서", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date("2026-10-26T11:50:00") });
    await page.addInitScript(() => {
      window.__nt = { patch: [], cancel: [], fail3: 0 };
      const BK = (no, time, name, phone, done) => ({ no, time, name, phone, qty: 2, qtyText: "1시간 50분 2", product: "1시간 50분", status: "확정", pay: "결제완료", doneCount: done, cancelCount: 0 });
      const store = { "01099990001": { m: "", k3: false, bc: 3, bl: true, nm: "자동취소손님", p4: "0001", bcAt: "2026-10-20", r3: "환불 요구하며 소란", r3At: "2026-10-20 10:00", at: "2026-10-20 10:00" }, "01099990002": { m: "", k3: false, bc: 3, bl: true, nm: "실패손님", p4: "0002", r3: "시험", at: "" } };
      window.desk = {
        naver: {
          load: async (day) => ({ ok: true, day, slots: day === "2026-10-26" ? [{ time: "12:00", product: "1시간 50분", cap: 10, conf: 4, done: 0 }] : [], bookings: day === "2026-10-26" ? [BK("N1", "12:00", "자동취소손님", "010-9999-0001", 4), BK("N2", "12:00", "보통손님", "010-7777-0003", 5), BK("N3", "12:00", "실패손님", "010-9999-0002", 1)].filter((b) => !window.__nt.cancel.some((c) => c.ok && c.no === b.no)) : [] }),
          complete: async () => ({ ok: true }),
          cancelPaid: async (b) => { const ok = b.no !== "N3" || window.__nt.fail3 >= 2; if (!ok) window.__nt.fail3++; window.__nt.cancel.push(Object.assign({ ok }, b)); return ok ? { ok: true } : { ok: false, why: "확인 창을 못 찾음" }; },
        },
        state: { load: () => null, save: () => {} },
        config: { get: async () => ({ build: "2.6" }), set: async () => ({ ok: true }) },
        notes: {
          get: async (j) => { const notes = {}; for (const k of j.keys) if (store[k]) notes[k] = store[k]; return { ok: true, notes }; },
          set: async () => ({ ok: true, note: null }),
          list: async () => ({ ok: true, list: [{ id: "a1b2c3d4e5f60718", bc: store["01099990001"].bc, sk: [], nm: "자동취소손님", p4: "0001", m: "", bcAt: "2026-10-20", r3: "환불 요구하며 소란", r3At: "2026-10-20 10:00", at: "" }, { id: "0000aaaa1111bbbb", bc: 1, sk: [], nm: "테두리손님", p4: "0002", m: "", bcAt: "2026-10-21", at: "" }, { id: "0000cccc2222dddd", bc: 2, sk: [], nm: "마일손님", p4: "0003", m: "", bcAt: "2026-10-22", at: "" }, { id: "0000eeee3333ffff", bc: 1, sk: [], nm: "가람손님", p4: "0004", m: "", bcAt: "2026-10-19", at: "" }] }),
          patch: async (j) => { window.__nt.patch.push(j); if (j.bc != null) store["01099990001"].bc = j.bc; return { ok: true, note: null }; },
        },
      };
    });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    page.on("dialog", (d) => (page.__accept ? d.accept() : d.dismiss()));
    await page.goto(DESK);
    await page.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 15000 });
    await page.click('.slot[data-s="720"]');
    // 불러오자마자 근무자 확인 없이 전액 취소 — 자동취소손님 성공 · 실패손님은 실패 → 다음 불러오기(12:00 칸을 눌러 다시 읽음) 때 한 번 더 → 또 실패
    await page.waitForFunction(() => window.__nt.cancel.length >= 3, null, { timeout: 10000 });
    assert.deepStrictEqual(await page.evaluate(() => window.__nt.cancel.map((b) => [b.no, b.time, b.qty, b.ok])), [["N1", "12:00", 2, true], ["N3", "12:00", 2, false], ["N3", "12:00", 2, false]]);
    await page.waitForFunction(() => ![...document.querySelectorAll(".res .name")].some((e) => /자동취소손님/.test(e.textContent)));
    assert.ok(await page.locator('.res:has-text("보통손님")').count(), "보통 손님은 그대로");
    await page.waitForFunction(() => /자동 전액 취소 실패: 확인 창을 못 찾음/.test((document.querySelector('.res .bc3') || {}).textContent || ""));
    // 두 번 실패하면 더 불러와도 안 함
    await page.click("[data-act=refresh]");
    await page.waitForTimeout(800);
    assert.strictEqual(await page.evaluate(() => window.__nt.cancel.length), 3, "두 번 실패하면 더 안 함");
    // [다시 취소] → 확인 창 [취소]면 그대로 · [확인]이면 다시
    page.__accept = false;
    await page.click('.res:has-text("실패손님") [data-act=bcCancel]');
    assert.strictEqual(await page.evaluate(() => window.__nt.cancel.length), 3);
    page.__accept = true;
    await page.click('.res:has-text("실패손님") [data-act=bcCancel]');
    await page.waitForFunction(() => window.__nt.cancel.length === 4 && window.__nt.cancel[3].ok);
    await page.waitForFunction(() => ![...document.querySelectorAll(".res .name")].some((e) => /실패손님/.test(e.textContent)));
    // 설정 목록 (앱 본체) → 단계 바꾸기 · 자동 취소 기록
    await page.dblclick("#now"); await page.click('[data-t="cust"]');
    assert.match(await page.textContent("#sheet"), /쓰리아웃 자동 전액 취소 기록[\s\S]*실패손님 12:00 2장 전액 취소 \(다시 취소\)[\s\S]*실패: 확인 창을 못 찾음[\s\S]*자동취소손님 12:00 2장 전액 취소/);
    await page.waitForFunction(() => /자동취소손님/.test(document.querySelector("#sheet .bclist").textContent));
    assert.match(await page.textContent("#sheet .bclist"), /쓰리아웃 사유: 환불 요구하며 소란 10\/20 10:00/, "목록에 쓰리아웃 사유 · 때");
    // 줄마다 자기 단계 숫자 하나만 (사장님 10/26: 셋 다 있고 칠해진 것만 다르면 헷갈림) · 목록에서는 올리지 못하고 [내리기]만
    assert.deepStrictEqual(await page.$$eval("#sheet .bclist .it", (r) => r.map((x) => [...x.querySelectorAll(".bcdot")].map((d) => d.textContent).join("") + " " + x.querySelector("b").textContent)), ["3 자동취소손님", "2 마일손님", "1 가람손님", "1 테두리손님"], "② 마일손님 처럼 · 쓰리아웃부터 · 같은 단계는 가나다 순 (먼저 표시한 순이 아님)");
    assert.deepStrictEqual(await page.$$eval("#sheet .bclist [data-act=bcDown]", (e) => e.map((x) => x.textContent)), ["내리기", "내리기", "BC 풀기", "BC 풀기"]);
    await page.fill("#bc-q", "0001");
    assert.match(await page.textContent("#sheet .bclist"), /자동취소손님/);
    await page.fill("#bc-q", "없는사람");
    assert.match(await page.textContent("#sheet .bclist"), /찾는 손님이 없어요/);
    await page.fill("#bc-q", "");
    // 스위치 밑 ①②③ 거르기 + '아웃 고객 검색' (사장님 10/26): ①을 누르면 원아웃 고객만 · 그 안에서 찾기 · 여러 개 · 다 풀면 모두
    const names = async () => (await page.$$eval("#sheet .bclist .it b", (e) => e.map((x) => x.textContent))).join(",");
    assert.strictEqual(await names(), "자동취소손님,마일손님,가람손님,테두리손님", "고르지 않으면 모두 · 쓰리아웃부터 · 가나다 순");
    assert.match(await page.textContent("#sheet .bcfind"), /BC 손님\s*1\s*2\s*3\s*아웃 고객 검색/, "동그라미 바로 옆에 '아웃 고객 검색'");
    await page.click('#sheet .bcfind [data-act=bcFilter][data-n="1"]');
    assert.strictEqual(await names(), "가람손님,테두리손님", "원아웃만 · 가나다 순");
    assert.strictEqual(await page.getAttribute('#sheet .bcfind [data-n="1"]', "aria-checked"), "true");
    assert.match(await page.textContent("#sheet .bcfind"), /아웃 고객 검색\s*원아웃 2명/);
    assert.match(await page.getAttribute("#bc-q", "placeholder"), /^원아웃 고객 중에서/);
    await page.fill("#bc-q", "0001");
    assert.match(await page.textContent("#sheet .bclist"), /찾는 손님이 없어요/, "쓰리아웃 손님은 원아웃 안에서 안 찾아짐");
    await page.fill("#bc-q", "테두리");
    assert.strictEqual(await names(), "테두리손님");
    await page.fill("#bc-q", "");
    await page.click('#sheet .bcfind [data-act=bcFilter][data-n="3"]');
    assert.strictEqual(await names(), "자동취소손님,가람손님,테두리손님", "원아웃 + 쓰리아웃");
    await page.click('#sheet .bcfind [data-act=bcFilter][data-n="1"]');
    await page.click('#sheet .bcfind [data-act=bcFilter][data-n="3"]');
    assert.strictEqual(await page.$$eval("#sheet .bcfind .bcdot.on", (e) => e.length), 0);
    assert.strictEqual(await names(), "자동취소손님,마일손님,가람손님,테두리손님", "다 풀면 모두");
    page.__accept = false;
    await page.click('#sheet .bclist [data-act=bcDown][data-id="a1b2c3d4e5f60718"]');
    assert.deepStrictEqual(await page.evaluate(() => window.__nt.patch), [], "확인 창에서 [취소]면 그대로");
    page.__accept = true;
    await page.click('#sheet .bclist [data-act=bcDown][data-id="a1b2c3d4e5f60718"]');
    await page.waitForFunction(() => window.__nt.patch.length === 1);
    assert.deepStrictEqual(await page.evaluate(() => window.__nt.patch), [{ id: "a1b2c3d4e5f60718", bc: 2 }], "쓰리아웃 [내리기] → 투아웃");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("BC 투아웃 양식 (사장님 10/27): 프린트물 설정 → [BC 투아웃 양식] 1 · 2 → 투아웃 뒤 첫 방문은 1번, 그다음부터 2번 · 다시 출력은 같은 양식 · 비우면 입장권 양식 · 투아웃 카드 테두리는 빨강 점선", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 10/5 13:50
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // 프린트물 설정 → [BC 투아웃 양식]: 1번 · 2번 (쓰는 법은 입장권 양식과 같음)
    await page.dblclick("#now"); await page.click('[data-t="prints"]');
    assert.match(await page.textContent("#sheet .psub"), /입장권 양식\s*재방문 이벤트 · 쿠폰\s*BC 투아웃 양식/);
    await page.click('[data-act=psub][data-s="bc2"]');
    assert.match(await page.textContent("#sheet"), /비어 있으면 입장권 양식 그대로/);
    assert.match(await page.textContent("#sheet .formhelp"), /\{열쇠\}/, "입장권 양식과 같은 쓰는 법");
    await page.fill("#bc2-text", "^투아웃 첫 안내\n{열쇠}번");
    assert.match(await page.textContent("#bc2-paper"), /투아웃 첫 안내/, "미리보기");
    await page.click('[data-act=bc2Cur][data-n="2"]');
    assert.strictEqual(await page.inputValue("#bc2-text"), "", "2번은 아직 비어 있음");
    await page.click("[data-act=bc2Copy]"); // 입장권 양식 가져오기
    assert.match(await page.inputValue("#bc2-text"), /\{열쇠\}/);
    await page.fill("#bc2-text", "^투아웃 다음 안내\n{열쇠}번");
    assert.deepStrictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("astanakiz-bc2forms"))), { f1: "^투아웃 첫 안내\n{열쇠}번", f2: "^투아웃 다음 안내\n{열쇠}번" }, "저장");
    await page.click("#sheet .x");
    // 손님: 원아웃 = 실선 · 투아웃 = 점선
    const [a, b] = await page.evaluate(() => { const T = window.__deskTest; const P = T.PRINT_(); P.sel = "시험 프린터"; P.port = "COM3"; T.setNow(830); return [T.addBooking(T.today(), "14:30", "투아웃손님", "01055550002", 1, { prevDone: 3 }), T.addBooking(T.today(), "18:00", "투아웃손님", "01055550002", 1, { prevDone: 3 })]; });
    await page.click('.slot[data-s="870"]');
    const card = page.locator(`.res[data-id="${a}"]`);
    await card.click();
    await page.click('#sheet [data-act=bcSet][data-n="1"]');
    const style = () => card.evaluate((e) => getComputedStyle(e).borderTopStyle);
    assert.strictEqual(await style(), "solid", "원아웃 = 빨강 실선");
    await page.click('#sheet [data-act=bcSet][data-n="2"]');
    assert.strictEqual(await style(), "dashed", "투아웃 = 빨강 점선");
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.getElementById("sheet")).outlineStyle), "dashed", "예약자 창 테두리도 점선");
    // 투아웃 뒤 첫 입장 → 1번 · 다시 출력도 1번
    await page.click(".kpick button:not([disabled]) >> nth=0");
    await page.click("#enter-done");
    const last = () => page.evaluate(() => (window.__deskTest.lastPrint() || {}).text || "");
    assert.match(await last(), /투아웃 첫 안내/);
    const k = await page.evaluate((id) => window.__deskTest.bk(id).keys[0], a);
    await page.click(`.key[data-k='${k}']`);
    await page.click("#sheet [data-act=reprint]");
    assert.match(await last(), /투아웃 첫 안내/, "다시 출력은 그때 양식 그대로");
    await page.click("#sheet [data-act=close]");
    // 그다음 방문 (따로 온 18:00 예약) → 2번
    const formOf = (id) => page.evaluate((x) => { const T = window.__deskTest; const v = T.keyVals(T.bk(x)); return [v._bc2, T.formFor(v)]; }, id);
    assert.deepStrictEqual(await formOf(b), [2, "^투아웃 다음 안내\n{열쇠}번"], "1번을 낸 뒤 방문은 2번");
    assert.match(JSON.stringify(await page.evaluate(() => window.__deskTest.notes())), /"p2":"2026-10-05 13:50"/, "1번을 낸 때를 손님 기록에");
    // 2번을 비우면 입장권 양식 그대로 (마일리지 줄은 빠진 채)
    await page.evaluate(() => { localStorage.setItem("astanakiz-bc2forms", JSON.stringify({ f1: "^투아웃 첫 안내", f2: "" })); });
    await page.dblclick("#now"); await page.click('[data-t="prints"]'); await page.click('[data-act=psub][data-s="bc2"]');
    await page.click('[data-act=bc2Cur][data-n="2"]');
    await page.fill("#bc2-text", "");
    await page.click("#sheet .x");
    assert.doesNotMatch((await formOf(b))[1], /투아웃/, "비우면 입장권 양식");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
