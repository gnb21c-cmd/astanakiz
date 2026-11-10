/* 대관 (사장님 11/10)
   - 대관이 있는 날: 맨 위 [대관] → 대관 주체(단체 이름) · 입금일 → [확인] → 보고 앱 키즈 실시간 '키즈대관' 칸
     (boards/{보고 열쇠}/deskStats/rental-{오늘} · astanakiz-rental · 보고 시스템 docs/KIDS_RENTAL.md 모양 그대로)
   - 적거나 고치거나 지울 때마다 통째로 덮어씀 (모두 지우면 빈 목록) · 못 보내면 10분 뒤 · 다시 켜도 그대로 · 사무실 PC 는 보기만
   - 맨 위 '두 PC 연결' 표시는 오른쪽 묶음으로 (가운데 커튼 손잡이와 겹쳐서) — 붐빌 때는 오른쪽 묶음을 조금씩 줄여 손잡이에 안 닿게 */
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

/** 맨 위 막대에서 커튼 손잡이와 겹치는 것 (6px 안까지) */
const topHits = (page) => page.evaluate(() => {
  const tab = document.getElementById("curtain-tab").getBoundingClientRect();
  const items = [...document.querySelectorAll(".top > *, .top .rgrp > *, .top .tgrp > *")].filter((e) => !e.hidden && e.offsetParent && !/^(rgrp|tgrp|spacer)$/.test(e.className));
  return items.filter((e) => { const r = e.getBoundingClientRect(); return r.right > tab.left - 6 && r.left < tab.right + 6; }).map((e) => e.id || e.dataset.act || e.className);
});
const topCls = (page) => page.evaluate(() => document.querySelector(".top").className);

