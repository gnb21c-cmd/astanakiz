/* 두 PC 연결 (사장님 11/06) — desk-sync.js: 우편함(보고 클라우드 deskSync/pos · office)을 메모리로 흉내 내어 현장 POS · 사무실 PC 두 개를 돌림
   - 연결 코드: 16자리 · 틀린 코드 · 다른 문서 자리로 옮겨 붙이면 안 풀림 · 우편함에는 손님 이름 · 설정 글이 그대로 안 보임
   - 설정: 늦게 바꾼 쪽이 이김 · 처음 연결하면 사무실 PC 가 현장 설정을 받음 · 같은 때 다른 값은 현장 쪽 (끝없이 다시 보내지 않음)
   - 메모장: 양쪽에서 쓴 메모 · 전달 · 접수 · 지움이 합쳐짐
   - 명령: 사무실 → 현장 한 번만 · 결과가 사무실로 · 10분 넘게 늦은 명령은 안 함
   - 화면: 사무실 PC 가 열려 있을 때만 현장 화면을 올림 · 버전이 다르면 아무것도 반영하지 않음 */
const test = require("node:test");
const assert = require("node:assert");
const S = require("../src/desk-sync");

const BOARD = "demoBoardKey_0123456789";
/** 우편함 (메모리) — 읽기 · 쓰기 수를 셈 */
function mailbox() {
  const docs = {}, n = { get: 0, put: 0 };
  return {
    docs, n,
    io: { get: async (doc) => { n.get++; return { ok: true, json: docs[doc] ? docs[doc].json : null }; }, put: async (doc, json, at) => { n.put++; docs[doc] = { json, at }; return { ok: true, code: 200 }; } },
  };
}
/** PC 하나 (설정 · 메모장 · 처리한 명령) */
function pc(role, mb, clock, opts) {
  const o = Object.assign({ build: "2.20", code: "ABCD-EFGH-JKLM-NPQR", settings: {}, meta: {} }, opts || {});
  const st = { settings: Object.assign({}, o.settings), meta: Object.assign({}, o.meta), memo: { v: 2, admin: "관리자", staff: [], notes: [], msgs: [] }, mm: { su: 0, u: {}, gone: {} }, done: [], ev: [] };
  const local = {
    settings: () => st.settings, meta: () => st.meta,
    applySettings: (ch) => { for (const [k, [t, v]] of Object.entries(ch)) { st.settings[k] = v; st.meta[k] = t; } },
    memo: () => ({ memo: st.memo, mm: st.mm }), applyMemo: (m) => { st.memo = m.memo; st.mm = m.mm; },
    done: () => st.done, markDone: (id) => st.done.push(id),
  };
  const on = { settings: (ks) => st.ev.push(["settings", ks]), memo: () => st.ev.push(["memo"]), snap: (s) => st.ev.push(["snap", s]), cmd: (c) => st.ev.push(["cmd", c]), ack: (a) => st.ev.push(["ack", a]) };
  const sync = new S.DeskSync({ role, build: o.build, board: () => BOARD, code: () => o.code }, mb.io, local, on, clock);
  return {
    st, sync,
    /** 이 PC 에서 설정을 바꿈 (config:set 과 같게) */
    set(patch) { const prev = Object.assign({}, st.settings); Object.assign(st.settings, patch); st.meta = S.stampSettings(prev, st.settings, st.meta, clock.now()); sync.touch(); },
    /** 이 PC 에서 메모장을 저장 (memo:set 과 같게) */
    saveMemo(next) { st.mm = S.stampMemo(st.memo, next, st.mm, clock.now()); st.memo = next; sync.touch(); },
    evs: (k) => st.ev.filter((e) => e[0] === k),
  };
}
const mkClock = (t0) => { const c = { t: t0, now: () => c.t, go: (ms) => { c.t += ms; } }; return c; };
/** 두 PC 를 seconds 초 동안 1초마다 돌림 */
async function run(clock, pcs, seconds) { for (let i = 0; i < seconds; i++) { for (const p of pcs) await p.sync.tick(); clock.go(1000); } }

