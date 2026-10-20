/* 네이버 재고 자동 오픈 (사장님 10/20) — 매일 오늘 + 30일 날짜를 회차마다 재고 10개로 연다 (두 상품 같은 날짜)
   사장님이 보내 준 실제 화면 사진(10/20) 순서 그대로:
     예약 > [예약상품] → 상품 사진(정글짐 · '가격형') → [일정/가격] → (네이버가 시간 · 재고를 불러오는 딜레이) → 달력 "< 2026.10 >"
       날마다 "10:00" + "n/N개" (n = 예약 · N = 재고 · 아직 안 연 날은 모든 회차 "0/0개" 가운데 줄)
     → [재고수정] → "회차 정보를 수정할 기간을 선택해주세요." 작은 달력(▶) → 날짜 한 번 → 아래 "2026.10.30" → [다음]
     → "10.30(금) 날짜의 모든 회차를 수정하나요?" → [모든 회차]
     → "변경할 재고 수를 입력해주세요." 칸에 10 → [저장](켜짐) → "수정되었습니다" 알림 → 달력 "0/10개"
   안전: 그 날 회차가 하나라도 재고가 있으면(사람이 이미 열었거나 바꿈) 건드리지 않음 · 날짜 칸 · 확인 창 글자가 그 날짜인지 보고 누름
         · 저장 뒤 달력에서 모든 회차가 10개가 된 것을 다시 읽어 확인
   installNaverStockDriver = 네이버 페이지 안에서 실행 (window.__naverStock) · NaverStock = Node 쪽 (앱: 숨은 네이버 창 · 시험: 가짜 화면) */

