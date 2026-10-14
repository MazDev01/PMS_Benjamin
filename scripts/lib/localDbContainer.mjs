// ── หาคอนเทนเนอร์ฐานข้อมูลของ "ฐานทดสอบที่แอปใช้อยู่ตอนนี้" ─────────────────────────────
//
// ทำไมต้องมี (13 ต.ค. 69): เครื่องพัฒนามีฐานทดสอบได้มากกว่าหนึ่งตัว (ตัวเดิม · ตัวที่สร้างจากใบล้วน ๆ)
//   ตัวตรวจฐานข้อมูลเดิมเขียนชื่อคอนเทนเนอร์ตายตัว → สลับฐานที่แอปใช้แล้ว ตัวตรวจยังไปตรวจฐานเก่าโดยไม่มีอะไรบอก
//   ตัวนี้อ่าน apps/hq/.env.local (ไฟล์เดียวกับที่แอปและชุดทดสอบใช้) แล้วหาคอนเทนเนอร์จากพอร์ตนั้น
//
// ลำดับ: ตัวแปร PMS_DB_CONTAINER (สั่งเอง) → คอนเทนเนอร์ที่เปิดพอร์ตของ NEXT_PUBLIC_SUPABASE_URL → ชื่อเดิม
import { execFileSync } from "node:child_process";
import { readEnvFile } from "./targetEnv.mjs";

const ชื่อเดิม = "supabase_db_Benjamin-HQ-main";

export function localDbContainer() {
  if (process.env.PMS_DB_CONTAINER) return process.env.PMS_DB_CONTAINER;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? readEnvFile("apps/hq/.env.local").NEXT_PUBLIC_SUPABASE_URL ?? "";
  const port = (url.match(/^https?:\/\/(?:127\.0\.0\.1|localhost):(\d+)/) ?? [])[1];
  if (!port) return ชื่อเดิม;
  try {
    // คอนเทนเนอร์ที่เปิดพอร์ต API คือ supabase_kong_<ชื่อโปรเจกต์> — ฐานข้อมูลของโปรเจกต์เดียวกันคือ supabase_db_<ชื่อโปรเจกต์>
    const names = execFileSync("docker", ["ps", "--filter", `publish=${port}`, "--format", "{{.Names}}"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).split(/\r?\n/).filter(Boolean);
    const kong = names.find(n => n.startsWith("supabase_kong_"));
    if (kong) return "supabase_db_" + kong.slice("supabase_kong_".length);
  } catch { /* ไม่มี Docker — ให้ผู้เรียกจัดการตอนต่อไม่ได้ */ }
  return ชื่อเดิม;
}
