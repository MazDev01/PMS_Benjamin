// ── ขอล็อกฐานทดสอบก่อนรันข้อทดสอบทุกชุด (scripts/lib/testDbLock.mjs · บอสสั่ง 22 ต.ค. 69) ──────────────────────────
//   เรียกจาก global-setup.ts (ทุก config ที่มีข้อมูลตั้งต้น) และเป็น globalSetup ของ playwright.existing.config.ts
//   ถือไว้จนโปรเซสของ playwright จบ (ปล่อยเองตอนออก) · รอบตรวจเต็มถือให้แล้ว (PMS_TESTDB_LOCK_HELD) → ผ่านเลย
//   มีเซสชันอื่นใช้ฐานอยู่ = หยุดทันที บอกว่าเซสชันไหน เริ่มเมื่อไร · อยากรอคิว: PMS_TESTDB_LOCK_WAIT=<นาที>
export async function ขอล็อกฐานทดสอบก่อนรัน(): Promise<void> {
  const { ขอล็อกฐานทดสอบ } = await import("../../scripts/lib/testDbLock.mjs");
  const ล็อก = ขอล็อกฐานทดสอบ("playwright (ข้อทดสอบ)");
  process.env.PMS_TESTDB_LOCK_HELD = ล็อก.token;   // ตัวช่วยที่เรียกสคริปต์ลูก (seed/ล้าง) ใช้ล็อกเดียวกัน
}
export default ขอล็อกฐานทดสอบก่อนรัน;
