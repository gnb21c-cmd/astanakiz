/* 재방문 안내 → 네이버 톡톡으로 보내기 (사장님 11/16 — 실제 화면 사진으로 순서를 알려 주심)
   스마트플레이스 왼쪽 메뉴 [고객] → 위 '예약·주문' → 검색 칸 앞 선택을 '전화번호'로 → 뒷번호 4자리 → 목록
   → 손님 맞추기 (이름으로 찾으면 동명이인이 많아 뒷번호로: 목록에 번호가 다 보이면 번호가 같은 줄 · 가려진 줄(유*석 · ***-****-1313)은 이름 모양 + 뒷번호가 같은 줄이 하나뿐일 때만)
   → 줄을 눌러 오른쪽 고객 카드에서 이름 · 전화번호를 한 번 더 확인 → [톡톡 대화하기] → 새 창(팝업) 대화창
   → 글(문구) 칸에 넣고 [전송] · 사진은 파일 고르기 창 없이 대화창의 사진 칸(input type=file)에 바탕화면 이미지를 바로 넣음 (고르면 바로 보내짐)
   - 확인만(dry): 대화창이 열리고 글 칸 · 전송 · 사진 칸이 있는지까지만 보고 아무것도 안 보냄
   - 안전: 맞는 손님이 하나로 정해지지 않으면 그 손님은 건너뜀(까닭) · 카드에서 번호 · 이름이 다르면 멈춤 · 네이버 밖 링크는 안 누름
   - 화면 클래스 이름은 네이버가 바꿀 수 있어 글자(고객 · 예약·주문 · 전화번호 · 톡톡 대화하기 · 메시지를 입력해 주세요 · 전송)로 찾음
   installTalkSendDriver = 네이버 페이지(스마트플레이스 · 톡톡 대화창) 안에서 실행 (window.__tsend) · TalkSend = Node 쪽 (앱: 숨은 네이버 창 · 시험: 가짜 화면) */

