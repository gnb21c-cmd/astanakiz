# 키즈 실시간 — 통합데스크 → 보고 앱 (2026-10-16)

총괄 관리자가 출근하지 않았어도 **폰 한 화면**에서 지금 키즈를 본다 (사장님 10/16).
보고 앱(B) 첫 화면 **'입장권 판매' 칸(키즈 입장 4칸의 첫 칸)을 누르면 세부 화면 '키즈 실시간'** 으로 넘어가고, 그 화면에

- **네이버 예약**: 오늘 합 완료 · 미입장 · 잔여 + 시간 칸마다
- **오늘 입장 인원**: 총 판매수 = 네이버 이용완료 + 현장 (서비스 키는 판매 아님 · 따로)
- **입장료 매출**: 새로고침한 때 기준 (입장권 장수 × 단가 + 초과요금 결제)
- **열쇠 운용**: 45칸 번호 · 색(반납 조건) — 번호를 누르면 손님 이름 · **전화번호 그대로** (열쇠 미반납 때 관리자가 전화)

이 보인다. **화면을 아래로 당기면(그리고 열 때마다)** 그때 통합데스크 현황을 다시 가져온다.

화면 미리보기(이 저장소): `prototype/live-phone.html` — 통합데스크 체험판 예시 글로 그린 같은 화면.

**보고 앱 쪽은 끝남 (2026-10-16, gnb21c-cmd/report main `8fb901a` · 열쇠를 오늘 입장 밑으로 `4f7e766`)**: 첫 화면 '입장권 판매 총 수량' → `apps/view/src/screens/KidsLive.tsx` · 검사 `packages/core/src/deskLive.ts` · 규칙 `firebase/firestore.rules deskLive` · 안내 report `docs/KIDS_LIVE.md`. 남은 것: ① Firebase 콘솔 규칙 붙여 넣기(사장님 한 번) ② 통합데스크 1.44 설치

## 흐름
1. 통합데스크(키즈 POS, 1.44 ~)가 **1분마다 · 바뀌면 5초 안에** 지금 현황 글(`astanakiz-live`)을 만들어
   클라우드 `boards/{보고 열쇠}/deskLive/now` 에 **덮어씀** (설문 보고함과 같은 열쇠 · 같은 방식, 로그인 · API 키 없음)
   - 같은 내용이면 1분마다만 (폰이 "n초 전 기준"을 알게), 실패하면 30초 뒤 다시
   - 운영 설정 → 설문조사 탭 '보고 열쇠' 밑 **[폰 실시간 현황 켜짐/꺼짐]** · '마지막: 14:05:12 보냄 / 실패 …'
2. 보고 앱 '키즈 실시간' 화면이 **열 때 · 아래로 당겼다 놓을 때 · [새로고침]** 마다 `deskLive/now` 를 다시 읽음
   - 맨 위 "통합데스크 14:05:12 기준 · 20초 전" — `at` 이 **3분** 넘게 지났으면 노란 띠 "통합데스크 소식이 n분째 없어요 (키즈 POS 꺼짐 · 인터넷 확인)"
   - `day` 가 오늘이 아니면 "오늘 현황이 아직 없어요" (어제 마지막 현황은 보여 주되 흐리게)

