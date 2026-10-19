/* 네이버 연동 시험: 캡처를 본뜬 가짜 예약현황 화면(mock/naver.html)에서
   하루 예약 읽기(입장권만, 완료 n · 취소 n 포함) · 날짜 이동 · 이용완료 처리를 해 본다 */
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { NaverSync } = require("../src/naver-sync");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  ({ chromium } = require("/opt/node-tools/node_modules/playwright"));
}
const MOCK = "file://" + path.join(__dirname, "..", "mock", "naver.html");

async function open(query = "", extra = "") {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage();
  await page.goto(MOCK + query);
  await page.evaluate(() => localStorage.clear());
  await page.goto(MOCK + query);
  return { browser, page, sync: new NaverSync((code) => page.evaluate(code), { urls: { list: MOCK + "?view=list" + extra, calendar: MOCK + "?view=calendar" + extra } }) };
}

test("하루 예약 읽기: 예약 목록 + 예약현황 카드 (입장권만, 취소 뺌, 완료 n · 취소 n)", async () => {
  const { browser, sync } = await open();
  try {
    const r = await sync.loadDay("2026-10-05");
    assert.ok(r.ok, r.why);
    const by = Object.fromEntries(r.bookings.map((b) => [b.no, b]));
    assert.strictEqual(r.bookings.length, 8, "입장권만 · 취소 뺌 (대리예약 · 입금대기 포함)");
    assert.ok(!r.bookings.some((b) => /단체/.test(b.product) || b.status === "취소"));
    const h = by["1368155282"];
    assert.deepStrictEqual(
      { name: h.name, phone: h.phone, time: h.time, qty: h.qty, status: h.status, done: h.doneCount, cancel: h.cancelCount, pay: h.pay },
      { name: "허정은", phone: "010-4674-0736", time: "14:00", qty: 1, status: "확정", done: 8, cancel: 2, pay: "결제완료" },
    );
    assert.strictEqual(by["1368177001"].qty, 2);
    assert.strictEqual(by["1368177001"].doneCount, 9, "목록 아래(세 번째 카드)도 내려서 읽음");
    assert.strictEqual(by["1367156204"].status, "완료");
    assert.strictEqual(by["1367156204"].doneCount, 11, "이용완료 손님은 완료 n 에 이번 방문이 들어 있음");
    assert.strictEqual(by["1370988026"].time, "18:00");
    assert.strictEqual(by["1370988026"].doneCount, 0, "1건인 칸은 상세정보가 바로 뜸 · 처음 온 손님은 '신규예약' → 0");
    assert.strictEqual(by["1370988026"].name, "홍길동");
    // 완료 실적 없이 취소만 있는 손님: '신규예약'도 '완료 n'도 없이 "취소 n"만 → 완료 0 (확인 중으로 남지 않게, 사용자 지시 10/8)
    assert.deepStrictEqual([by["1368102888"].doneCount, by["1368102888"].cancelCount], [0, 3], "목록 카드 '취소 3'");
    assert.deepStrictEqual([by["1373000111"].doneCount, by["1373000111"].cancelCount], [0, 2], "상세정보 '취소 2 >'");
    assert.strictEqual(by["1370988026"].phone, "010-1111-2222");
    const s14 = r.slots.find((s) => s.time === "14:00" && /1시간 50분/.test(s.product));
    assert.deepStrictEqual({ cap: s14.cap, conf: s14.conf }, { cap: 10, conf: 4 });
    assert.ok(!r.slots.some((s) => /단체/.test(s.product)), "단체 칸 뺌");
  } finally {
    await browser.close();
  }
});

test("날짜 이동: 다른 날로 갔다가 돌아옴 · 두 번째 읽기는 카드를 다시 열지 않음", async () => {
  const { browser, sync } = await open();
  try {
    let r = await sync.loadDay("2026-10-07");
    assert.ok(r.ok, r.why);
    assert.strictEqual(r.bookings.length, 0);
    r = await sync.loadDay("2026-10-05");
    assert.strictEqual(r.bookings.length, 8);
    const t0 = Date.now();
    r = await sync.loadDay("2026-10-05");
    assert.ok(r.ok);
    assert.strictEqual(r.bookings.find((b) => b.no === "1368155282").doneCount, 8, "기억한 값");
  } finally {
    await browser.close();
  }
});

