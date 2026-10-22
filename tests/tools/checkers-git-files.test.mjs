// ── ข้อทดสอบ: ตัวตรวจในรอบตรวจเต็มอ่านเฉพาะไฟล์ที่ git เก็บ (scripts/lib/gitFiles.mjs · บอสสั่ง 22 ต.ค. 69) ───────────
// เจอ: ตัวตรวจที่เดินทั้งโฟลเดอร์ข้ามผล build ได้แค่ชื่อ ".next" ตรงตัว — ผล build ชื่ออื่น (apps/dealer/.next-r4 จาก PMS_DIST_DIR)
//   ถูกอ่าน → unchecked-mutations · lead-writes · no-catalog · lead-stage-map ตกปลอมเพราะโค้ดใน build (พิสูจน์ด้วยโฟลเดอร์ .next-test)
// ข้อนี้สร้าง repo จำลอง แล้วตรวจ
//   1) ตัวช่วยกลาง: คืนไฟล์ที่ git เก็บ · ไม่คืนผล build/ไฟล์ที่ยังไม่ add/ไฟล์ที่ลบในโฟลเดอร์แล้ว · กรองนามสกุลได้
//   2) ตัวตรวจจริง 6 ตัว (คัดลอกสคริปต์ไปรันใน repo จำลอง):
//      ผล build ใน .next-test (โค้ดผิดกติกาทุกข้อ + บรรทัดเดียว 3MB) → ไม่อ่าน ผ่าน และจบเร็ว
//      โค้ดผิดกติกาเดียวกันในไฟล์ที่ git เก็บ → ตก และชี้ไฟล์นั้น
// รัน: node tests/tools/checkers-git-files.test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const ราก = process.cwd();
const ตัวตรวจ = ["check-lead-writes", "check-no-catalog", "check-dealer-code-fallback", "check-unchecked-mutations", "check-stable-order", "check-form-labels"];
const เขียน = (root, f, s) => { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), s); };
const git = (root, ...a) => execFileSync("git", ["-c", "core.autocrlf=false", ...a], { cwd: root, stdio: "ignore" });

// โค้ดที่ผิดกติกาของตัวตรวจทั้ง 6 ตัวพร้อมกัน
const ผิดกติกา = `declare const sb: any;
export async function พัง(rows: { dealerCode?: string }[]) {
  await sb.from("leads").update({ status: "PAID" }).eq("id", 1);
  await sb.from("master_catalog").select("*");
  await sb.from("quotations").insert({ id: 1 });
  await sb.from("leads").select("*").order("created_at").range(0, 9);
  return new Set(rows.map(r => r.dealerCode ?? "")).size;
}
export function ช่อง() { return <input value="x" onChange={() => {}} />; }
`;
const ปกติ = `export const ok = (n: number) => n + 1;\n`;

function สร้างrepo() {
  const root = mkdtempSync(join(tmpdir(), "checkers-git-files-"));
  for (const n of ตัวตรวจ) { mkdirSync(join(root, "scripts"), { recursive: true }); copyFileSync(join(ราก, "scripts", `${n}.mjs`), join(root, "scripts", `${n}.mjs`)); }
  mkdirSync(join(root, "scripts/lib"), { recursive: true });
  copyFileSync(join(ราก, "scripts/lib/gitFiles.mjs"), join(root, "scripts/lib/gitFiles.mjs"));
  เขียน(root, "apps/web/app/page.tsx", ปกติ);
  เขียน(root, "packages/shared/lib/ok.ts", ปกติ);
  git(root, "init", "-q"); git(root, "add", "-A");
  return root;
}
const รัน = (root, n) => {
  const เริ่ม = Date.now();
  const r = spawnSync(process.execPath, [`scripts/${n}.mjs`], { cwd: root, encoding: "utf8", timeout: 60_000 });
  return { ผ่าน: r.status === 0, หมดเวลา: r.error?.code === "ETIMEDOUT", วินาที: (Date.now() - เริ่ม) / 1000, ข้อความ: (r.stdout ?? "") + (r.stderr ?? "") };
};

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n${เพิ่ม}`}`); };

// ── 1) ตัวช่วยกลาง ──
{
  const root = สร้างrepo();
  เขียน(root, "apps/web/.next-test/server/chunk.js", "x");      // ผล build (git ไม่เก็บ)
  เขียน(root, "apps/web/app/new.tsx", ปกติ);                       // ไฟล์ใหม่ยังไม่ add
  เขียน(root, "packages/shared/lib/gone.ts", ปกติ); git(root, "add", "-A", "packages"); rmSync(join(root, "packages/shared/lib/gone.ts"));
  const { ไฟล์ที่gitเก็บ } = await import(pathToFileURL(join(root, "scripts/lib/gitFiles.mjs")).href);
  const ได้ = ไฟล์ที่gitเก็บ(["apps", "packages"], { cwd: root }).map(f => f.replace(/\\/g, "/")).sort();
  ผล(JSON.stringify(ได้) === JSON.stringify(["apps/web/app/page.tsx", "packages/shared/lib/ok.ts"]),
    "ตัวช่วย: คืนเฉพาะไฟล์ที่ git เก็บและยังอยู่ (ไม่รวม .next-test / ไฟล์ใหม่ / ไฟล์ที่ลบแล้ว)", JSON.stringify(ได้));
  const tsx = ไฟล์ที่gitเก็บ(["apps"], { cwd: root, ext: /\.tsx$/ }).map(f => f.replace(/\\/g, "/"));
  ผล(JSON.stringify(tsx) === JSON.stringify(["apps/web/app/page.tsx"]), "ตัวช่วย: กรองนามสกุล/โฟลเดอร์ได้", JSON.stringify(tsx));
  rmSync(root, { recursive: true, force: true });
}

// ── 2) ตัวตรวจจริง ──
{
  const root = สร้างrepo();
  const build = `${"var a=" + JSON.stringify("x".repeat(3_000_000))};\n${ผิดกติกา}`;
  เขียน(root, "apps/web/.next-test/server/poison.tsx", build);
  เขียน(root, "packages/shared/.next-test/poison.tsx", build);
  for (const n of ตัวตรวจ) {
    const r = รัน(root, n);
    ผล(r.ผ่าน && !r.หมดเวลา && r.วินาที < 30, `${n}: ผล build ใน .next-test ไม่ถูกอ่าน → ผ่าน (${r.วินาที.toFixed(1)} วิ)`, r.ข้อความ);
  }
  เขียน(root, "packages/shared/lib/poison.tsx", ผิดกติกา);
  git(root, "add", "-A", "packages/shared/lib");
  for (const n of ตัวตรวจ) {
    const r = รัน(root, n);
    ผล(!r.ผ่าน && /poison\.tsx/.test(r.ข้อความ), `${n}: โค้ดผิดกติกาในไฟล์ที่ git เก็บ → ตก และชี้ไฟล์`, r.ข้อความ);
  }
  rmSync(root, { recursive: true, force: true });
}

console.log(ตก ? `FAIL ${ตก}` : "ALL PASS");
process.exit(ตก ? 1 : 0);
