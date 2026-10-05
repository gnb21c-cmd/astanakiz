/* 데스크 화면(prototype/desk.html) ↔ 가짜 아마노 화면을 실제 동기화 코드(AmanoSync)로 이어서
   데스크의 주차등록 칸에서 검색 · 선택 · 할인 · 삭제를 누르면 아마노 화면이 바뀌는지 본다 (앱의 preload 를 흉내 냄) */
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
const DESK = "file://" + path.join(__dirname, "..", "..", "..", "prototype", "desk.html");

test("데스크 주차등록 칸에서 누른 것이 아마노 화면에 그대로 들어감", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const amanoPage = await ctx.newPage();
    await amanoPage.goto(MOCK);
    await amanoPage.evaluate(() => localStorage.clear());
    await amanoPage.goto(MOCK);
    const sync = new AmanoSync((code) => amanoPage.evaluate(code), { timeout: 6000 });

    const desk = await ctx.newPage();
    await desk.exposeFunction("__bridge", (fn, args) => sync[fn](...args));
    await desk.addInitScript(() => {
      const call = (fn) => (...args) => window.__bridge(fn, args);
      window.desk = { amano: { search: call("search"), select: call("select"), discount: call("discount"), remove: call("remove") } };
    });
    const errs = [];
    desk.on("pageerror", (e) => errs.push(e.message));
    await desk.goto(DESK);

    await desk.fill("#car-day", "2026-10-04");
    await desk.fill("#car-q", "5514");
    await desk.click("#park-form button");
    await desk.waitForSelector(".car");
    assert.strictEqual(await amanoPage.inputValue("#sNo"), "5514", "아마노 차량번호 칸");
    assert.match(await desk.textContent(".car"), /117무5514/);

    await desk.click(".car");
    await desk.waitForSelector("#pcar .no");
    assert.strictEqual((await desk.textContent("#pcar .no")).trim(), "117무5514");
    assert.match(await desk.textContent("#pcar .tm"), /3시간 49분/, "아마노 주차시간을 읽어 옴");

    await desk.click('[data-act=discount][data-h="5시간할인"]');
    await desk.waitForFunction(() => document.querySelectorAll("#pcar .dlist div").length === 3);
    assert.match(await amanoPage.textContent("body"), /5시간할인/, "아마노 할인내역에 등록됨");
    assert.match(await desk.textContent("#synclog"), /완료/);

    await desk.click('[data-act=discDel][data-i="0"]');
    await desk.waitForFunction(() => document.querySelectorAll("#pcar .dlist div").length === 2);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
