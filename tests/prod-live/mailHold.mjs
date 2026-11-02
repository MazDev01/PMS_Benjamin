// ── ถือจดหมายของงานทดสอบไว้ไม่ให้ตัวส่งหยิบ (บอสสั่ง 1 พ.ย. 69) ─────────────────────────────────────────────────────
//   ตัวส่งอีเมล (pg_cron */15 → /api/cron/send-email · ใบ 0212) หยิบเฉพาะจดหมาย status = pending ที่ next_attempt_at ถึงแล้ว
//   ชุดทดสอบบนเว็บจริงสร้างเรื่องที่ฐานวางจดหมายถึงผู้รับแจ้งเตือน HQ (คนจริง) → เลื่อนเวลาออกไป 1 วัน · cleanup.sql ลบทิ้ง
//   จดหมายของงานทดสอบ = อ้างคำขอของสาขาทดสอบ · ถึงบัญชีชั่วคราว · หรือหัวเรื่อง/เนื้อความมีคำ ZZTEST
//   ⚠️ เงื่อนไขต้องตรงกับขั้นลบจดหมายใน cleanup.sql — ถือไว้แต่ cleanup ไม่ลบ = พรุ่งนี้ถูกส่งจริง
//   ข้อทดสอบ: tests/tools/live-mail-hold.test.mjs


/** แถวนี้เป็นจดหมายของงานทดสอบไหม (ใช้กับแถวที่อ่านมาแล้ว) */
export function เป็นจดหมายทดสอบ(m, code, คำขอทดสอบ) {
  if (/^live-.*@example\.test$/i.test(m.to_email ?? "")) return true;
  if (m.ref_table === "quote_requests" && คำขอทดสอบ.has(String(m.ref_id))) return true;
  const ข้อความ = `${m.subject ?? ""}\n${m.body ?? ""}`;
  return ข้อความ.includes("ZZTEST");
}

async function คำขอของสาขา(svc, code) {
  const { data, error } = await svc.from("quote_requests").select("id").in("dealer_code", [code, "ZZTN"]);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map(r => String(r.id)));
}

/** จดหมายของงานทดสอบทั้งหมด (ทุกสถานะ) */
export async function จดหมายทดสอบ(svc, code) {
  const คำขอ = await คำขอของสาขา(svc, code);
  const { data, error } = await svc.from("email_outbox").select("id, kind, status, to_email, subject, body, ref_table, ref_id")
    .gte("created_at", new Date(Date.now() - 6 * 3_600_000).toISOString());
  if (error) throw new Error(error.message);
  return (data ?? []).filter(m => เป็นจดหมายทดสอบ(m, code, คำขอ));
}

/** เลื่อนจดหมายของงานทดสอบที่ยังไม่ส่งออกไป 1 วัน · คืนจำนวนที่เลื่อน */
export async function เลื่อนจดหมายทดสอบ(svc, code) {
  const ค้าง = (await จดหมายทดสอบ(svc, code)).filter(m => m.status === "pending");
  if (!ค้าง.length) return 0;
  const { error } = await svc.from("email_outbox").update({ next_attempt_at: new Date(Date.now() + 86_400_000).toISOString() })
    .in("id", ค้าง.map(m => m.id)).eq("status", "pending");
  if (error) throw new Error(error.message);
  return ค้าง.length;
}

/** นาทีที่ห่างจากรอบส่งถัดไป (รอบส่งทุก 15 นาทีตรง :00 :15 :30 :45) */
export const นาทีก่อนรอบส่ง = (now = new Date()) => 15 - ((now.getUTCMinutes() % 15) + now.getUTCSeconds() / 60);

/** รอจนรอบส่งเพิ่งผ่านไป ≥ 1 นาที (เหลือเวลาก่อนรอบถัดไปอย่างน้อย `ต้องการ` นาที) */
export async function รอช่วงปลอดรอบส่ง({ ต้องการ = 12, now = () => new Date(), sleep = (ms) => new Promise(r => setTimeout(r, ms)), log = console.log } = {}) {
  const เหลือ = นาทีก่อนรอบส่ง(now());
  if (เหลือ >= ต้องการ && เหลือ <= 14) return 0;
  const รอ = (เหลือ + 1) * 60_000;   // ข้ามรอบส่งถัดไป แล้วเริ่มหลังรอบนั้น 1 นาที
  log(`⏳ รอรอบส่งอีเมลผ่านไปก่อน ${(รอ / 60_000).toFixed(1)} นาที (ให้ชุดทดสอบจบก่อนรอบส่งถัดไป)`);
  await sleep(รอ);
  return รอ;
}
