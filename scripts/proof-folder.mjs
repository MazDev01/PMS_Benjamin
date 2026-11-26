#!/usr/bin/env node
// ── โฟลเดอร์พิสูจน์บนโค้ดเดิม (บอสสั่ง 11 พ.ย. 69) — ทางเดียวในการสร้าง/ลบโฟลเดอร์แยกสำหรับรันข้อทดสอบใหม่บนโค้ดเก่า ─────────
//   เหตุ: เคยถอยไฟล์ในโฟลเดอร์ทำงาน (ห้าม) · เคยพิมพ์คำสั่งเองแล้วตัวแปรไม่ถูกแทนค่า ได้ลิงก์ชื่อ "ef-proof-old${d}node_modules"
//         ชี้ไปที่อยู่ที่ไม่มีจริงค้างในเครื่อง
//   กันไว้: ชื่อโฟลเดอร์มี $ { } % ` หรือตัวแบ่งพาธ = หยุด · ปลายทางห้ามเป็น/อยู่ใน โฟลเดอร์ทำงานหรือโฟลเดอร์หลัก
//           ปลายทางของลิงก์ node_modules ต้องมีอยู่จริงก่อนสร้าง · มีโฟลเดอร์ชื่อนี้อยู่แล้ว = หยุด (ไม่ทับ)
//   ลบ: ถอดลิงก์ด้วย cmd /c rmdir ก่อน (ไม่ตามเข้าไปลบปลายทาง) แล้วสแกนว่าไม่เหลือลิงก์ จึงลบโฟลเดอร์
// ใช้:
//   node scripts/proof-folder.mjs สร้าง --ชื่อ ef-proof-charts --commit a9458ceb [--ไฟล์ tests/scenario/x.spec.ts ...]
//   node scripts/proof-folder.mjs ลบ --ชื่อ ef-proof-charts
// ข้อทดสอบ: tests/tools/proof-folder.test.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { โฟลเดอร์หลัก as หาโฟลเดอร์หลัก } from "./lib/localPaths.mjs";

export const ต้นทางเริ่มต้น = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ที่เก็บเริ่มต้น = path.dirname(ต้นทางเริ่มต้น);   // ที่เก็บโฟลเดอร์เซสชัน (.local/wt · ก่อนย้าย C:/.claude/pms-wt)
export const โฟลเดอร์หลัก = หาโฟลเดอร์หลัก(ต้นทางเริ่มต้น);     // ที่ .git จริงอยู่ (scripts/lib/localPaths.mjs)
export const ลิงก์ที่ใช้ = ["node_modules", "apps/dealer/node_modules", "apps/hq/node_modules", "packages/shared/node_modules"];
export const ไฟล์ตั้งค่า = ["apps/dealer/.env.local", "apps/hq/.env.local", "tests/.env.test", ".pms-session.json"];

/** ชื่อโฟลเดอร์ต้องเป็นตัวอักษร/ตัวเลข/จุด/ขีด เท่านั้น — มี $ { } % ` = ตัวแปรไม่ถูกแทนค่า → หยุด */
export function ตรวจชื่อโฟลเดอร์(ชื่อ) {
  const s = String(ชื่อ ?? "");
  if (!s) throw new Error("ไม่ได้ระบุชื่อโฟลเดอร์ (--ชื่อ)");
  if (/[$%{}`]/.test(s)) throw new Error(`ชื่อโฟลเดอร์ "${s}" มี $ { } % หรือ \` — ตัวแปรไม่ถูกแทนค่า หยุดก่อนสร้าง`);
  if (/[\\/]/.test(s) || s === "." || s === "..") throw new Error(`ชื่อโฟลเดอร์ "${s}" ต้องเป็นชื่อเดียว ไม่มีตัวแบ่งพาธ`);
  if (!/^[A-Za-z0-9._-]+$/.test(s)) throw new Error(`ชื่อโฟลเดอร์ "${s}" ใช้ได้เฉพาะ A–Z a–z 0–9 . _ -`);
  return s;
}

const ปกติ = (p) => path.resolve(p).replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "");
const อยู่ใน = (ลูก, แม่) => { const a = ปกติ(ลูก), b = ปกติ(แม่); return a === b || a.startsWith(b + "/"); };

/** ปลายทางห้ามเป็น/อยู่ใน โฟลเดอร์ทำงาน (ต้นทาง) หรือโฟลเดอร์หลัก — พิสูจน์ต้องอยู่โฟลเดอร์แยกเสมอ
 *  ยกเว้นโฟลเดอร์ลูกของ <หลัก>/.local/wt (ที่เก็บโฟลเดอร์เซสชันหลังย้าย 26 พ.ย. 69 · git ไม่เก็บ · เป็นโฟลเดอร์แยกจริง) */
export function ตรวจที่ตั้ง(เป้า, ต้นทาง = ต้นทางเริ่มต้น, หลัก = โฟลเดอร์หลัก) {
  const ที่เซสชัน = `${String(หลัก).replace(/\\/g, "/").replace(/\/+$/, "")}/.local/wt`;
  const ใต้ที่เซสชัน = อยู่ใน(เป้า, ที่เซสชัน) && ปกติ(เป้า) !== ปกติ(ที่เซสชัน);
  for (const [ชื่อ, ห้าม] of [["โฟลเดอร์ทำงาน", ต้นทาง], ["โฟลเดอร์หลัก", หลัก]]) {
    if (ชื่อ === "โฟลเดอร์หลัก" && ใต้ที่เซสชัน) continue;
    if (อยู่ใน(เป้า, ห้าม) || อยู่ใน(ห้าม, เป้า)) throw new Error(`ห้ามพิสูจน์ใน${ชื่อ} (${ห้าม}) — ต้องเป็นโฟลเดอร์แยก`);
  }
  return เป้า;
}

