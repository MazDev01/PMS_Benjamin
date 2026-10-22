// ── เปิดเซสชันใหม่ในโฟลเดอร์แยก (บอสสั่ง 22 ต.ค. 69) ──────────────────────────────────────────────────────────────────
//
// ใช้ (จากโฟลเดอร์หลักเท่านั้น): npm run session:new -- <ชื่อ>        เช่น npm run session:new -- ef
// ได้: โฟลเดอร์ C:/.claude/pms-wt/<ชื่อ> · branch session/<ชื่อ> จาก wip/integration ล่าสุด · พอร์ต dev/test ไม่ซ้ำเซสชันอื่น
//   .pms-session.json (ชื่อ · พอร์ต) · ไฟล์ค่าตั้ง .env ชี้ฐานทดสอบ (พอร์ตเปลี่ยนเป็นของเซสชัน) · ติดตั้ง node_modules ของตัวเอง
//   (ห้ามทำทางลัด node_modules ไปโฟลเดอร์หลัก — เหตุ 22 ต.ค. 69 ลบโฟลเดอร์แยกแล้วไฟล์โฟลเดอร์หลักหาย)
// กติกาที่ตามมา (git hook · .githooks): commit ได้เฉพาะ branch ของตัวเอง · push ได้เฉพาะ session/<ชื่อ>
// ปิด: npm run session:close -- <ชื่อ> (จากโฟลเดอร์หลัก · ถอดทางลัดก่อนลบเสมอ — ห้ามลบโฟลเดอร์เอง)
// ตัวเลือก: --จาก <ref> (ค่าตั้งต้น origin/wip/integration) · --ไม่ติดตั้ง (ข้าม pnpm install — ข้อทดสอบใช้)
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { เป็นโฟลเดอร์หลัก, พอร์ตของช่อง, ค่าพอร์ต } from "./lib/session.mjs";
import { gitใน, รากเซสชัน, ชื่อถูกแบบ, อ่านทะเบียน, เขียนทะเบียน, ล็อกทะเบียน, ช่องว่าง } from "./lib/sessions.mjs";

const cwd = process.cwd();
const git = gitใน(cwd);
const a = process.argv.slice(2);
const ชื่อ = a.find(x => !x.startsWith("--") && a[a.indexOf(x) - 1] !== "--จาก") ?? "";
const จาก = a.includes("--จาก") ? a[a.indexOf("--จาก") + 1] : "origin/wip/integration";
const ตาย = (m) => { console.error(`⛔ ${m}`); process.exit(1); };

if (!ชื่อถูกแบบ(ชื่อ)) ตาย("ใช้: npm run session:new -- <ชื่อ> · ชื่อภาษาอังกฤษตัวเล็ก/ตัวเลข คั่นด้วย - ไม่เกิน 30 ตัว เช่น ef หรือ notify-th");
if (!เป็นโฟลเดอร์หลัก(cwd)) ตาย("เปิดเซสชันใหม่ได้จากโฟลเดอร์หลัก (เซสชันรวมงาน) เท่านั้น");
if (จาก.startsWith("origin/")) spawnSync("git", ["fetch", "-q", "origin"], { cwd, stdio: "ignore", timeout: 60_000 });   // ดึงล่าสุด (ดึงไม่ได้ = ใช้ของในเครื่อง)

