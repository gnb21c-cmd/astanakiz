/* 방문 이벤트 (사용자 지시 10/14 · 1.37)
   - 운영 설정 → 방문 이벤트: 기준일(오늘 · 앞날)을 정하면 그날부터 모든 손님을 처음 오는 손님처럼 셈 (네이버 숫자는 그대로, 데스크에서만)
     기록에 없는 손님 = 네이버에 보이는 완료 수를 0으로 → 이용완료하는 순간 POS PC 에 한 줄 기록하고 거기서부터 셈 (완료 7 → 이번 8이 이벤트 1번째)
   - 켜는 순간 원래 로직(입장권에 네이버 완료 +1 누계 · 10회 사은권)은 멈추고, 회차별 안내(1 · 2 · 3 · 4 · 5번째 이상)를 그 자리에 출력
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

test("방문 이벤트: 기준일부터 처음 오는 손님처럼 · 이용완료 때 기록 · 찾기 · 회차별 안내 · 끄면 원래대로", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 10/5 13:50 · 전시윤 14:00 완료 9 (이번이 10번째 = 사은권)

    assert.match(await card(page, 840, "전시윤"), /완료 9( · 취소 \d)? → 10번 완료 예정.*사은권 증정/, "꺼져 있으면 원래대로");
    await openEvent(page);
    assert.match(await page.textContent("#sheet .evstate"), /꺼짐/);
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

    // 회차별 안내 쓰기: 1번째 · 2번째 (미리보기에 바로) — 입장권 양식의 값({열쇠})과 조건([네이버])도 씀
    await page.fill("#ev-text", "#* 이벤트 첫 방문\n^음료 1잔 무료 ({이벤트회}번째)\n[네이버]^{열쇠}번 열쇠 손님");
    assert.match(await page.textContent("#ev-paper"), /이벤트 첫 방문.*음료 1잔 무료 \(1번째\).*3, 13번 열쇠 손님/);
    assert.doesNotMatch(await page.textContent("#ev-paper"), /네이버 예약 \d+번|10번마다/, "미리보기에도 원래 누계 · 사은권 줄 없음");
    await page.click("[data-act=evTpl][data-i='1']");
    await page.fill("#ev-text", "#* 두 번째 방문\n^{기준일}부터 {이벤트회}번째");
    assert.match(await page.textContent("#ev-paper"), /두 번째 방문.*10월 5일부터 2번째/);
    await page.click("[data-act=evTpl][data-i='0']");
    assert.strictEqual(await page.inputValue("#ev-text"), "#* 이벤트 첫 방문\n^음료 1잔 무료 ({이벤트회}번째)\n[네이버]^{열쇠}번 열쇠 손님", "회차마다 따로 남음");
    // 쓰는 법은 입장권 양식과 똑같음
    const evHelp = (await page.textContent("#sheet .formhelp")).replace(/\s+/g, " ");
    assert.match(evHelp, /\{열쇠\}.*\{이벤트회\}.*\[이벤트\]/);
    await page.click('[data-t="printer"]');
    assert.strictEqual((await page.textContent("#sheet .formhelp")).replace(/\s+/g, " "), evHelp, "프린터 탭과 같은 설명");
    await page.click("[data-act=previewKind][data-k=event]");
    assert.match(await page.textContent("#paper"), /이벤트 첫 방문/, "프린터 탭 미리보기에서도 이벤트 입장권");
    await close(page);

    // 카드: 기록에 없는 손님 = 네이버 완료를 0으로 → 이벤트 1번째 · 사은권 표시 멈춤
    let c = await card(page, 840, "전시윤");
    assert.match(c, /완료 9( · 취소 \d)? → 10번 완료 예정/);
    assert.match(c, /이벤트 1번째/);
    assert.doesNotMatch(c, /사은권/);

    // 입장(이용완료) → 그 순간 기록 · 입장권: 1번째 안내 · 원래 누계 · 사은권 줄 없음
    await enter(page, 840, "전시윤");
    assert.match(await page.textContent("#toast"), /이벤트 1번째/);
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

    // 같은 시간 나눠 한 예약(완료 8, 2건) → 함께 완료 9 · 10 → 이벤트 2번째 안내
    await enter(page, 900, "나분할");
    t = await ticket(page, "나분할");
    assert.ok(t.includes("두 번째 방문") && t.includes("10월 5일부터 2번째"), t.join(" | "));

    // 5번째 이상은 5번째 안내 ({이벤트회} 는 실제 회차) — 기준일 뒤 이미 6번 온 손님
    await page.evaluate(() => window.__deskTest.evInject("홍예준", 4, 10));
    c = await card(page, 840, "홍예준");
    assert.match(c, /완료 10 → 11번 완료 예정.*이벤트 7번째/);
    await enter(page, 840, "홍예준");
    t = await ticket(page, "홍예준");
    assert.ok(t.includes("방문 이벤트 7번째"), "5번째 이상 = 5번째 기본 문구 · 회차 7 " + t.join(" | "));

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
      const first = JSON.stringify({ at: "2026-10-12 10:58", day: "2026-10-12", no: "N1", k: "01012340000", name: "김기록", phone: "01012340000", prev: 6, n: 7, base: 6 }) + "\n";
      if (localStorage.getItem("test-ledger") == null) localStorage.setItem("test-ledger", first);
      window.__adds = [];
      const BK = (no, time, name, phone, done) => ({ no, time, name, phone, qty: 1, qtyText: "1시간 50분 1", product: "1시간 50분", status: "확정", pay: "결제완료", doneCount: done, cancelCount: 0 });
      window.desk = {
        naver: {
          load: async (day) => ({ ok: true, day, slots: day === "2026-10-14" ? [{ time: "14:00", cap: 10, conf: 2, done: 0 }] : [], bookings: day === "2026-10-14" ? [BK("N2", "14:00", "김기록", "010-1234-0000", 7), BK("N3", "14:00", "박새로", "010-5555-0001", 3)] : [] }),
          complete: async () => ({ ok: true }),
        },
        state: { load: (day) => localStorage.getItem("test-state-" + day), save: (day, json) => localStorage.setItem("test-state-" + day, json) },
        config: { get: async () => ({ build: "1.37", visitEvent: { on: true, from: "2026-10-12" } }), set: async () => ({ ok: true }) },
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
    // 김기록: 장부 기준 6 · 지금 완료 7 → 이번 8번째 = 이벤트 2번째 / 박새로: 장부에 없음 → 완료 3을 0으로 → 이벤트 1번째
    assert.match(await card(page, 840, "김기록"), /완료 7 → 8번 완료 예정.*이벤트 2번째/);
    assert.match(await card(page, 840, "박새로"), /완료 3 → 4번 완료 예정.*이벤트 1번째/);
    assert.deepStrictEqual(await page.evaluate(() => window.__adds), [], "아직 아무도 이용완료 안 함 → 기록 없음");

    await enter(page, 840, "박새로");
    await page.waitForFunction(() => window.__adds.length === 1);
    const [from, line] = await page.evaluate(() => window.__adds[0]);
    const r = JSON.parse(line);
    assert.strictEqual(from, "2026-10-12");
    assert.deepStrictEqual([r.name, r.phone, r.no, r.prev, r.n, r.base, r.day], ["박새로", "01055550001", "N3", 3, 4, 3, "2026-10-14"]);
    assert.match(r.at, /^2026-10-14 \d\d:\d\d$/);

    // 다시 켜기: 파일에서 그대로 → 찾기
    await page.goto(DESK);
    await page.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 15000 });
    await openEvent(page);
    assert.match(await page.textContent("#sheet"), /기록 2명 · 이용완료 2건/);
    assert.match(await find(page, "0001"), /박새로 010-5555-0001 · 이벤트 1회.*10\/14 \d\d:\d\d 1번째/);
    assert.match(await find(page, "김기"), /김기록 .*이벤트 1회.*10\/12 10:58 1번째/);
    await close(page);
    assert.deepStrictEqual(await page.evaluate(() => window.__adds), [], "다시 켜도 같은 예약을 두 번 적지 않음");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
