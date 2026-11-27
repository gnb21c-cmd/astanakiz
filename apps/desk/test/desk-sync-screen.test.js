/* 두 PC 연결 — 화면 쪽 (사장님 11/06 · 11/27): 우편함으로는 운영 설정(양쪽 · 사무실에서 바꾸면 현장에 바로) · 메모장 · 현장 POS 화면
   사무실 PC = 현장 POS 복사 화면 (11/27 — 네이버를 읽지 않고 현장 POS 가 보낸 오늘 예약 · 시간 칸 · 개인정보 · 열쇠 그대로) · 주차는 사무실에 없음
   앱 본체(우편함 · 잠금)는 desk-sync.test.js · 실제 앱 두 대 끝에서 끝까지는 빌드 때 Electron 점검
   여기서는 체험판 두 창: A = 현장 POS · B = 사무실 PC ('사무실 PC 화면 미리 보기' + A 의 화면을 넣음) */
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
async function open(ctx) {
  const page = await ctx.newPage({ viewport: { width: 1024, height: 768 } });
  page.errs = [];
  page.on("pageerror", (e) => page.errs.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(DESK);
  return page;
}
const keyBoard = (page) => page.$$eval("#keys .key[data-k]", (els) => els.map((e) => `${e.dataset.k}:${e.className.replace(/\s*(holding|sel)\b/g, "")}:${e.textContent.replace(/\s+/g, " ").trim()}`));
async function enter(page, id, slot) {
  await page.click(`.slot[data-s="${slot}"]`);
  await page.click(`.res[data-id="${id}"]`);
  for (let i = 0; i < 6 && !(await page.$("#enter-done:not([disabled])")); i++) await page.click(".kpick button:not([disabled]):not(.on) >> nth=0");
  await page.click("#enter-done");
}
const snapOf = (page) => page.evaluate(() => JSON.stringify(window.__deskTest.sync.snap()));
const applyTo = (page, snap, at) => page.evaluate(([s, t]) => { window.__deskTest.sync.apply(JSON.parse(s), window.__deskTest.today() + " " + t); window.__deskTest.setNow(830); }, [snap, at]);

const P = "평일 무제한 / 휴일 1시간 50분 입장권";
const nb = (no, name, phone, qty = 1) => ({ no, time: "14:00", name, phone, qty, status: "확정", doneCount: 1, product: P, qtyText: `4인 입장권 ${qty}`, pay: "결제완료" });
const resNames = (page) => page.$$eval("#res .res", (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));

test("사무실 PC = 현장 POS 복사 화면 (사장님 11/27): 오늘 예약 전부(입장 전 · 가린 손님 · 이름 · 전화) · 시간 칸 숫자 · 개인정보 칩 · 불러온 시각 그대로 · 열쇠판 같음 · 손님 메모는 안 감 · 네이버 일은 안 함", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext();
    const A = await open(ctx);
    await A.evaluate(() => localStorage.clear());
    await A.reload();
    await A.evaluate(() => window.__deskTest.setNow(830));
    // 현장 POS 가 네이버에서 불러온 오늘 예약 (가린 손님 섞임) · 시간 칸 숫자
    await A.evaluate(([L, p]) => { const T = window.__deskTest; T.naverApply(T.today(), { mask: "가림", slots: [{ time: "14:00", product: p, cap: 17, conf: 4, done: 0 }], bookings: L }); }, [[nb("7100001", "사무실확인", "010-7777-0000", 2), nb("7100002", "은*인", "***-****-1252"), nb("7100003", "안온손님", "010-3333-9999")], P]);
    await A.click('.slot[data-s="840"]');
    await A.click('.res:has-text("사무실확인")');
    for (let i = 0; i < 6 && !(await A.$("#enter-done:not([disabled])")); i++) await A.click(".kpick button:not([disabled]):not(.on) >> nth=0");
    await A.click("#enter-done");
    const ent = await A.evaluate(() => { const T = window.__deskTest; const b = T.holders().find((h) => h.no === "7100001"); return { keys: b.keys.slice(), no: b.no }; });
    assert.strictEqual(ent.keys.length, 2, "현장에서 열쇠 2개 입장");
    const k = ent.keys[0];
    await A.click(`.key[data-k='${k}']`);
    await A.fill("#note-m", "손님메모비밀글"); await A.dispatchEvent("#note-m", "change");
    await A.click("#sheet [data-act=close] >> nth=0");
    // 가린 네이버 손님: 입장 때 받은 가운데 4자리 → 전체 번호
    await A.click('.slot[data-s="840"]');
    await A.click('.res:has-text("은*인")');
    await A.click(".kpick button:not([disabled]):not(.on) >> nth=0");
    for (const n of "5678") await A.click(`[data-act=midKey][data-n="${n}"]`);
    await A.click("#enter-done");
    const midKey = await A.evaluate(() => window.__deskTest.holders().find((h) => h.no === "7100002").keys[0]);
    const snap = await snapOf(A);
    assert.ok(!snap.includes("손님메모비밀글"), "손님 메모는 안 보냄 (현장 POS 에만)");
    for (const s of ["사무실확인", "01077770000", "01056781252", "안온손님", "010-3333-9999"]) assert.ok(snap.includes(s), `현장 화면에 '${s}' (입장 전 손님까지 · 이름 · 전화 — 사무실에서도 연락 · 사장님 11/27)`);
    const keysOf = Object.keys(JSON.parse(snap)).sort();
    assert.deepStrictEqual(keysOf, ["at", "b", "cl", "day", "g", "ig", "lr", "mv", "ne", "nm", "nr", "ns", "r", "s", "v", "w", "x"].sort(), "예약 · 시간 칸 숫자 · 개인정보 · 불러온 시각 · 키 현황");
    assert.ok(!/naverBusy|bcBusy|printWaiting/.test(snap), "현장 안에서만 쓰는 '하는 중' 표시는 안 감");

    // 사무실 PC (체험판 미리 보기) — 받은 현장 화면 그대로
    const B = await open(ctx);
    await B.evaluate(() => window.__deskTest.sync.demo(true));
    assert.strictEqual(await B.evaluate(() => window.__deskTest.sync.office()), true);
    await applyTo(B, snap, "13:50:00");
    const rowsA = await A.evaluate(() => window.__deskTest.holders2().map((h) => h.keys.join("+")).sort()), rowsB = await B.evaluate(() => window.__deskTest.holders2().map((h) => h.keys.join("+")).sort());
    assert.deepStrictEqual(rowsB, rowsA, "열쇠 든 손님 같음");
    assert.deepStrictEqual(await keyBoard(B), await keyBoard(A), "열쇠판 이름까지 같음");
    // 시간 칸 · 예약 카드: 입장 전 손님까지 현장 그대로
    await A.click('.slot[data-s="840"]'); await B.click('.slot[data-s="840"]');
    const memoA = await resNames(A);
    assert.ok(memoA.some((t) => t.includes("사무실확인 메모")) && !(await resNames(B)).some((t) => t.includes(" 메모")), "손님 메모 표시는 현장 POS 에만");
    assert.deepStrictEqual(await resNames(B), memoA.map((t) => t.replace(" 메모", "")), "14:00 예약 카드 그대로 (메모 표시만 빼고)");
    assert.ok((await resNames(B)).some((t) => t.includes("안온손님")), "입장 전 손님도 사무실에 (예전엔 사무실 네이버에서 직접 읽었음)");
    assert.strictEqual(await B.textContent('.slot[data-s="840"]'), await A.textContent('.slot[data-s="840"]'), "시간 칸 숫자 그대로");
    assert.strictEqual((await B.textContent("#maskchip")).trim(), "개인정보가림·인증", "개인정보 칩도 현장 그대로");
    assert.match(await B.textContent("#refresh-at"), /현장 POS 13:50 불러옴/, "불러온 시각은 현장 POS 것");
    // 사무실 열쇠 창: 가린 손님도 전체 번호 (바로 전화)
    await B.click(`.key[data-k='${midKey}']`);
    assert.match((await B.textContent("#sheet")).replace(/\s+/g, " "), /010-5678-1252/, "사무실 열쇠 창에 전체 번호");
    await B.click("#sheet [data-act=close] >> nth=0");
    assert.strictEqual(await B.getAttribute("#syncchip", "aria-label"), "사무실 미리 보기 누르면 끝"); // 11/10: 두 줄 · 오른쪽 묶음
    // 사무실 PC 는 네이버 일을 안 함: [새로고침] · 다른 날짜 · 개인정보 칩 → 안내만
    await B.click("[data-act=refresh]");
    assert.match(await B.textContent("#toast"), /사무실 PC 는 현장 POS 화면을 받아 보여요 \(13:50 기준\) — 네이버는 현장 POS 가 불러와요/);
    const day0 = await B.textContent("#date");
    await B.click('[data-act=day][data-d="1"]');
    assert.match(await B.textContent("#toast"), /사무실 PC 는 오늘만 보여요/);
    assert.strictEqual(await B.textContent("#date"), day0, "날짜 그대로");
    await B.click("#maskchip");
    assert.match(await B.textContent("#toast"), /인증은 현장 POS 에서/);
    // 현장에서 반납 → 사무실 열쇠판도 · 현장에서 새 예약이 들어옴 → 사무실도
    await A.evaluate((key) => { const T = window.__deskTest, h = T.holders().find((x) => x.keys.includes(key)); T.returnKeys(h.id, [key]); }, k);
    await A.evaluate(([L, p]) => { const T = window.__deskTest; T.naverApply(T.today(), { mask: "보임", slots: [{ time: "14:00", product: p, cap: 17, conf: 5, done: 0 }], bookings: L }); }, [[nb("7100001", "사무실확인", "010-7777-0000", 2), nb("7100002", "은지인", "010-5678-1252"), nb("7100003", "안온손님", "010-3333-9999"), nb("7100004", "새손님", "010-4444-1212")], P]);
    await applyTo(B, await snapOf(A), "13:51:00");
    assert.ok((await keyBoard(B)).find((x) => x.startsWith(k + ":")).includes("free"), "반납한 열쇠는 빈 열쇠");
    assert.deepStrictEqual(await B.evaluate(() => window.__deskTest.holders2().map((h) => h.keys.join("+")).sort()), await A.evaluate(() => window.__deskTest.holders2().map((h) => h.keys.join("+")).sort()));
    await A.click('.slot[data-s="840"]'); await B.click('.slot[data-s="840"]');
    assert.deepStrictEqual(await resNames(B), (await resNames(A)).map((t) => t.replace(" 메모", "")));
    assert.ok((await resNames(B)).some((t) => t.includes("새손님")), "현장 POS 가 새로 불러온 예약도");
    assert.strictEqual((await B.textContent("#maskchip")).trim(), "개인정보보임");
    assert.deepStrictEqual(A.errs.concat(B.errs), []);
  } finally {
    await browser.close();
  }
});

