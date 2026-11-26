/* 현장 POS 고객 데이터베이스 (사장님 11/26 — "네이버 믿을 수 없어 · 현장 포스에 데이터베이스로 활용 · 저장 관리")
   - 데스크가 입장 처리한 네이버 손님을 직접 모음: 이름은 '홍*동' 모양 (홍길동이든 홍지동이든) · 전화 뒷 4자리 · 받은 전체 번호 · 아이디(이메일) 앞 2자리 · 방문 날짜
   - 같은 손님 = 이름 첫 · 끝 글자 + 뒷 4자리, 둘 다 알면 전체 번호 · 아이디 앞 2자리도 같아야 (다르면 다른 손님)
   - 판정은 네이버가 먼저 (읽을 수 있는 동안은 네이버로 마일리지 · 이벤트 · 사은권) · 네이버 지난 예약을 끝내 못 읽었을 때만 우리 기록의 마지막 방문으로
   - 입장 창 '우리 기록' · 운영 설정 → 고객 세부 관리 → 고객 데이터베이스
   체험판(이 브라우저 localStorage)으로 · 지어낸 손님 */
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

test("고객 데이터베이스: 같은 손님 판단 (이름 첫 · 끝 + 뒷 4자리 · 전체 번호 · 아이디 앞 2자리) · 이름은 홍*동 모양 · 같은 예약번호는 한 번", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await page.addInitScript(() => { if (!sessionStorage.getItem("once")) { sessionStorage.setItem("once", "1"); localStorage.clear(); } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    const r = await page.evaluate(() => {
      const T = window.__deskTest, o = {};
      o.mask = ["홍길동", "홍지동", "홍*동", "남궁민수", "한별", "김"].map(T.nmMask);
      const a = T.cdbVisit({ day: "2026-09-01", no: "n1", qty: 2, name: "홍길동", phone: "01012345678" }); // 가려지기 전 (전체 이름 · 번호)
      o.sameMasked = T.cdbVisit({ day: "2026-09-20", no: "n2", qty: 1, name: "홍*동", phone: "***-****-5678", email: "ho****@naver.com" }) === a; // 가려진 뒤 · 같은 손님
      o.again = T.cdbVisit({ day: "2026-09-20", no: "n2", qty: 1, name: "홍*동", phone: "***-****-5678" }); // 같은 예약번호 → 안 적음
      const b = T.cdbVisit({ day: "2026-09-21", no: "n3", qty: 1, name: "홍*동", phone: "***-****-5678", phoneFull: "01099995678" }); // 전체 번호가 다름 → 다른 손님
      o.otherFull = b !== a;
      // 아이디가 a 와 다름 → a 는 아님 · b 는 아이디를 몰라 겹치지 않음 → b 와 같은 손님 (둘 다 알 때만 견줌)
      o.otherMail = T.cdbVisit({ day: "2026-09-22", no: "n4", qty: 1, name: "홍*동", phone: "***-****-5678", email: "zz***@daum.net" });
      o.otherMailNew = o.otherMail !== a && o.otherMail === b;
      o.otherMail2 = T.cdbVisit({ day: "2026-09-24", no: "n6", qty: 1, name: "홍*동", phone: "***-****-5678", email: "kk***@daum.net" }); // 아이디가 a · b 둘 다와 다름 → 새로
      o.otherMail2New = o.otherMail2 !== a && o.otherMail2 !== b;
      o.otherName = T.cdbVisit({ day: "2026-09-23", no: "n5", qty: 1, name: "홍*수", phone: "***-****-5678" }) !== a; // 끝 글자 다름
      // 아무것도 모르는 가린 손님 → 후보(홍*동 5678)가 여럿이면 아이디 · 번호가 맞는 쪽 → 그래도 여럿이면 최근에 온 손님
      o.findMail = T.cdbFind({ name: "홍*동", phone: "***-****-5678", email: "ho**@naver.com" }) === a;
      o.findRecent = T.cdbFind({ name: "홍*동", phone: "***-****-5678" }) === o.otherMail2;
      const D = T.cdb();
      o.rec = D.c[a];
      o.count = Object.values(D.c).filter((x) => x.p4 === "5678" && x.nm.startsWith("홍")).length; // 체험판 견본 손님(오늘 입장)도 들어 있음
      o.saved = JSON.parse(localStorage.getItem("astanakiz-cdb") || "null");
      return o;
    });
    assert.deepStrictEqual(r.mask, ["홍*동", "홍*동", "홍*동", "남**수", "한*", "김"]);
    assert.ok(r.sameMasked, "가려지기 전 홍길동 010-1234-5678 = 가려진 뒤 홍*동 ***-****-5678");
    assert.strictEqual(r.again, "", "같은 예약번호는 한 번만");
    assert.ok(r.otherFull, "전체 번호가 다르면 다른 손님");
    assert.ok(r.otherMailNew, "아이디 앞 2자리가 다르면 다른 손님 · 한쪽이 모르면 견주지 않음");
    assert.ok(r.otherMail2New, "아는 아이디가 모두 다르면 새 손님");
    assert.ok(r.otherName, "이름 끝 글자가 다르면 다른 손님");
    assert.ok(r.findMail, "아이디가 맞는 쪽");
    assert.ok(r.findRecent, "모르면 최근에 온 손님");
    assert.deepStrictEqual(r.rec, { nm: "홍*동", p4: "5678", ph: "01012345678", em: "ho@naver.com", v: [["2026-09-01", "n1", 2], ["2026-09-20", "n2", 1]] }, "이름은 홍*동 · 아이디는 앞 2자리 + 도메인만");
    assert.strictEqual(r.count, 4, "a · b · 새 아이디 · 홍*수");
    await page.waitForTimeout(1000);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("astanakiz-cdb") || "null"));
    assert.ok(saved && saved.v === 1 && Object.values(saved.c).filter((x) => x.p4 === "5678").length === 4, "체험판은 이 브라우저에 저장");
    assert.ok(!JSON.stringify(saved).includes("홍길동"), "전체 이름은 안 남김");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("고객 데이터베이스 → 재방문 이벤트 (네이버 먼저 · 못 읽었을 때 우리 기록) · 입장 창 '우리 기록' · 입장하면 방문 · 전체 번호 · 고객 세부 관리 → 고객 데이터베이스 찾기", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await page.addInitScript((cfg) => {
      if (sessionStorage.getItem("once")) return;
      sessionStorage.setItem("once", "1");
      localStorage.clear();
      localStorage.setItem("astanakiz-visitevent", JSON.stringify(cfg));
      // 데스크가 모은 기록 (장부 · 네이버 지난 예약에는 없음): 은*인 9/20 · 아이디 bl@naver.com
      localStorage.setItem("astanakiz-cdb", JSON.stringify({ v: 1, seq: 3, filled: "2026-10-01", c: {
        c1: { nm: "은*인", p4: "1252", ph: "", em: "bl@naver.com", v: [["2026-08-30", "x1", 1], ["2026-09-20", "x2", 2]] },
        c2: { nm: "도*희", p4: "4321", ph: "", em: "", v: [["2026-09-25", "x3", 1]] },
        c3: { nm: "서*아", p4: "7777", ph: "", em: "", v: [["2026-09-25", "x4", 1]] },
      } }));
    }, EVCFG);
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK); // 체험판 2026-10-05 13:50
    const ids = await page.evaluate(() => {
      const T = window.__deskTest, d = T.today();
      return {
        eun: T.addBooking(d, "16:30", "은*인", "***-****-1252", 1, { prevDone: 2, email: "bl****@naver.com" }),
        other: T.addBooking(d, "16:30", "은*인", "***-****-1252", 1, { prevDone: 1, email: "qq***@gmail.com" }), // 이름 · 뒷번호는 같은데 아이디가 다름
        kim: T.addBooking(d, "16:30", "김*수", "***-****-1252", 1, { prevDone: 3 }),
        // 네이버가 먼저: 네이버 지난 예약을 읽었는데 이벤트 기간 이용완료가 없으면 우리 기록(9/20)이 있어도 네이버대로 (사장님 11/26)
        naver: T.addBooking(d, "17:00", "서*아", "***-****-7777", 1, { prevDone: 2, past: ["2026-08-30"] }),
        // 네이버가 '신규예약'(완료 0)이라 한 손님은 우리 기록을 안 씀
        fresh: T.addBooking(d, "17:00", "도*희", "***-****-4321", 1, { prevDone: 0 }),
      };
    });
    await page.click('.slot[data-s="990"]');
    const txt = await page.$$eval(".res", (L) => L.map((x) => x.textContent.replace(/\s+/g, " ")));
    const eunT = txt.filter((t) => /은\*인/.test(t));
    assert.strictEqual(eunT.filter((t) => /이벤트 도전 성공/.test(t)).length, 1, "우리 기록 9/20 → 15일 만 · 아이디가 맞는 은*인만 " + eunT.join(" | "));
    assert.strictEqual(eunT.filter((t) => /이벤트 도전 시작/.test(t)).length, 1, "아이디가 다른 은*인은 다른 손님");
    assert.match(await cardText(page, "김*수"), /이벤트 도전 시작/, "뒷번호만 같으면 다른 손님");
    assert.deepStrictEqual(await page.evaluate((id) => { const o = window.__deskTest.cdbOf(id); return o && [o.id, o.n, o.last]; }, ids.eun), ["c1", 2, "2026-09-20"]);
    assert.strictEqual(await page.evaluate((id) => window.__deskTest.cdbOf(id), ids.other), null);
    await page.click('.slot[data-s="1020"]');
    const t17 = await page.$$eval(".res", (L) => L.map((x) => x.textContent.replace(/\s+/g, " ")));
    assert.match(t17.find((t) => /서\*아/.test(t)), /이벤트 도전 시작/, "네이버 지난 예약을 읽었으면(이벤트 기간 이용완료 없음) 우리 기록 9/25 가 있어도 네이버대로 " + t17.join(" | "));
    assert.match(t17.find((t) => /도\*희/.test(t)), /이벤트 도전 시작/, "네이버 신규예약은 네이버대로");
    await page.click('.slot[data-s="990"]');
    // 입장 창: 우리 기록 → 가운데 4자리 → 등록 → 방문 · 전체 번호가 장부에
    await page.click(`.res[data-id="${ids.eun}"]`);
    assert.match((await page.textContent("#sheet .cdbrow")).replace(/\s+/g, " "), /방문 2번 · 마지막 9\/20 · 아이디 bl…/);
    await page.click(".kpick button:not([disabled]) >> nth=0");
    for (const n of "5678") await page.click(`[data-act=midKey][data-n="${n}"]`);
    await page.click("#enter-done");
    await page.waitForTimeout(200);
    const c1 = await page.evaluate(() => window.__deskTest.cdb().c.c1);
    assert.deepStrictEqual([c1.ph, c1.v.map((v) => v[0])], ["01056781252", ["2026-08-30", "2026-09-20", "2026-10-05"]]);
    // 처음 온 손님: 우리 기록 없음 → 입장하면 새로
    await page.click(`.res[data-id="${ids.kim}"]`);
    assert.match(await page.textContent("#sheet .cdbrow"), /처음/);
    await page.click(".kpick button:not([disabled]) >> nth=0");
    for (const n of "2468") await page.click(`[data-act=midKey][data-n="${n}"]`);
    await page.click("#enter-done");
    await page.waitForTimeout(1000);
    const D = await page.evaluate(() => JSON.parse(localStorage.getItem("astanakiz-cdb")));
    const kim = Object.values(D.c).find((x) => x.nm === "김*수" && x.p4 === "1252");
    assert.deepStrictEqual([kim.p4, kim.ph, kim.v.length], ["1252", "01024681252", 1], "저장됨");
    // 운영 설정 → 고객 세부 관리 → 고객 데이터베이스: 수 · 찾기
    await page.dblclick("#now"); await page.click('[data-t="cust"]'); await page.click("[data-act=csub][data-s=db]");
    const all = Object.values(D.c), sum = `모은 손님 ${all.length}명 · 방문 ${all.reduce((a, x) => a + x.v.length, 0)}번 · 전체 번호 ${all.filter((x) => x.ph).length}명 · 아이디 ${all.filter((x) => x.em).length}명`;
    assert.ok(all.length > 3, "체험판 견본 손님(오늘 입장)도 모음");
    assert.ok((await page.textContent("#sheet .setcard")).includes(sum), sum);
    await page.fill("#db-q", "1252");
    let list = (await page.textContent("#sheet .bclist")).replace(/\s+/g, " ");
    assert.match(list, /은\*인 · 010-5678-1252 · bl@naver\.com/);
    assert.match(list, /김\*수 · 010-2468-1252/);
    assert.doesNotMatch(list, /도\*희/);
    await page.fill("#db-q", "도희");
    list = (await page.textContent("#sheet .bclist")).replace(/\s+/g, " ");
    assert.match(list, /도\*희 · \*\*\*-\*\*\*\*-4321\s*방문 1번 · 9\/25/, "이름 첫 · 끝 글자로 찾기 · 번호 모르면 뒷 4자리만");
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), "db-q", "찾는 칸에 커서 그대로");
    await page.fill("#db-q", "없는사람");
    assert.match(await page.textContent("#sheet .bclist"), /찾는 손님이 없어요/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
