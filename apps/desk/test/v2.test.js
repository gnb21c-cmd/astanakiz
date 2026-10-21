/* V2.0 (사장님 10/21) — 새 디자인 · 시계로 운영 설정 · 열쇠 테두리 · 메모장 · 근무자 메뉴얼
   - 시계를 1.5초 안에 두 번 누르면 운영 설정 (버튼은 없앰) · 왼쪽 메뉴 7개 · 긴 설명은 [?]
   - 열쇠판: 띠지 · 글씨 없음 — 네이버 흰색 테두리 · 현장 파랑 테두리 · 서비스 흰 점선
   - 메모장: 평일 ↔ 주말 전달(받는 쪽 [확인함]) · 근무자마다 메모(해결 → 완료) · 찾기 · 다시 켜도 그대로
   - 근무자 메뉴얼: 맨 위 버튼 · 차례 · 그림 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const M = require("../src/staff-memo");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  ({ chromium } = require("/opt/node-tools/node_modules/playwright"));
}
const DESK = "file://" + path.join(__dirname, "..", "..", "..", "prototype", "desk.html");
const launch = () => chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});

test("메모 파일: 모르는 칸 · 틀린 값은 버림 · 길이 · 줄 수 제한(끝난 것부터) · 저장 · 깨지면 bak 에서", () => {
  const d = M.clean({
    staff: [{ id: "a1", name: " 김민지 ", grp: "주말", pw: "x" }, { id: "a1", name: "중복" }, { id: "BAD!", name: "x" }, { id: "b2", name: "가".repeat(40), grp: "?" }],
    hand: [{ id: "h1", dir: "평일→주말", text: " 단체 20명 ", by: "a1", at: "2026-10-21 13:40", ok: "", okBy: "" }, { id: "h2", dir: "옆으로", text: "x" }, { id: "h3", dir: "주말→평일", text: "   " }],
    notes: [{ id: "n1", who: "a1", text: "냉장고 확인", at: "2026-10-21 12:10", done: "2026-10-21 15:00" }, { id: "n2", who: "", text: "주인 없음" }],
    extra: "버림",
  });
  assert.deepStrictEqual(d.staff, [{ id: "a1", name: "김민지", grp: "주말" }, { id: "b2", name: "가".repeat(M.NAME_MAX), grp: "평일" }]);
  assert.deepStrictEqual(d.hand, [{ id: "h1", dir: "평일→주말", text: "단체 20명", by: "a1", at: "2026-10-21 13:40", ok: "", okBy: "" }]);
  assert.deepStrictEqual(d.notes, [{ id: "n1", who: "a1", text: "냉장고 확인", at: "2026-10-21 12:10", done: "2026-10-21 15:00" }]);
  assert.strictEqual(d.extra, undefined);
  assert.strictEqual(M.clean({ notes: [{ id: "n1", who: "a1", text: "가".repeat(999) }] }).notes[0].text.length, M.TEXT_MAX);
  // 넘치면 해결한 것부터 오래된 순으로 뺌
  const many = Array.from({ length: M.LIMIT.notes + 2 }, (_, i) => ({ id: "n" + i, who: "a1", text: "t" + i, done: i === 5 || i === 9 ? "2026-10-21 10:00" : "" }));
  const kept = M.clean({ notes: many }).notes.map((n) => n.id);
  assert.strictEqual(kept.length, M.LIMIT.notes);
  assert.ok(!kept.includes("n5") && !kept.includes("n9") && kept.includes("n0"), "할 일은 남기고 해결한 것을 뺌");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sm-"));
  assert.deepStrictEqual(M.load(dir), M.empty());
  M.save(dir, d);
  assert.deepStrictEqual(M.load(dir), d);
  const d2 = M.clean({ ...d, notes: [] });
  M.save(dir, d2); // 앞 파일 → bak
  fs.writeFileSync(path.join(dir, M.FILE), "{깨짐");
  assert.deepStrictEqual(M.load(dir), d, "깨지면 bak (바로 앞 저장) 에서");
  assert.ok(fs.readdirSync(dir).some((f) => f.startsWith("staff-memo.broken-")), "깨진 파일은 지우지 않고 옆에");
});

test("시계를 1.5초 안에 두 번 → 운영 설정 (버튼 없음) · 왼쪽 메뉴 7개 · 긴 설명은 [?] · 예전 탭 이름도 받음", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.clock.install({ time: new Date("2026-10-05T13:50:00") });
    await page.goto(DESK);
    assert.strictEqual(await page.$(".top button:has-text('운영 설정')"), null, "맨 위 운영 설정 버튼 없음");
    const top = await page.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); return { clockRight: r("#now").right, manualLeft: r("[data-act=manual]").right <= r("#desktop-btn").left, last: [...document.querySelectorAll(".top .rgrp > *")].pop().id }; });
    assert.deepStrictEqual([top.manualLeft, top.last], [true, "now"], "시계가 맨 오른쪽 · [근무자 메뉴얼]은 바탕화면 왼쪽");
    // 한 번만 → 안 열림 · 1.5초 넘겨 두 번째 → 안 열림
    await page.click("#now");
    await page.clock.runFor(1600);
    await page.click("#now");
    assert.ok(await page.isHidden("#overlay"), "1.5초가 넘으면 안 열림");
    await page.clock.runFor(2000);
    await page.click("#now");
    await page.clock.runFor(700);
    await page.click("#now");
    assert.ok(await page.isVisible("#sheet .setnav"), "1.5초 안 두 번 → 운영 설정");
    assert.deepStrictEqual(await page.$$eval("#sheet .setnav button span", (e) => e.map((x) => x.textContent)), ["비성수기 설정", "프린터 설정", "프린트물 설정", "근무자 등록", "API 연결 설정", "네이버 설정", "기타"]);
    // 긴 설명은 숨김 → [?] 를 누르면 보임
    const q = page.locator("#setbody .qhelp").first();
    const t = page.locator("#setbody .qtext").first();
    assert.ok(await t.isHidden());
    await q.click();
    assert.ok(await t.isVisible());
    assert.strictEqual(await q.getAttribute("aria-expanded"), "true");
    // 네이버 설정 = 기준(대상 상품 · 재고 · 기간) + 매일 재고 열기 + 판매 수량 자동조절 + 입금대기 자동 취소
    await page.click("[data-t=naver]");
    const nv = (await page.textContent("#setbody")).replace(/\s+/g, " ");
    assert.match(nv, /기준.*대상 상품.*평일 무제한.*야간자유.*회차당 기본 재고.*열어 둘 기간.*네이버 재고 자동 오픈.*10분마다 네이버 판매 수량 자동 조절.*입금대기 예약 자동 취소/);
    // 예전 탭 이름 (rules · cap · event · link · survey) → 새 메뉴
    for (const [old, now, psub] of [["cap", "naver"], ["survey", "etc"], ["link", "api"], ["rules", "season"], ["event", "prints", "event"]]) {
      await page.evaluate((o) => { window.__deskTest.sheet.tab = o; window.__deskTest.renderSheet(); }, old);
      assert.strictEqual(await page.getAttribute("#sheet .setnav [aria-current=page]", "data-t"), now, old);
      if (psub) assert.ok(await page.isVisible("#ev-text"), "event → 프린트물 설정 · 재방문 이벤트");
    }
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("열쇠판: 띠지 · 사은권 표시 없이 테두리로 — 네이버 흰색 · 현장 파랑 · 서비스 흰 점선", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, colorScheme: "dark" });
    await page.goto(DESK);
    const st = await page.evaluate(() => {
      const css = (el) => { const c = getComputedStyle(el); return [c.borderTopStyle, c.borderTopColor]; };
      const nv = document.querySelector('.key[data-k="6"]'), wk = document.querySelector('.key[data-k="29"]');
      const sv = document.createElement("button"); sv.className = "key in svc"; document.getElementById("keys").append(sv);
      const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim(), walk = getComputedStyle(document.documentElement).getPropertyValue("--walk").trim();
      return { nv: css(nv), wk: css(wk), sv: css(sv), wkCls: wk.classList.contains("walk"), ink, walk, strips: document.querySelectorAll("#keys .key .strip, #keys .key .tag").length };
    });
    const rgb = (h) => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
    assert.deepStrictEqual(st.nv, ["solid", rgb(st.ink)], "네이버 = 흰색 실선");
    assert.ok(st.wkCls);
    assert.deepStrictEqual(st.wk, ["solid", rgb(st.walk)], "현장 = 파랑 실선");
    assert.deepStrictEqual(st.sv, ["dashed", rgb(st.ink)], "서비스 = 흰 점선");
    assert.strictEqual(st.strips, 0, "띠지 · 꼬리표 없음");
  } finally {
    await browser.close();
  }
});

test("메모장: 근무자 등록 → 평일 ↔ 주말 전달 · [확인함] · 내 메모 → 해결 → 완료 · 찾기 · 다시 켜도 그대로", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    page.on("dialog", (d) => d.accept());
    await page.clock.install({ time: new Date("2026-10-05T13:50:00") }); // 10/5 공휴일 → 오늘 받는 쪽 = 주말
    await page.goto(DESK);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    assert.ok(await page.isHidden("#memo-badge"));
    // 메모 버튼은 시간표 상자 바로 위
    const pos = await page.evaluate(() => { const b = document.querySelector("[data-act=memo]").getBoundingClientRect(), p = document.querySelector(".leftcol .panel").getBoundingClientRect(); return b.bottom <= p.top && Math.abs(b.left - p.left) < 2; });
    assert.ok(pos, "[메모] = 시간표 위");
    // 근무자가 없으면 안내
    await page.click("[data-act=memo]");
    assert.match(await page.textContent("#memo-body"), /근무자 이름이 아직 없어요 — 관리자가 운영 설정 → 근무자 등록/);
    await page.click("#sheet [data-act=close]");
    // 운영 설정 → 근무자 등록
    await page.dblclick("#now");
    await page.click("[data-t=staff]");
    for (const [n, g] of [["김민지", "평일"], ["이하늘", "주말"]]) {
      await page.click("[data-act=staffAdd]");
      await page.keyboard.type(n);
      await page.locator(".staffrow").last().locator(`[data-g=${g}]`).click();
    }
    assert.match(await page.textContent("#sheet .setnav [data-t=staff]"), /2명/);
    await page.click("#sheet [data-act=close]");
    // 전달: 평일 → 주말 (오늘 받는 쪽) · 주말 → 평일
    await page.click("[data-act=memo]");
    assert.match(await page.textContent(".mhand.mine"), /평일.*주말.*오늘 받는 쪽/s);
    assert.match(await page.getAttribute(".mwho .on", "data-id"), /^[a-z0-9]+$/);
    assert.strictEqual((await page.textContent(".mwho .on")).trim(), "이하늘", "오늘 쪽(주말) 근무자가 먼저 골라짐");
    await page.click(".mwho button:has-text('김민지')");
    await page.fill("#memo-wk", "토요일 단체 20명 — 열쇠 미리 빼 두기");
    await page.keyboard.press("Enter");
    await page.fill("#memo-we", "영수증 용지 주문 부탁");
    await page.click("[data-act=memoHand][data-dir='주말→평일']");
    assert.match(await page.textContent(".mhand.mine"), /토요일 단체 20명.*김민지 · 13:50.*확인함/s);
    await page.click("#sheet [data-act=close]");
    assert.strictEqual(await page.textContent("#memo-badge"), "전달 1", "오늘(주말) 받을 전달만 셈");
    // 받는 쪽이 [확인함] → 흐리게 · 배지 없어짐
    await page.click("[data-act=memo]");
    await page.click(".mwho button:has-text('이하늘')");
    await page.click(".mhand.mine [data-act=memoOk]");
    assert.match(await page.textContent(".mhand.mine .okd"), /✓ 이하늘 13:50 확인/);
    assert.ok(await page.isHidden("#memo-badge"));
    // 내 메모: 쓰고 Enter → 할 일 → ☐ → 완료 · 되돌리기
    await page.fill("#memo-new", "카페 냉장고 온도 확인");
    await page.keyboard.press("Enter");
    await page.fill("#memo-new", "키즈상담 톡 답장");
    await page.click("[data-act=memoAdd]");
    assert.match(await page.textContent("[data-act=memoTab][data-t=todo]"), /할 일 2/);
    await page.click(".mitem:has-text('카페 냉장고') [data-act=memoDone]");
    assert.match(await page.textContent("[data-act=memoTab][data-t=done]"), /완료 1/);
    await page.click("[data-act=memoTab][data-t=done]");
    assert.match(await page.textContent(".mlist"), /카페 냉장고 온도 확인.*13:50 해결/s);
    // 다른 사람 메모장은 따로
    await page.click(".mwho button:has-text('김민지')");
    assert.match(await page.textContent(".mlist"), /할 일이 없어요/);
    // 찾기: 전달 · 메모 모두 · 해결한 것도
    await page.fill("#memo-q", "냉장고");
    assert.match(await page.textContent("#memo-body"), /'냉장고' 1개.*카페 냉장고 온도 확인.*이하늘.*해결/s);
    await page.fill("#memo-q", "열쇠");
    assert.match(await page.textContent("#memo-body"), /전달 평일 → 주말.*김민지.*이하늘 13:50 확인/s);
    await page.fill("#memo-q", "");
    // 다시 켜도 그대로 (체험판 = 이 브라우저 · 앱 = staff-memo.json)
    await page.reload();
    await page.click("[data-act=memo]");
    assert.match(await page.textContent(".mhand:not(.mine)"), /영수증 용지 주문 부탁/);
    await page.click(".mwho button:has-text('이하늘')");
    assert.match(await page.textContent("[data-act=memoTab][data-t=done]"), /완료 1/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("근무자 메뉴얼: 맨 위 버튼 → 차례 8개 · 그림이 뜸 · 차례를 누르면 그 자리로", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(DESK);
    await page.click("[data-act=manual]");
    assert.match(await page.textContent("#sheet-title"), /근무자 메뉴얼/);
    assert.deepStrictEqual(await page.$$eval(".mannav button", (e) => e.map((x) => x.textContent)), ["① 화면 한눈에", "② 예약 손님 입장", "③ 현장 손님 입장", "④ 퇴장 · 열쇠 반납", "⑤ 마감 · 일괄 반납", "⑥ 주차등록", "⑦ 메모장", "⑧ 이럴 땐"]);
    await page.waitForFunction(() => [...document.querySelectorAll("#manual-body img")].every((i) => i.complete));
    const imgs = await page.$$eval("#manual-body img", (e) => e.map((i) => i.naturalWidth));
    assert.strictEqual(imgs.length, 7);
    assert.ok(imgs.every((w) => w > 200), `그림 ${imgs}`);
    assert.strictEqual(await page.$$eval("#man1 .mk", (e) => e.length), 9, "화면 번호 1~9");
    await page.click("[data-s=man4]");
    const top = await page.evaluate(() => document.getElementById("man4").getBoundingClientRect().top - document.getElementById("manual-body").getBoundingClientRect().top);
    assert.ok(Math.abs(top) < 10, `④ 가 맨 위로 ${top}`);
    assert.match(await page.textContent("#man4"), /\[n번 반납 · 퇴장\]/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