function installNaverStockDriver() {
  if (window.__naverStock && window.__naverStock.v === 1) return true;
  const norm = (s) => String(s || "").replace(/\s+/g, "");
  const vis = (el) => !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const textOf = (e) => norm(e.value || e.textContent);
  const clickables = (root = document) => $$("button, a, [role=button], [role=tab]", root).filter(vis);
  const press = (el) => {
    for (const type of ["mousedown", "mouseup", "click"]) el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  };
  const off = (b) => !!(b.disabled || b.getAttribute("aria-disabled") === "true" || /(^|[\s_-])(disabled|dimmed)/i.test(String(b.getAttribute("class") || "")));
  /** 글이 re 에 맞는 가장 깊은 요소 (글이 여러 칸으로 나뉘어 있어도) */
  const deep = (re, root = document) => $$("*", root).filter((e) => vis(e) && re.test(norm(e.textContent)) && ![...e.children].some((c) => re.test(norm(c.textContent))));
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

  // 재고수정 창 (세 단계) — 제목 글에서 위로 올라가 [취소] · [다음] · [모든 회차] · [저장] 을 품은 칸
  const POP = [["period", /회차정보를수정할기간을선택/], ["scope", /(날짜|기간)의모든회차를수정/], ["qty", /변경할재고수를입력/]];
  const POP_BTN = /^(취소|다음|모든회차|특정회차선택|저장)$/;
  function popup() {
    for (const [kind, re] of POP) {
      const t = deep(re)[0];
      if (!t) continue;
      let root = t.parentElement || t;
      for (let p = t.parentElement; p && p !== document.body; p = p.parentElement) {
        root = p;
        if (clickables(p).some((b) => POP_BTN.test(textOf(b)))) break;
      }
      return { kind, root, title: norm(t.textContent) };
    }
    return null;
  }
  const ym = (txt) => { const m = norm(txt).match(/^(\d{4})\.(\d{1,2})\.?$/); return m ? `${m[1]}-${m[2].padStart(2, "0")}` : ""; };

  /** 큰 달력: 날짜 → [{ t: "10:00", n: 예약, cap: 재고 }] (재고수정 창 안은 빼고) */
  function calDays(pop) {
    const inPop = (e) => !!(pop && pop.root.contains(e));
    const stocks = deep(/^\d+\/\d+개$/).filter((e) => !inPop(e));
    const nums = deep(/^\d{1,2}$/).filter((e) => !inPop(e) && !e.closest("button, a, [role=button]"));
    const out = {};
    for (const s of stocks) {
      let slot = null, m = null;
      for (let p = s; p && p !== document.body; p = p.parentElement) {
        const t = norm(p.textContent);
        if ((m = t.match(/^(\d{1,2}:\d{2})(\d+)\/(\d+)개$/))) { slot = p; break; }
        if (/개.*개/.test(t)) break; // 두 회차를 품으면 그만
      }
      if (!slot) continue;
      // 날짜: 회차 칸을 품은 위 칸 중 날짜 숫자가 하나뿐인 칸 → 안 되면 같은 세로 줄 위쪽의 가장 가까운 날짜 숫자
      let day = null;
      for (let p = slot.parentElement; p && p !== document.body; p = p.parentElement) {
        const ds = nums.filter((d) => p.contains(d));
        if (ds.length === 1) { day = +norm(ds[0].textContent); break; }
        if (ds.length > 1) break;
      }
      if (day == null) {
        const r = slot.getBoundingClientRect(), cx = (r.left + r.right) / 2;
        let best = null, bt = -Infinity;
        for (const d of nums) {
          let col = d;
          while (col.parentElement && col.getBoundingClientRect().width < 40) col = col.parentElement;
          const q = col.getBoundingClientRect(), dq = d.getBoundingClientRect();
          if (dq.bottom <= r.top + 2 && cx >= q.left && cx <= q.right && dq.top > bt) { bt = dq.top; best = d; }
        }
        if (best) day = +norm(best.textContent);
      }
      if (day == null) continue;
      (out[day] = out[day] || []).push({ t: m[1].padStart(5, "0"), n: +m[2], cap: +m[3] });
    }
    return out;
  }
  /** 상품 카드: 이름에서 위로 올라가 사진(img · '가격형' 표 · 배경 그림)이 하나뿐인 칸 → 누를 것 */
  function cardPhoto(name) {
    const want = norm(name), t = deep(new RegExp(`^${escRe(want)}$`))[0];
    if (!t) return null;
    const photos = (p) => $$("img", p).filter(vis).concat(deep(/^가격형$/, p)).concat($$("*", p).filter((e) => vis(e) && /url\(/.test(getComputedStyle(e).backgroundImage || "")));
    for (let p = t.parentElement; p && p !== document.body; p = p.parentElement) {
      const ph = photos(p);
      if (!ph.length) continue;
      if (deep(new RegExp(`^${escRe(want)}$`), p).length !== 1) break;
      return ph[0];
    }
    return null; // 사진이 없으면 카드가 아님 (예약현황 머리의 상품 이름 등)
  }

  window.__naverStock = {
    v: 1,
    /** name: 지금 보는 상품이 이 상품인지 · 이 상품 카드가 있는지 */
    read(name) {
      const pop = popup();
      const inPop = (e) => !!(pop && pop.root.contains(e));
      const has = (txt) => clickables().some((b) => !inPop(b) && textOf(b) === norm(txt));
      const want = name ? norm(name) : "";
      const named = want ? deep(new RegExp(`^${escRe(want)}$`)).length : 0;
      const tabOn = has("일정/가격");
      const stockOn = has("재고수정");
      const monthEl = deep(/^\d{4}\.\d{1,2}$/).find((e) => !inPop(e));
      const days = stockOn ? calDays(pop) : {};
      const st = {
        needLogin: !!document.querySelector("input[type=password]") && !tabOn && !has("예약상품"),
        url: location.href,
        itemsTab: has("예약상품"),
        onItem: !!(want && named && tabOn), // 이 상품 설정 화면
        card: !!(want && named && !tabOn && cardPhoto(name)), // 예약상품 목록에 이 상품 카드 (사진이 붙은 이름)
        stockOn,
        month: monthEl ? ym(monthEl.textContent) : "",
        days,
        nDays: Object.keys(days).length,
        pop: null,
        toast: (deep(/(수정|저장|변경)되었습니다/)[0] || { textContent: "" }).textContent.trim(),
      };
      if (pop) {
        const p = { kind: pop.kind, title: pop.title };
        const btn = (txt) => clickables(pop.root).find((b) => textOf(b) === norm(txt));
        if (pop.kind === "period") {
          const lab = deep(/^\d{4}\.\d{1,2}\.?$/, pop.root)[0];
          p.month = lab ? ym(lab.textContent) : "";
          const f = $$("input", pop.root).filter(vis).map((i) => i.value).concat(deep(/^\d{4}\.\d{2}\.\d{2}/, pop.root).map((e) => e.textContent)).map(norm).find((x) => /^\d{4}\.\d{2}\.\d{2}/.test(x));
          p.field = f || "";
          const nx = btn("다음");
          p.next = !!(nx && !off(nx));
        }
        if (pop.kind === "qty") {
          const inp = $$("input", pop.root).filter((i) => vis(i) && !/^(hidden|checkbox|radio)$/.test(i.type))[0];
          p.qty = inp ? String(inp.value) : null;
          const sv = btn("저장");
          p.save = !!(sv && !off(sv));
        }
        st.pop = p;
      }
      return st;
    },
    /** 글자가 txt 인 버튼 누르기 (재고수정 창이 열려 있으면 그 안에서) */
    click(txt) {
      const pop = popup();
      const root = pop && POP_BTN.test(norm(txt)) ? pop.root : document;
      const b = clickables(root).find((x) => textOf(x) === norm(txt) && !(pop && root === document && pop.root.contains(x)));
      if (!b) return { ok: false, why: `[${txt}] 버튼을 못 찾음` };
      if (off(b)) return { ok: false, why: `[${txt}] 버튼이 꺼져 있음` };
      press(b);
      return { ok: true };
    },
    openItem(name) {
      const el = cardPhoto(name);
      if (!el) return { ok: false, why: `예약상품에서 '${name}' 상품을 못 찾음` };
      el.scrollIntoView({ block: "center" });
      press(el);
      return { ok: true };
    },
    /** 큰 달력 달 넘기기 (dir 1 = 다음 달) */
    monthNav(dir) {
      const pop = popup();
      const lab = deep(/^\d{4}\.\d{1,2}$/).find((e) => !(pop && pop.root.contains(e)));
      if (!lab) return { ok: false, why: "달력의 달(2026.10)을 못 찾음" };
      return navNear(lab, dir);
    },
    /** 재고수정 창의 작은 달력 달 넘기기 */
    popNav(dir) {
      const pop = popup();
      const lab = pop && deep(/^\d{4}\.\d{1,2}\.?$/, pop.root)[0];
      if (!lab) return { ok: false, why: "작은 달력의 달을 못 찾음" };
      return navNear(lab, dir);
    },
    /** 재고수정 창의 작은 달력에서 그 달의 날짜 누르기 (앞뒤 달의 흐린 날짜는 빼고 · 같은 숫자가 둘이면 15일부터는 뒤의 것) */
    popPick(d) {
      const pop = popup();
      if (!pop || pop.kind !== "period") return { ok: false, why: "기간 선택 창이 아님" };
      const re = new RegExp(`^${Number(d)}$`);
      let els = clickables(pop.root).filter((b) => textOf(b) === String(Number(d)) && !off(b));
      if (!els.length) els = deep(re, pop.root).filter((e) => !off(e) && !(e.closest("[class]") && off(e.closest("[class]"))));
      if (!els.length) return { ok: false, why: `작은 달력에서 ${d}일을 못 찾음` };
      press(Number(d) >= 15 ? els[els.length - 1] : els[0]);
      return { ok: true };
    },
    /** 재고 수 넣기 (네이버 화면은 React → 값 넣는 함수로 넣고 input 알림) */
    setQty(n) {
      const pop = popup();
      const inp = pop && $$("input", pop.root).filter((i) => vis(i) && !/^(hidden|checkbox|radio)$/.test(i.type))[0];
      if (!inp) return { ok: false, why: "재고 수 입력칸을 못 찾음" };
      inp.focus();
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(inp, String(n));
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true };
    },
    reload() { location.reload(); return { ok: true }; },
    go(url) { location.href = url; return { ok: true }; },
  };
  /** 달 글자 옆 화살표: 같은 줄에서 글자 앞(이전) · 뒤(다음) 버튼 */
  function navNear(lab, dir) {
    for (let p = lab.parentElement; p && p !== document.body; p = p.parentElement) {
      const bs = clickables(p);
      if (!bs.length) continue;
      const after = bs.filter((b) => lab.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      const before = bs.filter((b) => lab.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING);
      const b = dir > 0 ? after[0] : before[before.length - 1];
      if (!b) continue;
      if (off(b)) return { ok: false, why: "달 넘기는 버튼이 꺼져 있음" };
      press(b);
      return { ok: true };
    }
    return { ok: false, why: "달 넘기는 버튼을 못 찾음" };
  }
  return true;
}
const NAVER_STOCK_SOURCE = installNaverStockDriver.toString();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dayMs = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const shiftDay = (d, n) => new Date(dayMs(d) + n * 86400000).toISOString().slice(0, 10);
const nextYm = (m) => { const d = new Date(dayMs(m + "-01")); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); };
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