test("이용완료: 카드의 [이용완료] → 확인 → 완료로 바뀜, 완료 수 +1", async () => {
  const { browser, sync } = await open();
  try {
    const r = await sync.complete({ day: "2026-10-05", no: "1368155282", time: "14:00", product: "평일 무제한 / 휴일 1시간 50분 입장권" });
    assert.ok(r.ok, r.why);
    const d = await sync.loadDay("2026-10-05");
    const b = d.bookings.find((x) => x.no === "1368155282");
    assert.strictEqual(b.status, "완료");
    assert.strictEqual(b.doneCount, 9, "완료 수 +1 (다시 읽어 확인)");
  } finally {
    await browser.close();
  }
});

test("목록 아래쪽 카드도 내려서 이용완료 · 칸이 좁아 오전·오후가 없어도 시각을 맞게 읽음 (1:00 = 13:00)", async () => {
  const { browser, sync } = await open("?view=calendar&compact=1", "&compact=1");
  try {
    const d0 = await sync.loadDay("2026-10-05");
    assert.ok(d0.ok, d0.why);
    assert.ok(d0.slots.some((s) => s.time === "14:00" && s.conf === 4), "2:00 → 14:00");
    assert.ok(d0.slots.some((s) => s.time === "19:30"), "7:30 → 19:30");
    assert.ok(d0.slots.some((s) => s.time === "12:00") && d0.slots.some((s) => s.time === "10:00"));
    // 송다온은 14:00 목록의 세 번째 카드 (처음엔 안 보이고 내려야 나옴)
    const r = await sync.complete({ day: "2026-10-05", no: "1368177001", time: "14:00", product: "평일 무제한 / 휴일 1시간 50분 입장권" });
    assert.ok(r.ok, r.why);
    const d = await sync.loadDay("2026-10-05");
    assert.strictEqual(d.bookings.find((x) => x.no === "1368177001").status, "완료");
  } finally {
    await browser.close();
  }
});

test("예약현황이 '일간'이 아니라 기간으로 보이면 날짜를 왔다갔다 하지 않고 바로 알려 줌", async () => {
  const { browser, sync } = await open("?view=calendar&range=1", "&range=1");
  try {
    const r = await sync.loadDay("2026-10-05");
    assert.strictEqual(r.ok, false);
    assert.match(r.why, /일간/);
  } finally {
    await browser.close();
  }
});

test("칸을 눌러도 카드가 안 나오면 못 읽은 칸을 알려 주고, 진행 단계를 알림", async () => {
  const { browser, page } = await open("?view=calendar&nocards=1");
  try {
    const steps = [];
    const sync = new NaverSync((code) => page.evaluate(code), { urls: { list: MOCK + "?view=list&nocards=1", calendar: MOCK + "?view=calendar&nocards=1" }, timeout: 3000, onStep: (m) => steps.push(m) });
    const r = await sync.loadDay("2026-10-05");
    assert.ok(r.ok, r.why);
    assert.match(r.warn, /14:00 확정/);
    assert.ok(steps.some((m) => /14:00 확정 칸 여는 중/.test(m)), steps.join(" / "));
    assert.ok(steps.some((m) => /카드 0장/.test(m)));
  } finally {
    await browser.close();
  }
});

test("예약이 1건인 칸: 상세정보의 [이용완료] → 확인 → 완료 (탭이 없어도)", async () => {
  const { browser, sync } = await open();
  try {
    const r = await sync.complete({ day: "2026-10-05", no: "1370988026", time: "18:00", product: "야간자유 입장권" });
    assert.ok(r.ok, r.why);
    const d = await sync.loadDay("2026-10-05");
    const b = d.bookings.find((x) => x.no === "1370988026");
    assert.strictEqual(b.status, "완료");
    assert.strictEqual(b.doneCount, 1);
  } finally {
    await browser.close();
  }
});

