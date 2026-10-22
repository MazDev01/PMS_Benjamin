// ── จองเลขใบปรับฐานถัดไป + สร้างไฟล์ (บอสสั่ง 22 ต.ค. 69) ───────────────────────────────────────────────────────────
//
// เหตุ: หลายเซสชันทำงานพร้อมกัน แต่ละเซสชันเห็นแค่ใบในโฟลเดอร์ของตัวเอง → ตั้งเลขชนกันได้ (เคยต้องจองเลขทางข้อความ)
// ใช้: npm run migration:new -- <ชื่อภาษาอังกฤษ_ตัวเล็ก>      เช่น npm run migration:new -- quote_updated_at
// วิธี (ทั้งหมดภายใต้ล็อกจองเลข — สองเซสชันสั่งพร้อมกันได้คนละเลขเสมอ):
//   ดูเลขสูงสุดจากทุกที่: ทุก branch (session/* · monorepo · main · wip/* ทั้งในเครื่องและที่ดึงจาก GitHub)
//   + ไฟล์ใบที่ยังไม่ commit ในทุกโฟลเดอร์เซสชัน (git worktree list) + เลขที่จองไว้แล้ว
//   → เลขถัดไป จดลงบันทึกการจอง (<git common dir>/pms-migration-reservations.json · ใช้ร่วมทุกโฟลเดอร์) → สร้างไฟล์เปล่า
// ตัวตรวจคู่กัน: scripts/check-migration-numbers.mjs (เลขซ้ำ/ข้ามเลขในโค้ด → รอบตรวจเต็มตก)
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ตัวล็อก } from "./lib/fileLock.mjs";
import { ชื่อเซสชัน } from "./lib/session.mjs";

const cwd = process.cwd();
const git = (...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const ชื่อ = process.argv[2] ?? "";
if (!/^[a-z0-9]+(_[a-z0-9]+)*$/.test(ชื่อ)) {
  console.error("ใช้: npm run migration:new -- <ชื่อ> · ชื่อเป็นภาษาอังกฤษตัวเล็ก/ตัวเลข คั่นด้วย _ เช่น quote_updated_at");
  process.exit(2);
}
export const ไฟล์จอง = () => process.env.PMS_MIGRATION_RESERVATIONS
  || path.resolve(cwd, git("rev-parse", "--git-common-dir"), "pms-migration-reservations.json");
const อ่านจอง = () => { try { return JSON.parse(readFileSync(ไฟล์จอง(), "utf8")); } catch { return []; } };
const เลขจากชื่อ = f => Number(/^(\d{4})_[^/]*\.sql$/.exec(path.basename(f))?.[1] ?? 0);

const ล็อก = ตัวล็อก({ path: process.env.PMS_MIGRATION_LOCK || path.join(os.homedir(), ".pms-migration-number.lock"),
  envHeld: "PMS_MIGRATION_LOCK_HELD", เรื่อง: "จองเลขใบปรับฐาน", เซสชัน: ชื่อเซสชัน() })(`จองเลขใบ ${ชื่อ}`, { รอ: 60_000 });
try {
  const ที่มา = [];
  // 1) ทุก branch ที่เกี่ยว (ในเครื่อง + ที่ดึงจาก GitHub ล่าสุด)
  const refs = git("for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes").split("\n")
    .filter(r => /^refs\/(heads|remotes\/[^/]+)\/(session\/|wip\/|monorepo$|main$)/.test(r));
  for (const r of refs) {
    for (const f of git("ls-tree", "--name-only", r, "supabase/migrations/").split("\n")) if (เลขจากชื่อ(f)) ที่มา.push([เลขจากชื่อ(f), r]);
  }
  // 2) ใบที่ยังไม่ commit ในทุกโฟลเดอร์เซสชัน
  const โฟลเดอร์ = git("worktree", "list", "--porcelain").split("\n").filter(l => l.startsWith("worktree ")).map(l => l.slice(9));
  for (const w of โฟลเดอร์) {
    const d = path.join(w, "supabase/migrations");
    if (existsSync(d)) for (const f of readdirSync(d)) if (เลขจากชื่อ(f)) ที่มา.push([เลขจากชื่อ(f), w]);
  }
  // 3) เลขที่จองไว้แล้ว (ยังไม่ได้สร้างไฟล์ก็กันไว้)
  const จอง = อ่านจอง();
  for (const j of จอง) ที่มา.push([Number(j.เลข), `จอง:${j.เซสชัน}`]);

  const สูงสุด = Math.max(0, ...ที่มา.map(([n]) => n));
  const เลข = String(สูงสุด + 1).padStart(4, "0");
  const ไฟล์ = path.join(cwd, "supabase/migrations", `${เลข}_${ชื่อ}.sql`);
  จอง.push({ เลข, ชื่อ, เซสชัน: ชื่อเซสชัน(), โฟลเดอร์: cwd, จองเมื่อ: new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 19).replace("T", " ") });
  writeFileSync(ไฟล์จอง(), JSON.stringify(จอง, null, 1) + "\n");
  writeFileSync(ไฟล์, `-- ── ใบ ${เลข}: ${ชื่อ} (จองโดยเซสชัน ${ชื่อเซสชัน()} · npm run migration:new) ──\n-- อธิบายว่าทำไมต้องมีใบนี้ · ข้อทดสอบ: supabase/tests/<ไฟล์>.sql\n\n`, { flag: "wx" });
  console.log(`✓ จองเลข ${เลข} ให้เซสชัน ${ชื่อเซสชัน()} — สร้างไฟล์ ${path.relative(cwd, ไฟล์).replaceAll("\\", "/")}`);
  console.log(`   (ดูจาก ${refs.length} branch · ${โฟลเดอร์.length} โฟลเดอร์ · จองไว้ก่อน ${จอง.length - 1} เลข · สูงสุดเดิม ${String(สูงสุด).padStart(4, "0")})`);
} finally {
  ล็อก.release();
}
