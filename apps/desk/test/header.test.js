/* 맨 위 (사용자 지시 10/9): '통합 데스크 ver.n' · [포스 전환] · [환전 오픈] = 영수증 프린터로 현금통 열기 (POS 가 꺼져 있어도) */
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

test("맨 위: 통합 데스크 · 포스 전환 · 환전 오픈(현금통 열기 명령을 프린터 포트로)", async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    assert.strictEqual((await page.textContent(".top h1")).trim(), "통합 데스크");
    const btns = await page.$$eval(".top .posgo", (e) => e.map((x) => x.textContent.trim()));
    assert.deepStrictEqual(btns, ["포스 전환", "환전 오픈"]);
    await page.click("[data-act=drawer]");
    assert.match(await page.textContent("#toast"), /체험판/);

    // 예약 수량 2장 이상이면 숫자만 빨강 (10/9)
    await page.click('.slot[data-s="840"]');
    const q = await page.evaluate(() => [...document.querySelectorAll("#res .res")].map((c) => ({ name: c.querySelector(".name").firstChild.textContent.trim(), red: (c.querySelector(".qmany") || {}).textContent || "" })));
    assert.strictEqual(q.find((x) => x.name === "류하린").red, "2", "2장 → 빨강");
    assert.strictEqual(q.find((x) => x.name === "고은우").red, "", "1장 → 그대로");
    assert.strictEqual(await page.$eval(".qmany", (e) => getComputedStyle(e).color), await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--red").trim()).then((v) => page.evaluate((c) => { const d = document.createElement("i"); d.style.color = c; document.body.appendChild(d); const r = getComputedStyle(d).color; d.remove(); return r; }, v)));

    // 설치한 앱: 운영 설정의 프린터(COM3)로 현금통 열기
    await page.addInitScript(() => {
      window.__drawer = [];
      window.desk = {
        naver: { load: async (day) => ({ ok: true, day, slots: [], bookings: [] }), complete: async () => ({ ok: true }) },
        config: { get: async () => ({ build: "1.33", printMode: "com", comPort: "COM3" }), set: async (p) => { window.__cfg = p; return { ok: true }; } },
        print: { drawer: async (job) => { window.__drawer.push(job); return { ok: true }; } },
      };
    });
    await page.goto(DESK);
    await page.waitForFunction(() => /ver\.1\.33/.test(document.querySelector(".top .tag").textContent));
    await page.click("[data-act=drawer]");
    await page.waitForFunction(() => window.__drawer.length === 1);
    const job = await page.evaluate(() => window.__drawer[0]);
    assert.deepStrictEqual([job.mode, job.port, job.pin], ["com", "COM3", "auto"]);
    assert.match(await page.textContent("#toast"), /현금통을 열었어요/);
    // 현금통 단자 5번으로 → 그 핀만 (운영 설정 → 프린터)
    await page.click("text=운영 설정");
    await page.click('[data-t="printer"]');
    await page.click("[data-act=drawerPin][data-v='5']");
    assert.strictEqual(await page.evaluate(() => window.__cfg.drawerPin), "5", "이 PC 설정에 저장");
    await page.click("#sheet [data-act=drawer]");
    await page.waitForFunction(() => window.__drawer.length === 2);
    assert.strictEqual(await page.evaluate(() => window.__drawer[1].pin), "5");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