/** แผนลิงก์ node_modules: ทุกพาธ (ทั้งตัวลิงก์และปลายทาง) ต้องไม่มีตัวแปรค้าง และปลายทางต้องมีอยู่จริง */
export function แผนลิงก์(เป้า, ต้นทาง = ต้นทางเริ่มต้น, มีอยู่ = fs.existsSync) {
  return ลิงก์ที่ใช้.map(r => {
    const ลิงก์ = path.join(เป้า, r), ปลาย = path.join(ต้นทาง, r);
    for (const p of [ลิงก์, ปลาย]) if (/[$%{}`]/.test(p)) throw new Error(`พาธ "${p}" มีตัวแปรไม่ถูกแทนค่า — หยุด`);
    if (!มีอยู่(ปลาย)) throw new Error(`ปลายทางลิงก์ไม่มีอยู่จริง: ${ปลาย} — หยุด (ไม่สร้างลิงก์ชี้ไปที่ว่าง)`);
    return { ลิงก์, ปลาย };
  });
}

function ลิงก์ในโฟลเดอร์(ราก) {
  const พบ = [];
  const เดิน = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      const st = fs.lstatSync(p);
      if (st.isSymbolicLink()) { พบ.push(p); continue; }
      if (st.isDirectory() && e.name !== ".git") เดิน(p);
    }
  };
  เดิน(ราก);
  return พบ;
}

export function สร้าง({ ชื่อ, commit, ไฟล์ = [], ต้นทาง = ต้นทางเริ่มต้น, ที่เก็บ = ที่เก็บเริ่มต้น }) {
  ตรวจชื่อโฟลเดอร์(ชื่อ);
  if (!/^[0-9a-f]{7,40}$/i.test(String(commit ?? ""))) throw new Error(`commit "${commit}" ต้องเป็นรหัส commit (ตัวเลขฐาน 16)`);
  const เป้า = path.join(ที่เก็บ, ชื่อ);
  ตรวจที่ตั้ง(เป้า, ต้นทาง);
  if (fs.existsSync(เป้า)) throw new Error(`มีโฟลเดอร์ ${เป้า} อยู่แล้ว — ไม่ทับ (ลบด้วยคำสั่ง ลบ ก่อน)`);
  const ลิงก์ = แผนลิงก์(เป้า, ต้นทาง);
  execFileSync("git", ["clone", "--shared", "--quiet", ต้นทาง, เป้า], { stdio: "inherit" });
  execFileSync("git", ["-C", เป้า, "checkout", "--quiet", commit], { stdio: "inherit" });
  for (const f of ไฟล์ตั้งค่า) if (fs.existsSync(path.join(ต้นทาง, f))) fs.copyFileSync(path.join(ต้นทาง, f), path.join(เป้า, f));
  for (const { ลิงก์: l, ปลาย } of ลิงก์) fs.symlinkSync(ปลาย, l, "junction");
  for (const f of ไฟล์) {   // ข้อทดสอบใหม่ที่จะพิสูจน์ — คัดจากโฟลเดอร์ทำงานไปวางบนโค้ดเดิม
    if (path.isAbsolute(f) || f.includes("..")) throw new Error(`--ไฟล์ "${f}" ต้องเป็นพาธในโปรเจกต์`);
    fs.mkdirSync(path.dirname(path.join(เป้า, f)), { recursive: true });
    fs.copyFileSync(path.join(ต้นทาง, f), path.join(เป้า, f));
  }
  return เป้า;
}

export function ลบ({ ชื่อ, ต้นทาง = ต้นทางเริ่มต้น, ที่เก็บ = ที่เก็บเริ่มต้น }) {
  ตรวจชื่อโฟลเดอร์(ชื่อ);
  const เป้า = path.join(ที่เก็บ, ชื่อ);
  ตรวจที่ตั้ง(เป้า, ต้นทาง);
  if (!fs.existsSync(เป้า)) throw new Error(`ไม่มีโฟลเดอร์ ${เป้า}`);
  for (const l of ลิงก์ในโฟลเดอร์(เป้า)) execFileSync("cmd", ["/c", "rmdir", l]);   // ถอดเฉพาะตัวลิงก์ ไม่ตามเข้าไปลบปลายทาง
  const เหลือ = ลิงก์ในโฟลเดอร์(เป้า);
  if (เหลือ.length) throw new Error(`ยังมีลิงก์เหลือ ${เหลือ.length} จุด — หยุด ไม่ลบโฟลเดอร์: ${เหลือ.join(" · ")}`);
  fs.rmSync(เป้า, { recursive: true, force: true });
  return เป้า;
}

// ── รันเป็นคำสั่ง ──
if (/proof-folder\.mjs$/i.test(process.argv[1] ?? "")) {
  const [คำสั่ง, ...a] = process.argv.slice(2);
  const ค่า = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  const ไฟล์ = a.flatMap((x, i) => (a[i - 1] === "--ไฟล์" ? [x] : []));
  try {
    if (คำสั่ง === "สร้าง") console.log(`✓ สร้างโฟลเดอร์พิสูจน์ ${สร้าง({ ชื่อ: ค่า("--ชื่อ"), commit: ค่า("--commit"), ไฟล์ })}`);
    else if (คำสั่ง === "ลบ") console.log(`✓ ลบโฟลเดอร์พิสูจน์ ${ลบ({ ชื่อ: ค่า("--ชื่อ") })} (ถอดลิงก์ก่อน ปลายทางไม่ถูกแตะ)`);
    else { console.error("ใช้: proof-folder.mjs สร้าง --ชื่อ <ชื่อ> --commit <รหัส> [--ไฟล์ <พาธ> ...] | ลบ --ชื่อ <ชื่อ>"); process.exit(2); }
  } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
}
