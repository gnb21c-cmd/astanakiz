/* 두 PC 연결 — 화면 쪽 (사장님 11/06): 우편함으로는 운영 설정 · 메모장 · 자동 수량조절 켜고 끄기 · 키 현황만
   네이버 예약 · 고객 카드는 사무실 PC 가 네이버에서 직접 읽음(읽기만) · 주차는 사무실에 없음
   앱 본체(우편함 · 잠금)는 desk-sync.test.js · 실제 앱 두 대 끝에서 끝까지는 빌드 때 Electron 점검
   여기서는 체험판 두 창: A = 현장 POS · B = 사무실 PC ('사무실 PC 화면 미리 보기' + A 의 키 현황을 넣음) */
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

test("사무실 PC 키 현황: 현장 열쇠판 그대로 · 이름 · 전화 · 손님 메모는 안 감 · 사무실 네이버에 없는 입장은 '예약 손님' → 네이버에 나오면 그 카드로", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext();
    const A = await open(ctx);
    await A.evaluate(() => localStorage.clear());
    await A.reload();
    await A.evaluate(() => window.__deskTest.setNow(830));
    // 현장: 사무실 PC 네이버에는 아직 없는 예약이 입장 · 손님 메모
    const id = await A.evaluate(() => { const T = window.__deskTest; return T.addBooking(T.today(), "14:00", "사무실확인", "01077770000", 2, { prevDone: 2 }); });
    await enter(A, id, 840);
    const ent = await A.evaluate((i) => { const b = window.__deskTest.bk(i); return { keys: b.keys.slice(), no: b.no }; }, id);
    assert.strictEqual(ent.keys.length, 2, "현장에서 열쇠 2개 입장");
    const k = await A.evaluate(() => window.__deskTest.holders()[0].keys[0]);
    await A.click(`.key[data-k='${k}']`);
    await A.fill("#note-m", "손님메모비밀글"); await A.dispatchEvent("#note-m", "change");
    await A.click("#sheet [data-act=close] >> nth=0");
    const snap = await snapOf(A);
    for (const s of ["손님메모비밀글", "사무실확인", "01077770000", "찟재명", "01020039595"]) assert.ok(!snap.includes(s), `키 현황에 '${s}' 없음 (이름 · 전화 · 메모는 안 보냄)`);
    assert.deepStrictEqual(Object.keys(JSON.parse(snap)).sort(), ["at", "b", "day", "g", "ig", "mv", "r", "s", "v", "w", "x"].sort(), "네이버 칸 · 고객 카드 · 수량 기록은 안 보냄 (r = 대관 단체 이름 · 입금일 · 11/10)");

    // 사무실 PC (체험판 미리 보기) — 네이버 예약은 이 PC 가 읽은 것 (체험 예시 = 현장과 같은 예약, '사무실확인'은 아직 없음)
    const B = await open(ctx);
    await B.evaluate(() => window.__deskTest.sync.demo(true));
    assert.strictEqual(await B.evaluate(() => window.__deskTest.sync.office()), true);
    await applyTo(B, snap, "13:50:00");
    const boardA = await keyBoard(A), boardB = await keyBoard(B);
    for (const kk of ent.keys) {
      assert.match(boardB.find((x) => x.startsWith(kk + ":")), /예약 손님/, `${kk}번: 사무실 네이버에 아직 없는 입장은 '예약 손님'`);
      assert.match(boardA.find((x) => x.startsWith(kk + ":")), /사무실확인/);
    }
    const strip = (b) => b.filter((x) => !ent.keys.some((kk) => x.startsWith(kk + ":")));
    assert.deepStrictEqual(strip(boardB), strip(boardA), "다른 열쇠는 이름까지 같음 (이름은 사무실 네이버 카드에서)");
    assert.strictEqual(await B.getAttribute("#syncchip", "aria-label"), "사무실 미리 보기 누르면 끝"); // 11/10: 두 줄 · 오른쪽 묶음
    // 사무실 네이버를 다시 읽어 그 예약이 나옴 → 그 카드에 붙음 ('예약 손님' 카드는 없어짐)
    await B.evaluate((no) => { const T = window.__deskTest; const i = T.addBooking(T.today(), "14:00", "사무실확인", "01077770000", 2, {}); T.bk(i).no = no; }, ent.no);
    await applyTo(B, snap, "13:50:10");
    const after = await keyBoard(B);
    for (const kk of ent.keys) assert.match(after.find((x) => x.startsWith(kk + ":")), /사무실확인/);
    assert.strictEqual(await B.evaluate(() => window.__deskTest.holders().filter((h) => h.name === "예약 손님").length), 0);
    assert.strictEqual(await B.evaluate((no) => window.__deskTest.holders().filter((h) => h.no === no).length, ent.no), 1, "한 손님은 한 카드");
    // 현장에서 반납 → 사무실 열쇠판도
    await A.evaluate((key) => { const T = window.__deskTest, h = T.holders().find((x) => x.keys.includes(key)); T.returnKeys(h.id, [key]); }, k);
    await applyTo(B, await snapOf(A), "13:51:00");
    assert.ok((await keyBoard(B)).find((x) => x.startsWith(k + ":")).includes("free"), "반납한 열쇠는 빈 열쇠");
    assert.deepStrictEqual(await B.evaluate(() => window.__deskTest.holders2().map((h) => h.keys.join("+")).sort()), await A.evaluate(() => window.__deskTest.holders2().map((h) => h.keys.join("+")).sort()));
    assert.deepStrictEqual(A.errs.concat(B.errs), []);
  } finally {
    await browser.close();
  }
});

