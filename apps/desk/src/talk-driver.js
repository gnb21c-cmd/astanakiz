/* 네이버 톡톡 파트너센터 상담 목록에서 '새 메시지' 수 읽기 (키즈상담 · 카페상담 버튼의 붉은 원 · 사장님 10/8)
   화면 (현장 사진 10/8, partner.talk.naver.com/web/accounts/…/chat):
     왼쪽 메뉴(프로필 관리 · 상담관리 111 · 요청서 관리 …) | 가운데 상담 목록(전체 · 대기 · 진행중 탭, '안읽은 메시지 111개 전체 보기',
     줄마다 프로필 · 닉네임 · 시각(오후 07:39 / 10월 6일) · 마지막 말 · 새 창 아이콘) | 오른쪽 대화
   - 손님이 새로 말하면 그 줄 시각 밑에 붉은 원 + 숫자(손님이 보낸 안 읽은 말풍선 수)가 생기고, 대화를 열어 읽으면 사라짐 → 줄마다 이 숫자를 더함
   - 왼쪽 메뉴 '상담관리 111' · '안읽은 메시지 111개'는 상담완료를 잘 안 눌러 쌓인 수라 쓰지 않음
   - 실제 화면의 이름표(class)를 아직 못 봐서 모양으로 찾음: 시각 글자를 하나만 품은 칸(목록 한 줄) 안의, 작고 붉은 바탕(또는 unread · badge · count 이름표)의 숫자
     → 실제 화면이 다르면 운영 설정의 '화면 저장 (문제 확인용)'으로 저장한 파일을 보고 맞춤 */
function talkUnread() {
  const login = /(^|\.)nid\.naver\.com$/.test(location.host) || !!document.querySelector('input[type="password"]');
  if (login) return { ok: false, needLogin: true, why: "네이버 로그인이 필요해요" };
  if (location.protocol === "https:" && !/(^|\.)talk\.naver\.com$/.test(location.host)) return { ok: false, why: "톡톡 파트너센터 화면이 아님" };
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const own = (e) => norm([...e.childNodes].filter((x) => x.nodeType === 3).map((x) => x.textContent).join(""));
  const textOf = (e) => (e.children.length ? own(e) : norm(e.textContent));
  const box = (e) => e.getBoundingClientRect();
  const shown = (e) => { const r = box(e); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
  const cls = (e) => e.getAttribute("class") || "";
  const TIME = /^(?:(?:오전|오후)\s*\d{1,2}:\d{2}|\d{1,2}:\d{2}|\d{1,2}월\s*\d{1,2}일|어제|\d{2,4}[./-]\s*\d{1,2}[./-]\s*\d{1,2}\.?)$/;
  const times = [...document.body.querySelectorAll("*")].filter((e) => TIME.test(textOf(e)) && shown(e));
  const timeSet = new Set(times);
  const timesIn = (p) => times.reduce((a, t) => a + (p.contains(t) ? 1 : 0), 0);
  // 목록 한 줄 = 시각 글자를 하나만 품은 가장 큰 칸 (높이 250 이하)
  const rows = new Set();
  for (const t of times) {
    let row = null;
    for (let p = t.parentElement, i = 0; p && p !== document.body && i < 10; p = p.parentElement, i++) {
      if (box(p).height > 250 || timesIn(p) > 1) break;
      row = p;
    }
    if (row) rows.add(row);
  }
  const small = (e) => { const r = box(e); return r.width <= 48 && r.height <= 40; };
  // 붉은 바탕: 그 글자 칸이나 바로 위 작은 칸(동그라미)
  const red = (e) => {
    for (let p = e, i = 0; p && i < 3 && small(p); p = p.parentElement, i++) {
      const m = getComputedStyle(p).backgroundColor.match(/[\d.]+/g);
      if (!m) continue;
      const [r, g, b, a = 1] = m.map(Number);
      if (a > 0.5 && r >= 190 && g <= 130 && b <= 130) return true;
    }
    return false;
  };
  const named = (e) => { for (let p = e, i = 0; p && i < 2; p = p.parentElement, i++) if (/unread|badge|count/i.test(cls(p))) return true; return false; };
  let n = 0;
  const per = [];
  for (const row of rows) {
    let best = 0;
    for (const e of row.querySelectorAll("*")) {
      if (timeSet.has(e)) continue;
      const m = textOf(e).match(/^(\d{1,3})\+?$/);
      if (!m || !shown(e) || !small(e) || !(red(e) || named(e))) continue;
      best = Math.max(best, +m[1]);
    }
    if (best) { n += best; per.push(best); }
  }
  return { ok: true, n, rows: rows.size, per, path: location.pathname };
}

const TALK_COUNT_JS = `(${talkUnread.toString()})()`;

if (typeof module !== "undefined") module.exports = { TALK_COUNT_JS, talkUnread };
