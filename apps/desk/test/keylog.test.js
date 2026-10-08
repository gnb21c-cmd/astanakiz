/* 열쇠 추적 (사용자 지시 10/8): 일괄 반납 옆 경고 문구 · 입장권 목록 = 열쇠를 가져간 순서(최근이 위) + 열쇠 번호
   반납해도 · 일괄 반납해도 열쇠 번호가 남음 · 줄을 누르면 고객 카드(전화번호) · 열쇠 번호로 최근 2주 찾기 · 지난날 기록(저장 파일) 보기 */
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
const rowsOf = (page) => page.$$eval(".soldlist > .srow", (e) => e.map((x) => ({ name: x.querySelector(".sn").textContent.trim(), keys: x.querySelector(".sk").textContent.replace(/\s+/g, " ").trim(), at: x.querySelector(".st").textContent.trim() })));

test("경고 문구 · 입장권 목록 최근 입장 순 · 반납해도 열쇠 번호 남음 · 고객 카드 · 열쇠 번호로 찾기", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    page.on("dialog", (d) => d.accept());
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);

    // 일괄 반납 버튼 왼쪽 빈 곳에 굵은 두 줄 경고
    const w = await page.evaluate(() => {
      const e = document.querySelector(".bulkwarn"), r = e.getBoundingClientRect();
      const cafe = document.getElementById("talk-cafe").getBoundingClientRect(), bulk = document.getElementById("bulk-btn").getBoundingClientRect();
      return { text: e.innerText.split("\n").map((s) => s.trim()), bold: +getComputedStyle(e).fontWeight >= 700, between: r.left >= cafe.right && r.right <= bulk.left, sameRow: r.top < bulk.bottom && r.bottom > bulk.top };
    });
    assert.deepStrictEqual(w, { text: ["모든 키 반납 확인 후", "한번에 종료 처리 하세요"], bold: true, between: true, sameRow: true });

    // 입장권 목록: 열쇠를 가져간 순서 (최근 입장이 맨 위)
    await page.$eval("#sold", (e) => e.click());
    let rows = await rowsOf(page);
    assert.strictEqual(rows[0].name, "황수아");
    assert.match(rows[0].keys, /9.*10/);
    const mins = rows.map((r) => { const m = r.at.match(/(\d\d):(\d\d)/); return +m[1] * 60 + +m[2]; });
    assert.deepStrictEqual(mins, mins.slice().sort((a, b) => b - a), "최근 입장이 위: " + rows.map((r) => r.at).join(" "));
    assert.strictEqual(rows[rows.length - 1].name, "김철수", "가장 먼저(09:57) 입장한 사람이 맨 밑");
    assert.match(rows.find((r) => r.name === "홍길동").keys, /^1/, "이미 반납한 손님도 열쇠 번호가 남음");
    assert.ok(rows.some((r) => r.name === "현장구매자" && /30.*31/.test(r.keys)));

    // 줄을 누르면 고객 카드 (전화번호)
    await page.click('.soldlist > .srow:has-text("홍길동")');
    let card = await page.textContent("#sheet");
    assert.match(card, /고객 카드/);
    assert.match(card, /010-\d{4}-\d{4}/);
    assert.match(card.replace(/\s+/g, " "), /열쇠 ?1 11:52 반납/);
    await page.click("#sheet [data-act=soldList]");
    assert.ok(await page.isVisible(".soldlist"), "목록으로 돌아감");
    await page.click('.soldlist > .srow:has-text("현장구매자") >> nth=0');
    assert.match(await page.textContent("#sheet"), /010-8443-0217/, "현장구매자도 전화번호");
    await page.click("[data-act=close] >> nth=0");

    // 열쇠 하나 반납 → 목록에 그대로 · 일괄 반납 → '일괄 반납' 표시
    await page.click('.key[data-k="7"]');
    await page.click("[data-act=returnAll]");
    await page.click("#bulk-btn");
    await page.click("[data-act=bulkDo]");
    await page.$eval("#sold", (e) => e.click());
    rows = await rowsOf(page);
    assert.match(rows.find((r) => r.name === "서도현").keys, /^7번$/, "하나씩 반납: 일괄 표시 없음 — " + rows.find((r) => r.name === "서도현").keys);
    assert.match(rows.find((r) => r.name === "황수아").keys, /9.*10.*일괄/, "일괄 반납한 열쇠는 표시");

    // 열쇠 번호로 찾기: 1번 = 장시우(11:28) → 홍길동(09:58)
    await page.selectOption("#sold-key", "1");
    rows = await rowsOf(page);
    assert.deepStrictEqual(rows.map((r) => r.name), ["장시우", "홍길동"]);
    assert.match(await page.textContent("#sheet"), /1번 열쇠/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("지난날 입장 기록(저장 파일)도 목록 · 열쇠 찾기 · 고객 카드 — 2주", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date("2026-10-08T10:30:00") });
    await page.addInitScript(() => {
      const yday = {
        v: 2,
        b: [{ id: "b9", day: "2026-10-07", no: "1370000001", slot: 840, name: "이어제", phone: "01012340001", qty: 2, status: "완료", keys: [], keysTaken: [17, 18], enteredAt: 838, outAt: 1200, bulkOut: true }],
        w: [{ id: "w9", name: "현장입장자", phone: "01055556666", keys: [], keysTaken: [17], qty: 1, enteredAt: 1000, slot: 990, posNo: "POS-0099", outAt: 1100, walk: true }],
        x: [],
      };
      localStorage.setItem("test-state-2026-10-07", JSON.stringify(yday));
      window.desk = {
        naver: { load: async (day) => ({ ok: true, day, slots: [], bookings: [] }), complete: async () => ({ ok: true }) },
        state: { load: (day) => localStorage.getItem("test-state-" + day), save: (day, json) => localStorage.setItem("test-state-" + day, json) },
      };
    });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    await page.$eval("#sold", (e) => e.click());
    assert.match(await page.textContent(".soldlist"), /아직 없어요/);
    await page.click("[data-act=soldDay][data-d='-1']"); // 어제
    let rows = await rowsOf(page);
    assert.deepStrictEqual(rows.map((r) => r.name), ["현장구매자", "이어제"], "16:40 현장 → 13:58 예약 (최근이 위)");
    assert.match(rows[1].keys, /17.*18.*일괄/);
    await page.click('.soldlist > .srow:has-text("이어제")');
    assert.match(await page.textContent("#sheet"), /010-1234-0001/);
    await page.click("#sheet [data-act=soldList]");
    // 오늘 목록에서 열쇠 17번 찾기 → 어제 기록까지
    await page.selectOption("#sold-key", "17");
    rows = await rowsOf(page);
    assert.deepStrictEqual(rows.map((r) => r.name), ["현장구매자", "이어제"]);
    assert.ok(rows.every((r) => /10\/7/.test(r.at)), "날짜가 같이 보임");
    // 2주 전까지만
    await page.selectOption("#sold-key", "");
    for (let i = 0; i < 20; i++) { const b = await page.$("[data-act=soldDay][data-d='-1']:not([disabled])"); if (!b) break; await b.click(); }
    assert.match(await page.textContent("#sheet-title"), /9\.25/, "오늘 포함 2주(14일) — 9/25까지");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
