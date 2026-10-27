/* 근무자 메뉴얼 그림 (V2.0) — 체험판 화면을 찍어 prototype/manual/*.jpg 로 남김
   쓰는 법: apps/desk 에서  node tools/manual-shots.js
   - 데스크 화면이 바뀌면 다시 찍기 · 그림 1번의 번호 자리(MARKS)는 찍을 때 나온 값으로 desk.html MANUAL_MARKS 를 맞춤
   - 체험판 예시 손님만 나옴 (실제 손님 정보 없음) */
const path = require("path");
const fs = require("fs");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  ({ chromium } = require("/opt/node-tools/node_modules/playwright"));
}

const ROOT = path.join(__dirname, "..", "..", "..");
const OUT = path.join(ROOT, "prototype", "manual");
const URL = "file://" + path.join(ROOT, "prototype", "desk.html");
const shot = (loc, name) => loc.screenshot({ path: path.join(OUT, name), type: "jpeg", quality: 82 });

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await b.newPage({ viewport: { width: 1024, height: 768 }, colorScheme: "dark" });
  page.on("dialog", (d) => d.dismiss());
  await page.goto(URL);
  await page.waitForTimeout(500);
  // 앱처럼: 체험판 시간 버튼 숨김 · 버전 표시
  await page.evaluate(() => {
    document.querySelectorAll("[data-act=time]").forEach((x) => (x.hidden = true));
    const t = document.querySelector(".top .tag"); if (t) t.textContent = "ver.2.9";
  });
  // 메모 상자: 예시 근무자 3명 + 관리자 전달 · 메모 (상자 숫자가 보이게)
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
  await page.click(".mitem.fresh [data-act=memoAck]");
  await page.waitForTimeout(250);
  await page.evaluate(() => { const t = document.getElementById("toast"); if (t) t.hidden = true; });
  await shot(page.locator("#sheet"), "m7-memo.jpg");
  await page.click("[data-act=close]");
  await page.evaluate(() => { const t = document.getElementById("toast"); if (t) t.hidden = true; });
  // 1. 전체 화면 + 번호 자리 (% · 왼쪽 위)
  await shot(page, "m1-main.jpg");
  const marks = await page.evaluate(() => {
    const at = (sel, dx = 0, dy = 0) => { const r = document.querySelector(sel).getBoundingClientRect(); return [Math.round(((r.left + dx) / 1024) * 1000) / 10, Math.round(((r.top + dy) / 768) * 1000) / 10]; };
    return [at("[data-act=posGo]", -6, -4), at(".curtain-tab", -10, 0), at("#memo-boxes", -6, -6), at(".leftcol .panel", -6, 4), at(".midcol .panel", -6, 4), at("#keys", -8, -8), at(".keyfoot", -8, -6), at(".park", -8, -4), at(".top .rgrp", -10, -4)];
  });
  console.log("MANUAL_MARKS", JSON.stringify(marks));
  // 2. 예약 손님 입장
  await page.click("#res article.res >> nth=0");
  await page.waitForTimeout(250);
  await shot(page.locator("#sheet"), "m2-enter.jpg");
  await page.keyboard.press("Escape");
  // 3. 현장 손님 입장 (빈 열쇠)
  await page.click(".key[data-k='5']");
  await page.waitForTimeout(250);
  await shot(page.locator("#sheet"), "m3-walk.jpg");
  await page.keyboard.press("Escape");
  // 4. 반납 (초과 열쇠)
  await page.click(".key[data-k='17']");
  await page.waitForTimeout(250);
  await shot(page.locator("#sheet"), "m4-key.jpg");
  await page.keyboard.press("Escape");
  // 5. 일괄 반납
  await page.click("#bulk-btn");
  await page.waitForTimeout(250);
  await shot(page.locator("#sheet"), "m5-bulk.jpg");
  await page.keyboard.press("Escape");
  // 6. 주차등록
  await shot(page.locator(".park"), "m6-park.jpg");
  await b.close();
  for (const f of fs.readdirSync(OUT)) console.log(f, fs.statSync(path.join(OUT, f)).size);
})();
