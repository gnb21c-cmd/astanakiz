/* 서비스 키 (사장님 10/16)
   - 열쇠 창 [서비스 키] (+1타임 오른쪽): 빈 열쇠 중 하나를 골라 판매 아닌 열쇠로 더 줌 → 처음 누른 열쇠 손님(네이버 · 현장)과 연결
   - 원래 손님이 먼저 반납 · 퇴장해도 서비스 키에는 연결 정보가 그대로 · 서비스 키는 따로 반납 (원래 손님 [모두 반납]에 안 섞임)
   - 현장입장 창 왼쪽 아래 [서비스 키]: 임직원 등 예약 없이 쓸 때 — 쓰는 사람(이름 · 전화)만 적고 등록 · 결제 · 입장권 · 설문 없음
   - 총 판매수 · 네이버/현장 인원(시간표 · 좌석 · 보고 파일 w)에 안 들어감 · 초과요금 없음 · 저장 파일 s 로 따로 */
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
const sold = async (page) => Number((await page.textContent("#sold")).replace(/\D/g, ""));
const keyText = (page, k) => page.$eval(`.key[data-k="${k}"]`, (e) => ({ cls: e.className, text: [...e.children].map((c) => c.textContent.trim()).filter(Boolean).join(" ") }));

test("서비스 키: 열쇠 창에서 빈 열쇠를 골라 연결 · 판매수 그대로 · 원래 손님이 먼저 나가도 연결 정보 유지 · 따로 반납", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 10/5 13:50 · 6번 오유나(1개) · 24, 25번 조아인(2개)
    const sold0 = await sold(page);
    const seats0 = (await page.evaluate(() => window.__deskTest.capPresent())).length;

    await page.click('.key[data-k="6"]');
    const row = await page.$$eval("#sheet .mvrow button", (e) => e.map((b) => b.textContent.trim()));
    assert.deepStrictEqual(row.slice(-2), ["+1타임", "서비스 키"], "+1타임 오른쪽에 [서비스 키]");
    await page.click("#sheet [data-act=svcPick]");
    const free = await page.$$eval("#sheet .svckeys button", (e) => e.map((b) => Number(b.dataset.k)));
    assert.ok(free.includes(40) && !free.includes(6) && !free.includes(24), "빈 열쇠만 고름");
    const box = await page.evaluate(() => { const r = document.getElementById("sheet").getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
    assert.ok(box.top >= 0 && box.bottom <= 768, "1024×768 안에 " + JSON.stringify(box));
    await page.click('#sheet [data-act=svcGive][data-k="40"]');
    assert.match(await page.textContent("#toast"), /40번 서비스 키 → 오유나 6번 손님과 연결/);
    assert.match(await page.textContent("#sheet .svcgiven"), /40.*판매 아님/);
    assert.strictEqual(await page.$("#sheet .svcpick"), null, "고르면 닫힘");
    const k40 = await keyText(page, 40);
    assert.match(k40.cls, /\bsvc\b/);
    assert.strictEqual(k40.text, "40 서비스");
    assert.strictEqual(await sold(page), sold0, "총 판매수 그대로");
    assert.strictEqual((await page.evaluate(() => window.__deskTest.capPresent())).length, seats0, "네이버 · 현장 인원(좌석)에 안 셈");
    assert.strictEqual(await page.textContent("#sheet .rall"), "6번 반납 · 퇴장", "원래 손님 반납에 서비스 키는 안 섞임");

    // 원래 손님이 먼저 반납 · 퇴장 → 서비스 키는 그대로 · 연결 정보 유지
    await page.click("#sheet .rall");
    assert.strictEqual((await keyText(page, 6)).text, "6", "6번은 빈 열쇠");
    assert.match((await keyText(page, 40)).text, /서비스/, "40번은 아직 나가 있음");
    await page.click('.key[data-k="40"]');
    assert.match(await page.textContent("#sheet-title"), /40번 서비스 키\s*판매 아님/);
    const facts = (await page.textContent("#sheet .facts")).replace(/\s+/g, " ");
    assert.match(facts, /연결 손님\s*오유나님 6번 열쇠 · 네이버 예약 \d+ 먼저 반납 · 퇴장함/);
    assert.match(facts, /판매수 · 인원에 안 셈 · 초과요금 없음/);
    assert.strictEqual(await page.$("#sheet [data-act=plusSlot]"), null, "서비스 키는 +1타임 없음 (판매가 생김)");
    assert.strictEqual(await page.$("#sheet [data-act=svcPick]"), null);
    await page.click("#sheet .rall");
    assert.match(await page.textContent("#toast"), /40번 서비스 키 반납 · 오유나 6번 손님 연결 퇴장/);
    assert.strictEqual((await keyText(page, 40)).text, "40");

    // 입장권 목록: 서비스 줄은 '서비스'(합계에 안 들어감) · 고객 카드에 연결
    await page.click("#sold");
    const help = await page.textContent("#sheet .help");
    assert.match(help, new RegExp(`합계 ${sold0}장`), "목록 합계도 그대로");
    const srow = (await page.textContent('.srow:has-text("서비스 키 · 오유나 6번")')).replace(/\s+/g, " ");
    assert.match(srow, /40번.*서비스/);
    await page.click('.srow:has-text("서비스 키 · 오유나 6번")');
    const card = (await page.textContent("#sheet .reccard")).replace(/\s+/g, " ");
    assert.match(card, /수량\s*서비스 키 \(판매 아님\)/);
    assert.match(card, /연결\s*오유나 6번 손님에게 준 서비스 키 · 예약 \d+/);
    await page.click("#sheet [data-act=soldList]");
    await page.click('.srow:has-text("오유나") >> nth=-1');
    assert.match((await page.textContent("#sheet .reccard")).replace(/\s+/g, " "), /서비스 키\s*40 이 손님에게 줌 \(판매 아님\)/);
    await close(page);

    // 열쇠 2개 손님: [모두 반납 (2개)] 는 그 손님 열쇠만 · 서비스 키는 따로
    await page.click('.key[data-k="24"]');
    await page.click("#sheet [data-act=svcPick]");
    await page.click('#sheet [data-act=svcGive][data-k="41"]');
    assert.deepStrictEqual(await page.$$eval("#sheet [data-act=returnKey]", (e) => e.map((b) => b.textContent)), ["24번만", "25번만"]);
    assert.strictEqual(await page.textContent("#sheet .rall"), "모두 반납 (2개)");
    await page.click("#sheet .rall");
    assert.match((await keyText(page, 41)).text, /서비스/, "41번 서비스 키는 남음");

    // 초과요금 손님(1번)에게 준 서비스 키: 반납 시각 · 색은 같게 시작 · 초과요금은 없음 (바로 반납 가능)
    await page.click('.key[data-k="1"]');
    assert.ok(await page.isDisabled("#sheet .rall"), "1번은 초과요금 결제 전엔 반납 잠김");
    await page.click("#sheet [data-act=svcPick]");
    await page.click('#sheet [data-act=svcGive][data-k="42"]');
    await close(page);
    assert.match((await keyText(page, 42)).cls, /\bred\b/, "같은 반납 시각 → 같은 색");
    await page.click('.key[data-k="42"]');
    assert.strictEqual((await page.textContent("#meter")).trim(), "", "초과요금 미터 없음");
    assert.ok(!(await page.isDisabled("#sheet .rall")));
    await close(page);

    // 일괄 반납 목록에는 서비스 키도 (다른 열쇠와 같게)
    await page.click("[data-act=bulkReturn]");
    assert.match(await page.textContent("#sheet .bulklist"), /서비스 키 · 조아인 24, 25번 손님 연결\s*41번/);
    await close(page);
    assert.strictEqual(await sold(page), sold0);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("서비스 키: 현장입장 창 왼쪽 아래 — 임직원 등 예약 없이 · 쓰는 사람만 적고 등록 · 판매 · 설문 없음", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    const sold0 = await sold(page);
    // 설문조사를 현장구매자까지 켜 둬도 서비스 키는 설문 없이
    await page.evaluate(() => Object.assign(window.__deskTest.SV, { on: true, from: "2026-10-01", to: "2026-10-31", walkin: true }));

    await page.click('.key[data-k="32"]');
    assert.ok(await page.$("#sheet .svwalk"), "판매 창은 설문 번호");
    const btn = await page.$eval("#sheet .wleft .svcwalk button", (b) => b.textContent.trim());
    assert.strictEqual(btn, "서비스 키 (판매 아님)", "왼쪽 단계 안내 아래");
    await page.click("#sheet [data-act=svcWalk]");
    assert.match(await page.textContent("#sheet-title"), /현장입장 · 서비스 키\s*판매 아님/);
    assert.strictEqual(await page.$("#sheet [data-act=pay]"), null, "POS 결제 단계 없음");
    assert.strictEqual(await page.$("#sheet .svwalk"), null, "설문 없음");
    assert.ok(await page.isDisabled("#w-done"), "쓰는 사람을 적기 전엔 잠김");
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), "w-svcname");
    await page.fill("#w-svcname", "홍길동 매니저");
    assert.ok(!(await page.isDisabled("#w-done")));
    for (const k of "1234") await page.click(`.keypad [data-k="${k}"]`); // 전화를 쓰다 말면 잠김 (다 넣거나 비우기)
    assert.ok(await page.isDisabled("#w-done"));
    await page.click('.keypad [data-k="clr"]');
    assert.ok(!(await page.isDisabled("#w-done")));
    await page.click('#sheet [data-act=qty][data-d="1"]');
    assert.deepStrictEqual(await page.$$eval("#sheet .bigkey", (e) => e.map((x) => x.textContent)), ["32", "33"]);
    const box = await page.evaluate(() => { const r = document.getElementById("sheet").getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
    assert.ok(box.top >= 0 && box.bottom <= 768, JSON.stringify(box));
    await page.click("#w-done");
    const toast = await page.textContent("#toast");
    assert.match(toast, /서비스 키 32, 33번 · 직원 홍길동 매니저 등록/);
    assert.doesNotMatch(toast, /입장권/, "입장권 출력 없음");
    assert.strictEqual((await keyText(page, 32)).text, "32 서비스");
    assert.strictEqual((await keyText(page, 33)).text, "33 서비스");
    assert.strictEqual(await sold(page), sold0, "총 판매수 그대로");
    const x = await page.evaluate(() => window.__deskTest.svcKeys().map((s) => ({ staff: s.staff, name: s.name, phone: s.phone, keys: s.keys, qty: s.qty, of: s.of })));
    assert.deepStrictEqual(x, [{ staff: true, name: "홍길동 매니저", phone: "", keys: [32, 33], qty: 0, of: null }]);

    // 열쇠 창: 사용자 = 직원 · 반납 시각은 현장 손님과 같은 규칙 · 한 개씩 반납도 다른 열쇠와 같음
    await page.click('.key[data-k="33"]');
    const facts = (await page.textContent("#sheet .facts")).replace(/\s+/g, " ");
    assert.match(facts, /사용자\s*직원 · 홍길동 매니저 예약 없이 쓰는 열쇠/);
    assert.match(facts, /15:20 반납/, "13:30 입장 타임 + 1시간 50분");
    await page.click('#sheet [data-act=returnKey][data-k="33"]');
    assert.match(await page.textContent("#toast"), /^33번 서비스 키 반납$/);
    await close(page);

    // 전화번호만으로도 등록 · [← 판매로 돌아가기]
    await page.click('.key[data-k="34"]');
    await page.click("#sheet [data-act=svcWalk]");
    await page.click("#sheet [data-act=svcWalk]");
    assert.ok(await page.$("#sheet [data-act=pay]"), "판매 창으로 돌아옴");
    await page.click("#sheet [data-act=svcWalk]");
    for (const k of "55556666") await page.click(`.keypad [data-k="${k}"]`);
    await page.click("#w-done");
    assert.match(await page.textContent("#toast"), /서비스 키 34번 · 직원 등록/);
    await page.click('.key[data-k="34"]');
    assert.match(await page.textContent("#sheet .facts"), /010-5555-6666/);
    await close(page);
    assert.strictEqual(await sold(page), sold0);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("서비스 키(앱): 저장 파일 s 로 따로 (w 아님) · 다시 켜도 열쇠 · 연결 그대로", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date("2026-10-16T14:05:00") });
    await page.addInitScript(() => {
      const cfg = { build: "1.43" };
      const done = () => localStorage.getItem("test-done") === "1"; // 네이버 이용완료를 기억 (다시 켜면 완료로 불러옴)
      const BK = (no, time, name, phone, qty) => ({ no, time, name, phone, qty, qtyText: `1시간 50분 ${qty}`, product: "1시간 50분", status: done() ? "완료" : "확정", pay: "결제완료", doneCount: 2, cancelCount: 0 });
      window.desk = {
        naver: { load: async (day) => ({ ok: true, day, slots: day === "2026-10-16" ? [{ time: "14:00", cap: 10, conf: done() ? 0 : 2, done: done() ? 2 : 0 }] : [], bookings: day === "2026-10-16" ? [BK("N1", "14:00", "김연결", "010-7777-0001", 2)] : [] }),
          complete: async () => { localStorage.setItem("test-done", "1"); return { ok: true }; } },
        state: { load: (day) => localStorage.getItem("test-state-" + day), save: (day, json) => localStorage.setItem("test-state-" + day, json) },
        config: { get: async () => cfg, set: async (patch) => { Object.assign(cfg, patch); return { ok: true }; } },
      };
    });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    const ready = () => page.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 15000 });
    await page.goto(DESK);
    await ready();
    await page.click('.slot[data-s="840"]');
    await page.click('.res:has-text("김연결")');
    await page.click(".kpick button:not([disabled]):not(.on) >> nth=0");
    await page.click(".kpick button:not([disabled]):not(.on) >> nth=0");
    await page.click("#enter-done");
    await page.waitForFunction(() => window.__deskTest.holders().some((h) => h.name === "김연결" && h.keys.length === 2));
    const sold0 = await sold(page);
    const ks = await page.evaluate(() => window.__deskTest.holders().find((h) => h.name === "김연결").keys);
    await page.click(`.key[data-k="${ks[0]}"]`);
    await page.click("#sheet [data-act=svcPick]");
    await page.click('#sheet [data-act=svcGive][data-k="45"]');
    await close(page);
    await page.click('.key[data-k="44"]');
    await page.click("#sheet [data-act=svcWalk]");
    await page.fill("#w-svcname", "이직원");
    await page.click("#w-done");
    assert.strictEqual(await sold(page), sold0);

    const saved = JSON.parse(await page.evaluate(() => localStorage.getItem("test-state-2026-10-16")));
    assert.deepStrictEqual(saved.w, [], "보고 시스템이 세는 현장 구매(w)에 없음");
    assert.deepStrictEqual(saved.s.map((x) => [x.keys, x.qty, x.of && x.of.name, x.of && x.of.no, x.of && x.of.keys, x.staff || false, x.name]),
      [[[45], 0, "김연결", "N1", ks, false, "김연결"], [[44], 0, null, null, null, true, "이직원"]]);

    // 원래 손님 퇴장 뒤 다시 켜기 → 서비스 키 · 연결 그대로
    await page.click(`.key[data-k="${ks[0]}"]`);
    await page.click("#sheet .rall");
    await page.goto(DESK);
    await ready();
    assert.strictEqual((await keyText(page, 45)).text, "45 서비스");
    assert.strictEqual((await keyText(page, 44)).text, "44 서비스");
    assert.strictEqual((await keyText(page, ks[0])).text, String(ks[0]));
    await page.click('.key[data-k="45"]');
    assert.match((await page.textContent("#sheet .facts")).replace(/\s+/g, " "), new RegExp(`연결 손님\\s*김연결님 ${ks.join(", ")}번 열쇠 · 네이버 예약 N1 먼저 반납 · 퇴장함`));
    await close(page);
    assert.strictEqual(await sold(page), sold0, "다시 켜도 판매수 그대로");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
