/* 데스크 ↔ 네이버 예약관리 (Node 쪽)
   loadDay(day): 예약현황(일간) 화면 → 그 날짜 → 입장권 칸마다 [확정] · [이용완료] 를 열어 카드에서
     예약자 · 전화번호 · 예약번호 · 수량 · 결제상태 · '완료 n · 취소 n' 을 읽음
     - 예약자관리(목록)는 쓰지 않음: '한달' 처럼 기간으로 보이면 날짜를 맞출 수 없어서 (현장 시험 10/6)
     - 한 번 읽은 칸은 기억하고, 칸 숫자(확정 n · 이용완료 n)가 바뀐 칸만 다시 엶 → 두 번째부터 빠름
     - 칸을 누르기 전에 열린 목록을 닫고, 오른쪽 목록은 끝까지 내려 가며 읽음
   complete(b): 예약현황 → 그 날짜 → 그 칸의 [확정] → (내려 가며 찾은) 카드의 [이용완료] → 확인 → 완료로 바뀐 것을 다시 읽어 확인
   exec(code): 네이버 페이지에서 코드를 실행 (앱: webContents.executeJavaScript, 시험: page.evaluate)
   urls: { list, calendar } 예약 목록 · 예약현황 주소 */
const { NAVER_DRIVER_SOURCE } = require("./naver-driver");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 키즈 입장권만 (단체 · 열쇠분실 상품은 뺌)
const isKidsTicket = (name) => /입장권/.test(name) && !/단체/.test(name);

/** 네이버 예약관리 주소(https://partner.booking.naver.com/bizes/653244/...)에서 목록·현황 주소 만들기 */
function naverUrls(anyUrl) {
  const m = String(anyUrl || "").match(/^(https?:\/\/[^/]+\/bizes\/\d+)/);
  if (!m) return null;
  return { list: `${m[1]}/booking-list-view`, calendar: `${m[1]}/booking-calendar-view` };
}

