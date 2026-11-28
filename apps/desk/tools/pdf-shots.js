/* 인쇄용 직원 메뉴얼 (2.41~) — 체험판 화면을 찍어 docs/manual/img/*.png 로 남기고 docs/manual/manual.html 을 A4 PDF(staff-manual.pdf)로
   쓰는 법: apps/desk 에서  node tools/pdf-shots.js 2.41        (버전 = 사진 왼쪽 위 'ver.n' · 표지와 맞춤)
            ONLY=01,02 node tools/pdf-shots.js 2.41             (그 번호 사진만 다시 · PDF 는 늘 다시)
            PDF_ONLY=1 node tools/pdf-shots.js                   (사진은 그대로 · PDF 만)
   - 화면이 바뀌면 바뀐 사진만 다시 찍고 PDF 를 다시 만든다 (astanakiz CLAUDE.md) · 체험판 예시 손님만 나옴 (실제 손님 정보 없음)
   - 13(반납안내 커튼 그림)만 예전 사진 그대로 — 나머지는 모두 여기서 찍음 (27 = 예약 없는 손님 등록 창 · 2.43) */
const path = require("path");
const fs = require("fs");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  ({ chromium } = require("/opt/node-tools/node_modules/playwright"));
}

const ROOT = path.join(__dirname, "..", "..", "..");
const IMG = path.join(ROOT, "docs", "manual", "img");
const DESK = "file://" + path.join(ROOT, "prototype", "desk.html");
const MANUAL = "file://" + path.join(ROOT, "docs", "manual", "manual.html");
const VER = process.argv[2] || "";
const ONLY = (process.env.ONLY || "").split(",").map((x) => x.trim()).filter(Boolean);
const want = (name) => !process.env.PDF_ONLY && (!ONLY.length || ONLY.some((x) => name.startsWith(x)));
const EVENT = { ver: 2, on: true, from: "2026-09-10", to: "2026-11-30", days: 20, gift: "수제돈까스" };

const quiet = (page) => page.evaluate(() => { const t = document.getElementById("toast"); if (t) t.hidden = true; });
async function shot(page, name) {
  if (!want(name)) return;
  await page.waitForTimeout(250);
  await quiet(page);
  await page.screenshot({ path: path.join(IMG, name) });
  console.log("사진", name);
}
/** 앱처럼: 체험판 시간 버튼 숨김 · 버전 · 메모 상자 (근무자 3명 + 관리자 전달 · 메모) */
async function prep(page) {
  await page.evaluate((v) => {
    document.querySelectorAll("[data-act=time]").forEach((x) => (x.hidden = true));
    const t = document.querySelector(".top .tag"); if (t && v) t.textContent = "ver." + v;
  }, VER);
  await page.dblclick("#now");
  await page.click("[data-t=staff]");
  for (const n of ["민지", "서준", "하늘"]) { await page.click("[data-act=staffAdd]"); await page.keyboard.type(n); }
  await page.waitForTimeout(700);
  await page.click("[data-act=close]");
  await page.click(".mbox.adm");
  await page.fill("#memo-msg", "토요일 10:00 어린이집 단체 20명 — 열쇠 미리 빼 두기");
  await page.click("[data-act=memoSend]");
  await page.click("[data-act=close]");
  await page.click(".mbox >> nth=0");
  await page.click(".mto button:has-text('하늘')");
  await page.fill("#memo-msg", "영수증 용지 1롤 남음 — 월요일에 주문 부탁");
  await page.click("[data-act=memoSend]");
  for (const t of ["카페 냉장고 온도 확인 (오후 3시)", "환불 문의 손님 — 사장님께 전달"]) { await page.fill("#memo-new", t); await page.click("[data-act=memoAdd]"); }
  await page.click("[data-act=close]");
  await quiet(page);
}
async function newDesk(browser, init) {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, colorScheme: "dark" });
  if (init) await ctx.addInitScript(init.fn, init.arg);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("dialog", (d) => d.accept());
  page.errs = errs;
  await page.goto(DESK);
  await page.waitForTimeout(500);
  return page;
}
const setTab = async (page, t) => { await page.click(`[data-t=${t}]`); await page.waitForTimeout(300); };

