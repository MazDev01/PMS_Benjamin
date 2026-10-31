// ── ช่องแพ็กเกจลบออกจากฐานถาวร (บอสสั่ง 30 ต.ค. 69 · รอบที่ 2 = ใบ 0269 · 1 พ.ย. 69) ──
//   ข้อทดสอบตามคำสั่ง: "หลังลบ ทั้ง 2 แอปไม่มีโค้ดอ้างช่องนี้"
//   ไล่ทุกไฟล์โค้ดของ apps/hq · apps/dealer · packages/shared (ไม่นับคำอธิบาย) หาการอ้างช่อง package ของ dealers / dealer_package_proposals:
//     อ่าน/เขียนช่อง (.package · package: · "package" ในคำสั่งเลือกช่อง) · ชนิด DealerPackage · ตัวเลือก/ป้ายแพ็กเกจ · ช่องฟอร์ม #pp-package
//   ตกบนโค้ดก่อนรอบนี้: ฟอร์มใบค่าแฟรนไชส์มีช่องแพ็กเกจ · API สร้างดีลเลอร์เขียน package · ชนิดข้อมูลมีช่อง package
//   ชื่อตาราง dealer_package_proposals / ชนิด DealerPackageProposal = ชื่อตาราง (ไม่ใช่ช่อง) — ไม่นับ
//   ค่าตั้ง "packages" ใน JSON ค่าตั้งหาดีลเลอร์ = ข้อมูลในตารางค่าตั้ง (ไม่ใช่ช่องนี้) — ไม่นับ
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const รากโค้ด = ["apps/hq/app", "apps/hq/lib", "apps/hq/components", "apps/dealer/app", "apps/dealer/lib", "apps/dealer/components", "packages/shared"];
function ไฟล์ทั้งหมด(dir: string): string[] {
  let st;
  try { st = statSync(dir); } catch { return []; }
  if (!st.isDirectory()) return [];
  return readdirSync(dir).flatMap(n => {
    if (n === "node_modules" || n === ".next" || n.startsWith(".")) return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? ไฟล์ทั้งหมด(p) : /\.(ts|tsx|mjs|js)$/.test(n) ? [p] : [];
  });
}
/** ตัดคำอธิบาย (// … และ /* … *\/ รวม {/* … *\/}) ออกก่อนค้น — คำอธิบายเล่าประวัติแพ็กเกจได้ */
//   คงตัวขึ้นบรรทัดของคำอธิบายหลายบรรทัดไว้ — เลขบรรทัดที่รายงานตรงกับไฟล์จริง
const ตัดคำอธิบาย = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, "")).replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

const รูปแบบ: [RegExp, string][] = [
  [/\.package\b(?!s)/, "อ่านช่อง .package"],
  [/(^|[{,\s])package\s*:/m, "ช่อง package: ในข้อมูล"],
  [/["'`][^"'`\n]*\bpackage\b[^"'`\n]*["'`]/, "ชื่อช่อง package ในข้อความคำสั่ง (เลือก/เขียนช่อง)"],
  [/\bDealerPackage\b(?!Proposal)/, "ชนิด DealerPackage"],
  [/\bPACKAGE_ORDER\b|\bpackageLabel\b|\bเป็นแพ็กเกจ\b|\bเป้าตามแพ็กเกจ\b|\bใช้เป้าตามแพ็กเกจ\b/, "ตัวเลือก/ป้าย/เป้าตามแพ็กเกจ"],
  [/pp-package/, "ช่องฟอร์ม #pp-package"],
];
// ข้อความที่มีคำ package แต่ไม่ใช่ช่องนี้ (ชื่อไฟล์ส่งออกตามชื่อตาราง · ชื่อแพ็กเกจ npm)
const ข้อยกเว้นข้อความ = /dealer[-_]package[-_]proposals|@pms\/|package\.json|openxmlformats[\w.\/-]*package/;   // OOXML ของไฟล์ส่งออก Excel = คำว่า package ของรูปแบบไฟล์

describe("ช่องแพ็กเกจ (ลบแล้ว · ใบ 0269) — ทั้ง 2 แอปไม่มีโค้ดอ้างช่องนี้", () => {
  it("ไม่มีไฟล์ไหนอ่าน/เขียน/แสดงช่องแพ็กเกจ", () => {
    const ไฟล์ = รากโค้ด.flatMap(ไฟล์ทั้งหมด);
    expect(ไฟล์.length, "เจอไฟล์โค้ดของทั้ง 2 แอป + ส่วนกลาง").toBeGreaterThan(200);
    expect(ไฟล์.some(f => f.includes(join("apps", "dealer"))), "ไล่แอปดีลเลอร์ด้วย").toBe(true);
    const เจอ: string[] = [];
    for (const f of ไฟล์) {
      const บรรทัด = ตัดคำอธิบาย(readFileSync(f, "utf8")).split(/\r?\n/);
      บรรทัด.forEach((l, i) => {
        if (!/package|Package|PACKAGE|แพ็กเกจ/.test(l)) return;
        for (const [re, ชื่อ] of รูปแบบ) {
          const m = l.match(re);
          if (m && !ข้อยกเว้นข้อความ.test(m[0])) เจอ.push(`${f.replace(/\\/g, "/")}:${i + 1} ${ชื่อ} — ${l.trim().slice(0, 120)}`);
        }
      });
    }
    expect(เจอ, "โค้ดที่ยังอ้างช่องแพ็กเกจ").toEqual([]);
  });
});
