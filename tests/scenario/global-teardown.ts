import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { REAL_BACKEND } from "./supabaseEnv";
import { teardownBaseline, restoreAlertsIfPending, NS, EXISTING_CUSTOMER_NAME } from "./global-setup";

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
const TEST_MARKS = ["ZZTEST", "ZZLOAD"];

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
    await del("quotations", "customer", mark);
    await del("quotations", "id", mark);
    await del("appointments", "company", mark);
    await del("leads", "company", mark);
    await del("leads", "id", mark);
    await del("customers", "company", mark);
  }
  return removed.join(" · ");
}

export default async function globalTeardown() {
  if (!REAL_BACKEND || !ADMIN_SUPABASE_URL || !ADMIN_SERVICE_ROLE_KEY) return;
  const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY);
  // KEEP_TEST_DATA=1 → เก็บ "ชุดข้อมูลตั้งต้น" ไว้ให้เปิดหน้าจอดูต่อได้หลังรันจบ (บอสสั่ง 20 ส.ค. 69)
  //   แต่ยังกวาดของตกค้างของแต่ละสเปกเสมอ — ของพวกนั้นเป็นเศษจากการทดสอบ ไม่ใช่ข้อมูลไว้ดู
  //   ถ้าไม่กวาด จะสะสมทุกรอบจนเทสต์ที่นับจำนวนแถวล้มเอง (เจอจริง: ลูกค้าเป้าหมายซ้ำ 9 แถว)
  const เก็บชุดตั้งต้นไว้ = process.env.KEEP_TEST_DATA === "1";
  if (!เก็บชุดตั้งต้นไว้) await teardownBaseline(admin);
  await restoreAlertsIfPending(admin); // คืน hq_notif_rules.alerts เป็นค่าเดิมก่อน seed
  // สวิตช์ซ่อนราคาแม่แบบต้องปิดเสมอเมื่อจบทั้งชุด — ตาข่ายชั้นที่สองต่อจาก afterAll ของชุด price-switch
  //   (afterAll ไม่ทำงานถ้า worker ถูกฆ่ากลางทาง · ตัวนี้รันตอนจบทั้งรอบไม่ว่าข้อไหนจะตก)
  //   ฐานที่ยังไม่มีสวิตช์จะได้ error กลับมาเฉย ๆ ไม่ต้องทำอะไร
  const { data: ปิดให้ } = await admin.from("hq_policy").update({ hide_catalog_price: false }).eq("hide_catalog_price", true).select("id");
  if (ปิดให้?.length) console.log("[global-teardown] ⚠ สวิตช์ซ่อนราคาแม่แบบเปิดค้างอยู่ตอนจบรอบ — ปิดคืนให้แล้ว (ดูสาเหตุในรายงานรอบนี้: ชุด price-switch ตก หรือสวิตช์ถูกเปิดเองในฐาน)");
  // ลูกค้าเป้าหมายชื่อ "บจ. ไทยสตีล" ที่ customer-dedupe.spec.ts สร้างผ่านหน้าจอ ไม่มีป้าย ZZTEST
  //   (ต้องเป็นชื่อสะอาด ไม่งั้นตัวจับคู่ลูกค้าซ้ำทำงานไม่ได้ — ดูเหตุผลที่ global-setup.ts)
  //   จึงต้องกวาดด้วยชื่อเป๊ะเสมอ แม้ในโหมดเก็บชุดตั้งต้นไว้ ไม่งั้นสะสมทุกรอบ
  await admin.from("leads").delete().eq("company", EXISTING_CUSTOMER_NAME).eq("dealer_code", "RYG");
  const leftovers = await sweep(admin, เก็บชุดตั้งต้นไว้);
  console.log(`[global-teardown] ${เก็บชุดตั้งต้นไว้ ? "เก็บข้อมูลตั้งต้น (ZZTEST-BASE) ไว้ตามที่สั่ง" : "ลบข้อมูลตั้งต้น (ZZTEST-BASE)"} + คืนค่า alerts เดิมแล้ว${leftovers ? ` · เก็บของตกค้าง: ${leftovers}` : ""}`);
}
