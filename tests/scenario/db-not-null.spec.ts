import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { RYG, skipReason } from "./supabaseEnv";
import { db, specNS, nsTag, cleanup } from "./funcHelpers";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { วางใบเดิมที่ฐาน } from "./legacyQuotes";

// ── ช่องข้อมูลหลักต้องมีค่าเสมอ ห้ามเป็นค่าว่าง NULL (ตรวจสอบระบบ 5 ส.ค. 69) ──
//
// ที่มา 3 ชั้น (ดู 0106):
//   1) CHECK (x >= 0) ไม่กัน NULL — Postgres ถือว่า NULL >= 0 เป็น "ไม่รู้" ไม่ใช่ "เท็จ"
//      คอลัมน์ตัวเลขจึงเป็น NULL ได้ ทั้งที่ TypeScript ประกาศว่าเป็น number เสมอ
//   2) upsert_customer_for_company ใช้ jsonb_populate_record(null::customers, ...) ซึ่งข้าม
//      ค่า DEFAULT ของคอลัมน์ทั้งหมด — ฟิลด์ที่ไม่ได้ส่งมาได้ NULL แทนค่าตั้งต้น
//      (ยืนยันด้วยข้อมูลจริง: เจอลูกค้า 1 แถวที่ 7 คอลัมน์เป็น NULL ทั้งชุด)
//   3) ฟิลด์หลักของ customers ไม่มี NOT NULL เลย ทั้งที่ leads.company เคยถูกแก้ไปแล้ว (0072)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(120_000);
test.describe.configure({ mode: "serial" });

const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const NS = specNS("NOTNULL");
const tg = nsTag(NS);

test.beforeAll(async () => { await cleanup(await db(RYG), "RYG", NS); });
test.afterAll(async () => { await cleanup(await db(RYG), "RYG", NS); });

