/* 네이버 톡톡 상담 (키즈상담 · 카페상담 버튼, 사용자 지시 10/8)
   - 상담 목록 줄마다 붙는 붉은 원(안 읽은 말풍선 수)만 더함 · 왼쪽 메뉴 '상담관리 111' · '안읽은 메시지 111개'는 안 셈
   - 읽으면(줄을 누르면) 줄어듦 · 로그인 화면이면 알려 줌
   - 데스크: 버튼에 붉은 원 숫자 · 0이면 숨김 · 못 읽으면 주황 '!' · 누르면 그 상담 창을 엶 · 설명은 45번 오른쪽 */
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { TALK_COUNT_JS, talkMerge } = require("../src/talk-driver");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  ({ chromium } = require("/opt/node-tools/node_modules/playwright"));
}
const TALK = "file://" + path.join(__dirname, "..", "mock", "talk.html");
const DESK = "file://" + path.join(__dirname, "..", "..", "..", "prototype", "desk.html");
const launch = () => chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});

test("톡톡 상담 목록: 줄마다 붉은 원 숫자만 더함 · 읽으면 줄어듦 · 로그인 화면", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    const count = () => page.evaluate(TALK_COUNT_JS);
    await page.goto(TALK + "?u=2,0,3");
    let r = await count();
    assert.ok(r.ok, JSON.stringify(r));
    assert.strictEqual(r.n, 5, "2 + 3 (왼쪽 메뉴 111 · 안읽은 메시지 111개는 안 셈) " + JSON.stringify(r));
    assert.ok(r.rows >= 4, "목록 줄을 찾음");
    await page.click('.item[data-i="0"]'); // 잉꼬 대화를 읽음
    r = await count();
    assert.strictEqual(r.n, 3);
    await page.click('.item[data-i="2"]');
    assert.strictEqual((await count()).n, 0, "다 읽으면 0");

    await page.goto(TALK + "?u=1,4&plain=1"); // 이름표 없이 붉은 색으로만
    assert.strictEqual((await count()).n, 5);

    await page.goto(TALK + "?login=1");
    r = await count();
    assert.deepStrictEqual([r.ok, r.needLogin], [false, true]);
  } finally {
    await browser.close();
  }
});

// 10/9 현장: 처음 방식이 실제 화면에서 숫자를 못 찾음 → 숫자 먼저 찾고 그 줄의 시각으로 확인, 액자 안까지
test("톡톡 v2: 붉은 원을 ::before 로 그린 숫자 · 숨은 시각 글자 · 대화 안 '1'은 안 셈 · 액자 안 목록", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    const countAll = async () => talkMerge(await Promise.all(page.frames().map((f) => f.evaluate(TALK_COUNT_JS).catch(() => null))));
    await page.goto(TALK + "?u=1,0,2,0&v=2");
    let r = await countAll();
    assert.strictEqual(r.n, 3, "1 + 2 (대화 안 안읽음 '1' · 메뉴 111 은 안 셈) " + JSON.stringify(r));
    assert.ok(r.probe.some((p) => p.red && p.row), "찾은 후보를 남김 " + JSON.stringify(r.probe));
    await page.click('.item[data-i="2"]');
    assert.strictEqual((await countAll()).n, 1, "읽으면 줄어듦");
    await page.goto(TALK + "?u=0,0,0,0&v=2");
    r = await countAll();
    assert.deepStrictEqual([r.ok, r.n], [true, 0], "새 메시지가 없으면 0 (대화 안 '1'을 세지 않음)");
    assert.ok(r.rows >= 4, "목록 줄(시각)은 찾음");

    await page.goto(TALK + "?u=2,1&frame=1");
    await page.frameLocator("#f").locator(".item").first().waitFor();
    r = await countAll();
    assert.strictEqual(r.n, 3, "액자 안 목록도 셈 " + JSON.stringify(r));
  } finally {
    await browser.close();
  }
});

test("데스크: 키즈상담 · 카페상담 버튼 붉은 원 · 누르면 상담 창 · 설명은 45번 오른쪽", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    // 체험판: 예시 숫자 (카페 1)
    await page.goto(DESK);
    const badge = (k) => page.$eval(`#talk-${k} .tbadge`, (b) => (b.hidden ? "" : (b.classList.contains("warn") ? "warn:" : "") + b.textContent));
    assert.deepStrictEqual([await badge("kids"), await badge("cafe")], ["", "1"]);
    const pos = await page.evaluate(() => {
      const k45 = document.querySelector('.key[data-k="45"]').getBoundingClientRect(), lg = document.querySelector("#keys .legend").getBoundingClientRect();
      const kids = document.getElementById("talk-kids").getBoundingClientRect(), bulk = document.getElementById("bulk-btn").getBoundingClientRect();
      return { right: lg.left >= k45.right, row: Math.abs(lg.top - k45.top) < 4, inBoard: lg.bottom <= k45.bottom + 1, foot: kids.top > k45.bottom && Math.abs((kids.top + kids.bottom) / 2 - (bulk.top + bulk.bottom) / 2) < 3 };
    });
    assert.deepStrictEqual(pos, { right: true, row: true, inBoard: true, foot: true }, "설명은 45번 오른쪽 · 상담 버튼은 열쇠판 아래 일괄 반납 옆");
    assert.match((await page.textContent("#keys .legend")).replace(/\s+/g, " "), /빈 열쇠.*빈 열쇠를 누르면 현장입장.*입장 ~ 1시간 50분.*1시간 50분 ~ 2시간.*2시간 넘음/);

    // 설치한 앱: 뒤에서 읽은 숫자를 받아 표시
    await page.addInitScript(() => {
      window.__opened = [];
      window.desk = { talk: {
        counts: async () => ({ kids: { n: 2 }, cafe: { n: 0 } }),
        onCounts: (cb) => { window.__push = cb; },
        open: async (k) => { window.__opened.push(k); return { ok: true }; },
        setup: async () => ({ ok: true }), setHome: async () => ({ ok: true }), dump: async () => ({ ok: true }),
      } };
    });
    await page.goto(DESK);
    await page.waitForFunction(() => !document.querySelector("#talk-kids .tbadge").hidden);
    assert.deepStrictEqual([await badge("kids"), await badge("cafe")], ["2", ""]);
    await page.evaluate(() => window.__push({ kids: { n: 0 }, cafe: { n: 120 } }));
    assert.deepStrictEqual([await badge("kids"), await badge("cafe")], ["", "99+"], "읽으면 사라짐 · 100개 넘으면 99+");
    await page.evaluate(() => window.__push({ cafe: { n: 0, warn: "네이버 로그인이 필요해요" } }));
    assert.strictEqual(await badge("cafe"), "warn:!");
    assert.match(await page.getAttribute("#talk-cafe", "title"), /로그인/);
    await page.click("#talk-cafe");
    await page.click("#talk-kids");
    assert.deepStrictEqual(await page.evaluate(() => window.__opened), ["cafe", "kids"]);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
