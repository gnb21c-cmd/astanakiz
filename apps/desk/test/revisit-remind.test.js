/* 재방문 안내 (사장님 11/15 · 11/16 바꿈): 재방문 이벤트 손님 중 돈까스 기한이 8일 남은 사람 (손님께는 하루 줄여 '7일') — 어제 마감 기준
   - 아직 안 받은 사람 · 받고 다시 기한이 도는 사람 모두 · 기한 = 마지막 방문 + 20일(그날 영수증 기한이 더 늦으면 그것) · 이벤트 종료일까지
   - 오늘 이미 온 사람은 '오늘 방문 — 안 보내도 돼요' · 열쇠판 위 [재방문 안내 n] (n = 아직 '보냄'을 안 누른 사람)
   - 안내 이미지(그날 기한 · 640×960 JPG) · 문구((광고) · 수신거부) · 번호 복사 · 보냄 (그날 이 PC 에) */
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

// 장부 줄 (가짜 손님 · 시작일 10/26)
const line = (k, name, day, n, st, due, no) => JSON.stringify({ k, name, phone: k, n, base: 3, no, at: `${day} 11:00`, day, st, due });
const LEDGER = [
  line("01011110001", "가손님", "2026-11-03", 4, "안내", "2026-11-23", "a1"), // D-8 · 아직
  line("01011110002", "나손님", "2026-10-27", 4, "안내", "2026-11-16", "b1"),
  line("01011110002", "나손님", "2026-11-03", 5, "성공", "2026-11-23", "b2"), // D-8 · 1번 받음
  line("01011110003", "다손님", "2026-11-03", 4, "안내", "2026-11-23", "c1"),
  line("01011110003", "다손님", "2026-11-15", 5, "성공", "2026-11-30", "c2"), // D-8 이었지만 오늘 옴
  line("01011110004", "라손님", "2026-11-12", 4, "안내", "2026-11-30", "d1"), // 11/30 까지 15일 → 아님
  line("01011110005", "마손님", "2026-10-26", 4, "안내", "2026-11-15", "e1"), // 오늘이 기한 → 아님
  line("01011110006", "바손님", "2026-10-27", 4, "안내", "2026-11-23", "f1"), // 영수증 기한(11/22)이 20일보다 늦음 → D-8
  line("01011110007", "사손님", "2026-10-31", 4, "안내", "2026-11-20", "g1"), // 5일 남음 → 이제 아님 (예전 D-5)
  line("01011110008", "아손님", "2026-10-29", 4, "성공", "2026-11-18", "h1"), // 3일 남음 → 이제 아님 (예전 D-3)
].join("\n") + "\n";

