// ── env ของตัวลูกที่ต้องแยกจากรอบตรวจเต็ม (รอบ deploy22 ครั้งที่ 4 ล้ม 16 พ.ย. 69) ─────────────────────────────────────────────
//   ข้อทดสอบเครื่องมือที่รัน playwright/สคริปต์ซ้อน (flaky-ack · gate-rerun …) เดิมส่ง env ของรอบทั้งชุดให้ตัวลูก
//   → ตัวลูกได้ token/รหัสเขียนฐานทดสอบของรอบ · ที่อยู่รายงาน JSON ของรอบ · โฟลเดอร์บันทึกของรอบ · พอร์ตเว็บของรอบ
//   ตัวนี้ตัดทุกค่าที่เป็นของรอบ/ล็อก/ตัวรัน playwright ออก — ตัวลูกเริ่มเหมือนเปิดหน้าต่างคำสั่งใหม่
//   ข้อทดสอบ: tests/tools/nested-playwright-isolation.test.mjs
const ของรอบ = /^(PMS_TESTDB_|PMS_GATE_|PMS_RUN_|PMS_SERVER_LOG_DIR$|PMS_DIST_DIR$|PMS_TEST_DIST_DIR$|PMS_HQ_ORIGIN$|PMS_DEALER_ORIGIN$|PMS_LOCAL_HTTP_TEST$|PMS_DB_TARGET$|PMS_GLOBAL_SETUP_SKIP$|PLAYWRIGHT_|PW_|TEST_WORKER_INDEX$|TEST_PARALLEL_INDEX$|NODE_OPTIONS$)/;

/** env ของตัวลูกโดยไม่มีของรอบ (+ ค่าที่ผู้เรียกใส่เพิ่ม) */
export function envตัวลูกแยกจากรอบ(env = process.env, เพิ่ม = {}) {
  return { ...Object.fromEntries(Object.entries(env).filter(([k]) => !ของรอบ.test(k))), ...เพิ่ม };
}
