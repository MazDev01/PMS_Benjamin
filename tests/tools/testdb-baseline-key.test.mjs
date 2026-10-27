// ── ข้อทดสอบ: แก้ข้อมูลตั้งต้น (tests/fixtures/test-baseline.sql) → ขอล็อกแล้วฐานทดสอบต้องสร้างใหม่ (27 ต.ค. 69) ──
// ตัวล็อกสร้างฐานใหม่เมื่อ "ชุดใบ" ยังไม่เคยสร้าง (scripts/lib/testDbLock.mjs ให้ฐานตรงกับไฟล์) — ชุดใบจึงต้องเปลี่ยนเมื่อข้อมูลตั้งต้นเปลี่ยน
//   เดิมนับแค่ใบปรับฐาน: เติมข้อมูลบริษัทให้ RYG ในไฟล์ตั้งต้นแล้วฐานทดสอบไม่ถูกสร้างใหม่ → ข้อทดสอบรันบนข้อมูลเก่าเงียบ ๆ
// ไม่แตะฐาน (ตรวจตัวคำนวณชุดใบในโฟลเดอร์ชั่วคราว) — รันได้ทุกเมื่อ
// mutation proof: PMS_GUARD_LIB_DIR=<โฟลเดอร์ที่มี testDbSchema.mjs รุ่นที่ไม่นับข้อมูลตั้งต้น> → ข้อแรกต้องตก
// รัน: node tests/tools/testdb-baseline-key.test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ที่ตัวล็อก = process.env.PMS_GUARD_LIB_DIR || path.join(process.cwd(), "scripts/lib");
const { ชุดใบ } = await import(pathToFileURL(path.join(ที่ตัวล็อก, "testDbSchema.mjs")).href);

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${เพิ่ม}`}`); };

const ราก = mkdtempSync(path.join(tmpdir(), "pms-baseline-key-"));
try {
  mkdirSync(path.join(ราก, "supabase/migrations"), { recursive: true });
  mkdirSync(path.join(ราก, "tests/fixtures"), { recursive: true });
  writeFileSync(path.join(ราก, "supabase/migrations/0001_a.sql"), "create table zz_a (id int);\n");
  const ตั้งต้น = path.join(ราก, "tests/fixtures/test-baseline.sql");
  writeFileSync(ตั้งต้น, "insert into zz_a values (1);\n");
  const ก่อน = ชุดใบ(ราก);

  writeFileSync(ตั้งต้น, "insert into zz_a values (1);\ninsert into zz_a values (2);\n");
  const หลังแก้ = ชุดใบ(ราก);
  ผล(หลังแก้ !== ก่อน, "แก้ข้อมูลตั้งต้น → ชุดใบเปลี่ยน (ขอล็อกครั้งถัดไปสร้างฐานใหม่)", `ก่อน ${ก่อน} · หลัง ${หลังแก้}`);

  writeFileSync(ตั้งต้น, "insert into zz_a values (1);\r\ninsert into zz_a values (2);\r\n");
  ผล(ชุดใบ(ราก) === หลังแก้, "ขึ้นบรรทัดแบบ Windows (CRLF) ไม่ทำให้ชุดใบเปลี่ยน", ชุดใบ(ราก));

  writeFileSync(ตั้งต้น, "insert into zz_a values (1);\n");
  ผล(ชุดใบ(ราก) === ก่อน, "เนื้อเดิม → ชุดใบเดิม (ไม่สร้างใหม่โดยไม่จำเป็น)", ชุดใบ(ราก));

  writeFileSync(path.join(ราก, "supabase/migrations/0002_b.sql"), "create table zz_b (id int);\n");
  ผล(ชุดใบ(ราก) !== ก่อน, "เพิ่มใบปรับฐาน → ชุดใบเปลี่ยน (พฤติกรรมเดิมยังอยู่)");

  rmSync(ตั้งต้น);
  let ได้ = "";
  try { ได้ = ชุดใบ(ราก); } catch (e) { ได้ = `ล้ม: ${e.message}`; }
  ผล(/^[0-9a-f]{16}$/.test(ได้), "ไม่มีไฟล์ข้อมูลตั้งต้น → ยังคำนวณได้ (โฟลเดอร์ซ้อมกู้)", ได้);
} finally {
  rmSync(ราก, { recursive: true, force: true });
}
console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
