import { test, expect, type Page } from "@playwright/test";
import { RYG, ADMIN, skipReason, type Account } from "./supabaseEnv";
import { db } from "./funcHelpers";
import { settle } from "./helpers";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");

// ── สโมคเทสต์โหมด supabase — พิสูจน์ว่า "ตัวแอปจริง" ใช้งานได้กับ backend จริง ────────
// ต่างจากเทสต์ชุดอื่นที่รันโหมด local (mock): ชุดนี้ล็อกอินด้วยบัญชีจริงผ่านหน้าจอ
// แล้วดูว่า auth (JWT+RLS) / การโหลดข้อมูลผ่าน repo / ค่าคุมจาก HQ ทำงานครบ
// รันเมื่อ NEXT_PUBLIC_DATA_SOURCE=supabase เท่านั้น — ถ้าเป็น local ให้ข้าม
const DEALER = "http://localhost:3001";
const HQ = "http://localhost:3002";

// เก็บ error ของหน้า (crash/exception) เพื่อฟ้องว่าแอปพังเงียบ ๆ ไหม
function trackErrors(page: Page): string[] {
  const errs: string[] = [];
  page.on("pageerror", e => errs.push(`pageerror: ${e.message}`));
  page.on("console", m => { if (m.type() === "error") errs.push(`console: ${m.text()}`); });
  return errs;
}

// ล็อกอินผ่านหน้าจอจริง แล้วรอจนออกจากหน้า login
// ถ้าไม่ออก ให้ดึงข้อความ error ที่ฟอร์มโชว์มาใส่ใน assertion (จะได้รู้สาเหตุจริง ไม่ใช่แค่ timeout)
async function login(page: Page, origin: string, path: string, who: Account) {
  await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
  // รอให้ React hydrate เสร็จก่อนแตะฟอร์ม — กรอกก่อน hydrate แล้ว controlled input จะถูกล้างทิ้ง
  // แล้วฟอร์มถูกส่งไปเปล่า ๆ (Supabase ตอบ "missing email or phone" · โผล่เป็น console error ด้วย)
  await settle(page);
  const email = page.getByLabel(/อีเมล/i).first();
  const pass = page.getByLabel(/รหัสผ่าน/i).first();

  // ต้องกรอก "หลัง React hydrate" เท่านั้น — ถ้ากรอกก่อน controlled input จะถูกรีเซ็ตเป็นค่าว่าง
  // ตอน hydrate แล้วส่งฟอร์มเปล่า (Supabase ตอบ "missing email or phone")
  // เช็คค่าก่อนกดอย่างเดียวยังไม่พอ: hydrate อาจมาคั่นระหว่าง "เช็ค" กับ "กด"
  // จึงกรอก→กด→ถ้ายังไม่ออกจากหน้า login ให้เริ่มใหม่ทั้งรอบ
  let alerts: string[] = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    // กรอกแล้วต้อง "อยู่นิ่ง" สองรอบติดกัน ไม่ใช่แค่ถูกต้องตอนเช็คครั้งเดียว
    // (hydrate อาจมาคั่นระหว่างเช็คกับกด แล้วส่งฟอร์มเปล่า)
    for (let i = 0; i < 6; i++) {
      await email.fill(who.email);
      await pass.fill(who.password);
      await page.waitForTimeout(300);
      const ok1 = await email.inputValue() === who.email && await pass.inputValue() === who.password;
      await page.waitForTimeout(300);
      const ok2 = await email.inputValue() === who.email && await pass.inputValue() === who.password;
      if (ok1 && ok2) break;
    }
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).first().click();

    const left = await page.waitForFunction(() => !location.pathname.includes("/login"), null, { timeout: 20_000 })
      .then(() => true).catch(() => false);
    if (left) return;
    alerts = await page.getByRole("alert").allInnerTexts().catch(() => []);
    console.log(`ล็อกอินรอบที่ ${attempt} ไม่ผ่าน (${JSON.stringify(alerts)}) — ลองใหม่`);
  }
  throw new Error(`ล็อกอินไม่ผ่าน (${who.email}) — ยังอยู่ที่ ${page.url()} · ข้อความบนฟอร์ม: ${JSON.stringify(alerts)}`);
}

test("[supabase] ดีลเลอร์ RYG ล็อกอินผ่านหน้าจอจริงแล้วเข้าระบบได้", async ({ page }) => {
  const errs = trackErrors(page);
  await login(page, DEALER, "/login", RYG);
  // ล็อกอินสำเร็จ = เด้งออกจากหน้า login
  // รอจนเนื้อหาขึ้นจริง ไม่ใช่รอเวลาตายตัว (เดิม 2.5 วินาที — ตกทุกครั้งเมื่อการตรวจสถานะบัญชีช้าลงเล็กน้อย · 14 ต.ค. 69)
  //   หน้าในระบบซ่อนเนื้อหาไว้ระหว่างตรวจว่าต้องตั้งรหัส/ยืนยันอีเมลหรือไม่ จึงต้องรอให้ตรวจเสร็จ
  await expect.poll(() => page.evaluate(() => document.body.innerText.length), { timeout: 20_000, message: "หน้าต้องเรนเดอร์เนื้อหา ไม่ใช่จอเปล่า" })
    .toBeGreaterThan(200);
  console.log("URL หลังล็อกอิน:", page.url());
  const fatal = errs.filter(e => !/favicon|hydrat|Download the React/i.test(e));
  console.log(fatal.length ? `errors:\n${fatal.slice(0, 5).join("\n")}` : "ไม่มี error");
  expect(fatal, "ต้องไม่มี error ตอนเข้าระบบด้วย backend จริง").toEqual([]);
});

