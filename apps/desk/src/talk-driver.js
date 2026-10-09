/* 네이버 톡톡 파트너센터 상담 목록에서 '새 메시지' 수 읽기 (키즈상담 · 카페상담 버튼의 붉은 원 · 사장님 10/8)
   화면 (현장 사진 10/8 · 10/9, partner.talk.naver.com/web/accounts/…/chat):
     왼쪽 메뉴(프로필 관리 · 상담관리 112 · 요청서 관리 …) | 가운데 상담 목록(전체 · 대기 · 진행중 탭, '안읽은 메시지 112개 전체 보기',
     줄마다 프로필 · 닉네임 · 마지막 말 | 오른쪽 위 시각(오후 01:06 / 10월 6일) · 그 밑 붉은 원 숫자 · 새 창 아이콘) | 오른쪽 대화
   - 손님이 새로 말하면 그 줄 시각 밑에 붉은 원 + 숫자(손님이 보낸 안 읽은 말풍선 수)가 생기고, 대화를 열어 읽으면 사라짐 → 줄마다 이 숫자를 더함
   - 왼쪽 메뉴 '상담관리 112' · '안읽은 메시지 112개'는 상담완료를 잘 안 눌러 쌓인 수라 쓰지 않음
   - 실제 화면의 이름표(class)를 아직 못 봐서 모양으로 찾음 (v2 · 10/9 현장: v1 이 실제 화면에서 숫자를 못 찾음):
       ① 숫자만 있는 작은 글자(1~3자리)를 먼저 모두 찾고 — 붉은 바탕(자기 · 바로 위 작은 칸 · ::before/::after) 또는 이름표에 unread · badge · count · cnt · num · new · noti
       ② 그 글자에서 위로 올라가며 시각 글자(오후 01:06 · 10월 6일 …)를 처음 품는 칸이 높이 260 이하면 = 상담 목록 한 줄 → 그 줄의 숫자
         (왼쪽 메뉴 숫자 · '안읽은 메시지' 숫자 · 탭 숫자는 시각이 있는 작은 줄 안에 있지 않아 빠짐)
       ③ 붉은 숫자가 하나라도 있으면 붉은 것만 셈, 없으면 이름표로 찾은 것
   - 결과에 찾은 후보(글자 · class · 색 · 크기)를 조금 남김 → 숫자가 안 맞으면 '화면 저장 (문제 확인용)' 파일과 같이 보고 맞춤 (손님 이름 · 대화는 남기지 않음) */
