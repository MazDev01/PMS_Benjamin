// ── ล้างฐานซ้อมกู้ (supabase db reset) · ลองใหม่ 1 ครั้งเฉพาะอาการคอนเทนเนอร์เตรียมโครงฐานล้ม ─────────────────────────
//   ต้นเหตุไม่นิ่ง (tool-suites-db · db-push-prod-guard ครั้งที่ 3 · 2 พ.ย. 69): ขั้น "Initialising schema..." ของ db reset
//   เปิดคอนเทนเนอร์ชั่วคราวของ Realtime (migrate + seed + health check) แล้วล้มเป็นครั้งคราว "error running container: exit 1"
//   ไม่เกี่ยวกับไฟล์สำรอง · รันซ้ำทันทีผ่าน (ลองด้วยมือ 2 พ.ย. 69) · ล้างฐานซ้อมกู้ในเครื่อง = ทำซ้ำได้ ไม่แตะฐานจริง
//   ลองใหม่เฉพาะอาการนี้ (ไม่รอ ไม่เพิ่มเวลา) · อาการอื่น = ล้มทันทีเหมือนเดิม
//   ข้อทดสอบ: tests/tools/restore-reset.test.mjs
export const อาการเตรียมโครงฐานล้ม = (out) => /Initialising schema/.test(out) && /error running container: exit \d+/.test(out);

/** @param {() => {status: number|null, stdout?: string, stderr?: string}} ล้าง · คืนผลครั้งสุดท้าย + จำนวนครั้ง */
export function ล้างฐานซ้อมกู้(ล้าง, log = console.log) {
  let r = ล้าง(), ครั้ง = 1;
  const ออก = (x) => `${x.stdout ?? ""}\n${x.stderr ?? ""}`;
  if (r.status !== 0 && อาการเตรียมโครงฐานล้ม(ออก(r))) {
    log("   ล้างฐานซ้อมกู้: คอนเทนเนอร์เตรียมโครงฐาน (Realtime) ล้ม — ลองใหม่ 1 ครั้ง");
    r = ล้าง(); ครั้ง = 2;
  }
  return { ...r, ครั้ง };
}