test("[supabase] ดีลเลอร์เปิดหน้าหลักได้ครบ ไม่พัง", async ({ page }) => {
  const errs = trackErrors(page);
  await login(page, DEALER, "/login", RYG);
  for (const p of ["/dashboard", "/leads", "/customers", "/quotations", "/products", "/calendar", "/files"]) {
    await page.goto(`${DEALER}${p}`, { waitUntil: "domcontentloaded" });
    // รอจนหน้ามีเนื้อหาจริง — หน่วงคงที่ไม่พอเมื่อรันหลาย worker พร้อมกัน (เครื่องช้าลง → เทสต์แกว่ง)
    await expect.poll(async () => (await page.evaluate(() => document.body.innerText)).length,
      { timeout: 20_000, message: `${p} ต้องเรนเดอร์ได้` }).toBeGreaterThan(100);
    const txt = await page.evaluate(() => document.body.innerText);
    console.log(`${p} ✓ (${txt.length} chars)`);
  }
  const fatal = errs.filter(e => !/favicon|hydrat|Download the React/i.test(e));
  if (fatal.length) console.log(`errors:\n${fatal.slice(0, 8).join("\n")}`);
  expect(fatal, "ทุกหน้าต้องไม่มี error").toEqual([]);
});

test("[supabase] หน้าแม่แบบของดีลเลอร์ดึงแคตตาล็อกจาก HQ ได้จริง", async ({ page }) => {
  await login(page, DEALER, "/login", RYG);
  await page.goto(`${DEALER}/products`, { waitUntil: "domcontentloaded" });
  // แม่แบบที่ seed ไว้ใน master_catalog ต้องโผล่ (ไม่ใช่ mock ในเครื่อง)
  await expect.poll(async () => page.evaluate(() => document.body.innerText), { timeout: 15_000 })
    .toContain("โกดังสำเร็จรูป");
  const txt = await page.evaluate(() => document.body.innerText);
  for (const name of ["โรงงาน", "งานรีโนเวท"]) expect(txt, `ต้องมีแม่แบบ "${name}"`).toContain(name);
  console.log("แม่แบบจากแคตตาล็อกกลางแสดงครบ");
});

test("[supabase] HQ ล็อกอินแล้วเปิดหน้าเครือได้", async ({ page }) => {
  const errs = trackErrors(page);
  await login(page, HQ, "/hq/login", ADMIN);
  for (const p of ["/hq/dashboard", "/hq/dealers", "/hq/leads", "/hq/master", "/hq/settings"]) {
    await page.goto(`${HQ}${p}`, { waitUntil: "domcontentloaded" });
    await expect.poll(async () => (await page.evaluate(() => document.body.innerText)).length,
      { timeout: 20_000, message: `${p} ต้องเรนเดอร์ได้` }).toBeGreaterThan(100);
    const txt = await page.evaluate(() => document.body.innerText);
    console.log(`${p} ✓ (${txt.length} chars)`);
  }
  const fatal = errs.filter(e => !/favicon|hydrat|Download the React/i.test(e));
  if (fatal.length) console.log(`errors:\n${fatal.slice(0, 8).join("\n")}`);
  expect(fatal, "หน้า HQ ต้องไม่มี error").toEqual([]);
});

