/* 시작 파일 (껍데기 · 사장님 11/18) — 고친 내용(patch) 중 쓸 판을 고르고 그 판의 main.js 를 켬
   - 설치한 판보다 새 판을 받아 두었으면(앱 폴더 patch\<판>) 그것을 · 없거나 문제가 있으면 설치한 판
   - 고른 판이 켜지다 바로 멈추면(파일이 깨짐 등) 그 판을 빼고 다시 켬 → 앞 판 · 3번 연속 화면까지 못 켜져도 앞 판 (patch.js pick)
   - 이 파일은 고친 내용으로 바뀌지 않음 (설치한 판의 것만 씀) → 고치면 patch.js 의 BOOT_V 를 올리고 설치 파일로
   시험: DESK_PATCH_TEST(가짜 서버 주소) · DESK_PATCH_SHELL(껍데기 이름) — 설치하지 않은 앱에서도 고친 내용을 씀 */
"use strict";
const path = require("path");
const { app } = require("electron");
const patch = require("./patch");

let shell = "";
let bundled = "개발";
try {
  ({ shell } = require("./shell.json")); // 만들 때 적음 (scripts/make-patch.js) — 설치본에만 있음
} catch (e) {
  shell = process.env.DESK_PATCH_TEST ? process.env.DESK_PATCH_SHELL || "" : "";
}
try {
  ({ build: bundled } = require("./build.json"));
} catch (e) {
  /* 개발 */
}
const boot = (global.__deskBoot = { shell, bundled, dir: "", root: "", build: bundled, why: "" });
if ((app.isPackaged || process.env.DESK_PATCH_TEST) && shell) {
  boot.dir = path.join(app.getPath("userData"), "patch");
  try {
    Object.assign(boot, patch.pick(boot.dir, { bundled, shell }));
  } catch (e) {
    boot.why = `고친 내용 판을 고르지 못해 설치한 판으로: ${(e && e.message) || e}`;
    boot.root = "";
    boot.build = bundled;
  }
}
if (boot.root) {
  // 꾸러미(node_modules)는 껍데기 것을 씀 — patch 폴더의 main.js 에서도 찾게
  const Module = require("module");
  process.env.NODE_PATH = [path.join(__dirname, "..", "node_modules"), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
  Module._initPaths();
  try {
    require(path.join(boot.root, "src", "main.js"));
  } catch (e) {
    // 고친 판이 켜지다 멈춤 → 그 판을 빼고 다시 켬 (앞 판 또는 설치한 판으로)
    try {
      patch.markBad(boot.dir, boot.build);
      const d = new Date(), p2 = (n) => String(n).padStart(2, "0"); // update-log 와 같은 모양 (2026-11-18 10:30)
      const at = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
      require("fs").appendFileSync(path.join(app.getPath("userData"), "update-log.txt"), `${at} ver.${boot.build} 이 켜지다 멈춰 앞 판으로 다시 켬: ${String((e && e.message) || e).replace(/\s+/g, " ").slice(0, 200)}\n`);
    } catch (e2) {
      /* 기록 실패는 무시 */
    }
    if (!process.env.DESK_PATCH_TEST) app.relaunch(); // 시험은 다시 켜지 않고 끝냄 (시험이 다시 켬)
    app.exit(1);
  }
} else {
  require("./main.js");
}
