/* 가린 손님 네이버 이용완료 (사장님 11/27 — "*처리 된 사람을 사용완료처리 못하는 문제" · "데스크가 이미 네이버에서 완료 처리를 했는데 아직 못했다고 다시 하겠다는 메시지와 계속 빨강글씨")
   원인: 데스크는 [이용완료]를 누른 뒤 칸 숫자가 바뀌었는지로 확인 → 네이버가 늦게 반영하면 '실패' → 2분 뒤 다시 할 때 카드가 이미 이용완료 칸으로 옮겨 가
   확정 칸에서 '못 찾음' 실패가 되풀이 (다음 불러오기 때까지 빨간 글씨) → 이제 확정 칸에 없으면 이용완료 칸을 봄 · 확인이 애매해도 이용완료 칸에 있으면 됨
   실제 앱 본체 NaverSync(손님 확인 · 이용완료) + 가짜 네이버(?mask=1 · naver-unmask = [개인정보 조회] 인증 흉내 · mockSlowDone = 늦은 반영) + 데스크 · 지어낸 손님 */
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { NaverSync } = require("../src/naver-sync");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  ({ chromium } = require("/opt/node-tools/node_modules/playwright"));
}
const NAVER = "file://" + path.join(__dirname, "..", "mock", "naver.html");
const DESK = "file://" + path.join(__dirname, "..", "..", "..", "prototype", "desk.html");
const launch = () => chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const EV = { ver: 2, on: true, from: "2026-09-10", to: "2026-10-31", days: 20, gift: "수제돈까스" };

