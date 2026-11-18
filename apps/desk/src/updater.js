/* 새 판 바꾸기 규칙 — "업뎃해" 하실 때만 · 고친 내용만 (사장님 11/16 · 11/18)
   - 새 판은 사장님이 "업뎃해" 하실 때만 나감 → 앱은 켜고 1분 뒤 · 그 뒤 10분마다 '나왔나' 보기만 함 (보기만으로는 아무것도 안 바뀜)
   - 새 판이면 고친 내용 묶음을 뒤에서 받음 (patch.js · 약 2MB) — 예전(ver.2.27 ~ 2.29)처럼 설치 파일로 지웠다가 다시 설치하지 않음
   - 다 받으면 데스크 위 띠: '새 판 ver.X — 1분 뒤 바꿔요 [지금 바꾸기] [30분 뒤에]' → 아무도 안 누르면 1분 뒤 데스크만 다시 켬 (몇 초)
   - 톡톡 보내기 · 재고 자동 오픈처럼 하는 일이 있으면 끝날 때까지 미룸 (2분마다 다시 봄) · 근무자가 프로그램을 끄면 다음에 켤 때 새 판
   - 받는 곳은 공개 저장소 Releases 뿐 · 아무것도 보내지 않음 · 손님 정보 · 설정(사용자 폴더)은 그대로
   au = patch.js 의 PatchUpdater (electron-updater 의 autoUpdater 와 같은 모양 · 가짜도 됨 — 시험) */
"use strict";
const EventEmitter = require("events");

const UPDATE_TIMES = { first: 60e3, every: 10 * 60e3, countdown: 60e3, later: 30 * 60e3, busyRetry: 2 * 60e3 };
const ver = (i) => String((i && i.version) || "");
const short = (v) => String(v || "").replace(/\.0$/, ""); // 2.27.0 → 2.27 (화면에 쓰는 모양)
const errText = (e) => String((e && e.message) || e || "").split("\n")[0].slice(0, 200);

class DeskUpdater extends EventEmitter {
  /** busy() = 지금 하는 일 이름 (없으면 "") · now() · tm = { setTimeout, clearTimeout } · current = 지금 판 (2.27.0) */
  constructor(au, { busy = () => "", now = () => Date.now(), tm = { setTimeout, clearTimeout }, current = "", times = {} } = {}) {
    super();
    this.au = au;
    this.busy = busy;
    this.now = now;
    this.tm = tm;
    this.t = Object.assign({}, UPDATE_TIMES, times);
    // state: idle(아직) · checking · latest(최신) · downloading · ready(받음) · applying(바꾸는 중) · error
    this.s = { state: "idle", current: short(current), version: "", percent: 0, checkedAt: 0, readyAt: 0, applyAt: 0, laterUntil: 0, wait: "", error: "" };
    this.timer = null;
    this.applyTimer = null;
    const keep = (st) => (this.s.state === "ready" || this.s.state === "applying" ? this.s.state : st); // 받아 둔 뒤에는 확인 결과로 띠가 사라지지 않게
    au.on("checking-for-update", () => this.set({ state: keep("checking"), error: "" }));
    au.on("update-not-available", () => this.set({ state: keep("latest"), checkedAt: this.now() }));
    au.on("update-available", (i) => this.set({ state: keep("downloading"), version: this.s.state === "ready" ? this.s.version : short(ver(i)), percent: 0, checkedAt: this.now() }));
    au.on("download-progress", (p) => { if (this.s.state === "downloading") this.set({ percent: Math.floor((p && p.percent) || 0) }); });
    au.on("update-downloaded", (i) => {
      if (this.s.state === "ready" || this.s.state === "applying") return;
      this.set({ state: "ready", version: short(ver(i)) || this.s.version, percent: 100, readyAt: this.now() });
      this.arm();
    });
    au.on("error", (e) => this.set({ state: keep("error"), error: errText(e), checkedAt: this.now() }));
  }
  set(p) {
    Object.assign(this.s, p);
    this.emit("state", this.status());
  }
  status() {
    return Object.assign({}, this.s, { left: this.s.applyAt ? Math.max(0, Math.ceil((this.s.applyAt - this.now()) / 1000)) : 0 });
  }
  /** 켜고 1분 뒤 처음 확인 · 그 뒤 10분마다 */
  start() {
    this.loop(this.t.first);
    return this;
  }
  loop(ms) {
    this.tm.clearTimeout(this.timer);
    this.timer = this.tm.setTimeout(() => {
      this.check();
      this.loop(this.t.every);
    }, ms);
  }
  async check() {
    if (this.s.state === "downloading" || this.s.state === "applying") return this.status();
    try {
      await this.au.checkForUpdates();
    } catch (e) {
      this.set({ state: this.s.state === "ready" ? "ready" : "error", error: errText(e), checkedAt: this.now() });
    }
    return this.status();
  }
  /** 다 받으면: 1분 띠 → 바꾸기 · 하는 일이 있으면 끝날 때까지 (2분마다 다시 봄) */
  arm(ms = this.t.countdown) {
    this.tm.clearTimeout(this.applyTimer);
    const b = this.busy();
    if (b) {
      this.set({ applyAt: 0, wait: b });
      this.applyTimer = this.tm.setTimeout(() => this.arm(), this.t.busyRetry);
      return;
    }
    this.set({ applyAt: this.now() + ms, wait: "", laterUntil: 0 });
    this.applyTimer = this.tm.setTimeout(() => this.apply(false), ms);
  }
  /** [30분 뒤에] */
  later() {
    if (this.s.state !== "ready") return this.status();
    this.tm.clearTimeout(this.applyTimer);
    this.set({ applyAt: 0, laterUntil: this.now() + this.t.later, wait: "" });
    this.applyTimer = this.tm.setTimeout(() => this.arm(), this.t.later);
    return this.status();
  }
  /** 바꾸기 — manual = [지금 바꾸기] (하는 일이 있으면 안 함 · 까닭) · 1분이 다 되면 저절로 */
  apply(manual) {
    if (this.s.state !== "ready") return { ok: false, why: "받아 둔 새 판이 없어요" };
    const b = this.busy();
    if (b) {
      if (!manual) this.arm();
      return { ok: false, why: `${b} — 끝난 뒤에 바꿔요` };
    }
    this.tm.clearTimeout(this.applyTimer);
    this.tm.clearTimeout(this.timer);
    this.set({ state: "applying", applyAt: 0 });
    this.emit("apply", this.s.version);
    try {
      this.au.quitAndInstall(true, true); // 데스크만 다시 켬 (patch.js · 설치 없음)
    } catch (e) {
      this.set({ state: "ready", error: errText(e) });
      return { ok: false, why: `바꾸기를 시작하지 못함: ${errText(e)}` };
    }
    return { ok: true };
  }
  stop() {
    this.tm.clearTimeout(this.timer);
    this.tm.clearTimeout(this.applyTimer);
  }
}

module.exports = { DeskUpdater, UPDATE_TIMES, short };
