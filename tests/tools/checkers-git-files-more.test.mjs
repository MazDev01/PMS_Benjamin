// ── ข้อทดสอบ: ตัวตรวจอีก 6 ตัวที่เปลี่ยนมาอ่านเฉพาะไฟล์ที่ git เก็บ (807b79c · บอสสั่ง 22 ต.ค. 69) ──────────────────────
// ต่อจาก tests/tools/checkers-git-files.test.mjs (ครอบ 6 ตัวแรก) — สองไฟล์รวมกันครบ 12 ตัว
// ตัวตรวจกลุ่มนี้อ่านชนิดข้อมูลจริงของโปรเจกต์ (typescript + tsconfig) จำลอง repo เล็กไม่ได้
//   จึงสร้างโฟลเดอร์แยกชั่วคราวจาก commit ปัจจุบัน (git worktree --detach) ไม่แตะโฟลเดอร์หลัก แล้วตรวจทีละตัว
//   node_modules ใช้ทางลัด (junction) ไปที่โฟลเดอร์หลัก — ตัวตรวจต้องอ่านชนิดข้อมูลของ react/next ด้วย
//   ⚠️ 22 ต.ค. 69 ข้อนี้รุ่นแรกลบโฟลเดอร์แยกด้วย git worktree remove --force ทั้งที่ยังมีทางลัด → ลบตามทางลัดเข้าไปถึง
//      node_modules จริงและ packages/shared ของโฟลเดอร์หลัก (ลิงก์ workspace ของ pnpm) หายไป 214 ไฟล์
//      ตอนนี้: ถอดทางลัดทีละตัวด้วย cmd /c rmdir (ถอดแค่ลิงก์ ไม่ลบปลายทาง) → ตรวจซ้ำว่าไม่เหลือทางลัด → ค่อยลบโฟลเดอร์แยก
//      ยังเหลือทางลัด = ไม่ลบ บอกให้ถอดเอง
//   1) โฟลเดอร์ตาม commit ปัจจุบัน → ผ่าน
//   2) โค้ดผิดกติกาในไฟล์ที่ git เก็บ → ตก และชี้ไฟล์นั้น   (ตัวตรวจพัง = ข้อนี้ตก)
//   3) โค้ดผิดกติกาเดียวกันในผล build ที่ git ไม่เก็บ (.next-test) → ไม่อ่าน ผ่าน
// รัน: node tests/tools/checkers-git-files-more.test.mjs
//   PMS_CHECKERS_REF=<commit> = ใช้ตัวตรวจจาก commit อื่น (พิสูจน์ด้วย commit ที่ทำตัวตรวจพังไว้ในโฟลเดอร์แยก ไม่แก้โฟลเดอร์หลัก)
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, lstatSync, symlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";

const ราก = process.cwd();
const git = (cwd, ...a) => execFileSync("git", ["-c", "core.autocrlf=false", ...a], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const เขียน = (root, f, s) => { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), s); };

// ไฟล์ผิดกติกาของแต่ละตัว (ทาง · เนื้อหา) — วางในที่ที่ตัวตรวจนั้นสแกน
const LEAD = `import type { LeadRow } from "../mock";\n`;
const ตัวตรวจ = [
  ["check-network-list-keys", "apps/hq/app/zzpoison/Poison.tsx",
    `export function P({ rows }: { rows: { id: number; dealerCode: string }[] }) {\n  return <table><tbody>{rows.map(r => <tr key={r.id}><td>{r.dealerCode}</td></tr>)}</tbody></table>;\n}\n`],
  ["check-filter-resets-page", "packages/shared/components/zzpoison/Poison.tsx",
    `import { useState } from "react";\nexport function P() {\n  const [page, setPage] = useState(1);\n  return <input placeholder="ค้นหาทดสอบ" aria-label="ค้น" onChange={() => {}} data-page={page} />;\n}\nexport const _u = (setPage: unknown) => setPage;\n`],
  ["check-real-backend", "packages/shared/lib/zzpoison/poison.ts",
    `import { DATA_SOURCE } from "../data/config";\nexport const จริงไหม = DATA_SOURCE === "supabase";\n`],
  ["check-no-lead-template", "packages/shared/lib/zzpoison/poison.ts",
    `${LEAD}export const สินค้า = (l: LeadRow) => l.product;\n`],
  ["check-no-lead-estimate", "packages/shared/lib/zzpoison/poison.ts",
    `${LEAD}export const มูลค่า = (l: LeadRow) => l.value;\n`],
  ["check-lead-stage-map", "packages/shared/lib/zzpoison/poison.ts",
    `export const ลำดับ: Record<string, number> = { WAITING: 0, BULLET: 1, QUOTED: 2, PAID: 3 };\n`],
];