test("맨 위: 두 PC 연결 표시 · [대관]은 오른쪽 묶음 — 커튼 손잡이와 안 겹침 (붐비면 오른쪽 묶음을 줄임)", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.clock.install({ time: new Date("2026-11-10T10:00:00") });
    await page.addInitScript(() => { window.__today = "2026-11-10"; });
    await page.goto(DESK);
    const order = await page.evaluate(() => [...document.querySelectorAll(".top .rgrp > *")].map((e) => e.id || e.dataset.act));
    assert.deepStrictEqual(order, ["syncchip", "rent-btn", "manual", "sold", "now"], "오른쪽 묶음: 두 PC 연결 · 대관 · 근무자 메뉴얼 · 총 판매수 · 시계");
    assert.deepStrictEqual([await topHits(page), await topCls(page)], [[], "top"], "평소: 줄이지 않음");
    // 사무실 미리 보기 (두 PC 연결 표시가 보임) + 대관 2건 + 다른 날 판매수 (가장 붐빔)
    await page.evaluate(() => window.__deskTest.sync.demo(true));
    assert.strictEqual(await page.getAttribute("#syncchip", "aria-label"), "사무실 미리 보기 누르면 끝");
    assert.deepStrictEqual(await topHits(page), [], "두 PC 연결 표시가 가운데 손잡이를 안 가림");
    await page.evaluate(() => window.__deskTest.sync.demo(false));
    for (const [nm, d] of [["햇살어린이집", "2026-10-16"], ["푸른유치원", "2026-11-03"]]) {
      await page.click("#rent-btn");
      await page.fill("#rent-name", nm);
      await page.fill("#rent-paid", d);
      await page.click("#sheet [data-act=rentSave]");
      await page.click("#sheet [data-act=close]");
    }
    await page.evaluate(() => window.__deskTest.sync.demo(true));
    await page.click("[data-act=day][data-d='-1']");
    assert.match(await page.textContent("#sold"), /^11\/9 총 판매수/);
    assert.deepStrictEqual(await topHits(page), [], "가장 붐벼도 안 겹침");
    assert.match(await topCls(page), /tight1/, "근무자 메뉴얼을 두 줄로 줄임");
    // 창이 작거나 커도 (손잡이는 판 밖이라 크기 그대로)
    for (const vp of [{ width: 1024, height: 700 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
      await page.setViewportSize(vp);
      await page.clock.runFor(200); // 창 크기 바뀜 → 판 크기 · 자리 맞춤
      await page.waitForFunction((w) => innerWidth === w && Math.abs(Number((document.getElementById("stage").style.transform.match(/scale\(([\d.]+)\)/) || [])[1]) - Math.min(innerWidth / 1024, innerHeight / 768)) < 0.001, vp.width);
      assert.deepStrictEqual(await topHits(page), [], JSON.stringify(vp));
    }
    // 오늘로 돌아오고 미리 보기 끝 → 다시 넓은 모양
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.clock.runFor(200);
    await page.click("[data-act=day][data-d='1']");
    await page.evaluate(() => window.__deskTest.sync.demo(false));
    assert.strictEqual(await topCls(page), "top");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("대관 창: 단체 이름 · 입금일 → 확인 (검사 · Enter · 고치기 · 지우기) · 맨 위 건수 · 보낼 글은 이름 · 입금일만", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.clock.install({ time: new Date("2026-11-10T10:00:00") });
    await page.addInitScript(() => { window.__today = "2026-11-10"; });
    await page.goto(DESK);
    assert.strictEqual((await page.textContent("#rent-btn")).trim(), "대관");
    await page.click("#rent-btn");
    assert.match(await page.textContent("#sheet-title"), /대관 — 오늘 26\.11\.10/);
    assert.match(await page.textContent("#sheet .rentlist"), /오늘 적은 대관이 없어요/);
    await page.clock.runFor(100);
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), "rent-name", "단체 이름 칸에 바로 커서");
    assert.deepStrictEqual(await page.evaluate(() => [document.getElementById("rent-paid").max, document.getElementById("rent-paid").type]), ["2026-11-10", "date"]);
    const save = async () => { await page.click("#sheet [data-act=rentSave]"); return (await page.textContent("#toast")).trim(); };
    assert.match(await save(), /대관 주체\(단체 이름\)를 적어 주세요/);
    await page.fill("#rent-name", "010-1234-5678");
    assert.match(await save(), /전화번호는 적지 않아요/);
    await page.fill("#rent-name", "  햇살   어린이집 ");
    assert.match(await save(), /입금일을 골라 주세요/);
    await page.fill("#rent-paid", "2026-11-11");
    assert.match(await save(), /입금일이 오늘보다 뒤예요/);
    await page.fill("#rent-paid", "2025-11-01");
    assert.match(await save(), /1년 안/);
    await page.fill("#rent-paid", "2026-10-16");
    assert.match(await save(), /대관 적음: 햇살 어린이집 \(입금 10\/16\) — 체험판은 저장만/);
    assert.strictEqual(await page.inputValue("#rent-name"), "", "적은 뒤 칸을 비움");
    // Enter = 확인
    await page.fill("#rent-name", "푸른유치원");
    await page.fill("#rent-paid", "2026-11-03");
    await page.press("#rent-name", "Enter");
    const rows = () => page.$$eval("#sheet .rrow", (e) => e.map((x) => x.innerText.replace(/\s+/g, " ").trim()));
    assert.deepStrictEqual(await rows(), ["햇살 어린이집 입금 10/16 고치기 지우기", "푸른유치원 입금 11/3 고치기 지우기"]);
    assert.deepStrictEqual([(await page.textContent("#rent-btn")).trim(), await page.getAttribute("#rent-btn", "aria-label")], ["대관2", "대관 오늘 2건"]);
    // 같은 것을 또 → 막음
    await page.fill("#rent-name", "푸른유치원");
    await page.fill("#rent-paid", "2026-11-03");
    assert.match(await save(), /이미 적혀 있어요/);
    await page.fill("#rent-name", "");
    // 고치기: 칸에 그대로 → 해가 다른 입금일은 '25/12/20'
    await page.click("#sheet .rrow:nth-child(1) [data-act=rentEdit]");
    assert.deepStrictEqual([await page.inputValue("#rent-name"), await page.inputValue("#rent-paid"), (await page.textContent("#sheet [data-act=rentSave]")).trim()], ["햇살 어린이집", "2026-10-16", "고친 대로 확인"]);
    await page.fill("#rent-paid", "2025-12-20");
    await save();
    assert.deepStrictEqual(await rows(), ["햇살 어린이집 입금 25/12/20 고치기 지우기", "푸른유치원 입금 11/3 고치기 지우기"]);
    // 지우기 (확인 창)
    page.once("dialog", (d) => { assert.match(d.message(), /푸른유치원 \(입금 11\/3\) 대관 기록을 지울까요\?\n보고 앱에서도 빠져요/); d.accept(); });
    await page.click("#sheet .rrow:nth-child(2) [data-act=rentDel]");
    assert.strictEqual((await page.textContent("#rent-btn")).trim(), "대관1");
    const p = await page.evaluate(() => window.__deskTest.rent.payload());
    assert.deepStrictEqual({ type: p.type, v: p.v, day: p.day, list: p.list }, { type: "astanakiz-rental", v: 1, day: "2026-11-10", list: [{ name: "햇살 어린이집", paidOn: "2025-12-20" }] });
    assert.match(await page.textContent("#rent-st"), /체험판 — 저장만 해요/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

/** 설치한 앱 흉내: 보고 앱으로 보낸 글을 남김 · 설정 · 오늘 저장 파일은 브라우저 저장소에 (다시 켜도 그대로) */
const appInit = (key) => {
  window.__sent = JSON.parse(localStorage.getItem("test-sent") || "[]");
  window.__fail = localStorage.getItem("test-fail") === "1";
  const cfg = Object.assign({ build: "2.22", hasSurveyKey: key, surveyKeyTail: key ? "abcd" : "" }, JSON.parse(localStorage.getItem("test-cfg") || "{}"));
  window.desk = {
    naver: { load: async (day) => ({ ok: true, day, slots: [], bookings: [] }), complete: async () => ({ ok: true }) },
    state: { load: (day) => localStorage.getItem("test-state-" + day), save: (day, json) => localStorage.setItem("test-state-" + day, json) },
    config: { get: async () => cfg, set: async (patch) => { Object.assign(cfg, patch); localStorage.setItem("test-cfg", JSON.stringify(cfg)); return { ok: true }; } },
    rental: { send: async (job) => { window.__sent.push(job); localStorage.setItem("test-sent", JSON.stringify(window.__sent)); return window.__fail ? { ok: false, code: 0, why: "인터넷 오류" } : { ok: true, code: 200 }; } },
  };
};

/** 껐다 켜기: 브라우저 저장소(앱의 오늘 저장 파일 · 설정 흉내)를 그대로 옮겨 새 창으로 열기 · 시계는 이어서
    (file:// 저장소는 새로고침 바로 뒤 가끔 비어 보임 — 시험 브라우저 문제라 직접 옮김) */
async function reopen(browser, page, key, errs, extra) {
  const keep = Object.assign(JSON.parse(await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]))))), extra || {});
  const t = await page.evaluate(() => Date.now());
  await page.context().close();
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(e.message));
  await p.clock.install({ time: t });
  await p.addInitScript((s) => { for (const [k, v] of Object.entries(JSON.parse(s))) localStorage.setItem(k, v); }, JSON.stringify(keep));
  await p.addInitScript(appInit, key);
  await p.goto(DESK);
  await p.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 15000 });
  return p;
}

