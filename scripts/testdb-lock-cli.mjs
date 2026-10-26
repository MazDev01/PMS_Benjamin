// ── คำสั่งช่วยขอ/ปล่อยล็อกฐานทดสอบแทนโปรเซสอื่น (26 ต.ค. 69) ─────────────────────────────────────────────────────────
// ใช้กับ playwright.config.ts: ตัวตั้งค่าโหลดแบบ CommonJS ดึงไฟล์ล็อก (ESM ที่ใช้ import.meta) ตรง ๆ ไม่ได้
//   acquire --pid <ตัวแม่> --job <งาน> [--wait <นาที>]  → ขอล็อกในนามตัวแม่ (pid ในไฟล์ล็อก = ตัวแม่) · พิมพ์ env (JSON) ให้ตัวแม่ใส่เอง
//   release --token <รหัสล็อก> --key <กุญแจ>            → ปล่อย (ตัวแม่เรียกตอนจบ)
// มีงานอื่นถือล็อก = หยุด exit 3 พร้อมบอกว่าใคร (เหมือนขอเอง)
import { ขอล็อกฐานทดสอบ, ปล่อยล็อกฐานทดสอบ } from "./lib/testDbLock.mjs";

const [คำสั่ง, ...a] = process.argv.slice(2);
const ค่า = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
if (คำสั่ง === "acquire") {
  const pid = Number(ค่า("--pid"));
  if (!Number.isInteger(pid) || pid <= 0) { console.error("ต้องระบุ --pid ของโปรเซสที่ถือล็อก"); process.exit(2); }
  const ล็อก = ขอล็อกฐานทดสอบ(ค่า("--job") ?? "ไม่ระบุงาน", { รอนาที: Number(ค่า("--wait") ?? 0), เจ้าของ: pid });
  const env = Object.fromEntries(["PMS_TESTDB_LOCK_HELD", "PMS_TESTDB_PG_PASSWORD", "NEXT_PUBLIC_PMS_TESTDB_LOCK", "NODE_OPTIONS"].map(k => [k, process.env[k] ?? ""]));
  env.PMS_TESTDB_LOCK_HELD = ล็อก.token;
  process.stdout.write(JSON.stringify(env));
} else if (คำสั่ง === "release") {
  ปล่อยล็อกฐานทดสอบ(ค่า("--token"), ค่า("--key"));
} else {
  console.error("ใช้: node scripts/testdb-lock-cli.mjs acquire --pid <pid> --job <งาน> [--wait <นาที>] | release --token <รหัส> --key <กุญแจ>");
  process.exit(2);
}
