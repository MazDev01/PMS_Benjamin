// ── ผลรอบตรวจเต็มผูกกับ commit · ตัวกัน push ขึ้น monorepo (บอสสั่ง 22 ต.ค. 69) ──────────────────────────────────
//
// เหตุ: monorepo ในเครื่องมี commit ที่ยังไม่ผ่านรอบตรวจ/ยังไม่ลงใบปรับฐาน 10 ตัว — ใคร push ตอนนี้ Vercel ขึ้นเว็บจริงทันที
// กติกา (scripts/git-hooks/pre-push.mjs ใช้ไฟล์นี้):
//   1) commit ที่จะ push ขึ้น monorepo ต้องมีผลรอบตรวจเต็มผ่าน "ของ commit นั้น"
//      ยกเว้น commit ที่ต่อจาก commit ที่ผ่านแล้ว และเพิ่มแค่ไฟล์บันทึกของรอบตรวจ (supabase/gate-passed-migrations.json)
//   2) ฐานจริงต้องมีใบปรับฐานครบทุกใบที่อยู่ใน commit นั้น (เว็บใหม่ห้ามขึ้นก่อนใบ)
// ผลรอบตรวจเก็บใน .git ของเครื่อง (ไม่อยู่ใน commit → ไม่ทำให้ hash เปลี่ยน) · เขียนโดย scripts/test-prodbuild.mjs เท่านั้น
//   บันทึกเฉพาะเมื่อตอนเริ่มรอบตรวจไม่มีไฟล์ค้าง (git status ว่าง) — ไม่งั้นสิ่งที่ตรวจไม่ใช่ commit นั้นจริง
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const ไฟล์ที่เพิ่มหลังผ่านได้ = ["supabase/gate-passed-migrations.json"];

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** ที่เก็บผลรอบตรวจตาม commit — <git common dir>/pms-gate-passed-commits.json (ทุก worktree ใช้ร่วม) */
export function ไฟล์ผลตามcommit(cwd = process.cwd()) {
  if (process.env.PMS_GATE_COMMITS_FILE) return process.env.PMS_GATE_COMMITS_FILE;
  return path.resolve(cwd, git(["rev-parse", "--git-common-dir"], cwd), "pms-gate-passed-commits.json");
}
const อ่านผล = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return {}; } };

/** สภาพตอนเริ่มรอบตรวจ: commit ที่กำลังตรวจ + มีไฟล์ค้างไหม */
export function สภาพตอนเริ่ม(cwd = process.cwd()) {
  return { sha: git(["rev-parse", "HEAD"], cwd), ค้าง: git(["status", "--porcelain"], cwd).split("\n").filter(Boolean) };
}

/** บันทึกว่า commit นี้ผ่านรอบตรวจเต็ม · คืนเหตุผลถ้าไม่บันทึก ("" = บันทึกแล้ว) */
export function บันทึกcommitที่ผ่าน({ sha, ค้าง, ป้าย = "", cwd = process.cwd() }) {
  if (ค้าง.length) return `ตอนเริ่มรอบตรวจมีไฟล์ที่ยังไม่ commit ${ค้าง.length} ไฟล์ — ผลนี้ไม่ใช่ของ commit ${sha.slice(0, 7)} จึงไม่บันทึก`;
  const f = ไฟล์ผลตามcommit(cwd);
  const ผล = อ่านผล(f);
  ผล[sha] = { ผ่านเมื่อ: new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 19).replace("T", " "), รอบ: ป้าย };
  writeFileSync(f, JSON.stringify(ผล, null, 1) + "\n");
  return "";
}

/** commit นี้ถือว่าผ่านรอบตรวจไหม · คืน { ผ่าน, เหตุ, จาก } */
export function ตรวจcommitผ่าน(sha, cwd = process.cwd()) {
  const ผล = อ่านผล(ไฟล์ผลตามcommit(cwd));
  if (ผล[sha]) return { ผ่าน: true, จาก: sha };
  for (const ที่ผ่าน of Object.keys(ผล)) {
    try { git(["merge-base", "--is-ancestor", ที่ผ่าน, sha], cwd); } catch { continue; }
    const ต่าง = git(["diff", "--name-only", ที่ผ่าน, sha], cwd).split("\n").filter(Boolean);
    if (ต่าง.every(f => ไฟล์ที่เพิ่มหลังผ่านได้.includes(f))) return { ผ่าน: true, จาก: ที่ผ่าน };
  }
  return { ผ่าน: false, เหตุ: `commit ${sha.slice(0, 7)} ยังไม่มีผลรอบตรวจเต็มผ่าน — รัน npm run test:prodbuild ให้ผ่าน (ตก 0) ที่ commit นี้ก่อน` };
}

/** เลขใบปรับฐานทุกใบใน commit (จากชื่อไฟล์ NNNN_*.sql) */
export function ใบในcommit(sha, cwd = process.cwd()) {
  return git(["ls-tree", "--name-only", sha, "supabase/migrations/"], cwd).split("\n")
    .map(f => /(\d{4})_[^/]*\.sql$/.exec(f)?.[1]).filter(Boolean).sort();
}