test("연결 코드: 16자리 · 헷갈리는 글자 없음 · 틀린 코드 · 다른 자리로 옮겨 붙이면 안 풀림", () => {
  const c = S.newCode();
  assert.match(c, /^[2-9A-HJ-NP-Z]{4}(-[2-9A-HJ-NP-Z]{4}){3}$/);
  assert.strictEqual(S.normCode(c.toLowerCase().replace(/-/g, " ")), c.replace(/-/g, ""), "소문자 · 띄어쓰기도 받음");
  assert.strictEqual(S.normCode("ABCD-EFGH-JKLM-NPQ0"), "", "0 은 없는 글자");
  assert.strictEqual(S.normCode("ABCD-EFGH"), "", "짧음");
  const k = S.deriveKey(c, BOARD), box = S.seal(k, { name: "홍길동", t: "#* 입장권" }, "pos|2.20");
  assert.deepStrictEqual(S.unseal(k, box, "pos|2.20"), { name: "홍길동", t: "#* 입장권" });
  assert.ok(!Buffer.from(box, "base64").toString("utf8").includes("홍길동"), "우편함에는 글이 그대로 안 보임");
  assert.throws(() => S.unseal(k, box, "office|2.20"), "사무실 자리로 옮겨 붙이면 안 풀림");
  assert.throws(() => S.unseal(S.deriveKey(S.newCode(), BOARD), box, "pos|2.20"), "다른 연결 코드");
  assert.throws(() => S.unseal(S.deriveKey(c, BOARD + "x"), box, "pos|2.20"), "다른 보고 열쇠");
  const bad = Buffer.from(box, "base64"); bad[bad.length - 1] ^= 1;
  assert.throws(() => S.unseal(k, bad.toString("base64"), "pos|2.20"), "고친 글");
});

test("설정: 처음 연결하면 사무실 PC 가 현장 설정을 받음 → 사무실에서 바꾸면 현장으로 → 현장에서 바꾸면 사무실로 · 각 PC 설정(프린터 포트)은 안 감", async () => {
  const clock = mkClock(Date.UTC(2026, 10, 6, 1, 0, 0)), mb = mailbox();
  const pos = pc("pos", mb, clock, { settings: { peaks: [{ from: "2026-12-20", to: "2027-02-28" }], capAuto: { on: true, target: 40 }, comPort: "COM3" }, meta: { peaks: 1, capAuto: 1 } });
  const off = pc("office", mb, clock, { settings: { capAuto: { on: false, target: 42 } } }); // 사무실 PC 를 처음 깔았을 때 (기본값 · 바꾼 때 0)
  await run(clock, [pos, off], 20);
  assert.deepStrictEqual(off.st.settings.peaks, pos.st.settings.peaks, "성수기 기간");
  assert.deepStrictEqual(off.st.settings.capAuto, { on: true, target: 40 }, "현장 수량 자동조절 설정");
  assert.strictEqual(off.st.settings.comPort, undefined, "프린터 포트는 그 PC 것");
  // 사무실에서 수량 자동조절 목표를 바꿈 → 현장으로
  off.set({ capAuto: { on: true, target: 38 } });
  await run(clock, [pos, off], 20);
  assert.deepStrictEqual(pos.st.settings.capAuto, { on: true, target: 38 });
  assert.ok(pos.evs("settings").some((e) => e[1].includes("capAuto")), "현장 화면에 알림");
  // 현장에서 성수기 기간을 바꿈 → 사무실로
  pos.set({ peaks: [] });
  await run(clock, [pos, off], 20);
  assert.deepStrictEqual(off.st.settings.peaks, []);
  // 양쪽이 비슷한 때 같은 키를 바꾸면 늦은 쪽
  off.set({ capAuto: { on: false, target: 38 } }); clock.go(500); pos.set({ capAuto: { on: true, target: 41 } });
  await run(clock, [pos, off], 20);
  assert.deepStrictEqual(pos.st.settings.capAuto, { on: true, target: 41 });
  assert.deepStrictEqual(off.st.settings.capAuto, { on: true, target: 41 });
  // 다 맞춘 뒤에는 조용함 (사무실 1분마다 '열려 있음' · 현장은 사무실이 열려 있어 1분마다)
  const before = mb.n.put;
  await run(clock, [pos, off], 120);
  assert.ok(mb.n.put - before <= 6, `조용할 때 쓰기 ${mb.n.put - before}번 (2분)`);
});