## 보고 시스템이 할 일 (gnb21c-cmd/report 쪽 — 2026-10-16 다 함)
### ① Firestore 규칙 — `firebase/firestore.rules` 의 `match /boards/{board} { … }` 안, `surveyInbox` 아래에 더함
```
      // 키즈 실시간 (통합데스크 → 보고 앱 '입장권 판매' 세부 화면) — astanakiz docs/LIVE.md
      //   문서 하나(now)만 계속 덮어씀 · json = 통합데스크 현황 글(astanakiz-live). 손님 이름 · 전화 포함(열쇠 미반납 때 관리자 전화)이라 지난 기록은 안 쌓음
      match /deskLive/{doc} {
        allow read: if true;
        allow create, update: if doc == "now"
          && exists(/databases/$(database)/documents/boards/$(board)/settings/main)
          && request.resource.data.keys().hasOnly(["json", "at"])
          && request.resource.data.json is string && request.resource.data.json.size() < 100000
          && request.resource.data.json.matches("(?s)^[{].*astanakiz-live.*$")
          && request.resource.data.at is string && request.resource.data.at.size() < 40;
        allow delete: if isSender(board);
      }
```
- 규칙을 게시하기 전에는 통합데스크 설정에 '실패 열쇠나 모양이 틀림 (403)' 이 보임 → 게시하면 1분 안에 '보냄'
- 확인할 것 (에뮬레이터): 만들기 · 고치기 · 읽기는 됨 / `now` 아닌 이름 · 설정 없는 열쇠 · 다른 칸 · `astanakiz-live` 아닌 글 · 큰 글 · 로그인 없는 지우기는 막힘

### ② 읽기
- SDK: `getDoc(doc(db, "boards", 열쇠, "deskLive", "now"))` → `JSON.parse(data.json)`
- REST(같은 것): `GET https://firestore.googleapis.com/v1/projects/astana-report/databases/(default)/documents/boards/{열쇠}/deskLive/now` → `fields.json.stringValue`
- 문서가 없으면(규칙 전 · 통합데스크가 아직 안 보냄) "통합데스크 현황이 아직 없어요 — 키즈 POS 통합데스크 운영 설정 → 설문조사의 보고 열쇠 · 폰 실시간 현황을 확인해 주세요"

### ③ 화면 (`prototype/live-phone.html` 그대로)
- 첫 화면 '입장권 판매' 칸 → 누르면 `view = { name: "kidsLive" }` (지금은 누를 수 없는 칸)
- 위에서 아래로: **기준 시각 띠** → **오늘 입장**(총 n장 큰 숫자 · 네이버 · 현장(+1타임) · 서비스 키) → **열쇠 운용**(사용 n/45 · 빈 열쇠 · 현장 판매 가능 · 9칸 × 5줄 번호 — 사장님 10/16 오늘 입장 바로 밑) → **입장료 매출** → **네이버 예약**(완료 · 미입장 · 잔여 + 시간 칸 표, 지금 칸 칠함 · 예약 있는 칸만, [모든 시간 보기])
- 열쇠 번호를 누르면 아래에서 올라오는 창: **이름 · 전화번호(크게, `tel:` 전화 걸기 · 번호 복사)** · 열쇠 번호들 · 상태 · 입장 · 반납 · 수량/예약번호 또는 POS 번호 · 대리예약 방문자 · 서비스 키는 수령인 문구
- 빈 열쇠는 흐린 칸(누를 수 없음)

### ④ 입장료 매출 (단가는 보고 앱 단가표 한 곳 — `kidsPrice(day)`)
- **입장권 매출 = `people.total` × `kidsPrice(day).price`** (평일 12,000 · 휴일 14,000 — 보고 앱 규칙 그대로) · 숏타임 등 상품별로 다르게 셀 때는 `naver.products`(상품 이름 · 이용완료 장수) 를 `classify` 규칙으로
- **+ 초과요금 결제 `over.paid`** (반납 때 POS 에서 받은 것) = 합계
- 아직 받지 않은 초과요금 `over.due` 는 따로 한 줄 (반납 전 손님)
- 할인 · 이벤트 무료입장은 하루 마감 보고(POS · 네이버 정산)에서 맞춰짐 — 이 화면은 "지금까지 장수 × 단가"

### ⑤ 열쇠 색 (통합데스크와 같게)
- `keys.map[번호].c` = 보낸 때 색: `in` 이용 중(검정 테두리) · `pink` 반납 시간 ~ 10분(분홍) · `red` 반납 시간 넘음(빨강) — 번호 없는 칸 = 빈 열쇠
- 지금 시각으로 다시 칠하려면: `end`(반납 시각, `null` = 무제한) 기준으로 지금 < end → `in`, < end + (`rules.pinkUntil` − `rules.useMinutes`)분 → `pink`, 그 뒤 → `red`
- 서비스 키(`holders[i].kind === "s"`)는 점선 테두리 · 초과요금 없음

