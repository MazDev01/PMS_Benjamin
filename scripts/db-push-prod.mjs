// ── ทางเดียวที่ใช้ขึ้นใบแก้ฐานข้อมูลไป "ชุดจริง" ───────────────────────────────────────
//
// ทำไมต้องมี (12 ต.ค. 69 · ตัวกันชั้น 2):
//   เดิม CLI ผูกค้างกับฐานจริง → `npx supabase db push` เฉย ๆ ก็ลงฐานจริง
//   ตอนนี้ค่าปกติของเครื่องคือ "ไม่ผูก" (push ตรง ๆ จะล้มเพราะไม่รู้ปลายทาง)
//   ตัวนี้ผูก → ขึ้น → ปลดผูกให้เองในคำสั่งเดียว และสำรองข้อมูลก่อนเสมอ
//
// รัน: npm run db:push:prod -- --yes-prod            (ขึ้นจริง)
//      npm run db:push:prod -- --yes-prod --dry-run  (ดูว่าจะขึ้นใบไหน ไม่แตะฐาน)
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { loadTarget } from "./lib/targetEnv.mjs";

const args = process.argv.slice(2);
if (!args.includes("--yes-prod")) {
  console.error("❌ คำสั่งนี้แก้โครงฐานข้อมูลชุดจริง — ต้องใส่ --yes-prod เพื่อยืนยันว่าตั้งใจ");
  process.exit(1);
}
const dry = args.includes("--dry-run");
const { ref } = loadTarget();   // พิมพ์ "🎯 ฐานข้อมูลที่จะแตะ" ให้เห็นก่อน

const รัน = (cmd, a) => spawnSync(cmd, a, { stdio: "inherit", shell: true }).status === 0;
const ปลดผูก = () => {
  for (const f of ["project-ref", "linked-project.json", "pooler-url"]) rmSync(`supabase/.temp/${f}`, { force: true });
  console.log("\n🔓 ปลดการผูก CLI ออกจากฐานจริงแล้ว");
};

let ok = false;
try {
  if (!dry && !รัน("node", ["scripts/backup.mjs"])) throw new Error("สำรองข้อมูลไม่สำเร็จ — ไม่ขึ้นต่อ");
  if (!รัน("npx", ["supabase", "link", "--project-ref", ref])) throw new Error("ผูกโปรเจกต์ไม่สำเร็จ");
  รัน("npx", ["supabase", "migration", "list"]);
  ok = รัน("npx", ["supabase", "db", "push", ...(dry ? ["--dry-run"] : [])]);
} catch (e) {
  console.error(`\n❌ ${e.message}`);
} finally {
  ปลดผูก();
}
process.exit(ok ? 0 : 1);
