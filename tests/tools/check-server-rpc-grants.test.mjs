// ── ข้อทดสอบของตัวตรวจ check-server-rpc-grants (สิทธิ์เรียกคำสั่งตรงกับโค้ด · 22 ต.ค. 69) ─────────────────────────
// เจอ: ตัวตรวจค้างไม่จบในรอบตรวจเต็ม เพราะไล่อ่านผล build ในโฟลเดอร์ที่ไม่ถูกข้าม (apps/dealer/.next-r4 · 188MB)
// บอสสั่งแก้: อ่านเฉพาะไฟล์ที่ git เก็บ — ข้อนี้สร้าง repo จำลอง แล้วตรวจว่า
//   1) ไฟล์ที่ git เก็บยังถูกตรวจ (เรียกคำสั่งที่ไม่มีสิทธิ์ → ตก)
//   2) ผล build ที่ git ไม่เก็บ (ตัวอักษรติดกันยาว + เรียกคำสั่งที่ไม่มีในฐาน) ไม่ถูกอ่าน → ผ่าน และจบเร็ว
// รัน: node tests/tools/check-server-rpc-grants.test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";

const ตัวตรวจ = join(process.cwd(), "scripts/check-server-rpc-grants.mjs");
const ค่าสิทธิ์ = {
  migration: "9999",
  functions: [
    { f: "fn_user(p int)", anon: false, authenticated: true, service_role: false },
    { f: "fn_server()", anon: false, authenticated: false, service_role: true },
  ],
};
const เขียน = (root, f, s) => { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), s); };

function จำลอง({ เก็บ = {}, ไม่เก็บ = {} }) {
  const root = mkdtempSync(join(tmpdir(), "rpc-grants-check-"));
  เขียน(root, "supabase/tests/expected-function-grants.json", JSON.stringify(ค่าสิทธิ์));
  for (const [f, s] of Object.entries(เก็บ)) เขียน(root, f, s);
  execFileSync("git", ["-c", "core.autocrlf=false", "init", "-q"], { cwd: root });
  execFileSync("git", ["-c", "core.autocrlf=false", "add", "-A"], { cwd: root });
  for (const [f, s] of Object.entries(ไม่เก็บ)) เขียน(root, f, s);
  const เริ่ม = Date.now();
  const r = spawnSync(process.execPath, [ตัวตรวจ], { cwd: root, encoding: "utf8", timeout: 30_000 });
  const วินาที = (Date.now() - เริ่ม) / 1000;
  rmSync(root, { recursive: true, force: true });
  return { ผ่าน: r.status === 0, หมดเวลา: r.error?.code === "ETIMEDOUT", วินาที, ข้อความ: ((r.stdout ?? "") + (r.stderr ?? "")).trim() };
}

const โค้ดปกติ = {
  "apps/web/page.ts": `const sb = getSupabase();\nawait sb.rpc("fn_user", { p: 1 });\n`,
  "packages/srv/route.ts": `const admin = adminClient();\nawait admin.rpc("fn_server");\n`,
};
// ผล build ที่ทำให้ตัวตรวจเดิมค้าง: ตัวอักษรติดกันยาวมาก + เรียกคำสั่งที่ไม่มีในฐาน (ถ้าถูกอ่าน = ตก)
const ผลbuild = `${"a".repeat(70_000)};x.rpc("fn_not_in_db");\n`;

const กรณี = [
  ["ไฟล์ที่ git เก็บครบ สิทธิ์ตรง → ผ่าน", { เก็บ: โค้ดปกติ }, true],
  ["ไฟล์ที่ git เก็บเรียกคำสั่งที่ผู้ใช้ไม่มีสิทธิ์ → ตก", { เก็บ: { ...โค้ดปกติ, "apps/web/bad.ts": `await sb.rpc("fn_server");\n` } }, false],
  ["ไฟล์ที่ git เก็บเรียกคำสั่งที่ไม่มีในฐาน → ตก", { เก็บ: { ...โค้ดปกติ, "scripts/x.mjs": `await sb.rpc("fn_not_in_db");\n` } }, false],
  ["ผล build ที่ git ไม่เก็บ (apps/dealer/.next-r4) → ไม่อ่าน ผ่าน", { เก็บ: โค้ดปกติ, ไม่เก็บ: { "apps/dealer/.next-r4/server/chunk.js": ผลbuild } }, true],
  ["ไฟล์ใหม่ที่ยังไม่ git add → ไม่อ่าน ผ่าน", { เก็บ: โค้ดปกติ, ไม่เก็บ: { "apps/web/new.ts": `await sb.rpc("fn_not_in_db");\n` } }, true],
];

let ตก = 0;
for (const [ชื่อ, ชุด, คาดว่าผ่าน] of กรณี) {
  const r = จำลอง(ชุด);
  const ถูก = !r.หมดเวลา && r.ผ่าน === คาดว่าผ่าน && r.วินาที < 20;
  if (!ถูก) ตก++;
  console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}  (${r.หมดเวลา ? "หมดเวลา 30 วิ" : `${r.วินาที.toFixed(1)} วิ`}${ถูก ? "" : ` · ได้ ${r.ผ่าน ? "ผ่าน" : "ตก"}\n${r.ข้อความ}`})`);
}
console.log(ตก ? `FAIL ${ตก}/${กรณี.length}` : `ALL PASS ${กรณี.length}/${กรณี.length}`);
process.exit(ตก ? 1 : 0);
