/* COM 포트 차례 (현장 10/17 '출력 실패 — COM1 액세스 거부')
   COM 포트는 한 번에 한 프로그램만 열 수 있음 → 데스크 안의 출력 · 현금통 열기는 포트마다 하나씩 차례로
   (쿠폰 보안 무늬 그림처럼 몇 초 걸리는 출력 중에 [시험 출력]을 또 누르거나 입장권이 같이 나가면 뒤의 것이 거부되던 것)
   - OKPOS 처럼 다른 프로그램이 잠깐 쥐고 있으면 PowerShell 쪽에서 PORT_WAIT_MS 동안 0.3초마다 다시 엶 */
const PORT_WAIT_MS = 10000;
const locks = new Map();
const keyOf = (port) => String(port || "").trim().toUpperCase();

/** 그 포트의 앞 일이 끝난 뒤 job() 실행 (앞 일이 실패해도 다음은 함) */
function comTurn(port, job) {
  const key = keyOf(port);
  const prev = locks.get(key) || Promise.resolve();
  const run = prev.then(() => job());
  const tail = run.then(() => {}, () => {});
  locks.set(key, tail);
  tail.then(() => { if (locks.get(key) === tail) locks.delete(key); });
  return run;
}
/** 그 포트에 하는 중이거나 기다리는 일이 있나 */
const comBusy = (port) => locks.has(keyOf(port));

/** ESC/POS 조각의 바이트 수 어림 — 글은 CP949 (한글 2 · 그 밖 1) · 명령 · 그림(base64) */
function partsBytes(parts) {
  let n = 0;
  for (const p of parts || []) {
    if (p.t != null) for (const ch of String(p.t)) n += ch.charCodeAt(0) > 0x7f ? 2 : 1;
    else if (p.b) n += p.b.length;
    else if (p.r) n += Math.floor((String(p.r).length * 3) / 4);
  }
  return n;
}
/** 보내는 데 걸리는 초 (바이트 × 10비트 ÷ 속도) */
const sendSecs = (bytes, baud) => (bytes * 10) / (Number(baud) || 115200);
/** 기다림 한도(ms): write = 포트 쓰기 (작은 출력은 예전처럼 8초 · 그림은 보내는 시간의 두 배를 더함) · total = PowerShell 전체 (포트 빌 때까지 기다림 포함) */
function comTimeouts(bytes, baud) {
  const write = Math.round(8000 + sendSecs(bytes, baud) * 2000);
  return { write, total: write + PORT_WAIT_MS + 15000 };
}

module.exports = { comTurn, comBusy, partsBytes, sendSecs, comTimeouts, PORT_WAIT_MS };