test("설정: 바꾼 때가 같은데 값이 다르면 현장 POS 쪽 · 끝없이 주고받지 않음", async () => {
  const clock = mkClock(Date.UTC(2026, 10, 6, 1, 0, 0)), mb = mailbox();
  const pos = pc("pos", mb, clock, { settings: { liveOn: true }, meta: { liveOn: 5 } });
  const off = pc("office", mb, clock, { settings: { liveOn: false }, meta: { liveOn: 5 } });
  await run(clock, [pos, off], 30);
  assert.strictEqual(off.st.settings.liveOn, true);
  const before = mb.n.put;
  await run(clock, [pos, off], 30);
  assert.ok(mb.n.put - before <= 2, `맞춘 뒤 30초 쓰기 ${mb.n.put - before}번`);
});

test("메모장: 사무실에서 남긴 전달 → 현장 · 현장 근무자 접수 · 완료 → 사무실 · 양쪽에서 쓴 메모 · 지운 메모 · 근무자 목록", async () => {
  const clock = mkClock(Date.UTC(2026, 10, 6, 1, 0, 0)), mb = mailbox();
  const pos = pc("pos", mb, clock), off = pc("office", mb, clock);
  pos.saveMemo({ v: 2, admin: "관리자", staff: [{ id: "s1", name: "민지" }, { id: "s2", name: "서준" }], notes: [{ id: "n1", who: "s1", text: "열쇠 45번 고무줄", at: "2026-11-06 10:00", done: "" }], msgs: [] });
  await run(clock, [pos, off], 20);
  assert.deepStrictEqual(off.st.memo.staff.map((s) => s.name), ["민지", "서준"], "근무자 목록이 사무실로");
  // 사무실(관리자)이 전달을 남김
  off.saveMemo(Object.assign({}, off.st.memo, { msgs: [{ id: "m1", from: "admin", to: ["s1", "s2"], text: "오늘 16시 수량 13으로 올려 둠", at: "2026-11-06 10:05", st: {} }] }));
  // 같은 때 현장에서는 메모를 하나 더 씀
  pos.saveMemo(Object.assign({}, pos.st.memo, { notes: pos.st.memo.notes.concat([{ id: "n2", who: "s2", text: "휴지 주문", at: "2026-11-06 10:05", done: "" }]) }));
  await run(clock, [pos, off], 20);
  for (const p of [pos, off]) {
    assert.deepStrictEqual(p.st.memo.msgs.map((m) => m.text), ["오늘 16시 수량 13으로 올려 둠"]);
    assert.deepStrictEqual(p.st.memo.notes.map((n) => n.id), ["n1", "n2"]);
  }
  assert.deepStrictEqual(pos.st.memo, off.st.memo, "양쪽이 같음");
  // 현장 근무자 민지가 접수 · 완료
  const m = JSON.parse(JSON.stringify(pos.st.memo));
  m.msgs[0].st = { s1: { ack: "2026-11-06 10:10", done: "2026-11-06 10:30" } };
  pos.saveMemo(m);
  // 사무실에서는 메모 n1 을 지움
  off.saveMemo(Object.assign({}, off.st.memo, { notes: off.st.memo.notes.filter((n) => n.id !== "n1") }));
  await run(clock, [pos, off], 20);
  for (const p of [pos, off]) {
    assert.deepStrictEqual(p.st.memo.msgs[0].st, { s1: { ack: "2026-11-06 10:10", done: "2026-11-06 10:30" } }, "접수 · 완료가 사무실에도");
    assert.deepStrictEqual(p.st.memo.notes.map((n) => n.id), ["n2"], "지운 메모는 양쪽에서 빠짐");
  }
  const before = mb.n.put;
  await run(clock, [pos, off], 30);
  assert.ok(mb.n.put - before <= 2, `맞춘 뒤 조용함 (${mb.n.put - before})`);
});

