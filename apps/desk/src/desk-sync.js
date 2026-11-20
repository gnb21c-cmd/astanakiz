/* 두 PC 연결 (사장님 11/06) — 현장 POS(본 PC) ↔ 사무실 PC · 같은 버전끼리 같은 설정 · 같은 화면
   고정 IP 가 없어 두 PC 가 직접 이어지지 않음 → 둘 다 바깥 '우편함'에 자기 문서 하나를 덮어쓰고 반대편 문서를 읽음
   - 우편함 = 보고 시스템 클라우드 (키즈 실시간과 같은 보고 열쇠): boards/{열쇠}/deskSync/pos · deskSync/office
     (GitHub 는 바뀔 때마다 기록이 영구히 쌓이고 · 손님 이름 · 네이버 번호를 저장소에 못 넣고 · POS 에 쓰기 열쇠가 필요해 쓰지 않음)
   - 문서 안 내용은 '연결 코드'(현장 POS 가 만듦 → 사무실 PC 에 넣음)로 잠금: scrypt 로 열쇠를 만들고 AES-256-GCM
     → 보고 열쇠를 아는 사람도 읽거나 가짜 명령을 넣지 못함 (지우거나 덮어쓰면 연결만 끊김)
   - 같은 버전(build)일 때만 풀어서 반영 — 다르면 양쪽 화면에 "버전이 달라요"
   주고받는 것
   - 설정(SHARED 키): 키마다 마지막으로 바꾼 때(t)가 늦은 쪽이 이김
   - 근무자 메모장: 메모 · 전달마다 마지막으로 바꾼 때(u) · 지운 것(gone) · 근무자 목록(su)
   - 현장 POS → 사무실: 지금 화면(snap — 사무실 PC 가 열려 있을 때만) · 명령 결과(acks)
   - 현장 POS → 사무실: 재방문 장부(led · 사장님 11/19 — 사무실 카드에도 '이벤트 도전 시작 · 성공') — 사무실이 열려 있고 사무실이 가진 장부 지문(lh)이 다를 때만 · 1분에 한 번까지
     (우편함 규칙상 문서는 pos · office 둘뿐 → 따로 문서를 두지 않고 현장 문서에 같이 · 문서가 너무 길면 지난 이벤트 장부부터 덜어냄)
   - 사무실 → 현장 POS: 명령(cmds — 수량 조절 등, 현장 POS 가 네이버에 넣음) · 10분 넘게 늦은 명령은 안 함 · 같은 명령은 한 번만
   이 파일은 Electron 없이 시험할 수 있게 우편함 읽기 · 쓰기(io)를 밖에서 받음 */
const crypto = require("crypto");
const zlib = require("zlib");

/** 함께 쓰는 설정 (settings.json 키) — 프린터 포트 · 아마노 · 네이버 주소 · 보고 열쇠 · 쿠폰 봉인 열쇠 · 손님 기록은 각 PC 에만 */
const SHARED = ["peaks", "capAuto", "unpaidCancel", "stockAuto", "printForm", "printSet", "bc2Forms", "bc", "visitEvent", "walkEvent", "liveOn", "announce"]; // announce = 안내 방송 (11/07 · 목소리는 각 PC annVoice)
const ROLES = ["pos", "office"];
const other = (role) => (role === "pos" ? "office" : "pos");
const ALPHA = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 헷갈리는 0 · 1 · I · O 없음 (32자 → 16자리 = 80비트)
const CODE_LEN = 16;
const CMD_TTL = 10 * 60 * 1000; // 명령은 10분 안에 닿아야 함
const PEER_IDLE = 150 * 1000; // 반대편 소식이 2분 30초 넘게 없으면 꺼진 것으로
const T = { activePull: 4000, idlePull: 15000, beat: 60000, minPush: 3000, officePush: 1000, ledgerGap: 60000 };
const MAX_DOC = 880000; // 우편함 한 문서 900,000자 미만 (보고 시스템 규칙) — 넘으면 장부를 덜어냄

