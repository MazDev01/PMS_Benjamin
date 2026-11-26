// ── ตัวกลางที่อยู่โฟลเดอร์ในเครื่อง (บอสเลือก 24 พ.ย. 69 "ย้ายเข้า Benjamin-HQ-main") ─────────────────────────────────────
//   เดิมโฟลเดอร์ทำงานในเครื่องกระจายอยู่ C:/.claude/pms-* (โฟลเดอร์เซสชัน · ฐานทดสอบ · ฐาน dev · รอบตรวจ · ที่ผูกฐานจริง ฯลฯ)
//   ที่ใหม่ = โฟลเดอร์เดียว <โฟลเดอร์หลักของ repo>/.local/ — git ไม่เก็บทั้งโฟลเดอร์ (.gitignore /.local/ · repo เป็น public)
//   ตัวกันหลุดขึ้น GitHub: scripts/lib/localGuard.mjs (pre-commit · pre-push) · ข้อทดสอบ tests/tools/local-folder.test.mjs
//
// ราก .local: PMS_LOCAL_ROOT (ข้อทดสอบ/เครื่องอื่น) หรือ <โฟลเดอร์หลัก>/.local
//   โฟลเดอร์หลักหาจาก git rev-parse --git-common-dir ของ cwd (ค่าเริ่ม = โฟลเดอร์ที่สั่งรัน · npm/hook รันจากรากโฟลเดอร์อยู่แล้ว)
//   ห้ามใช้ import.meta ในไฟล์นี้ — ข้อทดสอบ Playwright (spec .ts) import ไฟล์นี้แบบ CommonJS แล้วโหลดไม่ได้ทั้งไฟล์ (เจอ 26 พ.ย. 69)
//   — โฟลเดอร์เซสชัน (worktree ใน .local/wt/<ชื่อ>) ได้รากเดียวกับโฟลเดอร์หลัก
//   ไม่ใช่ .local ซ้อนในโฟลเดอร์เซสชัน · ไม่ใช่ repo ของ git (เช่น git archive) = ใช้ cwd
// ช่วงก่อนย้ายจริง (scripts/move-local.mjs): ที่ใหม่ยังไม่มี แต่ที่เดิม C:/.claude/pms-<ชื่อ> ยังอยู่ = ใช้ที่เดิม
//   ตัดสินทีละโฟลเดอร์ · ย้ายแล้วที่ใหม่มีอยู่ = ใช้ที่ใหม่เสมอ · ไม่มีทั้งคู่ = ที่ใหม่ (สร้างที่ใหม่)
//   PMS_LEGACY_ROOT เปลี่ยนรากที่เดิมได้ (ข้อทดสอบ) · ค่า "-" = ไม่ดูที่เดิมเลย
// env เดิมเฉพาะโฟลเดอร์ (PMS_WT_ROOT · PMS_TEST_DB_DIR · PMS_DEV_DB_DIR · PMS_PROD_OPS_DIR · PMS_BACKUP_ROOT ·
//   PMS_RESTORE_WORKDIR · PMS_ROUND_DIR ฯลฯ) ยังทับได้ตามเดิม — ผู้เรียกเช็ก env ก่อนแล้วค่อยเรียก ที่ใน()
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/** ชื่อใน .local → ชื่อเดิมใต้ C:/.claude (ตารางย้าย · ตัวย้าย scripts/move-local.mjs ใช้ตารางเดียวกัน) */
export const ตารางย้าย = Object.freeze({
  "wt": "pms-wt",
  "dbcheck": "pms-dbcheck",
  "dev": "pms-dev",
  "blank": "pms-blank",
  "restore-check": "pms-restore-check",
  "round": "pms-round",
  "session-registry": "pms-session-registry",
  "handoff": "pms-handoff",
  "shots": "pms-shots",
  "preview": "pms-preview",
  "prod-ops": "pms-prod-ops",
  "prod-tools": "pms-prod-tools",
  "prod-backups": "pms-prod-backups",
  "prod-secrets": "pms-prod-secrets",
  "private-data": "pms-private-data",
  "migration-reservations.md": "pms-migration-reservations.md",
});

/** โฟลเดอร์ที่ห้ามเปิดอ่านไฟล์ข้างใน (ข้อมูลลูกค้าจริง · กุญแจฐานจริง) — ตัวตรวจที่เดินทั้งโฟลเดอร์ต้องข้าม · ตัวย้ายย้ายทั้งโฟลเดอร์เท่านั้น */
export const ห้ามเปิด = Object.freeze(["prod-backups", "prod-secrets"]);

const ทับ = (p) => p.replace(/\\/g, "/");
const โค้ดชุดนี้ = () => process.cwd();

/** โฟลเดอร์หลักของ repo (ที่ .git จริงอยู่) จาก cwd · worktree ได้โฟลเดอร์หลักเดียวกัน */
export function โฟลเดอร์หลัก(cwd = โค้ดชุดนี้()) {
  try {
    const common = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return ทับ(path.dirname(path.resolve(cwd, common)));
  } catch { return ทับ(path.resolve(cwd)); }
}

/** ราก .local */
export function รากLocal(cwd = โค้ดชุดนี้()) {
  return ทับ(process.env.PMS_LOCAL_ROOT ? path.resolve(process.env.PMS_LOCAL_ROOT) : path.join(โฟลเดอร์หลัก(cwd), ".local"));
}

/** รากที่เดิม (C:/.claude บน Windows) · "" = ไม่มีที่เดิม */
export function รากเดิม() {
  const e = process.env.PMS_LEGACY_ROOT;
  if (e === "-") return "";
  if (e) return ทับ(path.resolve(e));
  return process.platform === "win32" ? "C:/.claude" : "";
}

/** ที่อยู่เดิมของชื่อใน .local · "" = ไม่มี */
export function ที่เดิม(ชื่อ) {
  const เดิม = ตารางย้าย[ชื่อ], ราก = รากเดิม();
  return เดิม && ราก ? `${ราก}/${เดิม}` : "";
}

/** ที่อยู่ของโฟลเดอร์/ไฟล์ <ชื่อ> (คีย์ใน ตารางย้าย) — ที่ใหม่ถ้ามีอยู่ · ยังไม่ย้ายแต่ที่เดิมมีอยู่ = ที่เดิม · ไม่มีทั้งคู่ = ที่ใหม่ */
export function ที่ใน(ชื่อ, { cwd = โค้ดชุดนี้(), มีอยู่ = existsSync } = {}) {
  if (!(ชื่อ in ตารางย้าย)) throw new Error(`ไม่รู้จักชื่อ "${ชื่อ}" ใน .local (ดู ตารางย้าย ใน scripts/lib/localPaths.mjs)`);
  const ใหม่ = `${รากLocal(cwd)}/${ชื่อ}`;
  if (มีอยู่(ใหม่)) return ใหม่;
  const เดิม = ที่เดิม(ชื่อ);
  if (เดิม && มีอยู่(เดิม)) return เดิม;
  return ใหม่;
}
