/* 재방문 이벤트 (사용자 지시 10/14 → 10/15 단순하게)
   - 운영 설정 → 방문 이벤트: 시작일 ~ 종료일 · 재방문 기한(기본 20일) · 사은품(기본 수제돈까스)
   - 기간 동안 네이버 예약 손님: 마일리지(네이버 이용완료 누계 · 10회 사은권)는 멈추고 입장권에 이벤트 안내
     처음 · 기한 넘김 = 1번 안내 (방문일 + 20일, 그날 포함) · 기한 안 재방문 = 2번 성공 (사은품 + 그날부터 다시 20일) · 계속 반복
     같은 날 또 오면 안내(기한 그대로) · 기한은 종료일을 넘지 않음 · 종료일에 오면 다음 기한 없음
   - 기간 동안 이용완료마다 장부(이름 · 전화 · 네이버 완료 수)에 한 줄 → 끝나면 마일리지 = 네이버 완료 − 이벤트 기간 이용완료
     장부에 없는 손님(기간 동안 안 온 손님)은 네이버 완료 그대로
   - 전체 목록은 화면에 없음 — 이름 · 전화 뒷번호로 찾기
   - 입장권 양식과 이벤트 안내는 쓰는 법이 똑같음 (값 · 줄 표시 · 조건을 서로 다 씀) */
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
const ticket = (page, name, text) => page.evaluate(([n, t]) => {
  const T = window.__deskTest;
  const h = T.holders().find((x) => x.name === n);
  return T.receiptLines(t || T.form(), T.keyVals(h)).map((l) => l.t.trim()).filter(Boolean);
}, [name, text || null]);
const card = async (page, slot, name) => { await page.click(`.slot[data-s="${slot}"]`); return (await page.textContent(`.res:has-text("${name}") >> nth=0`)).replace(/\s+/g, " "); };
const openEvent = async (page) => { await page.click("text=운영 설정"); await page.click('[data-t="event"]'); };
const find = async (page, q) => { await page.fill("#ev-q", q); return (await page.textContent("#ev-hits")).replace(/\s+/g, " "); };
const close = (page) => page.click("#sheet [data-act=close] >> nth=0");
const person = async (page, name, from) => Object.values((await page.evaluate((f) => window.__deskTest.evLog(f || undefined), from || null)).people).find((p) => p.name === name);
const setPeriod = async (page, from, to) => { await page.fill("#ev-from", from); await page.fill("#ev-to", to); await page.click("[data-act=evApply]"); };
const cols = (x) => [...x].reduce((a, c) => a + (c.charCodeAt(0) < 128 ? 1 : 2), 0);
const evLines = (page, name) => page.evaluate((nm) => { const T = window.__deskTest, h = T.holders().find((x) => x.name === nm); return T.receiptLines(T.form(), T.keyVals(h)).filter((l) => l.ev && l.t).map((l) => [l.t, l.size || 1]); }, name);

