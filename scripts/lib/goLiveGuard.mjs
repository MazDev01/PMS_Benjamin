// ── ตัวกันของ go-live-reset: ระบบเปิดใช้จริงแล้วหรือยัง (บอสสั่ง 19 ต.ค. 69) ──────────────────────────────────
//   มีคำขอราคาของดีลเลอร์จริง (รหัสสาขาไม่ขึ้นต้น ZZ) แม้แถวเดียว = เปิดใช้จริงแล้ว → ห้ามล้างงานขาย/รีเซ็ตตัวนับเลขเอกสาร
//   ตรวจไม่ได้ (ฐานตอบผิดพลาด) = ถือว่าเปิดใช้จริงแล้ว (ปลอดภัยไว้ก่อน)
//   ใช้ใน scripts/go-live-reset.mjs · ข้อทดสอบ tests/unit/goLiveGuard.test.ts
/** @param {import("@supabase/supabase-js").SupabaseClient} svc
 *  @returns {Promise<{ หยุด: boolean, จำนวน: number | null, เหตุผล: string }>} */
export async function ตรวจระบบเปิดใช้จริง(svc) {
  const { count, error } = await svc.from("quote_requests").select("id", { count: "exact", head: true }).not("dealer_code", "like", "ZZ%");
  if (error) return { หยุด: true, จำนวน: null, เหตุผล: `ตรวจไม่ได้ (${error.message}) — ถือว่าเปิดใช้จริงแล้ว` };
  const n = count ?? 0;
  return n > 0
    ? { หยุด: true, จำนวน: n, เหตุผล: `ระบบมีคำขอราคาของดีลเลอร์จริง ${n} รายการ = เปิดใช้จริงแล้ว — ล้างข้อมูล/รีเซ็ตตัวนับไม่ได้อีก` }
    : { หยุด: false, จำนวน: 0, เหตุผล: "ยังไม่มีคำขอราคาของดีลเลอร์จริง" };
}