test("사무실 PC 버튼: 근무자 일 · 네이버 일 · 출력은 막힘 · 설정 · 메모장 · 수량 관찰 기록 · 톡톡 자동 보내기 켜고 끄기는 됨 · 주차 · 톡톡 없음", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext();
    const B = await open(ctx);
    await B.evaluate(() => localStorage.clear());
    await B.reload();
    await B.evaluate(() => window.__deskTest.sync.demo(true));
    const k = await B.evaluate(() => window.__deskTest.holders()[0].keys[0]);
    await B.click(`.key[data-k='${k}']`);
    assert.strictEqual(await B.$("#note-m"), null, "사무실 PC 에는 손님 메모 칸 없음");
    const blocked = await B.$$eval("#sheet [data-act]:not([disabled])", (e) => e.map((x) => x.dataset.act).find((a) => /^(payOver|svcPick|plusSlot|endSlot|reprint|returnKey|returnAll)$/.test(a)));
    assert.ok(blocked, "막을 버튼이 있음");
    const before = await B.evaluate(() => JSON.stringify(window.__deskTest.holders2()));
    await B.click(`#sheet [data-act=${blocked}]:not([disabled]) >> nth=0`);
    assert.match(await B.textContent("#toast"), /현장 POS 에서/);
    assert.strictEqual(await B.evaluate(() => JSON.stringify(window.__deskTest.holders2())), before, "아무것도 안 바뀜");
    await B.click("#sheet [data-act=close] >> nth=0");
    for (const a of ["capNow", "capTry", "stNow", "stDry"]) {
      assert.strictEqual(await B.evaluate((x) => window.__deskTest.sync.gate(x), a), false, a);
      assert.match(await B.textContent("#toast"), /현장 POS 가 넣어요 — 사무실은 자동 수량조절 켜고 끄기/);
    }
    for (const a of ["tplTest", "tplSampleAll", "testPrint"]) { assert.strictEqual(await B.evaluate((x) => window.__deskTest.sync.gate(x), a), false, a); assert.match(await B.textContent("#toast"), /출력은 현장 POS 에서/); }
    for (const a of ["car", "discount", "talkOpen", "posGo", "bcSet", "walkDone", "svSendNow", "hvBackfill", "naverShow", "naverHome", "naverDump"]) assert.strictEqual(await B.evaluate((x) => window.__deskTest.sync.gate(x), a), false, a);
    for (const a of ["refresh", "day", "slot", "openRes", "memoSend", "memoAdd", "settings", "tplSave", "capCell", "stToggle", "cwToggle", "rtAutoToggle"]) assert.strictEqual(await B.evaluate((x) => window.__deskTest.sync.gate(x), a), true, a);
    await B.click("[data-act=refresh]");
    assert.match(await B.textContent("#toast"), /현장 POS 화면을 받아 보여요/, "사무실 PC 는 네이버를 읽지 않음 (11/27)");
    await B.click('[data-act=day][data-d="1"]');
    assert.match(await B.textContent("#toast"), /오늘만/, "다른 날짜는 현장 POS 에서");
    for (const sel of [".park", "#talk-kids", "#bulk-btn", "[data-act=posGo]"]) assert.strictEqual(await B.isVisible(sel), false, `${sel} 안 보임`);
    // 맨 위 [오늘 수량조절] (자동 수량조절 켜고 끄기) 는 사무실에서도
    const was = await B.isChecked("#capforce-on");
    await B.click("#capforce");
    assert.strictEqual(await B.isChecked("#capforce-on"), !was);
    // 미리 보기 끝
    await B.click("#syncchip");
    assert.strictEqual(await B.evaluate(() => window.__deskTest.sync.office()), false);
    assert.strictEqual(await B.isVisible(".park"), true, "현장 POS 로 돌아오면 주차");
    assert.deepStrictEqual(B.errs, []);
  } finally {
    await browser.close();
  }
});