class NaverSync {
  constructor(exec, opts = {}) {
    this.exec = exec;
    this.urls = opts.urls || null;
    this.timeout = opts.timeout || 10000;
    this.isTicket = opts.isTicket || isKidsTicket;
    this.onStep = opts.onStep || (() => {});
    this.onSnap = opts.onSnap || null; // 진단: 네이버 화면 저장 (이용완료 누른 뒤 · 안 됐을 때) // 진행 단계를 데스크에 알림 (현장에서 어디서 막히는지 보려고)
    this.days = new Map(); // 날짜 → Map("상품|시각|확정/이용완료" → { count, cards }) — 칸 숫자가 그대로면 다시 안 엶
  }
  call(expr) {
    return this.exec(`(() => { (${NAVER_DRIVER_SOURCE})(); return ${expr}; })()`);
  }
  async read() {
    for (let i = 0; i < 40; i++) {
      try {
        return await this.call("window.__naver.read()");
      } catch (e) {
        await sleep(250); // 페이지 이동 중
      }
    }
    throw new Error("네이버 화면을 읽을 수 없음");
  }
  /** 동작 뒤 화면이 바뀌고 안정될 때까지 기다림 */
  async act(expr) {
    const before = JSON.stringify(await this.read());
    const res = await this.call(expr).catch(() => ({ ok: true }));
    if (res && res.ok === false) return res;
    const t0 = Date.now();
    let last = null;
    let lastAt = 0;
    while (Date.now() - t0 < this.timeout) {
      await sleep(150);
      let s;
      try {
        s = await this.call("window.__naver.read()");
      } catch (e) {
        continue;
      }
      // (예약 목록 맨 아래 '로딩중'은 늘 보일 수 있어 기다리지 않음 — 화면이 멈출 때까지만 기다림)
      const k = JSON.stringify(s);
      if (k !== last) {
        last = k;
        lastAt = Date.now();
        continue;
      }
      if ((k !== before && Date.now() - lastAt >= 350) || Date.now() - t0 > 2000) return { ok: true, state: s };
    }
    return { ok: false, why: "네이버 화면이 응답하지 않음" };
  }
  step(msg) {
    try {
      this.onStep(msg);
    } catch (e) {
      /* 알림 실패는 무시 */
    }
  }
  async goView(view) {
    let s = await this.read();
    this.step(`네이버 ${view === "list" ? "예약 목록" : "예약현황"} 화면 확인 (지금: ${s.page === "calendar" ? "예약현황" : s.page === "list" ? "예약자관리" : s.needLogin ? "로그인 화면" : "다른 화면"})`);
    if (s.needLogin) return { ok: false, why: "네이버에 로그인해 주세요 (로그인할 때 '로그인 상태 유지'를 꼭 체크)" };
    if (s.page === view) return { ok: true, state: s };
    if (!this.urls) return { ok: false, why: "네이버 예약관리 주소를 모름 (운영 설정 → 지금 화면을 시작 화면으로)" };
    const r = await this.act(`window.__naver.go(${JSON.stringify(this.urls[view])})`);
    if (!r.ok) return r;
    s = await this.read();
    if (s.needLogin) return { ok: false, why: "네이버에 로그인해 주세요 (로그인할 때 '로그인 상태 유지'를 꼭 체크)" };
    if (s.page !== view) return { ok: false, why: `네이버 ${view === "list" ? "예약 목록" : "예약현황"} 화면을 열지 못함` };
    return { ok: true, state: s };
  }
  async goDate(day) {
    let lastDir = 0;
    let flips = 0;
    for (let i = 0; i < 60; i++) {
      const s = await this.read();
      if (s.needLogin) return { ok: false, why: "네이버에 로그인해 주세요 (로그인할 때 '로그인 상태 유지'를 꼭 체크)" };
      if (!s.date) return { ok: false, why: "네이버 화면에서 날짜를 못 찾음" };
      if (s.dateRange) return { ok: false, why: "네이버 예약현황이 '일간'이 아님 — 네이버 화면에서 '일간'으로 바꿔 주세요" };
      if (s.date === day) return { ok: true, state: s };
      const dir = s.date < day ? 1 : -1;
      this.step(`네이버 날짜 맞추는 중: ${s.date.slice(5)} → ${day.slice(5)}`);
      // 넘었다 돌아왔다를 되풀이하면 (한 번에 하루씩 움직이지 않는 화면) 멈춤
      if (lastDir && dir !== lastDir && ++flips >= 2) return { ok: false, why: "네이버 날짜가 하루씩 움직이지 않음 — 예약현황을 '일간'으로 바꿔 주세요" };
      lastDir = dir;
      const r = await this.act(`window.__naver.stepDate(${dir})`);
      if (!r.ok) return r;
    }
    return { ok: false, why: "날짜를 맞추지 못함" };
  }
  /** 칸의 [확정]/[이용완료] 누르기 — 앞에 열린 목록이 있으면 먼저 닫음 (칸을 누르면 표가 새로 그려짐) */
  async openSlot(product, time, kind) {
    const s = await this.read();
    if (s.cards.length) await this.act("window.__naver.closePanel()");
    let r = await this.act(`window.__naver.openSlot(${JSON.stringify(product)}, ${JSON.stringify(time)}, ${JSON.stringify(kind)})`);
    if (!r.ok) return r;
    const want = kind === "확정" ? "확정" : "완료";
    // 목록이면 그 탭으로 (예약이 1건이면 탭 없이 상세정보가 바로 뜸 → 탭을 못 찾아도 그대로)
    if (!r.state.cards.some((c) => c.status === want || (want === "완료" && c.status === "이용완료"))) {
      const t = await this.act(`window.__naver.openTab(${JSON.stringify(want)})`);
      if (t.ok) r = t;
    }
    return r;
  }
  /** 오른쪽 목록을 아래로 내려 카드를 더 불러옴 — 더 나온 게 없으면 false */
  async moreCards() {
    const n = (await this.read()).cards.length;
    const r = await this.call("window.__naver.scrollCards()").catch(() => null);
    for (let i = 0; i < 8; i++) {
      await sleep(250);
      if ((await this.read()).cards.length > n) return true;
    }
    return !!(r && r.more);
  }
  /** 그 칸을 열어 카드를 모두 읽음 (목록을 끝까지 내려 가며) */
  async readSlotCards(product, time, kind) {
    this.step(`${time} ${kind} 칸 여는 중`);
    const r = await this.openSlot(product, time, kind);
    if (!r.ok) return r;
    // 오른쪽 예약정보가 늦게 뜰 수 있음 → 카드가 나올 때까지 최대 6초
    for (let i = 0; i < 24 && !(await this.read()).cards.length; i++) await sleep(250);
    const got = new Map();
    for (let i = 0; i < 30; i++) {
      for (const c of (await this.read()).cards) if (c.no) got.set(c.no, c);
      if (!(await this.moreCards())) break;
    }
    this.step(`${time} ${kind}: 카드 ${got.size}장`);
    return { ok: true, cards: [...got.values()] };
  }
  /** opts.only = "14:00" 이면 그 시간 칸만 다시 열어 읽음 (기억한 카드도 무시) — 근무자가 시간 칸을 누를 때 */
  async loadDay(day, opts = {}) {
    let g = await this.goView("calendar");
    if (!g.ok) return g;
    g = await this.goDate(day);
    if (!g.ok) return g;
    const slots = g.state.slots.filter((s) => this.isTicket(s.product));
    if (!this.days.has(day)) this.days.set(day, new Map());
    const cache = this.days.get(day);
    const live = new Set();
    const warn = [];
    let opened = false;
    this.step(`예약현황 ${day.slice(5)} · 입장권 칸 ${slots.length}개`);
    for (const s of slots) {
      for (const [kind, n] of [["확정", s.conf], ["이용완료", s.done]]) {
        const key = `${s.product}|${s.time}|${kind}`;
        if (!n) continue;
        live.add(key);
        if (opts.only && s.time !== opts.only) continue; // 그 시간만
        const c = cache.get(key);
        if (c && c.count === n && !opts.only) continue; // 숫자가 그대로면 기억한 카드 그대로
        const r = await this.readSlotCards(s.product, s.time, kind);
        if (!r.ok) return r;
        opened = true;
        if (!r.cards.length) {
          warn.push(`${s.time} ${kind}`);
          continue; // 못 읽은 칸은 기억하지 않음 (다음에 다시)
        }
        cache.set(key, { count: n, time: s.time, product: s.product, status: kind === "확정" ? "확정" : "완료", cards: r.cards });
      }
    }
    for (const key of [...cache.keys()]) if (!live.has(key)) cache.delete(key); // 비워진 칸 (취소 등)
    if (opened) await this.act("window.__naver.closePanel()");
    const seen = new Set();
    const bookings = [];
    for (const c of cache.values())
      for (const x of c.cards) {
        if (seen.has(x.no)) continue;
        seen.add(x.no);
        bookings.push({ no: x.no, status: c.status, name: x.name, phone: x.phone, time: c.time, product: c.product, qty: x.qty, qtyText: x.qtyText, pay: x.pay, doneCount: x.doneCount, cancelCount: x.cancelCount });
      }
    return { ok: true, day, warn: warn.length ? `카드를 못 읽은 칸: ${warn.join(", ")}` : "", slots: slots.map((s) => ({ time: s.time, product: s.product, cap: s.avail + s.conf + s.done + s.apply, conf: s.conf + s.apply, done: s.done })), bookings };
  }
  /** 이용완료 처리하고 실제로 완료로 바뀌었는지 확인 */
  async complete(b) {
    let g = await this.goView("calendar");
    if (!g.ok) return g;
    g = await this.goDate(b.day);
    if (!g.ok) return g;
    // 그 칸의 확정 · 이용완료 숫자 (누르기 전) — 이용완료가 정말 됐는지는 이 숫자가 바뀌었는지로 확인 (현장 10/6: 버튼만 누르고 안 된 일이 있었음)
    const cellOf = (s) => s.slots.find((x) => x.time === b.time && (!b.product || x.product === b.product));
    const before = cellOf(g.state);
    let r = await this.openSlot(b.product || "", b.time, "확정");
    if (!r.ok) return r;
    // 카드가 아래에 있으면 목록을 내려 가며 찾음
    for (let i = 0; i < 30 && !(await this.read()).cards.some((c) => c.no === b.no); i++) if (!(await this.moreCards())) break;
    const card = (await this.read()).cards.find((c) => c.no === b.no);
    if (!card) return { ok: false, why: `네이버 예약정보에서 예약번호 ${b.no} 카드를 못 찾음` };
    const visit = { doneCount: card.doneCount, cancelCount: card.cancelCount }; // 누르기 전 '완료 n' (방문 횟수를 몰랐을 때 채움)
    this.step("네이버 [이용완료] 누름");
    r = await this.act(`window.__naver.complete(${JSON.stringify(b.no)})`);
    if (!r.ok) return r;
    this.snap("이용완료 누른 뒤"); // 확인 창 모양을 남김 (바탕화면 진단 폴더) — 기다리지 않음
    // 확인 창이 늦게 뜰 수 있음 → 4초 동안 보이면 [확인]
    let confirmed = false;
    for (let i = 0; i < 16 && !confirmed; i++) {
      const c = await this.call("window.__naver.confirm()").catch(() => null);
      if (c && c.clicked) {
        confirmed = true;
        this.step(`네이버 확인 창 [${c.label || "확인"}]`);
        await this.act("({ ok: true })");
      } else await sleep(200);
    }
    // 확인: 칸 숫자(확정 − · 이용완료 +)가 바뀌었는지 — 안 바뀌면 화면을 다시 열어 한 번 더 봄
    const changed = (s) => { const c = cellOf(s); return before && c && (c.done > before.done || c.conf < before.conf); };
    await this.act("window.__naver.closePanel()");
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < 20; i++) {
        const s = await this.read();
        if (changed(s)) return { ok: true, slot: cellOf(s), ...visit };
        if (!before) break;
        await sleep(300);
      }
      if (round === 0 && this.urls) {
        await this.act(`window.__naver.go(${JSON.stringify(this.urls.calendar)})`);
        const gg = await this.goDate(b.day);
        if (!gg.ok) break;
        if (!before) {
          // 칸 숫자를 못 읽었으면 카드로 확인: 확정 칸에 아직 [이용완료] 단추가 있으면 실패
          const o = await this.openSlot(b.product || "", b.time, "확정");
          const still = o.ok && (await this.read()).cards.some((c) => c.no === b.no && (c.canComplete || c.status === "확정"));
          return still ? { ok: false, why: "네이버에서 이용완료로 바뀌지 않음" } : { ok: true, ...visit };
        }
      }
    }
    await this.snap("이용완료 안 됨");
    return { ok: false, why: `네이버에서 이용완료로 바뀌지 않음${confirmed ? "" : " (확인 창을 못 찾음)"} — 바탕화면 '아스타나키즈-진단' 폴더의 사진을 보내 주세요` };
  }
  async snap(label) {
    try {
      if (this.onSnap) await this.onSnap(label);
    } catch (e) {
      /* 진단 저장 실패는 무시 */
    }
  }
}

module.exports = { NaverSync, isKidsTicket, naverUrls };
