/* 데스크 ↔ 네이버 예약관리 (Node 쪽)
   loadDay(day)
     1) 예약 목록 화면 → 그 날짜 → 하루 예약 전부 (상태·예약자·전화번호·예약번호·이용일시·상품·수량·결제상태). 입장권만, 취소 뺌
     2) 예약현황 화면 → 그 날짜 → 시간 칸별 확정/이용완료/잔여 수량
     3) '완료 n · 취소 n'(방문 횟수)은 예약 목록에 없어서, 아직 모르는 예약이 있는 칸만 열어 카드에서 읽음 (한 번 읽으면 기억)
   complete(b): 예약현황 → 그 날짜 → 그 칸의 [확정] → 카드의 [이용완료] → 확인 → 완료로 바뀐 것을 다시 읽어 확인
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
    this.visits = new Map(); // 예약번호 → { doneCount, cancelCount, status } (카드에서 읽은 값)
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
  async goView(view) {
    let s = await this.read();
    if (s.needLogin) return { ok: false, why: "네이버에 로그인해 주세요" };
    if (s.page === view) return { ok: true, state: s };
    if (!this.urls) return { ok: false, why: "네이버 예약관리 주소를 모름 (운영 설정 → 지금 화면을 시작 화면으로)" };
    const r = await this.act(`window.__naver.go(${JSON.stringify(this.urls[view])})`);
    if (!r.ok) return r;
    s = await this.read();
    if (s.needLogin) return { ok: false, why: "네이버에 로그인해 주세요" };
    if (s.page !== view) return { ok: false, why: `네이버 ${view === "list" ? "예약 목록" : "예약현황"} 화면을 열지 못함` };
    return { ok: true, state: s };
  }
  async goDate(day) {
    for (let i = 0; i < 400; i++) {
      const s = await this.read();
      if (s.needLogin) return { ok: false, why: "네이버에 로그인해 주세요" };
      if (!s.date) return { ok: false, why: "네이버 화면에서 날짜를 못 찾음" };
      if (s.date === day) return { ok: true, state: s };
      const r = await this.act(`window.__naver.stepDate(${s.date < day ? 1 : -1})`);
      if (!r.ok) return r;
    }
    return { ok: false, why: "날짜를 맞추지 못함" };
  }
  /** 그 칸을 열어 카드의 방문 횟수를 기억 */
  async readSlotCards(product, time, kind) {
    let r = await this.act(`window.__naver.openSlot(${JSON.stringify(product)}, ${JSON.stringify(time)}, ${JSON.stringify(kind)})`);
    if (!r.ok) return r;
    const want = kind === "확정" ? "확정" : "완료";
    if (!r.state.cards.some((c) => c.status === want)) r = await this.act(`window.__naver.openTab(${JSON.stringify(want)})`);
    for (const c of (r.state && r.state.cards) || []) if (c.no) this.visits.set(c.no, { doneCount: c.doneCount, cancelCount: c.cancelCount, status: c.status });
    return { ok: true };
  }
  async loadDay(day) {
    // 1) 예약 목록
    let g = await this.goView("list");
    if (!g.ok) return g;
    g = await this.goDate(day);
    if (!g.ok) return g;
    // 아래로 내려 가며 끝까지 불러오기 ("124건" 이 다 모일 때까지, 더 안 늘면 멈춤)
    let st = await this.read();
    for (let i = 0, still = 0; i < 40 && still < 3; i++) {
      if (st.listTotal != null && st.list.length >= st.listTotal) break;
      const before = st.list.length;
      await this.call("window.__naver.scrollMore()").catch(() => null);
      await sleep(500);
      st = await this.read();
      still = st.list.length > before ? 0 : still + 1;
    }
    const rows = st.list.filter((b) => this.isTicket(b.product) && b.status !== "취소");
    // 2) 예약현황 칸
    g = await this.goView("calendar");
    if (!g.ok) return g;
    g = await this.goDate(day);
    if (!g.ok) return g;
    const slots = g.state.slots.filter((s) => this.isTicket(s.product));
    // 3) 방문 횟수를 모르는 예약이 있는 칸만 열기 (확정 먼저)
    for (const kind of ["확정", "이용완료"]) {
      const want = kind === "확정" ? "확정" : "완료";
      const need = new Set(rows.filter((b) => b.status === want && !(this.visits.get(b.no) && this.visits.get(b.no).status === want)).map((b) => `${b.product}|${b.time}`));
      for (const key of need) {
        const [product, time] = key.split("|");
        const r = await this.readSlotCards(product, time, kind);
        if (!r.ok) return r;
      }
    }
    const bookings = rows.map((b) => {
      const v = this.visits.get(b.no) || {};
      return { ...b, doneCount: v.doneCount ?? null, cancelCount: v.cancelCount ?? 0 };
    });
    return { ok: true, day, slots: slots.map((s) => ({ time: s.time, product: s.product, cap: s.avail + s.conf + s.done + s.apply, conf: s.conf + s.apply, done: s.done })), bookings };
  }
  /** 이용완료 처리하고 실제로 완료로 바뀌었는지 확인 */
  async complete(b) {
    let g = await this.goView("calendar");
    if (!g.ok) return g;
    g = await this.goDate(b.day);
    if (!g.ok) return g;
    let r = await this.act(`window.__naver.openSlot(${JSON.stringify(b.product || "")}, ${JSON.stringify(b.time)}, "확정")`);
    if (!r.ok) return r;
    if (!r.state.cards.some((c) => c.no === b.no)) r = await this.act(`window.__naver.openTab("확정")`);
    r = await this.act(`window.__naver.complete(${JSON.stringify(b.no)})`);
    if (!r.ok) return r;
    // 다시 확인: 확정 칸에 아직 있으면 실패
    const s = await this.read();
    const stillCard = s.cards.find((c) => c.no === b.no && c.status === "확정");
    const cell = s.slots.find((x) => x.time === b.time && (!b.product || x.product === b.product));
    if (stillCard) return { ok: false, why: "네이버에서 이용완료로 바뀌지 않음" };
    const v = this.visits.get(b.no);
    if (v) this.visits.set(b.no, { ...v, status: "완료", doneCount: v.doneCount + 1 });
    return { ok: true, slot: cell || null };
  }
}

module.exports = { NaverSync, isKidsTicket, naverUrls };
