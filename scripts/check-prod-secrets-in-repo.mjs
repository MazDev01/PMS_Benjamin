// ── ตัวตรวจ: ห้ามมีกุญแจระดับเซิร์ฟเวอร์ของฐานจริงในโฟลเดอร์ repo (บอสสั่ง 19 ต.ค. 69) ───────────────────────
//
// ที่มา: เจอไฟล์สำรองค่าเชื่อมต่อฐานจริง (apps/hq/.env.local.prod-backup) วางข้าง .env.local ของชุดทดสอบ
//   สลับผิดไฟล์ครั้งเดียว = ชุดทดสอบ 563 ข้อรันกับฐานจริง (ลบ/สร้างแถว · ตั้งตัวนับเลขเอกสารทั้งฐาน)
//   ย้ายออกจาก repo แล้ว · git ไม่เคยเก็บ (ตรวจประวัติแล้ว) · 26 พ.ย. 69 ที่ใหม่ C:/.claude/pms-private/prod-secrets (scripts/lib/localPaths.mjs)
// ตรวจทุกไฟล์ในโฟลเดอร์ repo รวมไฟล์ที่ git ไม่เก็บ (.env*, backups/) — ยกเว้น node_modules / .git / .next* / .turbo
// .local/ (โฟลเดอร์ในเครื่อง · 26 พ.ย. 69): ตรวจด้วย (โฟลเดอร์เซสชัน · ฐานในเครื่อง — กุญแจฐานจริงหลงไปอยู่ข้างชุดทดสอบได้เหมือนเดิม)
//   โฟลเดอร์ชื่อ prod-secrets · prod-backups (และชื่อเดิม pms-prod-*) ที่ใดก็ได้ = ไม่เปิดอ่านไฟล์ข้างในเลย (ห้ามเปิด ใน localPaths)
//   26 พ.ย. 69 ของจริงอยู่นอก repo (C:/.claude/pms-private) แล้ว — เจอชื่อนี้ใต้ repo = ตกที่ scripts/check-private-outside-repo.mjs
//   มีโฟลเดอร์ .local แต่ git ไม่ได้กันไว้ (.gitignore ไม่มี /.local/) = ตก
//   ตก เมื่อไฟล์มีกุญแจระดับเซิร์ฟเวอร์ (service role) ของฐานจริง:
//   • เครื่องที่มี .env.production.local: ไฟล์ที่มีรหัสโปรเจกต์ฐานจริง + กุญแจ service role (ค่า SUPABASE_SERVICE_ROLE_KEY / JWT / sb_secret_)
//   • ทุกเครื่อง: JWT ที่ถอดแล้วเป็น role=service_role และไม่ใช่ของฐานในเครื่อง (iss = supabase-demo)
// ไฟล์ที่ตั้งใจใช้ (ยกเว้น): .env.production.local — สคริปต์ --prod ทุกตัวอ่านจากไฟล์นี้ (scripts/lib/targetEnv.mjs)
//
// ใช้: node scripts/check-prod-secrets-in-repo.mjs   (อยู่ใน pnpm checks) · ไม่พิมพ์ค่ากุญแจ พิมพ์แค่ชื่อไฟล์
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { ห้ามเปิด, ที่อยู่ส่วนตัว } from "./lib/localPaths.mjs";

const ยกเว้นไฟล์ = new Set([".env.production.local"]);
const ข้ามโฟลเดอร์ = new Set(["node_modules", ".git", ".next", ".turbo", "test-results", "playwright-report"]);
const ไม่เปิด = new Set(ห้ามเปิด.map(n => n.toLowerCase()));
const ใหญ่สุด = 20 * 1024 * 1024;

const อ่านค่า = (file, key) => {
  try { return (readFileSync(file, "utf8").match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, "m"))?.[1] ?? "").trim().replace(/^["']|["']$/g, ""); }
  catch { return ""; }
};
const รหัสฐานจริง = (อ่านค่า(".env.production.local", "NEXT_PUBLIC_SUPABASE_URL").match(/https?:\/\/([a-z0-9]+)\.supabase\./) ?? [])[1] ?? "";
const กุญแจฐานจริง = อ่านค่า(".env.production.local", "SUPABASE_SERVICE_ROLE_KEY");

const JWT = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const payload = t => { try { return JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString("utf8")); } catch { return null; } };

