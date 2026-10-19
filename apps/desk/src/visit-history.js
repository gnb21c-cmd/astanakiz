/* 재방문 간격 (사장님 10/19) — 이 PC 에만 두는 방문 기록 + 보고 앱으로 보낼 일수 모음 (손님 정보 없음)
   기록 파일(앱 폴더 visit-history.json): { v: 1, days: { "2026-10-26": { src: "naver" | "desk", k: [해시 …] } } }
   - 그날 네이버 이용완료한 손님만 · 손님 = 전화번호(없으면 이름)를 이 PC 비밀값과 섞은 해시 16자 (이름 · 전화번호는 남기지 않음)
   - src: naver = 네이버 예약현황에서 그날 이용완료를 다시 읽음([지난 방문 기록 읽기]) · desk = 데스크에서 입장 처리할 때마다 더함
   - 방문 = 그날 한 건이라도 (같은 날 여러 건 = 한 번) · 재방문 간격 = 같은 손님의 바로 앞 방문 → 다음 방문 일수
   - 과거 · 이벤트 기간은 두 방문이 모두 그 기간 안일 때만 (경계를 넘는 재방문은 어느 쪽에도 안 셈) · 오늘 뒤는 안 봄
   - 지난 30일: 30일 안에 온 손님마다 '마지막 방문 − 바로 전 방문'(전 방문은 언제든) → 가장 많은 일수 · 평균 · 가운데 값 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const FILE = "visit-history.json";
const empty = () => ({ v: 1, days: {} });
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));
const dayMs = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const dayDiff = (a, b) => Math.round((dayMs(b) - dayMs(a)) / 86400000);
const shiftDay = (d, n) => new Date(dayMs(d) + n * 86400000).toISOString().slice(0, 10);

/** 손님 키(전화번호 숫자 · '이름:…') → 비밀값을 섞은 해시 16자 */
const hashKey = (salt, key) => crypto.createHash("sha256").update(`${salt}|${key}`).digest("hex").slice(0, 16);

function load(dir) {
  const f = path.join(dir, FILE);
  let t;
  try { t = fs.readFileSync(f, "utf8"); } catch (e) { return empty(); }
  try {
    const h = JSON.parse(t);
    if (!h || h.v !== 1 || typeof h.days !== "object" || !h.days) throw new Error("모양");
    for (const [d, x] of Object.entries(h.days)) if (!isDay(d) || !x || !Array.isArray(x.k)) delete h.days[d];
    return h;
  } catch (e) {
    try { fs.renameSync(f, path.join(dir, `visit-history.broken-${Date.now()}.json`)); } catch (e2) { /* 그대로 */ }
    return empty();
  }
}
function save(dir, h) {
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, FILE);
  fs.writeFileSync(f + ".tmp", JSON.stringify(h), "utf8");
  fs.renameSync(f + ".tmp", f);
}
/** 그날 손님들을 더함 (있던 손님은 그대로 · 한 번 네이버로 읽은 날은 naver 로 남음) — 바뀌었으면 true */
function setDay(h, day, keys, src) {
  if (!isDay(day)) return false;
  const was = h.days[day], set = new Set(was ? was.k : []);
  const n = set.size;
  for (const k of keys || []) if (k) set.add(String(k));
  const s = src === "naver" || (was && was.src === "naver") ? "naver" : "desk";
  const changed = !was || set.size !== n || was.src !== s;
  h.days[day] = { src: s, k: [...set].sort() };
  return changed;
}
/** 손님 → 방문일(오름차순, 오늘까지) */
function visitsByPerson(h, today) {
  const m = new Map();
  for (const d of Object.keys(h.days).sort()) {
    if (today && d > today) continue;
    for (const k of h.days[d].k) { if (!m.has(k)) m.set(k, []); m.get(k).push(d); }
  }
  return m;
}
/** 일수 → 수 → 많은 순(같으면 짧은 일수 먼저) n 개 */
const topOf = (gaps, n) => [...gaps.reduce((m, g) => m.set(g, (m.get(g) || 0) + 1), new Map())].map(([days, count]) => ({ days, count })).sort((a, b) => b.count - a.count || a.days - b.days).slice(0, n);
/** 기간 안 재방문 (두 방문 모두 from ~ to) */
function within(byP, from, to, top) {
  const gaps = [];
  let people = 0;
  for (const days of byP.values()) {
    let mine = 0;
    for (let i = 1; i < days.length; i++) if (days[i - 1] >= from && days[i] <= to) { gaps.push(dayDiff(days[i - 1], days[i])); mine++; }
    if (mine) people++;
  }
  return { revisits: gaps.length, people, top: topOf(gaps, top) };
}
/** opts = { today, past: { from, to }, event: { from, to } | null, recent: 30, top: 7 } */
function stats(h, opts) {
  const today = opts.today, top = opts.top || 7, recentN = opts.recent || 30;
  const byP = visitsByPerson(h, today);
  const days = Object.keys(h.days).filter((d) => !today || d <= today).sort();
  const out = { history: { from: days[0] || "", to: days[days.length - 1] || "", days: days.length } };
  // 지난 30일
  const rFrom = shiftDay(today, -(recentN - 1)), gaps = [];
  let people = 0;
  for (const v of byP.values()) {
    const last = v[v.length - 1];
    if (last < rFrom) continue;
    people++;
    if (v.length >= 2) gaps.push(dayDiff(v[v.length - 2], last));
  }
  const sorted = gaps.slice().sort((a, b) => a - b), mid = sorted.length >> 1;
  const mode = topOf(gaps, 1)[0] || null;
  out.recent = { from: rFrom, to: today, people, revisits: gaps.length, mode, avg: gaps.length ? Math.round((gaps.reduce((a, g) => a + g, 0) / gaps.length) * 10) / 10 : null,
    median: !sorted.length ? null : sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2 };
  // 과거 (오늘까지만)
  const p = opts.past;
  if (p && isDay(p.from) && isDay(p.to)) { const to = p.to < today ? p.to : today; out.past = { from: p.from, to, ...within(byP, p.from, to, top) }; }
  else out.past = null;
  // 이벤트 (시작 전이면 빈 목록 · 진행 중이면 오늘까지 · 끝났으면 끝난 날까지)
  const e = opts.event;
  if (e && isDay(e.from)) {
    const end = isDay(e.to) ? e.to : "", to = end && end < today ? end : today;
    if (e.from > today) out.event = { from: e.from, to: e.from, end, revisits: 0, people: 0, top: [], started: false };
    else out.event = { from: e.from, to, end, ...within(byP, e.from, to, top) };
  } else out.event = null;
  return out;
}

module.exports = { FILE, load, save, setDay, stats, hashKey, shiftDay, dayDiff };
