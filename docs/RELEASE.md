# 최종 설치본 만들기 전 할 일

설치본(Windows 설치 파일)을 만들기 **직전**에 아래를 차례로 한다.

1. 현장 자료로 맞추기
   - 실제 아마노 할인등록 화면 저장 파일로 칸·표 이름 확인 (`docs/AMANO.md`)
   - ~~POS 프로그램 창 제목 확인~~ (OKPOS Program, 기본값으로 넣음)
   - 네이버 예약현황 실제 화면 저장 파일로 `naver-driver.js` 맞추기 (`docs/NAVER.md`)
2. 시험: `cd apps/desk && npm test` 모두 통과
3. **직원용 메뉴얼 PDF 만들기** (사용자 지시)
   - 그 시점의 실제 화면으로 캡처해 만든다 (화면이 바뀌면 메뉴얼도 다시)
   - 담을 내용: 아침 준비(앱 켜기 · 아마노 자동 로그인 확인) · 네이버 예약자 입장 · 현장입장(POS 결제 전환) · 열쇠 반납과 초과요금 · 주차등록 · 방문 회차와 사은권 · 프린터 · 문제가 생겼을 때
   - 직원들에게 배포
4. 설치본 만들기: `cd apps/desk && npm run dist:win`
5. POS PC에 설치 → 운영 설정(아마노 주소 · 아이디 · 비밀번호 · POS 창 제목 · 프린터) → 차량 한 대로 실제 시험

## 새 판 저절로 바꾸기 (사장님 11/16 — ver.2.27 부터)
- 사장님이 "업데이트 해" → main 에 올림 → GitHub 가 설치 파일 + **latest.yml**(판 · 설치 파일 이름 · 크기 · sha512)을 Releases `v2.X`('최신' 표시)에 올림 (약 10분)
- POS · 사무실 PC 앱이 **켜고 1분 뒤 · 그 뒤 10분마다** GitHub 공개 저장소 Releases 최신 판을 확인 → 새 판이면 뒤에서 받음(약 100MB · sha512 확인)
- 다 받으면 데스크 위 가운데 띠 **"새 판 ver.X 받음 · N초 뒤 바꿔요 [지금 바꾸기] [30분 뒤에]"** → 아무도 안 누르면 **1분 뒤 조용히 설치하고 다시 켬**(20초쯤 꺼짐)
  - 톡톡 보내기 · 재고 자동 오픈 중이면 끝날 때까지 미룸(2분마다 다시 봄) · [30분 뒤에] = 30분 뒤 다시 1분 띠 · 근무자가 프로그램을 끄면 끌 때 설치
  - 운영 설정 → 기타 → **업데이트** 줄: 지금 판 · 마지막 확인 · 받는 중 % · 확인 못 한 까닭 · [지금 확인] · [지금 바꾸기]
  - 기록: 앱 폴더 `update-log.txt` (300줄)
- 지우지 않고 바뀜 (같은 앱 · 사용자별 설치, 관리자 확인 창 없음) · 손님 정보 · 설정 · 기록(앱 폴더)은 그대로 · 아무것도 보내지 않음(받기만)
- **ver.2.27 은 마지막으로 한 번 직접 설치** (그 전 판에는 이 기능이 없음 — 지우지 않고 그 위에 설치하면 됨). 2.28 부터는 저절로
- 처리 `apps/desk/src/updater.js`(규칙 · 시험 `test/updater.test.js`) · 연결 `main.js` `updStart`(electron-updater · 설치한 앱에서만) · 포장 `package.json` build.publish(github) · nsis.artifactName `astanakiz-desk-setup.exe`(판마다 같은 이름 — latest.yml 이 가리킴) · `.github/workflows/build-win.yml` 이 latest.yml 이 없거나 판 · 이름이 다르면 멈춤
- 확인(11/16): 리눅스 포장으로 앱 안 `app-update.yml`(github · gnb21c-cmd/astanakiz) · electron-updater · updater.js 가 들어감 · 가짜 업데이트 서버로 확인 → 받기(sha512) → 띠 → 설치 부름까지 · 실제 Windows 설치는 2.28 때 처음

## 버전 (ver.1.0 완성 10/6)
- 직원용 메뉴얼 PDF: `docs/manual/staff-manual.pdf` (원본 `manual.html`, 사진은 체험판으로 찍음) — 설치 파일과 함께 Releases 에 올라감
- 정식 **ver.1.0** 부터 ver.1.X (설치 파일을 만들 때마다 +1). 받는 주소: Releases '최신'(test-latest) · 버전별 기록 v1.X

## 시험판 버전 (현장 시험 때)
- main 에 데스크 코드가 올라가면 GitHub 가 설치 파일을 만들어 Releases **시험판(최신)** 에 올린다 (`.github/workflows/build-win.yml`)
- 버전은 **ver.0.X**, 설치 파일을 만들 때마다 X 가 1씩 늘어난다 (첫 번호 ver.0.1). 화면 맨 위 "네이버 · 아마노 · POS 연결 ver.0.X" 로 새 설치본인지 확인 (사용자 지시)
- 현장 시험이 끝나면 정식 **Ver. 1.0**
