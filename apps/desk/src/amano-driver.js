/* 아마노 할인등록 웹 화면을 조작하는 코드 (아마노 페이지 안에서 실행됨)
   - 버튼·칸은 화면 좌표가 아니라 페이지 안의 글자로 찾는다: "검색", "3시간할인", "삭제", 표 머리 "입차ID · 차량번호" 등
   - 글자로 못 찾는 칸은 근무자가 한 번 눌러 기억시킨 선택자(window.__amanoSel)를 먼저 쓴다
   - 할인·삭제 때 뜨는 확인 창은 자동으로 "확인" 처리하고 내용을 기록한다 */

function installAmanoDriver() {
  if (window.__amano && window.__amano.v === 1) return true;

  const norm = (s) => String(s || "").replace(/\s+/g, "");
  const vis = (el) => !!(el && el.getClientRects().length);
  const custom = (key) => {
    try {
      const sel = (window.__amanoSel || {})[key];
      return sel ? document.querySelector(sel) : null;
    } catch (e) {
      return null;
    }
  };
  const clickables = () =>
    [...document.querySelectorAll("button, a, input[type=button], input[type=submit], [onclick], [role=button]")].filter(vis);
  const textOf = (e) => norm(e.value || e.textContent);
  const byText = (t) => {
    const n = norm(t);
    const list = clickables();
    return list.find((e) => textOf(e) === n) || list.find((e) => textOf(e).includes(n)) || null;
  };
  // 글자가 정확히 label 인 요소들 (안쪽 요소 우선)
  const labels = (label) => {
    const n = norm(label);
    return [...document.querySelectorAll("th, td, label, span, div, dt, p, b, strong, li")].filter(
      (e) => vis(e) && norm(e.textContent) === n && ![...e.children].some((c) => norm(c.textContent) === n),
    );
  };
  // label 다음(문서 순서)에 나오는 첫 입력칸
  const inputAfter = (label, types) => {
    const inputs = [...document.querySelectorAll("input")].filter(
      (e) => vis(e) && types.includes((e.getAttribute("type") || "text").toLowerCase()),
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
  const headText = (t) => norm((t.tHead || t.rows[0] || {}).textContent);
  // 머리에 heads 글자가 모두 든 표의 데이터 줄 (머리 표와 몸통 표가 따로인 화면도 처리)
  const rowsOf = (...heads) => {
    const tables = [...document.querySelectorAll("table")];
    const i = tables.findIndex((t) => heads.every((h) => headText(t).includes(h)));
    if (i < 0) return null;
    const dataRows = (t) => [...t.rows].filter((r) => !r.querySelector("th") && r.cells.length > 1 && norm(r.textContent));
    let rows = dataRows(tables[i]);
    if (!rows.length && tables[i + 1] && !tables[i + 1].querySelector("th")) rows = dataRows(tables[i + 1]);
    return rows;
  };
  // "차량번호 | 117무5514" 처럼 이름 칸 바로 옆 칸의 글자
  const valueAfterLabel = (label) => {
    for (const l of labels(label)) {
      const cell = l.closest("th, td, dt") || l;
      const nx = cell.nextElementSibling;
      if (!nx || nx.tagName === "TH" || nx.querySelector("input, select")) continue;
      const v = nx.textContent.trim().replace(/\s+/g, " ");
      if (v) return v;
    }
    return "";
  };
  const cellTexts = (r) => [...r.cells].map((x) => x.textContent.trim().replace(/\s+/g, " "));

  window.confirm = (m) => {
    window.__amanoDialog = String(m);
    return true;
  };
  window.alert = (m) => {
    window.__amanoDialog = String(m);
  };

  window.__amano = {
    v: 1,
    /** 지금 아마노 화면에 보이는 것을 읽음 */
    read() {
      const hasSearch = !!rowsOf("입차ID", "차량번호");
      const needLogin = !hasSearch && !!document.querySelector("input[type=password]");
      const rows = (rowsOf("입차ID", "차량번호") || []).map((r) => {
        const c = cellTexts(r);
        const m = (c[1] || "").match(/(\d+)\s*건/);
        return { id: c[0], no: (c[1] || "").replace(/\d+\s*건/, "").replace(/\s+/g, ""), count: m ? +m[1] : 0, at: c[2] || "" };
      });
      const history = (rowsOf("할인값", "등록자") || []).map((r) => {
        const c = cellTexts(r);
        return { type: c[0], by: c[1], at: c[2] };
      });
      const detail = { no: valueAfterLabel("차량번호").replace(/\s+/g, ""), at: valueAfterLabel("입차시간"), parked: valueAfterLabel("주차시간") };
      const types = clickables().map(textOf).filter((t) => /^\d+시간할인$/.test(t));
      return { hasSearch, needLogin, rows, history, detail, types, dialog: window.__amanoDialog || "", mark: window.__amanoMark || null };
    },
    mark(m) {
      window.__amanoMark = m;
    },
    search(day, no) {
      const d = custom("day") || inputAfter("입차일", ["text", "date", "search"]);
      const c = custom("carNo") || inputAfter("차량번호", ["text", "search", "number", "tel"]);
      const b = custom("searchBtn") || byText("검색");
      if (!c) return { ok: false, why: "아마노 화면에서 차량번호 칸을 못 찾음" };
      if (!b) return { ok: false, why: "아마노 화면에서 검색 버튼을 못 찾음" };
      if (d && day) setVal(d, day);
      setVal(c, no);
      b.click();
      return { ok: true };
    },
    select(id) {
      const r = (rowsOf("입차ID", "차량번호") || []).find((x) => cellTexts(x)[0] === String(id));
      if (!r) return { ok: false, why: "조회 목록에서 그 차량을 못 찾음" };
      (r.querySelector("a, button") || r.cells[1] || r).click();
      return { ok: true };
    },
    discount(type) {
      const b = byText(type);
      if (!b) return { ok: false, why: `아마노 화면에서 '${type}' 버튼을 못 찾음` };
      window.__amanoDialog = "";
      b.click(); // 확인 창은 누르는 순간 뜨므로 바로 기록해 둠 (그 뒤 페이지가 새로 열려도 남게)
      return { ok: true, dialog: window.__amanoDialog || "" };
    },
    remove(i) {
      const r = (rowsOf("할인값", "등록자") || [])[i];
      const b = r && [...r.querySelectorAll("button, a, input")].find((e) => textOf(e) === "삭제");
      if (!b) return { ok: false, why: "할인내역의 삭제 버튼을 못 찾음" };
      window.__amanoDialog = "";
      b.click(); // 확인 창은 누르는 순간 뜨므로 바로 기록해 둠 (그 뒤 페이지가 새로 열려도 남게)
      return { ok: true, dialog: window.__amanoDialog || "" };
    },
    /** 로그인 화면이면 아이디·비밀번호를 넣고 로그인 버튼을 누름 */
    login(id, pw) {
      const p = [...document.querySelectorAll("input[type=password]")].find(vis);
      if (!p) return { ok: false, why: "로그인 화면이 아님" };
      const inputs = [...document.querySelectorAll("input")].filter((e) => vis(e) && ["text", "email", ""].includes((e.getAttribute("type") || "").toLowerCase()));
      const u = inputs.filter((i) => i.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING).pop() || inputs[0];
      if (!u) return { ok: false, why: "아이디 칸을 못 찾음" };
      setVal(u, id);
      setVal(p, pw);
      const b = byText("로그인") || (p.form && p.form.querySelector("[type=submit], button"));
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
