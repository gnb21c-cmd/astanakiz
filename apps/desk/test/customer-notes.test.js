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
  assert.deepStrictEqual(N.set(d, k, { m: "생일 파티 문의", k3: true }, "2026-10-20 11:52:31"), { m: "생일 파티 문의", k3: true, bc: 0, bl: false, at: "2026-10-20 11:52" });
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

test("BC 원아웃 · 투아웃 · 쓰리아웃 · 마일리지 SKIP (사장님 10/26): 단계 0 ~ 3 · 예전 bl = 원아웃 · BC · SKIP 손님만 이름 · 뒷 4자리 (전체 번호 없음) · 목록 쓰리아웃부터 · 같은 단계는 가나다 순 · 목록에서 바꾸기 · 다 풀면 지움", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cn-"));
  const d = N.load(dir);
  const a = hashKey("salt", "01011112222"), b = hashKey("salt", "01033334444"), c = hashKey("salt", "01055556666");
  assert.strictEqual(N.bcOf({ bl: true }), 1, "예전 블랙컨슈머 체크 = 원아웃");
  assert.deepStrictEqual(N.get({ notes: { [a]: { m: "x", bl: true } } }, a), { m: "x", bl: true, bc: 1 });
  N.set(d, a, { m: "", bc: 3, nm: "가나다", p4: "01011112222" }, "2026-10-26 10:00");
  N.set(d, b, { m: "메모", k3: true, bc: 1, nm: "라마바", p4: "4444" }, "2026-10-26 11:00");
  N.set(d, c, { m: "", sk: [10, 10, 0, 20], nm: "사아자", p4: "6666" }, "2026-10-26 12:00");
  assert.deepStrictEqual(N.get(d, a), { m: "", k3: false, bc: 3, bl: true, at: "2026-10-26 10:00", nm: "가나다", p4: "2222", bcAt: "2026-10-26" }, "뒷 4자리만");
  assert.deepStrictEqual(N.get(d, c).sk, [10, 20], "SKIP 회차: 겹침 · 0 은 빼고 작은 순");
  assert.deepStrictEqual(N.list(d).map((x) => [x.nm, x.bc, x.sk]), [["가나다", 3, []], ["라마바", 1, []], ["사아자", 0, [10, 20]]], "쓰리아웃부터 · 그다음 SKIP 만 있는 손님");
  // 같은 단계 안에서는 이름 가나다 순 (사장님 10/26) — 나중에 표시한 '타파하'도 '라마바' 뒤
  const e = hashKey("salt", "01077778888");
  N.set(d, e, { m: "", bc: 1, nm: "타파하", p4: "8888" }, "2026-10-28 09:00");
  assert.deepStrictEqual(N.list(d).map((x) => x.nm), ["가나다", "라마바", "타파하", "사아자"]);
  assert.strictEqual(N.set(d, e, { m: "", bc: 0 }, "2026-10-28 09:01"), null);
  // 메모 · 3자녀만 있는 손님은 이름 · 번호를 안 둠
  N.set(d, b, { m: "메모", k3: true, bc: 0 }, "2026-10-26 13:00");
  assert.deepStrictEqual(Object.keys(N.get(d, b)).sort(), ["at", "bc", "bl", "k3", "m"], "BC 를 풀면 이름 · 번호도 지움");
  // 목록에서 단계 · SKIP 바꾸기
  assert.strictEqual(N.patch(d, a, { bc: 2 }, "2026-10-27 09:00").bc, 2);
  assert.strictEqual(N.get(d, a).bcAt, "2026-10-27", "단계를 바꾼 날");
  assert.deepStrictEqual(N.patch(d, c, { sk: [20] }, "x").sk, [20]);
  assert.strictEqual(N.patch(d, c, { sk: [] }, "x"), null, "다 풀면 지움");
  assert.strictEqual(N.patch(d, "nothex", { bc: 1 }, "x"), null);
  N.save(dir, d);
  const text = fs.readFileSync(path.join(dir, N.FILE), "utf8");
  assert.ok(!/01011112222|1111/.test(text), "파일에 전체 전화번호 없음");
});

test("BC 투아웃 양식 (사장님 10/27): p2 = 투아웃 뒤 1번 양식을 낸 때 — 투아웃 · 쓰리아웃 동안 남김 · 원아웃 이하로 내리면 지움 (다시 투아웃이면 1번부터)", () => {
  const d = { v: 1, notes: {} }, a = hashKey("salt", "01011112222");
  N.set(d, a, { m: "", bc: 2, nm: "가나다", p4: "2222" }, "2026-10-27 10:00");
  assert.strictEqual(N.get(d, a).p2, undefined, "처음엔 없음 → 1번");
  N.set(d, a, { m: "", bc: 2, p2: "2026-10-27 10:05" }, "2026-10-27 10:05");
  assert.strictEqual(N.get(d, a).p2, "2026-10-27 10:05");
  N.set(d, a, { m: "메모", bc: 3, r3: "시험" }, "2026-10-28 11:00");
  assert.strictEqual(N.get(d, a).p2, "2026-10-27 10:05", "안 넘기면 그대로 · 쓰리아웃도 투아웃 대응이라 남김");
  N.patch(d, a, { bc: 1 }, "2026-10-29 09:00");
  assert.strictEqual(N.get(d, a).p2, undefined, "원아웃으로 내리면 지움");
  N.set(d, a, { m: "", bc: 0, p2: "x" }, "2026-10-29 09:01");
  assert.strictEqual(N.get(d, a), null, "BC 를 풀면 p2 도 없음");
});
