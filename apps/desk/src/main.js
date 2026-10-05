/* 아스타나키즈 입장 데스크 — POS PC에 설치하는 Windows 프로그램
   모니터는 한 대. 창은 겹쳐 둔다:  맨 뒤 아마노 웹 창 → 가운데 POS 프로그램 → 맨 앞 데스크 화면
   - 아마노 창은 이 프로그램이 열어 두고, 가려진 채로 칸에 입력하고 버튼을 누른다 (화면 좌표가 아니라 페이지 안의 글자로 찾으므로 가려져도 됨)
   - 로그인이 풀렸을 때만 "아마노 화면 보기"로 앞으로 꺼내 근무자가 로그인한다
   - POS "결제하기"는 이미 켜진 POS 창을 앞으로 띄우기만 한다 */
const { app, BrowserWindow, ipcMain, safeStorage, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const { AmanoSync } = require("./amano-sync");
const { NaverSync, naverUrls } = require("./naver-sync");

const SETTINGS_FILE = () => path.join(app.getPath("userData"), "settings.json");
const DEFAULTS = {
  amanoUrl: "", // 아마노 로그인 주소 (예: http://아마노주소/login). 저장소에 적지 않고 운영 설정에서 넣음
  amanoPage: "/discount/registration", // 로그인 뒤 자동으로 옮겨 갈 할인등록 화면
  amanoSelectors: {}, // 배우기로 기억한 칸 (carNo · day · searchBtn)
  posTitle: "OKPOS Program", // POS 프로그램 창 제목 (작업표시줄에 마우스를 올리면 보이는 이름, 매장 확인 2026-10)
  naverUrl: "https://partner.booking.naver.com/", // 네이버 예약관리 시작 화면 (예약현황). 처음 로그인 뒤 '지금 화면을 시작 화면으로'
  amanoId: "", // 아마노 아이디
  amanoPwEnc: "", // 아마노 비밀번호: Windows 암호화로 이 PC 계정만 풀 수 있게 저장 (저장소·설치파일에 넣지 않음)
};
let settings = { ...DEFAULTS };
let deskWin = null;
let amanoWin = null;
let amano = null;
let naverWin = null;
let naver = null;
// 같은 창을 두 동작이 동시에 만지지 않게 차례로 실행
const queues = {};
// 시간 제한: 페이지가 옮겨 가는 중에는 화면 안 실행이 응답 없이 멈출 수 있음 → 끝없이 기다리지 않게
// 설치 파일 버전 (GitHub 가 만들 때 커밋 번호를 넣음) — 화면 위에 보여 새 설치본인지 확인
let BUILD = "개발";
try {
  BUILD = require("./build.json").build;
} catch (e) {
  /* 직접 실행(npm start) */
}
const timed = (p, ms, why) => {
  let t;
  return Promise.race([p, new Promise((_, rej) => (t = setTimeout(() => rej(new Error(why)), ms)))]).finally(() => clearTimeout(t));
};
const serial = (name, fn) => (queues[name] = (queues[name] || Promise.resolve()).then(fn, fn));

function loadSettings() {
  try {
    settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE(), "utf8")) };
  } catch (e) {
    settings = { ...DEFAULTS };
  }
}
function saveSettings() {
  fs.mkdirSync(path.dirname(SETTINGS_FILE()), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(settings, null, 2));
}

const DESK_HTML = () =>
  app.isPackaged ? path.join(process.resourcesPath, "desk.html") : path.join(__dirname, "..", "..", "..", "prototype", "desk.html");

function openAmano() {
  if (amanoWin && !amanoWin.isDestroyed()) amanoWin.destroy();
  // 맨 뒤 창: 보이기는 하지만 포커스를 가져가지 않는다
  amanoWin = new BrowserWindow({ width: 1024, height: 768, show: false, skipTaskbar: true, title: "아마노 주차 (입장 데스크가 조작 중)", webPreferences: { backgroundThrottling: false } });
  amanoWin.setMenuBarVisibility(false);
  if (settings.amanoUrl) amanoWin.loadURL(settings.amanoUrl);
  else amanoWin.loadURL("data:text/html;charset=utf-8," + encodeURIComponent("<p style='font:16px sans-serif;padding:24px'>운영 설정 → 아마노 탭에서 아마노 할인등록 주소를 넣어 주세요.</p>"));
  // 로그인하면 할인등록 화면으로 자동 이동 (근무자는 아침에 아이디·비밀번호만 넣으면 됨)
  amanoWin.webContents.on("did-finish-load", async () => {
    if (!settings.amanoUrl) return;
    try {
      const target = new URL(settings.amanoPage, settings.amanoUrl).href;
      const here = amanoWin.webContents.getURL();
      const hasPassword = await amanoWin.webContents.executeJavaScript("!!document.querySelector('input[type=password]')");
      // 로그인이 풀렸으면 저장된 아이디·비밀번호로 자동 로그인 (한 번만 시도, 실패하면 근무자에게 맡김)
      if (hasPassword && settings.amanoId && settings.amanoPwEnc && !amanoWin.__triedLogin) {
        amanoWin.__triedLogin = true;
        const pw = safeStorage.decryptString(Buffer.from(settings.amanoPwEnc, "base64"));
        await amano.login(settings.amanoId, pw);
        return;
      }
      if (!hasPassword) amanoWin.__triedLogin = false;
      if (!hasPassword && !here.startsWith(target)) amanoWin.loadURL(target);
      else if (!hasPassword && deskWin) deskWin.focus(); // 할인등록 화면 준비됨 → 데스크를 앞으로
    } catch (e) {
      /* 주소가 잘못됨 등: 화면에 그대로 둠 */
    }
  });
  amanoWin.once("ready-to-show", () => {
    amanoWin.showInactive();
    if (deskWin) deskWin.focus(); // 데스크가 늘 맨 앞
  });
  amanoWin.on("close", (e) => {
    // 근무자가 아마노 창을 닫아도 꺼지지 않고 뒤로만 숨김
    if (!app.isQuitting) {
      e.preventDefault();
      if (deskWin) deskWin.focus(); // 닫지 않고 데스크 뒤로 (계속 조작해야 해서)
    }
  });
  amano = new AmanoSync((code) => timed(amanoWin.webContents.executeJavaScript(code, true), 8000, "아마노 화면이 응답하지 않음"), { selectors: settings.amanoSelectors });
}

