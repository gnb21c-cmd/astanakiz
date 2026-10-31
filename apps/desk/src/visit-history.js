/* 재방문 간격 (사장님 10/19) — 이 PC 에만 두는 방문 기록 + 보고 앱으로 보낼 일수 모음 (손님 정보 없음)
   기록 파일(앱 폴더 visit-history.json): { v: 1, days: { "2026-10-26": { src: "naver" | "desk", k: [해시 …], c: { 해시: [완료 n, 그날 건수, 읽은 날] } } } }
   - 그날 네이버 이용완료한 손님만 · 손님 = 전화번호(없으면 이름)를 이 PC 비밀값과 섞은 해시 16자 (이름 · 전화번호는 남기지 않음)
   - src: naver = 네이버 예약현황에서 그날 이용완료를 다시 읽음([지난 방문 기록 읽기]) · desk = 데스크에서 입장 처리할 때마다 더함
   - c (사장님 10/31 · 신규 · 기존 나누기): 손님마다 네이버 카드 '완료 n'(읽은 때까지 센 수) · 그날 이용완료 건수 · 읽은 날 — 없으면 모름
   - 방문 = 그날 한 건이라도 (같은 날 여러 건 = 한 번)
   - 과거 · 이벤트 (사장님 10/31): 손님마다 기간별로 한 번 — 과거 = 4/1 이후 처음 온 날(과거 끝날까지) → 그다음 방문(이벤트 기간이어도) ·
     이벤트 = 시작일 뒤 처음 온 날(끝날까지) → 그다음 방문 · 다음 방문이 아직 없으면 안 셈(매일 다시 셈) · 오늘 뒤는 안 봄 · 많은 순 10개
   - 신규 · 기존: 4/1 이후 처음 온 날의 '완료 n'으로 그 앞(4/1 전 교환권 무료) 이용 수 → 0 신규 · 1 이상 기존 · 모르면 전체에만
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
    for (const [d, x] of Object.entries(h.days)) {
      if (!isDay(d) || !x || !Array.isArray(x.k)) delete h.days[d];
      else if (x.c != null && (typeof x.c !== "object" || Array.isArray(x.c))) delete x.c;
    }
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
/** 그날 손님들을 더함 (있던 손님은 그대로 · 한 번 네이버로 읽은 날은 naver 로 남음) — 바뀌었으면 true
    counts = { 해시: [완료 n, 그날 건수, 읽은 날] } — 네이버로 읽은 값은 바꿔 넣음 · 데스크 값은 비었거나 데스크가 그날 넣은 것만 바꿈 */
