// ── อ่านคำสั่งของ prod-backup-verify.mjs: [--target prod|local] [ชื่อโฟลเดอร์] ───────────────────────────────────
// แยกออกมาให้ทดสอบตรงได้ (tests/unit/backupArgs.test.ts)
// บั๊กเดิม (พบ 20 ต.ค. 69): ตัดคำที่ "ตามหลัง --target" ด้วยเงื่อนไข i !== ti + 1 — ถ้าไม่มี --target (ti = -1) จะตัดคำแรกทิ้ง
//   คำแรกในโหมดฐานจริงคือชื่อโฟลเดอร์ที่ db-push ตั้งให้ → ได้ชื่อตั้งต้น "…-prod" แทน "…-ก่อน-db-push"
export function อ่านคำสั่งสำรอง(args, now = new Date()) {
  const ti = args.indexOf("--target");
  const target = ti >= 0 ? args[ti + 1] : "prod";
  const ชื่อ = args.filter((a, i) => !a.startsWith("--") && !(ti >= 0 && i === ti + 1))[0]
    ?? `${new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 19).replace(/[:T]/g, "-")}-${target}`;
  return { target, ชื่อ };
}
