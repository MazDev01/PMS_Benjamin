import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";

// ── เก็บกวาด "สาขาทดสอบ" ด้วยสิทธิ์เซิร์ฟเวอร์โดยตรง — ไม่ผ่านคำสั่งลบดีลเลอร์ของระบบ ─────────────
//
// ทำไมต้องมี (พบ 13 ต.ค. 69):
//   ข้อทดสอบหลายไฟล์เก็บกวาดสาขาที่ตัวเองสร้างด้วยการเรียกเส้นทาง "ลบดีลเลอร์" ของสำนักงานใหญ่
//   ซึ่งเป็นสิ่งที่กำลังถูกทดสอบอยู่เอง — วันที่เส้นทางนั้นพัง (ฝั่งเซิร์ฟเวอร์ไม่มีสิทธิ์เรียกคำสั่ง ได้ 503 · ใบ 0188)
//   สาขาทดสอบค้างในฐาน 3 ราย แล้วทำให้ข้อทดสอบอื่นที่ไม่เกี่ยวตกตาม 4 ข้อ
//   (สร้างซ้ำไม่ได้เพราะรหัสมีอยู่แล้ว · สาขาค้างดันสาขาจริงตกหน้าแรกของทะเบียน)
//   = บั๊กจุดเดียวกลายเป็นข้อตก 6 ข้อ และต้องไล่เองว่าข้อไหนคือต้นเหตุ
//
// หลัก: การเก็บกวาดต้องไม่พึ่งของที่กำลังทดสอบ — ลบตรงที่ตารางด้วยกุญแจฝั่งเซิร์ฟเวอร์
//   ข้อทดสอบที่ "ทดสอบการลบ" ยังเรียกเส้นทางของระบบตามเดิม (นั่นคือสิ่งที่วัด) แต่ตัวเก็บกวาดก่อน/หลังใช้ตัวนี้
//
// กันพลาด: แตะเฉพาะรหัสสาขาทดสอบ (ขึ้นต้น ZZ หรือ ZT ตามที่ทุกไฟล์ใช้) — รหัสอื่นโยนข้อผิดพลาดทันที ไม่ลบ

/** รหัสสาขาที่ข้อทดสอบสร้าง: ขึ้นต้น ZZ หรือ ZT เท่านั้น (สาขาตั้งต้นของฐานทดสอบไม่มีรหัสขึ้นต้นแบบนี้) */
export const เป็นรหัสสาขาทดสอบ = (code: string) => /^Z[ZT][A-Z]{1,3}$/.test(code);

export const adminClient = (): SupabaseClient =>
  createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

/** ข้อมูลบริษัททดสอบครบ (ชื่อบริษัท · ที่อยู่ · เลขผู้เสียภาษี) ให้สาขาทดสอบ — ส่ง/พิมพ์ใบให้ลูกค้าต้องครบ (ใบ 0247)
 *  สร้างดีลเลอร์ผ่านคำสั่งของ HQ ตั้งให้แค่ชื่อบริษัท · ทุกข้อทดสอบที่สร้างสาขาแล้วส่งใบต้องเรียกตัวนี้ · ลบตามสาขาตอนเก็บกวาด */
export async function กรอกข้อมูลบริษัททดสอบ(code: string, client?: SupabaseClient): Promise<void> {
  if (!เป็นรหัสสาขาทดสอบ(code)) throw new Error(`กรอกข้อมูลบริษัททดสอบ: "${code}" ไม่ใช่รหัสสาขาทดสอบ`);
  const { error } = await (client ?? adminClient()).from("dealer_settings").upsert({ dealer_code: code,
    issuer: { company: `ZZTEST-บริษัทสาขา-${code}`, address: `ZZTEST ที่อยู่ทดสอบ ${code}`, phone: "000-000-0000", taxId: "0000000000000" } },
    { onConflict: "dealer_code" });
  if (error) throw new Error(`ตั้งข้อมูลบริษัทของ ${code} ไม่สำเร็จ: ${error.message}`);
}

/** ลบสาขาทดสอบหนึ่งรายให้หมด: ข้อมูลงานขาย · ค่าตั้งของสาขา · ผู้สนใจเป็นดีลเลอร์ ต้นทาง · บัญชีเข้าระบบ · แถวสาขา
 *  คืนรายการที่ลบไม่สำเร็จ (ว่าง = หมดจด) — ผู้เรียกตัดสินเองว่าจะเตือนหรือให้ตก */