function setDay(h, day, keys, src, counts) {
  if (!isDay(day)) return false;
  const was = h.days[day], set = new Set(was ? was.k : []);
  const n = set.size;
  for (const k of keys || []) if (k) set.add(String(k));
  const s = src === "naver" || (was && was.src === "naver") ? "naver" : "desk";
  let changed = !was || set.size !== n || was.src !== s;
  const c = Object.assign({}, (was && was.c) || {});
  for (const [k, v] of Object.entries(counts || {})) {
    if (!k || !Array.isArray(v) || v[0] == null || v[0] === "" || !(Number(v[0]) >= 0) || !isDay(v[2])) continue; // 완료 n 을 모르면 안 남김
    const old = c[k], nv = [Number(v[0]), Math.max(1, Number(v[1]) || 1), v[2]];
    if (src !== "naver" && old && old[2] !== day) continue; // 네이버로 읽은 값은 데스크가 안 덮음
    if (!old || old.join() !== nv.join()) { c[k] = nv; changed = true; }
  }
  h.days[day] = Object.keys(c).length ? { src: s, k: [...set].sort(), c } : { src: s, k: [...set].sort() };
  return changed;
}
/** 지난 방문 기록에서 읽을 날 (to → from 거꾸로): 아직 네이버로 안 읽은 날 먼저 · 그다음 네이버로 읽었지만 완료 n 이 없는 날 (예전 판에서 읽음 · 사장님 10/31) */
function backfillDays(h, from, to) {
  const fresh = [], again = [];
  for (let d = to; d >= from; d = shiftDay(d, -1)) {
    const x = h.days[d];
    if (!(x && x.src === "naver")) fresh.push(d);
    else if (!x.c) again.push(d);
  }
  return fresh.concat(again);
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
/** 4/1(paid) 전 이용 수 (사장님 10/31 · 신규 · 기존): 4/1 이후 처음 온 날 F 의 '완료 n' − 그날 건수 — 모르거나 앞뒤가 안 맞으면 null
    '완료 n'은 읽은 때까지 센 수 → F 의 n = 읽은 n − (F 뒤 ~ 읽은 날까지 건수) · 그날 읽은 값(데스크 입장) 중 마지막을 먼저, 없으면 F 날 값, 그것도 없으면 마지막 값 */
function priorOf(h, k, days, paid) {
  const v = days.filter((d) => d >= paid);
  if (!v.length) return null;
  const F = v[0], cOf = (d) => (h.days[d].c || {})[k], b = (d) => (cOf(d) ? cOf(d)[1] : 1);
  const has = v.filter((d) => cOf(d));
  if (!has.length) return null;
  const same = has.filter((d) => cOf(d)[2] === d);
  const d0 = same.length ? same[same.length - 1] : cOf(F) ? F : has[has.length - 1];
  const [n, , rd] = cOf(d0);
  const after = v.filter((d) => d > F && d <= rd).reduce((a, d) => a + b(d), 0);
  const prior = n - after - b(F);
  return prior >= 0 ? prior : null;
}
/** 기간 재방문 (손님마다 한 번): 기간 안(from ~ to) 처음 온 날 → 그다음 방문(오늘까지 · 기간 뒤여도) — kind(손님) 이 "new" · "old" 면 groups 도 */
function firstGap(byP, from, to, top, kind) {
  const all = [], g = { new: [], old: [] };
  for (const [k, days] of byP) {
    const i = days.findIndex((d) => d >= from);
    if (i < 0 || days[i] > to || i + 1 >= days.length) continue;
    const gap = dayDiff(days[i], days[i + 1]);
    all.push(gap);
    const w = kind(k);
    if (w) g[w].push(gap);
  }
  const out = { revisits: all.length, people: all.length, top: topOf(all, top) };
  const groups = {};
  for (const w of ["new", "old"]) if (g[w].length) groups[w] = { revisits: g[w].length, people: g[w].length, top: topOf(g[w], top) };
  if (Object.keys(groups).length) out.groups = groups;
  return out;
}
/** opts = { today, past: { from, to }, event: { from, to } | null, paid: "2026-04-01"(신규 · 기존 기준 · 없으면 past.from), recent: 30, top: 10 } */
function stats(h, opts) {
  const today = opts.today, top = opts.top || 10, recentN = opts.recent || 30;
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
  // 신규 · 기존: 4/1 전 이용 수 0 = 신규 · 1 이상 = 기존 · 모르면 null
  const p = opts.past, paid = isDay(opts.paid) ? opts.paid : p && isDay(p.from) ? p.from : "";
  const kinds = new Map();
  const kind = (k) => { if (!kinds.has(k)) { const x = paid ? priorOf(h, k, byP.get(k), paid) : null; kinds.set(k, x == null ? null : x === 0 ? "new" : "old"); } return kinds.get(k); };
  // 과거 (오늘까지만)
  if (p && isDay(p.from) && isDay(p.to)) { const to = p.to < today ? p.to : today; out.past = { from: p.from, to, ...firstGap(byP, p.from, to, top, kind) }; }
  else out.past = null;
  // 이벤트 (시작 전이면 빈 목록 · 진행 중이면 오늘까지 · 끝났으면 끝난 날까지)
  const e = opts.event;
  if (e && isDay(e.from)) {
    const end = isDay(e.to) ? e.to : "", to = end && end < today ? end : today;
    if (e.from > today) out.event = { from: e.from, to: e.from, end, revisits: 0, people: 0, top: [], started: false };
    else out.event = { from: e.from, to, end, ...firstGap(byP, e.from, to, top, kind) };
  } else out.event = null;
  return out;
}

module.exports = { FILE, load, save, setDay, backfillDays, stats, hashKey, shiftDay, dayDiff };
