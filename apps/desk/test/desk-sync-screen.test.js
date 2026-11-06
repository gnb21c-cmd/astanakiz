/* 두 PC 연결 — 화면 쪽 (사장님 11/06): 현장 POS 화면 → 사무실 PC 화면 · 사무실 버튼 · 현장 POS 가 명령을 대신 함 · 반대편 설정 받기
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

test("사무실 PC 화면: 현장 화면 그대로 (열쇠판 · 예약 · 판매 수량) · 근무자 일은 막힘 · 메모장 · 설정은 됨 · 손님 메모는 안 감", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext();
    const A = await open(ctx);
    await A.evaluate(() => localStorage.clear());
    await A.reload();
    // 현장: 예약 하나 더 · 손님 메모
    await A.evaluate(() => { const T = window.__deskTest; T.addBooking(T.today(), "14:00", "사무실확인", "01077770000", 2, { prevDone: 2 }); T.setNow(830); });
    const k = await A.evaluate(() => window.__deskTest.holders()[0].keys[0]);
    await A.click(`.key[data-k='${k}']`);
    assert.ok(await A.$("#note-m"), "현장 열쇠 창에는 손님 메모 칸");
    await A.fill("#note-m", "손님메모비밀글"); await A.dispatchEvent("#note-m", "change");
    assert.ok(JSON.stringify(await A.evaluate(() => window.__deskTest.notes())).includes("손님메모비밀글"), "현장에는 메모가 남음");
    await A.click("#sheet [data-act=close] >> nth=0");
    const snap = await A.evaluate(() => JSON.stringify(window.__deskTest.sync.snap()));
    assert.ok(!snap.includes("손님메모비밀글"), "손님 메모는 사무실로 안 감");
    assert.ok(snap.includes("사무실확인"));

    const B = await open(ctx);
    await B.evaluate(() => window.__deskTest.sync.demo(true));
    assert.strictEqual(await B.evaluate(() => window.__deskTest.sync.office()), true);
    await B.evaluate((s) => { window.__deskTest.sync.apply(JSON.parse(s), window.__deskTest.today() + " 13:50:00"); window.__deskTest.setNow(830); }, snap);
    // 같은 화면
    assert.deepStrictEqual(await keyBoard(B), await keyBoard(A), "열쇠판이 같음");
    assert.deepStrictEqual(await B.evaluate(() => window.__deskTest.holders2()), await A.evaluate(() => window.__deskTest.holders2()));
    for (const p of [A, B]) await p.click('.slot[data-s="840"]');
    const names = (p) => p.$$eval(".res .name", (e) => e.map((x) => x.textContent.replace(/\s+/g, " ").trim()));
    assert.deepStrictEqual(await names(B), await names(A), "14:00 예약 목록이 같음");
    assert.ok((await names(B)).some((n) => n.includes("사무실확인")));
    assert.strictEqual((await B.textContent("#syncchip")).trim(), "사무실 PC 미리 보기 · 누르면 끝");
    // 근무자 일은 막힘: 열쇠 창의 버튼 · 포스 전환
    await B.click(`.key[data-k='${k}']`);
    assert.strictEqual(await B.$("#note-m"), null, "사무실 PC 에는 손님 메모 칸 없음");
    const blocked = await B.$$eval("#sheet [data-act]:not([disabled])", (e) => e.map((x) => x.dataset.act).find((a) => /^(payOver|svcPick|plusSlot|endSlot|reprint|returnKey|returnAll)$/.test(a)));
    assert.ok(blocked, "막을 버튼이 있음");
    const before = await B.evaluate(() => JSON.stringify(window.__deskTest.holders2()));
    await B.click(`#sheet [data-act=${blocked}]:not([disabled]) >> nth=0`);
    assert.match(await B.textContent("#toast"), /현장 POS 에서/);
    assert.strictEqual(await B.evaluate(() => JSON.stringify(window.__deskTest.holders2())), before, "아무것도 안 바뀜");
    await B.click("#sheet [data-act=close] >> nth=0");
    assert.strictEqual(await B.evaluate(() => window.__deskTest.sync.gate("day")), false);
    assert.match(await B.textContent("#toast"), /오늘 현장 화면만/);
    assert.strictEqual(await B.evaluate(() => window.__deskTest.sync.gate("tplTest")), false);
    assert.match(await B.textContent("#toast"), /출력은 현장 POS 에서/);
    // 되는 것: 메모장 · 운영 설정 · 새로고침 = 현장에 명령
    for (const a of ["memoSend", "memoAdd", "settings", "tplSave", "capCell", "stToggle"]) assert.strictEqual(await B.evaluate((x) => window.__deskTest.sync.gate(x), a), true, a);
    await B.click("[data-act=refresh]");
    assert.match(await B.textContent("#toast"), /현장 POS 로 보냄: 네이버 새로고침/);
    // 현장에서 바뀌면 다시: 열쇠 하나 반납 → 사무실 열쇠판도
    await A.evaluate((key) => { const T = window.__deskTest, h = T.holders().find((x) => x.keys.includes(key)); T.returnKeys(h.id, [key]); }, k);
    await B.evaluate((s) => window.__deskTest.sync.apply(JSON.parse(s), window.__deskTest.today() + " 13:51:00"), await A.evaluate(() => JSON.stringify(window.__deskTest.sync.snap())));
    assert.deepStrictEqual(await keyBoard(B), await keyBoard(A), "반납도 같게");
    // 미리 보기 끝 (맨 위 표시를 누름)
    await B.click("#syncchip");
    assert.strictEqual(await B.evaluate(() => window.__deskTest.sync.office()), false);
    assert.strictEqual(await B.isHidden("#syncchip"), true);
    assert.deepStrictEqual(A.errs.concat(B.errs), []);
  } finally {
    await browser.close();
  }
});

test("현장 POS: 사무실이 보낸 명령을 대신 하고 결과를 돌려줌 · 사무실은 결과를 알림 · 모르는 명령은 안 함", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext();
    const A = await open(ctx);
    await A.evaluate(() => localStorage.clear());
    await A.reload();
    await A.evaluate(() => window.__deskTest.setNow(600)); // 체험판 10/5 (대체공휴일 · 시간제) 10:00
    await A.evaluate(() => window.__deskTest.sync.run({ id: "aaaaaaaaaaaa", act: "capNow", args: {} }));
    await A.waitForFunction(() => window.__deskTest.sync.acks().length === 1);
    const a1 = await A.evaluate(() => window.__deskTest.sync.acks()[0]);
    assert.strictEqual(a1.ok, true);
    assert.ok(a1.msg.length > 0, `결과 글: ${a1.msg}`);
    assert.match(await A.textContent("#toast"), /사무실 PC 에서 보낸 일|판매 수량/);
    await A.evaluate(() => window.__deskTest.sync.run({ id: "bbbbbbbbbbbb", act: "capTry", args: { day: "2026-10-12", time: "10:00", n: 12 } }));
    await A.evaluate(() => window.__deskTest.sync.run({ id: "cccccccccccc", act: "rmrf", args: {} }));
    await A.evaluate(() => window.__deskTest.sync.run({ id: "dddddddddddd", act: "capTry", args: { day: "어제", time: "10:00", n: 12 } }));
    const acks = await A.evaluate(() => window.__deskTest.sync.acks().slice(1));
    assert.deepStrictEqual(acks.map((x) => [x.id, x.ok]), [["bbbbbbbbbbbb", false], ["cccccccccccc", false], ["dddddddddddd", false]]);
    assert.match(acks[0].msg, /체험판/);
    assert.match(acks[1].msg, /모르는 명령/);
    assert.match(acks[2].msg, /틀려요/);
    // 사무실 쪽 알림
    const B = await open(ctx);
    await B.evaluate(() => window.__deskTest.sync.demo(true));
    await B.evaluate((a) => window.__deskTest.sync.ack({ id: a.id, act: "capNow", ok: a.ok, msg: a.msg }), a1);
    assert.match(await B.textContent("#toast"), /^현장 POS: 수량 지금 조절 됨/);
    assert.deepStrictEqual(A.errs.concat(B.errs), []);
  } finally {
    await browser.close();
  }
});

test("반대편 PC 에서 바꾼 설정이 화면에 바로: 프린트물 설정 · 성수기 기간 · 수량 자동조절 · 글을 쓰는 중이면 다 쓴 뒤에 다시 그림", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext();
    const A = await open(ctx);
    await A.evaluate(() => localStorage.clear());
    await A.reload();
    // 프린트물 설정을 열고 편집 칸에 쓰는 중
    await A.dblclick("#now");
    await A.click('[data-t="prints"]');
    await A.click("#tpl-text");
    await A.keyboard.type("쓰는중");
    const typed = await A.inputValue("#tpl-text");
    await A.evaluate(() => window.__deskTest.sync.settings(["printSet", "peaks", "capAuto"], { printSet: { apply: "event", bcOn: false, names: { evw: "(추)추석양식" }, frags: [] }, peaks: [], capAuto: Object.assign({}, window.__deskTest.RULES.capAuto, { target: 37 }) }));
    assert.match(await A.textContent("#toast"), /사무실 PC에서 바꾼 설정을 받았어요/);
    assert.strictEqual(await A.evaluate(() => window.__deskTest.RULES.capAuto.target), 37);
    assert.deepStrictEqual(await A.evaluate(() => window.__deskTest.RULES.peaks), []);
    assert.strictEqual(await A.inputValue("#tpl-text"), typed, "쓰는 중인 글은 그대로");
    await A.click("#sheet h3"); // 칸 밖을 누름 → 다시 그림
    await A.waitForFunction(() => document.getElementById("tpl-apply") && document.getElementById("tpl-apply").value === "event");
    assert.strictEqual(await A.isChecked("#tpl-bc"), false);
    await A.selectOption("#tpl-group", "event");
    assert.ok((await A.$$eval("#sheet .tplrow", (e) => e.map((x) => x.textContent))).some((t) => t.includes("(추)추석양식")));
    // 두 PC 연결 메뉴 (체험판)
    await A.click('[data-t="sync"]');
    assert.match(await A.textContent("#setbody"), /체험판 — 설치한 앱에서 이어져요/);
    assert.match(await A.textContent('[data-t="sync"]'), /두 PC 연결\s*체험판/);
    assert.deepStrictEqual(A.errs, []);
  } finally {
    await browser.close();
  }
});
