/* 새 판 저절로 바꾸기 (사장님 11/16) — updater.js 규칙: 확인 · 받기 · 1분 띠 · 조용히 설치 · 30분 뒤에 · 하는 일이 있으면 미룸 · 오류 */
const test = require("node:test");
const assert = require("node:assert");
const EventEmitter = require("events");
const { DeskUpdater, UPDATE_TIMES } = require("../src/updater");

/** 가짜 시계 · 타이머 */
function clock() {
  let t = Date.parse("2026-11-16T10:00:00+09:00"), seq = 0;
  const q = new Map();
  return {
    now: () => t,
    tm: { setTimeout: (fn, ms) => { const id = ++seq; q.set(id, { at: t + ms, fn }); return id; }, clearTimeout: (id) => q.delete(id) },
    async go(ms) {
      const end = t + ms;
      for (;;) {
        const next = [...q.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        q.delete(next[0]);
        t = next[1].at;
        await next[1].fn();
        await new Promise((r) => setImmediate(r));
      }
      t = end;
    },
  };
}
/** 가짜 electron-updater: 확인하면 정해 둔 대로 (최신 · 새 판 → 받는 중 → 받음 · 오류) */
function fakeAu(plan) {
  const au = new EventEmitter();
  au.checks = 0; au.installs = [];
  au.checkForUpdates = async () => {
    au.checks++;
    au.emit("checking-for-update");
    const p = plan();
    if (p === "error") throw new Error("net::ERR_INTERNET_DISCONNECTED");
    if (!p) { au.emit("update-not-available", { version: "2.27.0" }); return; }
    au.emit("update-available", { version: p });
    au.emit("download-progress", { percent: 42.7 });
    au.emit("update-downloaded", { version: p });
  };
  au.quitAndInstall = (silent, run) => au.installs.push([silent, run]);
  return au;
}

test("켜고 1분 뒤 처음 확인 · 그 뒤 10분마다 · 최신이면 띠 없음 · 설정(뒤에서 받기 · 끌 때 설치 · 통째로)", async () => {
  const c = clock(), au = fakeAu(() => null);
  const u = new DeskUpdater(au, { now: c.now, tm: c.tm, current: "2.27.0" }).start();
  assert.deepStrictEqual([au.autoDownload, au.autoInstallOnAppQuit, au.disableDifferentialDownload, au.allowDowngrade, au.allowPrerelease, au.disableWebInstaller], [true, true, true, false, false, true]);
  assert.strictEqual(u.status().current, "2.27", "화면에는 2.27 모양");
  await c.go(UPDATE_TIMES.first - 1);
  assert.strictEqual(au.checks, 0);
  await c.go(1);
  assert.strictEqual(au.checks, 1);
  assert.strictEqual(u.status().state, "latest");
  await c.go(UPDATE_TIMES.every * 3);
  assert.strictEqual(au.checks, 4, "10분마다");
  assert.strictEqual(au.installs.length, 0);
});

test("새 판 → 뒤에서 받음 → 받으면 1분 띠(남은 초) → 1분 뒤 조용히 설치 · 다시 켬 (quitAndInstall(true, true))", async () => {
  const c = clock();
  let next = null;
  const au = fakeAu(() => next);
  const states = [];
  const u = new DeskUpdater(au, { now: c.now, tm: c.tm, current: "2.27.0" }).start();
  u.on("state", (v) => states.push(v.state));
  let applied = "";
  u.on("apply", (v) => (applied = v));
  await c.go(UPDATE_TIMES.first);
  assert.strictEqual(u.status().state, "latest");
  next = "2.28.0"; // 사장님 "업데이트 해" → 새 판이 GitHub 에
  await c.go(UPDATE_TIMES.every);
  assert.ok(states.includes("downloading"), states.join(","));
  const s = u.status();
  assert.deepStrictEqual([s.state, s.version, s.percent, s.left], ["ready", "2.28", 100, 60]);
  await c.go(30e3);
  assert.strictEqual(u.status().left, 30, "남은 초가 줄어듦");
  assert.strictEqual(au.installs.length, 0, "1분 전에는 안 바꿈");
  await c.go(30e3);
  assert.deepStrictEqual(au.installs, [[true, true]], "조용히 설치 · 끝나면 다시 켬");
  assert.strictEqual(u.status().state, "applying");
  assert.strictEqual(applied, "2.28");
  // 바꾸는 중에는 확인 결과로 상태가 흔들리지 않음 · 다시 확인 안 함
  const n = au.checks;
  await c.go(UPDATE_TIMES.every * 2);
  assert.strictEqual(au.checks, n);
});

test("[30분 뒤에] → 띠가 사라졌다가 30분 뒤 다시 1분 띠 → 설치 · [지금 바꾸기]는 바로", async () => {
  const c = clock(), au = fakeAu(() => "2.28.0");
  const u = new DeskUpdater(au, { now: c.now, tm: c.tm, current: "2.27.0" });
  await u.check();
  assert.strictEqual(u.status().state, "ready");
  const l = u.later();
  assert.deepStrictEqual([l.applyAt, l.laterUntil > c.now()], [0, true]);
  await c.go(UPDATE_TIMES.later - 1);
  assert.strictEqual(au.installs.length, 0);
  await c.go(1);
  assert.strictEqual(u.status().left, 60, "30분 뒤 다시 1분 띠");
  assert.strictEqual(u.status().laterUntil, 0);
  await c.go(60e3);
  assert.strictEqual(au.installs.length, 1);
  // [지금 바꾸기]
  const c2 = clock(), au2 = fakeAu(() => "2.28.0");
  const u2 = new DeskUpdater(au2, { now: c2.now, tm: c2.tm });
  await u2.check();
  assert.deepStrictEqual(u2.apply(true), { ok: true });
  assert.deepStrictEqual(au2.installs, [[true, true]]);
  assert.match(new DeskUpdater(fakeAu(() => null)).apply(true).why, /받아 둔 새 판이 없어요/);
});

test("톡톡 보내기 · 재고 오픈 중이면 미룸 (2분마다 다시 봄) → 끝나면 1분 띠 → 설치 · 그동안 [지금 바꾸기]는 까닭", async () => {
  const c = clock(), au = fakeAu(() => "2.28.0");
  let busy = "톡톡 보내는 중";
  const u = new DeskUpdater(au, { now: c.now, tm: c.tm, busy: () => busy });
  await u.check();
  let s = u.status();
  assert.deepStrictEqual([s.state, s.applyAt, s.wait], ["ready", 0, "톡톡 보내는 중"]);
  assert.match(u.apply(true).why, /톡톡 보내는 중 — 끝난 뒤에/);
  await c.go(UPDATE_TIMES.busyRetry * 3);
  assert.strictEqual(au.installs.length, 0, "하는 동안은 안 바꿈");
  busy = "";
  await c.go(UPDATE_TIMES.busyRetry);
  s = u.status();
  assert.deepStrictEqual([s.wait, s.left], ["", 60]);
  // 1분 사이에 다시 바빠지면 그때도 미룸
  busy = "재고 자동 오픈 중";
  await c.go(60e3);
  assert.strictEqual(au.installs.length, 0);
  assert.strictEqual(u.status().wait, "재고 자동 오픈 중");
  busy = "";
  await c.go(UPDATE_TIMES.busyRetry + 60e3);
  assert.strictEqual(au.installs.length, 1);
});

test("받아 둔 뒤 다시 확인해도 띠가 안 사라짐 · 인터넷이 끊기면 '확인 못 함'과 까닭 → 10분 뒤 다시 · 설치 시작 실패는 받아 둔 채로", async () => {
  const c = clock();
  let plan = "error";
  const au = fakeAu(() => plan);
  const u = new DeskUpdater(au, { now: c.now, tm: c.tm }).start();
  await c.go(UPDATE_TIMES.first);
  assert.deepStrictEqual([u.status().state, u.status().error], ["error", "net::ERR_INTERNET_DISCONNECTED"]);
  au.emit("error", new Error("Cannot find latest.yml\nHttpError: 404"));
  assert.strictEqual(u.status().error, "Cannot find latest.yml", "첫 줄만");
  plan = "2.28.0";
  await c.go(UPDATE_TIMES.every);
  assert.strictEqual(u.status().state, "ready");
  u.later();
  plan = null;
  await u.check();
  assert.strictEqual(u.status().state, "ready", "최신이라고 해도 받아 둔 것은 그대로");
  plan = "error";
  await u.check();
  assert.strictEqual(u.status().state, "ready");
  // 설치 시작 실패
  const au2 = fakeAu(() => "2.28.0");
  au2.quitAndInstall = () => { throw new Error("spawn EACCES"); };
  const u2 = new DeskUpdater(au2, { now: c.now, tm: c.tm });
  await u2.check();
  const r = u2.apply(true);
  assert.deepStrictEqual([r.ok, u2.status().state], [false, "ready"]);
  assert.match(r.why, /spawn EACCES/);
});
