// ── WARNING ตอนลงใบปรับฐาน (supabase db reset / db push ลงใบแบบเดียวกัน · ไม่ห่อ transaction) ─────────────────────
//   เหตุ (คนรวมงาน 10 พ.ย. 69): db push ฐานจริงใบ 0284 ขึ้น WARNING "SET LOCAL can only be used in transaction blocks"
//     รอบตรวจลงใบด้วย supabase db reset ซึ่งขึ้น WARNING เดียวกัน แต่ reset-test-db ซ่อนผลไว้ → รอบตรวจไม่เห็น
//   กติกา: WARNING จากการลงใบ = ล้างฐานทดสอบไม่ผ่าน (รอบตรวจตก) · ยกเว้นใบที่ลงฐานจริงแล้ว (รายการกลาง ยกเว้นSetLocal · เฉพาะ 25P01)
//   ใช้โดย scripts/reset-test-db.mjs · scripts/check-migration-set-local.mjs · ข้อทดสอบ tests/unit/migrationWarnings.test.ts

/** ใบที่ลงฐานจริงแล้วและมี SET LOCAL ระดับบนสุด — ห้ามแก้ใบที่ลงแล้ว (ลายนิ้วมือใบ) · ใบใหม่ไม่มีทางยกเว้น */
const ลงแล้ว = "ลงฐานจริงแล้ว ห้ามแก้ใบที่ลงแล้ว (ลายนิ้วมือใบ) · ตอนลงไม่ได้ปิดตัวดักจริง";
export const ยกเว้นSetLocal = {
  "0250_lead_tasks_five_steps.sql": `${ลงแล้ว} — แปลงรายการงานลีด`,
  "0257_lead_old_status_retired.sql": `${ลงแล้ว} — เลิกใช้สถานะลีดเดิม`,
  "0260_sales_by_won_date.sql": `${ลงแล้ว} — วันตอบรับของใบ`,
  "0261_prospect_province_cleanup.sql": `${ลงแล้ว} — แปลงจังหวัดผู้สนใจ`,
  "0263_lead_tasks_collect_requirement_auto.sql": `${ลงแล้ว} — งานเก็บข้อมูล/สรุปความต้องการ`,
  "0284_lead_stage_four.sql": `${ลงแล้ว} — คนรวมงานตรวจฐานจริง 10 พ.ย. 69 ไม่มีผลเสีย (audit ไม่ลงเพราะ auth.uid ว่าง · ลีดขั้น 5 = 0 แถว · แม่แบบงาน 8 งานขั้น 1–4)`,
};

/** อ่านผลการลงใบ → WARNING แต่ละบรรทัดพร้อมใบที่กำลังลง  @returns {{ ใบ: string; ข้อความ: string; รหัส: string }[]} */
export function warningจากการลงใบ(ผล) {
  let ใบ = "";
  const ออก = [];
  for (const บรรทัด of String(ผล ?? "").split(/\r?\n/)) {
    const m = /Applying migration\s+([^\s.]+\.sql)/i.exec(บรรทัด);
    if (m) { ใบ = m[1]; continue; }
    const w = /\bWARNING\b\s*(?:\(([0-9A-Z]{5})\))?:?\s*(.*)$/.exec(บรรทัด);
    if (w) ออก.push({ ใบ, รหัส: w[1] ?? "", ข้อความ: w[2].trim() });
  }
  return ออก;
}

/** WARNING ที่ทำให้ตก (ไม่นับใบเก่าที่ยกเว้น เฉพาะ SET LOCAL 25P01) */
export function warningที่ตก(ผล) {
  return warningจากการลงใบ(ผล).filter(x => !(x.รหัส === "25P01" && /SET LOCAL/i.test(x.ข้อความ) && ยกเว้นSetLocal[x.ใบ]));
}
