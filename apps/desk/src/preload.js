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
    show: () => ipcRenderer.invoke("naver:show"),
    setHome: () => ipcRenderer.invoke("naver:setHome"),
    dump: () => ipcRenderer.invoke("naver:dump"),
    onStep: (cb) => ipcRenderer.on("naver:step", (_e, msg) => cb(msg)),
  },
  pos: { show: () => ipcRenderer.invoke("pos:show") },
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
  },
  config: {
    get: () => ipcRenderer.invoke("config:get"),
    set: (patch) => ipcRenderer.invoke("config:set", patch),
  },
});