const root = join(mkdtempSync(join(tmpdir(), "checkers-more-")), "wt");
git(ราก, "worktree", "add", "--detach", "-q", root, process.env.PMS_CHECKERS_REF || "HEAD");
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n${เพิ่ม}`}`); };
const ทางลัดที่ทำ = [];
try {
  for (const nm of ["node_modules", "apps/dealer/node_modules", "apps/hq/node_modules", "packages/shared/node_modules"])
    if (existsSync(join(ราก, nm)) && !existsSync(join(root, nm))) { symlinkSync(join(ราก, nm), join(root, nm), "junction"); ทางลัดที่ทำ.push(join(root, nm)); }
  const รัน = n => {
    const เริ่ม = Date.now();
    const r = spawnSync(process.execPath, [`scripts/${n}.mjs`], { cwd: root, encoding: "utf8", timeout: 180_000 });
    return { ผ่าน: r.status === 0, หมดเวลา: r.error?.code === "ETIMEDOUT", วินาที: (Date.now() - เริ่ม) / 1000, ข้อความ: (r.stdout ?? "") + (r.stderr ?? "") };
  };
  for (const [n, ทาง, เนื้อหา] of ตัวตรวจ) {
    const ก่อน = รัน(n);
    ผล(ก่อน.ผ่าน && !ก่อน.หมดเวลา, `${n}: commit ปัจจุบัน → ผ่าน (${ก่อน.วินาที.toFixed(1)} วิ)`, ก่อน.ข้อความ);

    // ผล build ที่ git ไม่เก็บ — ต้องไม่ถูกอ่าน
    const ทางbuild = `apps/dealer/.next-test/${ทาง}`;
    เขียน(root, ทางbuild, เนื้อหา);
    const build = รัน(n);
    ผล(build.ผ่าน && !build.หมดเวลา, `${n}: ของผิดใน .next-test (git ไม่เก็บ) → ไม่อ่าน ผ่าน`, build.ข้อความ);
    rmSync(join(root, "apps/dealer/.next-test"), { recursive: true, force: true });

    // ไฟล์ที่ git เก็บ — ต้องตก และชี้ไฟล์
    เขียน(root, ทาง, เนื้อหา);
    git(root, "add", "--", ทาง);
    const ผิด = รัน(n);
    ผล(!ผิด.ผ่าน && ผิด.ข้อความ.includes("zzpoison"), `${n}: ของผิดในไฟล์ที่ git เก็บ → ตก และชี้ไฟล์`, ผิด.ข้อความ);
    git(root, "rm", "-q", "-f", "--", ทาง);
  }
} finally {
  // ถอดทางลัดก่อน (ถอดแค่ลิงก์) — ห้ามลบแบบเดินตาม เพราะปลายทางคือโฟลเดอร์หลัก
  for (const p of ทางลัดที่ทำ) spawnSync("cmd", ["/c", "rmdir", p], { stdio: "ignore" });
  const ทางลัด = [];
  const ไล่ = d => { for (const n of readdirSync(d)) { const p = join(d, n); const st = lstatSync(p);
    if (st.isSymbolicLink()) ทางลัด.push(p); else if (st.isDirectory() && n !== ".git") ไล่(p); } };
  ไล่(root);
  if (ทางลัด.length) { console.log(`✗ พบทางลัดในโฟลเดอร์แยก ไม่ลบให้ — ถอดด้วยมือ (cmd /c rmdir) แล้วค่อย git worktree remove: ${ทางลัด.join(", ")}`); ตก++; }
  else { git(ราก, "worktree", "remove", "--force", root); rmSync(dirname(root), { recursive: true, force: true }); }
}
console.log(ตก ? `FAIL ${ตก}` : "ALL PASS");
process.exit(ตก ? 1 : 0);
