/* 아스타나키즈 입장 데스크 — POS PC에 설치하는 Windows 프로그램
   모니터는 한 대. 창은 겹쳐 둔다:  맨 뒤 아마노 웹 창 → 가운데 POS 프로그램 → 맨 앞 데스크 화면
   - 아마노 창은 이 프로그램이 열어 두고, 가려진 채로 칸에 입력하고 버튼을 누른다 (화면 좌표가 아니라 페이지 안의 글자로 찾으므로 가려져도 됨)
   - 로그인이 풀렸을 때만 "아마노 화면 보기"로 앞으로 꺼내 근무자가 로그인한다
   - POS "결제하기"는 이미 켜진 POS 창을 앞으로 띄우기만 한다 */
const { app, BrowserWindow, ipcMain, safeStorage, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile, spawn } = require("child_process");
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
let SHA = "";
try {
  ({ build: BUILD, sha: SHA = "" } = require("./build.json"));
} catch (e) {
  /* 직접 실행(npm start) */
}
const timed = (p, ms, why) => {
  let t;
  return Promise.race([p, new Promise((_, rej) => (t = setTimeout(() => rej(new Error(why)), ms)))]).finally(() => clearTimeout(t));
};
const pending = {}; // 줄마다 기다리는 일 수 (네이버 창을 새로 고칠 때 일하는 중인지 보려고)
const serial = (name, fn) => {
  pending[name] = (pending[name] || 0) + 1;
  const done = (v) => { pending[name]--; return v; };
  const run = () => Promise.resolve().then(fn).then(done, (e) => { done(); throw e; });
  return (queues[name] = (queues[name] || Promise.resolve()).then(run, run));
};

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

/* 아마노 창 만들기. 할인등록 화면으로 자동 이동 · 로그인이 풀리면 저장된 아이디로 자동 로그인
   front = 근무자가 검색 · 선택하는 창(맨 뒤에 보임), back = 할인 등록만 뒤에서 하는 창(숨김, 근무자가 다음 차를 바로 검색할 수 있게 · 현장 10/6) */