export async function ลบสาขาทดสอบตรง(code: string, client?: SupabaseClient): Promise<string[]> {
  if (!เป็นรหัสสาขาทดสอบ(code)) throw new Error(`ลบสาขาทดสอบตรง: "${code}" ไม่ใช่รหัสสาขาทดสอบ (ต้องขึ้นต้น ZZ หรือ ZT) — ไม่ลบ`);
  // ไม่มีกุญแจฝั่งเซิร์ฟเวอร์ = ไม่ได้รันกับฐานจริง (โหมดข้อมูลตัวอย่าง) ไม่มีสาขาให้เก็บกวาด
  if (!ADMIN_SUPABASE_URL || !ADMIN_SERVICE_ROLE_KEY) return [];
  const admin = client ?? adminClient();
  const พลาด: string[] = [];
  const ลบ = async (table: string, column = "dealer_code") => {
    const { error } = await admin.from(table).delete().eq(column, code);
    // 42P01 / PGRST205 = ฐานนี้ยังไม่มีตารางนั้น (ใบแก้ฐานข้อมูลรุ่นเก่า · ผ่านเส้น REST ได้รหัส PGRST205) — ไม่มีอะไรต้องลบ
    if (error && error.code !== "42P01" && error.code !== "PGRST205") พลาด.push(`${table}: ${error.message}`);
  };

  // ลำดับ = ลูกก่อนแม่ ตามกุญแจนอกที่ห้ามลบแม่ขณะยังมีลูก
  // ใบ won ลบด้วยกุญแจไม่ได้แล้ว (ใบ 0203) — สาขาทดสอบ (รหัสขึ้นต้น ZZ/ZT) ลบใบที่ฐานทดสอบในเครื่องตรง ๆ
  try { const { ลบใบทดสอบที่ฐาน } = await import("./legacyQuotes"); ลบใบทดสอบที่ฐาน(`dealer_code = '${code}'`); } catch { /* ไม่มี docker */ }
  await ลบ("quotations");
  const { data: คำขอ } = await admin.from("quote_requests").select("id").eq("dealer_code", code);
  if (คำขอ?.length) {
    const { error } = await admin.from("hq_quotes").delete().in("request_id", คำขอ.map(r => r.id));
    if (error && error.code !== "42P01") พลาด.push(`hq_quotes: ${error.message}`);
  }
  await ลบ("quote_requests");
  for (const t of ["appointments", "customer_notes", "files", "leads", "customers",
                   "responsible_persons", "dealer_lead_rules", "dealer_account_changes", "dealer_account_requests",
                   "notifications", "quotation_prints"]) await ลบ(t);   // แจ้งเตือน (0231) · บันทึกการพิมพ์ (0247) — ไม่มีกุญแจนอกถึงสาขา ไม่หายตาม
  // ผู้สนใจเป็นดีลเลอร์ ที่กลายมาเป็นสาขานี้ — ระบบลบทิ้งพร้อมสาขา (บอสสั่ง 15 ก.ย. 69) ตัวเก็บกวาดจึงทำแบบเดียวกัน
  await ลบ("dealer_prospects");
  // และรายที่ตัวช่วย ลูกค้าเป้าหมายรองรับสาขา() สร้างไว้ให้รหัสนี้แต่ไม่ได้ผูกกับสาขาแล้ว
  //   (สร้างสาขาไม่สำเร็จ หรือสาขาถูกลบตรงที่ตารางจนกุญแจนอกล้างรหัสสาขาเป็นว่าง) — เคยค้างสะสม 12 แถว
  { const { error } = await admin.from("dealer_prospects").delete().eq("name", `ZZTEST-ผู้สนใจ-${code}`);
    if (error) พลาด.push(`dealer_prospects (ตามชื่อ): ${error.message}`); }

  // บัญชีเข้าระบบ: ทั้งที่ยังผูกโปรไฟล์กับสาขา และที่ค้างเป็นบัญชีกำพร้า (อีเมลขึ้นต้นด้วยรหัสสาขา)
  const ids = new Set<string>();
  const { data: profs } = await admin.from("profiles").select("id").eq("dealer_code", code);
  for (const p of profs ?? []) ids.add(String(p.id));
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of users?.users ?? []) if ((u.email ?? "").toLowerCase().startsWith(`${code.toLowerCase()}@`)) ids.add(u.id);
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error && !/not found/i.test(error.message)) พลาด.push(`บัญชี ${id.slice(0, 8)}: ${error.message}`);
  }

  await ลบ("dealers", "code");   // ค่าตั้ง · ตัวนับเลข · สำเนารหัสผ่าน หายตามกุญแจนอกแบบลบตาม
  return พลาด;
}

/** กวาดสาขาทดสอบที่ค้างทั้งหมด — ใช้ตอนเริ่มและตอนจบทั้งชุดเท่านั้น (global-setup / global-teardown)
 *  ⚠️ ห้ามเรียกจากข้อทดสอบ: ชุดทดสอบรันหลายไฟล์พร้อมกัน จะไปลบสาขาที่ไฟล์อื่นกำลังใช้อยู่ */
export async function กวาดสาขาทดสอบค้าง(client?: SupabaseClient): Promise<{ ลบแล้ว: string[]; พลาด: string[] }> {
  if (!ADMIN_SUPABASE_URL || !ADMIN_SERVICE_ROLE_KEY) return { ลบแล้ว: [], พลาด: [] };
  const admin = client ?? adminClient();
  const { data, error } = await admin.from("dealers").select("code").or("code.like.ZZ%,code.like.ZT%");
  if (error) return { ลบแล้ว: [], พลาด: [`อ่านรายชื่อสาขาไม่ได้: ${error.message}`] };
  const ลบแล้ว: string[] = [], พลาด: string[] = [];
  for (const { code } of data ?? []) {
    if (!เป็นรหัสสาขาทดสอบ(String(code))) continue;
    const err = await ลบสาขาทดสอบตรง(String(code), admin);
    if (err.length) พลาด.push(`${code} → ${err.join(" | ")}`); else ลบแล้ว.push(String(code));
  }
  return { ลบแล้ว, พลาด };
}
