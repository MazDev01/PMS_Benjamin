import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { คอนเทนเนอร์ฐาน } from "./localDb";

// ── ข้อทดสอบกติกาที่ฐานข้อมูล (supabase/tests/*.sql) ที่ต้องรันทุกรอบปิดด่าน ──────────────────────────────────
//   แต่ละไฟล์เป็นทรานแซกชันเดียวแล้ว rollback (ไม่ทิ้งข้อมูล) · ผ่าน = มีบรรทัด "ALL PASS" และไม่มี ERROR
//   เพิ่มที่นี่เมื่อกติกานั้นต้องไม่หลุดอีก (รอบ 2 งานไล่ flow · บอสสั่ง 19 ต.ค. 69 "ทุกข้อต้องมีข้อทดสอบ")
const ไฟล์ = [
  { ชื่อ: "no_temp_password_gate", อะไร: "ใบ 0216: ไม่มีด่านตั้งรหัสที่ชั้นฐานข้อมูล (บัญชีมีเครื่องหมายค้างเห็นข้อมูลปกติ)" },
  { ชื่อ: "lead_close_rules", อะไร: "ใบ 0217: ลีดปิดการขายแล้วดีลเลอร์ย้อนไม่ได้ · HQ ย้อนการตอบรับแล้วลีดกลับสถานะก่อนปิด · ลบลีดที่มีคำขอ/ใบไม่ได้" },
  { ชื่อ: "won_revert_hq_only", อะไร: "ใบ 0204–0205: ย้อนการตอบรับได้เฉพาะ HQ" },
  { ชื่อ: "won_quote_no_delete", อะไร: "ใบ 0203: ใบที่ลูกค้าตอบรับแล้วลบไม่ได้" },
  { ชื่อ: "lead_hq_quoted", อะไร: "ใบ 0218–0219 · 0221: ได้ราคา HQ ฐานขยับเอง · หมดอายุกลับรวบรวมความต้องการ · ลีดปิดแล้วทำใบ/ขอราคาไม่ได้" },
  { ชื่อ: "dealers_directory_own_row", อะไร: "ใบ 0220: ดีลเลอร์เห็นแถวตัวเองในทะเบียนดีลเลอร์ · HQ เห็นครบ" },
];

test.skip(() => !คอนเทนเนอร์ฐาน(), "ต้องใช้ฐานทดสอบในเครื่อง (docker) — ข้อทดสอบยิงตรงฐาน");

for (const f of ไฟล์) {
  test(`[db] ${f.ชื่อ} — ${f.อะไร}`, () => {
    const sql = readFileSync(`supabase/tests/${f.ชื่อ}.sql`, "utf8");
    // NOTICE ("ok …" / "ALL PASS") ออกทาง stderr · ผลลัพธ์ปกติออกทาง stdout — เก็บทั้งสองทาง
    const r = spawnSync("docker", ["exec", "-i", คอนเทนเนอร์ฐาน(), "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-v", "ON_ERROR_STOP=1"],
      { input: sql, encoding: "utf8" });
    const ข้อความ = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    expect(r.status, `psql ต้องจบปกติ — ${ข้อความ.match(/ERROR:.*$/m)?.[0] ?? ""}`).toBe(0);
    expect(ข้อความ, `ข้อทดสอบ ${f.ชื่อ}.sql ต้องไม่มี ERROR`).not.toMatch(/ERROR:/);
    expect(ข้อความ, `ข้อทดสอบ ${f.ชื่อ}.sql ต้องจบด้วย ALL PASS`).toMatch(/ALL PASS/);
  });
}
