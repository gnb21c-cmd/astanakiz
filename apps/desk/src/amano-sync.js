/* 데스크 ↔ 아마노 화면 동기화 (Node 쪽)
   exec(code) 는 아마노 페이지에서 코드 문자열을 실행해 결과를 돌려주는 함수
   - 실제 앱: amanoWindow.webContents.executeJavaScript(code, true)
   - 시험: playwright page.evaluate(code)
   동작(검색·선택·할인·삭제) 뒤에는 알림 창(OK)을 자동으로 닫아 가며, 화면이 다 바뀔 때까지 기다렸다가 다시 읽는다.
   실제 아마노는 할인 등록·삭제 뒤 다시 조회하면서 첫 줄을 자동 선택하므로, 우리가 고른 차량을 다시 골라 둔다. */
const { DRIVER_SOURCE } = require("./amano-driver");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) => JSON.stringify(Object.assign({}, s, { mark: null, dialog: null, busy: null }));

class AmanoSync {
  constructor(exec, opts = {}) {
    this.exec = exec;
    this.selectors = opts.selectors || {};
    this.timeout = opts.timeout || 10000;
    this.last = { day: null, no: null, id: null }; // 마지막 검색·선택 (등록·삭제 뒤 다시 맞춤)
  }

  call(expr) {
    const code = `(() => { window.__amanoSel = ${JSON.stringify(this.selectors)}; (${DRIVER_SOURCE})(); return ${expr}; })()`;
    return this.exec(code);
  }

  async read() {
    for (let i = 0; i < 25; i++) {
      try {
        return await this.call("window.__amano.read()");
      } catch (e) {
        await sleep(200); // 페이지가 새로 열리는 중
      }
    }
    throw new Error("아마노 화면을 읽을 수 없음");
  }

  /** 동작 하나를 하고, 알림 창을 닫아 가며 화면이 안정될 때까지 기다렸다가 상태를 돌려줌 */
  async act(expr, opts = {}) {
    const mark = "m" + Date.now() + Math.random().toString(36).slice(2);
    let before;
    try {
      before = await this.call(`(window.__amano.dismiss(), window.__amano.mark(${JSON.stringify(mark)}), window.__amano.read())`);
    } catch (e) {
      return { ok: false, why: "아마노 화면이 열려 있지 않음" };
    }
    if (before.needLogin && !opts.allowLogin) return { ok: false, why: "아마노에 다시 로그인해 주세요", state: before };
    let res;
    try {
      res = await this.call(expr);
    } catch (e) {
      res = { ok: true }; // 누르자마자 페이지가 바뀌면 여기로 옴
    }
    if (res && res.ok === false) return { ok: false, why: res.why, state: before };

    const dialogs = [];
    const t0 = Date.now();
    let last = null;
    let lastAt = 0;
    while (Date.now() - t0 < this.timeout) {
      await sleep(150);
      let s;
      try {
        const d = await this.call("window.__amano.dismiss()"); // "등록되었습니다." · "삭제가 완료 되었습니다." 등 → OK
        if (d) {
          dialogs.push(d);
          last = null; // OK 뒤에 다시 조회가 시작되므로 처음부터 다시 기다림
          continue;
        }
        s = await this.call("window.__amano.read()");
      } catch (e) {
        continue;
      }
      if (s.busy) continue; // 아마노가 요청 중
      const key = strip(s);
      if (key !== last) {
        last = key;
        lastAt = Date.now();
        continue;
      }
      const changed = s.mark !== mark || key !== strip(before) || dialogs.length > 0;
      const stable = Date.now() - lastAt >= 400;
      if ((changed && stable) || (!changed && Date.now() - t0 > 1500)) return { ok: true, dialogs, dialog: dialogs.join(" / "), state: s };
    }
    return { ok: false, why: "아마노 화면이 응답하지 않음", dialogs, state: await this.read().catch(() => null) };
  }

  async search(day, no) {
    this.last = { day, no, id: null };
    return this.act(`window.__amano.search(${JSON.stringify(day)}, ${JSON.stringify(no)})`);
  }
  async select(id) {
    this.last.id = id;
    return this.act(`window.__amano.select(${JSON.stringify(id)})`);
  }
  /** 등록·삭제 뒤: 아마노가 다시 조회하며 다른 차량을 골라 둘 수 있으니 우리가 고른 차량으로 되돌림 */
  async restore(r) {
    const { day, no, id } = this.last;
    if (!r.ok || !id) return r;
    const s = r.state;
    const mine = s && s.rows.find((x) => x.id === id);
    if (mine && s.detail.no && mine.no === s.detail.no) return r; // 목록에 우리 차가 있고 상세도 우리 차면 그대로
    let r2 = await this.act(`window.__amano.search(${JSON.stringify(day)}, ${JSON.stringify(no)})`);
    if (r2.ok) r2 = await this.act(`window.__amano.select(${JSON.stringify(id)})`);
    return { ...r2, dialogs: r.dialogs, dialog: r.dialog };
  }
  async discount(type) {
    const r = await this.act(`window.__amano.discount(${JSON.stringify(type)})`);
    if (r.ok && !/등록/.test(r.dialog || "")) return { ...r, ok: false, why: `아마노가 '${type}' 등록을 확인해 주지 않음${r.dialog ? ` (${r.dialog})` : ""}` };
    return this.restore(r);
  }
  async remove(index) {
    const r = await this.act(`window.__amano.remove(${Number(index)})`);
    return this.restore(r);
  }
  /** 로그인 (화면이 바뀔 때까지 기다림) */
  login(id, pw) {
    return this.act(`window.__amano.login(${JSON.stringify(id)}, ${JSON.stringify(pw)})`, { allowLogin: true });
  }
  /** 배우기: 근무자가 아마노 화면에서 다음에 누르는 칸의 선택자 */
  learn() {
    return this.call("window.__amano.learn()");
  }
}

module.exports = { AmanoSync };