const ล็อก = ล็อกทะเบียน(`session:new ${ชื่อ}`);
let ข้อมูล;
try {
  const ทะเบียน = อ่านทะเบียน(cwd);
  if (ทะเบียน[ชื่อ]) ตาย(`มีเซสชันชื่อ ${ชื่อ} อยู่แล้ว (${ทะเบียน[ชื่อ].โฟลเดอร์}) — ใช้โฟลเดอร์นั้น หรือปิดก่อน (npm run session:close -- ${ชื่อ})`);
  const branch = `session/${ชื่อ}`;
  try { git("rev-parse", "--verify", "-q", `refs/heads/${branch}`); ตาย(`มี branch ${branch} อยู่แล้ว — ตั้งชื่ออื่น หรือลบ branch เดิมก่อน`); } catch { /* ยังไม่มี = ดี */ }
  const โฟลเดอร์ = path.join(รากเซสชัน(), ชื่อ).replaceAll("\\", "/");
  if (existsSync(โฟลเดอร์)) ตาย(`มีโฟลเดอร์ ${โฟลเดอร์} อยู่แล้ว — ไม่เขียนทับ`);
  const ช่อง = ช่องว่าง(ทะเบียน, ค่าพอร์ต.เซสชันลูก.สูงสุด);
  if (!ช่อง) ตาย(`เซสชันเต็ม ${ค่าพอร์ต.เซสชันลูก.สูงสุด} ช่องแล้ว — ปิดเซสชันที่ไม่ใช้ก่อน`);
  const สร้างจาก = git("rev-parse", "--short", จาก);

  mkdirSync(รากเซสชัน(), { recursive: true });
  git("worktree", "add", "-q", "-b", branch, โฟลเดอร์, จาก);
  ข้อมูล = { ชื่อ, ช่อง, branch, โฟลเดอร์, สร้างจาก, ...พอร์ตของช่อง(ช่อง),
    สร้างเมื่อ: new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 19).replace("T", " ") };
  writeFileSync(path.join(โฟลเดอร์, ".pms-session.json"), JSON.stringify(ข้อมูล, null, 1) + "\n");
  ทะเบียน[ชื่อ] = { ช่อง, โฟลเดอร์, branch, สร้างจาก, สร้างเมื่อ: ข้อมูล.สร้างเมื่อ };
  เขียนทะเบียน(cwd, ทะเบียน);
} finally {
  ล็อก.release();
}

// ไฟล์ค่าตั้ง (ไม่อยู่ใน git) — คัดลอกเฉพาะที่ชี้ฐานทดสอบ · ห้ามคัด .env.production.local (ค่าเชื่อมต่อฐานจริง)
//   ที่อยู่เว็บในเครื่องเปลี่ยนเป็นพอร์ต dev ของเซสชัน (รอบตรวจเต็มส่งพอร์ตทดสอบทาง env เอง · scripts/test-prodbuild.mjs)
const หลัก = ค่าพอร์ต.dev;
for (const f of [".env.local", "apps/dealer/.env.local", "apps/hq/.env.local", "tests/.env.test"]) {
  if (!existsSync(path.join(cwd, f))) continue;
  const ไป = path.join(ข้อมูล.โฟลเดอร์, f);
  mkdirSync(path.dirname(ไป), { recursive: true });
  copyFileSync(path.join(cwd, f), ไป);
  const s = readFileSync(ไป, "utf8")
    .replaceAll(`localhost:${หลัก.dealer}`, `localhost:${ข้อมูล.dev.dealer}`)
    .replaceAll(`localhost:${หลัก.hq}`, `localhost:${ข้อมูล.dev.hq}`);
  writeFileSync(ไป, s);
}

if (!process.argv.includes("--ไม่ติดตั้ง")) {
  console.log("▶ ติดตั้ง node_modules ของเซสชัน (pnpm install --frozen-lockfile)");
  const r = spawnSync("pnpm", ["install", "--frozen-lockfile"], { cwd: ข้อมูล.โฟลเดอร์, stdio: "inherit", shell: true });
  if (r.status !== 0) console.error("⚠️ ติดตั้งไม่สำเร็จ — เข้าโฟลเดอร์แล้วสั่ง pnpm install --frozen-lockfile เอง");
}

console.log(`\n✓ เปิดเซสชัน ${ชื่อ} แล้ว
   โฟลเดอร์: ${ข้อมูล.โฟลเดอร์}
   branch:   ${ข้อมูล.branch} (จาก ${จาก} ${ข้อมูล.สร้างจาก})
   พอร์ต:    dev ดีลเลอร์ ${ข้อมูล.dev.dealer} · HQ ${ข้อมูล.dev.hq} · รอบตรวจ ดีลเลอร์ ${ข้อมูล.test.dealer} · HQ ${ข้อมูล.test.hq}
   ทำงานในโฟลเดอร์นี้เท่านั้น · commit ได้แค่ ${ข้อมูล.branch} · ส่งงาน = รอบตรวจเต็มผ่านในโฟลเดอร์นี้ แล้วแจ้งคนรวมงาน (คู่มือ docs/ทำงานหลายเซสชัน.md)`);
