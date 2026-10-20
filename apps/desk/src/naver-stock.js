/* 네이버 재고 자동 오픈 (사장님 10/20) — 매일 오늘 + 30일 날짜를 회차마다 재고 10개로 (두 상품 같은 날짜)
   1.54 (사장님 10/20 21:1x): 큰 달력을 읽어 확인하지 않고 바로 진행 — 이미 넣은 날이어도 그대로 10개로
     상품 일정/가격 주소 → [재고수정] → 작은 달력 "2026. 10." ▶ 로 그 달 → 날짜(버튼 data-tst_date="2026-11-19") → 아래 "2026.11.19" 확인
     → [다음] → "11.19(목) 날짜의 모든 회차를 수정하나요?" 확인 → [모든 회차] → "변경할 재고 수를 입력해주세요." 칸을 누르고 키보드로 10
     → [저장](켜졌는지 보고) → 창이 닫히고 다른 경고 창이 없으면 끝 ("수정되었습니다" 알림)
   지난 기록: 1.53 은 큰 달력을 먼저 읽어 0/0 인 날만 열었는데 달을 넘기자마자 읽어 10월 19일을 11월 19일로 알고 '이미 열려 있음' (현장 10/20 20:55)
             1.52 는 상품 사진을 찾다 가게 사진 링크를 눌러 스마트플레이스 → 리뷰 작성자 MY플레이스 새 창 (현장 10/20 20:24)
   안전: 주소로만 움직임(예약상품 목록 …/bizes/{업체}/biz-items · 상품 …/biz-items/{번호}/schedules — 번호는 처음에 목록에서 이름으로 찾아 이 PC 설정에만)
         · 네이버 예약관리 밖 링크 · 새 창 링크는 안 누름 · 날짜 칸 · 확인 창 글자가 그 날짜일 때만 다음으로 · [저장]은 칸에 10이 들어가 켜졌을 때만
   installNaverStockDriver = 네이버 페이지 안에서 실행 (window.__naverStock) · NaverStock = Node 쪽 (앱: 숨은 네이버 창 · 시험: 가짜 화면) */

