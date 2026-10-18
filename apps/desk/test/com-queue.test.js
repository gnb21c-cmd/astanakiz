/* COM 포트 차례 (현장 10/17 '출력 실패 — COM1 액세스 거부'): 데스크 안의 출력 · 현금통은 포트마다 하나씩
   - 쿠폰 그림 출력 중에 [시험 출력]을 또 누르거나 입장권이 같이 나가도 겹치지 않고 차례로 · 앞 일이 실패해도 다음은 함
   - 그림이 큰 출력은 기다림 한도를 늘림 (작은 출력은 예전처럼 8초) */
const test = require("node:test");
const assert = require("node:assert");
const Q = require("../src/com-queue");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("같은 포트는 하나씩 차례로 · 다른 포트는 따로 · 앞 일이 실패해도 다음은 함", async () => {
  const log = [];
  let open = 0, most = 0;
  const job = (name, ms, fail) => async () => {
    open++; most = Math.max(most, open); log.push(`${name} 시작`);
    await sleep(ms);
    open--; log.push(`${name} 끝`);
    if (fail) throw new Error(name + " 실패");
    return name;
  };
  const a = Q.comTurn("COM1", job("쿠폰 그림", 60));
  const b = Q.comTurn("com1", job("시험 출력", 5, true)); // 대소문자 같은 포트
  const c = Q.comTurn(" COM1 ", job("현금통", 5));
  assert.ok(Q.comBusy("COM1"));
  const r = await Promise.allSettled([a, b, c]);
  assert.deepStrictEqual(r.map((x) => x.status), ["fulfilled", "rejected", "fulfilled"]);
  assert.strictEqual(most, 1, "같은 포트는 한 번에 하나");
  assert.deepStrictEqual(log, ["쿠폰 그림 시작", "쿠폰 그림 끝", "시험 출력 시작", "시험 출력 끝", "현금통 시작", "현금통 끝"]);
  await sleep(0);
  assert.strictEqual(Q.comBusy("COM1"), false, "다 끝나면 비움");

  // 다른 포트는 기다리지 않음
  open = 0; most = 0;
  await Promise.all([Q.comTurn("COM1", job("가", 30)), Q.comTurn("COM3", job("나", 30))]);
  assert.strictEqual(most, 2);
});

test("바이트 어림 · 보내는 시간 · 기다림 한도: 글만 있는 입장권은 예전처럼 · 쿠폰 그림은 늘림", () => {
  const raster = Buffer.alloc(30000, 0x55).toString("base64");
  assert.strictEqual(Q.partsBytes([{ t: "아스타나 A1" }, { b: [0x1b, 0x40] }, { r: raster }]), 4 * 2 + 3 + 2 + 30000);
  assert.ok(Math.abs(Q.sendSecs(30000, 115200) - 2.6) < 0.01, "115200bps 면 3초쯤");
  assert.ok(Math.abs(Q.sendSecs(30000, 9600) - 31.25) < 0.01, "9600bps 면 30초 넘게");
  assert.strictEqual(Q.partsPause([{ r: raster, w: 150 }, { r: raster, w: 150 }, { b: [0x1d, 0x56, 1] }]), 300, "그림 조각 뒤 기다림 합");
  const small = Q.comTimeouts(1500, 115200), big = Q.comTimeouts(30000, 9600);
  assert.strictEqual(Q.comTimeouts(30000, 9600, 2700).total, big.total + 2700, "조각 기다림만큼 전체 한도도 늘림");
  assert.ok(small.write >= 8000 && small.write < 8500, "입장권은 예전처럼 8초쯤 " + small.write);
  assert.ok(big.write > 31250 * 2, "그림은 보내는 시간의 두 배 넘게 " + big.write);
  assert.strictEqual(big.total, big.write + Q.PORT_WAIT_MS + 15000, "전체 = 쓰기 + 포트 빌 때까지 + 여유");
});