test("반대편 PC 에서 바꾼 설정이 화면에 바로: 프린트물 설정 · 성수기 기간 · 수량 자동조절 · 수량 관찰 기록 · 톡톡 자동 보내기 · 글을 쓰는 중이면 다 쓴 뒤에 다시 그림", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext();
    const A = await open(ctx);
    await A.evaluate(() => localStorage.clear());
    await A.reload();
    await A.dblclick("#now");
    await A.click('[data-t="prints"]');
    await A.click("#tpl-text");
    await A.keyboard.type("쓰는중");
    const typed = await A.inputValue("#tpl-text");
    await A.evaluate(() => window.__deskTest.sync.settings(["printSet", "peaks", "capAuto", "capWatch", "revTalkAuto"], { printSet: { apply: "event", bcOn: false, names: { evw: "(추)추석양식" }, frags: [] }, peaks: [], capAuto: Object.assign({}, window.__deskTest.RULES.capAuto, { on: false, target: 37 }), capWatch: { on: false }, revTalkAuto: { on: true, at: "15:30" } }));
    assert.deepStrictEqual(await A.evaluate(() => [window.__deskTest.CW.on, window.__deskTest.RT.auto]), [false, { on: true, at: "15:30" }], "수량 관찰 기록 끔 · 톡톡 자동 보내기 켬 15:30 (사무실에서 바꿈 · 11/27)");
    assert.match(await A.textContent("#toast"), /사무실 PC에서 바꾼 설정을 받았어요/);
    assert.deepStrictEqual(await A.evaluate(() => [window.__deskTest.RULES.capAuto.on, window.__deskTest.RULES.capAuto.target]), [false, 37], "자동 수량조절 끔 · 목표");
    assert.deepStrictEqual(await A.evaluate(() => window.__deskTest.RULES.peaks), []);
    assert.strictEqual(await A.inputValue("#tpl-text"), typed, "쓰는 중인 글은 그대로");
    await A.click("#sheet h3");
    await A.waitForFunction(() => document.getElementById("tpl-apply") && document.getElementById("tpl-apply").value === "event");
    assert.strictEqual(await A.isChecked("#tpl-bc"), false);
    assert.ok((await A.$$eval("#sheet .tplrow", (e) => e.map((x) => x.textContent))).some((t) => t.includes("(추)추석양식")));
    await A.click('[data-t="sync"]');
    assert.match(await A.textContent("#setbody"), /체험판 — 설치한 앱에서 이어져요/);
    assert.match(await A.textContent('[data-t="sync"]'), /두 PC 연결\s*체험판/);
    assert.deepStrictEqual(A.errs, []);
  } finally {
    await browser.close();
  }
});

