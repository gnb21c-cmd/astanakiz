/* 데스크 화면(desk.html)에서 쓰는 window.desk
   이것이 있으면 실제 아마노·POS 와 연결하고, 없으면(체험판) 예시 자료로 동작한다 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desk", {
  amano: {
    search: (day, no) => ipcRenderer.invoke("amano:search", { day, no }),
    select: (id) => ipcRenderer.invoke("amano:select", id),
    discount: (type) => ipcRenderer.invoke("amano:discount", type),
    job: (job) => ipcRenderer.invoke("amano:job", job), // 뒤에서 할인 등록 { day, no, id, carNo, type }
    remove: (index) => ipcRenderer.invoke("amano:remove", index),
    read: () => ipcRenderer.invoke("amano:read"),
    show: () => ipcRenderer.invoke("amano:show"),
    learn: (key) => ipcRenderer.invoke("amano:learn", key),
  },
  naver: {
    load: (day, only) => ipcRenderer.invoke("naver:load", day, only), // only = "14:00" 이면 그 시간 칸만
    complete: (b) => ipcRenderer.invoke("naver:complete", b),
    setCap: (c) => ipcRenderer.invoke("naver:setCap", c),
    cancel: (b) => ipcRenderer.invoke("naver:cancel", b), // 입금대기 예약 취소 // 판매 수량 바꾸기 { day, product, time, n }
    show: () => ipcRenderer.invoke("naver:show"),
    setHome: () => ipcRenderer.invoke("naver:setHome"),
    dump: () => ipcRenderer.invoke("naver:dump"),
    onStep: (cb) => ipcRenderer.on("naver:step", (_e, msg) => cb(msg)),
  },
  // 네이버 톡톡 상담 (키즈상담 · 카페상담): 새 메시지 수 · 상담 창 열기 (닫으면 데스크로)
  talk: {
    counts: () => ipcRenderer.invoke("talk:counts"),
    onCounts: (cb) => ipcRenderer.on("talk:counts", (_e, c) => cb(c)),
    open: (kind) => ipcRenderer.invoke("talk:open", kind),
    setup: (kind) => ipcRenderer.invoke("talk:setup", kind),
    setHome: (kind) => ipcRenderer.invoke("talk:setHome", kind),
    dump: (kind) => ipcRenderer.invoke("talk:dump", kind),
  },
  pos: { show: () => ipcRenderer.invoke("pos:show") },
  win: { desktop: () => ipcRenderer.invoke("win:desktop") }, // 바탕화면으로 (모든 창 최소화)
  // 오늘의 열쇠 · 입장 기록 저장 (파일)
  state: {
    load: (day) => ipcRenderer.sendSync("state:load", day),
    save: (day, json) => ipcRenderer.send("state:save", day, json),
  },
  // 설문조사 누적 보고 (매일 20:00 · 10/14) — 파일로 남기고 보고앱 주소가 있으면 POST → { ok, posted, file, why }
  survey: { send: (job) => ipcRenderer.invoke("survey:send", job) },
  // 폰 실시간 현황 (10/16) — 보고 열쇠로 클라우드 deskLive/now 에 덮어씀 → { ok, code, why }
  live: { send: (job) => ipcRenderer.invoke("live:send", job) },
  // 방문 이벤트 참여자 기록 (이용완료마다 한 줄 · 10/14) — 앱 폴더 + 바탕화면 '아스타나키즈-이벤트' 두 곳 · 지우지 않음
  ledger: {
    load: (from) => ipcRenderer.sendSync("ledger:load", from), // 두 곳을 합친 글 (빠진 쪽은 채움)
    add: (from, line) => ipcRenderer.sendSync("ledger:add", from, line), // → { app, desk } 저장됐나
    csv: (from, text) => ipcRenderer.send("ledger:csv", from, text), // 바탕화면 엑셀 정리본
    dirs: () => ipcRenderer.sendSync("ledger:dirs"),
    open: () => ipcRenderer.invoke("ledger:open"), // 바탕화면 폴더 열기
  },
  print: {
    list: () => ipcRenderer.invoke("print:list"),
    html: (job) => ipcRenderer.invoke("print:html", job),
    cut: (name) => ipcRenderer.invoke("print:cut", name),
    ports: () => ipcRenderer.invoke("print:ports"),
    escpos: (job) => ipcRenderer.invoke("print:escpos", job),
    drawer: (job) => ipcRenderer.invoke("print:drawer", job), // 현금통 열기 (환전 오픈) { mode, port, baud, deviceName }
  },
  config: {
    get: () => ipcRenderer.invoke("config:get"),
    set: (patch) => ipcRenderer.invoke("config:set", patch),
  },
});
