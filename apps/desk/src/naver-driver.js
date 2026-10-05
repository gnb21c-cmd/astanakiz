/* 네이버 예약관리(스마트플레이스 파트너센터)를 읽고 조작하는 코드 (네이버 페이지 안에서 실행됨)
   실제 화면(2026-10-05 저장본) 기준:
   - 예약 목록 booking-list-view: 날짜 "이전 26. 10. 5.월 다음"
       줄마다 a[class*=contents-user](상태·예약자·전화번호·예약번호) + a[class*=contents-booking](이용일시·상품·수량·결제상태), data-tst_click_link = 예약번호
   - 예약현황 booking-calendar-view: 날짜 "이전 2026. 10. 5. 월 다음"
       머리(Calendar__inner-header) = 상품 이름, 줄(Calendar__week-cell-daily-row) = 시간, 칸 = "오전"+"10:00" + 버튼(title 예약가능/잔여예약/확정/이용완료, span.number)
       확정·이용완료 버튼 → 오른쪽 "예약정보": 탭(BookingListTab) 확정 n / 완료 n, 카드(List__contents-box): 이름 밑 "완료 11, 취소 2", Summary__item-title/dsc 쌍
   - 클래스 이름 뒤의 해시(__VGAjs 등)는 네이버가 바꿀 수 있어 [class*="앞부분"] 으로 찾는다
   - 칸이 좁으면 시각에 오전·오후가 빠짐 → 영업시간(10:00~19:30)으로 봄: 1:00 = 13:00 (다른 세션의 실제 수집에서 확인)
   - 오른쪽 예약정보 목록은 스크롤되는 칸이고 내려야 카드가 더 나옴 → scrollCards 로 끝까지
   - 칸을 누르면 표가 새로 그려짐 → 다른 칸을 누르기 전에 열린 목록을 닫음(closePanel)
   - 이용완료 확인 창 모양은 아직 모름: window.confirm 이면 자동 확인, 화면 안 창이면 "하시겠습니까" 글자 옆 [확인] */

