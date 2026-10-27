/* 고객 메모 (사장님 10/20) — 네이버 예약 손님마다 근무자가 직접 적는 메모(2줄) · 3자녀가정 · 블랙컨슈머
   네이버 예약 메모는 불러오지 않음 (손님마다 읽으면 점점 느려짐) — 이 PC 에서 새로 적기 시작
   파일(앱 폴더 customer-notes.json): { v: 1, notes: { 해시: { m: "메모", k3: true, bl: false, at: "2026-10-20 11:52" } } }
   - 손님 = 전화번호(없으면 '이름:…')를 이 PC 비밀값(visitSalt — 재방문 기록과 같은 값)과 섞은 해시 16자 → 파일에 전화번호 · 이름 없음 (메모 글은 적은 그대로)
   - 메모 · 표시가 모두 비면 그 손님 줄을 지움
   - 저장할 때마다 바로 앞 파일을 customer-notes.bak.json 으로 남김 · 깨졌으면 bak 에서 읽음 · 둘 다 깨졌으면 옆에 두고 새로 (지우지 않음)
   BC(블랙컨슈머) 원아웃 · 투아웃 · 쓰리아웃 (사장님 10/26): bc = 0 ~ 3 (예전 bl 체크 = 원아웃)
   - 운영 설정 → 고객 세부 관리 → BC 관리 목록 · 검색에 보이려고 BC 손님만 이름(nm) · 전화 뒷 4자리(p4) · 표시한 날(bcAt)을 같이 둠
     (전체 전화번호는 없음 · 이 PC 에만 · 클라우드로 안 보냄) — BC 를 풀면 같이 지움
   쓰리아웃 사유 (사장님 10/26): r3 = 고객 카드에서 쓰리아웃으로 올릴 때 쓴 사유 · r3At = 그때 — 투아웃 · 원아웃으로 내려도 남김 (BC 를 다 풀면 같이 지움)
   BC 투아웃 양식 (사장님 10/27): p2 = 투아웃이 된 뒤 입장권 대신 'BC 투아웃 양식 1번'을 낸 때 → 그다음 방문부터 2번 (투아웃 · 쓰리아웃 동안만)
   마일리지 SKIP (사장님 10/26): sk = [n, …] — 그 손님의 n번째 예약완료에는 사은권을 안 띄움 (이미 드린 손님 · 목록에 보이려고 이름 · 뒷 4자리도) */
const fs = require("fs");
const path = require("path");

const FILE = "customer-notes.json", BAK = "customer-notes.bak.json";
const MEMO_MAX = 120; // 2줄 (화면 칸도 2줄을 넘으면 더 안 써짐)
const empty = () => ({ v: 1, notes: {} });