/* 맨 위 표시가 까닭을 그대로 (사장님 11/13 — 사무실 PC 에 '키 현황 기다림'만 떠서 무엇이 빠졌는지 몰랐음)
   보고 열쇠가 없거나 연결 코드가 없으면 연결이 시작도 안 됨 · 보고 클라우드 규칙(deskSync)이 없으면 403 · 현장 POS 글이 한 번도 없으면 현장 쪽 */
test("두 PC 연결 표시: 보고 열쇠 없음 · 연결 코드 없음 · 규칙 거절(403) · 현장 POS 소식 없음 · 현장 POS 도 까닭 표시", async () => {
  const browser = await launch();
  try {
    const chip = async (role, info, st, waitMs = 0) => {
      const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
      const page = await ctx.newPage();
      await page.clock.install({ time: new Date("2026-11-13T15:12:00") });
      await page.addInitScript(([role, info, st]) => {
        const subs = {};
        window.desk = {
          naver: { load: async (day) => { window.__nload = (window.__nload || 0) + 1; return { ok: true, day, slots: [], bookings: [] }; }, complete: async () => ({ ok: true }) },
          state: { load: () => null, save: () => {} },
          config: { get: async () => ({ build: "2.22" }), set: async () => ({ ok: true }) },
          sync: { role: () => role, get: async () => Object.assign({ role, runRole: role, build: "2.22", status: st }, info), set: async () => ({ ok: true }), relaunch: () => {}, snap: () => {}, on: (ch, fn) => { subs[ch] = fn; } },
        };
        window.__syncSubs = subs;
      }, [role, info, st]);
      const errs = [];
      page.on("pageerror", (e) => errs.push(e.message));
      await page.goto(DESK);
      await page.clock.runFor(1500 + waitMs);
      const r = { label: await page.getAttribute("#syncchip", "aria-label"), hidden: await page.isHidden("#syncchip"), loads: await page.evaluate(() => window.__nload || 0), errs };
      await ctx.close();
      return r;
    };
    const ready = { ready: true, why: "", getWhy: "", putWhy: "", peer: { build: "", at: "", seen: 0, active: false }, lastGet: 1, lastPut: 1 };
    assert.strictEqual((await chip("office", { hasKey: false }, { ready: false })).label, "보고 열쇠 넣어 주세요");
    assert.strictEqual((await chip("office", { hasKey: true }, { ready: false })).label, "연결 코드 넣어 주세요");
    assert.strictEqual((await chip("office", { hasKey: true }, Object.assign({}, ready, { getWhy: "열쇠나 모양이 틀림 (403) — 보고 시스템 규칙에 deskSync 가 있는지" }))).label, "보고 클라우드 규칙 확인");
    const fresh = await chip("office", { hasKey: true }, ready);
    assert.deepStrictEqual([fresh.label, fresh.loads], ["사무실 PC 현장 화면 기다림", 0], "켠 바로 뒤는 기다림 · 사무실 PC 는 네이버를 안 읽음 (11/27)");
    const silent = await chip("office", { hasKey: true }, ready, 31000);
    assert.deepStrictEqual([silent.label, silent.errs], ["현장 POS 소식 없음", []], "30초가 지나도 현장 POS 글이 없으면 현장 쪽");
    // 현장 POS: 예전엔 문제가 있어도 표시가 숨어 있었음
    assert.strictEqual((await chip("pos", { hasKey: false }, { ready: false })).label, "보고 열쇠 넣어 주세요");
    assert.strictEqual((await chip("pos", { hasKey: true }, { ready: false })).label, "연결 코드 만들어 주세요");
    const pos = await chip("pos", { hasKey: true }, ready);
    assert.strictEqual(pos.hidden, true, "준비됐고 사무실이 꺼져 있으면 숨김 (그대로)");
    assert.ok(pos.loads >= 1, "현장 POS 는 네이버를 읽음");
  } finally {
    await browser.close();
  }
});