/** 재방문 장부 덜어내기 (문서가 너무 길 때): 지난 이벤트 → 지금 이벤트의 오래된 줄부터 반씩 · events = { 시작일: 장부 글 } · cur = 지금 이벤트 시작일 */
function trimLedger(events, cur, step) {
  const ks = Object.keys(events || {});
  if (step === 0 && ks.some((k) => k !== cur)) return { [cur]: events[cur] || "" };
  const lines = String((events || {})[cur] || "").split("\n").filter(Boolean);
  if (lines.length < 2) return null;
  return { [cur]: lines.slice(Math.floor(lines.length / 2)).join("\n") + "\n" };
}

/** 연결 코드 새로 만들기 "ABCD-EFGH-JKLM-NPQR" */
function newCode() {
  const b = crypto.randomBytes(CODE_LEN);
  let s = "";
  for (let i = 0; i < CODE_LEN; i++) s += ALPHA[b[i] & 31];
  return fmtCode(s);
}
/** 넣은 코드 → 16자리 (띄어쓰기 · - 빼고 대문자) · 틀리면 "" */
function normCode(c) {
  const s = String(c || "").toUpperCase().replace(/[\s-]/g, "");
  return s.length === CODE_LEN && [...s].every((ch) => ALPHA.includes(ch)) ? s : "";
}
const fmtCode = (s) => String(s).match(/.{1,4}/g).join("-");
/** 연결 코드 + 보고 열쇠 → 잠금 열쇠 (32바이트) */
function deriveKey(code, board) {
  const c = normCode(code);
  if (!c || !board) return null;
  return crypto.scryptSync(c, `astanakiz-sync|${board}`, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}
/** 잠그기: JSON → 압축 → AES-256-GCM (aad = 누가 · 어느 버전 — 다른 문서 자리에 옮겨 붙여도 안 풀림) */
function seal(key, obj, aad) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(String(aad)));
  const ct = Buffer.concat([c.update(zlib.deflateRawSync(Buffer.from(JSON.stringify(obj), "utf8"))), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}
/** 풀기 — 코드가 다르거나 고쳐졌으면 throw */
function unseal(key, box, aad) {
  const b = Buffer.from(String(box || ""), "base64");
  if (b.length < 29) throw new Error("짧음");
  const d = crypto.createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
  d.setAAD(Buffer.from(String(aad)));
  d.setAuthTag(b.subarray(12, 28));
  const raw = Buffer.concat([d.update(b.subarray(28)), d.final()]);
  return JSON.parse(zlib.inflateRawSync(raw, { maxOutputLength: 8 * 1024 * 1024 }).toString("utf8"));
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** "2026-11-06 14:05:12" → ms (이 PC 시계로) */
const atMs = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(s || "")); return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : 0; };
const stamp = (ms) => { const d = new Date(ms), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };

// ── 설정: 키마다 늦게 바꾼 쪽 ──
/** 이 PC 에서 바꾼 설정 → 바꾼 때 남기기 (같은 값이면 그대로) */
function stampSettings(prev, next, meta, nowMs) {
  const m = Object.assign({}, meta);
  for (const k of SHARED) if (next[k] !== undefined && !same(prev[k], next[k])) m[k] = nowMs;
  return m;
}
/** 반대편 설정 { 키: [t, 값] } → 이 PC 에 넣을 것 { 키: [t, 값] }
    반대편이 더 늦게 바꾼 키 · 때가 같은데 값이 다르면 현장 POS 쪽 (tieRemote = 반대편이 현장 POS) — 서로 끝없이 다시 보내지 않게 */
function pickSettings(local, meta, remote, tieRemote) {
  const out = {};
  for (const k of SHARED) {
    const r = remote && remote[k];
    if (!Array.isArray(r) || r.length !== 2 || typeof r[0] !== "number" || r[1] === undefined) continue;
    const m = meta[k] || 0;
    if (r[0] > m || (r[0] === m && tieRemote && !same(local[k], r[1]))) out[k] = r;
  }
  return out;
}
/** 반대편에 아직 없는 내 설정이 있나 (내가 더 늦게 바꿈 · 반대편에 없는 키 · 때가 같은데 값이 다르고 내가 현장 POS) */
function settingsAhead(local, meta, remote, tieMine) {
  const mine = packSettings(local, meta);
  return Object.entries(mine).some(([k, [t, v]]) => {
    const r = remote && remote[k];
    if (!Array.isArray(r)) return true;
    return t > r[0] || (t === r[0] && tieMine && !same(v, r[1]));
  });
}
/** 보낼 설정 { 키: [t, 값] } */
const packSettings = (local, meta) => Object.fromEntries(SHARED.filter((k) => local[k] !== undefined).map((k) => [k, [meta[k] || 0, local[k]]]));