/** 어느 날을 열지 (상품 하나): days = { "YYYY-MM-DD": [{ t, n, cap }] } (오늘 + 1 ~ 오늘 + ahead 를 읽은 것)
    - 연 날 = 회차 중 하나라도 재고 > 0 · 안 연 날 = 회차가 있고 모두 0/0
    - 마지막으로 연 날(L) 뒤 ~ 오늘 + ahead 의 안 연 날만 (앞쪽에 비워 둔 날 = 사람이 닫아 둔 날일 수 있어 건드리지 않음) · L 이 없으면 오늘 + ahead 하루만
    - 건너뛸 날(skip) 빼고 · 한 번에 max 일까지 */
function stockPlan({ today, ahead = 30, days = {}, skip = [], max = 7 }) {
  const D = shiftDay(today, ahead), from = shiftDay(today, 1);
  const inWin = Object.keys(days).filter((d) => d >= from && d <= D).sort();
  const opened = inWin.filter((d) => days[d].length && days[d].some((c) => c.cap > 0));
  const L = opened.length ? opened[opened.length - 1] : null;
  const fresh = (d) => days[d] && days[d].length && days[d].every((c) => c.cap === 0);
  const cand = (L ? inWin.filter((d) => d > L) : inWin.filter((d) => d === D)).filter(fresh);
  const skipped = cand.filter((d) => skip.includes(d));
  const plan = cand.filter((d) => !skip.includes(d));
  return { target: D, last: L, plan: plan.slice(0, max), later: plan.slice(max), skipped, noSlots: inWin.filter((d) => d > (L || shiftDay(D, -1)) && !(days[d] && days[d].length)) };
}

