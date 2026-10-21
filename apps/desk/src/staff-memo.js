/* 근무자 메모장 (V2.0 · 사장님 10/21 다시) — 사람마다 상자 · 내 메모 · 전달(받을 사람 고름 · 관리자는 모두에게) · 기록
   평일 1명 · 주말 2명이 돌아가며 PC 앞에 있음 → 날(평일 / 주말)로 나누지 않고 사람마다
   파일(앱 폴더 staff-memo.json): { v: 2, admin: "관리자", staff: [{ id, name }], notes: [...], msgs: [...] }
   - staff: 근무자 (운영 설정 → 근무자 등록 · 이름 = 메인 화면 상자 글: 이름 · 별칭 · 성) · 관리자 = id "admin" (상자 글 admin)
   - notes: 내 메모 { id, who, text, at, done } — 완료하면 done = 완료한 때 (지난 기록 · 찾기 · 되돌리기) · 지우기는 화면에서
   - msgs: 전달 { id, from, to: [받는 사람], text, at, st: { 받는 사람: { ack: 접수한 때, done: 완료한 때 } } }
   - 이 PC 에만 · 클라우드로 안 보냄 · 손님 정보를 적는 칸이 아님
   - 1번 모양(V2.0 처음 · 평일 ↔ 주말 전달 hand)은 읽을 때 전달(msgs)로 바꿈: 받는 사람 = 쓴 사람 빼고 모든 근무자 · 확인한 것은 접수 · 완료로
   - 저장할 때마다 바로 앞 파일을 staff-memo.bak.json 으로 남김 · 깨졌으면 bak 에서 읽음 · 둘 다 깨졌으면 옆에 두고 새로 (지우지 않음) */
const fs = require("fs");
const path = require("path");

const FILE = "staff-memo.json", BAK = "staff-memo.bak.json";
const TEXT_MAX = 300, NAME_MAX = 12, ADMIN = "admin";
const LIMIT = { staff: 30, notes: 5000, msgs: 3000, to: 40 }; // 넘으면 오래된 것부터 (끝난 것 먼저)
const empty = () => ({ v: 2, admin: "관리자", staff: [], notes: [], msgs: [] });

const str = (v, n) => String(v == null ? "" : v).replace(/\r/g, "").trim().slice(0, n);
const stamp = (v) => (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(v || "")) ? String(v) : "");
const idOk = (v) => /^[a-z0-9]{1,16}$/.test(String(v || ""));
/** 줄 수 제한: 끝난 것부터 오래된 순으로 뺌 */
function trim(list, max, isDone) {
  if (list.length <= max) return list;
  let cut = list.length - max;
  const drop = new Set();
  for (const pass of [true, false]) for (const x of list) { if (!cut) break; if (!drop.has(x) && !!isDone(x) === pass) { drop.add(x); cut--; } }
  return list.filter((x) => !drop.has(x));
}
/** 전달이 끝났나: 받는 사람 모두 완료 */
const msgDone = (m) => m.to.every((p) => m.st[p] && m.st[p].done);
/** 1번 모양 hand → 전달 */
function fromHand(d, staff) {
  const out = [];
  for (const h of Array.isArray(d.hand) ? d.hand : []) {
    if (!h || !idOk(h.id)) continue;
    const by = idOk(h.by) ? h.by : "";
    const to = staff.map((s) => s.id).filter((p) => p !== by);
    if (!to.length) continue;
    const ok = stamp(h.ok), st = {};
    if (ok) for (const p of to) st[p] = { ack: ok, done: ok };
    out.push({ id: h.id, from: by, to, text: h.text, at: h.at, st });
  }
  return out;
}
/** 화면이 보낸 것 → 저장할 모양 (모르는 칸 · 틀린 값은 버림) */
function clean(d) {
  const out = empty();
  out.admin = str(d && d.admin, NAME_MAX).replace(/\n/g, " ") || "관리자";
  const seen = new Set([ADMIN]);
  for (const s of Array.isArray(d && d.staff) ? d.staff : []) {
    if (!s || !idOk(s.id) || seen.has(s.id)) continue;
    seen.add(s.id);
    out.staff.push({ id: s.id, name: str(s.name, NAME_MAX).replace(/\n/g, " ") });
  }
  out.staff = out.staff.slice(0, LIMIT.staff);
  for (const n of Array.isArray(d && d.notes) ? d.notes : []) {
    const text = str(n && n.text, TEXT_MAX);
    if (!n || !idOk(n.id) || !text || !idOk(n.who)) continue;
    out.notes.push({ id: n.id, who: n.who, text, at: stamp(n.at), done: stamp(n.done) });
  }
  out.notes = trim(out.notes, LIMIT.notes, (n) => n.done);
  const msgs = (Array.isArray(d && d.msgs) ? d.msgs : []).concat(fromHand(d || {}, out.staff));
  const ids = new Set();
  for (const m of msgs) {
    const text = str(m && m.text, TEXT_MAX);
    if (!m || !idOk(m.id) || ids.has(m.id) || !text) continue;
    const to = [...new Set((Array.isArray(m.to) ? m.to : []).filter(idOk))].slice(0, LIMIT.to);
    if (!to.length) continue;
    ids.add(m.id);
    const st = {};
    for (const p of to) {
      const x = m.st && m.st[p];
      if (!x) continue;
      const done = stamp(x.done), ack = stamp(x.ack) || done;
      if (ack) st[p] = { ack, done };
    }
    out.msgs.push({ id: m.id, from: idOk(m.from) ? m.from : "", to, text, at: stamp(m.at), st });
  }
  out.msgs = trim(out.msgs, LIMIT.msgs, msgDone);
  return out;
}
function parse(t) {
  const d = JSON.parse(t);
  if (!d || (d.v !== 1 && d.v !== 2) || !Array.isArray(d.staff) || !Array.isArray(d.notes)) throw new Error("모양");
  return clean(d);
}
function load(dir) {
  const f = path.join(dir, FILE), b = path.join(dir, BAK);
  let t = null;
  try { t = fs.readFileSync(f, "utf8"); } catch (e) { /* 없음 */ }
  if (t != null) {
    try { return parse(t); } catch (e) {
      try { fs.renameSync(f, path.join(dir, `staff-memo.broken-${Date.now()}.json`)); } catch (e2) { /* 그대로 */ }
    }
  }
  try { return parse(fs.readFileSync(b, "utf8")); } catch (e) { return empty(); }
}
function save(dir, d) {
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, FILE);
  fs.writeFileSync(f + ".tmp", JSON.stringify(d), "utf8");
  try { fs.copyFileSync(f, path.join(dir, BAK)); } catch (e) { /* 처음 */ }
  fs.renameSync(f + ".tmp", f);
}

module.exports = { FILE, BAK, TEXT_MAX, NAME_MAX, LIMIT, ADMIN, load, save, clean, empty, msgDone };
