/* 방문 이벤트 (사용자 지시 10/14 · 1.37)
   - 운영 설정 → 방문 이벤트: 기준일을 정하면 그날부터 네이버 예약 손님마다 이용완료 횟수를 0부터 다시 셈 (네이버 숫자는 그대로, 데스크에서만)
     예) 기준일에 완료 7 → 7 = 0 · 8번째 이용완료가 이벤트 1번째
   - 켜는 순간 원래 로직(입장권에 네이버 완료 +1 누계 · 10회 사은권)은 멈추고, 회차별 안내(1 · 2 · 3 · 4 · 5번째 이상)를 그 자리에 출력
   - 손님마다 이름 · 전화번호 · 기준일 기준 완료 수를 이 PC 장부에 남김 → 끄면 원래대로 · 다시 켜면 그대로 이어서 */
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

async function enter(page, slot, name) {
  await page.click(`.slot[data-s="${slot}"]`);
  await page.click(`.res:has-text("${name}") >> nth=0`);
  for (let i = 0; i < 6 && !(await page.$("#enter-done:not([disabled])")); i++) await page.click(".kpick button:not([disabled]):not(.on) >> nth=0");
  await page.click("#enter-done");
}
const ticket = (page, name) => page.evaluate((n) => {
  const T = window.__deskTest;
  const h = T.holders().find((x) => x.name === n);
  return T.receiptLines(T.form(), T.keyVals(h)).map((l) => l.t.trim()).filter(Boolean);
}, name);
const card = async (page, slot, name) => { await page.click(`.slot[data-s="${slot}"]`); return (await page.textContent(`.res:has-text("${name}") >> nth=0`)).replace(/\s+/g, " "); };
const openEvent = async (page) => { await page.click("text=운영 설정"); await page.click('[data-t="event"]'); };