function talkUnread() {
  const login = /(^|\.)nid\.naver\.com$/.test(location.host) || !!document.querySelector('input[type="password"]');
  if (login) return { ok: false, needLogin: true, why: "네이버 로그인이 필요해요" };
  if (location.protocol === "https:" && !/(^|\.)naver\.com$/.test(location.host)) return { ok: true, n: 0, rows: 0, other: true }; // 광고 등 다른 액자
  if (!document.body) return { ok: true, n: 0, rows: 0 };
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const own = (e) => norm([...e.childNodes].filter((x) => x.nodeType === 3).map((x) => x.textContent).join(""));
  const textOf = (e) => (e.children.length ? own(e) : norm(e.textContent));
  const box = (e) => e.getBoundingClientRect();
  // 눈에 보이는 것만 (화면 읽기용으로 숨긴 1px 글자 · 안 보이는 칸은 뺌)
  const shown = (e) => {
    const r = box(e);
    if (r.width < 3 || r.height < 3) return false;
    const s = getComputedStyle(e);
    return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) !== 0;
  };
  const cls = (e) => (e.getAttribute && e.getAttribute("class")) || "";
  const TIME = /^(?:(?:오전|오후)\s*\d{1,2}:\d{2}|\d{1,2}:\d{2}|\d{1,2}월\s*\d{1,2}일|어제|그제|\d{2,4}[./-]\s*\d{1,2}[./-]\s*\d{1,2}\.?)$/;
  const all = [...document.body.querySelectorAll("*")];
  const times = all.filter((e) => TIME.test(textOf(e)) && shown(e));
  const hasTime = (p) => times.some((t) => p.contains(t));
  const isRed = (c) => {
    const m = String(c || "").match(/[\d.]+/g);
    if (!m || m.length < 3) return false;
    const [r, g, b, a = 1] = m.map(Number);
    return a > 0.5 && r >= 190 && g <= 130 && b <= 130;
  };
  const small = (e) => { const r = box(e); return r.width <= 48 && r.height <= 40; };
  // 붉은 바탕: 그 글자 칸 · 바로 위 작은 칸(동그라미) · 동그라미를 ::before/::after 로 그린 경우
  const red = (e) => {
    for (let p = e, i = 0; p && i < 3 && small(p); p = p.parentElement, i++) {
      if (isRed(getComputedStyle(p).backgroundColor)) return true;
      for (const ps of ["::before", "::after"]) if (isRed(getComputedStyle(p, ps).backgroundColor)) return true;
    }
    return false;
  };
  const hint = (e) => { for (let p = e, i = 0; p && i < 3; p = p.parentElement, i++) if (/unread|badge|count|cnt|num|new|noti/i.test(cls(p))) return true; return false; };
  // 동그라미 · 알약 모양 (이름표로만 찾은 숫자는 둥글어야 함 — 대화 안의 '1'(안 읽음 표시) 같은 맨 글자는 빼려고)
  const round = (e) => {
    for (let p = e, i = 0; p && i < 3 && small(p); p = p.parentElement, i++) {
      for (const ps of [null, "::before", "::after"]) {
        const s = getComputedStyle(p, ps);
        if (parseFloat(s.borderTopLeftRadius) >= Math.max(4, box(p).height * 0.3) && (ps === null || s.content !== "none")) return true;
      }
    }
    return false;
  };
  // ① 숫자만 있는 작은 글자
  const cands = [];
  for (const e of all) {
    const m = textOf(e).match(/^(\d{1,3})\+?$/);
    if (!m || !shown(e) || !small(e)) continue;
    const isR = red(e), isH = !isR && hint(e) && round(e);
    if (!isR && !isH) continue;
    // ② 위로 올라가며 시각을 처음 품는 칸 = 상담 목록 한 줄 (높이 260 이하)
    let row = null;
    for (let p = e.parentElement, i = 0; p && p !== document.body && i < 12; p = p.parentElement, i++) {
      if (hasTime(p)) { if (box(p).height <= 260) row = p; break; }
    }
    cands.push({ e, n: +m[1], red: isR, row });
  }
  // ③ 붉은 숫자가 있으면 붉은 것만
  const inRows = cands.filter((c) => c.row);
  const use = inRows.some((c) => c.red) ? inRows.filter((c) => c.red) : inRows;
  const perRow = new Map();
  for (const c of use) perRow.set(c.row, Math.max(perRow.get(c.row) || 0, c.n));
  const per = [...perRow.values()];
  const probe = cands.slice(0, 12).map((c) => {
    const r = box(c.e);
    return { t: textOf(c.e), cls: cls(c.e).slice(0, 60), bg: getComputedStyle(c.e).backgroundColor, w: Math.round(r.width), h: Math.round(r.height), red: c.red, row: !!c.row };
  });
  return { ok: true, n: per.reduce((a, b) => a + b, 0), rows: times.length, per, probe, path: location.pathname };
}

const TALK_COUNT_JS = `(${talkUnread.toString()})()`;

/** 액자(iframe)마다 읽은 결과를 합침 — 상담 목록이 액자 안에 있어도 셈. 로그인 화면이 하나라도 있으면 로그인 필요 */
function talkMerge(rs) {
  const list = rs.filter(Boolean);
  const login = list.find((r) => r.needLogin);
  if (login) return login;
  const ok = list.filter((r) => r.ok && !r.other);
  if (!ok.length) return list.find((r) => !r.ok) || { ok: false, why: "톡톡 화면을 읽지 못함" };
  return {
    ok: true,
    n: ok.reduce((a, r) => a + r.n, 0),
    rows: ok.reduce((a, r) => a + r.rows, 0),
    per: ok.flatMap((r) => r.per || []),
    probe: ok.flatMap((r) => r.probe || []).slice(0, 12),
    path: ok.map((r) => r.path).filter(Boolean).join(" | "),
  };
}

if (typeof module !== "undefined") module.exports = { TALK_COUNT_JS, talkUnread, talkMerge };
