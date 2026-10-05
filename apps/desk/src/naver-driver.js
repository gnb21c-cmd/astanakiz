/* 네이버 예약관리(스마트플레이스 파트너센터) 예약현황 화면을 읽고 조작하는 코드 (네이버 페이지 안에서 실행됨)
   지금은 사장님이 보낸 캡처를 본뜬 구조 기준 — 실제 저장본을 받으면 이 파일만 맞추면 된다.
   - 날짜: "2026. 10. 5. 월" 글자, 앞뒤 이동 버튼 ‹ ›
   - 표: 열 머리 = 상품 이름, 칸 = "오후 2:00" + "예약가능 n" · "확정 n" · "이용완료 n"
   - 칸의 확정/이용완료를 누르면 오른쪽에 예약자 카드 (예약자 · 전화번호 · 예약번호 · 상품 · 이용일시 · 수량 · 결제상태 · 이름 밑 "완료 n, 취소 n")
   - 카드의 [이용완료] → 확인 창 → 확인
   버튼·칸은 화면 좌표가 아니라 글자로 찾는다 (창이 가려져도 동작). */

function installNaverDriver() {
  if (window.__naver && window.__naver.v === 1) return true;

  const norm = (s) => String(s || "").replace(/\s+/g, "");
  const vis = (el) => !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
  const textOf = (e) => norm(e.value || e.textContent);
  const clickables = (root = document) => [...root.querySelectorAll("button, a, [role=button], [onclick], [role=tab]")].filter(vis);
  const press = (el) => {
    for (const type of ["mousedown", "mouseup", "click"]) el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  };
  const TIME = /^(오전|오후)\s*(\d{1,2}):(\d{2})$/;
  const to24 = (t) => {
    const m = String(t).trim().match(TIME);
    if (!m) return null;
    let h = +m[2];
    if (m[1] === "오후" && h < 12) h += 12;
    if (m[1] === "오전" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${m[3]}`;
  };
  const num = (re, s) => {
    const m = String(s).match(re);
    return m ? +m[1] : 0;
  };
  // 화면 위 날짜 "2026. 10. 5. 월" → "2026-10-05"
  const readDate = () => {
    const re = /(20\d\d)\.\s*(\d{1,2})\.\s*(\d{1,2})\./;
    const el = [...document.querySelectorAll("span, div, strong, button, h2, h3, p")].filter(vis).find((e) => e.children.length === 0 && re.test(e.textContent));
    if (!el) return null;
    const m = el.textContent.match(re);
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  };
  // 예약 칸: "오후 2:00" 글자와 "예약가능" 이 함께 든 가장 작은 상자
  const slotCells = () => {
    const out = [];
    for (const t of [...document.querySelectorAll("div, span, strong, p, td")].filter((e) => vis(e) && e.children.length === 0 && TIME.test(e.textContent.trim()))) {
      let box = t.parentElement;
      while (box && box !== document.body && !/예약가능/.test(box.textContent)) box = box.parentElement;
      if (!box || box === document.body || box.tagName === "TR" || box.tagName === "TBODY" || box.tagName === "TABLE") continue;
      const td = box.closest("td");
      let product = "";
      if (td) {
        const table = td.closest("table");
        const head = table && table.tHead ? table.tHead.rows[0] : null;
        if (head && head.cells[td.cellIndex]) product = head.cells[td.cellIndex].textContent.trim();
      }
      const txt = box.textContent;
      out.push({ el: box, product, time: to24(t.textContent), avail: num(/예약가능\s*(\d+)/, txt), conf: num(/확정\s*(\d+)/, txt), done: num(/이용완료\s*(\d+)/, txt) });
    }
    return out;
  };
  // 카드 안에서 "예약번호" 같은 이름 칸 옆의 값
  const valueIn = (card, label) => {
    const l = [...card.querySelectorAll("dt, th, span, div, em, strong")].find((e) => norm(e.textContent) === norm(label) && e.children.length === 0);
    if (!l) return "";
    const nx = l.nextElementSibling;
    return nx ? nx.textContent.trim().replace(/\s+/g, " ") : "";
  };
  // 카드 하나 = 예약번호를 딱 하나 가진 가장 큰 상자 (예약현황 표·탭은 들지 않음)
  const cards = () => {
    const one = (e) => (e.textContent.match(/예약번호/g) || []).length === 1 && /이용일시/.test(e.textContent) && !/예약가능/.test(e.textContent);
    const cand = [...document.querySelectorAll("div, li, article, section")].filter((e) => vis(e) && one(e));
    return cand.filter((e) => !(e.parentElement && one(e.parentElement)));
  };
  const readCard = (c) => {
    const txt = c.textContent;
    const sub = txt.match(/완료\s*(\d+)(?:\s*,\s*취소\s*(\d+))?/);
    const badge = [...c.querySelectorAll("span, em, strong, div")].find((e) => e.children.length === 0 && /^(확정|완료|취소|노쇼|신청)$/.test(e.textContent.trim()));
    const when = valueIn(c, "이용일시");
    const tm = when.match(/(오전|오후)\s*\d{1,2}:\d{2}/);
    return {
      no: valueIn(c, "예약번호"),
      name: valueIn(c, "예약자"),
      phone: valueIn(c, "전화번호"),
      product: valueIn(c, "상품"),
      when,
      time: tm ? to24(tm[0]) : null,
      qty: num(/(\d+)\s*$/, valueIn(c, "수량")) || 1,
      qtyText: valueIn(c, "수량"),
      pay: valueIn(c, "결제상태"),
      status: badge ? badge.textContent.trim() : "",
      doneCount: sub ? +sub[1] : 0,
      cancelCount: sub && sub[2] ? +sub[2] : 0,
      canComplete: clickables(c).some((b) => textOf(b) === "이용완료"),
    };
  };

  window.confirm = () => true;
  window.alert = () => {};

  window.__naver = {
    v: 1,
    read() {
      const date = readDate();
      const needLogin = !date && !!document.querySelector("input[type=password]");
      return {
        needLogin,
        date,
        slots: slotCells().map(({ el, ...s }) => s),
        cards: cards().map(readCard),
      };
    },
    /** 날짜 한 칸 이동: dir = -1 / 1 */
    stepDate(dir) {
      const want = dir < 0 ? ["‹", "<", "이전"] : ["›", ">", "다음"];
      const b = clickables().find((e) => want.includes(e.textContent.trim()) || want.some((w) => (e.getAttribute("aria-label") || "").includes(w)));
      if (!b) return { ok: false, why: "네이버 화면에서 날짜 이동 버튼을 못 찾음" };
      press(b);
      return { ok: true };
    },
    /** 칸 열기: kind = "확정" | "이용완료" */
    openSlot(product, time, kind) {
      const c = slotCells().find((s) => s.time === time && (!product || s.product === product));
      if (!c) return { ok: false, why: `네이버 화면에서 ${time} 칸을 못 찾음` };
      const chip = [...c.el.querySelectorAll("*")].find((e) => e.children.length === 0 && e.textContent.trim() === kind);
      press((chip && (chip.closest("[data-tab], button, a, div") || chip)) || c.el);
      return { ok: true };
    },
    /** 오른쪽 탭 바꾸기: "확정" | "완료" */
    openTab(kind) {
      const t = clickables().find((e) => new RegExp(`^${kind}\\d+$`).test(textOf(e)));
      if (!t) return { ok: false, why: `'${kind}' 탭을 못 찾음` };
      press(t);
      return { ok: true };
    },
    /** 예약번호 카드의 [이용완료] → 확인 창의 [확인] */
    complete(no) {
      const card = cards().find((c) => valueIn(c, "예약번호") === String(no));
      if (!card) return { ok: false, why: `예약번호 ${no} 카드를 못 찾음` };
      const b = clickables(card).find((e) => textOf(e) === "이용완료");
      if (!b) return { ok: false, why: "이용완료 버튼이 없음 (이미 완료됐거나 확정이 아님)" };
      b.click();
      const ok = clickables().find((e) => ["확인", "OK", "이용완료처리"].includes(textOf(e)) && /하시겠습니까/.test((e.closest("div, section, dialog") || {}).textContent || ""));
      if (ok) ok.click();
      return { ok: true };
    },
  };
  return true;
}

const NAVER_DRIVER_SOURCE = installNaverDriver.toString();

if (typeof module !== "undefined") module.exports = { NAVER_DRIVER_SOURCE, installNaverDriver };
