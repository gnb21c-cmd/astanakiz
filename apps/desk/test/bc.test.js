/* 고객 세부 관리 (사장님 10/26) — 운영 설정 → 고객 세부 관리: [BC 관리] [마일리지 SKIP]
   - BC(블랙컨슈머) ①②③: 예약자 창 · 열쇠 창 이름 옆 [3자녀] 다음 동그라미 세 개 · 야구 아웃처럼 쌓임 · 같은 단계를 다시 누르면 한 단계 내림
     1아웃 = 고객 카드 테두리 빨강 · 2아웃 = 마일리지 미적용 · 3아웃 = 예약 불가(알림 + [전액 취소]) — 아웃마다 스위치
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

test("BC ①②③ (체험판): 쌓임 · 다시 누르면 한 단계 내림 · ③ 은 사유 창에 쓰고 [확인]해야 · 1아웃 테두리 빨강 · 2아웃 마일리지 미적용(사은권 · 입장권 누계 없음) · 3아웃 알림 + [전액 취소] · 스위치를 끄면 그 대응만 빠짐 · 다시 켜도 그대로", async () => {
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
    assert.strictEqual(await dots(), "110", "2아웃 → ① ② 채움");
    assert.match(await page.textContent("#toast"), /BC 2아웃 — 카드 테두리 빨강 · 마일리지 미적용/);
    assert.ok(await page.evaluate(() => document.getElementById("sheet").classList.contains("bcred")), "예약자 창 테두리 빨강");
    assert.match(await card.getAttribute("class"), /\bbc1\b/, "예약 카드 테두리 빨강");
    assert.ok(await card.locator(".name .nm-bl").count(), "이름 빨강");
    const v = await card.locator(".visits").textContent();
    assert.ok(/마일리지 미적용/.test(v) && !/사은권 증정/.test(v), v);
    await page.click('#sheet [data-act=bcSet][data-n="2"]');
    assert.strictEqual(await dots(), "100", "같은 단계를 다시 누르면 한 단계 내림");
    assert.match(await card.locator(".visits").textContent(), /사은권 증정/, "1아웃은 마일리지 그대로");
    // ③ 은 사유 창 — [취소]면 그대로 · 빈칸이면 안 됨 · 쓰고 [확인]하면 그때부터 3아웃 (사장님 10/26)
    await page.click('#sheet [data-act=bcSet][data-n="3"]');
    assert.ok(await page.isVisible(".bcask #bc-why"), "3아웃 사유 창");
    await page.click(".bcask [data-act=bc3No]");
    assert.strictEqual(await dots(), "100", "취소 → 그대로 1아웃");
    await page.click('#sheet [data-act=bcSet][data-n="3"]');
    await page.click(".bcask [data-act=bc3Ok]");
    assert.match(await page.textContent("#toast"), /사유를 적어 주세요/);
    assert.ok(await page.isVisible(".bcask"), "빈칸이면 창이 그대로");
    await page.fill("#bc-why", "직원에게 폭언 (시험)");
    await page.click(".bcask [data-act=bc3Ok]");
    assert.strictEqual(await page.$(".bcask"), null);
    assert.strictEqual(await dots(), "111");
    assert.match(await page.textContent("#toast"), /3아웃 — .*예약 불가 · 사유를 남겼어요/);
    assert.match(await page.textContent("#sheet .facts"), /3아웃 사유\s*직원에게 폭언 \(시험\)/, "고객 카드에 사유");
    assert.match(await page.textContent("#sheet .bc3"), /3아웃 · 예약 불가 — 전액 취소/);
    assert.match(await card.locator(".bc3").textContent(), /전액 취소/);
    await page.click("#sheet .bc3 [data-act=bcCancel]");
    assert.match(await page.textContent("#toast"), /체험판/, "체험판에서는 취소하지 않음");
    await page.click("#sheet [data-act=close]");
    // 운영 설정 → 고객 세부 관리 → BC 관리: 스위치 · 목록
    await page.dblclick("#now"); await page.click('[data-t="cust"]');
    assert.match(await page.textContent(".setnav"), /네이버 설정.*고객 세부 관리.*기타/, "네이버 설정과 기타 사이");
    assert.match(await page.textContent("#sheet .bclist"), /시험손님 · 010-\*\*\*\*-6666 · 3아웃 사유: 직원에게 폭언 \(시험\)/, "목록에 사유");
    for (const k of [1, 2, 3]) await page.click(`[data-act=bcToggle][data-k="${k}"]`);
    assert.deepStrictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("astanakiz-bc"))), { o1: false, o2: false, o3: false }, "스위치 저장");
    await page.click("#sheet .x");
    assert.doesNotMatch(await card.getAttribute("class"), /\bbc1\b/, "1아웃 대응 끔 → 테두리 없음");
    assert.strictEqual(await card.locator(".bc3").count(), 0, "3아웃 대응 끔 → 알림 없음");
    assert.match(await card.locator(".visits").textContent(), /사은권 증정/, "2아웃 대응 끔 → 마일리지 그대로");
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

test("BC (앱): 목록은 앱 본체에서 · 목록에서 단계 바꾸기 · 3아웃 손님 예약이 보이면 알림 한 번 · [전액 취소] → 확인 → 네이버 취소 → 카드가 빠짐 (취소 안 누르면 그대로)", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date("2026-10-26T11:50:00") });
    await page.addInitScript(() => {
      window.__nt = { patch: [], cancel: [] };
      const BK = (no, time, name, phone, done) => ({ no, time, name, phone, qty: 2, qtyText: "1시간 50분 2", product: "1시간 50분", status: "확정", pay: "결제완료", doneCount: done, cancelCount: 0 });
      const store = { "01099990001": { m: "", k3: false, bc: 3, bl: true, nm: "삼아웃", p4: "0001", bcAt: "2026-10-20", r3: "환불 요구하며 소란", r3At: "2026-10-20 10:00", at: "2026-10-20 10:00" } };
      window.desk = {
        naver: {
          load: async (day) => ({ ok: true, day, slots: day === "2026-10-26" ? [{ time: "12:00", product: "1시간 50분", cap: 10, conf: 4, done: 0 }] : [], bookings: day === "2026-10-26" ? [BK("N1", "12:00", "삼아웃", "010-9999-0001", 4), BK("N2", "12:00", "보통손님", "010-7777-0003", 5)] : [] }),
          complete: async () => ({ ok: true }),
          cancelPaid: async (b) => { window.__nt.cancel.push(b); return { ok: true }; },
        },
        state: { load: () => null, save: () => {} },
        config: { get: async () => ({ build: "2.6" }), set: async () => ({ ok: true }) },
        notes: {
          get: async (j) => { const notes = {}; for (const k of j.keys) if (store[k]) notes[k] = store[k]; return { ok: true, notes }; },
          set: async () => ({ ok: true, note: null }),
          list: async () => ({ ok: true, list: [{ id: "a1b2c3d4e5f60718", bc: store["01099990001"].bc, sk: [], nm: "삼아웃", p4: "0001", m: "", bcAt: "2026-10-20", r3: "환불 요구하며 소란", r3At: "2026-10-20 10:00", at: "" }, { id: "0000aaaa1111bbbb", bc: 1, sk: [], nm: "일아웃", p4: "0002", m: "", bcAt: "2026-10-21", at: "" }] }),
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
    await page.waitForFunction(() => document.querySelector('.res:has(.bc3)'), null, { timeout: 5000 });
    assert.match(await page.textContent("#toast"), /3아웃 고객 예약 — 삼아웃 12:00 2장/);
    const card = page.locator('.res:has-text("삼아웃")');
    // 확인 창에서 [취소] → 그대로
    page.__accept = false;
    await card.locator("[data-act=bcCancel]").click();
    assert.deepStrictEqual(await page.evaluate(() => window.__nt.cancel), []);
    // [확인] → 네이버 전액 취소 → 카드가 빠짐
    page.__accept = true;
    await card.locator("[data-act=bcCancel]").click();
    await page.waitForFunction(() => window.__nt.cancel.length === 1);
    assert.deepStrictEqual(await page.evaluate(() => window.__nt.cancel.map((b) => [b.no, b.time, b.qty])), [["N1", "12:00", 2]]);
    await page.waitForFunction(() => !document.querySelector('.res .name') || ![...document.querySelectorAll(".res .name")].some((e) => /삼아웃/.test(e.textContent)));
    assert.match(await page.textContent("#toast"), /3아웃 고객 예약 전액 취소: 삼아웃/);
    // 설정 목록 (앱 본체) → 단계 바꾸기
    await page.dblclick("#now"); await page.click('[data-t="cust"]');
    await page.waitForFunction(() => /삼아웃/.test(document.querySelector("#sheet .bclist").textContent));
    assert.match(await page.textContent("#sheet .bclist"), /3아웃 사유: 환불 요구하며 소란 10\/20 10:00/, "목록에 3아웃 사유 · 때");
    assert.ok(await page.isDisabled('#sheet .bclist [data-act=bcLevel][data-id="0000aaaa1111bbbb"][data-n="3"]'), "목록에서는 3아웃으로 못 올림 (고객 카드에서 사유와 함께)");
    await page.fill("#bc-q", "0001");
    assert.match(await page.textContent("#sheet .bclist"), /삼아웃/);
    await page.fill("#bc-q", "없는사람");
    assert.match(await page.textContent("#sheet .bclist"), /찾는 손님이 없어요/);
    await page.fill("#bc-q", "");
    await page.click('#sheet .bclist [data-act=bcLevel][data-id="a1b2c3d4e5f60718"][data-n="3"]');
    await page.waitForFunction(() => window.__nt.patch.length === 1);
    assert.deepStrictEqual(await page.evaluate(() => window.__nt.patch), [{ id: "a1b2c3d4e5f60718", bc: 2 }], "3아웃을 다시 누르면 2아웃");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
