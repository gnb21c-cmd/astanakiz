/* V2.0 (사장님 10/21) — 새 디자인 · 시계로 운영 설정 · 열쇠 테두리 · 메모장 · 근무자 메뉴얼
   - 시계를 1.5초 안에 두 번 누르면 운영 설정 (버튼은 없앰) · 왼쪽 메뉴 7개 · 긴 설명은 [?]
   - 열쇠판: 띠지 · 글씨 없음 — 네이버 흰색 테두리 · 현장 파랑 테두리 · 서비스 흰 점선
   - 메모장(10/21 다시): 시간표 위 상자 = 근무자마다 + 관리자 · 숫자 = 완료 안 한 것 · 전달(받을 사람 고름 · 관리자는 모두) [접수] · [완료] · 지난 기록 · 전체 기록 · 찾기
   - 평일 [오늘 수량조절](10/21): 비수기 평일에 체크하면 그날만 수량 자동조절
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

test("메모 파일(2번 모양): 모르는 칸 · 틀린 값은 버림 · 길이 · 줄 수 제한(끝난 것부터) · 1번 모양(평일 ↔ 주말 전달)은 전달로 · 저장 · 깨지면 bak 에서", () => {
  const d = M.clean({
    v: 2, admin: " 사장님 ", pw: "x",
    staff: [{ id: "a1", name: " 김민지 ", grp: "주말" }, { id: "a1", name: "중복" }, { id: "BAD!", name: "x" }, { id: "admin", name: "관리자 흉내" }, { id: "b2", name: "가".repeat(40) }],
    notes: [{ id: "n1", who: "a1", text: "냉장고 확인", at: "2026-10-21 12:10", done: "2026-10-21 15:00" }, { id: "n2", who: "", text: "주인 없음" }],
    msgs: [
      { id: "m1", from: "admin", to: ["a1", "b2", "a1", "BAD!"], text: " 단체 20명 ", at: "2026-10-21 13:40", st: { a1: { ack: "2026-10-21 13:45", done: "" }, zz: { ack: "2026-10-21 13:45" } } },
      { id: "m2", from: "a1", to: [], text: "받는 사람 없음" }, { id: "m3", from: "a1", to: ["b2"], text: "  " }, { id: "m1", from: "a1", to: ["b2"], text: "같은 번호" },
      { id: "m4", from: "a1", to: ["b2"], text: "완료만 눌러도 접수", at: "2026-10-21 14:00", st: { b2: { done: "2026-10-21 14:10" } } },
    ],
  });
  assert.strictEqual(d.v, 2);
  assert.strictEqual(d.admin, "사장님");
  assert.deepStrictEqual(d.staff, [{ id: "a1", name: "김민지" }, { id: "b2", name: "가".repeat(M.NAME_MAX) }], "같은 번호 · 틀린 번호 · 관리자 번호는 근무자가 아님");
  assert.deepStrictEqual(d.notes, [{ id: "n1", who: "a1", text: "냉장고 확인", at: "2026-10-21 12:10", done: "2026-10-21 15:00" }]);
  assert.deepStrictEqual(d.msgs, [
    { id: "m1", from: "admin", to: ["a1", "b2"], text: "단체 20명", at: "2026-10-21 13:40", st: { a1: { ack: "2026-10-21 13:45", done: "" } } },
    { id: "m4", from: "a1", to: ["b2"], text: "완료만 눌러도 접수", at: "2026-10-21 14:00", st: { b2: { ack: "2026-10-21 14:10", done: "2026-10-21 14:10" } } },
  ]);
  assert.strictEqual(d.pw, undefined);
  assert.strictEqual(M.clean({ notes: [{ id: "n1", who: "a1", text: "가".repeat(999) }] }).notes[0].text.length, M.TEXT_MAX);
  assert.strictEqual(M.clean({}).admin, "관리자");
  // 넘치면 끝난 것부터 오래된 순으로 뺌
  const many = Array.from({ length: M.LIMIT.msgs + 2 }, (_, i) => ({ id: "m" + i, from: "a1", to: ["b2"], text: "t" + i, st: i === 5 || i === 9 ? { b2: { ack: "2026-10-21 10:00", done: "2026-10-21 10:00" } } : {} }));
  const kept = M.clean({ staff: [], msgs: many }).msgs.map((m) => m.id);
  assert.strictEqual(kept.length, M.LIMIT.msgs);
  assert.ok(!kept.includes("m5") && !kept.includes("m9") && kept.includes("m0"), "완료 안 된 전달은 남기고 끝난 것을 뺌");
  // 1번 모양 (V2.0 처음): 평일 ↔ 주말 전달 → 쓴 사람 빼고 모든 근무자에게 · 확인한 것은 접수 · 완료
  const old = M.clean({ v: 1, staff: [{ id: "a1", name: "민지", grp: "평일" }, { id: "b2", name: "하늘", grp: "주말" }, { id: "c3", name: "서준", grp: "주말" }],
    hand: [{ id: "h1", dir: "평일→주말", text: "단체", by: "a1", at: "2026-10-21 13:40", ok: "2026-10-21 16:27", okBy: "b2" }, { id: "h2", dir: "주말→평일", text: "용지", by: "", at: "2026-10-21 13:41", ok: "" }], notes: [] });
  assert.deepStrictEqual(old.msgs, [
    { id: "h1", from: "a1", to: ["b2", "c3"], text: "단체", at: "2026-10-21 13:40", st: { b2: { ack: "2026-10-21 16:27", done: "2026-10-21 16:27" }, c3: { ack: "2026-10-21 16:27", done: "2026-10-21 16:27" } } },
    { id: "h2", from: "", to: ["a1", "b2", "c3"], text: "용지", at: "2026-10-21 13:41", st: {} },
  ]);
  assert.deepStrictEqual(old.staff, [{ id: "a1", name: "민지" }, { id: "b2", name: "하늘" }, { id: "c3", name: "서준" }], "평일 / 주말 나눔은 안 씀");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sm-"));
  assert.deepStrictEqual(M.load(dir), M.empty());
  M.save(dir, d);
  assert.deepStrictEqual(M.load(dir), d);
  M.save(dir, M.clean({ ...d, notes: [] })); // 앞 파일 → bak
  fs.writeFileSync(path.join(dir, M.FILE), "{깨짐");
  assert.deepStrictEqual(M.load(dir), d, "깨지면 bak (바로 앞 저장) 에서");
  assert.ok(fs.readdirSync(dir).some((f) => f.startsWith("staff-memo.broken-")), "깨진 파일은 지우지 않고 옆에");
  fs.writeFileSync(path.join(dir, M.FILE), JSON.stringify({ v: 1, staff: [{ id: "a1", name: "민지" }], hand: [], notes: [] }));
  assert.deepStrictEqual(M.load(dir).staff, [{ id: "a1", name: "민지" }], "1번 모양 파일도 읽음");
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

test("메모장(사람마다 상자): 근무자 등록 → 상자 · 관리자는 모두에게 · 받을 사람 고르기 · [접수] · [완료] · 숫자 · 지난 기록 · 전체 기록 · 찾기 · 다시 켜도 그대로", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    page.on("dialog", (d) => d.accept());
    await page.clock.install({ time: new Date("2026-10-05T13:50:00") });
    await page.goto(DESK);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const boxes = () => page.$$eval(".mbox", (e) => e.map((x) => x.querySelector(".mname").textContent + (x.querySelector(".mcnt") ? `(${x.querySelector(".mcnt").textContent}${x.querySelector(".mcnt.new") ? "새" : ""})` : "")));
    assert.deepStrictEqual(await boxes(), ["관리자"], "근무자가 없으면 관리자 상자만");
    const pos = await page.evaluate(() => { const b = document.getElementById("memo-boxes").getBoundingClientRect(), p = document.querySelector(".leftcol .panel").getBoundingClientRect(); return b.bottom <= p.top && Math.abs(b.left - p.left) < 2; });
    assert.ok(pos, "상자 = 시간표 위");
    // 운영 설정 → 근무자 등록: 이름 · 별칭 · 성 → 상자가 늘어남
    await page.dblclick("#now");
    await page.click("[data-t=staff]");
    for (const n of ["민지", "서준", "하늘"]) { await page.click("[data-act=staffAdd]"); await page.keyboard.type(n); }
    await page.fill("#memo-admin", "사장님");
    await page.clock.runFor(700);
    assert.match(await page.textContent("#sheet .setnav [data-t=staff]"), /3명 \+ 관리자/);
    await page.click("#sheet [data-act=close]");
    assert.deepStrictEqual(await boxes(), ["민지", "서준", "하늘", "사장님"], "근무자마다 하나 + 관리자");
    // 관리자: 처음부터 모든 근무자에게 → 쓰고 Enter
    await page.click(".mbox.adm");
    assert.deepStrictEqual(await page.$$eval(".mto button.on", (e) => e.map((x) => x.textContent)), ["모두", "민지", "서준", "하늘"]);
    await page.fill("#memo-msg", "토요일 단체 20명 — 열쇠 미리 빼 두기");
    await page.keyboard.press("Enter");
    assert.match(await page.textContent(".mitem.sent"), /토요일 단체 20명.*민지 아직.*서준 아직.*하늘 아직/s);
    await page.click("#sheet [data-act=close]");
    assert.deepStrictEqual(await boxes(), ["민지(1새)", "서준(1새)", "하늘(1새)", "사장님"], "쓴 것이 없어도 받은 전달 수 · 새 전달은 칠함");
    // 민지: 내 메모 · 하늘에게만 전달 · 관리자 전달 [접수]
    await page.click(".mbox:has-text('민지')");
    await page.fill("#memo-new", "카페 냉장고 온도 확인");
    await page.keyboard.press("Enter");
    await page.click("[data-act=memoSend]");
    assert.match(await page.textContent("#toast"), /받을 사람을 먼저 골라 주세요/);
    await page.click(".mto button:has-text('하늘')");
    await page.fill("#memo-msg", "영수증 용지 주문 부탁");
    await page.keyboard.press("Enter");
    await page.click(".mitem.fresh [data-act=memoAck]");
    assert.match(await page.textContent("#memo-body"), /토요일 단체 20명.*사장님 → 3명 · 13:50 · 13:50 접수/s);
    assert.match(await page.textContent("[data-act=memoTab][data-t=now]"), /지금 2/);
    await page.click("#sheet [data-act=close]");
    assert.deepStrictEqual(await boxes(), ["민지(2)", "서준(1새)", "하늘(2새)", "사장님"], "접수하면 칠하지 않음 · 완료 전까지 셈");
    // 하늘: 받은 전달 둘 다 [완료] (알리기만 한 것은 바로) → 숫자 없어짐 · 지난 기록
    await page.click(".mbox:has-text('하늘')");
    while (await page.$(".mitem [data-act=memoFin]")) await page.click(".mitem [data-act=memoFin] >> nth=0");
    await page.click("[data-act=memoTab][data-t=past]");
    assert.match(await page.textContent("#memo-body"), /영수증 용지 주문 부탁.*받은 전달 · 민지.*13:50 완료/s);
    await page.click("#sheet [data-act=close]");
    assert.deepStrictEqual(await boxes(), ["민지(2)", "서준(1새)", "하늘", "사장님"]);
    // 보낸 사람이 봄: 민지가 보낸 전달은 하늘 완료 → 지난 기록 · 관리자 보낸 전달은 사람마다
    await page.click(".mbox.adm");
    assert.match(await page.textContent(".mitem.sent"), /민지 접수.*서준 아직.*하늘 완료/s);
    // 전체 전달 기록 (모두 같이 봄)
    await page.click("[data-act=memoTab][data-t=all]");
    assert.match(await page.textContent("#memo-body"), /영수증 용지 주문 부탁.*민지 → 하늘.*하늘 완료.*토요일 단체 20명.*사장님 → 민지, 서준, 하늘/s);
    await page.click("#sheet [data-act=close]");
    // 민지: 내 메모 완료 → 지난 기록 → 되돌리기 · 찾기
    await page.click(".mbox:has-text('민지')");
    await page.click(".mitem:has-text('카페 냉장고') [data-act=memoDone]");
    await page.click("[data-act=memoTab][data-t=past]");
    assert.match(await page.textContent("#memo-body"), /카페 냉장고 온도 확인.*내 메모 · 13:50 씀 · 13:50 완료/s);
    await page.fill("#memo-q", "냉장고");
    assert.match(await page.textContent("#memo-body"), /'냉장고' 1개.*카페 냉장고 온도 확인.*내 메모/s);
    await page.fill("#memo-q", "영수증");
    assert.match(await page.textContent("#memo-body"), /'영수증' 1개.*전달 민지 → 하늘.*하늘 완료/s);
    await page.fill("#memo-q", "");
    await page.click("[data-act=memoUndo]");
    await page.click("#sheet [data-act=close]");
    assert.deepStrictEqual(await boxes(), ["민지(2)", "서준(1새)", "하늘", "사장님"], "되돌리면 다시 셈");
    // 다시 켜도 그대로 (체험판 = 이 브라우저 · 앱 = staff-memo.json)
    await page.reload();
    assert.deepStrictEqual(await boxes(), ["민지(2)", "서준(1새)", "하늘", "사장님"]);
    // 근무자를 더하면 상자가 하나 늘어남
    await page.dblclick("#now");
    await page.click("[data-t=staff]");
    await page.click("[data-act=staffAdd]");
    await page.keyboard.type("주말2");
    await page.clock.runFor(700);
    await page.click("#sheet [data-act=close]");
    assert.deepStrictEqual(await boxes(), ["민지(2)", "서준(1새)", "하늘", "주말2", "사장님"]);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("평일 [오늘 수량조절]: 비수기 평일에 체크하면 그날만 네이버 판매 수량 자동조절 · 다음 날은 다시 꺼짐 · 시간제인 날은 저절로(잠김) · 자동조절을 끄면 못 누름", async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const open = async (day) => {
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errs.push(e.message));
      await page.addInitScript((d) => { window.__today = d; }, day);
      await page.goto(DESK);
      return page;
    };
    const errs = [];
    const state = (page) => page.evaluate(() => { const cb = document.getElementById("capforce-on"); const p = window.__deskTest.capPlan(); return { checked: cb.checked, disabled: cb.disabled, skip: p.skip || "", refresh: document.getElementById("refresh-at").textContent }; });
    let page = await open("2026-10-06"); // 화요일 · 비수기 평일 (무제한)
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // 관리자가 자동조절을 꺼 두면 못 누름
    assert.deepStrictEqual(await state(page).then((s) => [s.checked, s.disabled]), [false, true]);
    const pos = await page.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); return { afterDrawer: r("#capforce").left >= r("[data-act=drawer]").right, beforeCurtain: r("#capforce").right <= r(".curtain-tab").left }; });
    assert.deepStrictEqual(pos, { afterDrawer: true, beforeCurtain: true }, "환전 오픈 오른쪽 · 커튼 손잡이에 안 가림");
    await page.dblclick("#now"); await page.click("[data-t=naver]"); await page.check("#cap-on");
    await page.click("#sheet [data-act=close]");
    let s = await state(page);
    assert.deepStrictEqual([s.checked, s.disabled], [false, false]);
    assert.match(s.skip, /비수기 평일\(무제한\)이라 조절하지 않아요 — 사람이 몰리면 맨 위 \[오늘 수량조절\]을 체크/);
    assert.ok(!/수량조절/.test(s.refresh), "꺼진 평일은 새로고침 줄에 수량조절 없음");
    // 체크 → 그날만 시간제 날과 같은 계획 (손님은 그대로 무제한 · 계획은 1시간 50분 머문다고 봄)
    await page.check("#capforce-on");
    assert.match(await page.textContent("#toast"), /오늘만 네이버 판매 수량 자동조절 — 10분마다 .*손님 이용은 그대로 무제한 · 내일은 다시 꺼져요/);
    const p = await page.evaluate(() => { const p = window.__deskTest.capPlan(); return { skip: p.skip || "", slots: p.slots.map((x) => x.t), worst: p.plan.map((c) => c.worst), present: window.__deskTest.capPresent().map((x) => x.to) }; });
    assert.strictEqual(p.skip, "");
    assert.ok(p.slots.length && p.slots.every((t) => t < 18 * 60), "18:00 전 타임만");
    assert.ok(p.present.length && p.present.every(Number.isFinite), "안에 있는 무제한 손님도 끝이 있다고 봄 (계속 있으면 10분마다 다시)");
    assert.ok(p.worst.every((w) => Number.isFinite(w) && w <= 43), `상한 43 안 ${p.worst}`);
    await page.waitForFunction(() => /네이버 판매 수량 조절/.test(document.getElementById("toast").textContent), null, { timeout: 5000 }); // 10분마다 도는 것이 바로 한 번
    assert.match((await state(page)).refresh, /수량조절 \d\d:\d\d/);
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("astanakiz-capauto")).forceDay), "2026-10-06", "그날 날짜로 저장 (다시 켜도 그날은 그대로)");
    await page.reload();
    assert.strictEqual((await state(page)).checked, true);
    await page.close();
    // 다음 날(수요일)은 다시 꺼진 상태
    page = await open("2026-10-07");
    s = await state(page);
    assert.deepStrictEqual([s.checked, s.disabled], [false, false]);
    assert.match(s.skip, /비수기 평일/);
    await page.close();
    // 시간제인 날(토요일)은 저절로 — 체크 · 잠김
    page = await open("2026-10-10");
    s = await state(page);
    assert.deepStrictEqual([s.checked, s.disabled, s.skip], [true, true, ""]);
    assert.match(await page.getAttribute("#capforce", "title"), /시간제인 날.*저절로/);
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
