/* 네이버 가린 정보 (사장님 11/26 — 미리 알림 없이 이름 가운데 · 전화번호 앞 · 가운데를 * 로: "은*인" · "***-****-1252")
   예전엔 전화번호 전체가 손님 열쇠라 가려진 뒤로 예전 장부(이벤트 · 마일리지) · 메모 · BC 와 안 이어져 이벤트 쿠폰이 안 나갔음
   - 같은 손님 = 이름 첫 · 끝 글자 + 전화 뒷 4자리 (예전 기록의 전체 이름 · 번호도 같은 모양으로 견줌) · 이메일 · 전체 번호가 둘 다 있으면 같아야 함
   - 입장 창: 전화번호 가운데 4자리를 받아야 [등록 완료] (열쇠를 가져가는 손님 · 장부에 전체 번호)
   - 네이버 고객정보 '지난 예약'의 마지막 이용완료가 기한 안이면 이벤트 도전 성공 (장부에 없어도) · 아직 못 읽었으면 '재방문 확인 중' · 입장권은 읽은 뒤 */
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
const EVCFG = { ver: 2, on: true, from: "2026-09-10", to: "2026-10-31", days: 20, gift: "수제돈까스" };
const cardText = async (page, name) => (await page.textContent(`.res:has-text("${name}")`)).replace(/\s+/g, " ");

