/* 아마노 할인등록 웹 화면을 조작하는 코드 (아마노 페이지 안에서 실행됨)
   실제 화면(2026-10 저장본, ATS3000) 기준:
   - 페이지는 새로 열리지 않고 자리에서 바뀜. 요청 중에는 #modal-overlay 가 보임
   - 조회 목록 · 할인내역은 dhtmlx 표: 머리 표(hdr)와 몸통 표(obj)가 따로
   - 조회: 입차일 input[name=entryDate] · 차량번호 #schCarNo · "검색" 버튼
   - 할인정보: 차량번호 input#carNo · 입차시간 #entryDate · 주차시간 #differentTime · 할인 버튼 <a>3시간할인</a> …
   - 할인 버튼 → "알림 / 등록되었습니다. / OK" 창, OK 를 눌러야 다시 조회됨 → 자동으로 OK
   - 삭제 → "삭제하시겠습니까? / OK · Cancel" 창 → 자동으로 OK → "삭제가 완료 되었습니다." → 자동으로 OK
   버튼·칸은 화면 좌표가 아니라 글자로 찾는다(창이 가려져도 동작). 못 찾는 칸은 배우기 선택자(window.__amanoSel)를 먼저 쓴다. */

function installAmanoDriver() {
  if (window.__amano && window.__amano.v === 2) return true;

  const norm = (s) => String(s || "").replace(/\s+/g, "");
  const vis = (el) => !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
  const custom = (key) => {
    try {
      const sel = (window.__amanoSel || {})[key];
      return sel ? document.querySelector(sel) : null;
    } catch (e) {
      return null;
    }
  };
  const textOf = (e) => norm(e.value || e.textContent);
  const clickables = (root = document) =>
    [...root.querySelectorAll("button, a, input[type=button], input[type=submit], [onclick], [role=button]")].filter(vis);
  const byText = (t, root) => {
    const n = norm(t);
    const list = clickables(root);
    return list.find((e) => textOf(e) === n) || list.find((e) => textOf(e).includes(n)) || null;
  };
  // 실제 마우스로 누른 것처럼 (dhtmlx 표는 mousedown/click 을 봄)
  const press = (el) => {
    for (const type of ["mousedown", "mouseup", "click"]) el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  };
  // 글자가 정확히 label 인 요소들 (안쪽 요소 우선). cellsOnly 면 표의 칸(th·td·dt)만
  const labels = (label, cellsOnly) => {
    const n = norm(label);
    const sel = cellsOnly ? "th, td, dt" : "th, td, label, span, div, dt, p, b, strong, li";
    return [...document.querySelectorAll(sel)].filter(
      (e) => vis(e) && norm(e.textContent) === n && ![...e.children].some((c) => norm(c.textContent) === n),
    );
  };
  // label 다음(문서 순서)에 나오는 첫 입력칸
  const inputAfter = (label, types) => {
    const inputs = [...document.querySelectorAll("input")].filter(
      (e) => vis(e) && !e.readOnly && types.includes((e.getAttribute("type") || "text").toLowerCase()),
    );
    for (const l of labels(label)) {
      const hit = inputs.find((i) => l.compareDocumentPosition(i) & Node.DOCUMENT_POSITION_FOLLOWING);
      if (hit) return hit;
    }
    return null;
  };
  const setVal = (el, v) => {
    el.focus();
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    d.set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  // 머리 글자가 모두 든 표의 데이터 줄. dhtmlx 처럼 머리 표와 몸통 표가 따로면 바로 다음 표를 몸통으로 봄
  const rowsOf = (...heads) => {
    const tables = [...document.querySelectorAll("table")];
    const has = (t) => heads.every((h) => norm(t.textContent).includes(h));
    const i = tables.findIndex(has);
    if (i < 0) return null;
    const isHead = (r) => heads.every((h) => norm(r.textContent).includes(h));
    const dataRows = (t) => [...t.rows].filter((r) => !r.querySelector("th") && r.cells.length > 1 && norm(r.textContent) && !isHead(r));
    let rows = dataRows(tables[i]);
    if (!rows.length && tables[i + 1] && !has(tables[i + 1])) rows = dataRows(tables[i + 1]);
    return rows;
  };
  // 할인정보 칸 값: 실제 화면의 id 를 먼저, 없으면 "주차시간 | 2시간 49분" 처럼 이름 칸 옆 칸 (입력칸이면 그 값)
  const fieldValue = (id, label) => {
    const el = document.getElementById(id);
    if (el) return (el.tagName === "INPUT" ? el.value : el.textContent).trim().replace(/\s+/g, " ");
    for (const l of labels(label, true)) {
      const nx = l.nextElementSibling;
      if (!nx || nx.tagName === "TH") continue;
      const inp = nx.querySelector("input");
      const v = (inp ? inp.value : nx.textContent).trim().replace(/\s+/g, " ");
      if (v) return v;
    }
    return "";
  };
  const cellTexts = (r) => [...r.cells].map((x) => x.textContent.trim().replace(/\s+/g, " "));
  const busy = () => {
    const o = document.getElementById("modal-overlay") || document.getElementById("spinner_bg");
    return !!(o && vis(o));
  };

  // 브라우저 기본 확인 창도 자동 확인
  window.confirm = (m) => {
    window.__amanoDialog = String(m);
    return true;
  };
  window.alert = (m) => {
    window.__amanoDialog = String(m);
  };

  window.__amano = {
    v: 2,
    /** 떠 있는 알림·확인 창을 닫음: OK · 확인 · 닫기 순으로 누르고, 내용을 기록 */
    dismiss() {
      const boxes = [...document.querySelectorAll(".modal-box, .ui-dialog, [role=dialog]")].filter(vis);
      for (const box of boxes) {
        const btn = ["OK", "확인", "닫기"].map((t) => clickables(box).find((e) => textOf(e).toUpperCase() === t.toUpperCase())).find(Boolean);
        if (!btn) continue;
        const txt = (box.querySelector(".modal-text, .ui-dialog-content") || box).textContent.trim().replace(/\s+/g, " ");
        window.__amanoDialog = txt;
        btn.click();
        return txt;
      }
      return "";
    },
    /** 지금 아마노 화면에 보이는 것을 읽음 */
    read() {
      const listRows = rowsOf("입차ID", "차량번호", "입차시간");
      const hasSearch = !!listRows;
      const needLogin = !hasSearch && !!document.querySelector("input[type=password]");
      const rows = (listRows || []).map((r) => {
        const c = cellTexts(r);
        const m = (c[1] || "").match(/(\d+)\s*건/);
        return { id: c[0], no: (c[1] || "").replace(/\d+\s*건/, "").replace(/\s+/g, ""), count: m ? +m[1] : 0, at: c[2] || "" };
      });
      const history = (rowsOf("할인값", "등록자", "등록시간") || []).map((r) => {
        const c = cellTexts(r);
        const off = c.length >= 5 ? 1 : 0; // 맨 앞 '순번' 칸
        return { type: c[off], by: c[off + 1], at: c[off + 2], canDelete: [...r.querySelectorAll("input, button, a")].some((e) => textOf(e) === "삭제"), note: c[off + 3] || "" };
      });
      // 상세 차량번호 칸이 비어 있으면 조회 목록에서 선택된 줄의 차량번호를 씀 (dhtmlx: tr.rowselected)
      const selRow = (listRows || []).find((r) => /rowselected/.test(r.className));
      const selNo = selRow ? (cellTexts(selRow)[1] || "").replace(/\d+\s*건/, "").replace(/\s+/g, "") : "";
      const detail = {
        no: fieldValue("carNo", "차량번호").replace(/\s+/g, "") || (fieldValue("entryDate", "입차시간") ? selNo : ""),
        at: fieldValue("entryDate", "입차시간"),
        parked: fieldValue("differentTime", "주차시간"),
      };
      const types = clickables().map(textOf).filter((t) => /^\d+시간할인$/.test(t));
      return { hasSearch, needLogin, busy: busy(), rows, history, detail, types, dialog: window.__amanoDialog || "", mark: window.__amanoMark || null };
    },
    mark(m) {
      window.__amanoMark = m;
    },
    search(day, no) {
      const d = custom("day") || document.querySelector("input[name=entryDate]") || inputAfter("입차일", ["text", "date", "search"]);
      const c = custom("carNo") || document.getElementById("schCarNo") || inputAfter("차량번호", ["text", "search", "number", "tel"]);
      const b = custom("searchBtn") || byText("검색");
      if (!c) return { ok: false, why: "아마노 화면에서 차량번호 칸을 못 찾음" };
      if (!b) return { ok: false, why: "아마노 화면에서 검색 버튼을 못 찾음" };
      if (d && day) setVal(d, day);
      setVal(c, no);
      press(b);
      return { ok: true };
    },
    select(id) {
      const r = (rowsOf("입차ID", "차량번호", "입차시간") || []).find((x) => cellTexts(x)[0] === String(id));
      if (!r) return { ok: false, why: "조회 목록에서 그 차량을 못 찾음" };
      press(r.cells[1] || r.cells[0]);
      return { ok: true };
    },
    discount(type) {
      const b = byText(type, document.getElementById("div_dscntcodes") || document);
      if (!b) return { ok: false, why: `아마노 화면에서 '${type}' 버튼을 못 찾음` };
      window.__amanoDialog = "";
      b.click(); // <a href="javascript:fncSetDscntType('1')">
      return { ok: true };
    },
    remove(i) {
      const r = (rowsOf("할인값", "등록자", "등록시간") || [])[i];
      const b = r && [...r.querySelectorAll("button, a, input")].find((e) => textOf(e) === "삭제");
      if (!b) return { ok: false, why: "삭제할 수 없는 할인내역 (등록한 계정만 삭제 가능)" };
      window.__amanoDialog = "";
      b.click();
      window.__amano.dismiss(); // "삭제하시겠습니까?" → OK
      return { ok: true };
    },
    /** 로그인 화면이면 아이디·비밀번호를 넣고 로그인 버튼을 누름 */
    login(id, pw) {
      const p = [...document.querySelectorAll("input[type=password]")].find(vis);
      if (!p) return { ok: false, why: "로그인 화면이 아님" };
      const inputs = [...document.querySelectorAll("input")].filter((e) => vis(e) && ["text", "email", ""].includes((e.getAttribute("type") || "").toLowerCase()));
      const u = inputs.filter((x) => x.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING).pop() || inputs[0];
      if (!u) return { ok: false, why: "아이디 칸을 못 찾음" };
      setVal(u, id);
      setVal(p, pw);
      const b = byText("로그인") || byText("LOGIN") || (p.form && p.form.querySelector("[type=submit], button"));
      if (b) b.click();
      else if (p.form) p.form.requestSubmit ? p.form.requestSubmit() : p.form.submit();
      else return { ok: false, why: "로그인 버튼을 못 찾음" };
      return { ok: true };
    },
    /** 배우기: 근무자가 다음에 누르는 칸·버튼의 선택자를 돌려줌 */
    learn() {
      return new Promise((resolve) => {
        const pathOf = (el) => {
          if (el.id) return `#${CSS.escape(el.id)}`;
          if (el.name) {
            const s = `${el.tagName.toLowerCase()}[name="${el.name}"]`;
            if (document.querySelectorAll(s).length === 1) return s;
          }
          const parts = [];
          for (let e = el; e && e.nodeType === 1 && e !== document.body; e = e.parentElement) {
            const sib = [...e.parentElement.children].filter((x) => x.tagName === e.tagName);
            parts.unshift(`${e.tagName.toLowerCase()}:nth-of-type(${sib.indexOf(e) + 1})`);
          }
          return "body > " + parts.join(" > ");
        };
        const on = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          document.removeEventListener("click", on, true);
          resolve(pathOf(ev.target.closest("input, button, a, select, textarea") || ev.target));
        };
        document.addEventListener("click", on, true);
      });
    },
  };
  return true;
}

const DRIVER_SOURCE = installAmanoDriver.toString();

if (typeof module !== "undefined") module.exports = { DRIVER_SOURCE, installAmanoDriver };