function makeAmanoWin(kind) {
  const win = new BrowserWindow({ width: 1024, height: 768, show: false, skipTaskbar: true, title: kind === "back" ? "아마노 (뒤에서 할인 등록)" : "아마노 주차 (입장 데스크가 조작 중)", webPreferences: { backgroundThrottling: false } });
  win.setMenuBarVisibility(false);
  if (settings.amanoUrl) win.loadURL(settings.amanoUrl);
  else win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent("<p style='font:16px sans-serif;padding:24px'>운영 설정 → 아마노 탭에서 아마노 할인등록 주소를 넣어 주세요.</p>"));
  const sync = new AmanoSync((code) => timed(win.webContents.executeJavaScript(code, true), 8000, "아마노 화면이 응답하지 않음"), { selectors: settings.amanoSelectors });
  // 로그인하면 할인등록 화면으로 자동 이동 (근무자는 아침에 아이디·비밀번호만 넣으면 됨)
  win.webContents.on("did-finish-load", async () => {
    if (!settings.amanoUrl) return;
    try {
      const target = new URL(settings.amanoPage, settings.amanoUrl).href;
      const here = win.webContents.getURL();
      const hasPassword = await win.webContents.executeJavaScript("!!document.querySelector('input[type=password]')");
      // 로그인이 풀렸으면 저장된 아이디·비밀번호로 자동 로그인 (한 번만 시도, 실패하면 근무자에게 맡김)
      if (hasPassword && settings.amanoId && settings.amanoPwEnc && !win.__triedLogin) {
        win.__triedLogin = true;
        const pw = safeStorage.decryptString(Buffer.from(settings.amanoPwEnc, "base64"));
        await sync.login(settings.amanoId, pw);
        return;
      }
      if (!hasPassword) win.__triedLogin = false;
      if (!hasPassword && !here.startsWith(target)) win.loadURL(target);
      else if (!hasPassword && kind === "front") {
        if (deskWin) deskWin.focus(); // 할인등록 화면 준비됨 → 데스크를 앞으로
        // 앞 창이 로그인된 뒤에 뒤 창을 엶 (같은 로그인을 같이 씀 → 두 번 로그인해서 서로 끊기는 일 없게)
        if (!amanoBgWin || amanoBgWin.isDestroyed()) ({ win: amanoBgWin, sync: amanoBg } = makeAmanoWin("back"));
      }
    } catch (e) {
      /* 주소가 잘못됨 등: 화면에 그대로 둠 */
    }
  });
  if (kind === "front") {
    win.once("ready-to-show", () => {
      win.showInactive();
      if (deskWin) deskWin.focus(); // 데스크가 늘 맨 앞
    });
  }
  win.on("close", (e) => {
    // 근무자가 아마노 창을 닫아도 꺼지지 않고 뒤로만 숨김
    if (!app.isQuitting) {
      e.preventDefault();
      if (kind === "back") win.hide();
      if (deskWin) deskWin.focus(); // 닫지 않고 데스크 뒤로 (계속 조작해야 해서)
    }
  });
  return { win, sync };
}
let amanoBgWin = null;
let amanoBg = null;
function openAmano() {
  if (amanoWin && !amanoWin.isDestroyed()) amanoWin.destroy();
  if (amanoBgWin && !amanoBgWin.isDestroyed()) amanoBgWin.destroy();
  amanoBgWin = amanoBg = null;
  ({ win: amanoWin, sync: amano } = makeAmanoWin("front"));
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
    // 이용완료 때 네이버 화면을 남김 (확인 창 모양 확인용 · 늘 같은 이름으로 덮어씀)
    onSnap: (label) => dumpNaver(label === "이용완료 안 됨" ? "naver-complete-fail" : "naver-complete-last"),
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

/* POS 프로그램(OKPOS) 창을 맨 앞으로 — Alt+Tab 처럼 그 창으로 바로 넘어감 (현장 10/6)
   찾는 순서: 운영 설정의 POS 창 제목 → 제목에 OKPOS · NICE · POS 가 든 창 → 프로그램 이름에 okpos 가 든 것
   최소화돼 있으면 펼치고, Windows 가 다른 프로그램의 창 바꾸기를 막지 않게 Alt 키를 한 번 눌렀다 뗀 뒤 앞으로 */
// POS 창 찾기 · 펼치기 · 앞으로 (PowerShell). 함수만 정의 — 아래 POS_PS(한 번 실행)와 posAgent(미리 띄워 둠)가 같이 씀
const POS_LIB = `
$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices;
public class W {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool f);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
}
"@
function All {
  $l = New-Object System.Collections.ArrayList
  $cb = [W+EnumProc]{ param($h, $x)
    $sb = New-Object System.Text.StringBuilder 512; [void][W]::GetWindowText($h, $sb, 512)
    $p = 0; [void][W]::GetWindowThreadProcessId($h, [ref]$p)
    $r = New-Object W+RECT; [void][W]::GetWindowRect($h, [ref]$r)
    [void]$l.Add([pscustomobject]@{ h = $h; t = $sb.ToString(); p = $p; v = [W]::IsWindowVisible($h); ic = [W]::IsIconic($h); a = [Math]::Max(0, $r.R - $r.L) * [Math]::Max(0, $r.B - $r.T) })
    return $true }
  [void][W]::EnumWindows($cb, [IntPtr]::Zero)
  return $l
}
# 그 프로그램에서 실제로 펼쳐져 보이는 큰 창 (작업표시줄 단추용 크기 0 창은 빼고)
function Main { All | Where-Object { $_.p -eq $script:pid0 -and $_.v -and -not $_.ic -and $_.a -gt 40000 } | Sort-Object a -Descending | Select-Object -First 1 }
function ShowPos($want) {
  $wins = All
  $named = $wins | Where-Object { $_.v -and $_.t }
  $names = @{}; foreach ($w in $named) { if (-not $names.ContainsKey($w.p)) { try { $names[$w.p] = (Get-Process -Id $w.p).ProcessName } catch { $names[$w.p] = "" } } }
  $hit = $null
  if ($want) { $hit = $named | Where-Object { $_.t -like "*$want*" } | Select-Object -First 1 }
  if (-not $hit) { $hit = $named | Where-Object { $_.t -match "OKPOS|NICE|POS" -and $_.t -notmatch "아스타나키즈|입장 데스크" } | Select-Object -First 1 }
  if (-not $hit) { $hit = $named | Where-Object { $names[$_.p] -match "okpos" } | Select-Object -First 1 }
  if (-not $hit) { return "none|" + (($named | ForEach-Object { $_.t }) -join " / ") }
  $script:pid0 = $hit.p
  $main = Main
  if (-not $main) {
    # 최소화돼 있음 → 작업표시줄의 POS 아이콘을 누른 것과 같은 '복원' 신호를 그 프로그램의 창들에 보냄 (현장 10/6: ShowWindow 만으로는 OKPOS가 안 펼쳐짐)
    foreach ($w in ($wins | Where-Object { $_.p -eq $pid0 -and $_.v })) {
      if ($w.ic) { [void][W]::PostMessage($w.h, 0x0112, [IntPtr]0xF120, [IntPtr]::Zero); [void][W]::ShowWindow($w.h, 9) }
    }
    for ($i = 0; $i -lt 20 -and -not $main; $i++) { Start-Sleep -Milliseconds 100; $main = Main }
  }
  if (-not $main) { return "shut|" + $hit.t }
  $h = $main.h
  # 다른 프로그램을 앞으로 올릴 때 Windows가 막는 것 풀기: Alt 한 번 + 지금 앞 창의 입력에 잠깐 붙기
  $fg = [W]::GetForegroundWindow(); $q = 0
  $ft = [W]::GetWindowThreadProcessId($fg, [ref]$q); $me = [W]::GetCurrentThreadId()
  [void][W]::AttachThreadInput($me, $ft, $true)
  [W]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [W]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
  [void][W]::BringWindowToTop($h); [void][W]::SetForegroundWindow($h)
  [void][W]::AttachThreadInput($me, $ft, $false)
  return "ok|" + $h.ToInt64() + "|" + $main.t + " (" + $names[$pid0] + ")"
}
`;
const POS_PS = POS_LIB + "[Console]::Out.Write((ShowPos $env:ASTANA_POS))";
/* POS 도우미를 앱이 켜질 때 미리 띄워 둠: 누를 때마다 PowerShell을 새로 켜면 1~2초 걸려서 (현장 10/6 "POS로 넘어가는 딜레이")
   한 줄(POS 창 제목, base64)을 받으면 결과 한 줄을 돌려줌 */
let posAgent = null; // { proc, wait: [], buf, ready }
let posAgentBroken = false; // 이 PC에서 도우미가 안 되면 예전 방식(한 번씩 실행)만
function startPosAgent() {
  if (process.platform !== "win32" || posAgent || posAgentBroken) return;
  const script = POS_LIB + `
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  if ($line -eq "PING") { [Console]::Out.WriteLine("PONG"); [Console]::Out.Flush(); continue }
  $want = ""; if ($line) { $want = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($line.Trim())) }
  $r = "" + (ShowPos $want)
  [Console]::Out.WriteLine(($r -replace "[\r\n]+", " ")); [Console]::Out.Flush()
}`;
  const enc = Buffer.from(script, "utf16le").toString("base64");
  let proc;
  try {
    proc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc], { windowsHide: true });
  } catch (e) {
    return;
  }
  const me = { proc, wait: [], buf: "", ready: false };
  posAgent = me;
  proc.stdout.setEncoding("utf8");
  proc.stdout.on("data", (d) => {
    me.buf += d;
    let i;
    while ((i = me.buf.indexOf("\n")) >= 0) {
      const line = me.buf.slice(0, i).trim();
      me.buf = me.buf.slice(i + 1);
      const w = me.wait.shift();
      if (w) w(line);
    }
  });
  const gone = () => {
    if (posAgent === me) posAgent = null;
    me.wait.splice(0).forEach((w) => w(""));
  };
  proc.on("exit", gone);
  proc.on("error", gone);
  // 시작 확인: 20초 안에 PONG이 없으면 이 PC에선 도우미를 안 씀
  const t = setTimeout(() => { if (!me.ready) { posAgentBroken = true; stopPosAgent(me); } }, 20000);
  me.wait.push((l) => { clearTimeout(t); if (l === "PONG") me.ready = true; });
  try { proc.stdin.write("PING\n"); } catch (e) {}
}
function stopPosAgent(me = posAgent) {
  if (!me) return;
  if (posAgent === me) posAgent = null;
  try { me.proc.kill(); } catch (e) {}
}
// 도우미에게 물어봄. 도우미가 아직 준비 안 됐거나 5초 안에 답이 없으면 예전처럼 한 번 실행
async function posShowFast(title) {
  const me = posAgent;
  if (me && me.ready) {
    const line = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(""), 5000);
      me.wait.push((l) => { clearTimeout(t); resolve(l); });
      try { me.proc.stdin.write(Buffer.from(title || "", "utf8").toString("base64") + "\n"); } catch (e) { resolve(""); }
    });
    if (line) return line;
    stopPosAgent(me); // 꼬였으면 버리고 새로
  }
  const out = await psRun(POS_PS, { ASTANA_POS: title || "" });
  startPosAgent(); // 다음 번엔 빠르게
  return out;
}
// POS 창이 펼쳐진 걸 본 뒤, 다시 최소화(숨김 · 닫힘)될 때까지 기다림 → 그때 데스크를 다시 올림
const POS_WAIT_PS = `
Add-Type @"
using System; using System.Runtime.InteropServices;
public class V { [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h); [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h); }
"@
$h = [IntPtr][Int64]$env:ASTANA_HWND
$open = { [V]::IsWindow($h) -and [V]::IsWindowVisible($h) -and -not [V]::IsIconic($h) }
$seen = $false
for ($i = 0; $i -lt 3000; $i++) {
  if (& $open) { $seen = $true } elseif ($seen) { [Console]::Out.Write("back"); exit } elseif ($i -gt 10) { [Console]::Out.Write("never"); exit }
  Start-Sleep -Milliseconds 300
}
[Console]::Out.Write("timeout")
`;
let posWatch = 0;
async function showPos() {
  if (process.platform !== "win32") return { ok: false, why: "Windows 에서만 됨" };
  // 최소화 단추를 누른 것처럼 데스크를 먼저 내리고 POS를 올림 (데스크가 앞에 버티고 있으면 POS가 안 보여서 · 현장 10/6)
  if (deskWin) deskWin.minimize();
  const out = await posShowFast(settings.posTitle || "");
  const m = /^ok\|(-?\d+)\|(.*)$/s.exec(out);
  if (!m) {
    if (deskWin) { deskWin.restore(); deskWin.focus(); }
    if (out.startsWith("shut|")) return { ok: false, why: "POS가 최소화돼 있는데 펼치지 못했어요 — 작업표시줄의 POS 아이콘을 직접 눌러 주세요" };
    if (out.startsWith("none|")) return { ok: false, why: `POS 창을 찾지 못함 — OKPOS가 켜져 있는지 확인해 주세요 (열린 창: ${out.slice(5).slice(0, 200)})` };
    return { ok: false, why: `POS 창으로 못 넘어감: ${out.slice(0, 200)}` };
  }
  // POS를 최소화하면 데스크가 다시 올라옴 (데스크의 focus 이벤트 → 결제 완료 단계)
  const my = ++posWatch;
  psRun(POS_WAIT_PS, { ASTANA_HWND: m[1] }, null, 16 * 60 * 1000).then((r) => {
    if (my !== posWatch || !deskWin || r !== "back") return;
    // Windows가 뒤 프로그램이 앞으로 나오는 걸 막을 수 있어 잠깐 '맨 위'로 올렸다가 풂
    deskWin.restore();
    deskWin.setAlwaysOnTop(true);
    deskWin.show();
    app.focus({ steal: true });
    deskWin.focus();
    setTimeout(() => deskWin && deskWin.setAlwaysOnTop(false), 300);
  });
  return { ok: true, title: m[2] };
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
// 뒤에서 할인 등록: 뒤 창에서 그 차를 검색 → 선택 → 할인 버튼 → '등록되었습니다' 확인까지 (근무자 화면은 기다리지 않음)
ipcMain.handle("amano:job", async (_e, job) => {
  try {
    for (let i = 0; !amanoBg && i < 60; i++) await new Promise((r) => setTimeout(r, 1000)); // 켜자마자면 로그인 기다림
    if (!amanoBg) return { ok: false, why: "아마노에 아직 로그인되지 않음" };
    return await serial("amanoBg", () => timed((async () => {
      let r = await amanoBg.search(job.day, job.no);
      if (!r.ok) return r;
      if (!r.state.rows.some((x) => x.id === job.id)) return { ok: false, why: `아마노 조회에서 ${job.carNo || job.no} 차를 못 찾음` };
      r = await amanoBg.select(job.id);
      if (!r.ok) return r;
      return amanoBg.discount(job.type);
    })(), 60000, "아마노가 1분 넘게 응답하지 않음"));
  } catch (e) {
    return { ok: false, why: String(e.message || e) };
  }
});
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
  if (amanoBg) amanoBg.selectors = settings.amanoSelectors;
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
ipcMain.handle("naver:load", nwrap((day, only) => naver.loadDay(day, { only }), 300000)); // 처음엔 칸을 다 열어 오래 걸릴 수 있음
ipcMain.handle("naver:complete", nwrap((b) => naver.complete(b)));
ipcMain.handle("naver:setCap", nwrap((c) => naver.setCap(c))); // 판매 수량 자동 조절 { day, product, time, n }
ipcMain.handle("naver:show", () => {
  if (naverWin) {
    naverWin.show();
    naverWin.focus();
  }
  return { ok: true };
});
// 진단: 지금 네이버 창의 화면(HTML)과 사진을 바탕화면 '아스타나키즈-진단' 폴더에 저장 → 개발자에게 보내 화면 구조를 맞춤
// (예약자 이름 · 전화번호가 들어 있으니 개발 확인용으로만)
async function dumpNaver(name) {
  if (!naverWin) throw new Error("네이버 창이 없음");
  const dir = path.join(app.getPath("desktop"), "아스타나키즈-진단");
  fs.mkdirSync(dir, { recursive: true });
  const wc = naverWin.webContents;
  const frames = (wc.mainFrame ? wc.mainFrame.framesInSubtree : []).map((f) => f.url);
  const html = await timed(wc.executeJavaScript("document.documentElement.outerHTML", true), 8000, "네이버 화면이 응답하지 않음");
  const head = `<!-- 주소: ${wc.getURL()}\n액자: ${frames.join(" | ")}\n버전: ver.${BUILD} ${SHA} · ${new Date().toLocaleString("ko-KR")} -->\n`;
  fs.writeFileSync(path.join(dir, `${name}.html`), head + html);
  const img = await wc.capturePage();
  fs.writeFileSync(path.join(dir, `${name}.png`), img.toPNG());
  return path.join(dir, `${name}.html`);
}
ipcMain.handle("naver:dump", async () => {
  try {
    const d = new Date();
    const stamp = `${d.getMonth() + 1}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
    const file = await dumpNaver(`naver-${stamp}`);
    shell.showItemInFolder(file);
    return { ok: true, dir: path.dirname(file) };
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

// 오늘의 열쇠 · 입장 기록 (날짜별 파일) — 껐다 켜도 · 다시 켜도 · 재설치해도 남음. 임시 파일에 쓰고 바꿔 끼워 반쯤 쓴 파일이 남지 않게
const STATE_DIR = () => path.join(app.getPath("userData"), "desk-state");
const stateFile = (day) => path.join(STATE_DIR(), `${String(day).replace(/[^0-9-]/g, "")}.json`);
ipcMain.on("state:load", (e, day) => {
  try {
    e.returnValue = fs.readFileSync(stateFile(day), "utf8");
  } catch (err) {
    e.returnValue = null;
  }
});
ipcMain.on("state:save", (_e, day, json) => {
  try {
    fs.mkdirSync(STATE_DIR(), { recursive: true });
    const f = stateFile(day);
    fs.writeFileSync(f + ".tmp", json, "utf8");
    fs.renameSync(f + ".tmp", f);
  } catch (err) {
    /* 저장 실패 — 브라우저 저장소에 한 벌 더 있음 */
  }
});

// ── 영수증 프린터 (80mm 감열지) ──
// Windows 에 설치된 프린터 목록 (POS 프린터도 Windows 에 드라이버가 깔려 있어야 보임 — '설정 → 프린터 및 스캐너' 에 있는 것)
ipcMain.handle("print:list", async () => {
  try {
    const list = await deskWin.webContents.getPrintersAsync();
    return { ok: true, list: list.map((p) => ({ name: p.name, display: p.displayName || p.name, isDefault: !!p.isDefault, status: p.status, desc: p.description || "" })) };
  } catch (e) {
    return { ok: false, why: String(e.message || e) };
  }
});
// 영수증 프린터에 날 바이트(ESC/POS)를 보냄 — Windows 인쇄 대기열에 RAW 로 (드라이버가 그대로 프린터에 넘김)
// PowerShell 이 winspool.drv 를 불러 씀 (따로 설치할 것 없음)
const RAW_PS = `
$code = @"
using System; using System.Runtime.InteropServices;
public class RawPrn {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern int StartDocPrinter(IntPtr h, int l, DOCINFO di);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr h, byte[] b, int c, out int w);
  public static string Send(string name, byte[] data) {
    IntPtr h; if (!OpenPrinter(name, out h, IntPtr.Zero)) return "프린터를 열 수 없음";
    var di = new DOCINFO(); di.pDocName = "astanakiz cut"; di.pDataType = "RAW";
    if (StartDocPrinter(h, 1, di) == 0) { ClosePrinter(h); return "인쇄 작업을 만들 수 없음"; }
    StartPagePrinter(h); int w; bool ok = WritePrinter(h, data, data.Length, out w);
    EndPagePrinter(h); EndDocPrinter(h); ClosePrinter(h);
    return ok ? "ok" : "보내기 실패";
  }
}
"@
Add-Type -TypeDefinition $code
[Console]::Out.Write([RawPrn]::Send($env:ASTANA_PRN, [Convert]::FromBase64String($env:ASTANA_DATA)))
`;
function rawSend(printer, bytes) {
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve({ ok: false, why: "Windows 에서만 됨" });
    const enc = Buffer.from(RAW_PS, "utf16le").toString("base64");
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc], { env: { ...process.env, ASTANA_PRN: printer, ASTANA_DATA: Buffer.from(bytes).toString("base64") }, timeout: 20000 }, (err, out) => {
      const r = String(out || "").trim();
      resolve(r === "ok" ? { ok: true } : { ok: false, why: r || (err && err.message) || "자르기 명령 실패" });
    });
  });
}
// ── POS 영수증 프린터에 ESC/POS 로 바로 (OKPOS OK-50 처럼 Windows 프린터로 등록되지 않고 COM 포트로 쓰는 프린터) ──
// 조각 [{ b: [바이트] } | { t: "한글" }] 을 CP949 로 바꿔 COM 포트(또는 Windows 프린터 RAW)로 보냄. PowerShell · .NET 만 씀 (설치할 것 없음)
const ESC_PS = `
$ErrorActionPreference = "Stop"
# 한글이 깨지지 않게 UTF-8 JSON 을 base64 로 받음
$parts = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:ASTANA_JSON)) | ConvertFrom-Json
$enc = [System.Text.Encoding]::GetEncoding(949)
$ms = New-Object System.IO.MemoryStream
foreach ($p in $parts) {
  if ($p.t -ne $null) { $bytes = $enc.GetBytes([string]$p.t); $ms.Write($bytes, 0, $bytes.Length) }
  elseif ($p.b -ne $null) { foreach ($x in $p.b) { $ms.WriteByte([byte]$x) } }
}
$data = $ms.ToArray()
try {
  if ($env:ASTANA_MODE -eq "com") {
    $sp = New-Object System.IO.Ports.SerialPort $env:ASTANA_PORT, ([int]$env:ASTANA_BAUD), "None", 8, "One"
    $sp.Handshake = "None"; $sp.DtrEnable = $true; $sp.RtsEnable = $true; $sp.WriteTimeout = 8000
    $sp.Open(); $sp.Write($data, 0, $data.Length); Start-Sleep -Milliseconds 400; $sp.Close()
    [Console]::Out.Write("ok")
  } else {
    [Console]::Out.Write("모드를 모름")
  }
} catch {
  $m = $_.Exception.Message
  if ($m -match "denied|거부|in use|사용") { [Console]::Out.Write("포트를 다른 프로그램(OKPOS)이 쓰는 중: " + $m) } else { [Console]::Out.Write($m) }
}
`;
function psRun(script, env, input, ms = 25000) {
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve("Windows 에서만 됨");
    const enc = Buffer.from(script, "utf16le").toString("base64");
    const child = execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc], { env: { ...process.env, ...env }, timeout: ms }, (err, out) =>
      resolve(String(out || "").trim() || (err && err.message) || ""),
    );
    if (input != null) {
      child.stdin.write(input);
      child.stdin.end();
    }
  });
}
// COM 포트 목록 (이름 포함: "USB Serial Port (COM3)" 등)
ipcMain.handle("print:ports", async () => {
  const out = await psRun(`
$l = @()
try { Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match '\\(COM\\d+\\)' } | ForEach-Object { $l += $_.Name } } catch {}
foreach ($n in [System.IO.Ports.SerialPort]::GetPortNames()) { if (-not ($l -match "\\($n\\)")) { $l += $n } }
[Console]::Out.Write(($l -join "|"))
`, {});
  if (/Windows 에서만/.test(out)) return { ok: false, why: out };
  const list = out.split("|").map((x) => x.trim()).filter(Boolean).map((name) => ({ name, port: (name.match(/(COM\d+)/i) || [])[1] || name }));
  return { ok: true, list };
});
ipcMain.handle("print:escpos", async (_e, { port, baud, parts }) => {
  const r = await psRun(ESC_PS, { ASTANA_MODE: "com", ASTANA_PORT: port, ASTANA_BAUD: String(baud || 115200), ASTANA_JSON: Buffer.from(JSON.stringify(parts), "utf8").toString("base64") });
  return r === "ok" ? { ok: true } : { ok: false, why: r || "응답 없음" };
});

// 종이 자르기: 3줄 올리고(ESC d 3) 부분 자르기(GS V 1) — 대부분의 80mm 영수증 프린터(ESC/POS)
const CUT = [0x1b, 0x64, 0x03, 0x1d, 0x56, 0x01];
ipcMain.handle("print:cut", (_e, deviceName) => rawSend(deviceName, CUT));

// 영수증 HTML 을 그 프린터로 출력. silent=false 면 Windows 인쇄 창을 띄움 (드라이버 확인용)
ipcMain.handle("print:html", async (_e, { html, deviceName, silent = true, widthMm = 80, cut = true }) => {
  let w = null;
  try {
    const file = path.join(app.getPath("temp"), "astanakiz-receipt.html");
    fs.writeFileSync(file, html, "utf8");
    w = new BrowserWindow({ show: false, width: Math.round((widthMm / 25.4) * 96), height: 1200, webPreferences: { backgroundThrottling: false } });
    await w.loadFile(file);
    const hpx = await w.webContents.executeJavaScript("Math.ceil(document.documentElement.scrollHeight)");
    // 감열지는 길이가 정해져 있지 않음 → 내용 높이만큼 (+여백 10mm)
    const heightMicrons = Math.max(50000, Math.ceil((hpx / 96) * 25400) + 10000);
    const res = await new Promise((resolve) =>
      w.webContents.print(
        { silent, deviceName: deviceName || undefined, printBackground: true, margins: { marginType: "none" }, pageSize: { width: widthMm * 1000, height: heightMicrons } },
        (ok, why) => resolve(ok ? { ok: true } : { ok: false, why: why || "출력 실패" }),
      ),
    );
    // 출력이 끝나면 종이 자르기 (인쇄 대기열에서 출력 다음 차례로 들어감)
    if (res.ok && cut && deviceName) {
      const c = await rawSend(deviceName, CUT);
      if (!c.ok) return { ok: true, cutWhy: c.why };
    }
    return res;
  } catch (e) {
    return { ok: false, why: String(e.message || e) };
  } finally {
    if (w && !w.isDestroyed()) setTimeout(() => w.destroy(), 1000);
  }
});

// 한 번만 켜지게: 이미 켜져 있으면 새로 띄우지 않고 켜진 데스크를 앞으로
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on("second-instance", () => {
  if (deskWin) {
    if (deskWin.isMinimized()) deskWin.restore();
    deskWin.focus();
  }
});

/* 하루 종일 켜 두는 POS PC가 느려지지 않게 (수량 자동 조절 · 이용완료로 네이버 창을 자주 씀 · 현장 10/6)
   5분마다 네이버 · 아마노 창의 메모리를 보고, 쉬는 중에 너무 커졌으면 그 창만 새로 고침 (로그인은 유지됨). 데스크 화면은 건드리지 않음 */
const MEM_LIMIT_MB = 700;
function memWatch() {
  try {
    const byPid = new Map(app.getAppMetrics().map((m) => [m.pid, m.memory ? m.memory.workingSetSize / 1024 : 0]));
    for (const [win, q] of [[naverWin, "naver"], [amanoBgWin, "amanoBg"]]) {
      if (!win || win.isDestroyed() || pending[q]) continue;
      const mb = byPid.get(win.webContents.getOSProcessId()) || 0;
      if (mb > MEM_LIMIT_MB) win.webContents.reload();
    }
  } catch (e) {
    /* 확인 실패는 무시 */
  }
}
app.whenReady().then(() => {
  if (!gotLock) return;
  setInterval(memWatch, 5 * 60 * 1000);
  loadSettings();
  openAmano(); // 맨 뒤 아마노
  openNaver(); // 맨 뒤 네이버 예약관리
  createDesk(); // 맨 앞 데스크 (POS 는 원래대로 따로 켜져 있음)
  startPosAgent(); // POS로 넘어가는 도우미를 미리 켜 둠
});
app.on("before-quit", () => {
  app.isQuitting = true;
  stopPosAgent();
});
app.on("window-all-closed", () => app.quit());