test("대관(앱): 적으면 바로 보고 앱으로 (단체 이름 · 입금일만) · 실패하면 10분 뒤 · 다시 켜도 그대로(다시 안 보냄) · 모두 지우면 빈 목록 · 대관이 없는 날은 안 보냄", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    let page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.clock.install({ time: new Date("2026-11-10T09:40:00") });
    await page.addInitScript(appInit, true);
    await page.goto(DESK);
    await page.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 15000 });
    const sent = () => page.evaluate(() => window.__sent);
    await page.clock.runFor(5000);
    assert.deepStrictEqual(await sent(), [], "대관이 없는 날은 안 보냄");
    const add = async (nm, d) => { await page.fill("#rent-name", nm); await page.fill("#rent-paid", d); await page.click("#sheet [data-act=rentSave]"); };
    await page.click("#rent-btn");
    assert.match(await page.textContent("#rent-st"), /적으면 바로 보고 앱으로 보내요/);
    await add("햇살어린이집", "2026-10-16");
    await page.waitForFunction(() => window.__sent.length === 1);
    const j1 = (await sent())[0];
    assert.match(j1.at, /^2026-11-10 09:4\d$/);
    const p1 = JSON.parse(j1.json);
    assert.deepStrictEqual({ type: p1.type, v: p1.v, day: p1.day, list: p1.list }, { type: "astanakiz-rental", v: 1, day: "2026-11-10", list: [{ name: "햇살어린이집", paidOn: "2026-10-16" }] });
    assert.match(p1.sentAt, /^2026-11-10 09:4\d$/);
    assert.match(await page.textContent("#toast"), /대관 1건을 보고 앱으로 보냈어요/);
    assert.match(await page.textContent("#rent-st"), /보고 앱으로 보냄 09:4\d · 오늘 1건/);
    await page.clock.runFor(5000);
    assert.strictEqual((await sent()).length, 1, "바뀐 게 없으면 다시 안 보냄");
    // 실패 → 10분 뒤 다시
    await page.evaluate(() => { window.__fail = true; });
    await add("푸른유치원", "2026-11-03");
    await page.waitForFunction(() => window.__sent.length === 2);
    assert.match(await page.textContent("#toast"), /대관 기록은 저장했어요 — 보고 앱으로는 못 보냈어요: 인터넷 오류 \(10분 뒤 다시\)/);
    assert.match(await page.textContent("#rent-st"), /못 보냄 09:4\d — 인터넷 오류 · 09:5\d에 다시/);
    assert.strictEqual(await page.evaluate(() => document.getElementById("rent-st").classList.contains("bad")), true);
    await page.evaluate(() => { window.__fail = false; });
    await page.clock.runFor(5 * 60000);
    assert.strictEqual((await sent()).length, 2, "10분이 안 됐으면 기다림");
    await page.clock.runFor(6 * 60000);
    await page.waitForFunction(() => window.__sent.length === 3);
    assert.deepStrictEqual(JSON.parse((await sent())[2].json).list.map((x) => x.name), ["햇살어린이집", "푸른유치원"]);
    // 다시 켜도: 오늘 저장 파일에서 되살림 · 이미 보낸 것이라 다시 안 보냄
    page = await reopen(browser, page, true, errs);
    assert.strictEqual((await page.textContent("#rent-btn")).trim(), "대관2");
    await page.clock.runFor(5000);
    assert.strictEqual((await sent()).length, 3, "다시 켜도 같은 것을 또 보내지 않음");
    // 모두 지우면 빈 목록으로 덮어씀 (보고 앱 0건)
    page.on("dialog", (d) => d.accept());
    await page.click("#rent-btn");
    for (let i = 0; i < 2; i++) await page.click("#sheet .rrow:nth-child(1) [data-act=rentDel]");
    await page.waitForFunction(() => window.__sent.length >= 4 && JSON.parse(window.__sent[window.__sent.length - 1].json).list.length === 0);
    assert.match(await page.textContent("#toast"), /대관 기록을 지운 것을 보고 앱에 알렸어요 \(오늘 0건\)/);
    assert.ok((await sent()).every((j) => !/010|01\d-?\d{3,4}/.test(j.json)), "전화번호 없음");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("대관(앱): 보고 열쇠가 없으면 저장만 · 열쇠를 넣으면 그때 보냄", async () => {
  const browser = await launch();
  try {
    let page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.clock.install({ time: new Date("2026-11-10T09:40:00") });
    await page.addInitScript(appInit, false);
    await page.goto(DESK);
    await page.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 15000 });
    await page.click("#rent-btn");
    assert.match(await page.textContent("#rent-st"), /보고 열쇠가 없어 보고 앱으로 못 보내요/);
    await page.fill("#rent-name", "햇살어린이집");
    await page.fill("#rent-paid", "2026-10-16");
    await page.click("#sheet [data-act=rentSave]");
    await page.clock.runFor(5000);
    assert.deepStrictEqual(await page.evaluate(() => window.__sent), []);
    assert.strictEqual((await page.textContent("#rent-btn")).trim(), "대관1", "저장은 됨");
    // 보고 열쇠를 넣음 (운영 설정 → 기타) → 1초 안에 보냄
    page = await reopen(browser, page, false, errs, { "test-cfg": JSON.stringify({ hasSurveyKey: true, surveyKeyTail: "abcd" }) });
    await page.clock.runFor(3000);
    await page.waitForFunction(() => window.__sent.length === 1);
    assert.deepStrictEqual(JSON.parse((await page.evaluate(() => window.__sent))[0].json).list, [{ name: "햇살어린이집", paidOn: "2026-10-16" }]);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("대관 · 두 PC 연결: 현장 POS 의 대관이 키 현황과 함께 사무실로 · 사무실은 보기만 (적기 · 고치기 · 지우기 막힘)", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    const open = async () => { const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); await p.clock.install({ time: new Date("2026-11-10T10:00:00") }); await p.addInitScript(() => { window.__today = "2026-11-10"; }); await p.goto(DESK); return p; };
    const A = await open(), B = await open();
    await A.click("#rent-btn");
    await A.fill("#rent-name", "햇살어린이집");
    await A.fill("#rent-paid", "2026-10-16");
    await A.click("#sheet [data-act=rentSave]");
    const snap = await A.evaluate(() => JSON.stringify(window.__deskTest.sync.snap()));
    assert.deepStrictEqual(JSON.parse(snap).r.map((x) => [x.name, x.paidOn]), [["햇살어린이집", "2026-10-16"]]);
    await B.evaluate(() => window.__deskTest.sync.demo(true));
    await B.evaluate((s) => window.__deskTest.sync.apply(JSON.parse(s), window.__deskTest.today() + " 10:00:05"), snap);
    assert.strictEqual((await B.textContent("#rent-btn")).trim(), "대관1");
    await B.click("#rent-btn");
    assert.match(await B.textContent("#rent-st"), /사무실 PC — 대관은 현장 POS 에서 적어요 \(여기는 보기만\)/);
    assert.strictEqual(await B.$("#rent-name"), null, "적는 칸 없음");
    assert.strictEqual(await B.$("#sheet [data-act=rentDel]"), null);
    for (const a of ["rentSave", "rentEdit", "rentDel", "rentNew"]) assert.strictEqual(await B.evaluate((x) => window.__deskTest.sync.gate(x), a), false, a);
    assert.strictEqual(await B.evaluate(() => window.__deskTest.sync.gate("rentOpen")), true);
    // 현장에서 지우면 사무실도 0건
    await A.evaluate(() => { const T = window.__deskTest; T.rent.list().splice(0); });
    await B.evaluate((s) => window.__deskTest.sync.apply(JSON.parse(s), window.__deskTest.today() + " 10:00:09"), await A.evaluate(() => JSON.stringify(window.__deskTest.sync.snap())));
    assert.strictEqual((await B.textContent("#rent-btn")).trim(), "대관");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