test("방문 이벤트: 기준일 적용 → 손님마다 0부터 · 회차별 안내 출력 · 원래 누계 · 사은권은 멈춤 · 끄면 원래대로", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 10/5 13:50 · 전시윤 14:00 완료 9 (이번이 10번째 = 사은권)

    assert.match(await card(page, 840, "전시윤"), /완료 9( · 취소 \d)? → 10번 완료 예정.*사은권 증정/, "꺼져 있으면 원래대로");
    await openEvent(page);
    assert.match(await page.textContent("#sheet"), /꺼짐/);
    await page.fill("#ev-from", "2026-10-05");
    await page.click("[data-act=evApply]");
    assert.match(await page.textContent("#sheet .evstate"), /켜짐.*10월 5일부터/);
    // 적용하는 순간: 오늘 예약 손님의 이름 · 전화번호 · 기준일 완료 수를 장부에
    const book = await page.evaluate(() => window.__deskTest.evBook());
    const ppl = Object.values(book.sets["2026-10-05"].people);
    const jeon = ppl.find((p) => p.name === "전시윤");
    assert.ok(jeon && jeon.base === 9 && /^010\d{8}$/.test(jeon.phone), JSON.stringify(jeon));
    assert.match(await page.textContent("#sheet"), new RegExp(`기록된 손님 ${ppl.length}명`));

    // 회차별 안내 쓰기: 1번째 · 2번째 (미리보기에 바로)
    await page.fill("#ev-text", "#* 이벤트 첫 방문\n^음료 1잔 무료 ({이벤트회}번째)");
    assert.match(await page.textContent("#ev-paper"), /이벤트 첫 방문.*음료 1잔 무료 \(1번째\)/);
    assert.doesNotMatch(await page.textContent("#ev-paper"), /네이버 예약 \d+번|사은권/, "미리보기에도 원래 누계 · 사은권 줄 없음");
    await page.click("[data-act=evTpl][data-i='1']");
    await page.fill("#ev-text", "#* 두 번째 방문\n^{기준일}부터 {이벤트회}번째");
    assert.match(await page.textContent("#ev-paper"), /두 번째 방문.*10월 5일부터 2번째/);
    await page.click("[data-act=evTpl][data-i='0']");
    assert.strictEqual(await page.inputValue("#ev-text"), "#* 이벤트 첫 방문\n^음료 1잔 무료 ({이벤트회}번째)", "회차마다 따로 남음");
    await page.click("#sheet [data-act=close] >> nth=0");

    // 카드: 네이버 숫자는 그대로 + 이벤트 회차 · 사은권 표시는 멈춤
    let c = await card(page, 840, "전시윤");
    assert.match(c, /완료 9( · 취소 \d)? → 10번 완료 예정/);
    assert.match(c, /이벤트 1번째/);
    assert.doesNotMatch(c, /사은권/);

    // 입장 → 입장권: 1번째 안내 · 원래 누계 · 사은권 줄 없음
    await enter(page, 840, "전시윤");
    assert.match(await page.textContent("#toast"), /이벤트 1번째/);
    assert.doesNotMatch(await page.textContent("#toast"), /사은권/);
    let t = await ticket(page, "전시윤");
    assert.ok(t.includes("이벤트 첫 방문") && t.includes("음료 1잔 무료 (1번째)"), t.join(" | "));
    assert.ok(!t.some((l) => /네이버 예약 \d+번|사은권|이용완료$/.test(l)), t.join(" | "));
    assert.ok(t.some((l) => /퇴장시간 지연/.test(l)), "나머지 양식은 그대로");

    // 같은 시간 나눠 한 예약(완료 8, 2건) → 함께 완료 9 · 10 → 이벤트 2번째 안내
    await enter(page, 900, "나분할");
    t = await ticket(page, "나분할");
    assert.ok(t.includes("두 번째 방문") && t.includes("10월 5일부터 2번째"), t.join(" | "));

    // 5번째 이상은 5번째 안내 ({이벤트회} 는 실제 회차)
    await page.evaluate(() => { const s = window.__deskTest.evBook().sets["2026-10-05"]; Object.values(s.people).find((p) => p.name === "홍예준").base = 4; });
    c = await card(page, 840, "홍예준");
    assert.match(c, /완료 10 → 11번 완료 예정.*이벤트 7번째/);
    await enter(page, 840, "홍예준");
    t = await ticket(page, "홍예준");
    assert.ok(t.includes("방문 이벤트 7번째"), "5번째 이상 = 5번째 기본 문구 · 회차 7 " + t.join(" | "));

    // 현장 입장권은 그대로 (네이버 예약 안내)
    const walk = await page.evaluate(() => { const T = window.__deskTest; const w = T.holders().find((x) => x.walk); return T.receiptLines(T.form(), T.keyVals(w)).map((l) => l.t); });
    assert.ok(walk.some((l) => /네이버 예약하고/.test(l)) && !walk.some((l) => /방문 이벤트/.test(l)));

    // 끄기 → 원래 로직 (누계 10 · 사은권) · 장부는 남음
    await openEvent(page);
    await page.click("[data-act=evOff]");
    assert.match(await page.textContent("#sheet .evstate"), /꺼짐/);
    await page.click("#sheet [data-act=close] >> nth=0");
    t = await ticket(page, "전시윤");
    assert.ok(t.some((l) => /네이버 예약 10번/.test(l)) && t.some((l) => /사은권/.test(l)) && !t.includes("이벤트 첫 방문"), t.join(" | "));
    assert.match(await card(page, 840, "전시윤"), /10번째 예약완료.*사은권 증정/);
    const kept = await page.evaluate(() => Object.values(window.__deskTest.evBook().sets["2026-10-05"].people).find((p) => p.name === "전시윤"));
    assert.deepStrictEqual([kept.base, kept.last], [9, 10], "기준 9 · 지금 10 (이벤트 1) 그대로");

    // 다시 켜기 (같은 기준일) → 그대로 이어서
    await openEvent(page);
    await page.click("[data-act=evApply]");
    assert.match(await page.textContent("#sheet .evlog"), /전시윤.*기준 9.*이벤트 1/);
    await page.click("#sheet [data-act=close] >> nth=0");
    assert.match(await card(page, 840, "전시윤"), /10번째 예약완료.*이벤트 1번째/);

    // 기준일이 아직 안 온 날이면 그날까지 원래대로
    await openEvent(page);
    await page.fill("#ev-from", "2026-10-06");
    await page.click("[data-act=evApply]");
    assert.match(await page.textContent("#sheet .evstate"), /10월 6일부터/);
    await page.click("#sheet [data-act=close] >> nth=0");
    assert.doesNotMatch(await card(page, 840, "전시윤"), /이벤트/);
    assert.ok((await ticket(page, "전시윤")).some((l) => /네이버 예약 10번/.test(l)));
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("방문 이벤트(앱): 기준일이 지난 날이면 저장 파일의 첫 입장 완료 수로 기준 · 장부는 이 PC 파일에 · 다시 켜도 그대로", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date("2026-10-14T13:00:00") });
    await page.addInitScript(() => {
      // 10/12 에 이미 한 번 온 손님(김기록: 그때 완료 6 → 7번째) · 10/10 은 기준일 전
      const files = {
        "2026-10-10": { v: 2, b: [{ id: "b1", day: "2026-10-10", no: "N0", slot: 600, name: "김기록", phone: "01012340000", qty: 1, status: "완료", prevDone: 5, visitNo: 6, keys: [], keysTaken: [2], enteredAt: 598 }], w: [], x: [] },
        "2026-10-12": { v: 2, b: [{ id: "b2", day: "2026-10-12", no: "N1", slot: 600, name: "김기록", phone: "01012340000", qty: 1, status: "완료", prevDone: 6, visitNo: 7, visitEnd: 7, keys: [], keysTaken: [3], enteredAt: 598 }], w: [], x: [] },
      };
      const BK = (no, time, name, phone, done) => ({ no, time, name, phone, qty: 1, qtyText: "1시간 50분 1", product: "1시간 50분", status: "확정", pay: "결제완료", doneCount: done, cancelCount: 0 });
      window.__ledger = localStorage.getItem("test-ledger");
      window.desk = {
        naver: {
          load: async (day) => ({ ok: true, day, slots: day === "2026-10-14" ? [{ time: "14:00", cap: 10, conf: 2, done: 0 }] : [], bookings: day === "2026-10-14" ? [BK("N2", "14:00", "김기록", "010-1234-0000", 7), BK("N3", "14:00", "박새로", "010-5555-0001", 3)] : [] }),
          complete: async () => ({ ok: true }),
        },
        state: { load: (day) => (files[day] && !window.__noFiles ? JSON.stringify(files[day]) : localStorage.getItem("test-state-" + day)), save: (day, json) => localStorage.setItem("test-state-" + day, json) },
        config: { get: async () => ({ build: "1.37", visitEvent: { on: true, from: "2026-10-12" } }), set: async () => ({ ok: true }) },
        ledger: { load: () => window.__ledger, save: (json) => { window.__ledger = json; localStorage.setItem("test-ledger", json); } },
      };
    });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    await page.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 15000 });
    await page.click('.slot[data-s="840"]');
    // 김기록: 기준일(10/12) 첫 입장 때 완료 6 → 기준 6 · 지금 완료 7 → 이번 8번째 = 이벤트 2번째 (10/12 방문이 1번째)
    assert.match((await page.textContent('.res:has-text("김기록")')).replace(/\s+/g, " "), /완료 7 → 8번 완료 예정.*이벤트 2번째/);
    // 박새로: 기준일 뒤 처음 → 기준 3 · 이번이 이벤트 1번째
    assert.match((await page.textContent('.res:has-text("박새로")')).replace(/\s+/g, " "), /완료 3 → 4번 완료 예정.*이벤트 1번째/);
    await page.waitForFunction(() => window.__ledger && /박새로/.test(window.__ledger));
    let led = JSON.parse(await page.evaluate(() => window.__ledger)).sets["2026-10-12"].people;
    assert.deepStrictEqual([led["01012340000"].base, led["01012340000"].src, led["01012340000"].first], [6, "기록", "2026-10-12"]);
    assert.deepStrictEqual([led["01055550001"].base, led["01055550001"].src, led["01055550001"].name], [3, "네이버", "박새로"]);

    // 다시 켜기: 장부에서 그대로 (저장 파일이 없어져도)
    await page.addInitScript(() => { window.__noFiles = true; });
    await page.goto(DESK);
    await page.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 15000 });
    await page.click('.slot[data-s="840"]');
    assert.match((await page.textContent('.res:has-text("김기록")')).replace(/\s+/g, " "), /이벤트 2번째/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