// ── 근무자 메모장: 메모 · 전달마다 늦게 바꾼 쪽 · 지운 것 · 근무자 목록 ──
const GONE_KEEP = 60 * 24 * 3600 * 1000;
const memoItems = (d) => [...(d.notes || []).map((x) => ["n", x]), ...(d.msgs || []).map((x) => ["m", x])];
/** 이 PC 에서 메모장을 저장할 때: 바뀐 메모 · 전달은 u = 지금, 없어진 것은 gone · 근무자 목록이 바뀌면 su = 지금 */
function stampMemo(prev, next, mm, nowMs) {
  const old = new Map(memoItems(prev || {}).map(([, x]) => [x.id, x]));
  const u = {}, gone = Object.assign({}, mm.gone || {});
  for (const [, x] of memoItems(next)) {
    const p = old.get(x.id);
    u[x.id] = p && same(p, x) ? (mm.u && mm.u[x.id]) || 1 : nowMs;
    delete gone[x.id];
  }
  const now = new Set(memoItems(next).map(([, x]) => x.id));
  for (const id of old.keys()) if (!now.has(id)) gone[id] = nowMs;
  for (const [id, t] of Object.entries(gone)) if (nowMs - t > GONE_KEEP) delete gone[id];
  const head = (d) => [d.admin, d.staff];
  const su = prev && same(head(prev), head(next)) ? mm.su || 1 : nowMs;
  return { su, u, gone };
}
/** 두 메모장 합치기 → { memo, mm } (a = 이 PC · b = 반대편 · 때가 같은데 다르면 tieB 가 참일 때 b = 현장 POS 쪽)
    차례는 쓴 때 → id (양쪽이 같은 차례가 되게) */
function mergeMemo(a, am, b, bm, tieB) {
  const gone = Object.assign({}, am.gone || {});
  for (const [id, t] of Object.entries(bm.gone || {})) gone[id] = Math.max(gone[id] || 0, t);
  const pick = new Map(); // id → [kind, item, u]
  for (const [d, m] of [[a, am], [b, bm]]) for (const [k, x] of memoItems(d)) {
    const t = (m.u && m.u[x.id]) || 1, cur = pick.get(x.id);
    if (!cur || t > cur[2] || (t === cur[2] && d === b && tieB)) pick.set(x.id, [k, x, t]);
  }
  const u = {}, notes = [], msgs = [];
  for (const [id, [k, x, t]] of pick) {
    if ((gone[id] || 0) >= t) continue;
    delete gone[id];
    u[id] = t;
    (k === "n" ? notes : msgs).push(x);
  }
  const key = (x) => `${x.at || ""}|${x.id}`;
  const byAt = (p, q) => (key(p) < key(q) ? -1 : key(p) > key(q) ? 1 : 0);
  notes.sort(byAt); msgs.sort(byAt);
  const headB = (bm.su || 0) > (am.su || 0) || ((bm.su || 0) === (am.su || 0) && tieB);
  const memo = { v: 2, admin: headB ? b.admin : a.admin, staff: headB ? b.staff : a.staff, notes, msgs };
  return { memo, mm: { su: Math.max(am.su || 0, bm.su || 0), u, gone } };
}

/* ── 연결 하나 (main.js 가 하나 만들어 돌림) ──
   io = { get(doc) → { ok, json | null, code, why }, put(doc, json, at) → { ok, code, why } }
   cfg = { role, build, board() → 보고 열쇠, code() → 연결 코드 }
   local = { settings() → { 키: 값 }, meta() → { 키: t }, applySettings({ 키: [t, 값] }),
             memo() → { memo, mm }, applyMemo({ memo, mm }), done() → [명령 id], markDone(id) }
   on = { settings(바뀐 키), memo(), snap(화면), cmd(명령), ack(결과), status(상태) } — 모두 없어도 됨 */
