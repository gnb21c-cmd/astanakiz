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
   - 예약이 1건인 칸의 [확정]을 누르면 목록(탭 · 카드) 대신 오른쪽에 '예약 상세정보'가 바로 뜸 (현장 화면 10/6)
       상태 동그라미(확정) · 이름 · 처음 온 손님은 '완료 n' 대신 '신규예약' · 예약자/전화번호/예약번호/상품/이용일시/수량 · [예약취소] [이용완료] · 오른쪽 위 X
       → 상세정보도 카드 한 장으로 읽고, 칸의 이름표는 글자로 찾음
   - 이용완료 확인 창 모양은 아직 모름: window.confirm 이면 자동 확인, 화면 안 창이면 "하시겠습니까" 글자 옆 [확인] */

function installNaverDriver() {
  if (window.__naver && window.__naver.v === 6) return true;

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

  // 날짜 칸이 하루가 아니라 기간(한달 · 주간)인지 — "~" 가 있으면 기간
  const dateIsRange = () => {
    const b = prevBtn();
    let box = b && b.parentElement;
    for (let i = 0; i < 3 && box; i++, box = box.parentElement) if (/(\d{1,2})\.\s*(\d{1,2})\./.test(box.textContent)) return /~/.test(box.textContent);
    return false;
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

  // 예약 상세정보 (예약이 1건인 칸을 누르면 목록 대신 바로 뜸): '예약 상세정보' 글자에서 위로 올라가 예약번호 · 이용일시를 품은 칸
  const leafs = (root) => [...root.querySelectorAll("*")].filter((e) => !e.children.length && vis(e));
  const detailPanel = () => {
    const t = leafs(document).find((e) => norm(e.textContent) === "예약상세정보");
    for (let p = t && t.parentElement; p && p !== document.body; p = p.parentElement) {
      const x = norm(p.textContent);
      if (x.includes("예약번호") && x.includes("이용일시")) return p;
    }
    return null;
  };
  // 예약정보 카드: 목록 카드들, 없으면 상세정보 한 장
  const cards = () => {
    const list = $$('[class*="List__contents-box"]').filter(vis);
    if (list.length) return list;
    const d = detailPanel();
    return d ? [d] : [];
  };
  // 이름표(예약자 · 전화번호 …) 옆 값: 목록 카드의 Summary__item-title, 없으면 글자가 딱 그 이름표인 칸의 다음 칸
  const field = (card, label) => {
    const t = $$('[class*="Summary__item-title"]', card).find((e) => norm(e.textContent) === norm(label));
    if (t && t.nextElementSibling) return txt(t.nextElementSibling).replace(/,\s*$/, "");
    const l = [...card.querySelectorAll("*")].find((e) => vis(e) && norm(e.textContent) === norm(label) && ![...e.children].some((c) => norm(c.textContent) === norm(label)));
    if (!l) return "";
    const v = l.nextElementSibling || (l.parentElement && l.parentElement.nextElementSibling);
    return v ? txt(v).replace(/,\s*$/, "") : "";
  };
  // 방문 횟수: "완료 11, 취소 2" · 처음 온 손님은 "신규예약" → 0 · 못 찾으면 null (데스크에 '확인 중')
  const visitsOf = (c) => {
    const m = txt(c.querySelector(".text-info-sub")).match(/완료\s*(\d+)(?:\s*,\s*취소\s*(\d+))?/);
    if (m) return [+m[1], m[2] ? +m[2] : 0];
    for (const e of leafs(c)) {
      if (e.closest("button")) continue;
      const k = txt(e).match(/^완료\s*(\d+)(?:\s*[,·]\s*취소\s*(\d+))?/);
      if (k) return [+k[1], k[2] ? +k[2] : 0];
      if (/^신규예약/.test(norm(e.textContent))) return [0, 0];
    }
    return [null, 0];
  };
  const readCard = (c) => {
    const [doneCount, cancelCount] = visitsOf(c);
    const badge = c.querySelector("[data-tst_booking_status]") || cls(c, "Summary__user-state") || leafs(c).find((e) => !e.closest("button, a") && /^(확정|완료|이용완료|취소|신청|노쇼)$/.test(norm(e.textContent)));
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
      qty: qtyEl ? +txt(qtyEl) || 1 : +(field(c, "수량").match(/(\d+)\s*,?\s*$/) || [0, 1])[1] || 1,
      qtyText: field(c, "수량"),
      pay: field(c, "결제상태"),
      status: txt(badge),
      doneCount,
      cancelCount,
      canComplete: clickables(c).some((b) => textOf(b) === "이용완료"),
    };
  };

  window.confirm = () => true;
  window.alert = () => {};

  window.__naver = {
    v: 6,
    read() {
      const page = cls(document, "Calendar__inner-contents") ? "calendar" : $$('a[class*="contents-user"]').length || cls(document, "BookingListView__root") ? "list" : "";
      const total = (document.body.innerText.match(/(\d+)\s*건\s*내려받기/) || [])[1];
      const date = readDate();
      const needLogin = !page && !!document.querySelector("input[type=password]");
      return {
        page,
        needLogin,
        date,
        dateRange: dateIsRange(),
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
      const b = clickables().find((e) => textOf(e) === "닫기" || /닫기/.test(e.getAttribute("aria-label") || "") || /닫기/.test(e.getAttribute("title") || "")) ||
        clickables(detailPanel() || document).find((e) => /close/i.test(e.className && e.className.baseVal != null ? e.className.baseVal : e.className || ""));
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
      press(b);
      window.__naver.confirm();
      return { ok: true };
    },
    /** 확인 창이 떠 있으면 [확인]: 창(dialog · modal · layer · popup · alert) 안의 확인 · OK · 예 · 이용완료 단추.
        예약 카드 · 상세정보 안의 [이용완료]는 빼고 (다시 누르면 같은 창만 또 뜸) */
    confirm() {
      const inCard = (e) => cards().some((c) => c.contains(e));
      const boxSel = '[role=dialog], [role=alertdialog], [class*="odal"], [class*="ialog"], [class*="ayer"], [class*="opup"], [class*="lert"], [class*="onfirm"]';
      const ok = clickables().find((e) => {
        if (!["확인", "OK", "예", "이용완료", "이용완료처리", "완료"].includes(textOf(e)) || inCard(e)) return false;
        const box = e.closest(boxSel);
        if (box && !inCard(box)) return true;
        for (let p = e.parentElement, i = 0; p && i < 5; p = p.parentElement, i++) if (/하시겠습니까|처리하|완료하|변경하|할까요/.test(p.textContent)) return true;
        return false;
      });
      if (!ok) return { ok: true, clicked: false };
      const label = textOf(ok);
      press(ok);
      return { ok: true, clicked: true, label };
    },
  };
  return true;
}

const NAVER_DRIVER_SOURCE = installNaverDriver.toString();

if (typeof module !== "undefined") module.exports = { NAVER_DRIVER_SOURCE, installNaverDriver };
