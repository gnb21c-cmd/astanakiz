/* 고친 내용 묶음 만들기 (사장님 11/18 — "업뎃해" 하면 설치 파일 없이 고친 내용만 바꿈) · GitHub 이 설치 파일을 만들 때 (.github/workflows/build-win.yml)
   node scripts/make-patch.js shell                     → src/shell.json (껍데기 이름: Electron 큰 판 · boot.js 판 · 꾸러미) — 설치 파일 만들기 전에
   node scripts/make-patch.js bundle <폴더> <태그>       → <폴더>/desk-patch.json (작은 안내) · desk-patch-files.json (묶음)
   묶음 = 설치본에 들어가는 것과 같은 파일: src/** (동작 파일) · desk.html (화면) · manual/*.jpg (설명서 사진)
   판(build) · 커밋(sha)은 src/build.json (workflow 가 먼저 적음) */
"use strict";
const fs = require("fs");
const path = require("path");
const patch = require("../src/patch");

const APP = path.join(__dirname, "..");
const ROOT = path.join(APP, "..", "..");

function shellNow() {
  const pkg = JSON.parse(fs.readFileSync(path.join(APP, "package.json"), "utf8"));
  const electron = JSON.parse(fs.readFileSync(require.resolve("electron/package.json", { paths: [APP] }), "utf8")).version;
  return { shell: patch.shellId({ electron, deps: pkg.dependencies || {} }), electron, boot: patch.BOOT_V };
}
function walk(dir, rel, out) {
  for (const n of fs.readdirSync(dir).sort()) {
    const f = path.join(dir, n), r = rel ? `${rel}/${n}` : n;
    if (fs.statSync(f).isDirectory()) walk(f, r, out);
    else out[r] = fs.readFileSync(f);
  }
  return out;
}
function collect() {
  const files = walk(path.join(APP, "src"), "src", {});
  files["desk.html"] = fs.readFileSync(path.join(ROOT, "prototype", "desk.html"));
  const man = path.join(ROOT, "prototype", "manual");
  if (fs.existsSync(man)) for (const n of fs.readdirSync(man).sort()) if (/\.jpg$/i.test(n)) files[`manual/${n}`] = fs.readFileSync(path.join(man, n));
  return files;
}
function bundle(outDir, tag) {
  const { build, sha = "" } = JSON.parse(fs.readFileSync(path.join(APP, "src", "build.json"), "utf8"));
  const { shell } = JSON.parse(fs.readFileSync(path.join(APP, "src", "shell.json"), "utf8"));
  if (shell !== shellNow().shell) throw new Error(`src/shell.json(${shell})이 지금 껍데기(${shellNow().shell})와 다름 — shell 을 먼저`);
  const { info, text } = patch.makePatch({ build, sha, tag, shell, files: collect() });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, info.files), text);
  fs.writeFileSync(path.join(outDir, "desk-patch.json"), JSON.stringify(info, null, 1) + "\n");
  return info;
}

if (require.main === module) {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === "shell") {
    const s = shellNow();
    fs.writeFileSync(path.join(APP, "src", "shell.json"), JSON.stringify(s) + "\n");
    console.log(`껍데기 ${s.shell} (Electron ${s.electron} · boot ${s.boot})`);
  } else if (cmd === "bundle" && a && b) {
    const info = bundle(a, b);
    console.log(`고친 내용 묶음 ver.${info.build} (${info.tag}) · 파일 ${info.count}개 · ${Math.round(info.size / 1024)}KB · 껍데기 ${info.shell}`);
  } else {
    console.error("쓰는 법: node scripts/make-patch.js shell | bundle <폴더> <태그>");
    process.exit(2);
  }
}
module.exports = { shellNow, collect, bundle };