function parse(t) {
  const d = JSON.parse(t);
  if (!d || d.v !== 1 || typeof d.notes !== "object" || !d.notes) throw new Error("모양");
  for (const [k, n] of Object.entries(d.notes)) if (!/^[0-9a-f]{16}$/.test(k) || !n || typeof n !== "object") delete d.notes[k];
  return d;
}
function load(dir) {
  const f = path.join(dir, FILE), b = path.join(dir, BAK);
  let t = null;
  try { t = fs.readFileSync(f, "utf8"); } catch (e) { /* 없음 */ }
  if (t != null) {
    try { return parse(t); } catch (e) {
      try { fs.renameSync(f, path.join(dir, `customer-notes.broken-${Date.now()}.json`)); } catch (e2) { /* 그대로 */ }
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
/** 메모: 줄바꿈은 한 번까지(2줄) · 앞뒤 빈칸 · 길이 */
const cleanMemo = (m) => String(m == null ? "" : m).replace(/\r/g, "").split("\n").slice(0, 2).join("\n").replace(/[ \t]+$/gm, "").trim().slice(0, MEMO_MAX);
/** 쓰리아웃 사유: 줄바꿈 · 겹친 빈칸 정리 · 200자 */
const cleanWhy = (v) => String(v == null ? "" : v).replace(/\r/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
/** 마일리지 SKIP 회차: 1 ~ 999 정수 · 겹침 없이 · 20개까지 · 작은 순 */
const cleanSkip = (v) => [...new Set((Array.isArray(v) ? v : []).map((x) => Math.round(Number(x))).filter((x) => x >= 1 && x <= 999))].sort((a, b) => a - b).slice(0, 20);
/** BC 아웃 단계 0 ~ 3 (예전 bl = 원아웃) */
const bcOf = (n) => { if (!n) return 0; const v = Math.max(0, Math.min(3, Math.round(Number(n.bc) || 0))); return v || (n.bl ? 1 : 0); };
const view = (n) => (n ? Object.assign({}, n, { bc: bcOf(n), bl: bcOf(n) > 0 }) : null);
/** 손님 해시 key 에 메모 · 표시를 씀 → 남은 것 (모두 비면 지우고 null) · note.bc 가 없으면 예전 화면처럼 bl 로 */
function set(d, key, note, at) {
  const prev = d.notes[key] || null, o = note || {};
  const bc = o.bc != null ? bcOf({ bc: o.bc }) : o.bl != null ? (o.bl ? Math.max(1, bcOf(prev)) : 0) : bcOf(prev);
  const n = { m: cleanMemo(o.m), k3: !!o.k3, bc, bl: bc > 0, at: String(at || "").slice(0, 16) };
  const sk = cleanSkip(o.sk !== undefined ? o.sk : prev && prev.sk);
  if (sk.length) n.sk = sk;
  if (bc || sk.length) {
    n.nm = String(o.nm || (prev && prev.nm) || "").trim().slice(0, 20);
    n.p4 = String(o.p4 || (prev && prev.p4) || "").replace(/\D/g, "").slice(-4);
    if (bc) n.bcAt = prev && bcOf(prev) === bc && prev.bcAt ? prev.bcAt : n.at.slice(0, 10); // 단계를 바꾼 날
    // BC 투아웃 양식 (사장님 10/27): p2 = 투아웃 뒤 1번 양식을 낸 때 — 투아웃 · 쓰리아웃 동안만 (원아웃 이하로 내리면 지움 → 다시 투아웃이면 1번부터)
    const p2 = bc >= 2 ? String(o.p2 !== undefined ? o.p2 || "" : (prev && prev.p2) || "").slice(0, 16) : "";
    if (p2) n.p2 = p2;
    const why = bc ? (o.r3 !== undefined ? cleanWhy(o.r3) : (prev && prev.r3) || "") : "";
    if (why) { n.r3 = why; n.r3At = prev && prev.r3 === why && prev.r3At ? prev.r3At : String(o.r3At || n.at).slice(0, 16); }
  }
  if (!n.m && !n.k3 && !bc && !sk.length) { delete d.notes[key]; return null; }
  d.notes[key] = n;
  return n;
}
const get = (d, key) => view(d.notes[key]);
/** BC · 마일리지 SKIP 손님 목록 (BC 쓰리아웃 → 원아웃, 그다음 SKIP 만 있는 손님 · 같은 단계는 이름 가나다 순 · 이름 없으면 뒤 · 사장님 10/26) — id = 해시 */
function list(d) {
  return Object.entries(d.notes).filter(([, n]) => bcOf(n) > 0 || cleanSkip(n.sk).length).map(([id, n]) => ({ id, bc: bcOf(n), sk: cleanSkip(n.sk), nm: n.nm || "", p4: n.p4 || "", m: n.m || "", bcAt: n.bcAt || "", r3: n.r3 || "", r3At: n.r3At || "", at: n.at || "" }))
    .sort((a, b) => b.bc - a.bc || !a.nm - !b.nm || a.nm.localeCompare(b.nm, "ko"));
}
/** 목록에서 바꿈 (해시 id) — patch = { bc?, sk? } → 남은 것 */
function patch(d, id, p, at) {
  if (!/^[0-9a-f]{16}$/.test(String(id || "")) || !d.notes[id]) return null;
  const n = d.notes[id], o = p || {};
  const bc = o.bc != null ? bcOf({ bc: o.bc }) : bcOf(n);
  if (bc === 3 && bcOf(n) < 3) return n; // 쓰리아웃은 고객 카드에서 사유와 함께만 (목록에서는 내리기만)
  return set(d, id, { m: n.m, k3: n.k3, bc, sk: o.sk !== undefined ? o.sk : n.sk, nm: n.nm, p4: n.p4 }, at);
}

module.exports = { FILE, BAK, MEMO_MAX, load, save, set, get, list, patch, bcOf, cleanSkip, cleanWhy, cleanMemo };