class DeskSync {
  constructor(cfg, io, local, on, clock) {
    this.cfg = cfg; this.io = io; this.local = local; this.on = on || {};
    this.now = (clock && clock.now) || (() => Date.now());
    this.key = null; this.keyFor = "";
    this.n = 0; // 내 문서 번호 (쓸 때마다 +1)
    this.dirty = true; this.lastPut = 0; this.lastPutTry = 0; this.lastGet = 0;
    this.snap = null; this.snapDirty = false;
    this.cmds = []; // 사무실: 보낸 명령 (결과를 받을 때까지)
    this.ledgerAt = 0; // 현장: 장부를 마지막으로 실어 보낸 때 · peer.lh = 사무실이 가진 장부 지문
    this.acks = []; // 현장: 명령 결과 (15분)
    this.peer = { n: -1, build: "", at: "", seen: 0, changed: 0, gotN: -1, lh: "" };
    this.st = { ok: null, why: "", putWhy: "", getWhy: "", same: null, codeOk: null, ledger: "" };
  }
  get role() { return this.cfg.role; }
  /** 연결 코드 · 보고 열쇠로 잠금 열쇠 (바뀌었을 때만 다시 — scrypt 는 느림) */
  ensureKey() {
    const board = this.cfg.board(), code = this.cfg.code();
    const tag = `${board}|${normCode(code)}`;
    if (tag !== this.keyFor) { this.keyFor = tag; this.key = deriveKey(code, board); }
    return this.key;
  }
  ready() { return ROLES.includes(this.role) && !!this.ensureKey(); }
  /** 반대편이 지금 켜져 있나 (마지막으로 문서가 바뀐 때부터 2분 30초) */
  peerActive() { return !!this.peer.changed && this.now() - this.peer.changed < PEER_IDLE; }
  touch() { this.dirty = true; }
  setSnap(s) { if (this.role !== "pos" || same(s, this.snap)) return; this.snap = s; this.snapDirty = true; }
  /** 사무실: 명령 보내기 → id */
  cmd(act, args) {
    const id = crypto.randomBytes(6).toString("hex");
    this.cmds.push({ id, t: this.now(), act: String(act), args: args || {} });
    this.dirty = true;
    return id;
  }
  /** 현장: 명령 결과 */
  ack(id, ok, msg) {
    this.acks = this.acks.filter((a) => a.id !== id && this.now() - a.t < 15 * 60 * 1000).concat([{ id, ok: !!ok, msg: String(msg || "").slice(0, 300), t: this.now() }]).slice(-40);
    this.dirty = true;
  }
  status() {
    return Object.assign({}, this.st, {
      role: this.role, build: this.cfg.build, ready: this.ready(),
      peer: { build: this.peer.build, at: this.peer.at, seen: this.peer.seen, active: this.peerActive() },
      lastPut: this.lastPut, lastGet: this.lastGet, waiting: this.cmds.length,
    });
  }
  emitStatus() { if (this.on.status) this.on.status(this.status()); }
  /** 현장: 지금 장부 { h(지문), cur(지금 이벤트 시작일), events: { 시작일: 글 } } 또는 null — main.js 가 몇 분마다 새로 셈 */
  ledgerNow() { return this.role === "pos" && this.local.ledger ? this.local.ledger() : null; }
  /** 현장: 이번에 장부를 실어 보낼까 — 사무실이 열려 있고 · 사무실 지문이 다르고 · 1분에 한 번까지 */
  ledgerDue() {
    const L = this.ledgerNow();
    return !!(L && L.h && this.st.same === true && this.peerActive() && this.peer.lh !== L.h && this.now() - this.ledgerAt >= T.ledgerGap); // 같은 버전일 때만 (다르면 사무실이 못 풂)
  }
  /** 내 문서 내용 */
  payload() {
    const s = this.local.settings(), meta = this.local.meta(), m = this.local.memo();
    const p = { n: this.n, at: stamp(this.now()), build: this.cfg.build, set: packSettings(s, meta), memo: m.memo, mm: m.mm };
    if (this.role === "pos") {
      p.acks = this.acks; p.snap = this.peerActive() ? this.snap : null; p.seen = this.peer.gotN;
      const L = this.ledgerNow();
      if (L && L.h) { p.lh = L.h; if (this.ledgerDue()) { p.led = L.events; p.lcur = L.cur; } }
    } else {
      p.cmds = this.cmds.filter((c) => this.now() - c.t < CMD_TTL); p.open = true;
      p.lh = this.local.ledgerHave ? String(this.local.ledgerHave() || "") : ""; // 내가 가진 장부 지문 → 현장이 다르면 실어 보냄
    }
    return p;
  }
  /** 쓸 때인가: 바뀐 것이 있으면 (현장은 3초 · 사무실은 1초 간격) · 사무실은 1분마다 '열려 있음' · 현장은 사무실이 열려 있으면 1분마다 */
  wantPut() {
    const t = this.now(), gap = this.role === "pos" ? T.minPush : T.officePush;
    if (t - this.lastPutTry < gap) return false;
    if (this.dirty) return true;
    if (this.role === "pos" && this.snapDirty && this.peerActive()) return true;
    if (this.role === "pos" && this.ledgerDue()) return true;
    if (this.role === "office" || this.peerActive()) return t - this.lastPut >= T.beat;
    return false;
  }
  async put() {
    if (!this.ready()) return;
    this.lastPutTry = this.now();
    this.n++;
    const p = this.payload(), aad = `${this.role}|${this.cfg.build}`;
    const env = () => JSON.stringify({ type: "astanakiz-sync", v: 1, role: this.role, build: this.cfg.build, n: this.n, at: p.at, box: seal(this.key, p, aad) });
    let json = env();
    // 장부를 실어 너무 길면 덜어냄 (지난 이벤트 → 오래된 줄부터) · 그래도 길면 장부 없이
    for (let step = 0; p.led && json.length >= MAX_DOC; step++) {
      const t = trimLedger(p.led, p.lcur, step);
      if (t) { p.led = t; p.lcut = true; } else { delete p.led; delete p.lcur; delete p.lcut; this.st.ledger = "장부가 너무 길어 사무실로 못 보냈어요"; }
      json = env();
    }
    if (p.led) { this.ledgerAt = this.now(); this.st.ledger = p.lcut ? "장부가 길어 오래된 것은 빼고 보냈어요" : ""; }
    const wasDirty = this.dirty, wasSnap = this.snapDirty;
    this.dirty = false; this.snapDirty = false;
    const r = await this.io.put(this.role, json, p.at);
    if (r && r.ok) { this.lastPut = this.now(); this.st.putWhy = ""; }
    else { this.dirty = this.dirty || wasDirty; this.snapDirty = this.snapDirty || wasSnap; this.st.putWhy = (r && r.why) || "못 씀"; }
    this.st.ok = !!(r && r.ok) && !this.st.getWhy;
    this.emitStatus();
    return r;
  }
  /** 반대편 문서 읽기 · 반영 */
  async pull() {
    if (!this.ready()) return;
    this.lastGet = this.now();
    const r = await this.io.get(other(this.role));
    if (!r || !r.ok) { this.st.getWhy = (r && r.why) || "못 읽음"; this.st.ok = false; this.emitStatus(); return; }
    this.st.getWhy = "";
    this.st.ok = !this.st.putWhy;
    if (r.json) this.take(r.json);
    this.emitStatus();
  }
  take(json) {
    let env;
    try { env = JSON.parse(json); } catch (e) { return; }
    if (!env || env.type !== "astanakiz-sync" || env.role !== other(this.role)) return;
    const fresh = env.n !== this.peer.n || env.build !== this.peer.build;
    if (fresh) {
      // 처음 읽은 문서는 쓴 때가 2분 30초 안일 때만 '켜져 있음' (어제 문서를 보고 켜졌다고 하지 않게)
      const first = this.peer.n === -1, at = atMs(env.at);
      if (!first || (at && Math.abs(this.now() - at) < PEER_IDLE)) this.peer.changed = first ? at : this.now();
      this.peer.n = env.n;
    }
    Object.assign(this.peer, { build: String(env.build || ""), at: String(env.at || ""), seen: this.now() });
    this.st.same = env.build === this.cfg.build;
    if (!this.st.same) { this.st.why = `버전이 달라요 — ${this.role === "pos" ? "사무실 PC" : "현장 POS"} ver.${env.build} · 이 PC ver.${this.cfg.build} (같은 버전으로 설치하면 이어져요)`; return; }
    if (!fresh && this.st.codeOk) return;
    let p;
    try { p = unseal(this.key, env.box, `${env.role}|${env.build}`); } catch (e) { this.st.codeOk = false; this.st.why = "연결 코드가 서로 달라요 — 현장 POS 의 연결 코드를 이 PC 에 다시 넣어 주세요"; return; }
    this.st.codeOk = true; this.st.why = "";
    this.peer.gotN = env.n;
    // 설정
    const pos = this.role === "pos";
    const ch = pickSettings(this.local.settings(), this.local.meta(), p.set || {}, !pos);
    if (Object.keys(ch).length) { this.local.applySettings(ch); if (this.on.settings) this.on.settings(Object.keys(ch)); }
    if (settingsAhead(this.local.settings(), this.local.meta(), p.set || {}, pos)) this.dirty = true; // 내 쪽이 더 늦게 바꾼 것이 있으면 다시 보냄
    // 메모장
    if (p.memo && p.mm) {
      const mine = this.local.memo();
      const m = mergeMemo(mine.memo, mine.mm, p.memo, p.mm, !pos);
      if (!same(m.memo, mine.memo) || !same(m.mm, mine.mm)) { this.local.applyMemo(m); if (this.on.memo) this.on.memo(m.memo); }
      if (!same(m.memo, p.memo)) this.dirty = true;
    }
    if (pos) {
      this.peer.lh = typeof p.lh === "string" ? p.lh : ""; // 사무실이 가진 장부 지문
      const done = new Set(this.local.done());
      for (const c of Array.isArray(p.cmds) ? p.cmds : []) {
        if (!c || !/^[0-9a-f]{12}$/.test(c.id) || done.has(c.id)) continue;
        this.local.markDone(c.id); done.add(c.id);
        if (this.now() - Number(c.t) > CMD_TTL) { this.ack(c.id, false, "10분 넘게 늦게 닿아 하지 않았어요"); continue; }
        if (this.on.cmd) this.on.cmd({ id: c.id, act: String(c.act || ""), args: c.args || {} });
        else this.ack(c.id, false, "현장 POS 가 아직 준비되지 않았어요");
      }
      if (p.open) this.snapDirty = this.snapDirty || (fresh && !!this.snap);
    } else {
      if (p.snap && this.on.snap) this.on.snap(p.snap, env.at);
      // 재방문 장부 (11/19): 현장이 실어 보낸 것 → 이 PC 에 두고 화면을 다시 · 받았다고 바로 알림(내 지문)
      const have = this.local.ledgerHave ? String(this.local.ledgerHave() || "") : "";
      if (p.led && typeof p.led === "object" && typeof p.lh === "string" && p.lh && p.lh !== have && this.local.applyLedger) {
        this.local.applyLedger({ h: p.lh, cur: String(p.lcur || ""), events: p.led, cut: !!p.lcut, at: env.at });
        this.dirty = true;
        if (this.on.ledger) this.on.ledger(p.lh);
      }
      for (const a of Array.isArray(p.acks) ? p.acks : []) {
        const i = this.cmds.findIndex((c) => c.id === a.id);
        if (i < 0) continue;
        const c = this.cmds.splice(i, 1)[0];
        if (this.on.ack) this.on.ack({ id: a.id, act: c.act, ok: !!a.ok, msg: String(a.msg || "") });
      }
      const old = this.cmds.filter((c) => this.now() - c.t >= CMD_TTL);
      this.cmds = this.cmds.filter((c) => this.now() - c.t < CMD_TTL);
      for (const c of old) if (this.on.ack) this.on.ack({ id: c.id, act: c.act, ok: false, msg: "현장 POS 가 10분 동안 답이 없어요 (꺼짐 · 인터넷 확인)" });
    }
  }
  /** 다음 읽기까지: 사무실 4초 · 현장은 사무실이 열려 있으면 4초 · 아니면 15초 */
  pullGap() { return this.role === "office" || this.peerActive() ? T.activePull : T.idlePull; }
  /** 1초마다 부름 — 읽기 · 쓰기 중 하나라도 하는 중이면 기다림 */
  async tick() {
    if (this.busy || !this.ready()) return;
    this.busy = true;
    try {
      if (this.now() - this.lastGet >= this.pullGap()) await this.pull();
      if (this.wantPut()) await this.put();
    } finally { this.busy = false; }
  }
}

module.exports = { SHARED, ROLES, T, CMD_TTL, PEER_IDLE, MAX_DOC, trimLedger, newCode, normCode, fmtCode, deriveKey, seal, unseal, stampSettings, pickSettings, settingsAhead, packSettings, stampMemo, mergeMemo, DeskSync, stamp, atMs };