test("로그인이 풀린 화면이면 로그인하라고 알려 줌", async () => {
  const { browser, sync } = await open("?login=need");
  try {
    const r = await sync.loadDay("2026-10-05");
    assert.strictEqual(r.ok, false);
    assert.match(r.why, /로그인/);
    assert.match(r.why, /로그인 상태 유지/, "다시 풀리지 않게 안내");
  } finally {
    await browser.close();
  }
});

test("지난 방문 기록 읽기(사장님 10/19): 그날 [이용완료] 칸만 열어 입장권 이용완료 손님만 · 기억 안 남김 · 열흘 전 날짜로 갔다가 돌아옴", async () => {
  const { browser, page, sync } = await open();
  try {
    // 열흘 전(9/25) 이용완료 2건(같은 손님 두 시간 칸) · 확정 1건 · 단체 완료 1건
    await page.evaluate(() => {
      const d0 = JSON.parse(localStorage.getItem("mockNaver3") || "null") || JSON.parse(JSON.stringify(db)); // 가짜 화면의 10/5 예약은 그대로 두고 더함
      d0["2026-09-25"] = [
        { no: "9001", name: "김지난", phone: "010-1234-0001", time: "10:00", product: 0, qty: 1, status: "완료", done: 3, cancel: 0 },
        { no: "9002", name: "김지난", phone: "010-1234-0001", time: "12:00", product: 0, qty: 1, status: "완료", done: 4, cancel: 0 },
        { no: "9003", name: "박확정", phone: "010-1234-0002", time: "12:00", product: 0, qty: 1, status: "확정", done: 1, cancel: 0 },
        { no: "9004", name: "단체", phone: "010-1234-0003", time: "10:00", product: 2, qty: 1, status: "완료", done: 0, cancel: 0 },
      ];
      localStorage.setItem("mockNaver3", JSON.stringify(d0));
    });
    const r = await sync.loadDone("2026-10-05");
    assert.ok(r.ok, r.why);
    assert.deepStrictEqual(r.visits.map((v) => [v.no, v.name, v.phone]).sort(), [["1367156204", "송나라", "010-6687-3285"], ["1368411002", "엄효정", "010-5358-6288"]], "10/5: 이용완료 입장권만 (확정 · 단체 · 취소 뺌)");
    assert.strictEqual(sync.days.size, 0, "기억(days)에 안 남김 — 200일을 읽어도 메모리가 늘지 않게");
    const old = await sync.loadDone("2026-09-25");
    assert.ok(old.ok, old.why);
    assert.deepStrictEqual(old.visits.map((v) => v.no).sort(), ["9001", "9002"]);
    assert.strictEqual(old.cells, 2, "이용완료가 있는 입장권 칸만 엶");
    const back = await sync.loadDay("2026-10-05");
    assert.ok(back.ok, "지난 날 읽은 뒤 오늘로 돌아옴: " + back.why);
  } finally {
    await browser.close();
  }
});

test("날짜 이동 한도: 처음 본 날짜에서 떨어진 날 수만큼 (+10) — 62일 전(예전 한도 60 넘음)도 하루씩 가서 맞춤 · 하루씩 안 움직이면 멈춤", async () => {
  // 가짜 화면: 바로 반응하는 예약현황 (진짜 화면 이동 없이 한도만 봄)
  const st = { date: "2026-10-05" };
  const shift = (k, n) => { const d = new Date(k + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  let steps = 0;
  const exec = async (code) => {
    const m = /stepDate\((-?\d+)\)/.exec(code);
    if (m) { steps++; st.date = shift(st.date, Number(m[1])); return { ok: true }; }
    return { page: "calendar", date: st.date, slots: [], cards: [] };
  };
  const sync = new NaverSync(exec, { timeout: 3000 });
  const r = await sync.goDate("2026-08-04");
  assert.ok(r.ok, r.why);
  assert.strictEqual(steps, 62);
  assert.strictEqual(st.date, "2026-08-04");
});