// 네이버 예약관리 창: 맨 뒤. 로그인(2단계 인증 포함)은 근무자가 처음 한 번 직접, 로그인 상태는 이 PC에 계속 남음(persist:naver)
function openNaver() {
  if (naverWin && !naverWin.isDestroyed()) naverWin.destroy();
  naverWin = new BrowserWindow({ width: 1280, height: 800, show: false, skipTaskbar: true, title: "네이버 예약관리 (입장 데스크가 읽는 중)", webPreferences: { partition: "persist:naver", backgroundThrottling: false } });
  naverWin.setMenuBarVisibility(false);
  naverWin.loadURL(settings.naverUrl);
  naverWin.once("ready-to-show", () => {
    naverWin.showInactive();
    if (deskWin) deskWin.focus();
  });
  naverWin.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      if (deskWin) deskWin.focus(); // 닫지 않고 데스크 뒤로 (계속 읽어야 해서)
    }
  });
  naver = new NaverSync((code) => timed(naverWin.webContents.executeJavaScript(code, true), 8000, "네이버 화면이 응답하지 않음"), {
    urls: naverUrls(settings.naverUrl),
    onStep: (msg) => deskWin && !deskWin.isDestroyed() && deskWin.webContents.send("naver:step", msg),
  });
}

function createDesk() {
  deskWin = new BrowserWindow({
    width: 1024,
    height: 768,
    title: "아스타나키즈 입장 데스크",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true },
  });
  deskWin.setMenuBarVisibility(false);
  deskWin.loadFile(DESK_HTML());
  // 데스크 창을 닫으면 프로그램 전체(뒤의 아마노 · 네이버 창 포함)를 끝냄
  deskWin.on("closed", () => {
    deskWin = null;
    app.quit();
  });
  deskWin.maximize();
}

/** POS 프로그램 창을 앞으로 (Windows). 창 제목 일부로 찾는다 */
function showPos() {
  return new Promise((resolve) => {
    if (process.platform !== "win32" || !settings.posTitle) return resolve({ ok: false, why: "운영 설정에 POS 창 제목을 넣어 주세요" });
    const ps = `(New-Object -ComObject WScript.Shell).AppActivate('${settings.posTitle.replace(/'/g, "''")}')`;
    execFile("powershell.exe", ["-NoProfile", "-Command", ps], (err, out) =>
      resolve(err || String(out).trim() === "False" ? { ok: false, why: "POS 창을 찾지 못함" } : { ok: true }),
    );
  });
}

