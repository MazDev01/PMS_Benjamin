// ── ทะเบียนเซสชันลูก + ตัวช่วยของ session:new / session:merge / session:close (บอสสั่ง 22 ต.ค. 69) ─────────────────────
//
// ทะเบียน: <git common dir>/pms-sessions.json — ใช้ร่วมทุกโฟลเดอร์ (worktree) ของ repo เดียวกัน · แก้ภายใต้ล็อกเท่านั้น
//   { "<ชื่อ>": { ช่อง, โฟลเดอร์, branch, สร้างจาก, สร้างเมื่อ } } · ช่อง = เลขช่องพอร์ต (scripts/lib/session.mjs พอร์ตของช่อง)
// โฟลเดอร์เซสชัน: PMS_WT_ROOT (ข้อทดสอบใช้ที่อื่น) หรือ C:/.claude/pms-wt/<ชื่อ>
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ตัวล็อก } from "./fileLock.mjs";

export const gitใน = (cwd) => (...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
export const รากเซสชัน = () => process.env.PMS_WT_ROOT || "C:/.claude/pms-wt";
export const ชื่อถูกแบบ = (s) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length <= 30;

export const ไฟล์ทะเบียน = (cwd) => path.resolve(cwd, gitใน(cwd)("rev-parse", "--git-common-dir"), "pms-sessions.json");
export const อ่านทะเบียน = (cwd) => { try { return JSON.parse(readFileSync(ไฟล์ทะเบียน(cwd), "utf8")); } catch { return {}; } };
export const เขียนทะเบียน = (cwd, t) => writeFileSync(ไฟล์ทะเบียน(cwd), JSON.stringify(t, null, 1) + "\n");

/** ล็อกทะเบียน — session:new/close พร้อมกันได้ช่องไม่ซ้ำ */
export const ล็อกทะเบียน = (งาน) => ตัวล็อก({ path: process.env.PMS_SESSIONS_LOCK || path.join(os.homedir(), ".pms-sessions.lock"),
  envHeld: "PMS_SESSIONS_LOCK_HELD", เรื่อง: "แก้ทะเบียนเซสชัน" })(งาน, { รอ: 60_000 });

/** ช่องว่างตัวแรก (1, 2, …) ที่ไม่มีเซสชันใช้ */
export function ช่องว่าง(ทะเบียน, สูงสุด) {
  const ใช้แล้ว = new Set(Object.values(ทะเบียน).map(s => s.ช่อง));
  for (let k = 1; k <= สูงสุด; k++) if (!ใช้แล้ว.has(k)) return k;
  return 0;
}

/** ทางลัด (symlink/junction) ทั้งหมดในโฟลเดอร์ — ไม่เดินตามเข้าไปในทางลัด */
export function หาทางลัด(dir) {
  const เจอ = [];
  const เดิน = (d) => {
    let รายการ; try { รายการ = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of รายการ) {
      const p = path.join(d, e.name);
      let st; try { st = lstatSync(p); } catch { continue; }
      if (st.isSymbolicLink()) { let ไป = ""; try { ไป = readlinkSync(p); } catch { /* อ่านไม่ได้ */ } เจอ.push({ ที่: p, ไป }); continue; }
      if (st.isDirectory() && e.name !== ".git") เดิน(p);
    }
  };
  เดิน(dir);
  return เจอ;
}

/** ถอดทางลัดทุกตัวในโฟลเดอร์ (ถอดแค่ลิงก์ ไม่ลบปลายทาง) · คืนรายการที่ถอดไม่ได้ */
export function ถอดทางลัดทั้งหมด(dir) {
  const ถอดไม่ได้ = [];
  for (const { ที่ } of หาทางลัด(dir)) {
    try { unlinkSync(ที่); }
    catch { try { rmdirSync(ที่); } catch (e) { ถอดไม่ได้.push(`${ที่} (${e.code})`); } }   // junction ของโฟลเดอร์บางแบบต้อง rmdir (ไม่เดินตาม)
  }
  return ถอดไม่ได้;
}

export const มีอยู่ = (p) => existsSync(p);
