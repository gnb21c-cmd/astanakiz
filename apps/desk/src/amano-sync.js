/* 데스크 ↔ 아마노 화면 동기화 (Node 쪽)
   exec(code) 는 아마노 페이지에서 코드 문자열을 실행해 결과를 돌려주는 함수
   - 실제 앱: amanoWindow.webContents.executeJavaScript(code, true)
   - 시험: playwright page.evaluate(code)
   동작(검색·선택·할인·삭제) 뒤에는 화면이 다 바뀔 때까지(페이지 새로 열림 포함) 기다렸다가 다시 읽는다. */
const { DRIVER_SOURCE } = require("./amano-driver");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) => JSON.stringify(Object.assign({}, s, { mark: null, dialog: null }));

class AmanoSync {
  constructor(exec, opts = {}) {
    this.exec = exec;
    this.selectors = opts.selectors || {};
    this.timeout = opts.timeout || 8000;
  }

  call(expr) {
    const code = `(() => { window.__amanoSel = ${JSON.stringify(this.selectors)}; (${DRIVER_SOURCE})(); return ${expr}; })()`;
    return this.exec(code);
  }

  async read() {
    for (let i = 0; i < 20; i++) {
      try {
        return await this.call("window.__amano.read()");
      } catch (e) {
        await sleep(200); // 페이지가 새로 열리는 중
      }
    }
    throw new Error("아마노 화면을 읽을 수 없음");
  }

  /** 동작 하나를 하고, 화면이 안정될 때까지 기다렸다가 결과 상태를 돌려줌 */
  async act(expr, opts = {}) {
    const mark = "m" + Date.now() + Math.random().toString(36).slice(2);
    let before;
    try {
      before = await this.call(`(window.__amano.mark(${JSON.stringify(mark)}), window.__amano.read())`);
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

    const t0 = Date.now();
    let last = null;
    let lastAt = 0;
    while (Date.now() - t0 < this.timeout) {
      await sleep(150);
      let s;
      try {
        s = await this.call("window.__amano.read()");
      } catch (e) {
        continue;
      }
      const key = strip(s);
      if (key !== last) {
        last = key;
        lastAt = Date.now();
        continue;
      }
      const changed = s.mark !== mark || key !== strip(before);
      const stable = Date.now() - lastAt >= 300;
      const done = (changed && stable) || (!changed && Date.now() - t0 > 1500); // 결과가 그대로인 경우 (같은 검색 등)
      if (done) return { ok: true, dialog: (res && res.dialog) || s.dialog || "", state: s };
    }
    return { ok: false, why: "아마노 화면이 응답하지 않음", state: await this.read().catch(() => null) };
  }

  search(day, no) {
    return this.act(`window.__amano.search(${JSON.stringify(day)}, ${JSON.stringify(no)})`);
  }
  select(id) {
    return this.act(`window.__amano.select(${JSON.stringify(id)})`);
  }
  discount(type) {
    return this.act(`window.__amano.discount(${JSON.stringify(type)})`);
  }
  remove(index) {
    return this.act(`window.__amano.remove(${Number(index)})`);
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
