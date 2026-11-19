/* 재방문 안내 (사장님 11/15 · 11/16 바꿈): 재방문 이벤트 손님 중 돈까스 기한이 8일 남은 사람 (손님께는 하루 줄여 '7일') — 어제 마감 기준
   - 아직 안 받은 사람 · 받고 다시 기한이 도는 사람 모두 · 기한 = 마지막 방문 + 20일(그날 영수증 기한이 더 늦으면 그것) · 이벤트 종료일까지
   - 오늘 이미 온 사람은 '오늘 방문 — 안 보내도 돼요' · 열쇠판 위 [재방문 안내 n] (n = 아직 '보냄'을 안 누른 사람)
   - 안내 이미지(그날 기한 · 640×960 JPG) · 문구((광고) · 수신거부 없음 — 사장님 11/17 · 맨 아래 한 줄은 적었을 때만) · 번호 복사 · 보냄 (그날 이 PC 에) */
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
  line("01011110001", "가손님", "2026-11-02", 4, "안내", "2026-11-22", "a1"), // D-8 · 아직
  line("01011110002", "나손님", "2026-10-26", 4, "안내", "2026-11-15", "b1"),
  line("01011110002", "나손님", "2026-11-02", 5, "성공", "2026-11-22", "b2"), // D-8 · 1번 받음
  line("01011110003", "다손님", "2026-11-02", 4, "안내", "2026-11-22", "c1"),
  line("01011110003", "다손님", "2026-11-15", 5, "성공", "2026-11-30", "c2"), // D-8 이었지만 오늘 옴
  line("01011110004", "라손님", "2026-11-12", 4, "안내", "2026-11-30", "d1"), // 11/30 까지 15일 → 아님
  line("01011110005", "마손님", "2026-10-26", 4, "안내", "2026-11-15", "e1"), // 오늘이 기한 → 아님
  line("01011110006", "바손님", "2026-10-27", 4, "안내", "2026-11-22", "f1"), // 영수증 기한(11/22)이 20일(11/16)보다 늦음 → D-8
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
      8: [["가손님", "2026-11-22", 0, false], ["나손님", "2026-11-22", 1, false], ["바손님", "2026-11-22", 0, false], ["다손님", "2026-11-22", 0, true]],
    }, "8일 남은 사람만 (5일 · 3일 남은 사손님 · 아손님은 이제 아님)");
    assert.strictEqual(await page.getAttribute("#rev-btn", "hidden"), null);
    assert.strictEqual((await page.textContent("#rev-btn")).trim(), "재방문 안내3", "보낼 사람 3 (오늘 온 사람 빼고)");
    await page.click("#rev-btn");
    const sheet = (await page.textContent("#sheet")).replace(/\s+/g, " ");
    assert.match(sheet, /D-8 · 기한 11월 22일\(일\) · 손님께는 '7일' 3명 · 보냄 0/);
    assert.match(sheet, /기한이 8일 남은 사람이에요 .* 하루 줄여 '7일'로 알려요/);
    const rows = await page.$$eval("#sheet .rvrow", (e) => e.map((r) => [...r.children].map((c) => c.textContent.trim()).filter(Boolean).join(" | ")));
    assert.deepStrictEqual(rows, [
      "가손님 | 010-1111-0001 | 방문 1번 · 아직 안 받음 · 마지막 11/2 | 번호 복사 | 직접 보냄 표시",
      "나손님 | 010-1111-0002 | 방문 2번 · 수제돈까스 1번 받음 · 마지막 11/2 | 번호 복사 | 직접 보냄 표시",
      "바손님 | 010-1111-0006 | 방문 1번 · 아직 안 받음 · 마지막 10/27 | 번호 복사 | 직접 보냄 표시",
      "다손님 | 010-1111-0003 | 방문 1번 · 아직 안 받음 · 마지막 11/2 | 오늘 방문 — 안 보내도 돼요",
    ]);
    assert.ok(!/수신거부|광고/.test(sheet), "(광고) · 수신거부 알림 없음 (사장님 11/17)");
    assert.strictEqual(await page.textContent("#rev-msg-8"), "아스타나키즈\n고객님 아직 7일 남았습니다. 7일 안에 방문하셔서 수제돈까스 받아가세요.\n네이버에서 '아스타나키즈' 예약하고 오세요.");
    // 안내 이미지: 홍보 사진이 들어간 JPG · MMS 크기 안
    await page.waitForFunction(() => /^data:image\/jpeg/.test(document.getElementById("rev-img-8").src));
    const size = await page.evaluate(async () => { const u = await window.__deskTest.rev.image(8); const i = new Image(); i.src = u; await i.decode(); return { w: i.width, h: i.height, kb: Math.round((u.length * 3) / 4 / 1024) }; });
    assert.deepStrictEqual([size.w, size.h], [640, 960]);
    assert.ok(size.kb < 300, `MMS 300KB 안: ${size.kb}KB`);
    // 보냄 → 단추 숫자 줄어듦 · 다시 열어도 그대로
    await page.click('#sheet [data-act=revSentT][data-id="8|01011110001"]');
    assert.match((await page.textContent("#sheet")).replace(/\s+/g, " "), /D-8 · 기한 11월 22일\(일\) · 손님께는 '7일' 3명 · 보냄 1/);
    assert.strictEqual((await page.textContent("#rev-btn")).trim(), "재방문 안내2");
    await page.click('#sheet [data-act=revCopy] >> nth=0');
    await page.waitForFunction(() => /번호를 복사/.test(document.getElementById("toast").textContent)); // 복사는 비동기 (체험판은 브라우저 · 앱은 본체 클립보드)
    await page.click("#sheet [data-act=close]");
    // 맨 아래 한 줄 (선택 · 운영 설정 → 재방문 이벤트 '재방문 안내 문자') → 적으면 문구 맨 아래
    await page.dblclick("#now");
    await page.click("[data-t=event]");
    await page.fill("#ev-optout", "무료수신거부 080-000-0000");
    await page.click("#sheet [data-act=close]");
    assert.match(await page.evaluate(() => window.__deskTest.rev.msg(8)), /\n무료수신거부 080-000-0000$/);
    // 다시 열기 전에 '보냄'이 저장소에 들어갔는지 (바쁠 때 쓰기가 늦을 수 있어 5초까지)
    const saved = await page.waitForFunction(() => /8\|01011110001/.test(localStorage.getItem("astanakiz-revsent-2026-11-15") || ""), null, { timeout: 5000 }).then(() => true, () => false);
    assert.ok(saved, "보냄을 누르면 그날 저장소에 남음 (다시 열기 전)");
    // Chromium 은 저장소에 쓴 것을 조금 뒤에 넘김 → 바쁠 때 바로 다시 열면 쓰기가 사라짐 (11/19 전체 시험에서 두 번 · 진단: 다시 연 뒤 revsent 키가 없음)
    await page.waitForTimeout(1500);
    await page.reload();
    await page.waitForTimeout(300);
    const ok2 = await page.waitForFunction(() => document.getElementById("rev-btn").textContent.trim() === "재방문 안내2", null, { timeout: 15000 }).then(() => true, () => false); // 보냄은 그날 이 PC 에 남음 (다시 연 직후 화면이 다 그려질 때까지)
    if (!ok2) console.log("DBG", JSON.stringify(await page.evaluate(() => ({ btn: document.getElementById("rev-btn").textContent, hidden: document.getElementById("rev-btn").hidden, sent: localStorage.getItem("astanakiz-revsent-2026-11-15"), keys: Object.keys(localStorage), t: window.__deskTest && Object.entries(window.__deskTest.rev.targets() || {}).map(([l, v]) => [l, v.map((x) => x.name + (x.today ? "(오늘)" : ""))]) }))));
    assert.ok(ok2, "보냄은 그날 이 PC 에 남음");
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