// 데스크 화면 ↔ 이 프로그램
const wrap = (fn) => async (_e, ...args) => {
  try {
    if (!amano) return { ok: false, why: "아마노 창이 아직 열리지 않음" };
    return await serial("amano", () => fn(...args));
  } catch (e) {
    return { ok: false, why: String(e.message || e) };
  }
};
ipcMain.handle("amano:search", wrap((a) => amano.search(a.day, a.no)));
ipcMain.handle("amano:select", wrap((id) => amano.select(id)));
ipcMain.handle("amano:discount", wrap((type) => amano.discount(type)));
ipcMain.handle("amano:remove", wrap((i) => amano.remove(i)));
ipcMain.handle("amano:read", wrap(async () => ({ ok: true, state: await amano.read() })));
ipcMain.handle("amano:show", () => {
  if (amanoWin) {
    amanoWin.show();
    amanoWin.focus();
  }
  return { ok: true };
});
// 배우기: 아마노 창을 앞으로 꺼내고, 근무자가 누른 칸을 key(carNo · day · searchBtn)로 기억
ipcMain.handle("amano:learn", wrap(async (key) => {
  amanoWin.show();
  amanoWin.focus();
  const sel = await amano.learn();
  settings.amanoSelectors = { ...settings.amanoSelectors, [key]: sel };
  saveSettings();
  amano.selectors = settings.amanoSelectors;
  deskWin.focus();
  return { ok: true, selector: sel };
}));
// 화면에는 비밀번호를 돌려주지 않음 (저장돼 있는지만)
// 네이버
const nwrap = (fn, limit = 120000) => async (_e, ...args) => {
  try {
    if (!naver) return { ok: false, why: "네이버 창이 아직 열리지 않음" };
    // 한 번에 하나씩, 시간이 넘으면 포기 (다음 요청이 줄에 막히지 않게)
    return await serial("naver", () => timed(Promise.resolve().then(() => fn(...args)), limit, `네이버 응답이 ${limit / 60000}분 넘게 없음 — '네이버 화면 보기'로 확인해 주세요`));
  } catch (e) {
    return { ok: false, why: String(e.message || e) };
  }
};
ipcMain.handle("naver:load", nwrap((day) => naver.loadDay(day), 300000)); // 처음엔 칸을 다 열어 오래 걸릴 수 있음
ipcMain.handle("naver:complete", nwrap((b) => naver.complete(b)));
ipcMain.handle("naver:show", () => {
  if (naverWin) {
    naverWin.show();
    naverWin.focus();
  }
  return { ok: true };
});
// 진단: 지금 네이버 창의 화면(HTML)과 사진을 바탕화면 '아스타나키즈-진단' 폴더에 저장 → 개발자에게 보내 화면 구조를 맞춤
// (예약자 이름 · 전화번호가 들어 있으니 개발 확인용으로만)
ipcMain.handle("naver:dump", async () => {
  try {
    if (!naverWin) return { ok: false, why: "네이버 창이 없음" };
    const dir = path.join(app.getPath("desktop"), "아스타나키즈-진단");
    fs.mkdirSync(dir, { recursive: true });
    const d = new Date();
    const stamp = `${d.getMonth() + 1}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
    const wc = naverWin.webContents;
    const frames = (wc.mainFrame ? wc.mainFrame.framesInSubtree : []).map((f) => f.url);
    const html = await timed(wc.executeJavaScript("document.documentElement.outerHTML", true), 8000, "네이버 화면이 응답하지 않음");
    const head = `<!-- 주소: ${wc.getURL()}\n액자: ${frames.join(" | ")}\n버전: ${BUILD} -->\n`;
    fs.writeFileSync(path.join(dir, `naver-${stamp}.html`), head + html);
    const img = await naverWin.webContents.capturePage();
    fs.writeFileSync(path.join(dir, `naver-${stamp}.png`), img.toPNG());
    shell.showItemInFolder(path.join(dir, `naver-${stamp}.html`));
    return { ok: true, dir };
  } catch (e) {
    return { ok: false, why: String(e.message || e) };
  }
});
// 근무자가 네이버에서 예약현황 화면까지 들어간 뒤 누르면, 그 주소를 시작 화면으로 기억
ipcMain.handle("naver:setHome", () => {
  if (!naverWin) return { ok: false, why: "네이버 창이 없음" };
  settings.naverUrl = naverWin.webContents.getURL();
  saveSettings();
  if (naver) naver.urls = naverUrls(settings.naverUrl);
  if (!naver || !naver.urls) return { ok: false, why: "네이버 예약관리(파트너센터) 화면에서 눌러 주세요" };
  if (deskWin) deskWin.focus();
  return { ok: true, url: settings.naverUrl };
});

ipcMain.handle("config:get", () => {
  const { amanoPwEnc, ...rest } = settings;
  return { ...rest, hasAmanoPw: !!amanoPwEnc, build: BUILD };
});
ipcMain.handle("config:set", (_e, patch) => {
  const urlChanged = patch.amanoUrl !== undefined && patch.amanoUrl !== settings.amanoUrl;
  patch = { ...patch };
  if (patch.amanoPw) {
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, why: "이 PC에서 비밀번호 암호화를 쓸 수 없음" };
    settings.amanoPwEnc = safeStorage.encryptString(patch.amanoPw).toString("base64");
  }
  delete patch.amanoPw;
  delete patch.amanoPwEnc;
  settings = { ...settings, ...patch };
  saveSettings();
  if (urlChanged) openAmano();
  return { ok: true };
});
ipcMain.handle("pos:show", () => showPos());

// 한 번만 켜지게: 이미 켜져 있으면 새로 띄우지 않고 켜진 데스크를 앞으로
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on("second-instance", () => {
  if (deskWin) {
    if (deskWin.isMinimized()) deskWin.restore();
    deskWin.focus();
  }
});

app.whenReady().then(() => {
  if (!gotLock) return;
  loadSettings();
  openAmano(); // 맨 뒤 아마노
  openNaver(); // 맨 뒤 네이버 예약관리
  createDesk(); // 맨 앞 데스크 (POS 는 원래대로 따로 켜져 있음)
});
app.on("before-quit", () => {
  app.isQuitting = true;
});
app.on("window-all-closed", () => app.quit());