test("가린 손님 (체험판): 예전 장부(전체 이름 · 번호)와 이름 첫 · 끝 + 뒷 4자리로 이어짐 → 이벤트 도전 성공 · 뒷번호만 같은 다른 손님은 아님 · 가려진 뒤 적힌 줄(뒷 4자리)도 이어짐 · 입장 창 가운데 4자리", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await page.addInitScript((cfg) => { if (!sessionStorage.getItem("once")) { sessionStorage.setItem("once", "1"); localStorage.clear(); localStorage.setItem("astanakiz-visitevent", JSON.stringify(cfg)); } }, EVCFG);
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 2026-10-05 13:50
    await page.evaluate(() => {
      const T = window.__deskTest, d = T.today();
      // 예전 장부 줄 (가려지기 전 — 전체 이름 · 번호) 9/20 · 가려진 뒤 적힌 줄 (k = 뒷 4자리 · 가린 이름) 9/28
      T.evLine({ at: "2026-09-20 14:00", day: "2026-09-20", no: "old-1", k: "01056781252", name: "은지인", phone: "01056781252", prev: 1, n: 2, base: 1, st: "안내", due: "2026-10-10" });
      T.evLine({ at: "2026-09-28 11:00", day: "2026-09-28", no: "msk-1", k: "7777", name: "이*희", phone: "7777", prev: 3, n: 4, base: 3, st: "안내", due: "2026-10-18" });
      T.addBooking(d, "16:30", "은*인", "***-****-1252", 1, { prevDone: 2 });
      T.addBooking(d, "16:30", "김*수", "***-****-1252", 1, { prevDone: 3 }); // 뒷번호만 같은 다른 손님
      T.addBooking(d, "16:30", "이*희", "***-****-7777", 1, { prevDone: 4 });
    });
    await page.click('.slot[data-s="990"]');
    assert.match(await cardText(page, "은*인"), /이벤트 도전 성공/, "예전 장부(은지인 01056781252) 9/20 → 15일 만");
    assert.match(await cardText(page, "김*수"), /이벤트 도전 시작/, "뒷번호만 같으면 다른 손님");
    assert.match(await cardText(page, "이*희"), /이벤트 도전 성공/, "가려진 뒤 뒷 4자리로 적힌 줄도 이어짐");
    assert.match(await cardText(page, "은*인"), /\*\*\*-\*\*\*\*-1252/, "카드 전화번호는 가린 그대로");
    assert.doesNotMatch(await cardText(page, "은*인"), /같은 시간 예약/, "뒷번호만 같은 다른 손님(김*수)과 같은 시간이어도 묶음 아님");
    // 입장 창: 가운데 4자리 → 예전 기록과 같은지 (번호는 안 보임) → [등록 완료]
    await page.click('.res:has-text("은*인")');
    // 입장 창은 열린 뒤 30ms 에 커서를 놓음 (focusFirst) — 놓일 때까지 기다림 (11/27: 바로 보면 가끔 아직 안 놓임)
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === "e-mid", null, { timeout: 2000 }).catch(() => {});
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), "e-mid", "가운데 4자리 칸에 커서");
    await page.click(".kpick button:not([disabled]) >> nth=0");
    assert.ok(await page.isDisabled("#enter-done"), "가운데 4자리 전엔 등록 안 됨");
    await page.fill("#e-mid", "1111");
    assert.match(await page.textContent("#sheet .midhelp"), /예전 기록.*달라요/);
    for (let i = 0; i < 4; i++) await page.click('[data-act=midKey][data-n="del"]');
    for (const n of "5678") await page.click(`[data-act=midKey][data-n="${n}"]`);
    assert.match(await page.textContent("#sheet .midhelp"), /✓ 예전 방문 기록과 같은 번호/);
    assert.ok(!(await page.isDisabled("#enter-done")));
    await page.click("#enter-done");
    // 장부: 전체 번호로 · 성공 · 같은 손님 기록에 이어짐
    const L = await page.evaluate(() => window.__deskTest.evLog().people);
    const eun = L["m:은인1252"];
    assert.ok(eun, Object.keys(L).join(", "));
    assert.strictEqual(eun.phone, "01056781252");
    assert.deepStrictEqual(eun.visits.map((v) => [v.day, v.st || ""]), [["2026-09-20", "안내"], ["2026-10-05", "성공"]]);
    assert.strictEqual(await page.evaluate(() => window.__deskTest.holders().find((h) => h.name === "은*인").phoneFull), "01056781252");
    // 열쇠 창 전화번호 = 전체
    const k = await page.evaluate(() => window.__deskTest.holders().find((h) => h.name === "은*인").keys[0]);
    await page.click(`.key[data-k="${k}"]`);
    assert.match(await page.textContent("#sheet"), /010-5678-1252/);
    await page.click("#sheet [data-act=close] >> nth=0");
    // 뒷번호만 같은 다른 손님: 다른 가운데 번호 → 따로 · 도전 시작
    await page.click('.res:has-text("김*수")');
    assert.match(await page.textContent("#sheet .midhelp"), /가운데 4자리/);
    await page.click(".kpick button:not([disabled]) >> nth=0");
    for (const n of "2468") await page.click(`[data-act=midKey][data-n="${n}"]`);
    assert.match(await page.textContent("#sheet .midhelp"), /010-2468-1252 로 저장해요/, "예전 기록 없음");
    await page.click("#enter-done");
    const L2 = await page.evaluate(() => window.__deskTest.evLog().people);
    const kim = L2["m:김수1252"];
    assert.deepStrictEqual([kim.phone, kim.visits.map((v) => v.st)], ["01024681252", ["안내"]]);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("가린 손님 (앱): 네이버 고객정보 지난 예약으로 이벤트 판정 · 읽기 전엔 '재방문 확인 중' · 입장권은 읽은 뒤 · 예전 BC(이름 · 뒷 4자리)는 짐작으로 보이되 자동 전액 취소는 안 함", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date("2026-10-05T13:50:00") });
    await page.addInitScript((cfg) => {
      window.__ci = []; window.__jobs = []; window.__cancel = []; window.__gate = null;
      const BK = (no, time, name, phone, done) => ({ no, time, name, phone, qty: 1, qtyText: "1시간 50분 1", product: "1시간 50분", status: "확정", pay: "결제완료", doneCount: done, cancelCount: 0 });
      const PAST = { N1: ["2026-09-25", "2026-08-01"], N2: ["2026-08-01"], N3: ["2026-09-30"] };
      window.desk = {
        naver: {
          load: async (day) => ({ ok: true, day, slots: day === "2026-10-05" ? [{ time: "14:00", product: "1시간 50분", cap: 10, conf: 4, done: 0 }] : [],
            bookings: day === "2026-10-05" ? [BK("N1", "14:00", "박*준", "***-****-3333", 3), BK("N2", "14:00", "최*아", "***-****-4444", 1), BK("N3", "14:00", "강*율", "***-****-5555", 2), BK("N4", "14:00", "오*석", "***-****-6666", 5)] : [] }),
          complete: async () => ({ ok: true }),
          custInfo: async (job) => {
            window.__ci.push(job.list.map((x) => x.no));
            if (job.list.some((x) => x.no === "N3")) await new Promise((r) => (window.__gate = r)); // 강*율은 늦게 읽힘
            const info = {};
            for (const x of job.list) info[x.no] = { ok: true, email: x.no === "N1" ? "pa***@gmail.com" : "", past: PAST[x.no] || [] };
            return { ok: true, info };
          },
          cancelPaid: async (b) => { window.__cancel.push(b.no); return { ok: true }; },
        },
        state: { load: () => null, save: () => {} },
        config: { get: async () => ({ build: "2.35", printMode: "com", comPort: "COM3", visitEvent: cfg }), set: async () => ({ ok: true }) },
        print: { escpos: async (j) => { window.__jobs.push(j); return { ok: true }; } },
        notes: {
          get: async () => ({ ok: true, notes: {} }),
          set: async () => ({ ok: true, note: null }),
          // 예전 BC 쓰리아웃 (가려지기 전 · 이름 · 뒷 4자리만 목록에 있음)
          list: async () => ({ ok: true, list: [{ id: "a1b2c3d4e5f60718", bc: 3, sk: [], nm: "오대석", p4: "6666", m: "", bcAt: "2026-10-01", r3: "소란", r3At: "2026-10-01 10:00", at: "" }] }),
          patch: async () => ({ ok: true, note: null }),
        },
      };
    }, Object.assign({}, EVCFG, { on: true }));
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    await page.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 15000 });
    await page.click('.slot[data-s="840"]');
    // 읽기 전: 장부에 없는 가린 손님은 '재방문 확인 중'
    assert.match(await cardText(page, "박*준"), /재방문 확인 중 \(네이버 지난 예약\)/);
    // 불러온 뒤 몇 초면 앱이 두 명씩 읽음 → 박*준 9/25 이용완료(10일 전) = 성공 · 최*아 8/1(이벤트 전) = 도전 시작
    await page.clock.runFor(5000);
    await page.waitForFunction(() => window.__ci.length >= 1);
    await page.waitForFunction(() => /이벤트 도전 성공/.test(([...document.querySelectorAll(".res")].find((e) => /박\*준/.test(e.textContent)) || {}).textContent || ""));
    assert.deepStrictEqual(await page.evaluate(() => window.__ci[0]), ["N1", "N2"], "곧 올 손님부터 두 명씩");
    assert.match(await cardText(page, "최*아"), /이벤트 도전 시작/, "지난 이용완료가 이벤트 시작 전");
    // BC: 예전 쓰리아웃(오대석 · 6666)과 이름 첫 · 끝 · 뒷 4자리가 같음 → 빨간 이름 · 쓰리아웃 표시는 보이되 자동 전액 취소는 안 함
    assert.ok(await page.$('.res:has-text("오*석") .nm-bl'), "BC 짐작 — 이름 빨강");
    assert.deepStrictEqual(await page.evaluate(() => window.__cancel), [], "가린 정보 짐작으로는 자동 취소 안 함");
    // 강*율: 카드를 누르면 그 손님 먼저 읽음 · 읽기 전에 입장하면 입장권은 읽은 뒤
    await page.click('.res:has-text("강*율")');
    await page.waitForFunction(() => window.__ci.some((l) => l.includes("N3")));
    assert.match(await page.textContent("#sheet"), /재방문 확인 중/);
    await page.click(".kpick button:not([disabled]) >> nth=0");
    for (const n of "1234") await page.click(`[data-act=midKey][data-n="${n}"]`);
    await page.click("#enter-done");
    assert.ok(await page.evaluate(() => window.__deskTest.holders().find((h) => h.name === "강*율").custWait), "지난 예약을 읽은 뒤 출력");
    assert.strictEqual(await page.evaluate(() => window.__jobs.length), 0, "아직 출력 안 함");
    assert.strictEqual(await page.evaluate(() => window.__deskTest.evLog().people["m:강율5555"]), undefined, "장부도 읽은 뒤에 적음");
    await page.evaluate(() => window.__gate());
    await page.waitForFunction(() => window.__jobs.length === 1);
    const job = await page.evaluate(() => window.__jobs[0].parts.map((p) => p.t || "").join(""));
    assert.match(job, /재방문 이벤트 성공/, "9/30 이용완료 → 5일 만 → 성공 입장권");
    // 장부: 성공 · 전체 번호
    const people = await page.evaluate(() => window.__deskTest.evLog().people);
    const kang = people["m:강율5555"];
    assert.deepStrictEqual([kang.phone, kang.visits.map((v) => v.st)], ["01012345555", ["성공"]]);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
