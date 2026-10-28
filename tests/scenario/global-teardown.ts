import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { REAL_BACKEND } from "./supabaseEnv";
import { teardownBaseline, restoreAlertsIfPending, NS, EXISTING_CUSTOMER_NAME } from "./global-setup";
import { กวาดสาขาทดสอบค้าง } from "./testDealers";
import { ลบใบทดสอบที่ฐาน, ล้างใบHQทดสอบ } from "./legacyQuotes";

// ── กวาดข้อมูลทดสอบ "ครั้งสุดท้าย" หลังทุกอย่างจบจริง ─────────────────────────────
//
// ทำไมต้องมี ทั้งที่แต่ละสเปกมี cleanup ของตัวเองแล้ว:
//   cleanup ของสเปกทำงานตอน afterAll ซึ่งอาจยังมีคำสั่งค้างอยู่ในสาย — โดยเฉพาะ "ปิดการขาย"
//   ที่เทสต์กดแล้วจบเทสต์เลย · RPC ฝั่ง DB ไปสร้างลูกค้าเสร็จ *หลัง* cleanup ผ่านไปแล้ว
//   ลูกค้ารายนั้นจึงค้างในฐานข้อมูลจริงตลอดไป (ตรวจพบ 12 รายค้างสะสมข้ามรอบ · ชุดตรวจรับ 6 ส.ค. 69)
//   และไปโผล่ในรายงานว่าเป็น "ลูกค้าที่มียอดสะสมแต่ไม่มีใบเสนอราคา" ซึ่งดูเหมือนข้อมูลเพี้ยน
//
// ตัวกวาดนี้รันตอนจบทั้งชุด ไม่มีอะไรค้างในสายแล้ว จึงเก็บของตกได้หมดจริง
// เงื่อนไขความปลอดภัย: แตะเฉพาะแถวที่ชื่อมีป้าย ZZTEST/ZZLOAD เท่านั้น — ข้อมูลจริงไม่มีป้ายนี้
// ZZE2E: ไฟล์ใบเสนอราคาของ hq-dealer-e2e.spec.ts (ชื่อลูกค้า ZZE2E-…) ค้างสะสม 14 แถว — ตัวตรวจแถวค้างเดิมมองไม่เห็นป้ายนี้ (พบ 19 ต.ค. 69)
const TEST_MARKS = ["ZZTEST", "ZZLOAD", "ZZE2E"];

async function sweep(admin: SupabaseClient, เก็บชุดตั้งต้นไว้ = false): Promise<string> {
  const removed: string[] = [];
  const del = async (table: string, column: string, mark: string) => {
    // ⚠️ ตอนสั่งให้เก็บชุดตั้งต้นไว้ ต้องกันแถวของชุดนั้นออกจากการกวาดด้วย
    //    ไม่งั้นชุดตั้งต้น (ZZTEST-BASE-…) จะโดนกวาดตกไปกับป้าย ZZTEST ที่ครอบมันอยู่
    //    (พลาดมาแล้วรอบหนึ่ง: บอกว่า "เก็บไว้" แต่กวาดทิ้ง 16 แถวในบรรทัดถัดมา)
    let q = admin.from(table).delete().like(column, `%${mark}%`);
    if (เก็บชุดตั้งต้นไว้) q = q.not(column, "like", `${NS}%`);
    const { data, error } = await q.select("id");
    if (error) { removed.push(`${table}:อ่านไม่ได้(${error.code ?? "?"})`); return; }
    if (data?.length) removed.push(`${table} ${data.length}`);
  };
  for (const mark of TEST_MARKS) {
    // ลำดับสำคัญ: ลบลูก (ที่อ้างถึงลูกค้า) ก่อนเสมอ ไม่งั้น FK จะกันการลบแม่ไว้
    await del("customer_notes", "title", mark);
    await del("files", "name", mark);
    // ใบเสนอราคา: ใบ won ลบด้วยกุญแจไม่ได้แล้ว (ใบ 0203 · ด่าน 3) — ลบที่ฐานทดสอบในเครื่องตรง ๆ
    try {
      const กันชุดตั้งต้น = เก็บชุดตั้งต้นไว้ ? ` and customer not like '${NS}%' and id not like '${NS}%'` : "";
      const n = ลบใบทดสอบที่ฐาน(`(customer like '%${mark}%' or id like '%${mark}%')${กันชุดตั้งต้น}`);
      if (n) removed.push(`quotations ${n}`);
    } catch (e) { removed.push(`quotations:ลบไม่ได้(${String(e).slice(0, 40)})`); }
    await del("appointments", "company", mark);
    // ลูกค้าเป้าหมายทดสอบที่ได้ขอราคา/ได้ใบ HQ แล้ว (ด่าน 2–3) — คำขอ/ใบ HQ ที่ส่งแล้วลบด้วยกุญแจไม่ได้ ต้องล้างที่ฐานตรงก่อน
    {
      let q = admin.from("leads").select("dealer_code, num_id").like("company", `%${mark}%`);
      if (เก็บชุดตั้งต้นไว้) q = q.not("company", "like", `${NS}%`);
      const { data: ลีด } = await q;
      const ตามสาขา = new Map<string, number[]>();
      for (const l of ลีด ?? []) ตามสาขา.set(String(l.dealer_code), [...(ตามสาขา.get(String(l.dealer_code)) ?? []), Number(l.num_id)]);
      for (const [สาขา, เลข] of ตามสาขา) { try { ล้างใบHQทดสอบ(สาขา, เลข); } catch { /* ไม่มี docker */ } }
    }
    // อีเมลแจ้ง "ได้ราคาจากสำนักงานใหญ่แล้ว" ของคำขอที่ข้อทดสอบลบไปแล้ว — ไม่หายตามคำขอ (อ้างด้วย ref_id ไม่ใช่กุญแจนอก)
    //   พบ 15 ต.ค. 69 จาก check-test-leftovers: ค้าง 9 แถว
    await del("email_outbox", "body", mark);
    // แจ้งเตือน (ใบ 0231) ของงานขายทดสอบ — อ้างลีด/คำขอด้วยข้อความและลิงก์ ไม่มีกุญแจนอก จึงไม่หายตาม
    await del("notifications", "body", mark);
    await del("notifications", "dealer_code", mark);
    await del("leads", "company", mark);
    await del("leads", "id", mark);
    await del("customers", "company", mark);
    // ผู้สนใจเป็นดีลเลอร์ ที่ข้อทดสอบสร้างไว้รองรับการสร้างสาขา — ใบค่าแฟรนไชส์/บันทึกการติดต่อหายตามกุญแจนอก
    //   (เคยค้างสะสม 12 แถว: ข้อทดสอบลบสาขาตรงที่ตาราง รายต้นทางหลุดจากสาขาแต่ไม่ถูกลบ · พบ 13 ต.ค. 69)
    await del("dealer_prospects", "name", mark);
  }
  return removed.join(" · ");
}