function installNaverDriver() {
  if (window.__naver && window.__naver.v === 3) return true;

  const norm = (s) => String(s || "").replace(/\s+/g, "");
  const vis = (el) => !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
  const textOf = (e) => norm(e.value || e.textContent);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const clickables = (root = document) => $$("button, a, [role=button], [role=tab]", root).filter(vis);
  const press = (el) => {
    for (const type of ["mousedown", "mouseup", "click"]) el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  };
  const to24 = (s) => {
    const m = String(s).replace(/\s+/g, "").match(/(오전|오후)?(\d{1,2}):(\d{2})/);
    if (!m) return null;
    let h = +m[2];
    if (m[1] === "오후" && h < 12) h += 12;
    if (m[1] === "오전" && h === 12) h = 0;
    if (!m[1] && h >= 1 && h <= 9) h += 12; // 오전·오후가 없으면 영업시간으로 (1:00 = 13:00)
    return `${String(h).padStart(2, "0")}:${m[3]}`;
  };
  const txt = (el) => (el ? el.textContent.trim().replace(/\s+/g, " ") : "");
  const cls = (root, part) => root.querySelector(`[class*="${part}"]`);

  // 날짜: "이전" 버튼 옆의 날짜 글자 ("2026. 10. 5. 월" 또는 "26. 10. 5.월")
  const prevBtn = () => clickables().find((b) => textOf(b).startsWith("이전") || (b.getAttribute("aria-label") || "").includes("이전"));
  const nextBtn = () => clickables().find((b) => textOf(b).startsWith("다음") || (b.getAttribute("aria-label") || "").includes("다음"));
  const readDate = () => {
    const b = prevBtn();
    let box = b && b.parentElement;
    for (let i = 0; i < 3 && box; i++, box = box.parentElement) {
      const m = box.textContent.match(/(\d{2,4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./);
      if (m) return `${m[1].length === 2 ? "20" + m[1] : m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    }
    return null;
  };

  // 예약 목록
  const readList = () => {
    const booking = new Map($$('a[class*="contents-booking"]').map((a) => [a.getAttribute("data-tst_click_link"), a]));
    // 같은 줄이 고정 칸용으로 빈 복사본이 더 있음 → 내용 있는 줄만, 예약번호로 한 번씩
    const seen = new Set();
    return $$('a[class*="contents-user"]').filter((u) => {
      const no = u.getAttribute("data-tst_click_link");
      if (!u.children.length || !no || seen.has(no)) return false;
      seen.add(no);
      return true;
    }).map((u) => {
      const no = u.getAttribute("data-tst_click_link") || txt(cls(u, "book-number"));
      const b = booking.get(no) || u;
      const opt = cls(b, "BookingListView__option");
      const qtyEl = opt && opt.querySelector(".text-info");
      const host = cls(b, "BookingListView__host");
      return {
        no,
        status: txt(cls(u, "BookingListView__state")),
        name: (cls(u, "BookingListView__name") || {}).title || txt(cls(u, "BookingListView__name")),
        phone: txt(cls(u, "BookingListView__phone")),
        time: to24(txt(cls(b, "BookingListView__book-date"))),
        product: (host && (host.getAttribute("title") || txt(host))) || "",
        qty: qtyEl ? +txt(qtyEl) || 1 : 1,
        qtyText: opt ? txt(opt) : "",
        pay: txt(cls(b, "payment-state")),
      };
    });
  };

  // 예약현황 머리의 상품 이름 (맨 앞 '회차' 이름 칸은 뺌)
  const productHeads = () => {
    const header = cls(document, "Calendar__inner-header");
    return header ? $$('[class*="Calendar__week-cell"]', header).filter((c) => !/week-label/.test(c.className)).map((c) => txt(c)) : [];
  };
  // 예약현황 칸
  const readSlots = () => {
    const products = productHeads();
    const out = [];
    for (const row of $$('[class*="Calendar__week-cell-daily-row"]')) {
      const cells = [...row.children].filter((c) => /Calendar__week-cell/.test(c.className));
      cells.forEach((c, i) => {
        const tEl = c.querySelector(".time");
        if (!tEl) return;
        const ap = c.querySelector(".text");
        const n = (title) => {
          const b = c.querySelector(`button[title="${title}"]`);
          return b ? +txt(b.querySelector(".number")) || 0 : 0;
        };
        out.push({ product: products[i] || "", time: to24((ap ? txt(ap) : "") + txt(tEl)), avail: n("예약가능") + n("잔여예약"), conf: n("확정"), done: n("이용완료"), apply: n("신청") });
      });
    }
    return out;
  };
  const findSlotCell = (product, time) => {
    const products = productHeads();
    for (const row of $$('[class*="Calendar__week-cell-daily-row"]')) {
      const cells = [...row.children].filter((c) => /Calendar__week-cell/.test(c.className));
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        const tEl = c.querySelector(".time");
        if (!tEl) continue;
        const ap = c.querySelector(".text");
        if (to24((ap ? txt(ap) : "") + txt(tEl)) === time && (!product || products[i] === product)) return c;
      }
    }
    return null;
  };

  // 예약정보 카드
  const cards = () => $$('[class*="List__contents-box"]').filter(vis);
  const field = (card, label) => {
    const t = $$('[class*="Summary__item-title"]', card).find((e) => norm(e.textContent) === norm(label));
    return t && t.nextElementSibling ? txt(t.nextElementSibling).replace(/,\s*$/, "") : "";
  };
  const readCard = (c) => {
    const sub = txt(c.querySelector(".text-info-sub")).match(/완료\s*(\d+)(?:\s*,\s*취소\s*(\d+))?/);
    const badge = c.querySelector("[data-tst_booking_status]") || cls(c, "Summary__user-state");
    const when = field(c, "이용일시");
    const qtyEl = (() => {
      const t = $$('[class*="Summary__item-title"]', c).find((e) => norm(e.textContent) === "수량");
      return t && t.nextElementSibling ? t.nextElementSibling.querySelector(".text-info") : null;
    })();
    return {
      no: field(c, "예약번호"),
      name: field(c, "예약자") || txt(cls(c, "Summary__name")),
      phone: field(c, "전화번호"),
      product: field(c, "상품"),
      when,
      time: to24(when.replace(/^.*\)\s*/, "")),
      qty: qtyEl ? +txt(qtyEl) || 1 : 1,
      pay: field(c, "결제상태"),
      status: txt(badge),
      doneCount: sub ? +sub[1] : 0,
      cancelCount: sub && sub[2] ? +sub[2] : 0,
      canComplete: clickables(c).some((b) => textOf(b) === "이용완료"),
    };
  };

  window.confirm = () => true;
  window.alert = () => {};

  window.__naver = {
    v: 3,
    read() {
      const page = cls(document, "Calendar__inner-contents") ? "calendar" : $$('a[class*="contents-user"]').length || cls(document, "BookingListView__root") ? "list" : "";
      const total = (document.body.innerText.match(/(\d+)\s*건\s*내려받기/) || [])[1];
      const date = readDate();
      const needLogin = !page && !!document.querySelector("input[type=password]");
      return {
        page,
        needLogin,
        date,
        list: page === "list" ? readList() : [],
        slots: page === "calendar" ? readSlots() : [],
        cards: cards().map(readCard),
        listTotal: total ? +total : null, // 예약 목록 위의 "124건"
        loading: $$('[class*="Loading__load_area"], .spinner').some(vis),
      };
    },
    /** 예약 목록은 아래로 내리면 더 불러옴 → 맨 아래로 */
    scrollMore() {
      const rows = $$('a[class*="contents-user"]').filter((u) => u.children.length);
      if (rows.length) rows[rows.length - 1].scrollIntoView({ block: "end" });
      window.scrollTo(0, document.documentElement.scrollHeight);
      window.dispatchEvent(new Event("scroll"));
      return { ok: true };
    },
    /** 오른쪽 예약정보 목록을 아래로 — 더 내려갔으면 more: true */
    scrollCards() {
      const first = cards()[0];
      let sc = null;
      for (let el = first && first.parentElement; el && el !== document.body; el = el.parentElement) {
        if (el.scrollHeight > el.clientHeight + 10 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) { sc = el; break; }
      }
      const all = cards();
      if (all.length) all[all.length - 1].scrollIntoView({ block: "end" });
      if (!sc) return { ok: true, more: false };
      const before = sc.scrollTop;
      sc.scrollTop = before + sc.clientHeight * 0.8;
      sc.dispatchEvent(new Event("scroll"));
      return { ok: true, more: sc.scrollTop > before };
    },
    /** 열린 예약정보 목록 닫기 — [닫기] 단추, 없으면 Esc */
    closePanel() {
      if (!cards().length) return { ok: true, had: false };
      const b = clickables().find((e) => textOf(e) === "닫기" || /닫기/.test(e.getAttribute("aria-label") || "") || /닫기/.test(e.getAttribute("title") || ""));
      if (b) press(b);
      else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return { ok: true, had: true };
    },
    go(url) {
      location.href = url;
      return { ok: true };
    },
    stepDate(dir) {
      const b = dir < 0 ? prevBtn() : nextBtn();
      if (!b) return { ok: false, why: "네이버 화면에서 날짜 이동 버튼을 못 찾음" };
      press(b);
      return { ok: true };
    },
    /** 예약현황 칸의 버튼 누르기: kind = "확정" | "이용완료" */
    openSlot(product, time, kind) {
      const c = findSlotCell(product, time);
      if (!c) return { ok: false, why: `네이버 예약현황에서 ${time} 칸을 못 찾음` };
      const b = c.querySelector(`button[title="${kind}"]`);
      if (!b) return { ok: false, why: `${time} 칸에 '${kind}' 버튼이 없음` };
      press(b);
      return { ok: true };
    },
    /** 예약정보 탭: "확정" | "완료" */
    openTab(kind) {
      const t = $$('[class*="BookingListTab__item"] a, [class*="BookingListTab__item"]').find((e) => new RegExp(`^${kind}\\d+$`).test(textOf(e)));
      if (!t) return { ok: false, why: `'${kind}' 탭을 못 찾음` };
      press(t);
      return { ok: true };
    },
    /** 예약번호 카드의 [이용완료] → 확인 창 [확인] */
    complete(no) {
      const card = cards().find((c) => field(c, "예약번호") === String(no));
      if (!card) return { ok: false, why: `예약번호 ${no} 카드를 못 찾음` };
      const b = clickables(card).find((e) => textOf(e) === "이용완료");
      if (!b) return { ok: false, why: "이용완료 버튼이 없음 (이미 완료됐거나 확정이 아님)" };
      b.click();
      const ok = clickables().find((e) => ["확인", "OK", "이용완료처리"].includes(textOf(e)) && /하시겠습니까|처리/.test((e.closest("div, section, dialog") || {}).textContent || ""));
      if (ok) ok.click();
      return { ok: true };
    },
  };
  return true;
}

const NAVER_DRIVER_SOURCE = installNaverDriver.toString();

if (typeof module !== "undefined") module.exports = { NAVER_DRIVER_SOURCE, installNaverDriver };
