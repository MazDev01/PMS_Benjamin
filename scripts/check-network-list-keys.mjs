// ── ตรวจว่ารายการ "รวมทั้งเครือ" ใช้ตัวแยกแถวที่ไม่ซ้ำจริง ──────────────────────────
//
// ที่มา (ผู้ใช้เจอเองจากหน้าจอ 7 ส.ค. 69):
//   หน้าลูกค้าเป้าหมายทั้งเครือขึ้น error ว่า "two children with the same key #L-40322"
//   เพราะเลขที่ลีดเดินแยกกันรายสาขา — เลข L-40322 ของระยองกับของเชียงใหม่คนละรายกันแต่ค่าเท่ากัน
//   หน้ารวมทั้งเครือเอามาแสดงด้วยกัน React จึงแยกสองแถวไม่ออก
//   ผลที่ผู้ใช้เจอ: แถวอาจสลับ ซ้ำ หรือหายไปเวลาข้อมูลอัปเดต — ตัวเลขไปโผล่ผิดแถวได้
//
// ⚠️ เรื่องนี้ผู้ใช้เป็นคนเจอ ไม่ใช่ระบบตรวจเจอ — ทั้งที่วันเดียวกันเพิ่งแก้ปัญหา "คีย์ซ้ำข้ามสาขา"
//    ที่ชั้นฐานข้อมูลไปแล้ว (การแบ่งหน้า) แต่ไม่ได้คิดว่าหน้าจอมีปัญหาเดียวกัน จึงต้องมีตัวตรวจ
//    น่าสนใจ: ตารางลูกค้าทั้งเครือแก้ถูกอยู่ก่อนแล้ว (ใช้ dealerCode-id) = เคยรู้ แต่ทำไม่ครบ
//
// กติกา: ไฟล์ที่อยู่ในขอบเขต "ทั้งเครือ" (apps/hq/** หรือ components/hq/**)
//   ถ้าวนแสดงรายการที่มี dealerCode อยู่ในแถว → คีย์ต้องพ่วง dealerCode ด้วย
//   (ถ้าแถวไม่มี dealerCode แปลว่าไม่ใช่ข้อมูลรายสาขา เช่น ผู้ใช้ HQ / แคตตาล็อกกลาง → ไม่บังคับ)
//
// รัน: node scripts/check-network-list-keys.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOTS = ["apps/hq", "packages/shared/components/hq"];
const SKIP = new Set(["node_modules", ".next", "dist", ".turbo"]);

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (SKIP.has(name)) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const bad = [];
for (const file of ROOTS.flatMap(r => walk(r))) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /key=\{([a-z])\.(id|numId|quoteNo)\}/.exec(lines[i]);
    if (!m) continue;
    const [, v] = m;
    // ยกเว้นได้เฉพาะตารางที่ id "ไม่ซ้ำทั้งระบบ" จริง (identity เดียวทั้งตาราง ไม่ได้เดินแยกรายสาขา)
    //   และ dealerCode ในแถวไม่ใช่สาขาเจ้าของ — ต้องเขียน "id ไม่ซ้ำทั้งระบบ" กำกับไว้ไม่เกิน 3 บรรทัดเหนือคีย์
    //   ตัวอย่าง: ลูกค้าเป้าหมายของสำนักงานใหญ่ (dealer_prospects · dealerCode = ดีลเลอร์ที่รายนั้นกลายมาเป็น)
    //   ⚠️ ห้ามใช้คำนี้กับตารางงานขาย (leads/quotations/customers/…) — เลขที่ของพวกนั้นซ้ำข้ามสาขาจริง
    if (/id ไม่ซ้ำทั้งระบบ/.test(lines.slice(Math.max(0, i - 3), i).join(" "))) continue;
    // แถวนี้เป็นข้อมูลรายสาขาหรือเปล่า — ดูจากการใช้ <ตัวแปร>.dealerCode ใน 25 บรรทัดถัดไป
    const body = lines.slice(i, Math.min(i + 25, lines.length)).join(" ");
    if (!new RegExp(`\\b${v}\\.dealerCode\\b`).test(body)) continue;   // ไม่ใช่ข้อมูลรายสาขา — ข้าม
    bad.push({ file: file.replace(/\\/g, "/"), line: i + 1, code: lines[i].trim().slice(0, 90) });
  }
}

for (const b of bad) console.log(`${b.file}:${b.line}\n    ${b.code}`);
console.log(`\nรายการรวมทั้งเครือที่ตัวแยกแถวซ้ำกันได้: ${bad.length}`);
process.exit(bad.length ? 1 : 0);
