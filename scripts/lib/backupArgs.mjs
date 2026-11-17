// ── อ่านคำสั่งของ prod-backup-verify.mjs: [--target prod|local] [ชื่อโฟลเดอร์] ───────────────────────────────────
// แยกออกมาให้ทดสอบตรงได้ (tests/unit/backupArgs.test.ts)
// บั๊กเดิม (พบ 20 ต.ค. 69): ตัดคำที่ "ตามหลัง --target" ด้วยเงื่อนไข i !== ti + 1 — ถ้าไม่มี --target (ti = -1) จะตัดคำแรกทิ้ง
//   คำแรกในโหมดฐานจริงคือชื่อโฟลเดอร์ที่ db-push ตั้งให้ → ได้ชื่อตั้งต้น "…-prod" แทน "…-ก่อน-db-push"
/** ข้อความผิดพลาดของคำสั่งดึงไฟล์สำรอง (supabase db dump) ย่อให้แนบในข้อความ "ไม่ผ่าน" ได้ (17 พ.ย. 69)
 *  เหตุ: รอบ deploy23 ขั้นดึงไฟล์สำรองล้ม "คำสั่งจบด้วยรหัส 1" 9 ข้อย่อยแล้วผ่านตอนรันซ้ำ · รายละเอียดอยู่ใน .dump.log
 *  ในโฟลเดอร์ชั่วคราวที่ข้อทดสอบลบทิ้ง → ไม่เหลือหลักฐานว่าล้มเพราะอะไร · แนบบรรทัดที่บอกเหตุไว้ในข้อความเลย
 *  เอาบรรทัดที่มีคำบอกความผิดพลาดก่อน ไม่มีก็บรรทัดท้าย · ไม่เกิน 3 บรรทัด 400 ตัว · ซ่อนรหัสผ่านใน URL ฐาน */
export function ย่อข้อผิดพลาดdump(ข้อความ) {
  const บรรทัด = String(ข้อความ ?? "").split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    .filter(l => !/DeprecationWarning|--trace-deprecation/.test(l))
    .map(l => l.replace(/(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s]+@/gi, "$1***@"));
  const เด่น = บรรทัด.filter(l => /error|failed|fatal|pg_dump|denied|refused|deadlock|lock/i.test(l));
  const เลือก = (เด่น.length ? เด่น : บรรทัด).slice(-3).join(" | ");
  return เลือก.length > 400 ? `${เลือก.slice(0, 400)}…` : เลือก;
}

export function อ่านคำสั่งสำรอง(args, now = new Date()) {
  const ti = args.indexOf("--target");
  const target = ti >= 0 ? args[ti + 1] : "prod";
  const ชื่อ = args.filter((a, i) => !a.startsWith("--") && !(ti >= 0 && i === ti + 1))[0]
    ?? `${new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 19).replace(/[:T]/g, "-")}-${target}`;
  return { target, ชื่อ };
}
