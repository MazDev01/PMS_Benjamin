// ── อาร์กิวเมนต์ docker สำหรับ psql ของฐานทดสอบ (แยกจาก testDbGuard.mjs · 26 ต.ค. 69) ───────────────────────────────────
// ไฟล์นี้ข้อทดสอบ TypeScript ดึงไปใช้ตรง ๆ — ตัวรัน playwright แปลงเป็น CommonJS แล้วตัวโหลดของ Node มองไม่เห็นชื่อส่งออกภาษาไทย
//   ไม่มี import.meta · ไม่ดึงไฟล์อื่น · โปรแกรม ESM แท้ (สคริปต์ · testDbLock) ใช้ testDbGuard.mjs (อาร์กิวเมนต์psql) ตรรกะเดียวกัน
//   ข้อทดสอบหน่วยเทียบว่าสองตัวให้ผลตรงกัน (tests/unit/testDbPsql.test.ts)
// ฐานทดสอบ + เขียน = บัญชี pms_writer รหัสจาก env ที่ได้ตอนขอล็อก (ไม่ถือล็อก = หยุดพร้อมบอก) · อ่าน = pms_reader (ไม่ต้องถือล็อก)
// คอนเทนเนอร์อื่น (ฐาน dev · ฐานเปล่า · ฐานซ้อมกู้) = แบบเดิม
export const TESTDB_CONTAINER = process.env.PMS_TESTDB_CONTAINER || "supabase_db_pms-dbcheck";

export function psqlArgs(container, { write = true } = {}) {
  if (container !== TESTDB_CONTAINER) return ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres"];
  if (!write) return ["exec", "-i", "-e", "PGPASSWORD=pms_reader", container, "psql", "-h", "127.0.0.1", "-U", "pms_reader", "-d", "postgres"];
  const key = process.env.PMS_TESTDB_PG_PASSWORD;
  if (!key) throw new Error("เขียนฐานทดสอบต้องถือล็อกก่อน (ขอล็อกฐานทดสอบ · scripts/lib/testDbLock.mjs) — ไม่มี PMS_TESTDB_PG_PASSWORD");
  return ["exec", "-i", "-e", `PGPASSWORD=${key}`, container, "psql", "-h", "127.0.0.1", "-U", "pms_writer", "-d", "postgres"];
}
