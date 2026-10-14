/* 방문 이벤트 (사용자 지시 10/14 · 1.37)
   - 운영 설정 → 방문 이벤트: 기준일(오늘 · 앞날)을 정하면 그날부터 모든 손님을 처음 오는 손님처럼 셈 (네이버 숫자는 그대로, 데스크에서만)
     기록에 없는 손님 = 네이버에 보이는 완료 수를 0으로 → 이용완료하는 순간 POS PC 에 한 줄 기록하고 거기서부터 셈 (완료 7 → 이번 8이 이벤트 1번째)
   - 켜는 순간 원래 로직(입장권에 네이버 완료 +1 누계 · 10회 사은권)은 멈추고, 양식(1~5번) 중 출력 조건에 먼저 맞는 하나를 그 자리에 출력
     출력 조건은 양식 번호 옆에서 정함 (기본: 1번 처음 방문 · 2번 처음 방문 뒤 30일 안 재방문 · 3번 30일 지나 재방문 · 숫자는 바꿈)
   - 전체 목록은 화면에 없음 — 이름 · 전화 뒷번호로 찾으면 기준일 뒤 실적
   - 입장권 양식과 이벤트 안내는 쓰는 법이 똑같음 (값 · 줄 표시 · 조건 [네이버] [현장] [사은권] [이벤트] 을 서로 다 씀) */
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