test("메모장 합치기: 같은 분에 쓴 메모 차례가 양쪽 같음 · 근무자 목록 때가 같으면 현장 쪽", () => {
  const a = { v: 2, admin: "관리자", staff: [{ id: "s1", name: "가" }], notes: [{ id: "zz", who: "s1", text: "1", at: "2026-11-06 10:00", done: "" }], msgs: [] };
  const b = { v: 2, admin: "사장", staff: [{ id: "s1", name: "나" }], notes: [{ id: "aa", who: "s1", text: "2", at: "2026-11-06 10:00", done: "" }], msgs: [] };
  const am = { su: 3, u: { zz: 5 }, gone: {} }, bm = { su: 3, u: { aa: 5 }, gone: {} };
  const x = S.mergeMemo(a, am, b, bm, true), y = S.mergeMemo(b, bm, a, am, false);
  assert.deepStrictEqual(x.memo, y.memo);
  assert.deepStrictEqual(x.memo.notes.map((n) => n.id), ["aa", "zz"]);
  assert.strictEqual(x.memo.admin, "사장", "tieB = b 가 현장");
});

test("명령: 사무실 → 현장 한 번만 · 결과가 사무실로 · 화면은 사무실이 열려 있을 때만 · 10분 넘게 늦은 명령은 안 함", async () => {
  const clock = mkClock(Date.UTC(2026, 10, 6, 1, 0, 0)), mb = mailbox();
  const pos = pc("pos", mb, clock);
  pos.sync.setSnap({ day: "2026-11-06", keys: { used: 3 } });
  await run(clock, [pos], 30); // 사무실 PC 가 아직 안 켜짐
  const first = mb.docs.pos ? S.unseal(S.deriveKey("ABCD-EFGH-JKLM-NPQR", BOARD), JSON.parse(mb.docs.pos.json).box, "pos|2.20") : null;
  assert.ok(!first || first.snap == null, "사무실이 없으면 화면은 안 올림");
  const off = pc("office", mb, clock);
  await run(clock, [pos, off], 25);
  const snaps = off.evs("snap");
  assert.ok(snaps.length >= 1, "사무실이 켜지면 현장 화면이 옴");
  assert.deepStrictEqual(snaps[snaps.length - 1][1], { day: "2026-11-06", keys: { used: 3 } });
  pos.sync.setSnap({ day: "2026-11-06", keys: { used: 4 } });
  await run(clock, [pos, off], 10);
  assert.deepStrictEqual(off.evs("snap").pop()[1].keys.used, 4, "바뀐 화면도 10초 안에");
  // 명령
  const id = off.sync.cmd("capTry", { day: "2026-11-06", time: "16:00", n: 13 });
  await run(clock, [pos, off], 10);
  const got = pos.evs("cmd");
  assert.strictEqual(got.length, 1);
  assert.deepStrictEqual(got[0][1], { id, act: "capTry", args: { day: "2026-11-06", time: "16:00", n: 13 } });
  pos.sync.ack(id, true, "16:00 10→13");
  await run(clock, [pos, off], 30);
  assert.strictEqual(pos.evs("cmd").length, 1, "같은 명령은 한 번만");
  assert.deepStrictEqual(off.evs("ack").map((e) => [e[1].id, e[1].ok, e[1].msg]), [[id, true, "16:00 10→13"]]);
  assert.strictEqual(off.sync.status().waiting, 0);
  // 사무실을 끄면 2분 30초 뒤 현장은 화면을 안 올림
  const quiet = mb.n.put;
  await run(clock, [pos], 400);
  assert.ok(!pos.sync.peerActive(), "사무실 꺼짐");
  assert.ok(mb.n.put - quiet <= 4, `사무실이 꺼진 뒤 현장 쓰기 ${mb.n.put - quiet}번`);
  // 늦은 명령: 사무실이 우편함에 넣었는데 현장 POS 가 11분 뒤에야 읽음 (꺼져 있었음)
  const old = off.sync.cmd("capNow", {});
  await off.sync.put();
  clock.go(11 * 60 * 1000);
  await run(clock, [pos], 20);
  assert.strictEqual(pos.evs("cmd").length, 1, "늦은 명령은 안 함");
  assert.ok(pos.sync.acks.some((a) => a.id === old && !a.ok), "늦어서 안 했다고 답함");
  // 사무실 쪽: 10분 동안 답이 없던 명령은 '답이 없어요'로 끝냄
  await run(clock, [off], 10);
  assert.ok(off.evs("ack").some((e) => e[1].id === old && !e[1].ok), "사무실에도 결과");
  assert.strictEqual(off.sync.status().waiting, 0);
});

