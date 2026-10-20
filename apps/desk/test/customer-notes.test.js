/* 고객 메모 (사장님 10/20) — 이 PC 에만 두는 손님별 메모(2줄) · 3자녀가정 · 블랙컨슈머
   - 손님은 전화번호를 비밀값과 섞은 해시로만 (파일에 전화번호 · 이름 없음)
   - 메모 · 표시가 모두 비면 그 손님 줄을 지움 · 저장 때마다 앞 파일을 bak 으로 · 깨지면 bak 에서 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const N = require("../src/customer-notes");
const { hashKey } = require("../src/visit-history");

test("메모: 2줄까지 · 길이 · 빈칸 정리", () => {
  assert.strictEqual(N.cleanMemo("  아이 셋  \n엄마가 예민\n세 번째 줄 "), "아이 셋\n엄마가 예민");
  assert.strictEqual(N.cleanMemo("가".repeat(500)).length, N.MEMO_MAX);
  assert.strictEqual(N.cleanMemo(null), "");
});

test("쓰기 · 지우기 · 저장 · 다시 읽기 (해시만) · 깨지면 bak 에서 · 둘 다 깨지면 새로", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cn-"));
  let d = N.load(dir);
  assert.deepStrictEqual(d, { v: 1, notes: {} });
  const k = hashKey("salt", "01031346005");
  assert.deepStrictEqual(N.set(d, k, { m: "생일 파티 문의", k3: true }, "2026-10-20 11:52:31"), { m: "생일 파티 문의", k3: true, bl: false, at: "2026-10-20 11:52" });
  N.save(dir, d);
  assert.deepStrictEqual(N.load(dir), d);
  const text = fs.readFileSync(path.join(dir, N.FILE), "utf8");
  assert.ok(!/010|6005|김예나/.test(text), "파일에 전화번호 · 이름 없음");
  // 두 번째 저장 → 앞 것이 bak
  N.set(d, k, { m: "생일 파티 문의", k3: true, bl: true }, "2026-10-20 12:00");
  N.save(dir, d);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, N.BAK), "utf8")).notes[k].bl, false, "bak = 바로 앞");
  // 깨짐 → bak 에서 (지우지 않고 옆에)
  fs.writeFileSync(path.join(dir, N.FILE), "{깨짐");
  assert.strictEqual(N.get(N.load(dir), k).m, "생일 파티 문의");
  assert.ok(fs.readdirSync(dir).some((f) => /^customer-notes\.broken-/.test(f)));
  // 다 비우면 줄을 지움
  d = N.load(dir);
  assert.strictEqual(N.set(d, k, { m: " ", k3: false, bl: false }, "x"), null);
  assert.strictEqual(N.get(d, k), null);
  // 둘 다 깨짐 → 새로
  fs.writeFileSync(path.join(dir, N.FILE), "x"); fs.writeFileSync(path.join(dir, N.BAK), "y");
  assert.deepStrictEqual(N.load(dir), { v: 1, notes: {} });
});