export default async function globalTeardown() {
  // ช่วง tools รันพร้อมช่วง chromium — จบก่อนแล้วกวาดข้อมูลทดสอบ = ลบของที่ chromium กำลังใช้ (ดู global-setup.ts · 28 ต.ค. 69)
  if (process.env.PMS_GLOBAL_SETUP_SKIP === "1") return;
  if (!REAL_BACKEND || !ADMIN_SUPABASE_URL || !ADMIN_SERVICE_ROLE_KEY) return;
  const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY);
  // KEEP_TEST_DATA=1 → เก็บ "ชุดข้อมูลตั้งต้น" ไว้ให้เปิดหน้าจอดูต่อได้หลังรันจบ (บอสสั่ง 20 ส.ค. 69)
  //   แต่ยังกวาดของตกค้างของแต่ละสเปกเสมอ — ของพวกนั้นเป็นเศษจากการทดสอบ ไม่ใช่ข้อมูลไว้ดู
  //   ถ้าไม่กวาด จะสะสมทุกรอบจนเทสต์ที่นับจำนวนแถวล้มเอง (เจอจริง: ลูกค้าเป้าหมายซ้ำ 9 แถว)
  const เก็บชุดตั้งต้นไว้ = process.env.KEEP_TEST_DATA === "1";
  if (!เก็บชุดตั้งต้นไว้) await teardownBaseline(admin);
  await restoreAlertsIfPending(admin); // คืน hq_notif_rules.alerts เป็นค่าเดิมก่อน seed
  // ลูกค้าเป้าหมายชื่อ "บจ. ไทยสตีล" ที่ customer-dedupe.spec.ts สร้างผ่านหน้าจอ ไม่มีป้าย ZZTEST
  //   (ต้องเป็นชื่อสะอาด ไม่งั้นตัวจับคู่ลูกค้าซ้ำทำงานไม่ได้ — ดูเหตุผลที่ global-setup.ts)
  //   จึงต้องกวาดด้วยชื่อเป๊ะเสมอ แม้ในโหมดเก็บชุดตั้งต้นไว้ ไม่งั้นสะสมทุกรอบ
  await admin.from("leads").delete().eq("company", EXISTING_CUSTOMER_NAME).eq("dealer_code", "RYG");
  // สาขาทดสอบที่ค้าง (ข้อทดสอบตกกลางทาง · worker ถูกฆ่า · คำสั่งลบของระบบพัง) — กวาดก่อนตารางอื่น เพราะข้อมูลของสาขาผูกกุญแจนอกอยู่
  const สาขา = await กวาดสาขาทดสอบค้าง(admin);
  if (สาขา.ลบแล้ว.length) console.log(`[global-teardown] ⚠ กวาดสาขาทดสอบที่ค้าง: ${สาขา.ลบแล้ว.join(", ")} — ข้อทดสอบที่สร้างไม่ได้เก็บกวาดเอง (ดูว่าข้อไหนตกในรอบนี้)`);
  if (สาขา.พลาด.length) console.log(`[global-teardown] ❌ กวาดสาขาทดสอบไม่สำเร็จ: ${สาขา.พลาด.join(" · ")}`);
  const leftovers = await sweep(admin, เก็บชุดตั้งต้นไว้);
  console.log(`[global-teardown] ${เก็บชุดตั้งต้นไว้ ? "เก็บข้อมูลตั้งต้น (ZZTEST-BASE) ไว้ตามที่สั่ง" : "ลบข้อมูลตั้งต้น (ZZTEST-BASE)"} + คืนค่า alerts เดิมแล้ว${leftovers ? ` · เก็บของตกค้าง: ${leftovers}` : ""}`);
}