test("가린 손님 네이버 이용완료: 가린 채 · 네이버만 열림 · 늦은 반영(다시 할 때 '이미 이용완료' — 빨간 글씨 되풀이 없음) · 직원이 네이버에서 직접 누른 손님", async () => {
  const browser = await launch();
  try {
    // 가짜 네이버는 따로 (데스크 시계를 빨리 돌려도 네이버의 '늦은 반영'은 실제 시간대로 — 같은 묶음이면 시계를 함께 씀)
    const nctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const np = await nctx.newPage();
    await np.goto(NAVER + "?mask=1");
    await np.evaluate(() => localStorage.clear());
    await np.goto(NAVER + "?mask=1");
    const steps = [];
    const naver = new NaverSync((code) => np.evaluate(code), { urls: { list: NAVER + "?view=list&mask=1", calendar: NAVER + "?view=calendar&mask=1" }, today: () => "2026-10-05", onStep: (x) => steps.push(x) });
    const desk = await ctx.newPage();
    await desk.clock.install({ time: new Date("2026-10-05T16:40:00") });
    let qq = Promise.resolve();
    const serial = (fn) => (qq = qq.then(fn, fn));
    const log = [], raw = [];
    await desk.exposeFunction("__naverLoad", (day, only) => serial(() => naver.loadDay(day, { only })));
    await desk.exposeFunction("__naverComplete", (bk) => serial(async () => { const r = await naver.complete(bk); log.push([bk.no, r.ok, r.already ? "already" : "", r.why || ""]); raw.push([bk, r]); return r; }));
    await desk.exposeFunction("__custInfo", (job) => serial(() => naver.custInfo(job.day, job.list)));
    await desk.addInitScript((ev) => {
      window.desk = {
        naver: { load: (d, o) => window.__naverLoad(d, o), complete: (bk) => window.__naverComplete(bk), custInfo: (job) => window.__custInfo(job) },
        state: { load: (day) => localStorage.getItem("test-state-" + day), save: (day, json) => localStorage.setItem("test-state-" + day, json) },
        config: { get: async () => ({ build: "test", visitEvent: ev }), set: async () => ({ ok: true }) },
      };
    }, EV);
    const errs = [];
    desk.on("pageerror", (e) => errs.push(e.message));
    await desk.goto(DESK);
    const gold = async () => { if (await desk.isVisible("#golden")) await desk.click("#golden [data-act=goldenOk]"); };
    await desk.waitForTimeout(400); await gold();
    await desk.click("[data-act=refresh]");
    await desk.waitForFunction(() => /불러옴/.test(document.getElementById("refresh-at").textContent), null, { timeout: 60000 });
    const naverStatus = async (no) => { const r = await serial(() => naver.loadDay("2026-10-05", { only: no === "1379100103" ? "17:30" : "17:00" })); return (r.bookings.find((x) => x.no === no) || {}).status; };
    const enter = async (slot, name, mid) => {
      await gold();
      await desk.click(`.slot[data-s="${slot}"]`);
      await desk.click(`.res:has-text("${name}")`);
      for (let i = 0; i < 4 && !(await desk.$("#enter-done:not([disabled])")); i++) {
        if (mid && (await desk.$("#e-mid")) && !(await desk.inputValue("#e-mid"))) { for (const n of mid) await desk.click(`[data-act=midKey][data-n="${n}"]`); continue; }
        await desk.click(".kpick button:not([disabled]):not(.on) >> nth=0");
      }
      await desk.click("#enter-done");
    };
    const waitLog = async (n) => { for (let i = 0; i < 120 && log.length < n; i++) { await desk.clock.runFor(1000); await desk.waitForTimeout(250); } };
    // ① 가린 채 (네이버도 데스크도 가림)
    await enter(1020, "은*인", "5678");
    await waitLog(1);
    assert.deepStrictEqual(log[0], ["1379100101", true, "", ""], JSON.stringify(log));
    assert.strictEqual(await naverStatus("1379100101"), "완료");
    // ② 네이버는 [개인정보 조회]로 열림 · 데스크 카드는 아직 가림 (다시 안 불러옴) — 예약번호로 찾아 됨
    await np.evaluate(() => localStorage.setItem("naver-unmask", "1"));
    await enter(1050, "한*", "4444");
    await waitLog(2);
    assert.deepStrictEqual(log[1], ["1379100103", true, "", ""], JSON.stringify(log));
    // ③ 네이버가 이용완료를 늦게 반영 (20초) → 처음 확인은 실패 → 2분 뒤 다시: 이미 이용완료 → 됨 (빨간 글씨 되풀이 없음)
    await np.evaluate(() => localStorage.setItem("mockSlowDone", "20"));
    await enter(1020, "박서준", "");
    await waitLog(3);
    assert.strictEqual(log[2][1], false, "처음엔 칸 숫자가 그대로라 실패 " + JSON.stringify(log[2]) + " " + JSON.stringify(raw[2]) + " " + steps.slice(-12).join(" | "));
    assert.match(await desk.textContent("#toast"), /이용완료 실패: .*2분 뒤 다시/);
    await desk.waitForTimeout(16000); // 네이버가 반영할 때까지 (실제 시간)
    await desk.clock.runFor(125000); // 2분 뒤 다시
    await waitLog(4);
    assert.deepStrictEqual(log[3], ["1379100102", true, "already", ""], "다시 할 때 이미 이용완료 → 됨 " + JSON.stringify(log));
    assert.match(await desk.textContent("#toast"), /박서준님 네이버 이용완료 되어 있음/);
    const pend = await desk.evaluate(() => window.__deskTest.holders().filter((h) => h.naverPending).map((h) => h.name));
    assert.deepStrictEqual(pend, [], "다시 할 일 없음");
    await desk.clock.runFor(250000);
    assert.strictEqual(log.length, 4, "더 안 함 (빨간 글씨 되풀이 없음)");
    // ④ 직원이 네이버(엣지)에서 직접 [이용완료]를 누른 손님 → 데스크에서 입장 → 이미 이용완료 → 됨 (확정 단추가 없어도 · 빨간 글씨 없음)
    await np.evaluate(() => localStorage.removeItem("mockSlowDone"));
    const manual = await np.evaluate(() => { const db = JSON.parse(localStorage.getItem("mockNaver3")); const y = db["2026-10-05"].find((b) => b.status === "확정" && b.time === "18:00"); y.status = "완료"; y.done += 1; localStorage.setItem("mockNaver3", JSON.stringify(db)); return y.no; });
    const id = await desk.evaluate((no) => { const b = window.__deskTest.bk && [...document.querySelectorAll(".res")].map((e) => e.dataset.id).map((i) => window.__deskTest.bk(i)).find((x) => x && x.no === no); return b ? b.id : null; }, manual).catch(() => null);
    await gold();
    await desk.click('.slot[data-s="1080"]');
    const rid = await desk.evaluate((no) => { const e = [...document.querySelectorAll(".res")].find((x) => { const b = window.__deskTest.bk(x.dataset.id); return b && b.no === no; }); return e ? e.dataset.id : null; }, manual);
    assert.ok(rid || id, "18:00 카드");
    await desk.click(`.res[data-id="${rid || id}"]`);
    for (let i = 0; i < 4 && !(await desk.$("#enter-done:not([disabled])")); i++) {
      if ((await desk.$("#e-mid")) && !(await desk.inputValue("#e-mid"))) { for (const n of "1234") await desk.click(`[data-act=midKey][data-n="${n}"]`); continue; }
      await desk.click(".kpick button:not([disabled]):not(.on) >> nth=0");
    }
    const cnt0 = log.length;
    await desk.click("#enter-done");
    await waitLog(cnt0 + 1);
    assert.deepStrictEqual(log[cnt0].slice(0, 3), [manual, true, "already"], JSON.stringify(log));
    assert.doesNotMatch(await desk.textContent("#toast"), /실패/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