test("방문 이벤트(양식별 조건): 기준일부터 처음 오는 손님처럼 · 이용완료 때 기록 · 찾기 · 양식 조건 · 끄면 원래대로", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 10/5 13:50 · 전시윤 14:00 완료 9 (이번이 10번째 = 사은권)

    assert.match(await card(page, 840, "전시윤"), /완료 9( · 취소 \d)? → 10번 완료 예정.*사은권 증정/, "꺼져 있으면 원래대로");
    await openEvent(page);
    assert.match(await page.textContent("#sheet .evstate"), /꺼짐/);
    // 이 시험은 '양식별 조건' 방식 (기본은 이벤트 — 아래 시험)
    await page.click("[data-act=evMode][data-m=rule]");
    await page.fill("#ev-from", "2026-10-04");
    await page.click("[data-act=evApply]");
    assert.match(await page.textContent("#toast"), /오늘이나 앞날/, "지난 날은 기준일로 못 정함");
    await page.fill("#ev-from", "2026-10-05");
    await page.click("[data-act=evApply]");
    assert.match(await page.textContent("#sheet .evstate"), /켜짐.*10월 5일부터/);
    // 전체 목록은 없음 · 오늘(기준일) 이미 이용완료한 예약만 기록 (아직 안 온 손님은 기록 안 함)
    assert.strictEqual(await page.$("#sheet .evlog"), null);
    let log = await page.evaluate(() => window.__deskTest.evLog());
    const doneToday = await page.evaluate(() => window.__deskTest.holders2().length); // 참고용
    assert.ok(log.count > 0 && Object.values(log.people).every((p) => p.last - p.base >= 1), JSON.stringify(log).slice(0, 300) + doneToday);
    assert.ok(!Object.values(log.people).some((p) => p.name === "전시윤"), "아직 안 온 손님은 기록 안 함");
    assert.match(await page.textContent("#sheet"), new RegExp(`기록 ${Object.keys(log.people).length}명 · 이용완료 ${log.count}건`));
    // 찾기: 이름 · 전화 뒷번호
    assert.match(await find(page, "전시"), /기록이 없어요.*0부터/);
    assert.match(await find(page, "강민준"), /강민준 010-\d{4}-\d{4} · 이벤트 1회.*10\/05 \d\d:\d\d 1번째/);

    // 양식 쓰기: 1번 · 2번 (미리보기에 바로) — 입장권 양식의 값({열쇠})과 조건([네이버])도 씀
    await page.fill("#ev-text", "#* 이벤트 첫 방문\n^음료 1잔 무료 ({이벤트회}번째)\n[네이버]^{열쇠}번 열쇠 손님");
    assert.match(await page.textContent("#ev-paper"), /이벤트 첫 방문.*음료 1잔 무료 \(1번째\).*3, 13번 열쇠 손님/);
    assert.doesNotMatch(await page.textContent("#ev-paper"), /네이버 예약 \d+번|10번마다/, "미리보기에도 원래 누계 · 사은권 줄 없음");
    await page.click("[data-act=evTpl][data-i='1']");
    await page.fill("#ev-text", "#* 두 번째 방문\n^{기준일}부터 {이벤트회}번째");
    assert.match(await page.textContent("#ev-paper"), /두 번째 방문.*10월 5일부터 2번째/);
    await page.click("[data-act=evTpl][data-i='0']");
    assert.strictEqual(await page.inputValue("#ev-text"), "#* 이벤트 첫 방문\n^음료 1잔 무료 ({이벤트회}번째)\n[네이버]^{열쇠}번 열쇠 손님", "양식마다 따로 남음");
    // 쓰는 법은 입장권 양식과 똑같음
    const evHelp = (await page.textContent("#sheet .formhelp")).replace(/\s+/g, " ");
    assert.match(evHelp, /\{열쇠\}.*\{이벤트회\}.*\[이벤트\]/);
    await page.click('[data-t="printer"]');
    assert.strictEqual((await page.textContent("#sheet .formhelp")).replace(/\s+/g, " "), evHelp, "프린터 탭과 같은 설명");
    await page.click("[data-act=previewKind][data-k=event]");
    assert.match(await page.textContent("#paper"), /이벤트 첫 방문/, "프린터 탭 미리보기에서도 이벤트 입장권");
    await close(page);

    // 카드: 기록에 없는 손님 = 네이버 완료를 0으로 → 이벤트 1번째 (처음 방문 → 1번 양식) · 사은권 표시 멈춤
    let c = await card(page, 840, "전시윤");
    assert.match(c, /완료 9( · 취소 \d)? → 10번 완료 예정/);
    assert.match(c, /이벤트 1번째 · 1번 양식/);
    assert.doesNotMatch(c, /사은권/);

    // 입장(이용완료) → 그 순간 기록 · 입장권: 1번째 안내 · 원래 누계 · 사은권 줄 없음
    await enter(page, 840, "전시윤");
    assert.match(await page.textContent("#toast"), /이벤트 1번째 · 1번 양식/);
    assert.doesNotMatch(await page.textContent("#toast"), /사은권/);
    let t = await ticket(page, "전시윤");
    assert.ok(t.includes("이벤트 첫 방문") && t.includes("음료 1잔 무료 (1번째)") && t.some((l) => /번 열쇠 손님$/.test(l)), t.join(" | "));
    assert.ok(!t.some((l) => /네이버 예약 \d+번|사은권|이용완료$/.test(l)), t.join(" | "));
    assert.ok(t.some((l) => /퇴장시간 지연/.test(l)), "나머지 양식은 그대로");
    let jeon = Object.values((await page.evaluate(() => window.__deskTest.evLog())).people).find((p) => p.name === "전시윤");
    assert.deepStrictEqual([jeon.base, jeon.last, jeon.visits.length], [9, 10, 1], "완료 9 = 0 · 이번 10 = 이벤트 1");

    // 조건 [이벤트] 는 입장권 양식에서도: 이벤트 손님에게만
    const custom = "[이벤트]^이벤트 손님만\n[네이버]^원래 누계 {누계}\n^모두";
    assert.deepStrictEqual(await ticket(page, "전시윤", custom), ["이벤트 손님만", "이벤트 첫 방문", "음료 1잔 무료 (1번째)", `${(await ticket(page, "전시윤")).find((l) => /번 열쇠 손님$/.test(l))}`, "모두"]);

    // 같은 시간 나눠 한 예약(완료 8, 2건): 한 번 방문 → 처음 방문(1번 양식) · {이벤트회} 는 함께 완료한 뒤 2
    await enter(page, 900, "나분할");
    t = await ticket(page, "나분할");
    assert.ok(t.includes("이벤트 첫 방문") && t.includes("음료 1잔 무료 (2번째)"), t.join(" | "));

    // 재방문: 처음 방문 뒤 15일(9/20) → 2번 양식 · 65일(8/1) → 3번 양식
    await page.evaluate(() => { window.__deskTest.evInject("홍예준", 4, 10, "2026-09-20"); window.__deskTest.evInject("고은우", 2, 4, "2026-08-01"); });
    assert.match(await card(page, 840, "홍예준"), /완료 10 → 11번 완료 예정.*이벤트 7번째 · 2번 양식/);
    assert.match(await card(page, 840, "고은우"), /완료 4 → 5번 완료 예정.*이벤트 3번째 · 3번 양식/);
    await enter(page, 840, "홍예준");
    assert.match(await page.textContent("#toast"), /이벤트 7번째 · 2번 양식/);
    t = await ticket(page, "홍예준");
    assert.ok(t.includes("두 번째 방문") && t.includes("10월 5일부터 7번째"), t.join(" | "));
    assert.strictEqual((await ticket(page, "홍예준", "^{첫방문} 첫 방문 · {경과일}일째"))[0], "9월 20일 첫 방문 · 15일째", "값 {첫방문} · {경과일}");
    await enter(page, 840, "고은우");
    assert.ok((await ticket(page, "고은우")).includes("방문 이벤트 3번째"), "3번 양식 기본 문구");

    // 양식 번호 옆 기준(일)을 바꾸면 바로: 2번 30 → 10일 → 15일째인 홍예준은 2 · 3번 어디에도 안 맞음 → 3번도 10일이면 3번
    await openEvent(page);
    assert.deepStrictEqual(await page.$$eval("#sheet .evrule .evsel", (e) => e.map((x) => x.value)), ["first", "firstIn", "firstOut", "off", "off"]);
    assert.deepStrictEqual(await page.$$eval("#sheet .evrule .evn", (e) => e.map((x) => x.value)), ["30", "30"], "기준 숫자 칸은 날짜 조건에만");
    await page.fill(".evn[data-i='1']", "10");
    await close(page);
    c = await card(page, 840, "홍예준");
    assert.match(c, /이벤트 7번째/);
    assert.doesNotMatch(c, /양식/, "맞는 양식 없음");
    await openEvent(page);
    await page.fill(".evn[data-i='2']", "10");
    await close(page);
    assert.match(await card(page, 840, "홍예준"), /이벤트 7번째 · 3번 양식/);
    // 조건 바꾸기: 1번 양식 = 7번째 이상
    await openEvent(page);
    await page.selectOption(".evsel[data-i='0']", "nthUp");
    await page.fill(".evn[data-i='0']", "7");
    await close(page);
    assert.match(await card(page, 840, "홍예준"), /이벤트 7번째 · 1번 양식/);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("astanakiz-visitevent")).rules);
    assert.deepStrictEqual(saved.slice(0, 3), [{ t: "nthUp", n: 7 }, { t: "firstIn", n: 10 }, { t: "firstOut", n: 10 }], "이 PC에 저장");

    // 현장 입장권은 그대로 (네이버 예약 안내 · [이벤트] 줄 없음)
    const walk = await page.evaluate((x) => { const T = window.__deskTest; const w = T.holders().find((y) => y.walk); return [T.receiptLines(T.form(), T.keyVals(w)).map((l) => l.t), T.receiptLines(x, T.keyVals(w)).map((l) => l.t)]; }, custom);
    assert.ok(walk[0].some((l) => /네이버 예약하고/.test(l)) && !walk[0].some((l) => /방문 이벤트/.test(l)));
    assert.deepStrictEqual(walk[1], ["모두"]);

    // 찾기: 전화 뒷번호 → 기준일 뒤 실적 (나분할 1234 · 같은 뒷번호 나연속은 아직 이용완료 없음)
    await openEvent(page);
    let hits = await find(page, "1234");
    assert.match(hits, /나분할 010-6660-1234 · 이벤트 2회 \(네이버 완료 8 → 10\).*1번째.*2번째/);
    assert.doesNotMatch(hits, /나연속/);
    assert.match(await find(page, "1327"), /전시윤 .*이벤트 1회/);

    // 끄기 → 원래 로직 (누계 10 · 사은권) · 기록은 남음
    await page.click("[data-act=evOff]");
    assert.match(await page.textContent("#sheet .evstate"), /꺼짐/);
    assert.match(await find(page, "전시윤"), /이벤트 1회/, "꺼도 기록은 찾아짐");
    await close(page);
    t = await ticket(page, "전시윤");
    assert.ok(t.some((l) => /네이버 예약 10번/.test(l)) && t.some((l) => /사은권/.test(l)) && !t.includes("이벤트 첫 방문"), t.join(" | "));
    assert.match(await card(page, 840, "전시윤"), /10번째 예약완료.*사은권 증정/);

    // 다시 켜기 (같은 기준일) → 그대로 이어서
    await openEvent(page);
    await page.click("[data-act=evApply]");
    await close(page);
    assert.match(await card(page, 840, "전시윤"), /10번째 예약완료.*이벤트 1번째/);

    // 기준일이 아직 안 온 날이면 그날까지 원래대로
    await openEvent(page);
    await page.fill("#ev-from", "2026-10-06");
    await page.click("[data-act=evApply]");
    assert.match(await page.textContent("#sheet .evstate"), /기다리는 중.*10월 6일부터/);
    await close(page);
    assert.doesNotMatch(await card(page, 840, "전시윤"), /이벤트/);
    assert.ok((await ticket(page, "전시윤")).some((l) => /네이버 예약 10번/.test(l)));
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("방문 이벤트(앱): 장부는 POS PC 파일(기준일.jsonl)에 이용완료마다 한 줄 · 다시 켜도 그대로", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date("2026-10-14T13:00:00") });
    await page.addInitScript(() => {
      // 기준일 10/12 · 김기록은 10/12 에 이미 이용완료 (그때 완료 6 → 7 = 이벤트 1번째)
      const first = JSON.stringify({ at: "2026-10-12 10:58", day: "2026-10-12", no: "N1", k: "01012340000", name: "김기록", phone: "01012340000", prev: 6, n: 7, base: 6, st: "a", kind: "A", due: "2026-10-26", reset: "2026-11-11", cnt: 1 }) + "\n";
      if (localStorage.getItem("test-ledger") == null) localStorage.setItem("test-ledger", first);
      window.__adds = [];
      const BK = (no, time, name, phone, done) => ({ no, time, name, phone, qty: 1, qtyText: "1시간 50분 1", product: "1시간 50분", status: "확정", pay: "결제완료", doneCount: done, cancelCount: 0 });
      window.desk = {
        naver: {
          load: async (day) => ({ ok: true, day, slots: day === "2026-10-14" ? [{ time: "14:00", cap: 10, conf: 2, done: 0 }] : [], bookings: day === "2026-10-14" ? [BK("N2", "14:00", "김기록", "010-1234-0000", 7), BK("N3", "14:00", "박새로", "010-5555-0001", 3)] : [] }),
          complete: async () => ({ ok: true }),
        },
        state: { load: (day) => localStorage.getItem("test-state-" + day), save: (day, json) => localStorage.setItem("test-state-" + day, json) },
        config: { get: async () => ({ build: "1.37", visitEvent: { on: true, from: "2026-10-12", stamp: { a: 14, b: 7, m: 30 } } }), set: async () => ({ ok: true }) },
        ledger: {
          load: (from) => (from === "2026-10-12" ? localStorage.getItem("test-ledger") : null),
          add: (from, line) => { window.__adds.push([from, line]); localStorage.setItem("test-ledger", (localStorage.getItem("test-ledger") || "") + line + "\n"); },
        },
      };
    });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    await page.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 15000 });
    // 이벤트(기본): 김기록은 10/12 a(다음 기한 10/26) → 오늘 10/14 기한 안 → c · 박새로는 기록 없음 → a
    assert.match(await card(page, 840, "김기록"), /완료 7 → 8번 완료 예정.*이벤트 c · 3번 양식/);
    assert.match(await card(page, 840, "박새로"), /완료 3 → 4번 완료 예정.*이벤트 a · 1번 양식/);
    assert.deepStrictEqual(await page.evaluate(() => window.__adds), [], "아직 아무도 이용완료 안 함 → 기록 없음");

    await enter(page, 840, "박새로");
    await page.waitForFunction(() => window.__adds.length === 1);
    const [from, line] = await page.evaluate(() => window.__adds[0]);
    const r = JSON.parse(line);
    assert.strictEqual(from, "2026-10-12");
    assert.deepStrictEqual([r.name, r.phone, r.no, r.prev, r.n, r.base, r.day], ["박새로", "01055550001", "N3", 3, 4, 3, "2026-10-14"]);
    assert.deepStrictEqual([r.st, r.kind, r.due, r.reset, r.cnt], ["a", "A", "2026-10-28", "2026-11-13", 1], "영수증 a · 다음 기한 A(14일) · 리셋 30일");
    assert.match(r.at, /^2026-10-14 \d\d:\d\d$/);

    // 다시 켜기: 파일에서 그대로 → 찾기
    await page.goto(DESK);
    await page.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 15000 });
    await openEvent(page);
    assert.match(await page.textContent("#sheet"), /기록 2명 · 이용완료 2건/);
    assert.match(await find(page, "0001"), /박새로 010-5555-0001 · 이벤트 1회.*10\/14 \d\d:\d\d 1번째/);
    assert.match(await find(page, "김기"), /김기록 .*이벤트 1회.*이벤트 지금 a · 다음 기한 10\/26\(A\) · 리셋 11\/11.*10\/12 10:58 1번째 a/);
    await close(page);
    assert.deepStrictEqual(await page.evaluate(() => window.__adds), [], "다시 켜도 같은 예약을 두 번 적지 않음");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("이벤트: a 시작 → A기한 안 c → B기한 안 e / B 넘김 · 리셋 전 d / 넘김 b · 같은 날 영수증 없음 · 약속한 기한은 그대로", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 10/5 (기준일 10/5)
    await openEvent(page);
    assert.strictEqual(await page.getAttribute("[data-act=evMode][data-m=stamp]", "aria-pressed"), "true", "기본 방식 = 이벤트");
    // 기한 · 음식은 사장님이 회의 뒤 직접 넣음 → 처음엔 비어 있고, 비어 있으면 못 켬
    assert.deepStrictEqual(await page.$$eval("#sheet .evps .evpn", (e) => e.map((x) => [x.dataset.k, x.value])), [["a", ""], ["b", ""], ["m", ""]]);
    await page.fill("#ev-from", "2026-10-05");
    await page.click("[data-act=evApply]");
    assert.match(await page.textContent("#toast"), /기한을 먼저 넣어/);
    assert.match(await page.textContent("#sheet .evstate"), /꺼짐/);
    await page.fill(".evpn[data-k=a]", "7");
    await page.fill(".evpn[data-k=b]", "14");
    await page.fill(".evpn[data-k=m]", "30");
    assert.match(await page.textContent("#ev-warn"), /B기한 < A기한 < 리셋/);
    await page.fill(".evpn[data-k=a]", "14");
    await page.fill(".evpn[data-k=b]", "7");
    assert.match(await page.textContent("#ev-warn"), /\{A음식\}/, "예시 문구에 쓴 음식 이름이 비어 있음");
    await page.fill(".evfood[data-k=foodA]", "감자튀김");
    await page.fill(".evfood[data-k=foodB]", "핫도그");
    assert.strictEqual((await page.textContent("#ev-warn")).trim(), "");
    // 일수를 넣으면 영수증에 찍힐 날짜를 바로 보여 줌 (기준일 10/5에 오면)
    assert.match((await page.textContent("#ev-dates")).replace(/\s+/g, " "), /10월 5일에 오면 → A 10월 19일\(포함\)까지 · B 10월 12일\(포함\)까지 · 리셋 11월 4일\(포함\)까지/);
    await page.click("[data-act=evApply]");
    assert.match(await page.textContent("#sheet .evstate"), /켜짐/);
    assert.match(await page.textContent("#ev-def"), /아직 예시 문구: 1 · 2 · 3 · 4 · 5번 양식/);
    const rows = (await page.$$eval("#sheet .evrule", (e) => e.map((x) => x.innerText.replace(/\s+/g, " ").trim())));
    assert.deepStrictEqual(rows.map((r) => r.split(" ").slice(0, 3).join(" ")), ["1번 양식 a", "2번 양식 b", "3번 양식 c", "4번 양식 d", "5번 양식 e"]);
    // 미리보기: 3번(c) — A음식 쿠폰 + B기한 안내
    await page.click("[data-act=evTpl][data-i='2']");
    assert.match((await page.textContent("#ev-paper")).replace(/\s+/g, " "), /이벤트 성공!.*\[ 감자튀김 쿠폰 \].*10월 12일\(포함\)까지 재방문 하시면.*핫도그 쿠폰을 드려요.*\(2번째 방문\)/);
    await close(page);

    // 기준일 뒤 지난 기록 (오늘 10/5)
    const inject = (name, o) => page.evaluate(([n, x]) => window.__deskTest.evInject(n, x), [name, o]);
    await inject("홍예준", { day: "2026-09-25", st: "a", kind: "A", due: "2026-10-09", reset: "2026-10-25", cnt: 1 }); // A 안 → c
    await inject("고은우", { day: "2026-09-10", st: "a", kind: "A", due: "2026-09-24", reset: "2026-10-10", cnt: 1 }); // A 넘김 → b
    await inject("류하린", { day: "2026-10-01", st: "c", kind: "B", due: "2026-10-08", reset: "2026-10-31", cnt: 2 }); // B 안 → e
    await inject("송다온", { day: "2026-09-20", st: "c", kind: "B", due: "2026-09-27", reset: "2026-10-20", cnt: 2 }); // B 넘김 · 리셋 전 → d
    await inject("김어긋", { day: "2026-09-01", st: "c", kind: "B", due: "2026-09-08", reset: "2026-10-01", cnt: 2 }); // 리셋 넘김 → b
    const expect = { 전시윤: "a · 1번", 홍예준: "c · 3번", 고은우: "b · 2번", 류하린: "e · 5번", 송다온: "d · 4번", 김어긋: "b · 2번" };
    for (const [n, x] of Object.entries(expect)) assert.match(await card(page, 840, n), new RegExp(`이벤트 ${x} 양식`), n);

    // 입장 → 입장권 · 장부
    await enter(page, 840, "전시윤");
    assert.match(await page.textContent("#toast"), /이벤트 a · 1번 양식/);
    let t = await ticket(page, "전시윤");
    for (const l of ["이벤트 시작!", "10월 19일(포함)까지 재방문 하시면", "감자튀김 쿠폰을 드려요", "11월 4일(포함)까지 다시 오지 않으면", "이벤트가 처음부터 다시 시작돼요"]) assert.ok(t.includes(l), l + " | " + t.join(" | "));
    assert.ok(!t.some((l) => /네이버 예약 \d+번|사은권/.test(l)), "원래 누계 · 사은권 줄 없음");
    await enter(page, 840, "홍예준");
    t = await ticket(page, "홍예준");
    for (const l of ["이벤트 성공!", "[ 감자튀김 쿠폰 ]", "10월 12일(포함)까지 재방문 하시면", "핫도그 쿠폰을 드려요", "(2번째 방문)"]) assert.ok(t.includes(l), l + " | " + t.join(" | "));
    await enter(page, 840, "류하린");
    t = await ticket(page, "류하린");
    for (const l of ["이벤트 대성공!", "[ 핫도그 쿠폰 ]", "10월 19일(포함)까지 재방문 하시면", "감자튀김 쿠폰을 드려요", "(3번째 방문)"]) assert.ok(t.includes(l), l + " | " + t.join(" | "));
    await enter(page, 840, "송다온");
    t = await ticket(page, "송다온");
    for (const l of ["이벤트 계속!", "[ 감자튀김 쿠폰 ]", "10월 19일(포함)까지 재방문 하시면", "감자튀김 쿠폰을 또 드려요", "(3번째 방문)"]) assert.ok(t.includes(l), l + " | " + t.join(" | "));
    await enter(page, 840, "고은우");
    t = await ticket(page, "고은우");
    for (const l of ["다시!! 재도전", "10월 19일(포함)까지 재방문 하시면", "11월 4일(포함)까지 다시 오지 않으면"]) assert.ok(t.includes(l), l + " | " + t.join(" | "));
    // 예시 문구도 OK-50 한 줄(42칸) 안
    const cols = (x) => [...x].reduce((a, c) => a + (c.charCodeAt(0) < 128 ? 1 : 2), 0);
    for (const n of ["전시윤", "홍예준", "류하린", "송다온", "고은우"]) {
      const ls = await page.evaluate((nm) => { const T = window.__deskTest, h = T.holders().find((x) => x.name === nm); return T.receiptLines(T.form(), T.keyVals(h)).filter((l) => l.ev && l.t).map((l) => [l.t, l.size || 1]); }, n);
      assert.ok(ls.length > 3, n);
      for (const [x, z] of ls) assert.ok(cols(x) * z <= 42, `${n}: 42칸 넘음 ${x}`);
    }
    const ppl = Object.values((await page.evaluate(() => window.__deskTest.evLog())).people);
    const lastOf = (n) => { const p = ppl.find((x) => x.name === n); return p.visits[p.visits.length - 1]; };
    assert.deepStrictEqual(["st", "kind", "due", "reset", "cnt"].map((k) => lastOf("홍예준")[k]), ["c", "B", "2026-10-12", "2026-11-04", 2], "c 뒤 다음 기한 B(7일)");
    assert.deepStrictEqual(["st", "kind", "due", "cnt"].map((k) => lastOf("류하린")[k]), ["e", "A", "2026-10-19", 3]);

    // 같은 시간 나눠 한 예약: 한 번 방문 → 이벤트 영수증 하나 (a)
    await enter(page, 900, "나분할");
    const nab = ppl.length && Object.values((await page.evaluate(() => window.__deskTest.evLog())).people).find((x) => x.name === "나분할");
    assert.deepStrictEqual(nab.visits.map((v) => v.st), ["a", ""], "예약 2건 · 영수증 기록은 하나");

    // 같은 날 또 오면 이벤트 영수증 없음 (안내 없이 출력)
    await page.evaluate(() => { const T = window.__deskTest, h = T.holders().find((x) => x.name === "전시윤"); T.addBooking("2026-10-05", "16:30", "전시윤", h.phone, 1, { prevDone: 10 }); });
    assert.match(await card(page, 990, "전시윤"), /이벤트 · 오늘 이미 받음/);

    // 일수를 바꿔도 이미 찍어 준 기한은 그대로 (전시윤 a: 10/19), 새 손님부터 바뀐 일수
    await openEvent(page);
    await page.fill(".evpn[data-k=a]", "10");
    assert.match((await page.textContent("#ev-paper")).replace(/\s+/g, " "), /10월 12일\(포함\)까지 재방문 하시면/, "미리보기 3번(c)은 B 7일");
    await page.click("[data-act=evTpl][data-i='0']");
    assert.match((await page.textContent("#ev-paper")).replace(/\s+/g, " "), /10월 15일\(포함\)까지 재방문 하시면/, "1번(a)은 바뀐 A 10일");
    await close(page);
    assert.strictEqual(lastOf("전시윤").due, "2026-10-19");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("astanakiz-visitevent")));
    assert.deepStrictEqual([saved.mode, saved.stamp], ["stamp", { a: 10, b: 7, m: 30, foodA: "감자튀김", foodB: "핫도그" }]);

    // 찾기: 지금 상태 · 다음 기한
    await openEvent(page);
    assert.match(await find(page, "홍예준"), /이벤트 지금 c · 다음 기한 10\/12\(B\) · 리셋 11\/04.*09\/25 10:00 \d+번째 a.*번째 c/);
    // 양식별 조건으로 바꾸면 기본 문구인 양식은 그 방식 기본 문구로 · 다시 이벤트로 바꾸면 돌아옴
    await page.click("[data-act=evMode][data-m=rule]");
    assert.match(await page.inputValue("#ev-text"), /방문 이벤트 \{이벤트회\}번째/);
    await page.click("[data-act=evMode][data-m=stamp]");
    assert.match(await page.inputValue("#ev-text"), /이벤트 시작!/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
