// ── ตัวกลางที่อยู่ .local ฉบับข้อทดสอบ Playwright (spec .ts) — ตรรกะเดียวกับ scripts/lib/localPaths.mjs (26 พ.ย. 69) ─────────────
//   ทำไมต้องมีสองฉบับ: รอบตรวจเต็ม deploy36 (26 พ.ย. 69) spec ที่ import scripts/lib/localPaths.mjs โหลดไม่ได้ทั้งไฟล์
//   ("Failed to load the ES module" · "Cannot use import statement outside a module") — ตัวรัน playwright แปลง spec เป็น CommonJS
//   แล้วโหลด .mjs ที่มี import/ชื่อส่งออกภาษาไทยไม่ได้ (แบบเดียวกับที่ testDbPsql.mjs เขียนเตือนไว้)
//   ฉบับนี้ไม่ดึงไฟล์ .mjs ใด ๆ · ข้อทดสอบหน่วย tests/unit/localPathsSpec.test.ts เทียบว่าสองฉบับให้ตารางและที่อยู่ตรงกันทุกชื่อ
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export const ตารางย้าย: Readonly<Record<string, string>> = Object.freeze({
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

const ทับ = (p: string) => p.replace(/\\/g, "/");

export function โฟลเดอร์หลัก(cwd: string = process.cwd()): string {
  try {
    const common = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return ทับ(path.dirname(path.resolve(cwd, common)));
  } catch { return ทับ(path.resolve(cwd)); }
}

export function รากLocal(cwd: string = process.cwd()): string {
  return ทับ(process.env.PMS_LOCAL_ROOT ? path.resolve(process.env.PMS_LOCAL_ROOT) : path.join(โฟลเดอร์หลัก(cwd), ".local"));
}

export function รากเดิม(): string {
  const e = process.env.PMS_LEGACY_ROOT;
  if (e === "-") return "";
  if (e) return ทับ(path.resolve(e));
  return process.platform === "win32" ? "C:/.claude" : "";
}

export function ที่เดิม(ชื่อ: string): string {
  const เดิม = ตารางย้าย[ชื่อ], ราก = รากเดิม();
  return เดิม && ราก ? `${ราก}/${เดิม}` : "";
}

/** ที่อยู่ของ <ชื่อ> — ที่ใหม่ถ้ามี · ยังไม่ย้ายแต่ที่เดิมมี = ที่เดิม · ไม่มีทั้งคู่ = ที่ใหม่ */
export function ที่ใน(ชื่อ: string, { cwd = process.cwd(), มีอยู่ = existsSync }: { cwd?: string; มีอยู่?: (p: string) => boolean } = {}): string {
  if (!(ชื่อ in ตารางย้าย)) throw new Error(`ไม่รู้จักชื่อ "${ชื่อ}" ใน .local (ดู ตารางย้าย ใน tests/scenario/localPaths.ts)`);
  const ใหม่ = `${รากLocal(cwd)}/${ชื่อ}`;
  if (มีอยู่(ใหม่)) return ใหม่;
  const เดิม = ที่เดิม(ชื่อ);
  if (เดิม && มีอยู่(เดิม)) return เดิม;
  return ใหม่;
}
