// ── ตัวตรวจ: อีเมลแจ้งเตือนพร้อมก่อนขึ้นระบบหรือยัง (ด่าน 1 · ใบ 0193) ─────────────────────────────
//
// ไม่พร้อม = จดหมาย (คำขอใหม่ · เกิน 14 วัน · ยกเลิก · ขอแก้ราคา) ค้างอยู่ในกล่องขาออกเงียบ ๆ ไม่มีใครได้รับ
//   ซึ่งตรงข้ามกับเหตุผลที่ FLOW.html ให้นับ 14 วัน: ให้คนรู้ก่อนลูกค้ารอนานเกิน
//
// แยกเป็นฟังก์ชันล้วนเพื่อให้ทดสอบได้ (tests/unit/emailPreflight.test.ts) · preflight.mjs เป็นคนป้อนค่า

/** ค่าตั้ง SMTP และกุญแจงานตั้งเวลา
 *  ⚠️ ค่าที่มีผลจริงตอนขึ้นระบบตั้งบน Vercel — ไฟล์ในเครื่องบอกได้แค่ว่าผู้ขึ้นระบบมีค่าชุดนั้นอยู่ในมือ
 * @param {Record<string, string | undefined>} env */
export function ตรวจค่าSMTP(env) {
  const ขาด = ["SMTP_HOST", "SMTP_FROM", "CRON_SECRET"].filter(k => !(env[k] ?? "").trim());
  if (ขาด.length) return { ok: false, detail: `ยังไม่ได้ตั้ง ${ขาด.join(", ")} — อีเมลแจ้งเตือนจะค้างในกล่องขาออก ไม่ถึงใคร` };
  if (/^(localhost|127\.|0\.0\.0\.0|::1)/.test(String(env.SMTP_HOST).trim())) {
    return { ok: false, detail: `SMTP_HOST = ${env.SMTP_HOST} คือกล่องจดหมายทดสอบในเครื่อง — ต้องเป็นเซิร์ฟเวอร์อีเมลของบริษัท (ดู docs/ตั้งค่าอีเมลบริษัท-SMTP.md)` };
  }
  return { ok: true, detail: `${env.SMTP_HOST} · ผู้ส่ง ${env.SMTP_FROM} · ค่าที่ใช้จริงต้องตั้งบน Vercel ให้ตรงกัน` };
}

/** รายชื่อผู้รับแจ้งเตือนของสำนักงานใหญ่ (hq_notif_rules.email_recipients)
 * @param {{ recipients: string[] | null }} x  null = ฐานนี้ยังไม่มีช่องผู้รับ */
export function ตรวจผู้รับของHQ({ recipients }) {
  if (recipients === null || recipients === undefined) {
    return { ok: false, detail: "ฐานนี้ยังไม่มีช่องผู้รับแจ้งเตือน — ขึ้นใบ 0193 ก่อน แล้วตั้งผู้รับในหน้าตั้งค่าแจ้งเตือนของ HQ" };
  }
  if (!recipients.length) return { ok: false, detail: "ยังไม่มีผู้รับ — ตั้งในหน้าตั้งค่า › แจ้งเตือน ไม่งั้นคำขอใหม่และคำขอเกิน 14 วันไม่ถึงใครเลย" };
  return { ok: true, detail: `${recipients.length} ราย` };
}
