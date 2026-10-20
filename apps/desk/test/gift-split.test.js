/* 10회 사은권 — 같은 날 여러 건 예약 (사장님 10/20: 지난주 금요일 19:00 '완료 8' 손님이 1장 + 1장 나눠 예약 → 함께 입장하면 10번째인데 표시가 없었음)
   - 입장 전 카드 · 예약자 창: 그날 이 손님 예약 중 먼저 이용완료될 미입장 예약까지 세어 '완료 8 → 9 · 10번 완료 예정 · 2만원 사은권 증정'
     · 같은 시간 나눠 한 예약(함께 입장) · 연속예약(첫 예약에서 함께) · 따로 입장할 앞 예약(오늘 앞 예약 포함)
   - 입장할 때: 함께 이용완료한 예약 중 10번째가 있으면 알림(오래 보임) · 입장권 사은권 줄 · 입장 뒤 카드 '9 · 10번째 예약완료 · 사은권'
   - 따로 입장하는 앞 예약이 그 시간(1시간 50분)이 다 지나도록 안 오면 세지 않음 · 입장할 때는 이미 이용완료한 것만 셈 */
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  ({ chromium } = require("/opt/node-tools/node_modules/playwright"));
}
const DESK = "file://" + path.join(__dirname, "..", "..", "..", "prototype", "desk.html");
const launch = () => chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const TODAY = "2026-10-05"; // 체험판 오늘 13:50
const sp = (t) => String(t).replace(/\s+/g, " ").trim();

async function open(browser) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(DESK);
  return { page, errs };
}
const add = (page, time, name, phone, prevDone, n = 1) => page.evaluate(([d, t, nm, ph, pd, k]) => { const ids = []; for (let i = 0; i < k; i++) ids.push(window.__deskTest.addBooking(d, t, nm, ph, 1, { prevDone: pd })); window.__deskTest.setNow(13 * 60 + 50); return ids; }, [TODAY, time, name, phone, prevDone, n]);
const slot = (page, t) => page.click(`.slot[data-s="${Number(t.slice(0, 2)) * 60 + Number(t.slice(3))}"]`);
const cards = async (page, name) => (await page.$$eval(".res", (els, n) => els.filter((e) => e.querySelector(".name").textContent.includes(n)).map((e) => e.querySelector(".visits").textContent), name)).map(sp);
async function enter(page, name) {
  await page.click(`.res:not(.done):has-text("${name}") >> nth=0`);
  for (let i = 0; i < 8 && !(await page.$("#enter-done:not([disabled])")); i++) await page.click(".kpick button:not([disabled]):not(.on) >> nth=0");
  await page.click("#enter-done");
}
const ticket = (page, name) => page.evaluate((n) => { const T = window.__deskTest, h = T.holders().find((x) => x.name === n); return T.receiptLines(T.form(), T.keyVals(h)).map((l) => l.t.trim()).filter(Boolean); }, name);

