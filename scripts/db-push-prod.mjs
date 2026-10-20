// ── ทางเดียวที่ใช้ขึ้นใบแก้ฐานข้อมูลไป "ชุดจริง" ───────────────────────────────────────
//
// ทำไมต้องมี (12 ต.ค. 69 · ตัวกันชั้น 2):
//   เดิม CLI ผูกค้างกับฐานจริง → `npx supabase db push` เฉย ๆ ก็ลงฐานจริง
//   ตอนนี้ค่าปกติของเครื่องคือ "ไม่ผูก" (push ตรง ๆ จะล้มเพราะไม่รู้ปลายทาง)
//   ตัวนี้ผูก → ขึ้น → ปลดผูกให้เองในคำสั่งเดียว
//
// ขั้นตอนทุกครั้ง (บอสสั่ง 20 ต.ค. 69 หลังเหตุสำรองชนกับ db:push ตอน 09:32 — "แก้ที่เครื่องมือ ไม่ใช่ที่คน"):
//   1) ขอล็อก — มีการสำรอง/ซ้อมกู้/db:push อีกตัวรันกับฐานจริงอยู่ = หยุดทันที บอกว่ารออะไร (scripts/lib/prodLock.mjs)
//   2) สำรองเต็ม (โครง + ข้อมูล + ผู้ใช้ + ประวัติใบ) → ซ้อมกู้ลงฐานเปล่า → เทียบทุกตาราง (scripts/prod-backup-verify.mjs)
//      ไม่ตรงแม้ตารางเดียว = หยุด ไม่ลงใบ บอกเหตุผลภาษาไทย
//   3) ผูกฐานจริง → แสดงรายชื่อใบที่จะลง → supabase db push (ถาม [Y/n] ก่อนลงจริงเหมือนเดิม) → ปลดผูก
//
// รัน: npm run db:push:prod -- --yes-prod            (ขึ้นจริง)
//      npm run db:push:prod -- --yes-prod --dry-run  (ดูว่าจะขึ้นใบไหน ไม่แตะฐาน · ไม่ต้องสำรอง แต่ยังขอล็อก)
//
// โหมดทดสอบตัวเครื่องมือ (PMS_PUSH_TEST=1 · tests/tools/db-push-prod-guard.test.mjs): ไม่แตะฐานจริงเลย
//   สำรอง/ซ้อมกู้ใช้ฐานทดสอบในเครื่อง · ขั้นลงใบเปลี่ยนเป็นเขียนไฟล์บันทึก PMS_PUSH_TEST_MARKER ว่า "ถึงขั้นลงใบแล้ว"
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { loadTarget } from "./lib/targetEnv.mjs";
import { ขอล็อก } from "./lib/prodLock.mjs";

const args = process.argv.slice(2);
const ทดสอบ = process.env.PMS_PUSH_TEST === "1";
if (!ทดสอบ && !args.includes("--yes-prod")) {
  console.error("❌ คำสั่งนี้แก้โครงฐานข้อมูลชุดจริง — ต้องใส่ --yes-prod เพื่อยืนยันว่าตั้งใจ");
  process.exit(1);
}
if (ทดสอบ) console.log("🧪 โหมดทดสอบเครื่องมือ — ไม่แตะฐานจริง (สำรอง/ซ้อมกู้ใช้ฐานทดสอบในเครื่อง · ไม่ลงใบจริง)");
const dry = args.includes("--dry-run");
const { ref } = ทดสอบ ? { ref: "" } : loadTarget();   // พิมพ์ "🎯 ฐานข้อมูลที่จะแตะ" ให้เห็นก่อน

const ล็อก = ขอล็อก(dry ? "db:push:prod (ดูอย่างเดียว)" : "db:push:prod");
const envลูก = { ...process.env, PMS_PROD_LOCK_HELD: ล็อก.token };
// node เรียกตรงไม่ผ่าน shell (ไม่ต้องพึ่ง cmd.exe · ไม่มีคำเตือน DEP0190) — ชื่อโฟลเดอร์ภาษาไทยที่หายเคยโทษ shell แต่ต้นเหตุจริงอยู่ที่ตัวอ่านคำสั่ง (lib/backupArgs.mjs)
//   npx ต้องผ่าน shell บน Windows (เป็นไฟล์ .cmd)
const รัน = (cmd, a) => {
  const r = cmd === "node"
    ? spawnSync(process.execPath, a, { stdio: "inherit", shell: false, env: envลูก })
    : spawnSync(cmd, a, { stdio: "inherit", shell: true, env: envลูก });
  if (r.error) console.error(`   เรียกโปรแกรม ${cmd} ไม่ได้ (${r.error.code ?? r.error.message})`);
  return r.status === 0;
};
const ปลดผูก = () => {
  if (ทดสอบ) return;
  for (const f of ["project-ref", "linked-project.json", "pooler-url"]) rmSync(`supabase/.temp/${f}`, { force: true });
  console.log("\n🔓 ปลดการผูก CLI ออกจากฐานจริงแล้ว");
};

let ok = false;
try {
  if (!dry) {
    console.log("\n① สำรองเต็ม + ซ้อมกู้ ก่อนลงใบ");
    const ชื่อ = `${new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 19).replace(/[:T]/g, "-")}-ก่อน-db-push`;   // มีวินาที — สั่งซ้ำในนาทีเดียวกันไม่ชนชื่อเดิม
    if (!รัน("node", ["scripts/prod-backup-verify.mjs", ...(ทดสอบ ? ["--target", "local"] : []), ชื่อ])) {
      throw new Error("สำรองหรือซ้อมกู้ไม่ผ่าน — ไม่ลงใบ (เหตุผลอยู่ข้างบน) · แก้ให้ผ่านก่อนแล้วสั่งใหม่");
    }
  }
  if (ทดสอบ) {
    writeFileSync(process.env.PMS_PUSH_TEST_MARKER || "push-test-marker.txt", `ถึงขั้นลงใบ ${new Date().toISOString()}`);
    console.log("🧪 (โหมดทดสอบ) ถึงขั้นลงใบแล้ว — ไม่ได้ลงจริง");
    ok = true;
  } else {
    console.log("\n② ผูกฐานจริง → รายชื่อใบ → ลงใบ (ถาม [Y/n] ก่อนลงจริง)");
    if (!รัน("npx", ["supabase", "link", "--project-ref", ref])) throw new Error("ผูกโปรเจกต์ไม่สำเร็จ");
    if (!รัน("npx", ["supabase", "migration", "list"])) throw new Error("ดูรายชื่อใบที่จะลงไม่สำเร็จ — ไม่ลงใบ");
    ok = รัน("npx", ["supabase", "db", "push", ...(dry ? ["--dry-run"] : [])]);
  }
} catch (e) {
  console.error(`\n❌ ${e.message}`);
} finally {
  ปลดผูก();
  ล็อก.release();
}
process.exit(ok ? 0 : 1);