function installNaverStockDriver() {
  if (window.__naverStock && window.__naverStock.v === 3) return true;
  const norm = (s) => String(s || "").replace(/\s+/g, "");
  const vis = (el) => !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const textOf = (e) => norm(e.value || e.textContent);
  const clickables = (root = document) => $$("button, a, [role=button], [role=tab]", root).filter(vis);
  // 상품 번호 · 예약상품 목록 주소 모양 (Node 가 window.__naverStockPat 로 넣을 수 있음 — 시험의 가짜 화면은 다른 모양)
  const PAT = () => window.__naverStockPat || { list: "/bizes/\\d+/biz-items/?(?:[?#]|$)", id: "/biz-items/(\\d+)" };
  const onList = () => new RegExp(PAT().list).test(location.href);
  const idOf = (href) => { const m = String(href || "").match(new RegExp(PAT().id)); return m ? m[1] : ""; };
  /** 네이버 예약관리 안에서 움직이는 것만: 다른 곳(스마트플레이스 · MY플레이스 …)으로 가는 링크 · 새 창 링크는 안 누름 */
  const inside = (el) => {
    const a = el.closest("a[href], [target]");
    if (!a) return true;
    if (String(a.getAttribute("target") || "").toLowerCase() === "_blank") return false;
    const h = a.getAttribute("href");
    if (!h || /^(#|javascript:)/i.test(h)) return true;
    try { const u = new URL(h, location.href); return u.protocol === location.protocol && u.host === location.host; } catch (e) { return false; }
  };
  const press = (el) => {
    if (!inside(el)) return false;
    for (const type of ["mousedown", "mouseup", "click"]) el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    return true;
  };
  const OUT = "네이버 예약관리 밖으로 가는 링크라 안 누름";
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

  /** 예약상품 목록의 그 상품 카드: 이름에서 위로 올라가며 상품 링크(…/biz-items/번호)가 한 가지뿐인 칸 → { id, href } · 링크가 없으면 { el: 이름 }
      (사진은 보지 않음 — 1.52 는 사진을 찾다 가게 사진 링크를 눌렀음) */
  function cardOf(name) {
    const ts = deep(new RegExp(`^${escRe(norm(name))}$`));
    if (ts.length !== 1) return null; // 없거나 같은 이름이 둘이면 안 누름
    for (let p = ts[0]; p && p !== document.body; p = p.parentElement) {
      const links = $$("a[href]", p).concat(p.matches("a[href]") ? [p] : []).filter((a) => idOf(a.href) && inside(a));
      const ids = [...new Set(links.map((a) => idOf(a.href)))];
      if (ids.length === 1) return { id: ids[0], href: links[0].href, el: ts[0] };
      if (ids.length > 1) break; // 다른 카드까지 올라옴
    }
    return { id: "", href: "", el: ts[0] };
  }

  window.__naverStock = {
    v: 3,
    /** name: 지금 보는 상품이 이 상품인지 · 이 상품 카드가 있는지 · 재고수정 창 단계 */
    read(name) {
      const pop = popup();
      const inPop = (e) => !!(pop && pop.root.contains(e));
      const has = (txt) => clickables().some((b) => !inPop(b) && textOf(b) === norm(txt));
      const want = name ? norm(name) : "";
      const named = want ? deep(new RegExp(`^${escRe(want)}$`)).length : 0;
      const tabOn = has("일정/가격");
      // 재고수정 창이 아닌 다른 창(저장 뒤 경고 등) — 글이 있는 보이는 대화 창
      const modal = pop ? "" : ($$("[role=dialog], .modal-dialog").filter((e) => vis(e) && norm(e.textContent)).map((e) => e.textContent.replace(/\s+/g, " ").trim())[0] || "").slice(0, 80);
      const st = {
        needLogin: !!document.querySelector("input[type=password]") && !tabOn && !has("예약상품"),
        url: location.href,
        itemsTab: has("예약상품"),
        onItem: !!(want && named && tabOn), // 이 상품 설정 화면
        onList: onList(),
        card: !!(want && named === 1 && !tabOn && onList()), // 예약상품 목록(주소로 확인)에 이 상품 이름
        itemId: idOf(location.href), // 상품 화면이면 그 상품 번호
        stockOn: has("재고수정"),
        pop: null,
        modal,
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
      if (!press(b)) return { ok: false, why: `[${txt}]: ${OUT}` };
      return { ok: true };
    },
    /** 예약상품 목록에서 그 상품: 카드 링크가 있으면 번호만 알려 줌(Node 가 주소로 감) · 없으면 이름을 누름 — 목록 화면이 아니면 아무것도 안 누름 */
    openItem(name) {
      if (!onList()) return { ok: false, why: "예약상품 목록 화면이 아님" };
      const c = cardOf(name);
      if (!c) return { ok: false, why: `예약상품에서 '${name}' 상품을 못 찾음` };
      if (c.id) return { ok: true, id: c.id, href: c.href };
      c.el.scrollIntoView({ block: "center" });
      if (!press(c.el)) return { ok: false, why: `'${name}': ${OUT}` };
      return { ok: true, pressed: true };
    },
    /** 재고수정 창의 작은 달력 달 넘기기 */
    popNav(dir) {
      const pop = popup();
      const lab = pop && deep(/^\d{4}\.\d{1,2}\.?$/, pop.root)[0];
      if (!lab) return { ok: false, why: "작은 달력의 달을 못 찾음" };
      return navNear(lab, dir);
    },
    /** 재고수정 창의 작은 달력에서 그 날짜 누르기 — 실제 네이버 날짜 버튼에는 data-tst_date="2026-11-19" (10/20 화면 저장본) · 없으면 숫자로
        (앞뒤 달의 흐린 날짜는 빼고 · 같은 숫자가 둘이면 15일부터는 뒤의 것) */
    popPick(d, full) {
      const pop = popup();
      if (!pop || pop.kind !== "period") return { ok: false, why: "기간 선택 창이 아님" };
      const exact = full && $$(`[data-tst_date="${String(full).replace(/[^0-9-]/g, "")}"]`, pop.root).filter((e) => vis(e) && !off(e))[0];
      if (exact) return press(exact) ? { ok: true, exact: true } : { ok: false, why: `${d}일: ${OUT}` };
      const re = new RegExp(`^${Number(d)}$`);
      let els = clickables(pop.root).filter((b) => textOf(b) === String(Number(d)) && !off(b));
      if (!els.length) els = deep(re, pop.root).filter((e) => !off(e) && !(e.closest("[class]") && off(e.closest("[class]"))));
      if (!els.length) return { ok: false, why: `작은 달력에서 ${d}일을 못 찾음` };
      if (!press(Number(d) >= 15 ? els[els.length - 1] : els[0])) return { ok: false, why: `${d}일: ${OUT}` };
      return { ok: true };
    },
    /** 재고 수 칸에 커서를 두고 안의 글을 다 고름 — 글자는 Node 가 실제 키보드로 침
        (사장님 10/20: 칸에 흐린 0 · 커서를 놓고 수를 써야 [저장]이 켜짐 · 비우면 "필수 입력 값입니다.") */
    focusQty() {
      const pop = popup();
      const inp = pop && pop.kind === "qty" && $$("input", pop.root).filter((i) => vis(i) && !/^(hidden|checkbox|radio)$/.test(i.type))[0];
      if (!inp) return { ok: false, why: "재고 수 입력칸을 못 찾음" };
      inp.scrollIntoView({ block: "center" });
      press(inp);
      inp.focus();
      try { inp.select(); } catch (e) { /* 고를 수 없는 칸 */ }
      return { ok: document.activeElement === inp };
    },
    /** 재고 수 넣기 — 키보드를 못 쓸 때 (네이버 화면은 React → 값 넣는 함수로 넣고 input 알림) */
    setQty(n) {
      const pop = popup();
      const inp = pop && $$("input", pop.root).filter((i) => vis(i) && !/^(hidden|checkbox|radio)$/.test(i.type))[0];
      if (!inp) return { ok: false, why: "재고 수 입력칸을 못 찾음" };
      inp.focus();
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(inp, String(n));
      inp.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(n) }));
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
      if (!press(b)) return { ok: false, why: `달 넘기기: ${OUT}` };
      return { ok: true };
    }
    return { ok: false, why: "달 넘기는 버튼을 못 찾음" };
  }
  return true;
}
const NAVER_STOCK_SOURCE = installNaverStockDriver.toString();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LOGIN = "네이버에 로그인해 주세요 (로그인할 때 '로그인 상태 유지'를 꼭 체크)";
const dayMs = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const shiftDay = (d, n) => new Date(dayMs(d) + n * 86400000).toISOString().slice(0, 10);
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

