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
  /** 글자가 딱 그것인 요소 (자기 글자 기준) */
  const byText = (t, root = document) => leafs(root).filter((e) => norm(e.textContent) === norm(t) || norm(own(e)) === norm(t));
  const PHONE = /^(?:\d{2,3}|\*{2,3})-(?:\d{3,4}|\*{3,4})-\d{4}$/;
  const setVal = (el, v) => {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const searchInput = () => $$("input").filter((i) => vis(i) && /^(text|search|)$/i.test(i.type || "") && !i.closest("nav, aside")).find((i) => { const box = i.closest("form, div"); return box && /이름|전화번호/.test(box.textContent); });
  const typeToggle = (inp) => { for (let box = inp && inp.parentElement, k = 0; box && k < 4; box = box.parentElement, k++) { const b = $$("button, [role=button], [role=combobox], select", box).find((x) => vis(x) && /^(이름|전화번호)/.test(norm(x.textContent || x.value))); if (b) return b; } return null; };
  /** 목록 줄: 전화번호 모양 글자를 가진 줄마다 { name, phone } */
  const rows = () => {
    const out = [];
    for (const ph of leafs().filter((e) => PHONE.test(norm(e.textContent)))) {
      if (ph.closest("[class*=Card], [class*=card], [class*=Detail], [class*=detail]") && byText("등록경로", ph.closest("[class*=Card], [class*=card], [class*=Detail], [class*=detail]")).length) continue; // 오른쪽 카드는 빼고
      let row = ph.parentElement;
      for (let k = 0; row && k < 4 && !leafs(row).some((e) => e !== ph && /^[가-힣*]{1,8}$/.test(norm(e.textContent))); k++) row = row.parentElement;
      if (!row) continue;
      const nm = leafs(row).find((e) => e !== ph && /^[가-힣*]{1,8}$/.test(norm(e.textContent)));
      if (!nm || leafs(row).filter((e) => PHONE.test(norm(e.textContent))).length !== 1) continue;
      out.push({ name: norm(nm.textContent), phone: norm(ph.textContent), el: row });
    }
    return out;
  };
  /** 오른쪽 고객 카드: '등록경로' · '전화번호' 이름표가 함께 있는 가장 작은 칸 → 목록(다른 번호)이 섞이기 전까지 넓힘 (이름 · [톡톡 대화하기]가 옆 칸에 있어도 잡히게) */
  const phones = (root) => leafs(root).filter((e) => PHONE.test(norm(e.textContent))).length;
  const card = () => {
    const lab = byText("등록경로")[0];
    let box = lab;
    for (let k = 0; box && k < 8 && !byText("전화번호", box).length; k++) box = box.parentElement;
    if (!box || !byText("전화번호", box).length) return null;
    for (let k = 0; k < 5 && box.parentElement && box.parentElement !== document.body && phones(box.parentElement) <= phones(box); k++) box = box.parentElement;
    const val = (label) => { const l = byText(label, box)[0]; if (!l) return ""; const v = l.nextElementSibling || (l.parentElement && l.parentElement.nextElementSibling); return v ? txt(v) : ""; };
    const NOT = /^(등록경로|전화번호|이메일|특이사항|정보변경|예약내역|주문내역|고객정보|메모|태그|완료|노쇼|취소|방문|예약|주문|닫기)$/;
    const okName = (e) => e && /^[가-힣*]{1,8}$/.test(norm(e.textContent)) && !NOT.test(norm(e.textContent));
    const head = [...box.querySelectorAll("h1, h2, h3, h4, strong, [class*=name], [class*=Name]")].find((e) => vis(e) && okName(e)) || leafs(box).find(okName);
    return { name: head ? norm(head.textContent) : "", phone: norm(val("전화번호")), path: val("등록경로"), talk: !!byText("톡톡 대화하기", box).length };
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
        type: tg ? norm(tg.textContent || tg.value).replace(/[∨⌄▾▼v]$/i, "") : "",
        q: inp ? inp.value : "",
        count: (() => { const m = norm(document.body.innerText).match(/(\d+)명/); return m ? +m[1] : null; })(),
        rows: rows().map(({ name, phone }) => ({ name, phone })),
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
    /** 펼친 선택지에서 고르기 — 선택지 모양(li · option · menuitem)을 먼저 · 목록 머리글 '전화번호'는 피함 */
    pickType(t) {
      const inp = searchInput(), tg = inp && typeToggle(inp);
      const all = byText(t).filter((x) => !tg || !tg.contains(x));
      const near = tg && tg.parentElement && tg.parentElement.parentElement;
      const e = all.find((x) => x.closest("[role=option], [role=menuitem], [role=listbox], li, option")) || all.find((x) => near && near.contains(x));
      return { ok: press(clickable(e)) };
    },
    /** 검색: 글을 넣고 Enter · 돋보기 */
    search(q) {
      const inp = searchInput(); if (!inp) return { ok: false, why: "검색 칸을 못 찾음" };
      inp.focus(); setVal(inp, q);
      for (const t of ["keydown", "keypress", "keyup"]) inp.dispatchEvent(new KeyboardEvent(t, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      const box = inp.closest("form, div"); const btn = box && $$("button", box).find((b) => vis(b) && b !== typeToggle(inp) && (/검색/.test(b.getAttribute("aria-label") || b.title || b.textContent) || (!norm(b.textContent) && b.querySelector("svg, i, span[class*=search], span[class*=Search]")) ) && !/지우|clear|삭제/i.test(b.getAttribute("aria-label") || b.className));
      if (btn) press(btn);
      return { ok: true };
    },
    /** 목록 i 번째 줄 누르기 */
    openRow(i) { const r = rows()[i]; if (!r) return { ok: false, why: "그 줄이 없음" }; const nm = leafs(r.el).find((e) => /^[가-힣*]{1,8}$/.test(norm(e.textContent))); return { ok: press(clickable(nm) || r.el) }; },
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
/** 가려진 이름(유*석 · 남궁*진)과 실제 이름이 같은 모양인가 — '*' 는 아무 글자 하나 · 길이가 같아야 함 */
function nameLike(shown, real) {
  const s = String(shown || "").replace(/\s+/g, ""), r = String(real || "").replace(/\s+/g, "");
  if (!s || !r) return false;
  if (!s.includes("*")) return s === r;
  return s.length === r.length && [...s].every((c, i) => c === "*" || c === r[i]);
}
/** 목록에서 그 손님 줄 고르기 — { i, how } 또는 { why }
    번호가 다 보이는 줄 중 번호가 같은 줄 → 그 줄 (같은 번호가 여럿이면 같은 사람으로 보고 첫 줄)
    없으면 가려진 줄(***-****-1313) 중 뒷번호 · 이름 모양이 같은 줄이 하나뿐일 때만 · 둘 이상이면 건너뜀 (근무자가 확인) */
function pickRow(rows, target) {
  const tp = digits(target.phone), last4 = tp.slice(-4);
  if (tp.length < 10) return { why: "전화번호가 없거나 짧음" };
  const full = rows.map((r, i) => ({ r, i })).filter(({ r }) => digits(r.phone) === tp);
  if (full.length) return { i: full[0].i, how: "번호" };
  const masked = rows.map((r, i) => ({ r, i })).filter(({ r }) => /\*/.test(r.phone) && digits(r.phone).slice(-4) === last4 && nameLike(r.name, target.name));
  if (masked.length === 1) return { i: masked[0].i, how: "가린 번호 · 이름" };
  if (masked.length > 1) return { why: `가려진 손님 중 이름 · 뒷번호가 같은 사람이 ${masked.length}명 — 근무자가 확인` };
  return { why: rows.length ? "네이버 고객에서 그 번호 · 이름을 못 찾음" : "네이버 고객에서 뒷번호로 찾은 사람이 없음" };
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
      if (!o.select) { await sleep(300); await this.call(`window.__tsend.pickType("전화번호")`); }
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
    const q = await this.call(`window.__tsend.search(${JSON.stringify(last4)})`);
    if (!q.ok) return Object.assign({ step: "검색" }, q);
    let s = await this.until((x) => x.customers && x.q === last4 && (x.rows.length > 0 || x.count === 0), 10000);
    if (!s) return { ok: false, step: "검색", why: "검색 결과가 안 뜸" };
    s = await this.settle(s); // 앞 검색 목록이 남아 있거나 아직 그리는 중이면 멈출 때까지
    await this.shot("1-검색");
    const pick = pickRow(s.rows, job);
    if (pick.why) return { ok: false, skip: true, step: "맞추기", why: pick.why, rows: s.rows.length };
    step(`목록 ${s.rows.length}명 중 ${pick.how}로 맞춤 → 카드`);
    await this.call(`window.__tsend.openRow(${pick.i})`);
    s = await this.until((x) => x.card && (x.card.phone || x.card.name) && (digits(x.card.phone).slice(-4) === last4), 8000);
    await this.shot("2-고객카드");
    const ok = cardOk(s && s.card, job, pick.how);
    if (!ok.ok) return { ok: false, skip: true, step: "카드 확인", why: ok.why };
    if (!s.card.talk) return { ok: false, skip: true, step: "카드 확인", why: "[톡톡 대화하기]가 없는 손님" };
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

if (typeof module !== "undefined") module.exports = { TalkSend, TALKSEND_DRIVER_SOURCE, installTalkSendDriver, pickRow, cardOk, nameLike };