## 현황 글 (`deskLive/now` 의 `json`)
```jsonc
{ "type": "astanakiz-live", "v": 1, "day": "2026-10-16", "at": "2026-10-16 14:05:12", "build": "1.44",
  "dayKind": "비수기 평일 · 무제한",            // 통합데스크가 보는 그날 (성수기/비수기 · 휴일/평일 · 시간제/무제한 · 골든벨)
  "golden": null,                                  // 골든벨 울린 시각 "16:40" (그때부터 모두 무제한)
  "rules": { "keys": 45, "useMinutes": 110, "pinkUntil": 120, "overFee": 5000, "overUnitMin": 10 },
  "naver": { "done": 36, "conf": 32, "left": 132, "test": 0,      // 오늘 합: 완료 · 미입장(확정) · 잔여 · 시험으로 뺀 장수
             "slots": [ { "t": "10:00", "done": 7, "conf": 0, "left": 3, "cap": 10 }, … ],
             "products": [ { "name": "4인 입장권", "done": 36 } ] },          // 상품별 이용완료 장수 (시험 기록 뺌)
  "people": { "naver": 36, "walk": 3, "total": 39 },                          // 총 판매수 (통합데스크 맨 위 숫자와 같음)
  "walk": { "tickets": 3, "extra": 0, "service": 2 },                         // 현장 장수 · 그중 +1타임 장수 · 서비스 키 수(판매 아님)
  "over": { "paid": 0, "count": 0, "due": 135000 },                           // 초과요금 결제 합 · 건수 · 아직 받을 것
  "keys": { "total": 45, "used": 21, "free": 24, "walkable": 9, "flex": 5,    // 사용 · 빈 열쇠 · 현장 판매 가능 · 유동
    "map": { "1": { "c": "red", "end": "13:20", "h": 0 }, "40": { "c": "in", "end": "14:50", "h": 14 }, … },   // 번호 → 색 · 반납 시각 · holders 몇 번째
    "holders": [
      { "kind": "n", "name": "장시우", "phone": "01020142542", "visitor": "", "keys": [1], "in": "11:28", "slot": "11:30",
        "no": "1371112347", "pos": "", "qty": 1, "product": "4인 입장권", "over": 15000, "paid": 0, "of": "", "staff": false },
      { "kind": "s", "name": "오유나", "phone": "01020197975", "keys": [40], "in": "13:50", "slot": "13:00", "qty": 0, "product": "서비스 키",
        "of": "6번 오유나님에게 추가 서비스 지급된 열쇠", … } ] } }
```
- `kind`: `n` 네이버 · `w` 현장(이름 '현장구매자') · `s` 서비스 키(`of` = 수령인 문구, 직원은 `staff: true`)
- `in` 입장 시각 · `slot` 예약(현장은 입장 타임) · `no` 네이버 예약번호 · `pos` 현장 POS 번호 · `visitor` 대리예약 방문자 "이름(전화)"
- `over` 그 손님이 지금 낼 초과요금 · `paid` 이미 결제한 초과요금
- 시각은 모두 "HH:MM" (그날), `at` 만 "YYYY-MM-DD HH:MM:SS"

## 개인정보
- 열쇠를 가진 손님의 **이름 · 전화번호가 그대로** 들어감 (사장님 10/16: 열쇠 미반납 때 관리자가 전화) — 보고 앱 주소(열쇠)를 아는 폰만 읽음
- **문서 하나(`now`)만 덮어씀** → 반납 · 퇴장한 손님은 다음 현황에서 빠지고, 클라우드에 지난 기록이 쌓이지 않음. 통합데스크도 파일로 남기지 않음
- 열쇠가 새면 열쇠를 바꾸고(report docs/SETUP.md) 통합데스크 보고 열쇠도 새것으로