test("재방문 안내 (사장님 11/16): 기한 8일 남은 손님에게 한 번 · 손님께는 하루 줄여 '7일' · 오늘 온 손님은 빼고 셈 · 홍보 사진 안내 이미지 · 문구 · 보냄", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await page.addInitScript((led) => {
      window.__today = "2026-11-15";
      if (!localStorage.getItem("astanakiz-visitlog-2026-10-26")) {
        localStorage.setItem("astanakiz-visitevent", JSON.stringify({ ver: 2, on: true, from: "2026-10-26", to: "2026-11-30", days: 20, gift: "수제돈까스" }));
        localStorage.setItem("astanakiz-visitlog-2026-10-26", led);
      }
    }, LEDGER);
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    await page.waitForFunction(() => window.__deskTest && document.getElementById("rev-btn") && !document.getElementById("rev-btn").hidden, null, { timeout: 15000 }); // 바쁜 컴퓨터에서도 다 그려진 뒤
    const t = await page.evaluate(() => { const r = window.__deskTest.rev.targets(); return Object.fromEntries(Object.entries(r).map(([l, v]) => [l, v.map((x) => [x.name, x.due, x.ok, x.today])])); });
    assert.deepStrictEqual(t, {
      8: [["가손님", "2026-11-23", 0, false], ["나손님", "2026-11-23", 1, false], ["바손님", "2026-11-23", 0, false], ["다손님", "2026-11-23", 0, true]],
    }, "8일 남은 사람만 (5일 · 3일 남은 사손님 · 아손님은 이제 아님)");
    assert.strictEqual(await page.getAttribute("#rev-btn", "hidden"), null);
    assert.strictEqual((await page.textContent("#rev-btn")).trim(), "재방문 안내3", "보낼 사람 3 (오늘 온 사람 빼고)");
    await page.click("#rev-btn");
    const sheet = (await page.textContent("#sheet")).replace(/\s+/g, " ");
    assert.match(sheet, /D-8 · 기한 11월 23일\(월\) · 손님께는 '7일' 3명 · 보냄 0/);
    assert.match(sheet, /기한이 8일 남은 사람이에요 .* 하루 줄여 '7일'로 알려요/);
    const rows = await page.$$eval("#sheet .rvrow", (e) => e.map((r) => [...r.children].map((c) => c.textContent.trim()).filter(Boolean).join(" | ")));
    assert.deepStrictEqual(rows, [
      "가손님 | 010-1111-0001 | 방문 1번 · 아직 안 받음 · 마지막 11/3 | 번호 복사 | 보냄",
      "나손님 | 010-1111-0002 | 방문 2번 · 수제돈까스 1번 받음 · 마지막 11/3 | 번호 복사 | 보냄",
      "바손님 | 010-1111-0006 | 방문 1번 · 아직 안 받음 · 마지막 10/27 | 번호 복사 | 보냄",
      "다손님 | 010-1111-0003 | 방문 1번 · 아직 안 받음 · 마지막 11/3 | 오늘 방문 — 안 보내도 돼요",
    ]);
    assert.match(sheet, /무료 수신거부 방법/, "수신거부 안내가 없으면 알림");
    assert.strictEqual(await page.textContent("#rev-msg-8"), "(광고) 아스타나키즈\n고객님 아직 7일 남았습니다. 7일 안에 방문하셔서 수제돈까스 받아가세요.\n네이버에서 '아스타나키즈' 예약하고 오세요.");
    // 안내 이미지: 홍보 사진이 들어간 JPG · MMS 크기 안
    await page.waitForFunction(() => /^data:image\/jpeg/.test(document.getElementById("rev-img-8").src));
    const size = await page.evaluate(async () => { const u = await window.__deskTest.rev.image(8); const i = new Image(); i.src = u; await i.decode(); return { w: i.width, h: i.height, kb: Math.round((u.length * 3) / 4 / 1024) }; });
    assert.deepStrictEqual([size.w, size.h], [640, 960]);
    assert.ok(size.kb < 300, `MMS 300KB 안: ${size.kb}KB`);
    // 보냄 → 단추 숫자 줄어듦 · 다시 열어도 그대로
    await page.click('#sheet [data-act=revSentT][data-id="8|01011110001"]');
    assert.match((await page.textContent("#sheet")).replace(/\s+/g, " "), /D-8 · 기한 11월 23일\(월\) · 손님께는 '7일' 3명 · 보냄 1/);
    assert.strictEqual((await page.textContent("#rev-btn")).trim(), "재방문 안내2");
    await page.click('#sheet [data-act=revCopy] >> nth=0');
    await page.waitForFunction(() => /번호를 복사/.test(document.getElementById("toast").textContent)); // 복사는 비동기 (체험판은 브라우저 · 앱은 본체 클립보드)
    await page.click("#sheet [data-act=close]");
    // 수신거부 안내 (운영 설정 → 재방문 이벤트) → 문구 맨 아래
    await page.dblclick("#now");
    await page.click("[data-t=event]");
    await page.fill("#ev-optout", "무료수신거부 080-000-0000");
    await page.click("#sheet [data-act=close]");
    assert.match(await page.evaluate(() => window.__deskTest.rev.msg(8)), /\n무료수신거부 080-000-0000$/);
    await page.reload();
    await page.waitForTimeout(300);
    await page.waitForFunction(() => document.getElementById("rev-btn").textContent.trim() === "재방문 안내2", null, { timeout: 5000 }); // 보냄은 그날 이 PC 에 남음 (다시 연 직후 화면이 다 그려질 때까지)
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("재방문 안내: 이벤트가 꺼져 있거나 대상이 없으면 단추 없음", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await page.addInitScript(() => { window.__today = "2026-11-15"; });
    await page.goto(DESK);
    await page.waitForTimeout(300);
    assert.strictEqual(await page.isHidden("#rev-btn"), true);
  } finally {
    await browser.close();
  }
});