function installTalkSendDriver() {
  if (window.__tsend && window.__tsend.v === 1) return true;
  const norm = (s) => String(s || "").replace(/\s+/g, "").replace(/[ㆍ•・.]/g, "·");
  const vis = (el) => !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const leafs = (root = document) => $$("*", root).filter((e) => !e.children.length && vis(e));
  const txt = (el) => (el ? el.textContent.trim().replace(/\s+/g, " ") : "");
  const own = (e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
  const clickable = (e) => e && (e.closest("button, a, [role=button], [role=tab], [role=option], li, label") || e);
  /** 네이버 안에서만 (다른 곳 · 새 창 링크는 안 누름) — 톡톡 대화하기는 데스크가 새 창을 받아 줌 */
  const inside = (el) => { const a = el.closest("a[href]"); if (!a) return true; const h = a.getAttribute("href") || ""; if (!h || /^(#|javascript:)/i.test(h)) return true; try { return /(^|\.)naver\.com$/.test(new URL(h, location.href).hostname) || new URL(h, location.href).protocol === "file:"; } catch (e) { return false; } };
  const press = (el) => { if (!el || !inside(el)) return false; el.scrollIntoView({ block: "center" }); el.click(); return true; };
  /** 글자가 딱 그것인 요소 — 글자만 있는 칸, 또는 아이콘 + 글자 단추처럼 자기 글자가 그것인 칸 (2.24 현장 11/16: 아이콘 붙은 [톡톡 대화하기]를 못 찾았음) */
  const byText = (t, root = document) => { const w = norm(t); return $$("*", root).filter((e) => vis(e) && ((!e.children.length && norm(e.textContent) === w) || (e.children.length && norm(own(e)) === w && norm(e.textContent) === w))); };
  // 전화번호 모양: 다 보이거나 가려진 것 (***-****-1313 · 010-****-1313 · 010-30**-1313 …)
  const PHONE = /^[\d*＊∗●○]{2,3}-[\d*＊∗●○]{3,4}-\d{4}$/;
  const NAME = /^[가-힣*＊∗●○]{1,8}$/;
  const BADGE = /^(신규|단골|블랙리스트|예약|주문|완료|확정|노쇼|취소|방문|톡톡|네이버|스마트콜|고객|회원|대리예약|정보변경|등록경로|전화번호|이름|메모|태그|선택)$/;
  const nameEl = (row, not) => [...row.querySelectorAll("[class*=name], [class*=Name]")].find((e) => e !== not && vis(e) && NAME.test(norm(e.textContent)) && !BADGE.test(norm(e.textContent)))
    || leafs(row).find((e) => e !== not && NAME.test(norm(e.textContent)) && !BADGE.test(norm(e.textContent)));
  const setVal = (el, v) => {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const searchInput = () => $$("input").filter((i) => vis(i) && /^(text|search|)$/i.test(i.type || "") && !i.closest("nav, aside")).find((i) => { const box = i.closest("form, div"); return box && /이름|전화번호/.test(box.textContent); });
  /* 검색 칸 앞 선택 상자 (2.24 현장 11/16 — 상자가 '이름' 그대로라 뒷번호로 찾으면 0명이었음 · '∨'는 글자가 아닌 그림 · 펼친 목록은 화면 다른 곳에 · 아래 표 머리글에도 '이름↑ · 전화번호')
     → 화면 위치로: 검색 칸과 같은 줄 · 바로 왼쪽(260px 안)에 글자가 딱 '이름' 또는 '전화번호'인 것 (표 머리글은 뺌) */
  const R = (e) => e.getBoundingClientRect();
  const TYPE_RE = /^(이름|전화번호)$/;
  const isText = (e, re) => re.test(norm(own(e))) || (!e.children.length && re.test(norm(e.textContent)));
  const inHead = (e) => !!e.closest("thead, th, [role=columnheader], [class*=list-header], [class*=ListHeader]");
  const typeToggle = (inp) => {
    if (!inp) return null;
    // 실제 화면 (11/16 저장본): <form class="BookingTextSearch__root"><div class="…select-box"><a role="button" class="…select">전화번호</a></div><input type="search"> …
    const f = inp.closest("form");
    const st = f && [...f.querySelectorAll("[class*=select] [role=button], [role=button][class*=select], [class*=select] button, select")].find((x) => vis(x) && /^(이름|전화번호)/.test(norm(x.tagName === "SELECT" ? (x.options[x.selectedIndex] || {}).text : x.textContent)));
    if (st) return st;
    const ir = R(inp), cy = ir.top + ir.height / 2, band = Math.max(ir.height, 24);
    const same = (e) => { const r = R(e); return Math.abs(r.top + r.height / 2 - cy) < band && r.right <= ir.left + 12 && r.left >= ir.left - 260; };
    const sel = $$("select").find((x) => vis(x) && [...x.options].some((o) => /전화번호/.test(o.text)) && same(x));
    if (sel) return sel;
    const c = $$("*").filter((e) => vis(e) && isText(e, TYPE_RE) && !inHead(e) && same(e)).sort((a, b) => R(b).right - R(a).right)[0];
    return c ? c.closest("button, [role=button], [role=combobox]") || c : null;
  };
  const typeOf = (tg) => { if (!tg) return ""; if (tg.tagName === "SELECT") { const o = tg.options[tg.selectedIndex]; return o ? norm(o.text) : ""; } const m = norm(tg.textContent).match(/^(이름|전화번호)/); return m ? m[1] : ""; };
  /** 'N명' (검색 칸 아래 가장 가까운 것) */
  const countOf = (inp) => {
    const c = $$("*").filter((e) => vis(e) && /^\d+명$/.test(norm(e.textContent)) && ![...e.children].some((x) => /^\d+명$/.test(norm(x.textContent))));
    if (!c.length) { const m = norm(document.body.innerText).match(/(\d+)명/); return m ? +m[1] : null; }
    if (inp) { const ir = R(inp); c.sort((a, b) => Math.abs(R(a).top - ir.bottom) - Math.abs(R(b).top - ir.bottom)); }
    return +norm(c[0].textContent).replace(/\D/g, "");
  };
  /** 전화번호 칸: 글자 전체가 번호 모양인 가장 작은 칸 — 뒷번호만 초록으로 따로 칠한 두 조각(010-3732- + 6371)도 한 칸으로 */
  const phoneEls = (root = document) => $$("*", root).filter((e) => vis(e) && PHONE.test(norm(e.textContent)) && ![...e.children].some((c) => PHONE.test(norm(c.textContent))));
  /** 목록 줄: 전화번호 칸마다 { name, phone, el(누를 이름) } — 화면 위치로 짝지음: 같은 줄 높이 · 번호 왼쪽 가장 가까운 이름 (2.25 현장 11/16: 이름 칸 · 번호 칸이 따로 그려지면 줄을 못 읽었음)
      오른쪽 고객 카드(처음에 저절로 뜨는 첫 손님 카드) · 왼쪽 메뉴 · 표 머리글은 뺌 */
  const listPhones = () => { const cb = cardBox(); return phoneEls().filter((e) => !(cb && cb.contains(e)) && !e.closest("nav, aside")); };
  const rows = () => {
    // 실제 화면 (11/16 저장본): 줄마다 이름 · 고르기 단추(radio title=이름 value=고객번호) · 창이 넓을 때만 전화번호 칸
    const radios = $$("input[type=radio]").filter((r) => r.title && NAME.test(norm(r.title)) && r.closest("[class*=list-row], [class*=ListRow], tr, li"));
    if (radios.length) return radios.map((r) => {
      const row = r.closest("[class*=list-row], [class*=ListRow], tr, li");
      const ph = phoneEls(row)[0];
      const nm = [...row.querySelectorAll("[class*=text-value], [class*=name], [class*=Name]")].find((e) => vis(e) && !e.querySelector("input") && NAME.test(norm(e.textContent))) || r.closest("label") || row;
      return { name: norm(r.title), phone: ph ? norm(ph.textContent) : "", id: String(r.value || ""), el: nm };
    });
    const cb = cardBox(), out = [];
    const names = $$("*").filter((e) => vis(e) && (isText(e, NAME) || (!e.children.length && NAME.test(norm(e.textContent)))) && !BADGE.test(norm(own(e) || e.textContent)) && !(cb && cb.contains(e)) && !e.closest("nav, aside") && !inHead(e) && !e.closest("[class*=Index], [class*=index]"));
    for (const ph of listPhones()) {
      const pr = R(ph), cy = pr.top + pr.height / 2, band = Math.max(pr.height, 18) * 0.75;
      const nm = names.map((e) => ({ e, r: R(e) })).filter(({ r }) => Math.abs(r.top + r.height / 2 - cy) < band && r.right <= pr.left + 4 && pr.left - r.right < 420)
        .sort((a, b) => b.r.right - a.r.right)[0];
      if (!nm) continue;
      out.push({ name: norm(own(nm.e) || nm.e.textContent), phone: norm(ph.textContent), el: nm.e });
    }
    return out;
  };
  /** 오른쪽 고객 카드: '등록경로' · '전화번호' 이름표가 함께 있는 가장 작은 칸 → 목록(다른 번호)이 섞이기 전까지 넓힘 (이름 · [톡톡 대화하기]가 옆 칸에 있어도 잡히게) */
  const phones = (root) => phoneEls(root).length;
  function cardBox() {
    const lab = byText("등록경로")[0];
    let box = lab;
    for (let k = 0; box && k < 8 && !byText("전화번호", box).length; k++) box = box.parentElement;
    if (!box || !byText("전화번호", box).length) return null;
    const mixed = (e) => !!e.querySelector("input[type=radio], input[type=search], input[type=text]");
    for (let k = 0; k < 5 && box.parentElement && box.parentElement !== document.body && phones(box.parentElement) <= phones(box) && !mixed(box.parentElement); k++) box = box.parentElement;
    return box;
  }
  const card = () => {
    const box = cardBox();
    if (!box) return null;
    const val = (label) => { const l = byText(label, box)[0]; if (!l) return ""; const v = l.nextElementSibling || (l.parentElement && l.parentElement.nextElementSibling); return v ? txt(v) : ""; };
    const NOT = /^(등록경로|전화번호|이메일|특이사항|정보변경|예약내역|주문내역|고객정보|메모|태그|완료|노쇼|취소|방문|예약|주문|닫기)$/;
    const okName = (e) => e && NAME.test(norm(e.textContent)) && !NOT.test(norm(e.textContent)) && !BADGE.test(norm(e.textContent));
    const lab = byText("등록경로", box)[0];
    const before = (e) => !lab || !!(e.compareDocumentPosition(lab) & Node.DOCUMENT_POSITION_FOLLOWING); // 이름은 '등록경로' 위 머리에
    const head = [...box.querySelectorAll("h1, h2, h3, h4, strong, [class*=name], [class*=Name]")].find((e) => vis(e) && okName(e) && before(e)) || leafs(box).find((e) => okName(e) && before(e));
    const link = box.querySelector("[data-tst_click_link], a[href*='users/']");
    const id = link ? String(link.getAttribute("data-tst_click_link") || link.getAttribute("href") || "").replace(/\D/g, "") : "";
    const tel = box.querySelector("a[href^='tel:']");
    return { name: head ? norm(head.textContent) : "", phone: norm(val("전화번호") || (tel ? tel.textContent : "")), path: val("등록경로"), id, talk: !!byText("톡톡 대화하기", box).length };
  };
  window.__tsend = {
    v: 1,
    /** 지금 화면 */
    state() {
      const inp = searchInput(), tg = inp ? typeToggle(inp) : null, c = card();
      const area = $$("textarea").find((t) => vis(t) && /메시지/.test(t.placeholder || ""));
      return {
        url: location.href,
        navCustomers: !!byText("고객").some((e) => e.closest("nav, aside, [class*=nav], [class*=Nav], [class*=menu], [class*=Menu], [class*=gnb], [class*=lnb]")),
        customers: !!inp && byText("예약·주문").length > 0,
        type: typeOf(tg),
        q: inp ? inp.value : "",
        count: countOf(inp),
        rows: rows().map(({ name, phone, id }) => ({ name, phone, id: id || "" })),
        phonesSeen: listPhones().length,
        card: c,
        chat: area ? { input: true, send: !!byText("전송").length, file: $$("input[type=file]").length > 0, imgs: $$("img").length, len: document.body.innerText.length } : null,
      };
    },
    /** 왼쪽 메뉴 [고객] */
    openCustomers() { const e = byText("고객").find((x) => x.closest("nav, aside, [class*=nav], [class*=Nav], [class*=menu], [class*=Menu], [class*=gnb], [class*=lnb]")); return { ok: press(clickable(e)) }; },
    /** '예약·주문' 탭 */
    tab() { const e = byText("예약·주문")[0]; return { ok: press(clickable(e)) }; },
    /** 검색 칸 앞 선택을 '전화번호'로 (펼침 → 고르기) */
    openType() { const inp = searchInput(), tg = inp && typeToggle(inp); if (!tg) return { ok: false, why: "검색 칸 앞 선택(이름 · 전화번호)을 못 찾음" }; if (tg.tagName === "SELECT") { const o = [...tg.options].find((x) => /전화번호/.test(x.text)); if (o) { tg.value = o.value; tg.dispatchEvent(new Event("change", { bubbles: true })); } return { ok: !!o, select: true }; } return { ok: press(tg) }; },
    /** 펼친 선택지에서 고르기 — 선택 상자 바로 아래에서 가장 가까운 그 글자 (표 머리글 '전화번호'는 멀고 · 머리글 칸은 뺌) */
    pickType(t) {
      const inp = searchInput(), tg = inp && typeToggle(inp);
      if (!tg) return { ok: false, why: "검색 칸 앞 선택(이름 · 전화번호)을 못 찾음" };
      const tr = R(tg), re = new RegExp("^" + norm(t) + "$");
      const c = $$("*").filter((e) => vis(e) && isText(e, re) && !tg.contains(e) && !inHead(e))
        .map((e) => { const r = R(e); return { e, d: Math.hypot(r.left - tr.left, r.top - tr.bottom), below: r.top >= tr.top + tr.height * 0.5 }; })
        .filter((x) => x.below && x.d < 320).sort((a, b) => a.d - b.d)[0];
      if (!c) return { ok: false, why: `펼친 선택에서 '${t}'를 못 찾음` };
      return { ok: press(clickable(c.e)) };
    },
    /** 검색: 글을 넣고 돋보기 (사장님 11/16: 돋보기를 눌러야 찾음) — 돋보기 = 검색 칸과 같은 줄 · 오른쪽 140px 안 맨 오른쪽 단추 (지우기 ⊗ 는 뺌) · 못 찾으면 Enter */
    typeQuery(q) { const inp = searchInput(); if (!inp) return { ok: false, why: "검색 칸을 못 찾음" }; inp.focus(); setVal(inp, q); return { ok: true }; },
    search(q) {
      const inp = searchInput(); if (!inp) return { ok: false, why: "검색 칸을 못 찾음" };
      inp.focus(); if (q != null && inp.value !== q) setVal(inp, q);
      const tg = typeToggle(inp), ir = R(inp), cy = ir.top + ir.height / 2, band = Math.max(ir.height, 24);
      const clear = (b) => /지우|삭제|clear|reset|delete|remove/i.test([b.getAttribute("aria-label"), b.title, typeof b.className === "string" ? b.className : "", norm(b.textContent)].join(" "));
      // 실제 화면: 같은 form 안 속 글자가 '검색'인 단추 (<button class="…btn-search"><i/><span class="sr-only">검색</span>) · 없으면 화면 위치
      const f = inp.closest("form");
      const btn = (f && [...f.querySelectorAll("button, [role=button]")].find((b) => b !== tg && !clear(b) && (norm(b.textContent) === "검색" || /btn-search|search-btn|btnSearch/i.test(typeof b.className === "string" ? b.className : ""))))
        || $$("button, [role=button], a").filter((b) => vis(b) && b !== tg && !(tg && tg.contains(b)) && !clear(b) && (() => { const r = R(b); return Math.abs(r.top + r.height / 2 - cy) < band && r.left >= ir.right - 6 && r.left <= ir.right + 140; })())
          .sort((a, b) => R(b).right - R(a).right)[0];
      if (btn && inside(btn)) { btn.click(); return { ok: true, how: "돋보기" }; }
      for (const t of ["keydown", "keypress", "keyup"]) inp.dispatchEvent(new KeyboardEvent(t, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      return { ok: true, how: "Enter" };
    },
    /** 목록 i 번째 줄 누르기 */
    openRow(i) { const r = rows()[i]; if (!r) return { ok: false, why: "그 줄이 없음" }; r.el.scrollIntoView({ block: "center" }); r.el.click(); return { ok: true }; },
    /** 카드의 [톡톡 대화하기] */
    talk() { const c = byText("톡톡 대화하기")[0]; if (!c) return { ok: false, why: "[톡톡 대화하기]를 못 찾음" }; clickable(c).click(); return { ok: true }; },
    /** 대화창: 글 넣기 · [전송] */
    chatText(t) { const area = $$("textarea").find((x) => vis(x) && /메시지/.test(x.placeholder || "")); if (!area) return { ok: false, why: "글 칸을 못 찾음" }; area.focus(); setVal(area, t); return { ok: true }; },
    chatSend() { const b = byText("전송").map(clickable).find((x) => x && !x.disabled); if (!b) return { ok: false, why: "[전송]을 못 찾음 (눌리지 않는 상태)" }; b.click(); return { ok: true }; },
    chatValue() { const area = $$("textarea").find((x) => vis(x) && /메시지/.test(x.placeholder || "")); return area ? area.value : null; },
    /** 사진 칸 (input type=file) 고르는 글 — 앱이 이 칸에 파일을 넣음 */
    fileSelector() { const fs = $$("input[type=file]"); const f = fs.find((x) => /image/.test(x.accept || "")) || fs[0]; if (!f) return ""; f.setAttribute("data-tsend-file", "1"); return "input[data-tsend-file='1']"; },
    has(t) { return norm(document.body.innerText).includes(norm(t)); },
  };
  return true;
}
const TALKSEND_DRIVER_SOURCE = installTalkSendDriver.toString();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 사진 칸에 넣을 파일: 이름에 한글이 있으면 영문 이름 복사본(임시 폴더)으로 — 브라우저가 한글 경로를 못 읽는 컴퓨터가 있음 (언어 설정) · 손님에게 파일 이름이 보여도 무난하게 */
function asciiCopy(file) {
  const fs = require("fs"), os = require("os"), path = require("path"), crypto = require("crypto");
  if (/^[\x20-\x7e]*$/.test(file)) return file;
  const dir = path.join(os.tmpdir(), "astanakiz-talk");
  fs.mkdirSync(dir, { recursive: true });
  const ext = (path.extname(file).match(/^\.[A-Za-z0-9]{1,5}$/) || [".jpg"])[0];
  const out = path.join(dir, "astanakiz-" + crypto.createHash("sha256").update(path.basename(file)).digest("hex").slice(0, 8) + ext);
  fs.copyFileSync(file, out);
  return out;
}
const digits = (s) => String(s || "").replace(/\D/g, "");
const MASK = /[*＊∗●○]/;
/** 가려진 이름(유*석 · 남궁*진 · 염*)과 실제 이름이 같은 모양인가 — 가린 글자는 아무 글자 하나 · 길이가 같으면 자리마다 · 끝을 가렸으면(염* · 남궁**) 보이는 앞글자가 같으면 */
function nameLike(shown, real) {
  const s = String(shown || "").replace(/\s+/g, ""), r = String(real || "").replace(/\s+/g, "");
  if (!s || !r) return false;
  if (!MASK.test(s)) return s === r;
  if (s.length === r.length) return [...s].every((c, i) => MASK.test(c) || c === r[i]);
  const head = s.replace(/[*＊∗●○]+$/, "");
  return !MASK.test(head) && head.length >= 1 && head.length < r.length && r.startsWith(head);
}
/** 가린 번호(***-****-1313 · 010-30**-1313)가 그 번호와 같은 모양인가 — 보이는 숫자는 같은 자리가 같아야 함 · 뒷 4자리는 꼭 같아야 함 */
function phoneLike(shown, tp) {
  const s = String(shown || "").replace(/[^\d*＊∗●○]/g, "");
  if (digits(s).slice(-4) !== tp.slice(-4) || s.length < 4) return false;
  if (s.length !== tp.length) return true;
  return [...s].every((c, i) => MASK.test(c) || c === tp[i]);
}
/** 목록에서 그 손님 줄 고르기 — { i, how } 또는 { why }
    번호가 다 보이는 줄 중 번호가 같은 줄 → 그 줄 (같은 번호가 여럿이면 같은 사람으로 보고 첫 줄)
    없으면 가려진 줄(***-****-1313) 중 뒷번호 · 이름 모양이 같은 줄이 하나뿐일 때만 · 둘 이상이면 건너뜀 (근무자가 확인) */
function pickRow(rows, target) {
  const tp = digits(target.phone), last4 = tp.slice(-4);
  if (tp.length < 10) return { why: "전화번호가 없거나 짧음" };
  const full = rows.map((r, i) => ({ r, i })).filter(({ r }) => digits(r.phone) === tp);
  if (full.length) return { i: full[0].i, how: "번호" };
  const masked = rows.map((r, i) => ({ r, i })).filter(({ r }) => MASK.test(r.phone) && phoneLike(r.phone, tp) && nameLike(r.name, target.name));
  if (masked.length === 1) return { i: masked[0].i, how: "가린 번호 · 이름" };
  if (masked.length > 1) return { why: `가려진 손님 중 이름 · 뒷번호가 같은 사람이 ${masked.length}명 — 근무자가 확인` };
  if (!rows.length) return { why: "네이버 고객에서 뒷번호로 찾은 사람이 없음" };
  // 왜 못 맞췄는지 보이게 (현장 POS 화면에만): 뒷번호가 같은 줄이 어떻게 보였는지 — 이름 · 번호 모양이 예상과 다르면 여기서 알 수 있음
  const same = rows.filter((r) => digits(r.phone).slice(-4) === last4);
  return { why: `네이버 고객에서 그 번호 · 이름을 못 찾음 (목록 ${rows.length}명 · 뒷번호 ${last4} 같은 줄 ${same.length ? same.slice(0, 3).map((r) => `${r.name} ${r.phone}`).join(", ") : "없음"})` };
}
/** 고객 카드 확인: 번호가 다 보이면 같은 번호 · 가려졌으면 뒷번호 + 이름 모양 */
function cardOk(card, target, how) {
  if (!card) return { why: "고객 카드가 안 뜸" };
  const cp = digits(card.phone), tp = digits(target.phone);
  if (!/\*/.test(card.phone) && cp.length >= 10) return cp === tp ? { ok: true } : { why: "고객 카드 전화번호가 다름" };
  if (cp.length < 4 || cp.slice(-4) !== tp.slice(-4)) return { why: "고객 카드 뒷번호가 다름" };
  if (!card.name) return { why: "고객 카드 번호가 가려져 있고 이름도 안 보여 확인할 수 없음" };
  if (!nameLike(card.name, target.name)) return { why: "고객 카드 이름이 다름" };
  return { ok: true };
}

class TalkSend {
  /** exec(code) = 스마트플레이스 창에서 실행 · opts.home = 고객 화면(또는 스마트플레이스) 주소 · opts.popup() = 톡톡 대화하기로 열린 새 창 { exec, setFile(selector, path), close() } · opts.shot(name) = 진단 사진 */
  constructor(exec, opts = {}) {
    this.exec = exec;
    this.opts = opts;
    this.wait = opts.wait || 8000;
    this.onStep = opts.onStep || (() => {});
  }
  call(expr, ex = this.exec) { return ex(`(() => { (${TALKSEND_DRIVER_SOURCE})(); return ${expr}; })()`); }
  async state(ex = this.exec) { for (let i = 0; i < 40; i++) { try { return await this.call("window.__tsend.state()", ex); } catch (e) { await sleep(250); } } throw new Error("네이버 화면을 읽지 못함"); }
  async until(fn, ms = this.wait, ex = this.exec) { const t0 = Date.now(); let s = null; while (Date.now() - t0 < ms) { s = await this.state(ex).catch(() => null); if (s && fn(s)) return s; await sleep(250); } return null; }
  async shot(name) { if (this.opts.shot) await this.opts.shot(name).catch(() => {}); }
  /** 스마트플레이스 '고객' → 예약·주문 → 전화번호로 */
  async openCustomers() {
    let s = await this.state();
    if (!s.customers) {
      if (this.opts.home && !s.navCustomers) { await this.opts.go(this.opts.home); s = await this.until((x) => x.navCustomers || x.customers, 15000); if (!s) return { ok: false, why: "스마트플레이스가 안 열림 (네이버 로그인 · 주소 확인)" }; }
      if (!s.customers) { await this.call("window.__tsend.openCustomers()"); s = await this.until((x) => x.customers, 15000); }
      if (!s) return { ok: false, why: "왼쪽 메뉴 [고객] 화면이 안 열림" };
    }
    if (s.type !== "전화번호") {
      const o = await this.call("window.__tsend.openType()");
      if (!o.ok) return o;
      if (!o.select) { await sleep(400); const pk = await this.call(`window.__tsend.pickType("전화번호")`); if (!pk.ok) return Object.assign({ step: "검색 선택" }, pk); }
      s = await this.until((x) => x.customers && x.type === "전화번호", 6000);
      if (!s) return { ok: false, why: "검색 선택을 '전화번호'로 못 바꿈" };
    }
    return { ok: true };
  }
  /** 한 사람: 찾기 → 맞추기 → 카드 확인 → 대화창 → (보내기) — job = { name, phone, text, image(파일 경로) } · dry = 대화창까지만 */
  async one(job, dry) {
    const step = (t) => this.onStep(`${job.name}: ${t}`);
    step("고객 화면");
    let r = await this.openCustomers();
    if (!r.ok) return Object.assign({ step: "고객 화면" }, r);
    const last4 = digits(job.phone).slice(-4);
    step(`뒷번호 ${last4} 검색`);
    // 번호를 넣고 → 화면이 받을 틈 → 칸에 번호가 들어간 것을 보고 → 돋보기 (넣자마자 누르면 빈 칸으로 찾을 수 있음 · 2.25 현장 11/16)
    const tq = await this.call(`window.__tsend.typeQuery(${JSON.stringify(last4)})`);
    if (!tq.ok) return Object.assign({ step: "검색" }, tq);
    await sleep(500);
    if (!(await this.until((x) => x.q === last4, 3000))) await this.call(`window.__tsend.typeQuery(${JSON.stringify(last4)})`);
    await sleep(200);
    const q = await this.call(`window.__tsend.search(${JSON.stringify(last4)})`);
    if (!q.ok) return Object.assign({ step: "검색" }, q);
    await sleep(600);
    let s = await this.until((x) => x.customers && x.q === last4 && (x.rows.length > 0 || x.count === 0), 10000);
    if (!s) {
      const z = await this.state().catch(() => null);
      return { ok: false, step: "검색", why: z ? `검색 결과가 안 뜸 (선택 '${z.type || "?"}' · 칸 '${z.q}' · ${z.count == null ? "?" : z.count}명 · 번호 칸 ${z.phonesSeen} · 읽은 줄 ${z.rows.length} · ${q.how || ""})` : "검색 결과가 안 뜸" };
    }
    if (s.type !== "전화번호") return { ok: false, step: "검색", why: `검색 선택이 '${s.type || "?"}' — '전화번호'로 찾지 않아 멈춤` };
    s = await this.settle(s); // 앞 검색 목록이 남아 있거나 아직 그리는 중이면 멈출 때까지
    await this.shot("1-검색");
    let pick, card;
    if (!s.rows.length) return { ok: false, skip: true, step: "맞추기", why: `네이버 고객에서 뒷번호 ${last4}로 찾은 사람이 없음`, rows: 0 };
    if (s.rows.some((r) => r.phone)) {
      // 창이 넓어 목록에 전화번호가 보이면: 번호로 맞추고 → 그 줄을 눌러 고객 정보로 한 번 더 확인
      pick = pickRow(s.rows, job);
      if (pick.why) return { ok: false, skip: true, step: "맞추기", why: pick.why, rows: s.rows.length };
      card = await this.openCard(pick.i, s.rows[pick.i]);
      const ok = cardOk(card, job, pick.how);
      if (!ok.ok) return { ok: false, skip: true, step: "카드 확인", why: ok.why };
    } else {
      // 앱 창(실제 화면 11/16): 목록에 이름만 → 이름이 같은 줄(가린 이름은 모양이 같은 줄)을 눌러 오른쪽 고객 정보의 전화번호로 확인 (사장님이 손으로 하는 순서)
      pick = await this.byCard(s.rows, job);
      if (pick.why) return { ok: false, skip: true, step: "맞추기", why: pick.why, rows: s.rows.length };
      card = pick.card;
    }
    step(`목록 ${s.rows.length}명 중 ${pick.how}로 맞춤`);
    await this.shot("2-고객카드");
    if (!card.talk) return { ok: false, skip: true, step: "카드 확인", why: "[톡톡 대화하기]가 없는 손님" };
    step("톡톡 대화하기");
    const pop = Promise.resolve().then(() => this.opts.popup()).catch(() => null);
    const t = await this.call("window.__tsend.talk()");
    if (!t.ok) return Object.assign({ step: "대화창" }, t);
    const chat = await Promise.race([pop, sleep(15000).then(() => null)]);
    if (!chat) return { ok: false, step: "대화창", why: "톡톡 대화창(새 창)이 안 열림" };
    try {
      const cs = await this.until((x) => x.chat && x.chat.input, 15000, chat.exec);
      await this.shot("3-대화창");
      if (!cs) return { ok: false, step: "대화창", why: "대화창에 글 칸이 안 보임" };
      const sel = await this.call("window.__tsend.fileSelector()", chat.exec);
      if (dry) return { ok: true, dry: true, step: "확인만", how: pick.how, chat: { input: cs.chat.input, send: cs.chat.send, file: !!sel } };
      const sent = {};
      if (job.text) {
        step("글 보내기");
        const a = await this.call(`window.__tsend.chatText(${JSON.stringify(job.text)})`, chat.exec);
        if (!a.ok) return Object.assign({ step: "글" }, a);
        await sleep(300);
        const b = await this.call("window.__tsend.chatSend()", chat.exec);
        if (!b.ok) return Object.assign({ step: "글" }, b);
        const line = job.text.split("\n").find((l) => l.trim()) || job.text;
        const done = await this.waitFor(async () => (await this.call("window.__tsend.chatValue()", chat.exec)) === "" && (await this.call(`window.__tsend.has(${JSON.stringify(line)})`, chat.exec)), 10000);
        if (!done) return { ok: false, step: "글", why: "보낸 글이 대화창에 안 보임" };
        sent.text = true;
      }
      if (job.image) {
        if (!sel) return { ok: false, step: "사진", why: "대화창의 사진 칸을 못 찾음", sent };
        step("사진 보내기");
        const before = (await this.state(chat.exec)).chat;
        await chat.setFile(sel, asciiCopy(job.image));
        const after = await this.until((x) => x.chat && (x.chat.imgs > before.imgs || x.chat.len > before.len), 15000, chat.exec);
        if (!after) return { ok: false, step: "사진", why: "사진이 대화창에 안 보임", sent };
        sent.image = true;
      }
      await sleep(500); await this.shot("4-보낸뒤");
      return { ok: true, step: "보냄", how: pick.how, sent };
    } finally {
      await chat.close().catch(() => {});
    }
  }
  /** 목록 i 번째 줄(이름)을 눌러 오른쪽 고객 정보가 그 손님으로 바뀔 때까지 (고객번호 · 없으면 이름 · 번호가 보이면 번호까지) → 고객 정보 · 못 바뀌면 null
      처음엔 첫 손님 고객 정보가 저절로 떠 있음 (2.24 현장 11/16) */
  async openCard(i, row) {
    const flat = (v) => String(v || "").replace(/\s+/g, "");
    const same = (c) => !!c && (row.id && c.id ? c.id === row.id : flat(c.name) === flat(row.name)) && (!row.phone || flat(c.phone) === flat(row.phone));
    await this.call(`window.__tsend.openRow(${i})`);
    await sleep(700);
    const s = await this.until((x) => same(x.card), 8000);
    return s ? s.card : null;
  }
  /** 이름만 있는 목록: 이름이 같은 줄 → 가린 이름 모양이 같은 줄 차례로 눌러 고객 정보 전화번호로 확인
      번호가 다 보이면 같아야 그 사람 · 가려졌으면 뒷번호 + 이름 모양 — 그런 사람이 하나뿐일 때만 (둘 이상이면 건너뜀) */
  async byCard(rows, job) {
    const flat = (v) => String(v || "").replace(/\s+/g, ""), tp = digits(job.phone), last4 = tp.slice(-4);
    const idx = rows.map((r, i) => ({ r, i }));
    const exact = idx.filter(({ r }) => flat(r.name) === flat(job.name));
    const masked = idx.filter(({ r }) => flat(r.name) !== flat(job.name) && MASK.test(r.name) && nameLike(r.name, job.name));
    const cands = exact.concat(masked).slice(0, 6);
    if (!cands.length) return { why: `네이버 고객에서 그 이름을 못 찾음 (뒷번호 ${last4}로 찾은 ${rows.length}명: ${rows.slice(0, 5).map((r) => r.name).join(", ")}${rows.length > 5 ? " …" : ""})` };
    const maybe = [];
    let last = null;
    for (const c of cands) {
      const card = await this.openCard(c.i, c.r);
      last = c;
      if (!card) continue;
      const cp = digits(card.phone);
      if (!MASK.test(card.phone) && cp.length >= 10) {
        if (cp === tp) return { i: c.i, how: "이름 · 고객 정보 번호", card };
        continue;
      }
      if (cp.slice(-4) === last4 && (!card.name || nameLike(card.name, job.name))) maybe.push(c);
    }
    if (maybe.length === 1) {
      const m = maybe[0];
      const card = last === m ? (await this.state()).card : await this.openCard(m.i, m.r);
      return card ? { i: m.i, how: "가린 이름 · 뒷번호", card } : { why: "고객 정보를 다시 열지 못함" };
    }
    if (maybe.length > 1) return { why: `가려진 손님 중 이름 · 뒷번호가 같은 사람이 ${maybe.length}명 — 근무자가 확인` };
    return { why: `이름이 같은 손님 ${cands.length}명을 눌러 봤는데 고객 정보 번호가 달라요 — 근무자가 확인` };
  }
  /** 목록이 0.6초 동안 그대로일 때까지 (최대 4번) */
  async settle(s) {
    for (let k = 0; k < 4; k++) {
      await sleep(600);
      const n = await this.state();
      if (JSON.stringify([n.rows, n.count, n.q]) === JSON.stringify([s.rows, s.count, s.q])) return n;
      s = n;
    }
    return s;
  }
  /** 여러 사람 차례로 — 맞추기 · 카드 확인에서 건너뛴 사람은 다음으로, 화면이 이상하면(대화창 · 검색이 안 됨 등) 거기서 멈춤
      each(job, 결과) = 한 사람 끝날 때마다 · stop() 이 참이면 멈춤 */
  async run(jobs, { dry = false, each = () => {}, stop = () => false } = {}) {
    const out = [];
    for (const job of jobs) {
      if (stop()) break;
      let r;
      try { r = await this.one(job, dry); } catch (e) { r = { ok: false, step: "오류", why: String((e && e.message) || e).slice(0, 200) }; }
      out.push(Object.assign({ name: job.name, key: job.key }, r));
      await each(job, r);
      if (!r.ok && !r.skip) break;
    }
    return out;
  }
  async waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn().catch(() => false)) return true; await sleep(250); } return false; }
}

if (typeof module !== "undefined") module.exports = { TalkSend, TALKSEND_DRIVER_SOURCE, installTalkSendDriver, pickRow, cardOk, nameLike, phoneLike };
