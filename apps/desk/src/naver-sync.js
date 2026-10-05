/* 데스크 ↔ 네이버 예약관리 화면 (Node 쪽)
   - loadDay(day): 그 날짜로 이동 → 입장권 칸의 확정/이용완료 수량 → 칸마다 열어 예약자 카드를 읽어 모음
   - complete(b): 그 예약의 칸을 열고 카드의 [이용완료] → 확인 → 완료로 바뀌었는지 다시 읽어 확인
   exec(code) 는 네이버 페이지에서 코드를 실행하는 함수 (앱: webContents.executeJavaScript, 시험: page.evaluate) */
const { NAVER_DRIVER_SOURCE } = require("./naver-driver");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 키즈 입장권만 (단체 · 열쇠분실 상품은 뺌). 실제 상품 이름에 맞춰 바꿀 수 있음
const isKidsTicket = (name) => /입장권/.test(name) && !/단체/.test(name);

class NaverSync {
  constructor(exec, opts = {}) {
    this.exec = exec;
    this.timeout = opts.timeout || 8000;
    this.isTicket = opts.isTicket || isKidsTicket;
  }
  call(expr) {
    return this.exec(`(() => { (${NAVER_DRIVER_SOURCE})(); return ${expr}; })()`);
  }
  read() {
    return this.call("window.__naver.read()");
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
      await sleep(120);
      const s = await this.read().catch(() => null);
      if (!s) continue;
      const k = JSON.stringify(s);
      if (k !== last) {
        last = k;
        lastAt = Date.now();
        continue;
      }
      if ((k !== before && Date.now() - lastAt >= 300) || Date.now() - t0 > 1500) return { ok: true, state: s };
    }
    return { ok: false, why: "네이버 화면이 응답하지 않음" };
  }
  async goDate(day) {
    for (let i = 0; i < 400; i++) {
      const s = await this.read();
      if (s.needLogin) return { ok: false, why: "네이버에 로그인해 주세요" };
      if (!s.date) return { ok: false, why: "네이버 예약현황 화면이 아님" };
      if (s.date === day) return { ok: true, state: s };
      const r = await this.act(`window.__naver.stepDate(${s.date < day ? 1 : -1})`);
      if (!r.ok) return r;
    }
    return { ok: false, why: "날짜를 맞추지 못함" };
  }
  /** 그 날짜의 입장권 예약 전부 */
  async loadDay(day) {
    const g = await this.goDate(day);
    if (!g.ok) return g;
    const slots = g.state.slots.filter((s) => this.isTicket(s.product));
    const seen = new Map();
    for (const s of slots) {
      for (const kind of ["확정", "이용완료"]) {
        if (!(kind === "확정" ? s.conf : s.done)) continue;
        let r = await this.act(`window.__naver.openSlot(${JSON.stringify(s.product)}, ${JSON.stringify(s.time)}, ${JSON.stringify(kind)})`);
        if (!r.ok) return r;
        const tab = kind === "확정" ? "확정" : "완료";
        if (!r.state.cards.some((c) => c.status === (tab === "확정" ? "확정" : "완료"))) r = await this.act(`window.__naver.openTab(${JSON.stringify(tab)})`);
        for (const c of r.state.cards) if (c.no && !seen.has(c.no)) seen.set(c.no, { ...c, time: c.time || s.time, product: c.product || s.product });
      }
    }
    return {
      ok: true,
      day,
      slots: slots.map((s) => ({ time: s.time, product: s.product, cap: s.avail + s.conf + s.done, conf: s.conf, done: s.done })),
      bookings: [...seen.values()],
    };
  }
  /** 이용완료 처리하고 실제로 완료로 바뀌었는지 확인 */
  async complete(b) {
    const g = await this.goDate(b.day);
    if (!g.ok) return g;
    let r = await this.act(`window.__naver.openSlot(${JSON.stringify(b.product || "")}, ${JSON.stringify(b.time)}, "확정")`);
    if (!r.ok) return r;
    if (!r.state.cards.some((c) => c.no === b.no)) r = await this.act(`window.__naver.openTab("확정")`);
    r = await this.act(`window.__naver.complete(${JSON.stringify(b.no)})`);
    if (!r.ok) return r;
    const still = r.state.cards.find((c) => c.no === b.no && c.status === "확정");
    if (still) return { ok: false, why: "네이버에서 이용완료로 바뀌지 않음" };
    return { ok: true };
  }
}

module.exports = { NaverSync, isKidsTicket };