const เจอ = [];
const ข้ามที่ตั้งใจ = [];
let ตรวจ = 0;
const เดิน = d => {
  for (const n of readdirSync(d)) {
    if (ข้ามโฟลเดอร์.has(n) || n.startsWith(".next")) continue;
    const p = path.join(d, n);
    const rel = path.relative(".", p).split(path.sep).join("/");
    if (ไม่เปิด.has(n.toLowerCase())) { ข้ามที่ตั้งใจ.push(rel); continue; }   // ไม่ stat ไม่ readdir ไม่เปิดไฟล์ข้างใน
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { เดิน(p); continue; }
    if (ยกเว้นไฟล์.has(rel) || st.size > ใหญ่สุด) continue;
    let t; try { const b = readFileSync(p); if (b.includes(0)) continue; t = b.toString("utf8"); } catch { continue; }
    ตรวจ++;
    // 1) รหัสโปรเจกต์ฐานจริง + กุญแจ service role
    if (รหัสฐานจริง && t.includes(รหัสฐานจริง)) {
      const มีกุญแจ = (กุญแจฐานจริง && t.includes(กุญแจฐานจริง)) || /^\s*SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^<\s]{20,}/m.test(t) || /sb_secret_[A-Za-z0-9_-]{10,}/.test(t)
        || (t.match(JWT) ?? []).some(j => payload(j)?.role === "service_role");
      if (มีกุญแจ) { เจอ.push(`${rel} · รหัสโปรเจกต์ฐานจริงคู่กับกุญแจ service role`); continue; }
    }
    // 2) กุญแจฐานจริงตรงตัว (แม้ไม่มีรหัสโปรเจกต์อยู่ข้าง ๆ)
    if (กุญแจฐานจริง && t.includes(กุญแจฐานจริง)) { เจอ.push(`${rel} · กุญแจ service role ของฐานจริง`); continue; }
    // 3) JWT service role ที่ไม่ใช่ของฐานในเครื่อง (ใช้ได้แม้เครื่องไม่มี .env.production.local)
    if ((t.match(JWT) ?? []).some(j => { const p = payload(j); return p?.role === "service_role" && p?.iss !== "supabase-demo"; })) {
      เจอ.push(`${rel} · JWT service role ที่ไม่ใช่ของฐานในเครื่อง`);
    }
  }
};
เดิน(".");

// .local ต้องอยู่นอกสายตา git — มีโฟลเดอร์แต่ git ไม่ได้กัน = ไฟล์ข้างใน (กุญแจ · ข้อมูลจริง) git add ติดได้ทันที
let localไม่ถูกกัน = false;
if (existsSync(".local")) {
  const r = spawnSync("git", ["check-ignore", "-q", ".local/zz-ตรวจว่า-git-กัน"], { encoding: "utf8" });
  localไม่ถูกกัน = r.status !== 0;
}

console.log(`ไฟล์ใน repo ที่มีกุญแจ service role ของฐานจริง: ${เจอ.length} (ตรวจ ${ตรวจ} ไฟล์ · ยกเว้น ${[...ยกเว้นไฟล์].join(", ")}${ข้ามที่ตั้งใจ.length ? ` · ไม่เปิด ${ข้ามที่ตั้งใจ.join(", ")}` : ""}${รหัสฐานจริง ? "" : " · เครื่องนี้ไม่มีไฟล์ฐานจริง ตรวจแบบที่ 3 อย่างเดียว"})`);
if (เจอ.length) {
  for (const x of เจอ) console.log(`  ✗ ${x}`);
  console.log(`  → ย้ายไฟล์ไปไว้ที่ ${ที่อยู่ส่วนตัว("prod-secrets")}/ (นอก repo) · ห้ามวางค่าเชื่อมต่อฐานจริงไว้ข้างไฟล์ของชุดทดสอบ`);
  process.exitCode = 1;
}
if (localไม่ถูกกัน) {
  console.log("  ✗ มีโฟลเดอร์ .local แต่ git ไม่ได้กันไว้ — ต้องมีบรรทัด /.local/ ใน .gitignore (ไฟล์ข้างในห้ามขึ้น GitHub)");
  process.exitCode = 1;
}
