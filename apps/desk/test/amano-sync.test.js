/* 아마노 동기화 시험: 가짜 아마노 화면(mock/amano.html)을 브라우저로 열고
   데스크와 같은 코드(AmanoSync)로 검색 → 선택 → 할인 → 삭제를 해 본다.
   실행: node --test apps/desk/test/*.test.js (playwright 가 설치된 환경) */
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { AmanoSync } = require("../src/amano-sync");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  ({ chromium } = require("/opt/node-tools/node_modules/playwright"));
}
const MOCK = "file://" + path.join(__dirname, "..", "mock", "amano.html");

async function open(query = "") {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage();
  await page.goto(MOCK + query);
  await page.evaluate(() => localStorage.clear());
  await page.goto(MOCK + query);
  const sync = new AmanoSync((code) => page.evaluate(code), { timeout: 6000 });
  return { browser, page, sync };
}

test("검색 → 선택 → 할인 → 삭제가 아마노 화면에 그대로 반영되고 결과를 읽어 온다", async () => {
  const { browser, page, sync } = await open();
  try {
    let r = await sync.search("2026-10-04", "5514");
    assert.ok(r.ok, r.why);
    assert.strictEqual(await page.inputValue("#sNo"), "5514", "아마노 차량번호 칸에 같은 값");
    assert.deepStrictEqual(r.state.rows, [{ id: "774362", no: "117무5514", count: 2, at: "2026-10-05 14:26:27" }]);

    r = await sync.select("774362");
    assert.ok(r.ok, r.why);
    assert.strictEqual(r.state.detail.no, "117무5514");
    assert.strictEqual(r.state.detail.parked, "3시간 49분");
    assert.strictEqual(r.state.history.length, 2);
    assert.ok(r.state.types.includes("5시간할인"));

    r = await sync.discount("5시간할인");
    assert.ok(r.ok, r.why);
    assert.strictEqual(r.state.history.length, 3);
    assert.strictEqual(r.state.history[0].type, "5시간할인");
    assert.match(r.dialog, /등록하시겠습니까/, "확인 창은 자동으로 확인");

    r = await sync.remove(0);
    assert.ok(r.ok, r.why);
    assert.strictEqual(r.state.history.length, 2);
    assert.strictEqual(r.state.history[0].type, "3시간할인");
  } finally {
    await browser.close();
  }
});

test("여러 대 검색 · 없는 차량 · 같은 검색 반복", async () => {
  const { browser, sync } = await open();
  try {
    let r = await sync.search("2026-10-04", "3456");
    assert.deepStrictEqual(r.state.rows.map((x) => x.no), ["12가3456", "32우3456"]);
    r = await sync.search("2026-10-04", "9999");
    assert.ok(r.ok);
    assert.strictEqual(r.state.rows.length, 0);
    r = await sync.search("2026-10-05", "1172"); // 입차일을 당일로 하면 전날 밤 차량은 빠짐
    assert.deepStrictEqual(r.state.rows.map((x) => x.no), ["38다1172"]);
    r = await sync.search("2026-10-05", "1172"); // 똑같이 다시 검색해도 멈추지 않음
    assert.ok(r.ok);
  } finally {
    await browser.close();
  }
});

test("없는 할인유형은 누르지 않고 이유를 알려 줌", async () => {
  const { browser, sync } = await open();
  try {
    await sync.search("2026-10-04", "5514");
    await sync.select("774362");
    const r = await sync.discount("99시간할인");
    assert.strictEqual(r.ok, false);
    assert.match(r.why, /99시간할인/);
  } finally {
    await browser.close();
  }
});

test("로그인이 풀린 화면이면 다시 로그인하라고 알려 줌", async () => {
  const { browser, sync } = await open("?login=need");
  try {
    const r = await sync.search("2026-10-04", "5514");
    assert.strictEqual(r.ok, false);
    assert.match(r.why, /로그인/);
  } finally {
    await browser.close();
  }
});

test("배우기: 근무자가 누른 칸의 선택자를 기억하고, 그 선택자로 입력한다", async () => {
  const { browser, page, sync } = await open();
  try {
    const learning = sync.learn();
    await page.waitForTimeout(100);
    await page.click("#sNo");
    const sel = await learning;
    assert.strictEqual(sel, "#sNo");
    const s2 = new AmanoSync((code) => page.evaluate(code), { selectors: { carNo: sel } });
    const r = await s2.search("2026-10-04", "3456");
    assert.strictEqual(r.state.rows.length, 2);
  } finally {
    await browser.close();
  }
});

test("자동 로그인: 로그인 화면이면 저장된 아이디·비밀번호로 들어감", async () => {
  const { browser, sync } = await open("?login=need");
  try {
    let r = await sync.login("test", "wrong");
    assert.ok(r.state.needLogin, "틀리면 로그인 화면 그대로");
    r = await sync.login("test", "1234");
    assert.ok(r.ok, r.why);
    assert.strictEqual(r.state.needLogin, false);
    assert.ok(r.state.hasSearch, "할인등록 화면");
  } finally {
    await browser.close();
  }
});
