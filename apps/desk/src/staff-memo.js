/* 근무자 메모장 (V2.0 · 사장님 10/21) — 전 근무자가 남기고 다음 근무자가 확인
   파일(앱 폴더 staff-memo.json): { v: 1, staff: [{ id, name, grp }], hand: [...], notes: [...] }
   - staff: 근무자 (운영 설정 → 근무자 등록) · grp = "평일" | "주말"
   - hand: 근무자 전달 { id, dir: "평일→주말" | "주말→평일", text, by, at, ok, okBy } — 받은 쪽이 [확인함] (ok = 확인한 때)
   - notes: 각자 메모 { id, who(근무자 id), text, at, done } — 해결하면 done = 해결한 때 → 그 사람 '완료'에 남음 (찾기)
   - 이 PC 에만 · 클라우드로 안 보냄 · 손님 정보를 적는 칸이 아님
   - 저장할 때마다 바로 앞 파일을 staff-memo.bak.json 으로 남김 · 깨졌으면 bak 에서 읽음 · 둘 다 깨졌으면 옆에 두고 새로 (지우지 않음) */
const fs = require("fs");
const path = require("path");

const FILE = "staff-memo.json", BAK = "staff-memo.bak.json";
const TEXT_MAX = 300, NAME_MAX = 12;
const LIMIT = { staff: 30, hand: 300, notes: 3000 }; // 넘으면 오래된 것부터 (해결 · 확인한 것 먼저)
const DIRS = ["평일→주말", "주말→평일"], GRPS = ["평일", "주말"];
const empty = () => ({ v: 1, staff: [], hand: [], notes: [] });

const str = (v, n) => String(v == null ? "" : v).replace(/\r/g, "").trim().slice(0, n);
const stamp = (v) => (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(v || "")) ? String(v) : "");
const idOk = (v) => /^[a-z0-9]{1,16}$/.test(String(v || ""));
/** 줄 수 제한: 끝난 것(확인 · 해결)부터 오래된 순으로 뺌 */
function trim(list, max, isDone) {
  if (list.length <= max) return list;
  let cut = list.length - max;
  const drop = new Set();
  for (const pass of [true, false]) for (const x of list) { if (!cut) break; if (!drop.has(x) && !!isDone(x) === pass) { drop.add(x); cut--; } }
  return list.filter((x) => !drop.has(x));
}
/** 화면이 보낸 것 → 저장할 모양 (모르는 칸 · 틀린 값은 버림) */
function clean(d) {
  const out = empty();
  const seen = new Set();
  for (const s of Array.isArray(d && d.staff) ? d.staff : []) {
    if (!s || !idOk(s.id) || seen.has(s.id)) continue;
    seen.add(s.id);
    out.staff.push({ id: s.id, name: str(s.name, NAME_MAX).replace(/\n/g, " "), grp: GRPS.includes(s.grp) ? s.grp : "평일" });
  }
  out.staff = out.staff.slice(0, LIMIT.staff);
  for (const h of Array.isArray(d && d.hand) ? d.hand : []) {
    const text = str(h && h.text, TEXT_MAX);
    if (!h || !idOk(h.id) || !text || !DIRS.includes(h.dir)) continue;
    out.hand.push({ id: h.id, dir: h.dir, text, by: idOk(h.by) ? h.by : "", at: stamp(h.at), ok: stamp(h.ok), okBy: idOk(h.okBy) ? h.okBy : "" });
  }
  out.hand = trim(out.hand, LIMIT.hand, (h) => h.ok);
  for (const n of Array.isArray(d && d.notes) ? d.notes : []) {
    const text = str(n && n.text, TEXT_MAX);
    if (!n || !idOk(n.id) || !text || !idOk(n.who)) continue;
    out.notes.push({ id: n.id, who: n.who, text, at: stamp(n.at), done: stamp(n.done) });
  }
  out.notes = trim(out.notes, LIMIT.notes, (n) => n.done);
  return out;
}
function parse(t) {
  const d = JSON.parse(t);
  if (!d || d.v !== 1 || !Array.isArray(d.staff) || !Array.isArray(d.hand) || !Array.isArray(d.notes)) throw new Error("모양");
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

module.exports = { FILE, BAK, TEXT_MAX, NAME_MAX, LIMIT, DIRS, load, save, clean, empty };