test("사무실 PC 버튼: 근무자 일 · 네이버에 넣는 일 · 출력은 막힘 · 설정 · 메모장 · 네이버 보기(새로고침 · 날짜)는 됨 · 주차 · 톡톡 없음", async () => {
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
    for (const a of ["car", "discount", "talkOpen", "posGo", "bcSet", "walkDone", "svSendNow", "hvBackfill"]) assert.strictEqual(await B.evaluate((x) => window.__deskTest.sync.gate(x), a), false, a);
    for (const a of ["refresh", "day", "slot", "openRes", "memoSend", "memoAdd", "settings", "tplSave", "capCell", "stToggle", "naverShow"]) assert.strictEqual(await B.evaluate((x) => window.__deskTest.sync.gate(x), a), true, a);
    await B.click("[data-act=refresh]");
    assert.match(await B.textContent("#toast"), /새로고침/, "네이버 보기는 이 PC 가 직접");
    await B.click('[data-act=day][data-d="1"]');
    assert.doesNotMatch(await B.textContent("#toast"), /현장 POS 에서/, "다른 날짜도 네이버에서 직접");
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

test("반대편 PC 에서 바꾼 설정이 화면에 바로: 프린트물 설정 · 성수기 기간 · 수량 자동조절 · 글을 쓰는 중이면 다 쓴 뒤에 다시 그림", async () => {
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
    await A.evaluate(() => window.__deskTest.sync.settings(["printSet", "peaks", "capAuto"], { printSet: { apply: "event", bcOn: false, names: { evw: "(추)추석양식" }, frags: [] }, peaks: [], capAuto: Object.assign({}, window.__deskTest.RULES.capAuto, { on: false, target: 37 }) }));
    assert.match(await A.textContent("#toast"), /사무실 PC에서 바꾼 설정을 받았어요/);
    assert.deepStrictEqual(await A.evaluate(() => [window.__deskTest.RULES.capAuto.on, window.__deskTest.RULES.capAuto.target]), [false, 37], "자동 수량조절 끔 · 목표");
    assert.deepStrictEqual(await A.evaluate(() => window.__deskTest.RULES.peaks), []);
    assert.strictEqual(await A.inputValue("#tpl-text"), typed, "쓰는 중인 글은 그대로");
    await A.click("#sheet h3");
    await A.waitForFunction(() => document.getElementById("tpl-apply") && document.getElementById("tpl-apply").value === "event");
    assert.strictEqual(await A.isChecked("#tpl-bc"), false);
    await A.selectOption("#tpl-group", "event");
    assert.ok((await A.$$eval("#sheet .tplrow", (e) => e.map((x) => x.textContent))).some((t) => t.includes("(추)추석양식")));
    await A.click('[data-t="sync"]');
    assert.match(await A.textContent("#setbody"), /체험판 — 설치한 앱에서 이어져요/);
    assert.match(await A.textContent('[data-t="sync"]'), /두 PC 연결\s*체험판/);
    assert.deepStrictEqual(A.errs, []);
  } finally {
    await browser.close();
  }
});