/** 어느 날을 열지 (상품 하나) — 확인하지 않고 바로 진행 (사장님 10/20 · 이미 넣은 날도 10개로)
    - 오늘 + ahead 하루 · 이 PC 가 마지막으로 연 날(last)이 있으면 그 다음 날부터 이어서 (POS 를 꺼서 못 연 날)
    - 한 번에 max 일까지 (더 오래 비었으면 앞쪽은 missed — 사람이 확인) · 지난 날은 안 함 · 건너뛸 날(skip) 빼고 */
function stockDays({ today, ahead = 30, last = "", skip = [], max = 7 }) {
  const D = shiftDay(today, ahead);
  if (last && last >= D) return { target: D, plan: [], missed: [], skipped: [] };
  let from = last ? shiftDay(last, 1) : D;
  if (from <= today) from = shiftDay(today, 1);
  const all = [];
  for (let d = from; d <= D; d = shiftDay(d, 1)) all.push(d);
  const keep = all.slice(-max);
  return { target: D, plan: keep.filter((d) => !skip.includes(d)), missed: all.slice(0, all.length - keep.length), skipped: keep.filter((d) => skip.includes(d)) };
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
    this.urls = opts.urls || null; // { calendar, items, schedule: "…/biz-items/{id}/schedules" } — 이 PC 네이버 예약관리 시작 주소에서 (코드에 주소 없음)
    this.pat = opts.pat || null; // 시험: 가짜 화면의 목록 · 상품 번호 주소 모양
    this.ids = Object.assign({}, opts.ids || {}); // 상품 이름 → 번호 (목록에서 찾은 것 · 앱은 settings.stockItems 에 남김)
    this.onLearn = opts.onLearn || (() => {});
    this.type = opts.type || null; // 실제 키보드로 글자 치기 (앱: 네이버 창 insertText · 시험: page.keyboard.type)
    this.slow = opts.slow || 1; // 시험에서 기다림을 줄일 때
  }
  call(expr) {
    const pat = this.pat ? `window.__naverStockPat = ${JSON.stringify(this.pat)}; ` : "";
    return this.exec(`(() => { ${pat}(${NAVER_STOCK_SOURCE})(); return ${expr}; })()`);
  }
  go(url) { return this.act(`window.__naverStock.go(${JSON.stringify(url)})`); }
  schedUrl(id) { return id && this.urls && this.urls.schedule ? this.urls.schedule.replace("{id}", encodeURIComponent(id)) : ""; }
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
  /** 그 상품의 설정(일정/가격) 화면으로: 아는 번호면 주소로 바로 → 아니면 예약상품 목록(주소로)에서 이름으로 찾아 카드 링크 주소로 (링크가 없으면 이름을 누름) */
  async openProduct(product) {
    const known = this.schedUrl(this.ids[product]);
    if (known) {
      this.step(`네이버 상품 열기: ${product}`);
      await this.go(known);
      const r = await this.until(product, (x) => x.onItem || x.needLogin, 20000, "");
      if (r.ok && r.state.needLogin) return { ok: false, why: LOGIN };
      if (r.ok) return r;
      delete this.ids[product]; // 번호가 바뀌었으면 목록에서 다시 찾음
    }
    this.step("네이버 예약상품 열기");
    if (this.urls && this.urls.items) await this.go(this.urls.items);
    else {
      // 예약관리 주소를 모름 (처음 설치) → 예약현황의 [예약상품] 탭 (예약관리 안 링크만 누름)
      const s = await this.read(product);
      if (!s.onList) {
        if (!s.itemsTab && this.urls && this.urls.calendar) { await this.go(this.urls.calendar); await this.until(product, (x) => x.itemsTab || x.needLogin, 20000, ""); }
        const k = await this.act(`window.__naverStock.click("예약상품")`);
        if (!k.ok) return this.fail("stock-items", `네이버 [예약상품]을 못 찾음 — ${k.why}`);
      }
    }
    let r = await this.until(product, (x) => x.card || x.needLogin, 30000, `예약상품에서 '${product}'이 안 보임`);
    if (r.ok && r.state.needLogin) return { ok: false, why: LOGIN };
    if (!r.ok) return this.fail("stock-items", r.why);
    this.step(`네이버 상품 열기: ${product}`);
    const k = await this.act(`window.__naverStock.openItem(${JSON.stringify(product)})`);
    if (!k.ok) return this.fail("stock-item", k.why);
    if (k.id) await this.go(this.schedUrl(k.id) || k.href);
    r = await this.until(product, (x) => x.onItem, 30000, `'${product}' 설정 화면이 안 열림`);
    if (!r.ok) return this.fail("stock-item", r.why);
    const id = k.id || r.state.itemId;
    if (id && this.ids[product] !== id) { this.ids[product] = id; try { this.onLearn(product, id); } catch (e) { /* 남기기 실패는 다음에 다시 찾음 */ } }
    return r;
  }
  /** 그 상품 일정/가격 화면에서 [재고수정]이 보일 때까지 */
  async toStock(product) {
    let s = await this.read(product);
    if (s.needLogin) return { ok: false, why: LOGIN };
    if (!s.onItem) {
      const r = await this.openProduct(product);
      if (!r.ok) return r;
      s = r.state;
    }
    if (!s.stockOn) {
      this.step("네이버 [일정/가격]");
      const r0 = await this.act(`window.__naverStock.click("일정/가격")`);
      if (!r0.ok) return this.fail("stock-tab", r0.why);
      const r = await this.until(product, (x) => x.stockOn, 60000, "[재고수정] 버튼이 안 나옴 (네이버가 너무 느림)");
      if (!r.ok) return this.fail("stock-tab", r.why);
      s = r.state;
    }
    return { ok: true, state: s };
  }
  /** 그 날짜를 회차마다 재고 qty 개로 — 확인하지 않고 바로 진행 (이미 넣은 날도) → { ok, done | dry | why }
      dry = 바꾸지 않고 '모든 회차' 확인 창(그 날짜)까지 가 보고 [취소] */
  async setDay({ product, day, qty = 10, dry = false }) {
    const month = day.slice(0, 7), d = +day.slice(8), dot = day.replace(/-/g, "."), md = `${day.slice(5, 7)}.${day.slice(8)}`;
    let r = await this.toStock(product);
    if (!r.ok) return r;
    const base = r.state.modal; // 원래 떠 있던 창(공지 등)은 저장 뒤 경고로 안 봄
    this.step(`네이버 [재고수정] ${product} ${day}${dry ? " (확인만)" : ` → ${qty}개`}`);
    let k = await this.act(`window.__naverStock.click("재고수정")`);
    if (!k.ok) return this.fail("stock-edit", k.why);
    r = await this.until(product, (x) => x.pop && x.pop.kind === "period" && !!x.pop.month, 15000, "기간 선택 창이 안 열림");
    if (!r.ok) return this.fail("stock-edit", r.why);
    // 작은 달력: 이번 달로 열림 → ▶ 로 그 달까지 (보통 한 번)
    let s = r.state;
    for (let i = 0; i < 4 && s.pop.month !== month; i++) {
      const was = s.pop.month;
      k = await this.act(`window.__naverStock.popNav(${s.pop.month < month ? 1 : -1})`);
      if (!k.ok) return this.cancel(product, "stock-period", k.why);
      r = await this.until(product, (x) => x.pop && x.pop.kind === "period" && x.pop.month !== was, 5000, "작은 달력이 안 넘어감");
      if (!r.ok) return this.cancel(product, "stock-period", r.why);
      s = r.state;
    }
    if (s.pop.month !== month) return this.cancel(product, "stock-period", `작은 달력을 ${month}로 못 넘김`);
    k = await this.act(`window.__naverStock.popPick(${d}, ${JSON.stringify(day)})`);
    if (!k.ok) return this.cancel(product, "stock-period", k.why);
    r = await this.until(product, (x) => x.pop && x.pop.kind === "period" && x.pop.field === dot && x.pop.next, 5000, `날짜 칸이 ${dot} 가 아님`);
    if (!r.ok) return this.cancel(product, "stock-period", `${r.why} (${(r.state && r.state.pop && r.state.pop.field) || "빈칸"})`);
    k = await this.act(`window.__naverStock.click("다음")`);
    if (!k.ok) return this.cancel(product, "stock-period", k.why);
    r = await this.until(product, (x) => x.pop && x.pop.kind === "scope", 10000, "'모든 회차' 창이 안 나옴");
    if (!r.ok) return this.cancel(product, "stock-scope", r.why);
    if (!r.state.pop.title.includes(md) || !/날짜의모든회차/.test(r.state.pop.title)) return this.cancel(product, "stock-scope", `확인 창 날짜가 다름: ${r.state.pop.title}`);
    if (dry) { await this.cancel(product, null, ""); return { ok: true, dry: true }; }
    k = await this.act(`window.__naverStock.click("모든 회차")`);
    if (!k.ok) return this.cancel(product, "stock-scope", k.why);
    r = await this.until(product, (x) => x.pop && x.pop.kind === "qty", 10000, "재고 수 입력 창이 안 나옴");
    if (!r.ok) return this.cancel(product, "stock-qty", r.why);
    // 사람처럼: 칸을 누르고 키보드로 10 → [저장]이 켜졌는지 · 안 되면 값 넣는 함수로 한 번 더
    const okQty = (x) => x.pop && x.pop.kind === "qty" && x.pop.qty === String(qty) && x.pop.save;
    r = { ok: false };
    if (this.type) {
      const f = await this.act("window.__naverStock.focusQty()");
      if (f.ok) { await this.type(String(Number(qty))); r = await this.until(product, okQty, 4000, ""); }
    }
    if (!r.ok) {
      k = await this.act(`window.__naverStock.setQty(${Number(qty)})`);
      if (!k.ok) return this.cancel(product, "stock-qty", k.why);
      r = await this.until(product, okQty, 5000, `재고 칸에 ${qty}이 안 들어감 ([저장]이 안 켜짐)`);
    }
    if (!r.ok) return this.cancel(product, "stock-qty", r.why);
    k = await this.act(`window.__naverStock.click("저장")`);
    if (!k.ok) return this.cancel(product, "stock-qty", k.why);
    r = await this.until(product, (x) => !x.pop, 15000, "저장 뒤 창이 안 닫힘");
    if (!r.ok) return this.fail("stock-save", r.why);
    // 저장 뒤 경고 창(네이버가 거절)이 뜨면 실패 · "수정되었습니다" 알림은 보이면 남김
    const t = await this.until(product, (x) => !!x.toast || (!!x.modal && x.modal !== base), 3000, "");
    if (t.ok && !t.state.toast && t.state.modal && t.state.modal !== base) return this.fail("stock-save", `저장 뒤 네이버 알림: ${t.state.modal}`);
    return { ok: true, done: true, toast: !!(t.ok && t.state.toast) };
  }
  /** 끝나면 예약현황으로 (주소를 알면 주소로 · 아니면 [예약현황] 탭) — 데스크 불러오기 · 이용완료는 예약현황에서 */
  async back() {
    const r = this.urls && this.urls.calendar ? await this.act(`window.__naverStock.go(${JSON.stringify(this.urls.calendar)})`) : await this.act(`window.__naverStock.click("예약현황")`);
    await sleep(1500);
    return r;
  }
  /** 창을 닫고 실패로 (취소 버튼이 없는 창이면 페이지를 다시 불러옴 — 저장 전이라 바뀐 것 없음) · label 이 없으면 닫기만 */
  async cancel(product, label, why) {
    const c = await this.act(`window.__naverStock.click("취소")`);
    if (!c.ok) await this.act("window.__naverStock.reload()");
    if (!label) { await this.until(product, (x) => !x.pop, 5000, ""); return { ok: true }; }
    return this.fail(label, why);
  }
}

module.exports = { NaverStock, NAVER_STOCK_SOURCE, installNaverStockDriver, stockDays, stockDue, shiftDay, DOW };