test("날짜 셈 (사장님 11/17): 1일 방문 → 2일부터 세어 21일이 마지막 날 · 21일까지 오면 성공 · 22일은 아님 · 톡톡은 21일을 오늘 포함 8일 앞둔 14일에 · 손님께는 15일 기준 '7일'", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    // 12월 1일 방문 한 사람 · 이벤트는 2027-02-28 까지
    const led = [line("01022220001", "일일손님", "2026-12-01", 4, "안내", "2026-12-21", "z1")].join("\n") + "\n";
    const at = async (today) => {
      await page.addInitScript(([led2, t]) => {
        window.__today = t;
        localStorage.setItem("astanakiz-visitevent", JSON.stringify({ ver: 2, on: true, from: "2026-10-26", to: "2027-02-28", days: 20, gift: "수제돈까스" }));
        localStorage.setItem("astanakiz-visitlog-2026-10-26", led2);
      }, [led, today]);
      await page.goto(DESK);
      await page.waitForTimeout(300);
      return page.evaluate(() => { const t = window.__deskTest.rev.targets(); return Object.fromEntries(Object.entries(t || {}).map(([l, v]) => [l, v.map((x) => [x.name, x.due])])); });
    };
    // 마지막 날 · 성공 판정 (영수증 · 장부와 같은 셈)
    await at("2026-12-13");
    const r = await page.evaluate(() => ({
      due: window.__deskTest.rev.due("2026-12-01"),
      on21: window.__deskTest.rev.rule({ day: "2026-12-01", due: "2026-12-21" }, "2026-12-21").st,
      on22: window.__deskTest.rev.rule({ day: "2026-12-01", due: "2026-12-21" }, "2026-12-22").st,
      on2: window.__deskTest.rev.rule({ day: "2026-12-01", due: "2026-12-21" }, "2026-12-02").st,
    }));
    assert.deepStrictEqual(r, { due: "2026-12-21", on21: "성공", on22: "안내", on2: "성공" }, "1일 방문 → 21일이 마지막 날 (2일부터 20일)");
    // 보내는 날: 13일은 아님 · 14일 · 15일은 아님
    assert.deepStrictEqual(await at("2026-12-13"), { 8: [] }, "13일 (오늘 포함 9일)에는 안 보냄");
    assert.deepStrictEqual(await at("2026-12-14"), { 8: [["일일손님", "2026-12-21"]] }, "14일 (14 ~ 21 = 8일)에 보냄");
    const say = await page.evaluate(() => ({ say: window.__deskTest.rev.say(8), due: window.__deskTest.rev.dueOf(8), msg: window.__deskTest.rev.msg(8) }));
    assert.deepStrictEqual([say.say, say.due], [7, "2026-12-21"], "15일 기준 7일 (15 ~ 21) · 기한 21일");
    assert.match(say.msg, /고객님 아직 7일 남았습니다\. 7일 안에 방문하셔서 수제돈까스 받아가세요\./);
    await page.click("#rev-btn");
    assert.match((await page.textContent("#sheet")).replace(/\s+/g, " "), /D-8 · 기한 12월 21일\(월\) · 손님께는 '7일' 1명/);
    assert.deepStrictEqual(await at("2026-12-15"), { 8: [] }, "15일에는 안 보냄 (하루 한 번 · 14일)");
  } finally {
    await browser.close();
  }
});
