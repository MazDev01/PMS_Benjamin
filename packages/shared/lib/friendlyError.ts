// Benjamin PMS — แปล error จาก Postgres/PostgREST/Supabase Auth เป็นข้อความไทยที่ผู้ใช้เข้าใจได้
// (Phase 8: Error Handling — Enterprise Production Readiness Mission, 31 ก.ค. 69)
//
// เดิม: จุดจับ error ทั่วแอป (onFail ของ SalesContext, หน้าตั้งค่า/ผู้ใช้/ดีลเลอร์ ฯลฯ) โชว์
// `e.message` ดิบให้ผู้ใช้เห็นตรงๆ — ข้อความจาก Postgres เป็นภาษาอังกฤษเทคนิคัลล้วน เช่น
// "duplicate key value violates unique constraint...", "new row violates row-level
// security policy for table...", "permission denied for table..." ผู้ใช้ทั่วไป (พนักงานขาย)
// อ่านไม่รู้เรื่อง ไม่รู้ว่าต้องทำอะไรต่อ — ฟังก์ชันนี้แปลรูปแบบที่พบบ่อยเป็นไทยที่ actionable
//
// DbError เก็บ Postgres error code ไว้ (must()/one() ใน SupabaseAdapter โยนเป็น DbError แทน
// Error ธรรมดา) — แม่นยำกว่าการเดาจาก message string ล้วน ๆ แต่ยัง fallback เป็น regex บน
// message ได้เมื่อไม่มี code (เช่น auth error, network error, RPC ที่ raise exception เอง)
export class DbError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "DbError";
    this.code = code;
  }
}

const THAI_RE = /[฀-๿]/;

// รองรับทั้ง instance ของ Error/DbError จริง และ error-like object ที่มีแค่ .message เป็น string
// (Supabase AuthError/PostgrestError บาง SDK version เป็น plain object ไม่ได้ extend Error class)
function hasMessage(e: unknown): e is { message: string; code?: string } {
  return typeof e === "object" && e !== null && typeof (e as { message?: unknown }).message === "string";
}

export function friendlyError(e: unknown, fallback = "เกิดข้อผิดพลาด — ลองใหม่อีกครั้ง"): string {
  if (!hasMessage(e)) return fallback;
  const msg = e.message;
  const code = e instanceof DbError ? e.code : (e as { code?: string }).code;

  // RPC ที่เราเขียนเองส่วนใหญ่ raise exception เป็นไทยอยู่แล้ว (เช่น "ไม่มีสิทธิ์แก้พนักงานขายของสาขานี้")
  // — ข้อความแบบนี้อ่านเข้าใจได้เลย ใช้ตรง ๆ ไม่ต้องแปลซ้ำ
  // ตัดรหัสข้อผิดพลาดที่ RPC ติดหน้ามาออก (เช่น "no_sent_quotation: …" · "id_conflict:…")
  // — รหัสนั้นมีไว้ให้โค้ดฝั่งแอปแยกเคส ไม่ใช่สิ่งที่ผู้ใช้ต้องอ่าน
  if (THAI_RE.test(msg)) return msg.replace(/^[a-z0-9_]+:\s*/i, "");

  // RPC บางตัว raise exception เป็น "forbidden: ..." (ภาษาอังกฤษ) — เคสสิทธิ์ที่เจาะจงได้
  if (/^forbidden:/i.test(msg)) return "ไม่มีสิทธิ์ทำรายการนี้";

  // Postgres error code (แม่นยำกว่า regex บน message)
  switch (code) {
    case "23505": return "มีข้อมูลนี้อยู่แล้วในระบบ — กรุณาตรวจสอบก่อนบันทึกซ้ำ";
    case "23503": return "ทำรายการไม่ได้ — ยังมีข้อมูลอื่นผูกอยู่กับรายการนี้";
    case "23514": return "ข้อมูลไม่ผ่านเงื่อนไขที่ระบบกำหนด — กรุณาตรวจสอบค่าที่กรอก";
    case "42501": return "ไม่มีสิทธิ์ทำรายการนี้";
    case "PGRST116": return "ไม่พบข้อมูลที่ต้องการ — อาจถูกลบหรือย้ายไปแล้ว";
  }

  // ไม่มี code (auth/network/PostgREST message ทั่วไป) — จับ pattern จาก message
  if (/duplicate key value violates unique constraint/i.test(msg)) return "มีข้อมูลนี้อยู่แล้วในระบบ — กรุณาตรวจสอบก่อนบันทึกซ้ำ";
  if (/violates foreign key constraint/i.test(msg)) return "ทำรายการไม่ได้ — ยังมีข้อมูลอื่นผูกอยู่กับรายการนี้";
  if (/violates row-level security policy|permission denied/i.test(msg)) return "ไม่มีสิทธิ์ทำรายการนี้";
  if (/violates check constraint/i.test(msg)) return "ข้อมูลไม่ผ่านเงื่อนไขที่ระบบกำหนด — กรุณาตรวจสอบค่าที่กรอก";
  // ── ที่เก็บไฟล์ตอบคนละรูปแบบกับฐานข้อมูล (ไม่มีช่อง code) — ต้องแกะจากข้อความ ──
  //   ไม่แปลจะกลายเป็น "เกิดข้อผิดพลาด" ลอย ๆ ทั้งที่เป็นเรื่องที่ผู้ใช้แก้เองได้
  if (/mime type .* is not supported|InvalidMimeType/i.test(msg)) return "ชนิดไฟล์นี้ไม่รองรับ";
  if (/exceeded the maximum allowed size|Payload too large|EntityTooLarge/i.test(msg)) return "ไฟล์ใหญ่เกินที่ระบบรับได้";
  if (/JWT expired|invalid.*token|refresh_token/i.test(msg)) return "เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่";
  if (/new password should be different/i.test(msg)) return "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม";
  if (/password.*should be at least|password.*too short/i.test(msg)) return "รหัสผ่านสั้นเกินไป — ต้องยาวอย่างน้อย 8 ตัวอักษร";
  if (/user not found|invalid login credentials/i.test(msg)) return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
  if (/failed to fetch|network|fetch\s*error/i.test(msg)) return "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่";

  return fallback;
}
