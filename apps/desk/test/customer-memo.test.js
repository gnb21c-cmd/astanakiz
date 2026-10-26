/* 고객 메모 (사장님 10/20) — 네이버 예약자 창(입장 전 · 뒤)과 열쇠 창: 결제상태 밑 메모 2줄 · 이름 옆 [3자녀] [BC](블랙컨슈머)
   - 3자녀가정 = 이름 노랑 · 블랙컨슈머 = 이름 빨강 (둘 다면 빨강) — 예약 카드 · 예약자 창 · 열쇠 창 · 메모가 있으면 카드에 [메모]
   - 메모는 스크롤 없이 2줄 (줄바꿈 한 번까지 · 칸을 넘으면 더 안 써짐) · 쓰는 동안 0.6초 뒤 저장 · 창을 닫으면 바로 저장
   - 손님(전화번호)마다 → 다음 방문 · 다른 날에도 · 네이버 예약 메모는 불러오지 않음
   - 설치한 앱은 앱 본체(customer-notes.json · 해시)에 · 체험판은 브라우저 저장소 */
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
const close = (page) => page.click("#sheet [data-act=close] >> nth=0");

test("고객 메모(체험판): 체크 두 개 → 이름 노랑 · 빨강 · 메모 2줄 · 다시 켜도 그대로 · 열쇠 창에도 · 다 지우면 없어짐", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, colorScheme: "light" });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 10/5 13:50
    await page.click('.slot[data-s="840"]');
    const card = page.locator(".res:not(.done)").first();
    const name = (await card.locator(".name").textContent()).trim();
    await card.click();
    assert.match(await page.textContent("#sheet .facts"), /3자녀\s*BC\s*123/, "이름 옆 [3자녀] 다음 BC ①②③ (사장님 10/26)");
    assert.strictEqual(await page.inputValue("#note-m"), "", "네이버 메모는 불러오지 않음 — 처음엔 빈칸");
    // 3자녀가정 → 노랑 (밝은 화면은 짙은 노랑)
    await page.check("#note-k3");
    assert.strictEqual(await page.$eval("#sheet .facts .nm-k3", (e) => getComputedStyle(e).color), "rgb(168, 116, 0)");
    assert.match(await page.textContent("#toast"), /3자녀 표시 — 이름이 노랑/);
    assert.ok(await page.$(`.res .name .nm-k3`), "예약 카드 이름도 노랑");
    // 블랙컨슈머(BC 원아웃) → 빨강 (둘 다면 빨강)
    await page.click('#sheet [data-act=bcSet][data-n="1"]');
    assert.ok(await page.$("#sheet .facts .nm-bl"));
    assert.strictEqual(await page.$("#sheet .facts .nm-k3"), null, "둘 다면 빨강");
    // 메모: 줄바꿈은 한 번까지 · 2줄을 넘으면 더 안 써짐 (스크롤 없음)
    await page.click("#note-m");
    await page.keyboard.type("첫 줄");
    await page.keyboard.press("Enter");
    await page.keyboard.type("둘째 줄");
    await page.keyboard.press("Enter");
    await page.keyboard.type(" 셋째");
    assert.strictEqual((await page.inputValue("#note-m")).split("\n").length, 2, "줄바꿈 한 번까지");
    await page.keyboard.type(" 아주 긴 메모를 계속 씁니다".repeat(10));
    const fit = await page.$eval("#note-m", (t) => [t.scrollHeight <= t.clientHeight + 1, t.value.length, getComputedStyle(t).overflowY]);
    assert.deepStrictEqual([fit[0], fit[2]], [true, "hidden"], "2줄 칸 안 (스크롤 없음) " + fit[1]);
    assert.ok(fit[1] <= 120);
    await page.waitForTimeout(800);
    assert.match(await page.textContent("#note-at"), /13:50 저장/);
    const saved = await page.evaluate(() => window.__deskTest.notes());
    const key = Object.keys(saved)[0];
    assert.match(key, /^010\d{8}$/, "손님 = 전화번호");
    assert.deepStrictEqual([saved[key].k3, saved[key].bc, saved[key].m.startsWith("첫 줄\n둘째 줄")], [true, 1, true]);
    const box = await page.evaluate(() => document.getElementById("sheet").getBoundingClientRect().bottom);
    assert.ok(box <= 768, "예약자 창이 화면 안 " + box);
    await close(page);
    assert.match(await card.locator(".badge.memo").getAttribute("title"), /^첫 줄/, "카드에 [메모] (마우스를 올리면 내용)");

    // 다시 켜도 그대로 (같은 손님)
    await page.reload();
    await page.click('.slot[data-s="840"]');
    assert.ok(await page.$(".res .name .nm-bl"), "다시 켜도 빨강");
    await page.locator(".res:not(.done)").first().click();
    assert.match(await page.inputValue("#note-m"), /^첫 줄\n둘째 줄/);
    assert.ok(await page.isChecked("#note-k3") && (await page.getAttribute('#sheet [data-act=bcSet][data-n="1"]', "aria-pressed")) === "true");
    // 입장 → 열쇠 창에도 같은 메모 · 체크 (입장 뒤에도 고칠 수 있음)
    for (let i = 0; i < 6 && !(await page.$("#enter-done:not([disabled])")); i++) await page.click(".kpick button:not([disabled]):not(.on) >> nth=0");
    await page.click("#enter-done");
    const k = await page.evaluate((n) => window.__deskTest.holders().find((h) => h.name === n).keys[0], name);
    await page.click(`.key[data-k="${k}"]`);
    assert.ok(await page.$("#sheet .facts .nm-bl"), "열쇠 창 이름도 빨강");
    assert.match(await page.inputValue("#note-m"), /^첫 줄/);
    const kbox = await page.evaluate(() => document.getElementById("sheet").getBoundingClientRect().bottom);
    assert.ok(kbox <= 768, "열쇠 창이 화면 안 " + kbox);
    // 다 지우면 그 손님 메모가 없어짐
    await page.click('#sheet [data-act=bcSet][data-n="1"]'); // 같은 단계를 다시 누르면 한 단계 내림 → 0
    await page.uncheck("#note-k3");
    await page.fill("#note-m", "");
    await close(page);
    assert.deepStrictEqual(JSON.parse(await page.evaluate(() => localStorage.getItem("astanakiz-notes"))), {}, "다 비우면 지움");
    assert.strictEqual(await page.$(".res .name .nm-bl"), null);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("고객 메모(앱): 앱 본체에 손님 메모를 한 번에 물음 · 있던 표시로 이름 색 · 쓰는 동안 0.6초 뒤 한 번 · 창을 닫으면 바로 저장", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date("2026-10-20T11:50:00") });
    await page.addInitScript(() => {
      window.__nt = { get: [], set: [] };
      const BK = (no, time, name, phone, done) => ({ no, time, name, phone, qty: 1, qtyText: "1시간 50분 1", product: "1시간 50분", status: "확정", pay: "결제완료", doneCount: done, cancelCount: 0 });
      const store = { "01031346005": { m: "지난번 열쇠 늦게 반납", k3: false, bl: true, at: "2026-10-12 15:20" } };
      window.desk = {
        naver: { load: async (day) => ({ ok: true, day, slots: day === "2026-10-20" ? [{ time: "12:00", product: "1시간 50분", cap: 10, conf: 2, done: 0 }] : [], bookings: day === "2026-10-20" ? [BK("N1", "12:00", "김예나", "010-3134-6005", 2), BK("N2", "12:00", "박다둥", "010-7777-0003", 5)] : [] }), complete: async () => ({ ok: true }) },
        state: { load: () => null, save: () => {} },
        config: { get: async () => ({ build: "1.51" }), set: async () => ({ ok: true }) },
        notes: {
          get: async (j) => { window.__nt.get.push(j); const notes = {}; for (const k of j.keys) if (store[k]) notes[k] = store[k]; return { ok: true, notes }; },
          set: async (j) => { window.__nt.set.push(j); return { ok: true, note: j.m || j.k3 || j.bl ? { m: j.m, k3: j.k3, bl: j.bl, at: "2026-10-20 11:50" } : null }; },
        },
      };
    });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    await page.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 15000 });
    await page.click('.slot[data-s="720"]');
    const nt = () => page.evaluate(() => window.__nt);
    const got = (await nt()).get;
    assert.ok(got.length >= 1 && got.some((g) => g.keys.includes("01031346005") && g.keys.includes("01077770003")), "오늘 손님 전화번호로 한 번에 " + JSON.stringify(got));
    assert.ok(await page.$('.res:has-text("김예나") .name .nm-bl'), "있던 블랙컨슈머 표시 → 카드 이름 빨강");
    assert.strictEqual(await page.$('.res:has-text("박다둥") .name .nm-bl, .res:has-text("박다둥") .name .nm-k3'), null);
    await page.click('.res:has-text("김예나")');
    assert.strictEqual(await page.inputValue("#note-m"), "지난번 열쇠 늦게 반납");
    assert.match(await page.textContent("#note-at"), /10\/12 저장/);
    // 3자녀가정 체크 → 바로 저장
    await page.check("#note-k3");
    assert.deepStrictEqual((await nt()).set, [{ key: "01031346005", m: "지난번 열쇠 늦게 반납", k3: true, bc: 1, bl: true, nm: "", p4: "", sk: [] }], "예전 BC 체크 = 원아웃");
    // 메모 쓰기 → 쓰는 동안은 안 보내고 0.6초 뒤 한 번
    await page.click("#note-m");
    await page.keyboard.press("End");
    await page.keyboard.type(" · 3남매");
    await page.clock.runFor(300);
    assert.strictEqual((await nt()).set.length, 1, "쓰는 중엔 안 보냄");
    await page.clock.runFor(700);
    let set = (await nt()).set;
    assert.strictEqual(set.length, 2);
    assert.strictEqual(set[1].m, "지난번 열쇠 늦게 반납 · 3남매");
    // 또 쓰고 바로 닫음 → 닫을 때 저장
    await page.keyboard.type("!");
    await close(page);
    set = (await nt()).set;
    assert.strictEqual(set.length, 3, "창을 닫으면 바로 저장");
    assert.strictEqual(set[2].m, "지난번 열쇠 늦게 반납 · 3남매!");
    assert.ok(!JSON.stringify(set).includes("김예나"), "이름은 보내지 않음 (전화번호 키만 — 앱 본체가 해시로 바꿈)");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("글 칸 커서 되살리기 (사장님 10/26 · 메모 칸을 눌러도 커서가 어쩌다 안 생김): 창에 키보드 포커스가 없거나 칸에 커서가 안 가면 앱 본체에 다시 달라고 하고 그 칸에 커서 · 확인 창(confirm) 뒤에도", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date("2026-10-20T11:50:00") });
    await page.addInitScript(() => {
      window.__rf = 0;
      const BK = (no, time, name, phone, done) => ({ no, time, name, phone, qty: 1, qtyText: "1시간 50분 1", product: "1시간 50분", status: "확정", pay: "결제완료", doneCount: done, cancelCount: 0 });
      window.desk = {
        refocus: async () => { window.__rf++; return { ok: true }; },
        naver: { load: async (day) => ({ ok: true, day, slots: day === "2026-10-20" ? [{ time: "12:00", product: "1시간 50분", cap: 10, conf: 1, done: 0 }] : [], bookings: day === "2026-10-20" ? [BK("N1", "12:00", "메모손님", "010-3134-6005", 2)] : [] }), complete: async () => ({ ok: true }) },
        state: { load: () => null, save: () => {} },
        config: { get: async () => ({ build: "2.7" }), set: async () => ({ ok: true }) },
        notes: { get: async () => ({ ok: true, notes: {} }), set: async (j) => ({ ok: true, note: j.m ? { m: j.m, at: "2026-10-20 11:50" } : null }) },
      };
    });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    page.on("dialog", (d) => d.accept());
    await page.goto(DESK);
    await page.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 15000 });
    await page.click('.slot[data-s="720"]');
    await page.click('.res:has-text("메모손님")');
    const active = () => page.evaluate(() => (document.activeElement || {}).id || "");
    // 1) 보통: 누르면 바로 커서 · 앱 본체는 안 부름
    await page.click("#note-m");
    assert.strictEqual(await active(), "note-m");
    assert.strictEqual(await page.evaluate(() => window.__rf), 0, "잘 되면 부르지 않음");
    // 2) 칸을 눌렀는데 커서가 안 감 (창에 키보드 포커스가 없을 때처럼) → 그 칸에 커서 + 앱 본체에 창 포커스를 다시 달라고 함
    await page.evaluate(() => { document.activeElement.blur(); document.hasFocus = () => false; });
    await page.dispatchEvent("#note-m", "pointerup");
    await page.waitForFunction(() => window.__rf >= 1 && document.activeElement && document.activeElement.id === "note-m");
    await page.evaluate(() => { delete document.hasFocus; });
    await page.keyboard.type("열쇠 늦게");
    assert.strictEqual(await page.inputValue("#note-m"), "열쇠 늦게", "커서가 생겨 글이 써짐");
    // 3) 확인 창(confirm)을 닫은 뒤에도 → 다시 달라고 하고 쓰던 칸에 커서 그대로
    const before = await page.evaluate(() => window.__rf);
    assert.strictEqual(await page.evaluate(() => confirm("시험 확인 창")), true);
    await page.waitForFunction((n) => window.__rf > n, before);
    assert.strictEqual(await active(), "note-m");
    await page.keyboard.type(" 반납");
    assert.strictEqual(await page.inputValue("#note-m"), "열쇠 늦게 반납");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