test("สร้างลูกค้าโดยส่งมาแค่ชื่อบริษัท → ช่องที่เหลือต้องได้ค่าตั้งต้น ไม่ใช่ค่าว่าง", async () => {
  const sb = await db(RYG);
  const company = tg("ค่าตั้งต้น");

  // ส่ง payload น้อยที่สุดเท่าที่ฟังก์ชันยอมรับ — เลียนแบบเส้นทางที่เคยสร้างแถวมีค่าว่างจริง
  const { data, error } = await sb.rpc("upsert_customer_for_company", {
    p_dealer: "RYG", p_payload: { company },
  });
  expect(error, `สร้างลูกค้าต้องไม่ error (${error?.message ?? ""})`).toBeNull();
  expect(data, "ต้องได้แถวลูกค้ากลับมา").toBeTruthy();

  const row = data as Record<string, unknown>;
  // ทุกช่องที่ TypeScript ประกาศว่าต้องมีค่า ต้องไม่เป็น NULL
  for (const col of ["name", "email", "phone", "province", "category", "owner", "initials",
                     "color", "join_date", "status", "projects", "total_value", "imported", "contacts"]) {
    expect(row[col], `ช่อง "${col}" ต้องไม่เป็นค่าว่าง (ได้ ${JSON.stringify(row[col])})`).not.toBeNull();
  }
  // ค่าตั้งต้นต้องสมเหตุสมผล ไม่ใช่แค่ "ไม่ null"
  expect(row.status, "ลูกค้าใหม่ต้องเริ่มที่สถานะใช้งาน").toBe("active");
  expect(Number(row.total_value), "ยอดซื้อเริ่มต้นต้องเป็น 0").toBe(0);
  expect(Number(row.projects), "จำนวนงานเริ่มต้นต้องเป็น 0").toBe(0);
  expect(String(row.join_date), "วันที่เริ่มเป็นลูกค้าต้องเป็นวันที่จริง").toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test("ค่าที่ผู้เรียกส่งมา ต้องทับค่าตั้งต้นได้ (ไม่ใช่ถูกค่าตั้งต้นกลบ)", async () => {
  const sb = await db(RYG);
  const company = tg("ทับค่าตั้งต้น");
  const { data, error } = await sb.rpc("upsert_customer_for_company", {
    p_dealer: "RYG",
    p_payload: { company, name: "คุณทดสอบ", province: "ระยอง", status: "inactive", total_value: 12345 },
  });
  expect(error, `ต้องไม่ error (${error?.message ?? ""})`).toBeNull();
  const row = data as Record<string, unknown>;
  expect(row.name).toBe("คุณทดสอบ");
  expect(row.province).toBe("ระยอง");
  expect(row.status, "ค่าที่ส่งมาต้องชนะค่าตั้งต้น").toBe("inactive");
  expect(Number(row.total_value)).toBe(12345);
});

test("ฐานข้อมูลต้องปฏิเสธการเขียนค่าว่างลงช่องหลัก (บังคับที่ DB ไม่ใช่แค่ที่แอป)", async () => {
  // ยิงตรงด้วย service_role (ข้าม RLS) เพื่อพิสูจน์ว่าเป็นข้อบังคับของฐานข้อมูลจริง
  // ไม่ใช่แค่ตรรกะในแอปที่เลี่ยงได้ถ้าเขียนข้อมูลทางอื่น
  const base = { id: 990501, dealer_code: "RYG", company: tg("ห้ามค่าว่าง") };

  for (const col of ["name", "email", "phone", "province", "category", "owner",
                     "initials", "color", "join_date", "status", "total_value", "projects"]) {
    const { error } = await admin.from("customers").insert({ ...base, [col]: null });
    expect(error, `เขียน "${col}" เป็นค่าว่างต้องถูกปฏิเสธ`).not.toBeNull();
    expect(String(error?.message ?? ""), `"${col}" ต้องถูกปฏิเสธเพราะเป็น null`).toMatch(/null value|not-null/i);
    await admin.from("customers").delete().eq("id", base.id); // เผื่อหลุด (ไม่ควรเกิด)
  }
});

test("ชื่อบริษัทลูกค้าห้ามเป็นช่องว่างเปล่า (แนวเดียวกับลูกค้าเป้าหมายที่แก้ไปแล้ว)", async () => {
  const { error } = await admin.from("customers").insert({
    id: 990502, dealer_code: "RYG", company: "   ",
    name: "", email: "", phone: "", province: "ระยอง", category: "", owner: "", initials: "", color: "",
    join_date: "2026-08-05", status: "active", total_value: 0, projects: 0,
  });
  expect(error, "ชื่อบริษัทที่มีแต่ช่องว่างต้องถูกปฏิเสธ").not.toBeNull();
  await admin.from("customers").delete().eq("id", 990502);
});

test("ยอดเงินในใบเสนอราคาห้ามเป็นค่าว่าง", async () => {
  for (const col of ["total_value", "material_cost"]) {
    // ด่าน 3: ใบที่ไม่มีใบ HQ สร้างผ่าน API ไม่ได้แล้ว (ถ้ายิงแบบเดิม จะถูกปฏิเสธด้วยกฎนั้นแทน = ไม่ได้วัดกฎค่าว่าง)
    //   จึงวางที่ฐานทดสอบตรง ๆ (ปิดเฉพาะตัวดักใบ HQ) แล้วต้องเจอกฎ "ห้ามค่าว่าง" ของคอลัมน์จริง
    let ข้อผิดพลาด = "";
    try { วางใบเดิมที่ฐาน([{ id: `ZZNULL-${col}`, dealer_code: "RYG", status: "draft", [col]: null }]); }
    catch (e) { ข้อผิดพลาด = String((e as { stderr?: Buffer }).stderr ?? e); }
    expect(ข้อผิดพลาด, `ยอด "${col}" เป็นค่าว่างต้องถูกปฏิเสธด้วยกฎห้ามค่าว่าง`).toMatch(/null value in column|not-null/);
    await admin.from("quotations").delete().eq("id", `ZZNULL-${col}`);
  }
});
