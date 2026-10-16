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
    // 바탕화면 · 총 판매수 (글씨 줄임 · 10/9)
    assert.strictEqual((await page.textContent("#desktop-btn")).trim(), "바탕화면");
    assert.match((await page.textContent("#sold")).replace(/\s+/g, " ").trim(), /^총 판매수 = \d+$/);
    await page.$eval("#desktop-btn", (e) => e.click()); // 체험판은 시간 버튼 때문에 커튼 손잡이 밑 (앱에서는 안 가림)
    assert.match(await page.textContent("#toast"), /바탕화면/);

    // 17:30 과 18:00 사이 빨간 선 (18:00부터 무제한 · 시간제인 날)
    const line = await page.$$eval("#slots .slot.unl", (e) => e.map((x) => ({ t: x.dataset.s, bg: getComputedStyle(x, "::before").backgroundColor })));
    assert.deepStrictEqual(line.map((x) => x.t), ["1080"], "18:00 줄 위에만");
    assert.notStrictEqual(line[0].bg, "rgba(0, 0, 0, 0)");
    // 예약 수량 2장 이상이면 숫자만 표시 (10/9 빨강 글씨 → 10/16 미입장 스티커처럼 노랑 네모 · 흰 글씨)
    await page.click('.slot[data-s="840"]');
    const q = await page.evaluate(() => [...document.querySelectorAll("#res .res")].map((c) => ({ name: c.querySelector(".name").firstChild.textContent.trim(), many: (c.querySelector(".qmany") || {}).textContent || "" })));
    assert.strictEqual(q.find((x) => x.name === "류하린").many, "2", "2장 → 노랑 네모");
    assert.strictEqual(q.find((x) => x.name === "고은우").many, "", "1장 → 그대로");
    const asColor = (prop, v) => page.evaluate(([p, c]) => { const d = document.createElement("i"); d.style[p] = c; document.body.appendChild(d); const r = getComputedStyle(d)[p]; d.remove(); return r; }, [prop, v]);
    const yellow = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--yellow").trim());
    assert.ok(yellow, "--yellow 색");
    const st = await page.$eval(".qmany", (e) => { const c = getComputedStyle(e); return { bg: c.backgroundColor, color: c.color, radius: c.borderRadius }; });
    assert.strictEqual(st.bg, await asColor("backgroundColor", yellow), "노랑 네모");
    assert.strictEqual(st.color, "rgb(255, 255, 255)", "흰 글씨");
    assert.notStrictEqual(st.radius, "0px", "미입장 스티커처럼 둥근 네모");

    // 설치한 앱: 운영 설정의 프린터(COM3)로 현금통 열기
    await page.addInitScript(() => {
      window.__drawer = [];
      window.desk = {
        naver: { load: async (day) => ({ ok: true, day, slots: [], bookings: [] }), complete: async () => ({ ok: true }) },
        config: { get: async () => ({ build: "1.33", printMode: "com", comPort: "COM3" }), set: async (p) => { window.__cfg = p; return { ok: true }; } },
        print: { drawer: async (job) => { window.__drawer.push(job); return { ok: true }; } },
        win: { desktop: async () => { window.__desktop = (window.__desktop || 0) + 1; return { ok: true }; } },
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
    await page.click("#sheet [data-act=close] >> nth=0");
    await page.$eval("#desktop-btn", (e) => e.click());
    assert.strictEqual(await page.evaluate(() => window.__desktop), 1, "앱: 바탕화면으로");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