test("버전이 다르면: 설정 · 메모 · 명령 · 화면 모두 반영 안 함 · 양쪽에 '버전이 달라요' / 연결 코드가 다르면 '연결 코드가 서로 달라요'", async () => {
  const clock = mkClock(Date.UTC(2026, 10, 6, 1, 0, 0)), mb = mailbox();
  const pos = pc("pos", mb, clock, { build: "2.20", settings: { liveOn: false }, meta: { liveOn: 9 } });
  const off = pc("office", mb, clock, { build: "2.19", settings: { liveOn: true }, meta: { liveOn: 1 } });
  off.sync.cmd("capNow", {});
  await run(clock, [pos, off], 30);
  assert.strictEqual(off.st.settings.liveOn, true, "설정 안 받음");
  assert.strictEqual(pos.evs("cmd").length, 0, "명령 안 함");
  assert.match(pos.sync.status().why, /버전이 달라요 — 사무실 PC ver\.2\.19 · 이 PC ver\.2\.20/);
  assert.match(off.sync.status().why, /버전이 달라요 — 현장 POS ver\.2\.20 · 이 PC ver\.2\.19/);
  assert.strictEqual(off.sync.status().same, false);
  // 같은 버전 · 다른 연결 코드
  const mb2 = mailbox();
  const p2 = pc("pos", mb2, clock), o2 = pc("office", mb2, clock, { code: "ZZZZ-ZZZZ-ZZZZ-ZZZZ" });
  await run(clock, [p2, o2], 30);
  assert.match(o2.sync.status().why, /연결 코드가 서로 달라요/);
  assert.match(p2.sync.status().why, /연결 코드가 서로 달라요/);
});

test("우편함 오류 (규칙 없음 403 · 인터넷): 상태에 이유 · 다시 되면 이어짐", async () => {
  const clock = mkClock(Date.UTC(2026, 10, 6, 1, 0, 0)), mb = mailbox();
  let down = true;
  const io = { get: async (d) => (down ? { ok: false, code: 403, why: "열쇠나 모양이 틀림 (403) — 보고 시스템 규칙에 deskSync 가 있는지" } : mb.io.get(d)), put: async (d, j, a) => (down ? { ok: false, code: 403, why: "403" } : mb.io.put(d, j, a)) };
  const pos = pc("pos", { io }, clock, { settings: { liveOn: false }, meta: { liveOn: 3 } }), off = pc("office", { io }, clock);
  await run(clock, [pos, off], 20);
  assert.strictEqual(off.sync.status().ok, false);
  assert.match(off.sync.status().getWhy, /deskSync/);
  down = false;
  await run(clock, [pos, off], 40);
  assert.strictEqual(off.sync.status().ok, true);
  assert.strictEqual(off.st.settings.liveOn, false, "다시 되면 밀린 설정이 감");
});
