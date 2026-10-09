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
