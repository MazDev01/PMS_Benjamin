// ── รายชื่อไฟล์โค้ดที่ git เก็บ — ตัวช่วยกลางของตัวตรวจในรอบตรวจเต็ม (บอสสั่ง 22 ต.ค. 69) ─────────────────────────
//   เดิมตัวตรวจแต่ละตัวเดินทั้งโฟลเดอร์ แล้วข้ามโฟลเดอร์ build ด้วยชื่อตรงตัว (".next" · "dist")
//   ผล build ที่ตั้งชื่ออื่น (apps/dealer/.next-r4 จาก PMS_DIST_DIR · .next-demo) จึงถูกอ่าน → นับความผิดจากไฟล์ build
//   (unchecked-mutations · lead-writes · no-catalog · lead-stage-map ตกปลอม) หรือค้างเพราะไฟล์ build บรรทัดเดียวหลาย MB
//   อ่านเฉพาะไฟล์ที่ git เก็บ = ไม่ต้องรู้ชื่อโฟลเดอร์ build ใด ๆ · ไฟล์ใหม่ต้อง git add ก่อนถึงถูกตรวจ (รอบตรวจเต็มรันหลัง commit ครบ)
//   ⚠️ ห้ามใช้กับตัวตรวจที่ตั้งใจหาไฟล์นอก git (check-prod-secrets-in-repo — กุญแจฐานจริงในไฟล์ที่ยังไม่ commit ก็ต้องเจอ)
//   ข้อทดสอบ: tests/tools/checkers-git-files.test.mjs
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/** ไฟล์ที่ git เก็บใต้ roots ที่นามสกุลตรง ext และยังมีอยู่ในโฟลเดอร์
 *  คืนเป็นทางแบบเดียวกับ path.join(root, …) (ตัวคั่นของเครื่อง) — absolute: ต่อหน้าด้วย cwd */
export function ไฟล์ที่gitเก็บ(roots, { ext = /\.(ts|tsx|mjs|js)$/, absolute = false, cwd = process.cwd() } = {}) {
  const ผล = execFileSync("git", ["ls-files", "-z", "--", ...roots], { cwd, encoding: "utf8", maxBuffer: 256 << 20 });
  return ผล.split("\0")
    .filter(f => f && ext.test(f) && existsSync(path.join(cwd, f)))   // ลบในโฟลเดอร์แล้วแต่ยังไม่ commit = ข้าม
    .map(f => (absolute ? path.join(cwd, f) : f.split("/").join(path.sep)));
}