(async () => {
  fs.mkdirSync(IMG, { recursive: true });
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  try {
    if (!process.env.PDF_ONLY) {
      // ── 현장 POS (체험판) ──
      const page = await newDesk(browser);
      await prep(page);
      await shot(page, "01-main.png");
      // 3장 · 네이버가 이름 · 번호를 가린 손님 (11/26~): 입장 창 가운데 4자리 칸 (지어낸 손님)
      const mid = await page.evaluate(() => { const T = window.__deskTest; return T.addBooking(T.today(), "14:00", "은*인", "***-****-1252", 1, { prevDone: 2 }); });
      await page.click('.slot[data-s="840"]');
      await page.click(`.res[data-id="${mid}"]`);
      await page.click(".kpick button:not([disabled]) >> nth=0");
      await shot(page, "02-enter.png");
      await page.keyboard.press("Escape");
      // 5장 · 현장입장 (빈 열쇠)
      await page.click(".key[data-k='5']");
      await shot(page, "07-walkin.png");
      await page.keyboard.press("Escape");
      // 4장 · 연속예약 (14:30 나연속 ★2타임) · 6장 열쇠 창 · 7장 주차 · 서비스 키
      await page.click('.slot[data-s="870"]');
      await shot(page, "03-chain.png");
      await page.click('.res:has-text("나연속")');
      await shot(page, "04-chain-enter.png");
      await page.keyboard.press("Escape");
      await page.click(".key[data-k='1']");
      await shot(page, "05-key-over.png");
      await page.keyboard.press("Escape");
      await page.click(".key[data-k='6']");
      await shot(page, "06-key.png");
      await page.click("#sheet [data-act=svcPick]");
      await shot(page, "19-svc-key.png");
      await page.keyboard.press("Escape");
      await page.click(".key[data-k='32']");
      await page.click("#sheet [data-act=svcWalk]");
      await page.fill("#w-svcname", "홍길동 매니저");
      await shot(page, "20-svc-walk.png");
      await page.keyboard.press("Escape");
      await page.click("#bulk-btn");
      await shot(page, "12-bulk.png");
      await page.keyboard.press("Escape");
      await page.click(".mbox >> nth=0");
      await shot(page, "21-memo.png");
      await page.click("[data-act=close]");
      // 3장 · 예약 없는 손님 (2.43 — 네이버 예약은 취소 · 수수료) 등록 창: 하나 등록해 두고 다음 손님을 적는 중 (지어낸 손님)
      if (want("27-man.png")) {
        const reg = async (o, save) => {
          await page.click("[data-act=manOpen]");
          await page.selectOption("#man-slot", String(o.slot));
          await page.fill("#man-name", o.name); await page.fill("#man-phone", o.phone);
          await page.selectOption("#man-qty", String(o.qty)); await page.fill("#man-note", o.note);
          if (save) await page.click("[data-act=manSave]");
        };
        await reg({ slot: 960, name: "윤하람", phone: "01080801212", qty: 1, note: "2장 중 1장 수수료 취소" }, true);
        await reg({ slot: 900, name: "구본희", phone: "01024681357", qty: 2, note: "4장 중 2장 수수료 취소" }, false);
        await shot(page, "27-man.png");
        await page.click("[data-act=close]");
      }
      if (want("08-park.png")) {
        await page.fill("#car-q", "5514");
        await page.press("#car-q", "Enter");
        await page.waitForSelector("#cars [data-act=car]", { timeout: 15000 });
        await page.click("#cars [data-act=car] >> nth=0");
        await page.waitForSelector("#pcar [data-act=discount]", { timeout: 15000 });
        await page.click("#pcar [data-act=discount] >> nth=0");
        await page.waitForTimeout(150);
        await page.screenshot({ path: path.join(IMG, "08-park.png") });
        console.log("사진", "08-park.png");
      }
      // 12장 · 화면 안 근무자 메뉴얼
      await page.click("[data-act=manual]");
      await shot(page, "22-manual.png");
      await page.keyboard.press("Escape");
      // 운영 설정
      await page.dblclick("#now");
      await page.waitForTimeout(300);
      for (const [t, name] of [["season", "09-set-rules.png"], ["printer", "10-set-printer.png"], ["api", "11-set-link.png"], ["naver", "14-cap.png"], ["staff", "23-set-staff.png"], ["prints", "24-set-forms.png"]]) {
        await setTab(page, t);
        await shot(page, name);
      }
      // 11장 · 고객 세부 관리 → 고객 데이터베이스 (현장 POS 가 모은 손님 · 이름 '홍*동' 모양 · 뒷 4자리)
      await setTab(page, "cust");
      await page.click('[data-act=csub][data-s="db"]');
      await page.waitForTimeout(300);
      await shot(page, "25-set-db.png");
      await page.click("[data-act=close]");
      // 2.41 · 사무실 PC 에 보낼 현장 POS 화면 (사무실 PC 사진용)
      const snap0 = JSON.parse(await page.evaluate(() => JSON.stringify(window.__deskTest.sync.snap())));
      snap0.nm = { st: "보임", at: "13:50" }; // 맨 위 '개인정보 보임' 칩 (현장 POS 네이버 상태 그대로 보임)
      const snap = JSON.stringify(snap0);
      const memo = await page.evaluate(() => localStorage.getItem("astanakiz-staffmemo")); // 메모장도 두 PC 가 같이 (사무실 사진에 메모 상자)
      if (page.errs.length) console.log("오류(현장)", page.errs);

      // ── 재방문 이벤트 진행 중 (8장 사진) ──
      if (want("15-event.png")) {
        const ev = await newDesk(browser, { fn: (e) => { if (!sessionStorage.getItem("once")) { sessionStorage.setItem("once", "1"); localStorage.setItem("astanakiz-visitevent", JSON.stringify(e)); } }, arg: EVENT });
        await prep(ev);
        await ev.dblclick("#now");
        await setTab(ev, "event");
        await shot(ev, "15-event.png");
        if (ev.errs.length) console.log("오류(이벤트)", ev.errs);
      }

      // ── 사무실 PC (11장 · 2.41 — 네이버를 읽지 않고 현장 POS 화면을 받아 그대로) ──
      if (want("26-office.png")) {
        const st = { ready: true, why: "", getWhy: "", putWhy: "", peer: { build: VER || "2.41", at: "2026-10-05 13:50:02", seen: Date.now(), active: true }, lastGet: 1, lastPut: 1 };
        const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, colorScheme: "dark" });
        await ctx.addInitScript(([s, m]) => {
          window.desk = {
            memo: { get: async () => ({ ok: true, memo: m ? JSON.parse(m) : null }), set: async () => ({ ok: true }) },
            naver: { load: async () => ({ ok: false, why: "사무실 PC 는 네이버를 쓰지 않아요" }), complete: async () => ({ ok: false }) },
            state: { load: () => null, save: () => {} },
            config: { get: async () => ({ build: "" }), set: async () => ({ ok: true }) },
            sync: { role: () => "office", get: async () => ({ role: "office", runRole: "office", build: "", hasKey: true, status: s }), set: async () => ({ ok: true }), relaunch: () => {}, snap: () => {}, on: () => {} },
          };
        }, [st, memo]);
        const off = await ctx.newPage();
        const errs = [];
        off.on("pageerror", (e) => errs.push(e.message));
        await off.clock.install({ time: new Date("2026-10-05T13:50:20") });
        await off.goto(DESK);
        await off.clock.runFor(1500);
        await off.evaluate(([s, v]) => {
          document.querySelectorAll("[data-act=time]").forEach((x) => (x.hidden = true));
          const t = document.querySelector(".top .tag"); if (t && v) t.textContent = "ver." + v;
          window.__deskTest.sync.apply(JSON.parse(s), "2026-10-05 13:50:12");
        }, [snap, VER]);
        await off.clock.runFor(1500);
        await off.click('.slot[data-s="840"]');
        await shot(off, "26-office.png");
        if (errs.length) console.log("오류(사무실)", errs);
      }
    }
    // ── PDF ──
    const pdfPage = await browser.newPage();
    await pdfPage.goto(MANUAL);
    await pdfPage.waitForTimeout(800);
    const out = path.join(ROOT, "docs", "manual", "staff-manual.pdf");
    await pdfPage.pdf({ path: out, format: "A4", printBackground: true, preferCSSPageSize: true });
    console.log("PDF", out, fs.statSync(out).size);
  } finally {
    await browser.close();
  }
})();