test("같은 시간 1장 + 1장 (완료 8): 입장 전 대표 카드 · 예약자 창 '9 · 10번 완료 예정 · 사은권' · 둘째 카드 '10번' · 입장하면 알림 · 입장권 · 입장 뒤 카드", async () => {
  const browser = await launch();
  try {
    const { page, errs } = await open(browser);
    await add(page, "19:00", "나눠서", "010-5555-0008", 8, 2);
    await slot(page, "19:00");
    const [head, second] = await cards(page, "나눠서");
    assert.match(head, /완료 8 → 9 · 10번 완료 예정 · 함께 2건 2만원 사은권 증정/, "대표 카드: " + head);
    assert.match(second, /완료 8 → 10번 완료 예정 2만원 사은권 증정/, "둘째 카드: " + second);
    await page.click(`.res:not(.done):has-text("나눠서") >> nth=0`);
    assert.match(sp(await page.textContent("#sheet .facts .visits")), /9 · 10번 완료 예정 · 함께 2건 2만원 사은권 증정/, "예약자 창");
    await page.click("#sheet [data-act=close] >> nth=0");
    await enter(page, "나눠서"); // 일찍 입장 (체험판 13:50 — 18:58 엔 골든벨 창이 떠서)
    assert.match(await page.textContent("#toast"), /10번째 예약완료, 2만원 사은권을 드리세요/);
    await page.waitForTimeout(3000);
    assert.ok(await page.isVisible("#toast"), "사은권 알림은 오래 (3초 뒤에도 보임)");
    assert.ok((await ticket(page, "나눠서")).some((l) => /사은권/.test(l)), "입장권에 사은권 줄");
    const after = await cards(page, "나눠서");
    assert.ok(after.some((t) => /9 · 10번째 예약완료 2만원 사은권 증정/.test(t)), "입장 뒤 대표 카드: " + after.join(" | "));
    assert.ok(after.some((t) => /^10번째 예약완료 2만원 사은권 증정/.test(t)), "입장 뒤 둘째 카드");
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("연속예약 (완료 8 · 15:00 + 16:30): 첫 예약 '9 · 10번 · 사은권' · 뒤 예약 '10번 · 사은권' · 사은권이 없는 횟수는 표시 없음 · 셋으로 나눠 20번째", async () => {
  const browser = await launch();
  try {
    const { page, errs } = await open(browser);
    await add(page, "15:00", "이어서", "010-5555-0018", 8);
    await add(page, "16:30", "이어서", "010-5555-0018", 8);
    await slot(page, "15:00");
    assert.match((await cards(page, "이어서"))[0], /완료 8 → 9 · 10번 완료 예정 · 함께 2건 2만원 사은권 증정/);
    await slot(page, "16:30");
    assert.match((await cards(page, "이어서"))[0], /완료 8 → 10번 완료 예정 2만원 사은권 증정/);
    // 사은권 없는 횟수: 완료 3 · 둘로 나눔 → 4 · 5번 (사은권 없음)
    await add(page, "17:00", "보통", "010-5555-0003", 3, 2);
    await slot(page, "17:00");
    const [h3, s3] = await cards(page, "보통");
    assert.match(h3, /완료 3 → 4 · 5번 완료 예정 · 함께 2건$/);
    assert.doesNotMatch(h3 + s3, /사은권/);
    // 셋으로 나눔: 완료 18 → 19 · 20 · 21 (20번째)
    await add(page, "17:30", "셋으로", "010-5555-0019", 18, 3);
    await slot(page, "17:30");
    assert.match((await cards(page, "셋으로"))[0], /완료 18 → 19 ~ 21번 완료 예정 · 함께 3건 2만원 사은권 증정/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

test("따로 입장하는 앞 예약 (완료 8 · 14:00 + 17:00): 뒤 예약 '10번 · 사은권 (오늘 앞 예약 포함)' · 앞 예약 입장 뒤 '완료 9 → 10번' · 뒤 입장 알림 · 앞 예약 시간이 지나도록 안 오면 세지 않음", async () => {
  const browser = await launch();
  try {
    const { page, errs } = await open(browser);
    await add(page, "14:00", "따로온", "010-5555-0028", 8);
    await add(page, "17:00", "따로온", "010-5555-0028", 8);
    await slot(page, "17:00");
    assert.match((await cards(page, "따로온"))[0], /완료 8 → 10번 완료 예정 2만원 사은권 증정 \(오늘 앞 예약 1건 포함\)/);
    await slot(page, "14:00");
    assert.match((await cards(page, "따로온"))[0], /완료 8 → 9번 완료 예정$/, "앞 예약은 9번 (사은권 없음)");
    await enter(page, "따로온");
    await slot(page, "17:00");
    assert.match((await cards(page, "따로온"))[0], /완료 9 → 10번 완료 예정 2만원 사은권 증정$/, "앞 예약이 이용완료되면 실제 완료 9");
    await page.evaluate(() => window.__deskTest.setNow(16 * 60 + 58));
    await enter(page, "따로온");
    assert.match(await page.textContent("#toast"), /10번째 예약완료, 2만원 사은권을 드리세요/);

    // 앞 예약이 안 옴: 14:00 예약 시간(1시간 50분)이 다 지나도록 미입장 → 17:00 카드는 실제 횟수(9번) · 입장해도 사은권 없음
    await add(page, "14:00", "안온앞", "010-5555-0038", 8);
    await add(page, "17:00", "안온앞", "010-5555-0038", 8);
    await slot(page, "17:00");
    assert.match((await cards(page, "안온앞"))[0], /\(오늘 앞 예약 1건 포함\)/, "13:50 — 앞 예약은 아직 올 수 있음");
    await page.evaluate(() => window.__deskTest.setNow(16 * 60 + 58));
    assert.match((await cards(page, "안온앞"))[0], /^완료 8( · 취소 \d+)? → 9번 완료 예정$/, "앞 예약 시간이 지남 (15:50) → 세지 않음");
    await enter(page, "안온앞");
    const t = await page.textContent("#toast");
    assert.doesNotMatch(t, /사은권/, "입장할 때는 이용완료한 것만: " + t);
    assert.match((await cards(page, "안온앞"))[0], /^9번째 예약완료$/);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});

/* 입장한 뒤 생긴 추가 예약 (사장님 10/20): 이용완료하면 10번째면 알림에 '2만원 사은권 — 손님께 연락해 전달' · 확인 뒤 '사은권 전달 전'이 [사은권 전달함]을 누를 때까지
   열쇠 창 · 열쇠판 칸 · 예약 카드에 남고, 전달 전에 반납(퇴장)하려 하면 먼저 물음 · 10번째가 아니면 예전 그대로 */
test("추가 예약이 10번째: 알림에 사은권 · 연락처 → 확인 뒤 '사은권 전달 전' (열쇠 창 · 열쇠판 · 카드) → 반납 전에 물음 → [사은권 전달함] · 아니면 예전 그대로", async () => {
  const browser = await launch();
  try {
    const { page, errs } = await open(browser);
    await add(page, "14:00", "더하기", "010-5555-0048", 8);
    await slot(page, "14:00");
    await enter(page, "더하기"); // 9번째
    const h = await page.evaluate(() => window.__deskTest.holders().find((x) => x.name === "더하기"));
    // 이용 중에 16:00 (딱 2시간 뒤)을 또 예약 → 네이버를 불러오면 추가 예약 알림
    await add(page, "16:00", "더하기", "010-5555-0048", 9);
    await page.evaluate(() => window.__deskTest.extScan());
    await page.waitForSelector(".extbox");
    const box = sp(await page.textContent(".extbox"));
    assert.match(box, /이 예약을 이용완료하면 10번째 예약완료 — 2만원 사은권을 드려야 해요/, box);
    assert.match(box, /손님은 이용 중 — 010-5555-0048 로 연락해 전달하세요/);
    await page.click("[data-act=extOk]");
    assert.match(await page.textContent("#toast"), /10번째 예약완료 — 2만원 사은권을 드려야 해요/);
    // 열쇠 창이 닫히지 않고 '사은권 전달 전' + [사은권 전달함]
    assert.match(sp(await page.textContent("#sheet .giftdue")), /사은권 전달 전 — 10번째 예약완료 2만원 사은권 · 010-5555-0048/);
    await page.click("#sheet [data-act=close] >> nth=0");
    const k = h.keys[0];
    assert.ok(await page.$(`.key.giftdue[data-k="${k}"]`), "열쇠판 칸에 '사은권' 표시");
    await slot(page, "16:00");
    assert.match(sp(await page.textContent('.res:has-text("더하기")')), /사은권 전달 전/);
    // 전달 전에 반납하려 하면 물음 → [취소]면 반납 안 함
    await page.click(`.key[data-k="${k}"]`);
    let asked = "";
    page.once("dialog", (d) => { asked = d.message(); d.dismiss(); });
    await page.click("#sheet [data-act=returnAll]");
    assert.match(asked, /더하기님 10번째 예약완료 2만원 사은권을 아직 전달하지 않았어요/);
    assert.ok(await page.evaluate((kk) => window.__deskTest.holders().some((x) => x.keys.includes(kk)), k), "취소 → 열쇠 그대로");
    // [사은권 전달함] → 표시가 모두 사라지고 반납은 묻지 않음
    await page.click("#sheet [data-act=giftGiven]");
    assert.match(await page.textContent("#toast"), /사은권 전달함/);
    assert.strictEqual(await page.$("#sheet .giftdue"), null);
    assert.strictEqual(await page.$(`.key.giftdue[data-k="${k}"]`), null);
    let asked2 = "";
    page.once("dialog", (d) => { asked2 = d.message(); d.accept(); });
    await page.click("#sheet [data-act=returnAll]");
    assert.strictEqual(asked2, "", "전달한 뒤엔 묻지 않음");
    assert.match(sp(await page.textContent('.res:has-text("더하기")')), /사은권 \d\d:\d\d 전달/);

    // 10번째가 아니면 예전 그대로 (완료 3)
    await add(page, "14:30", "보통추가", "010-5555-0058", 3);
    await slot(page, "14:30");
    await enter(page, "보통추가");
    await add(page, "16:30", "보통추가", "010-5555-0058", 4);
    await page.evaluate(() => window.__deskTest.extScan());
    await page.waitForSelector(".extbox");
    assert.doesNotMatch(await page.textContent(".extbox"), /사은권/);
    await page.click("[data-act=extOk]");
    assert.strictEqual(await page.$("#sheet .giftdue"), null);
    assert.deepStrictEqual(errs, []);
  } finally {
    await browser.close();
  }
});
