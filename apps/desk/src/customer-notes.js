/* 고객 메모 (사장님 10/20) — 네이버 예약 손님마다 근무자가 직접 적는 메모(2줄) · 3자녀가정 · 블랙컨슈머
   네이버 예약 메모는 불러오지 않음 (손님마다 읽으면 점점 느려짐) — 이 PC 에서 새로 적기 시작
   파일(앱 폴더 customer-notes.json): { v: 1, notes: { 해시: { m: "메모", k3: true, bl: false, at: "2026-10-20 11:52" } } }
   - 손님 = 전화번호(없으면 '이름:…')를 이 PC 비밀값(visitSalt — 재방문 기록과 같은 값)과 섞은 해시 16자 → 파일에 전화번호 · 이름 없음 (메모 글은 적은 그대로)
   - 메모 · 표시가 모두 비면 그 손님 줄을 지움
   - 저장할 때마다 바로 앞 파일을 customer-notes.bak.json 으로 남김 · 깨졌으면 bak 에서 읽음 · 둘 다 깨졌으면 옆에 두고 새로 (지우지 않음) */
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
/** 손님 해시 key 에 메모 · 표시를 씀 → 남은 것 (모두 비면 지우고 null) */
function set(d, key, note, at) {
  const n = { m: cleanMemo(note && note.m), k3: !!(note && note.k3), bl: !!(note && note.bl), at: String(at || "").slice(0, 16) };
  if (!n.m && !n.k3 && !n.bl) { delete d.notes[key]; return null; }
  d.notes[key] = n;
  return n;
}
const get = (d, key) => d.notes[key] || null;

module.exports = { FILE, BAK, MEMO_MAX, load, save, set, get, cleanMemo };