test("재방문 이벤트: 시작일 ~ 종료일 · 켜는 순간부터 마일리지 멈춤 · 1번 안내 · 기록 · 끄면 이벤트 이용완료를 빼고 마일리지", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 10/5 13:50 · 전시윤 14:00 완료 9 (이번이 10번째 = 사은권)

    assert.match(await card(page, 840, "전시윤"), /완료 9 · 취소 1 → 10번 완료 예정.*사은권 증정/, "꺼져 있으면 원래대로");
    await openEvent(page);
    assert.match(await page.textContent("#sheet .evstate"), /꺼짐/);
    assert.deepStrictEqual([await page.inputValue("#ev-days"), await page.inputValue("#ev-gift")], ["20", "수제돈까스"], "기본 20일 · 수제돈까스");
    assert.match(await page.textContent("#ev-dates"), /10월 5일에 오면 → 10월 25일\(포함\)까지 다시 오면 수제돈까스 · 그날부터 다시 20일/);
    await setPeriod(page, "2026-10-04", "2026-10-31");
    assert.match(await page.textContent("#toast"), /오늘이나 앞날/, "지난 날은 시작일로 못 정함");
    await setPeriod(page, "2026-10-05", "");
    assert.match(await page.textContent("#toast"), /시작일과 종료일/);
    await setPeriod(page, "2026-10-05", "2026-10-04");
    assert.match(await page.textContent("#toast"), /종료일은 시작일과 같거나 뒤로/);
    await setPeriod(page, "2026-10-05", "2026-10-31");
    assert.match(await page.textContent("#sheet .evstate"), /진행 중 — 10월 5일 ~ 10월 31일 · 마일리지는 멈춤/);
    // 켜기 전에 이미 입장한 손님(마일리지 입장권을 받음)은 이벤트 방문이 아님 → 기록 안 함 · 마일리지 그대로
    assert.strictEqual((await page.evaluate(() => window.__deskTest.evLog())).count, 0);
    const kim = await page.evaluate(() => { const T = window.__deskTest, h = T.holders().find((x) => x.name === "강민준"); const v = T.keyVals(h); return [v.누계, v._이벤트]; });
    assert.deepStrictEqual(kim, ["8", false], "강민준(켜기 전 입장) 입장권은 마일리지 8 그대로");
    assert.strictEqual(await page.$("#sheet .evlog"), null, "전체 목록은 없음");
    await close(page);

    // 카드: 마일리지 멈춤 + 1번 안내 (다음 기한) · 사은권 표시 없음
    let c = await card(page, 840, "전시윤");
    assert.match(c, /완료 9 · 취소 1 · 마일리지 9 멈춤 이벤트 안내 · 10\/25까지/);
    assert.doesNotMatch(c, /사은권|완료 예정/);

    // 입장(이용완료) → 그 순간 기록 · 입장권: 마일리지 줄 대신 이벤트 안내
    await enter(page, 840, "전시윤");
    assert.match(await page.textContent("#toast"), /이벤트 안내 · 10\/25까지/);
    assert.doesNotMatch(await page.textContent("#toast"), /사은권/);
    let t = await ticket(page, "전시윤");
    for (const l of ["재방문 이벤트", "10월 25일(포함)까지 다시 오시면", "수제돈까스 무료 증정!", "이벤트 기간에는 마일리지가 멈춰요"]) assert.ok(t.includes(l), l + " | " + t.join(" | "));
    assert.ok(!t.some((l) => /네이버 예약 \d+번|사은권|이용완료$/.test(l)), t.join(" | "));
    assert.ok(t.some((l) => /퇴장시간 지연/.test(l)), "나머지 양식은 그대로");
    for (const [x, z] of await evLines(page, "전시윤")) assert.ok(cols(x) * z <= 42, `42칸 넘음: ${x}`);
    const jeon = await person(page, "전시윤");
    assert.deepStrictEqual([jeon.base, jeon.last, jeon.visits.map((v) => [v.day, v.st, v.due])], [9, 10, [["2026-10-05", "안내", "2026-10-25"]]], "이벤트 전 네이버 완료 9 · 이번 10");
    assert.match(await card(page, 840, "전시윤"), /10번째 예약완료 · 마일리지 9 멈춤/);

    // 조건 [이벤트] · [네이버] 는 입장권 양식에서도 (이벤트 기간엔 {누계} 빈칸 → 그 줄 빠짐)
    assert.deepStrictEqual(await ticket(page, "전시윤", "[이벤트]^이벤트 손님만\n[네이버]^누계 {누계}\n^모두"), ["이벤트 손님만", "재방문 이벤트", "10월 25일(포함)까지 다시 오시면", "수제돈까스 무료 증정!", "이벤트 기간에는 마일리지가 멈춰요", "모두"]);
    // 현장 입장권은 그대로 (네이버 예약 안내 · 이벤트 줄 없음)
    const walk = await page.evaluate(() => { const T = window.__deskTest, w = T.holders().find((y) => y.walk); return T.receiptLines(T.form(), T.keyVals(w)).map((l) => l.t); });
    assert.ok(walk.some((l) => /네이버 예약하고/.test(l)) && !walk.some((l) => /재방문 이벤트/.test(l)));

    // 같은 날 또 오면 1번 안내 (기한 그대로)
    await page.evaluate(() => { const T = window.__deskTest, h = T.holders().find((x) => x.name === "전시윤"); T.addBooking("2026-10-05", "16:30", "전시윤", h.phone, 1, { prevDone: 10 }); });
    assert.match(await card(page, 990, "전시윤"), /완료 10 · 마일리지 9 멈춤 이벤트 안내 · 오늘 또 옴 · 10\/25까지/);
    // 같은 시간 나눠 한 예약(완료 8, 2건): 한 번 방문 → 이벤트 영수증 하나 · 장부엔 2건
    await enter(page, 900, "나분할");
    assert.ok((await ticket(page, "나분할")).includes("재방문 이벤트"));
    assert.deepStrictEqual((await person(page, "나분할")).visits.map((v) => v.st), ["안내", ""]);

    // 찾기: 이름 · 전화 뒷번호 (나분할 1234 · 같은 뒷번호 나연속은 아직 이용완료 없음)
    await openEvent(page);
    assert.match(await page.textContent("#sheet"), /기록 2명 · 이용완료 3건/);
    const hits = await find(page, "1234");
    assert.match(hits, /나분할 010-6660-1234 · 마일리지 8 \(네이버 완료 10 − 이벤트 2\).*이벤트 2회 · 성공 0번 · 다음 기한 10\/25/);
    assert.doesNotMatch(hits, /나연속/);
    assert.match(await find(page, "홍예준"), /기록이 없어요.*네이버 완료 그대로/);

    // 끄기 → 마일리지로 (이벤트 기간 이용완료는 빼고: 전시윤 네이버 10 − 이벤트 1 = 9 → 사은권 아님)
    await page.click("[data-act=evOff]");
    assert.match(await page.textContent("#sheet .evstate"), /꺼짐.*지난 이벤트 기간 이용완료는 빼고 셈/);
    assert.match(await find(page, "1327"), /전시윤 .*마일리지 9 \(네이버 완료 10 − 이벤트 1\).*이벤트 1회/, "꺼도 기록은 찾아짐");
    await close(page);
    t = await ticket(page, "전시윤");
    assert.ok(t.some((l) => /네이버 예약 9번/.test(l)) && !t.includes("재방문 이벤트"), t.join(" | "));
    assert.match(await card(page, 840, "전시윤"), /10번째 예약완료 · 이벤트 기간 방문 \(마일리지 9\)/, "이벤트 기간에 온 예약은 마일리지에 안 들어감");
    assert.doesNotMatch(await card(page, 840, "전시윤"), /사은권/);
    assert.match(await card(page, 990, "전시윤"), /완료 10 − 이벤트 1 → 10번 완료 예정 2만원 사은권 증정/, "끝난 뒤 다음 방문: 네이버 11번째 · 마일리지 10번째");
    assert.match(await card(page, 840, "홍예준"), /완료 10 → 11번 완료 예정/, "장부에 없는 손님은 네이버 완료 그대로");
    assert.strictEqual(await page.evaluate(() => window.__deskTest.evSub("전시윤")), 1);

    // 다시 켜기 (같은 시작일) → 그대로 이어서
    await openEvent(page);
    await page.click("[data-act=evApply]");
    await close(page);
    assert.match(await card(page, 990, "전시윤"), /마일리지 9 멈춤 이벤트 안내 · 오늘 또 옴/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("재방문 이벤트: 기한(20일, 그날 포함) 안 재방문 = 성공 → 그날부터 다시 20일 · 넘기면 안내 · 약속한 기한은 그대로 · 종료일까지만", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    // 9/10 ~ 10/31 이벤트 중 (오늘 10/5)
    await page.addInitScript(() => { if (!localStorage.getItem("astanakiz-visitevent")) localStorage.setItem("astanakiz-visitevent", JSON.stringify({ ver: 2, on: true, from: "2026-09-10", to: "2026-10-31", days: 20, gift: "수제돈까스" })); });
    await page.goto(DESK);
    const inject = (name, o) => page.evaluate(([n, x]) => window.__deskTest.evInject(n, x), [name, o]);
    await inject("홍예준", { day: "2026-09-20" }); // 안내 · 기한 10/10 → 오늘 성공
    await inject("고은우", { day: "2026-09-15" }); // 20일째 = 기한 마지막 날 → 성공
    await inject("류하린", { day: "2026-09-14" }); // 21일째 → 넘김 → 안내
    await inject("송다온", { day: "2026-09-12", n: 1, base: 0 }); // 안내
    await inject("송다온", { day: "2026-09-30", n: 2, base: 0, st: "성공" }); // 성공 → 다시 20일 → 오늘 또 성공
    await inject("김어긋", { day: "2026-09-12", due: "2026-10-06" }); // 23일째지만 영수증에 10/6 까지라고 찍어 줌 → 약속대로 성공
    const expect = { 홍예준: "성공 · 수제돈까스", 고은우: "성공 · 수제돈까스", 류하린: "안내 · 10/25까지", 송다온: "성공 · 수제돈까스", 김어긋: "성공 · 수제돈까스", 전시윤: "안내 · 10/25까지" };
    for (const [n, x] of Object.entries(expect)) assert.match(await card(page, 840, n), new RegExp(`이벤트 ${x}`), n);

    await enter(page, 840, "홍예준");
    assert.match(await page.textContent("#toast"), /이벤트 성공 — 수제돈까스 드리세요/);
    let t = await ticket(page, "홍예준");
    for (const l of ["재방문 이벤트 성공!", "[ 수제돈까스 무료 증정 ]", "이 영수증을 보여 주세요", "10월 25일(포함)까지 또 오시면", "수제돈까스 또 드려요"]) assert.ok(t.includes(l), l + " | " + t.join(" | "));
    assert.ok(!t.some((l) => /네이버 예약 \d+번|사은권/.test(l)), "마일리지 줄 없음");
    for (const [x, z] of await evLines(page, "홍예준")) assert.ok(cols(x) * z <= 42, `42칸 넘음: ${x}`);
    const hong = await person(page, "홍예준");
    assert.deepStrictEqual(hong.visits.map((v) => [v.day, v.st, v.due]), [["2026-09-20", "안내", "2026-10-10"], ["2026-10-05", "성공", "2026-10-25"]], "성공한 날부터 다시 20일");
    await enter(page, 840, "류하린");
    t = await ticket(page, "류하린");
    assert.ok(t.includes("재방문 이벤트") && t.includes("10월 25일(포함)까지 다시 오시면") && !t.includes("재방문 이벤트 성공!"), t.join(" | "));

    // 기한 일수를 바꾸면 새 방문부터 · 이미 찍어 준 기한(고은우 10/5까지)은 지킴
    await openEvent(page);
    await page.fill("#ev-days", "10");
    assert.match(await page.textContent("#ev-dates"), /10월 5일에 오면 → 10월 15일\(포함\)까지/);
    assert.match((await page.textContent("#ev-paper")).replace(/\s+/g, " "), /10월 15일\(포함\)까지 다시 오시면/, "미리보기도 바로");
    await close(page);
    assert.match(await card(page, 840, "고은우"), /이벤트 성공/, "20일째지만 영수증 기한(10/5) 안");
    assert.match(await card(page, 840, "전시윤"), /이벤트 안내 · 10\/15까지/);

    // 기한은 종료일을 넘지 않음 (종료일 10/20)
    await openEvent(page);
    await page.fill("#ev-days", "20");
    await page.fill("#ev-to", "2026-10-20");
    await page.click("[data-act=evApply]");
    assert.match(await page.textContent("#sheet .evstate"), /진행 중 — 9월 10일 ~ 10월 20일/);
    assert.strictEqual(await page.isDisabled("#ev-from"), true, "기록이 생긴 뒤엔 시작일을 못 바꿈");
    await close(page);
    assert.match(await card(page, 840, "전시윤"), /이벤트 안내 · 10\/20까지/);
    // 종료일(오늘)에 오면 다음 기한 없음 → 성공은 사은품만 · 안내는 기한 줄 없이
    await openEvent(page);
    await page.fill("#ev-to", "2026-10-05");
    await page.click("[data-act=evApply]");
    await close(page);
    assert.match(await card(page, 840, "전시윤"), /이벤트 안내 · 마지막 날/);
    await enter(page, 840, "송다온");
    t = await ticket(page, "송다온");
    assert.ok(t.includes("재방문 이벤트 성공!") && t.includes("[ 수제돈까스 무료 증정 ]") && !t.some((l) => /또 오시면|또 드려요/.test(l)), t.join(" | "));
    await enter(page, 840, "전시윤");
    t = await ticket(page, "전시윤");
    assert.ok(t.includes("재방문 이벤트") && t.includes("이벤트 기간에는 마일리지가 멈춰요") && !t.some((l) => /오시면|무료 증정/.test(l)), t.join(" | "));

    // 찾기: 방문 기록 · 성공 수 · 다음 기한
    await openEvent(page);
    assert.match(await find(page, "홍예준"), /홍예준 .*마일리지 9 \(네이버 완료 11 − 이벤트 2\).*이벤트 2회 · 성공 1번 · 다음 기한 10\/25 — 09\/20 안내 · 10\/05 성공/);
    assert.match(await find(page, "송다온"), /이벤트 3회 · 성공 2번 — 09\/12 안내 · 09\/30 성공 · 10\/05 성공/);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("astanakiz-visitevent")));
    assert.deepStrictEqual([saved.from, saved.to, saved.days, saved.gift], ["2026-09-10", "2026-10-05", 20, "수제돈까스"], "이 PC에 저장");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("이벤트가 끝나면: 명단에 있는 손님은 네이버 완료 − 이벤트 기간 이용완료 (카드 · 입장권 누계 · 10회 사은권) · 없는 손님은 그대로 · 다음 이벤트에도 계속 뺌", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    // 9/1 ~ 9/30 이벤트가 끝남 (오늘 10/5) — 전시윤 3번(완료 6 → 9) · 홍예준 1번(9 → 10)
    await page.addInitScript(() => {
      if (localStorage.getItem("astanakiz-visitevent")) return;
      localStorage.setItem("astanakiz-visitevent", JSON.stringify({ ver: 2, on: true, from: "2026-09-01", to: "2026-09-30", days: 20, gift: "수제돈까스" }));
      const L = (no, day, k, name, n, base, st) => JSON.stringify({ at: `${day} 11:00`, day, no, k, name, phone: k, prev: n - 1, n, base, st, due: "" });
      localStorage.setItem("astanakiz-visitlog-2026-09-01", [L("E1", "2026-09-02", "01020261327", "전시윤", 7, 6, "안내"), L("E2", "2026-09-10", "01020261327", "전시윤", 8, 6, "성공"), L("E3", "2026-09-25", "01020261327", "전시윤", 9, 6, "안내"), L("E4", "2026-09-20", "01020269246", "홍예준", 10, 9, "안내")].join("\n") + "\n");
    });
    await page.goto(DESK);
    assert.match(await card(page, 840, "전시윤"), /완료 9 · 취소 1 − 이벤트 3 → 7번 완료 예정/);
    assert.doesNotMatch(await card(page, 840, "전시윤"), /사은권|멈춤|이벤트 안내/, "네이버로는 10번째지만 마일리지 7번째 → 사은권 아님");
    assert.match(await card(page, 840, "홍예준"), /완료 10 − 이벤트 1 → 10번 완료 예정 2만원 사은권 증정/, "네이버로는 11번째 · 마일리지 10번째 → 사은권");
    assert.match(await card(page, 840, "류하린"), /완료 9 → 10번 완료 예정 2만원 사은권 증정/, "이벤트 기간에 안 온 손님은 그대로");
    await openEvent(page);
    assert.match(await page.textContent("#sheet .evstate"), /끝남 — 9월 1일 ~ 9월 30일 · 기간 동안 이용완료는 마일리지에서 빼고 셈/);
    assert.match(await find(page, "9246"), /홍예준 010-2026-9246 · 마일리지 9 \(네이버 완료 10 − 이벤트 1\)/);
    await close(page);

    await enter(page, 840, "전시윤");
    assert.doesNotMatch(await page.textContent("#toast"), /사은권/);
    let t = await ticket(page, "전시윤");
    assert.ok(t.some((l) => /네이버 예약 7번/.test(l)) && !t.includes("재방문 이벤트"), t.join(" | "));
    assert.match(await card(page, 840, "전시윤"), /7번째 예약완료 \(네이버 10 − 이벤트 3\)/);
    await enter(page, 840, "홍예준");
    assert.match(await page.textContent("#toast"), /10번째 예약완료, 2만원 사은권을 드리세요/);
    t = await ticket(page, "홍예준");
    assert.ok(t.some((l) => /네이버 예약 10번/.test(l)), t.join(" | "));
    assert.strictEqual(await page.evaluate(() => { const T = window.__deskTest; return T.keyVals(T.holders().find((x) => x.name === "홍예준"))._사은권; }), true);

    // 새 이벤트(오늘부터): 지난 이벤트 기록은 지난 이벤트로 남아 계속 뺌 · 멈춘 마일리지도 뺀 수
    await openEvent(page);
    await setPeriod(page, "2026-10-05", "2026-10-31");
    assert.match(await page.textContent("#toast"), /새 이벤트 10월 5일 ~ 10월 31일/);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("astanakiz-visitevent")));
    assert.deepStrictEqual(saved.past, [{ from: "2026-09-01", to: "2026-09-30" }]);
    await close(page);
    assert.match(await card(page, 840, "전시윤"), /7번째 예약완료 \(네이버 10 − 이벤트 3\)/, "켜기 전 입장 → 이벤트 방문 아님");
    await page.evaluate(() => { const T = window.__deskTest, h = T.holders().find((x) => x.name === "전시윤"); T.addBooking("2026-10-05", "16:30", "전시윤", h.phone, 1, { prevDone: 10 }); });
    assert.match(await card(page, 990, "전시윤"), /완료 10 · 마일리지 7 멈춤 이벤트 안내/, "네이버 10 − 지난 이벤트 3");
    await page.evaluate(() => window.__deskTest.setNow(990));
    await enter(page, 990, "전시윤");
    const jeon = await person(page, "전시윤");
    assert.deepStrictEqual([jeon.base, jeon.last], [10, 11], "새 이벤트 장부: 시작 때 네이버 완료 10");
    assert.strictEqual(await page.evaluate(() => window.__deskTest.evSub("전시윤")), 4, "지난 3 + 이번 1");
    await openEvent(page);
    assert.match(await find(page, "전시윤"), /마일리지 7 \(네이버 완료 11 − 이벤트 4\).*10\/05~ 이벤트 1회.*09\/01~ 이벤트 3회 · 성공 1번/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("재방문 이벤트(앱): 장부는 POS PC 파일(시작일.jsonl)에 이용완료마다 한 줄 · 다시 켜도 그대로 · 엑셀 정리본", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date("2026-10-14T13:00:00") });
    await page.addInitScript(() => {
      // 이벤트 10/12 ~ 10/31 · 김기록은 10/12 에 이미 이용완료 (그때 완료 6 → 7 · 1번 안내 · 기한 10/31)
      const first = JSON.stringify({ at: "2026-10-12 10:58", day: "2026-10-12", no: "N1", k: "01012340000", name: "김기록", phone: "01012340000", prev: 6, n: 7, base: 6, st: "안내", due: "2026-10-31" }) + "\n";
      if (localStorage.getItem("test-ledger") == null) localStorage.setItem("test-ledger", first);
      window.__adds = [];
      const BK = (no, time, name, phone, done) => ({ no, time, name, phone, qty: 1, qtyText: "1시간 50분 1", product: "1시간 50분", status: "확정", pay: "결제완료", doneCount: done, cancelCount: 0 });
      window.desk = {
        naver: {
          load: async (day) => ({ ok: true, day, slots: day === "2026-10-14" ? [{ time: "14:00", cap: 10, conf: 2, done: 0 }] : [], bookings: day === "2026-10-14" ? [BK("N2", "14:00", "김기록", "010-1234-0000", 7), BK("N3", "14:00", "박새로", "010-5555-0001", 3)] : [] }),
          complete: async () => ({ ok: true }),
        },
        state: { load: (day) => localStorage.getItem("test-state-" + day), save: (day, json) => localStorage.setItem("test-state-" + day, json) },
        config: { get: async () => ({ build: "1.39", visitEvent: { ver: 2, on: true, from: "2026-10-12", to: "2026-10-31", days: 20, gift: "수제돈까스" } }), set: async () => ({ ok: true }) },
        // 설치한 앱: 앱 폴더 + 바탕화면 두 곳에 저장 → { app, desk } · 바탕화면 엑셀 정리본
        ledger: {
          load: (from) => (from === "2026-10-12" ? localStorage.getItem("test-ledger") : null),
          add: (from, line) => { window.__adds.push([from, line]); localStorage.setItem("test-ledger", (localStorage.getItem("test-ledger") || "") + line + "\n"); return { app: true, desk: !window.__deskFail }; },
          csv: (from, text) => { window.__csv = [from, text]; },
          dirs: () => ({ app: "C:/앱/visit-ledger", desk: "C:/바탕화면/아스타나키즈-이벤트" }),
          open: async () => ({ ok: true }),
        },
      };
    });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    await page.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 15000 });
    // 김기록: 10/12 방문 → 오늘 10/14 기한 안 → 성공 · 박새로: 기록 없음 → 안내 (10/14 + 20일 = 11/3 → 종료일 10/31 까지)
    assert.match(await card(page, 840, "김기록"), /완료 7 · 마일리지 6 멈춤 이벤트 성공 · 수제돈까스/);
    assert.match(await card(page, 840, "박새로"), /완료 3 · 마일리지 3 멈춤 이벤트 안내 · 10\/31까지/);
    assert.deepStrictEqual(await page.evaluate(() => window.__adds), [], "아직 아무도 이용완료 안 함 → 기록 없음");

    await enter(page, 840, "박새로");
    await page.waitForFunction(() => window.__adds.length === 1);
    const [from, line] = await page.evaluate(() => window.__adds[0]);
    const r = JSON.parse(line);
    assert.strictEqual(from, "2026-10-12");
    assert.deepStrictEqual([r.name, r.phone, r.no, r.prev, r.n, r.base, r.day, r.st, r.due], ["박새로", "01055550001", "N3", 3, 4, 3, "2026-10-14", "안내", "2026-10-31"]);
    assert.match(r.at, /^2026-10-14 \d\d:\d\d$/);
    // 바탕화면 엑셀 정리본: 손님마다 한 줄 (잠깐 뒤 한 번에)
    await page.clock.runFor(1500);
    const [cf, ct] = await page.evaluate(() => window.__csv);
    const crow = ct.split("\r\n");
    assert.strictEqual(cf, "2026-10-12");
    assert.strictEqual(crow[0], '"이름","전화번호","이벤트 방문 수","사은품(성공)","첫 방문","마지막 방문","다음 기한(포함)","네이버 완료(이벤트 전)","네이버 완료(마지막)","마일리지에서 뺄 수","방문 기록"');
    assert.ok(crow.some((l) => /^"박새로","010-5555-0001","1","0","2026-10-14","2026-10-14","2026-10-31","3","4","1","2026-10-14 \d\d:\d\d 안내"$/.test(l)), crow.join("\n"));
    assert.ok(crow.some((l) => /^"김기록","010-1234-0000","1","0","2026-10-12"/.test(l)), "지난 기록도");

    // 다시 켜기: 파일에서 그대로 → 찾기
    // (시험 도구 사정: 가짜 장부는 브라우저 저장소 — 새 페이지가 읽기 전에 저장이 넘어가도록 잠깐 기다림. 실제 앱은 파일에 바로 씀)
    await new Promise((r) => setTimeout(r, 500));
    assert.strictEqual((await page.evaluate(() => localStorage.getItem("test-ledger"))).trim().split("\n").length, 2);
    await page.goto(DESK);
    await page.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 15000 });
    await openEvent(page);
    assert.match(await page.textContent("#sheet"), /기록 2명 · 이용완료 2건/);
    assert.match(await find(page, "0001"), /박새로 010-5555-0001 · 마일리지 3 \(네이버 완료 4 − 이벤트 1\).*이벤트 1회 · 성공 0번 · 다음 기한 10\/31 — 10\/14 안내/);
    assert.match(await find(page, "김기"), /김기록 .*마일리지 6 \(네이버 완료 7 − 이벤트 1\).*10\/12 안내/);
    assert.match(await page.textContent("#sheet"), /바탕화면 \+ 앱 폴더 두 곳에 저장/);
    assert.ok(await page.$("#sheet [data-act=evOpen]"), "바탕화면 폴더 열기");
    await close(page);
    assert.deepStrictEqual(await page.evaluate(() => window.__adds), [], "다시 켜도 같은 예약을 두 번 적지 않음");
    // 바탕화면에 못 쓰면 알림 (앱 폴더에는 저장)
    await page.evaluate(() => { window.__deskFail = true; });
    await enter(page, 840, "김기록");
    await page.waitForFunction(() => window.__adds.length === 1);
    const kl = JSON.parse((await page.evaluate(() => window.__adds[0]))[1]);
    assert.deepStrictEqual([kl.st, kl.due], ["성공", "2026-10-31"], "10/12 뒤 20일 안 → 성공 · 다음 기한은 종료일까지");
    await openEvent(page); // 알림은 다른 알림에 덮일 수 있어 설정 화면에도 남김
    assert.match(await page.textContent("#sheet"), /⚠ 저장 확인: \d\d:\d\d 바탕화면 폴더에 못 씀 \(다른 한 곳에는 저장됨\)/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("공통 양식: 이벤트 기간 입장권의 나머지(안내 문구)도 이벤트 탭에서 고침 · 끄면 프린터 탭 원래 양식 그대로 · 쓰는 법은 프린터 탭과 같음", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    const OLD = "[평일 시간제한 X 이벤트 = 8/18 ~ 11/30]";
    await openEvent(page);
    await setPeriod(page, "2026-10-05", "2026-11-30");
    const rows = await page.$$eval("#sheet .evrule", (e) => e.map((x) => x.innerText.replace(/\s+/g, " ").trim()));
    assert.deepStrictEqual(rows.map((r) => r.split(" ").slice(0, 2).join(" ")), ["공통 양식", "1번 안내", "2번 성공"], "공통 양식 + 안내 · 성공 둘");
    assert.match(await page.textContent("#ev-def"), /아직 예시 문구: 1번 안내 · 2번 성공/);
    // 양식 고치기 → 미리보기에 바로 · 양식마다 따로 남음
    await page.fill("#ev-text", "#* 11월 재방문 이벤트\n^{다음기한}(포함)까지 오면 {사은품}\n[네이버]^{열쇠}번 열쇠 손님");
    assert.match((await page.textContent("#ev-paper")).replace(/\s+/g, " "), /11월 재방문 이벤트.*10월 25일\(포함\)까지 오면 수제돈까스.*3, 13번 열쇠 손님/);
    assert.doesNotMatch(await page.textContent("#ev-paper"), /네이버 예약 \d+번|10번마다/, "미리보기에도 마일리지 줄 없음");
    await page.click("[data-act=evTpl][data-i='1']");
    assert.match(await page.inputValue("#ev-text"), /재방문 이벤트 성공!/);
    await page.click("[data-act=evTpl][data-i='0']");
    assert.match(await page.inputValue("#ev-text"), /^#\* 11월 재방문 이벤트/);
    await page.click("[data-act=evReset]");
    assert.match(await page.inputValue("#ev-text"), /^#\* 재방문 이벤트\n/, "예시 문구로");
    // 쓰는 법은 입장권 양식과 똑같음
    const evHelp = (await page.textContent("#sheet .formhelp")).replace(/\s+/g, " ");
    assert.match(evHelp, /\{열쇠\}.*\{누계\}.*\{다음기한\}.*\[이벤트\].*\[기한\]/);
    await page.click('[data-t="printer"]');
    assert.strictEqual((await page.textContent("#sheet .formhelp")).replace(/\s+/g, " "), evHelp, "프린터 탭과 같은 설명");
    await page.click("[data-act=previewKind][data-k=event]");
    assert.match(await page.textContent("#paper"), /재방문 이벤트/, "프린터 탭 미리보기에서도 이벤트 입장권");
    await page.click('[data-t="event"]');

    // 공통 양식: 처음엔 프린터 탭의 원래 양식 그대로
    await page.click(`[data-act=evTpl][data-i='9']`);
    assert.match(await page.textContent("#ev-def"), /원래 입장권 양식 그대로/);
    const base = await page.inputValue("#ev-text");
    assert.ok(base.includes(OLD) && base.includes("{열쇠}"), "원래 양식이 들어 있음");
    await page.fill("#ev-text", base.replace(OLD, "^11월 재방문 이벤트 기간").replace("^[예약 1번 = 예약시 구매수량 무관/예약 수]", ""));
    const prev = (await page.textContent("#ev-paper")).replace(/\s+/g, " ");
    assert.ok(prev.includes("11월 재방문 이벤트 기간") && !prev.includes("8/18") && !prev.includes("예약 1번"), "미리보기에 바로");
    assert.match(prev, /재방문 이벤트.*수제돈까스 무료 증정!/, "1번 안내도 같이");
    assert.match(await page.textContent("#ev-def"), /이벤트 기간 모든 입장권/);
    // 프린터 탭 원래 양식은 그대로 · 이벤트 중이라는 안내
    await page.click('[data-t="printer"]');
    assert.ok((await page.inputValue("#form-text")).includes(OLD), "원래 양식은 안 건드림");
    assert.match(await page.textContent("#sheet"), /방문 이벤트 중이라 지금은 '방문 이벤트 → 공통 양식'으로 출력돼요/);
    await close(page);

    // 이벤트 손님 · 현장 손님 입장권 모두 공통 양식
    await enter(page, 840, "전시윤");
    let t = await ticket(page, "전시윤");
    assert.ok(t.includes("11월 재방문 이벤트 기간") && !t.some((l) => /8\/18|예약 1번/.test(l)) && t.includes("재방문 이벤트"), t.join(" | "));
    const walk = await page.evaluate(() => { const T = window.__deskTest, w = T.holders().find((x) => x.walk); return T.receiptLines(T.form(), T.keyVals(w)).map((l) => l.t.trim()); });
    assert.ok(walk.includes("11월 재방문 이벤트 기간") && walk.some((l) => /네이버 예약하고/.test(l)), walk.join(" | "));

    // 끄면 원래 양식 · 다시 켜면 고친 공통 양식 그대로 (이 PC에 저장)
    await openEvent(page);
    await page.click("[data-act=evOff]");
    await close(page);
    t = await ticket(page, "전시윤");
    assert.ok(t.some((l) => l.includes("8/18")) && !t.includes("11월 재방문 이벤트 기간"), "꺼지면 원래 양식");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("astanakiz-visitevent")).form);
    assert.ok(saved.includes("11월 재방문 이벤트 기간"));
    await openEvent(page);
    await page.click("[data-act=evApply]");
    await page.click(`[data-act=evTpl][data-i='9']`);
    await page.click("[data-act=evReset]"); // 원래 양식으로
    await close(page);
    assert.ok((await ticket(page, "전시윤")).some((l) => l.includes("8/18")), "'원래 양식으로' → 프린터 탭 양식");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("1.38 이벤트(a~e) 설정이 남아 있으면: 시작일 · 공통 양식은 그대로 · 문구는 새 예시 · 종료일을 넣어야 켜짐", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.addInitScript(() => { if (!sessionStorage.getItem("once")) { sessionStorage.setItem("once", "1"); localStorage.setItem("astanakiz-visitevent", JSON.stringify({ on: true, from: "2026-11-01", mode: "stamp", tpl: ["a문구", "b", "c", "d", "e"], stamp: { a: 14, b: 7, m: 30, foodA: "돈까스", foodB: "핫도그" }, form: "공통", rules: [] })); } });
    await page.goto(DESK);
    await openEvent(page);
    assert.match(await page.textContent("#sheet .evstate"), /기다리는 중 — 시작일 · 종료일을 넣고/);
    assert.strictEqual(await page.inputValue("#ev-from"), "2026-11-01");
    assert.match(await page.inputValue("#ev-text"), /^#\* 재방문 이벤트\n/);
    await page.click(`[data-act=evTpl][data-i='9']`);
    assert.strictEqual(await page.inputValue("#ev-text"), "공통");
    await page.fill("#ev-to", "2026-11-30");
    await page.click("[data-act=evApply]");
    assert.match(await page.textContent("#sheet .evstate"), /기다리는 중 — 11월 1일 ~ 11월 30일/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