// ⚠️ เดิมเทสต์นี้เขียนชื่อสาขาไว้ตายตัว 3 ชื่อ ("ระยอง/เชียงใหม่/ภูเก็ต") และตั้งชื่อว่า "ครบ 10 สาขา"
//   พอผู้บริหารลบสาขาภูเก็ตออกจริง (7 ส.ค. 69) เทสต์ก็ตกทันที ทั้งที่ระบบทำงานถูกต้องทุกอย่าง
//   → เสียเวลาไล่หาว่าโค้ดพังตรงไหน ทั้งที่ไม่มีอะไรพัง
//   สิ่งที่อยากพิสูจน์จริง ๆ คือ "หน้าจอแสดงสาขาตามที่มีอยู่ในฐานข้อมูล ไม่ใช่ข้อมูลตัวอย่างที่ฝังในโค้ด"
//   จึงเปลี่ยนไปเทียบกับฐานข้อมูลตรง ๆ — เพิ่มหรือลบสาขากี่ครั้งเทสต์นี้ก็ยังถูกเสมอ
test("[supabase] หน้าทะเบียนดีลเลอร์แสดงสาขาตรงกับที่มีในฐานข้อมูลจริง", async ({ page }) => {
  await login(page, HQ, "/hq/login", ADMIN);
  await page.goto(`${HQ}/hq/dealers`, { waitUntil: "domcontentloaded" });

  // รายชื่อจริงจากฐานข้อมูล — อ่านด้วยสิทธิ์ของผู้ดูแลที่ล็อกอินอยู่ (ผ่านกฎความปลอดภัยจริง ไม่ใช่ลัด)
  const sb = await db(ADMIN);
  const names = ((await sb.from("dealers_directory").select("name")).data ?? []).map(d => String(d.name));
  expect(names.length, "ต้องมีสาขาอยู่ในฐานข้อมูลอย่างน้อย 1 สาขา").toBeGreaterThan(0);

  // ⚠️ ต้องรอ "ข้อมูลจริงขึ้นจอ" ไม่ใช่แค่ "มีแถวในตาราง"
  //   ระหว่างโหลด ตารางมีแถวโครงเปล่าอยู่ก่อนแล้ว ถ้าเช็กแค่จำนวนแถว จะอ่านตอนยังว่างแล้วตกทันที
  //   (เจอกับตัวเองตอนเขียนเทสต์นี้ 10 ส.ค. 69 — เช็กว่ามีแถว ผ่าน แต่ชื่อสาขายังว่าง)
  await expect.poll(async () => page.evaluate(() => document.body.innerText),
    { timeout: 20_000, message: "ต้องรอชื่อสาขาจริงขึ้นจอก่อน" }).toContain(names[0]);

  // เก็บข้อความทุกช่องของแต่ละแถว — ไม่ผูกกับลำดับคอลัมน์ สลับคอลัมน์เมื่อไหร่เทสต์ก็ยังใช้ได้
  const rows: string[][] = await page.evaluate(() =>
    [...document.querySelectorAll("tbody tr")].map(tr =>
      [...tr.children].map(td => td.textContent?.trim() ?? "")));

  // ⚠️ ตารางแบ่งหน้าละ 10 แถว — มีมากกว่านั้นหน้าแรกจะแสดงแค่ 10 ซึ่งถูกต้องแล้ว
  expect(rows.length, "หน้าแรกต้องแสดงไม่เกิน 10 แถวตามกติกาการแบ่งหน้า").toBeLessThanOrEqual(10);
  // ทุกแถวบนจอต้องเป็นสาขาที่มีอยู่จริงในฐานข้อมูล = ไม่ได้เอาข้อมูลตัวอย่างที่ฝังในโค้ดมาโชว์
  const shown = rows.map(cells => cells.find(c => names.includes(c)) ?? "");
  for (let i = 0; i < rows.length; i++) {
    expect(shown[i], `แถวที่ ${i + 1} ไม่ตรงกับสาขาใดในฐานข้อมูลเลย (${rows[i].join(" | ")})`).not.toBe("");
  }
  // ถ้าสาขาน้อยกว่าหนึ่งหน้า ต้องเห็นครบทุกสาขา ไม่มีหายไปเงียบ ๆ
  if (names.length <= 10) expect(rows.length, "สาขาไม่ถึงหนึ่งหน้า ต้องแสดงครบทุกสาขา").toBe(names.length);
  console.log(`ทะเบียนดีลเลอร์แสดง ${rows.length} สาขาจากฐานข้อมูล: ${shown.join(", ")}`);
});

test("[supabase] หน้าจอโชว์ชื่อคน/ชื่อสาขาจริง ไม่ใช่อีเมล/รหัสสาขา (B5)", async ({ page }) => {
  // ชื่อสาขาอ่านจากฐาน ไม่เขียนตายตัว — ข้อมูลตั้งต้นใช้ชื่อตามสูตร (tests/fixtures/test-baseline.sql · 15 ต.ค. 69)
  const ชื่อสาขา = String((await (await db(ADMIN)).from("dealers").select("name").eq("code", "RYG").single()).data?.name ?? "");
  expect(ชื่อสาขา, "ต้องมีสาขา RYG ในฐานทดสอบ").not.toBe("");
  expect(ชื่อสาขา, "ชื่อสาขาต้องไม่ใช่รหัส 3 ตัว").not.toBe("RYG");
  await login(page, DEALER, "/login", RYG);
  await page.goto(`${DEALER}/dashboard`, { waitUntil: "domcontentloaded" });
  // ชื่อสาขาต้องเป็นชื่อบริษัทจาก dealers.name ไม่ใช่รหัส 3 ตัว
  await expect.poll(async () => page.evaluate(() => document.body.innerText), { timeout: 15_000, message: "ต้องเห็นชื่อสาขาจริง" })
    .toContain(ชื่อสาขา);
  const txt = await page.evaluate(() => document.body.innerText);
  expect(txt, "ต้องไม่โชว์อีเมลแทนชื่อคน").not.toContain(RYG.email);
});
