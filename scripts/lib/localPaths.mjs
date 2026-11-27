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
// env เดิมเฉพาะโฟลเดอร์ (PMS_WT_ROOT · PMS_TEST_DB_DIR · PMS_DEV_DB_DIR · PMS_PROD_OPS_DIR (ทับที่ส่วนตัว prod-ops) · PMS_BACKUP_ROOT (ทับรากส่วนตัว) ·
//   PMS_RESTORE_WORKDIR · PMS_ROUND_DIR ฯลฯ) ยังทับได้ตามเดิม — ผู้เรียกเช็ก env ก่อนแล้วค่อยเรียก ที่ใน()
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
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
  "prod-tools": "pms-prod-tools",
  "private-data": "pms-private-data",
  "migration-reservations.md": "pms-migration-reservations.md",
});

// ── สำรองฐานจริง + กุญแจ อยู่นอก repo (บอสสั่ง 26 พ.ย. 69) ─────────────────────────────────────────────────────────────
//   เหตุ: repo เป็น public · git clean -fdx ลบของที่ ignore ได้ · AI ค้นไฟล์ทั้งโปรเจกต์แล้วอาจอ่านเจอข้อมูลลูกค้าจริง/กุญแจ
//   ที่อยู่ = <รากส่วนตัว>/prod-backups · <รากส่วนตัว>/prod-secrets · รากส่วนตัว = PMS_PRIVATE_ROOT หรือ C:/.claude/pms-private
//   ไม่อยู่ใน ตารางย้าย (ไม่ย้ายเข้า .local อีก) · ไม่มีทางถอยไปที่เดิม (.local/prod-* · C:/.claude/pms-prod-*)
//   ไม่เจอ = หยุดพร้อมบอกที่อยู่ (ไม่สร้างใหม่) · ตัวตรวจ scripts/check-private-outside-repo.mjs: ชื่อเหล่านี้ใต้ repo = ตก
// prod-ops (โฟลเดอร์ที่ Supabase CLI ผูกฐานจริง) ย้ายมาด้วย (บอสสั่ง 27 พ.ย. 69): บอสลงใบ 0305 ตกขั้นสำรอง "Cannot find project ref"
//   เหตุ: .local/prod-ops ไม่มี supabase/config.toml → CLI เดินขึ้นไปหาจนเจอ supabase/config.toml ของ repo (ไม่ได้ผูกฐานจริง)
//   ตอนอยู่ C:/.claude/pms-prod-ops ไม่มี config.toml ข้างบนจึงไม่เคยเจอ · ทุกคำสั่ง CLI ฐานจริงใส่ --workdir <prod-ops> ด้วย

/** ชื่อในรากส่วนตัว */
export const ชื่อส่วนตัว = Object.freeze(["prod-backups", "prod-secrets", "prod-ops"]);
/** ชื่อโฟลเดอร์ที่ห้ามมีใต้ repo (รวม .local · โฟลเดอร์เซสชัน) — ชื่อใหม่ + ชื่อเดิม · ตัวตรวจที่เดินทั้งโฟลเดอร์ห้ามเปิดข้างใน */
export const ห้ามเปิด = Object.freeze([...ชื่อส่วนตัว, "pms-prod-backups", "pms-prod-secrets", "pms-prod-ops"]);

const ทับ = (p) => p.replace(/\\/g, "/");
const โค้ดชุดนี้ = () => process.cwd();

/** รากส่วนตัว (นอก repo) */
export function รากส่วนตัว() {
  if (process.env.PMS_PRIVATE_ROOT) return ทับ(path.resolve(process.env.PMS_PRIVATE_ROOT));
  return process.platform === "win32" ? "C:/.claude/pms-private" : ทับ(path.join(os.homedir(), ".pms-private"));
}

/** ที่อยู่ของ <ชื่อ> ในรากส่วนตัว — ไม่ตรวจว่ามีอยู่ (ใช้ในข้อความบอกคน) */
export function ที่อยู่ส่วนตัว(ชื่อ) {
  if (!ชื่อส่วนตัว.includes(ชื่อ)) throw new Error(`ไม่รู้จักชื่อ "${ชื่อ}" ในรากส่วนตัว (ดู ชื่อส่วนตัว ใน scripts/lib/localPaths.mjs)`);
  return `${รากส่วนตัว()}/${ชื่อ}`;
}

const ใต้ = (ลูก, แม่) => { const r = path.relative(path.resolve(แม่), path.resolve(ลูก)); return r === "" || (!r.startsWith("..") && !path.isAbsolute(r)); };

/** ที่อยู่ของ <ชื่อ> ในรากส่วนตัวที่ต้องมีอยู่แล้ว — ไม่มี หรืออยู่ใต้ repo = โยนข้อผิดพลาด (ผู้เรียกหยุด · ไม่สร้างใหม่) */
export function ที่ส่วนตัว(ชื่อ, { cwd = โค้ดชุดนี้(), มีอยู่ = existsSync } = {}) {
  const ที่ = ที่อยู่ส่วนตัว(ชื่อ);
  if (ใต้(ที่, โฟลเดอร์หลัก(cwd))) throw new Error(`⛔ ${ที่} อยู่ใต้ repo — ${ชื่อ} ต้องอยู่นอก repo — ตั้ง PMS_PRIVATE_ROOT ใหม่ หรือเอาออกให้ใช้ค่าตั้งต้น`);
  if (!มีอยู่(ที่)) throw new Error(`⛔ ไม่เจอโฟลเดอร์ ${ที่} — ${ชื่อ} อยู่นอก repo ตั้งแต่ 26 พ.ย. 69 (ตั้ง PMS_PRIVATE_ROOT ถ้าย้ายที่) · ไม่สร้างใหม่ให้`);
  return ที่;
}

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
  // prod-ops ย้ายไปรากส่วนตัว (27 พ.ย. 69) — ผู้เรียกเดิม (scripts/git-hooks/pre-push.mjs ยังเรียก ที่ใน("prod-ops") · แก้ในรอบเต็มหน้า
  //   เพราะเป็นไฟล์เครื่องมือรอบ) ได้ที่ใหม่ ไม่ใช่ .local · ไม่ตรวจว่ามีอยู่ (ผู้เรียกตรวจ project-ref เอง) · ที่อื่นใช้ ที่ส่วนตัว("prod-ops")
  if (ชื่อ === "prod-ops") return ที่อยู่ส่วนตัว("prod-ops");
  if (!(ชื่อ in ตารางย้าย)) throw new Error(`ไม่รู้จักชื่อ "${ชื่อ}" ใน .local (ดู ตารางย้าย ใน scripts/lib/localPaths.mjs)`);
  const ใหม่ = `${รากLocal(cwd)}/${ชื่อ}`;
  if (มีอยู่(ใหม่)) return ใหม่;
  const เดิม = ที่เดิม(ชื่อ);
  if (เดิม && มีอยู่(เดิม)) return เดิม;
  return ใหม่;
}