/** 하루 네 번 기회(사장님 10/20: 10:30 → 실패하면 12:00 → 16:00 → 20:20) 중 지금 써야 할 것: 지난 때 중 아직 안 써 본 것 (늦게 켜면 지난 것들을 한 번에 — 한 번만 함)
    → 이번에 써 본 것으로 남길 번호들 (없으면 []) · 그날 성공했으면 부르지 않음 */
function stockDue({ minutes, tried = [], times = [[10, 30], [12, 0], [16, 0], [20, 20]] }) {
  return times.map(([h, m], i) => (minutes >= h * 60 + m && !tried.includes(i) ? i : -1)).filter((i) => i >= 0);
}

class NaverStock {
  constructor(exec, opts = {}) {
    this.exec = exec;
    this.onStep = opts.onStep || (() => {});
    this.onSnap = opts.onSnap || null;
    this.urls = opts.urls || null; // { calendar } — 예약상품 탭이 안 보이면 예약현황을 거쳐
    this.slow = opts.slow || 1; // 시험에서 기다림을 줄일 때
  }
  call(expr) {
    return this.exec(`(() => { (${NAVER_STOCK_SOURCE})(); return ${expr}; })()`);
  }
  step(msg) { try { this.onStep(msg); } catch (e) { /* 무시 */ } }
  async read(name) {
    for (let i = 0; i < 40; i++) {
      try { return await this.call(`window.__naverStock.read(${JSON.stringify(name || "")})`); } catch (e) { await sleep(250); } // 페이지 이동 중
    }
    throw new Error("네이버 화면을 읽을 수 없음");
  }
  /** pred(state) 가 맞을 때까지 기다림 */
  async until(name, pred, ms, why) {
    const t0 = Date.now();
    let s = null;
    while (Date.now() - t0 < ms * this.slow) {
      try { s = await this.call(`window.__naverStock.read(${JSON.stringify(name || "")})`); if (pred(s)) return { ok: true, state: s }; } catch (e) { /* 이동 중 */ }
      await sleep(300);
    }
    return { ok: false, why, state: s };
  }
  async act(expr) {
    const r = await this.call(expr).catch((e) => ({ ok: true, nav: String(e.message || e) })); // 누르자마자 페이지가 바뀌면 답이 없을 수 있음
    return r || { ok: true };
  }
  async fail(label, why) {
    if (this.onSnap) try { await this.onSnap(label); } catch (e) { /* 진단 저장 실패는 무시 */ }
    return { ok: false, why };
  }
  /** 그 상품의 일정/가격 달력을 그 달(YYYY-MM)로 */
  async toMonth(product, month) {
    let s = await this.read(product);
    if (s.needLogin) return { ok: false, why: "네이버에 로그인해 주세요 (로그인할 때 '로그인 상태 유지'를 꼭 체크)" };
    if (!s.onItem) {
      if (!s.card) {
        if (!s.itemsTab && this.urls && this.urls.calendar) { await this.act(`window.__naverStock.go(${JSON.stringify(this.urls.calendar)})`); await this.until(product, (x) => x.itemsTab, 20000, ""); }
        this.step("네이버 예약상품 열기");
        let r = await this.act(`window.__naverStock.click("예약상품")`);
        if (!r.ok) return this.fail("stock-items", `네이버 [예약상품]을 못 찾음 — ${r.why}`);
        r = await this.until(product, (x) => x.card || x.onItem, 30000, `예약상품에서 '${product}'이 안 보임`);
        if (!r.ok) return this.fail("stock-items", r.why);
        s = r.state;
      }
      if (!s.onItem) {
        this.step(`네이버 상품 열기: ${product}`);
        let r = await this.act(`window.__naverStock.openItem(${JSON.stringify(product)})`);
        if (!r.ok) return this.fail("stock-item", r.why);
        r = await this.until(product, (x) => x.onItem, 30000, `'${product}' 설정 화면이 안 열림`);
        if (!r.ok) return this.fail("stock-item", r.why);
        s = r.state;
      }
    }
    if (!s.stockOn || !s.nDays) {
      this.step("네이버 [일정/가격] — 시간 · 재고 불러오는 중");
      if (!s.stockOn) { const r = await this.act(`window.__naverStock.click("일정/가격")`); if (!r.ok) return this.fail("stock-tab", r.why); }
      const r = await this.until(product, (x) => x.stockOn && x.nDays > 0 && !!x.month, 60000, "일정/가격 달력이 안 나옴 (네이버가 너무 느림)");
      if (!r.ok) return this.fail("stock-tab", r.why);
      s = r.state;
    }
    for (let i = 0; i < 4 && s.month !== month; i++) {
      const dir = s.month < month ? 1 : -1, was = s.month;
      this.step(`네이버 달력 ${was} → ${month}`);
      const r0 = await this.act(`window.__naverStock.monthNav(${dir})`);
      if (!r0.ok) return this.fail("stock-month", r0.why);
      const r = await this.until(product, (x) => x.month && x.month !== was && x.nDays > 0, 45000, `달력을 ${month}로 못 넘김`);
      if (!r.ok) {
        // 그 달에 회차가 하나도 없으면 날짜 칸이 비어 있음
        const s2 = await this.read(product);
        if (s2.month === month) return { ok: true, state: s2 };
        return this.fail("stock-month", r.why);
      }
      s = r.state;
    }
    if (s.month !== month) return this.fail("stock-month", `달력을 ${month}로 못 넘김 (지금 ${s.month})`);
    return { ok: true, state: s };
  }
  /** 그 상품의 from ~ to 날짜 재고 읽기 → { ok, days: { "YYYY-MM-DD": [{ t, n, cap }] } } */
  async scan(product, from, to) {
    const days = {};
    for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = nextYm(m)) {
      const r = await this.toMonth(product, m);
      if (!r.ok) return r;
      for (const [d, cells] of Object.entries(r.state.days)) { const k = `${m}-${String(d).padStart(2, "0")}`; if (k >= from && k <= to) days[k] = cells; }
    }
    return { ok: true, days };
  }
  /** 그 날짜를 회차마다 재고 qty 개로 (모든 회차가 0/0 일 때만) → { ok, done | already | why } */
  async openDay({ product, day, qty = 10 }) {
    const month = day.slice(0, 7), d = +day.slice(8), dot = day.replace(/-/g, ".");
    let r = await this.toMonth(product, month);
    if (!r.ok) return r;
    const cells = r.state.days[d] || [];
    if (!cells.length) return { ok: false, why: `${day} 회차가 없음` };
    if (cells.some((c) => c.cap > 0)) return { ok: true, already: true, cells: cells.length };
    this.step(`네이버 [재고수정] ${product} ${day} → ${qty}개`);
    r = await this.act(`window.__naverStock.click("재고수정")`);
    if (!r.ok) return this.fail("stock-edit", r.why);
    r = await this.until(product, (x) => x.pop && x.pop.kind === "period" && !!x.pop.month, 15000, "기간 선택 창이 안 열림");
    if (!r.ok) return this.fail("stock-edit", r.why);
    let s = r.state;
    for (let i = 0; i < 4 && s.pop.month !== month; i++) {
      const was = s.pop.month;
      const k = await this.act(`window.__naverStock.popNav(${s.pop.month < month ? 1 : -1})`);
      if (!k.ok) return this.cancel(product, "stock-period", k.why);
      r = await this.until(product, (x) => x.pop && x.pop.kind === "period" && x.pop.month !== was, 5000, "작은 달력이 안 넘어감");
      if (!r.ok) return this.cancel(product, "stock-period", r.why);
      s = r.state;
    }
    if (s.pop.month !== month) return this.cancel(product, "stock-period", `작은 달력을 ${month}로 못 넘김`);
    let k = await this.act(`window.__naverStock.popPick(${d})`);
    if (!k.ok) return this.cancel(product, "stock-period", k.why);
    r = await this.until(product, (x) => x.pop && x.pop.kind === "period" && x.pop.field === dot && x.pop.next, 5000, `날짜 칸이 ${dot} 가 아님`);
    if (!r.ok) return this.cancel(product, "stock-period", `${r.why} (${(r.state && r.state.pop && r.state.pop.field) || "빈칸"})`);
    k = await this.act(`window.__naverStock.click("다음")`);
    if (!k.ok) return this.cancel(product, "stock-period", k.why);
    const md = `${day.slice(5, 7)}.${day.slice(8)}`;
    r = await this.until(product, (x) => x.pop && x.pop.kind === "scope", 10000, "'모든 회차' 창이 안 나옴");
    if (!r.ok) return this.cancel(product, "stock-scope", r.why);
    if (!r.state.pop.title.includes(md) || !/날짜의모든회차/.test(r.state.pop.title)) return this.cancel(product, "stock-scope", `확인 창 날짜가 다름: ${r.state.pop.title}`);
    k = await this.act(`window.__naverStock.click("모든 회차")`);
    if (!k.ok) return this.cancel(product, "stock-scope", k.why);
    r = await this.until(product, (x) => x.pop && x.pop.kind === "qty", 10000, "재고 수 입력 창이 안 나옴");
    if (!r.ok) return this.cancel(product, "stock-qty", r.why);
    k = await this.act(`window.__naverStock.setQty(${Number(qty)})`);
    if (!k.ok) return this.cancel(product, "stock-qty", k.why);
    r = await this.until(product, (x) => x.pop && x.pop.kind === "qty" && x.pop.qty === String(qty) && x.pop.save, 5000, `재고 칸에 ${qty}이 안 들어감`);
    if (!r.ok) return this.cancel(product, "stock-qty", r.why);
    k = await this.act(`window.__naverStock.click("저장")`);
    if (!k.ok) return this.cancel(product, "stock-qty", k.why);
    r = await this.until(product, (x) => !x.pop, 15000, "저장 뒤 창이 안 닫힘");
    if (!r.ok) return this.fail("stock-save", r.why);
    // 달력에서 다시 확인 (안 바뀌어 보이면 다시 불러와 한 번 더)
    const okDay = (x) => x.month === month && x.days[d] && x.days[d].length === cells.length && x.days[d].every((c) => c.cap === Math.max(qty, c.n));
    r = await this.until(product, okDay, 25000, "");
    if (!r.ok) {
      await this.act("window.__naverStock.reload()");
      await this.until(product, (x) => x.onItem || x.card || x.itemsTab, 30000, "");
      const t = await this.toMonth(product, month);
      if (!t.ok || !okDay(t.state)) return this.fail("stock-verify", `저장했는데 ${day} 재고가 ${qty}개로 안 보임 — 바탕화면 '아스타나키즈-진단' 폴더의 사진을 보내 주세요`);
    }
    return { ok: true, done: true, cells: cells.length };
  }
  /** 끝나면 예약현황으로 (주소를 알면 주소로 · 아니면 [예약현황] 탭) — 데스크 불러오기 · 이용완료는 예약현황에서 */
  async back() {
    const r = this.urls && this.urls.calendar ? await this.act(`window.__naverStock.go(${JSON.stringify(this.urls.calendar)})`) : await this.act(`window.__naverStock.click("예약현황")`);
    await sleep(1500);
    return r;
  }
  /** 창을 닫고 실패로 (취소 버튼이 없는 창이면 페이지를 다시 불러옴 — 저장 전이라 바뀐 것 없음) */
  async cancel(product, label, why) {
    const c = await this.act(`window.__naverStock.click("취소")`);
    if (!c.ok) await this.act("window.__naverStock.reload()");
    return this.fail(label, why);
  }
}

module.exports = { NaverStock, NAVER_STOCK_SOURCE, installNaverStockDriver, stockPlan, stockDue, shiftDay, DOW };
