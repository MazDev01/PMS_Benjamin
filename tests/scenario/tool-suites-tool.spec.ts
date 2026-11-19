import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

// ── ข้อทดสอบเครื่องมือที่เคยไม่อยู่ในรอบตรวจเต็ม (บอสสั่ง 29 ต.ค. 69 · scripts/check-tool-tests-in-gate.mjs) ─────────────────
//   ห่อชุดที่ไม่ใช้เว็บ/ฐานทดสอบ (repo/โฟลเดอร์จำลองในโฟลเดอร์ชั่วคราว) — ชุดที่ใช้ฐานทดสอบอยู่ใน tool-suites-db.spec.ts
const ชุด: [string, string][] = [
  ["tests/tools/session-tools.test.mjs", "เครื่องมือหลายเซสชัน: ล็อก · จองเลขใบ · session:new/merge/close (รวมแล้วรายการใบไม่หาย) · git hook"],
  ["tests/tools/pre-push-guard.test.mjs", "ตัวกัน push ขึ้น monorepo: ผลรอบตรวจ · ใบลงฐานจริงครบ · ถามฐานไม่ได้บอกวิธีแก้เป็นขั้นตอน"],
  ["tests/tools/vercel-gate.test.mjs", "Vercel ไม่ build commit ที่ไม่ผ่านรอบตรวจ"],
  ["tests/tools/post-deploy-docker-cleanup.test.mjs", "ล้าง Docker หลังขึ้นเว็บ: ลบเฉพาะ image supabase ที่ไม่มีคอนเทนเนอร์ใช้ + build cache · ไม่แตะของโปรเจกต์อื่น · ไม่ prune ทั้งเครื่อง · พื้นที่ C < 30 GB = เตือน"],
  ["tests/tools/live-check.test.mjs", "ตัวตรวจหน้าหลักหลังขึ้นเว็บ: อ่านอย่างเดียว (GET ไม่มีคุกกี้) · health/หน้าผิดพลาด/ยิงไม่ติด = ไม่ผ่าน"],
  ["tests/tools/gate-fast.test.mjs", "ทางผ่านแบบเร็ว: แตะใบ/สิทธิ์/เงิน/เครื่องมือรอบ = รอบเต็ม · บรรทัดเร็วปลอมไม่นับ · clone ตื้นตรวจได้"],
  ["tests/tools/flaky-log.test.mjs", "ตัวนับข้อไม่นิ่ง + บรรทัดต้นเหตุ"],
  ["tests/tools/dev-sample-guard.test.mjs", "ตัวลงข้อมูลตัวอย่างปฏิเสธฐานจริง/ฐานทดสอบ/เครื่องอื่นก่อนต่อฐาน · โหมดตรวจอย่างเดียว (บอสสั่ง 13 พ.ย. 69)"],
  ["tests/tools/ceiling-guard.test.mjs", "เพิ่มเพดานตัวตรวจ (lint · รอตายตัว · แถวแรก · ผ่านหลอก · หาไม่ตรงตัว) ต้องมีบอสรับทราบตรงค่า · ceiling:ack AI รันไม่ได้ (บอสสั่ง 13 พ.ย. 69)"],
  ["tests/tools/lint-gate.test.mjs", "ตัวตรวจ lint: ข้อผิดพลาด 1 ข้อ = ตก · คำเตือนเกินเพดาน = ตก · ไม่มีการปิดกฎ rules-of-hooks (บอสสั่ง 12 พ.ย. 69)"],
  ["tests/tools/test-self-skip.test.mjs", "ตัวตรวจข้อทดสอบข้ามตัวเองเมื่อไม่มีข้อมูล + รายงานข้อที่ข้ามแยกตามเหตุผล"],
  ["tests/tools/thai-guard.test.mjs", "ตัวกันภาษาไทย (Stop hook ร่าง · บอสวางใน settings เอง): ประโยคอังกฤษตีกลับ · ไทย+ชื่อไฟล์/โค้ดผ่าน · ไม่ตีซ้ำ"],
  ["tests/tools/proof-folder.test.mjs", "โฟลเดอร์พิสูจน์บนโค้ดเดิม: ชื่อมี $ { } = หยุด · ห้ามอยู่ในโฟลเดอร์ทำงาน/หลัก · ลบถอดลิงก์ก่อน (11 พ.ย. 69)"],
  ["tests/tools/nested-playwright-isolation.test.mjs", "ข้อทดสอบเครื่องมือที่รัน playwright ซ้อนไม่แตะของรอบ: ไฟล์บันทึก · ล็อก · โฟลเดอร์ผล · รายงาน JSON (รอบ deploy22 ครั้งที่ 4 ล้ม 16 พ.ย. 69)"],
  ["tests/tools/flaky-ack.test.mjs", "ชื่อข้อไม่นิ่งท้ายผล + รอบมีข้อไม่นิ่งรอบอสรับทราบ (round:ack กัน AI)"],
  ["tests/tools/untracked-code.test.mjs", "ไฟล์โค้ดในแอป/แพ็กเกจที่ git ยังไม่เก็บ = ชุดตรวจก่อน commit ตก (ตัวตรวจอื่นอ่านไม่ถึง)"],
  ["tests/tools/skip-exemptions.test.mjs", "ข้อที่ถูกข้ามในรอบตรวจเต็มต้องอยู่ในรายชื่อยกเว้นที่บอสอนุมัติ (ไฟล์ + ชื่อตรงตัว)"],
  ["tests/tools/test-ratchet.test.mjs", "ข้อทดสอบ: รอตายตัว + หยิบแถวแรกของรายการ ห้ามเพิ่ม ลดได้ (เพดานรายไฟล์)"],
  ["tests/tools/no-remote-font.test.mjs", "ขั้นสร้างเว็บไม่ดึงฟอนต์จาก Google: ฟอนต์จากไฟล์ในโปรเจกต์ (next/font/local)"],
  ["tests/tools/failure-evidence.test.mjs", "หลักฐานตอนข้อตก: ข้อความเซิร์ฟเวอร์ลงไฟล์ของรอบ · ตัดช่วงของข้อที่ตกไปวางข้าง trace + ภาพหน้าจอ"],
  ["tests/tools/prod-read-only.test.mjs", "prod:query ใส่ --yes เฉพาะคำสั่งอ่าน · คำสั่งเขียนถูกปฏิเสธก่อนต่อฐาน"],
  ["tests/tools/supabase-cli-rows.test.mjs", "อ่านผล Supabase CLI ได้ทั้ง 2 รูปแบบ · อ่านไม่ได้หยุดก่อนลบ · CLI รุ่นของโปรเจกต์"],
  ["tests/tools/restore-reset.test.mjs", "ล้างฐานซ้อมกู้ลองใหม่เฉพาะอาการคอนเทนเนอร์เตรียมโครงฐานล้ม"],
  ["tests/tools/live-mail-hold.test.mjs", "ชุดทดสอบเว็บจริงถือจดหมายของงานทดสอบไว้ ไม่ให้ถึงผู้รับจริง"],
  ["tests/tools/checkers-git-files.test.mjs", "ตัวตรวจอ่านเฉพาะไฟล์ที่ git เก็บ"],
  ["tests/tools/checkers-git-files-more.test.mjs", "ตัวตรวจอ่านเฉพาะไฟล์ที่ git เก็บ (ชุดเพิ่ม)"],
  ["tests/tools/audit-delete-paths.test.mjs", "ตัวตรวจทางลบบันทึกการใช้งาน"],
  ["tests/tools/check-notification-catalog.test.mjs", "ตัวตรวจตารางแจ้งเตือน FLOW ↔ ฐาน"],
  ["tests/tools/check-server-rpc-grants.test.mjs", "ตัวตรวจสิทธิ์ฟังก์ชันฝั่งเซิร์ฟเวอร์"],
  ["tests/tools/testdb-baseline-key.test.mjs", "กุญแจข้อมูลตั้งต้นฐานทดสอบ"],
  ["tests/tools/tool-tests-in-gate.test.mjs", "ตัวตรวจว่าข้อทดสอบเครื่องมือทุกชุดอยู่ในรอบตรวจเต็ม"],
  ["tests/tools/shared-baseline-asserts.test.mjs", "ตัวตรวจข้อทดสอบที่นับตรงเป๊ะจากข้อมูลตั้งต้นร่วม (คิวข้อ 3 · 29 ต.ค. 69)"],
  ["tests/tools/gate-resume.test.mjs", "รอบตรวจตกเพราะข้อทดสอบ → แก้แค่ไฟล์ที่ตก → รันต่อเฉพาะไฟล์นั้น (คิวข้อ 5 · 30 ต.ค. 69)"],
  ["tests/tools/gate-precheck.test.mjs", "ก่อนรอบตรวจเต็ม รันไฟล์ทดสอบที่เปลี่ยนก่อน · ตก = ไม่เริ่มรอบเต็ม (คิวข้อ 4 · 30 ต.ค. 69)"],
  ["tests/tools/testdb-wait.test.mjs", "ชุดทดสอบที่ใช้ฐานทดสอบ เจอเซสชันอื่นถือล็อก → \"รอ\" ไม่ใช่ \"ตก\" (คิวข้อ 2 · 30 ต.ค. 69)"],
  ["tests/tools/stale-ports.test.mjs", "ตอนเริ่มรอบตรวจ ปิดโปรเซสค้างบนพอร์ตของเซสชันตัวเอง (คิวข้อ 1 · 30 ต.ค. 69)"],
  ["tests/tools/gate-dirty-tree.test.mjs", "รอบตรวจเต็มปฏิเสธเมื่อมีไฟล์ที่ยังไม่ commit ในโฟลเดอร์ (บอกชื่อไฟล์ · บอสสั่ง 9 พ.ย. 69)"],
  ["tests/tools/check-fixture-regions.test.mjs", "ตัวตรวจชื่อภาคในข้อมูลตั้งต้น = รายการ th_provinces (10 พ.ย. 69)"],
  ["tests/tools/migration-rehearsal.test.mjs", "ซ้อมลงใบปรับฐานแบบ db push บนฐานแยก (ไม่ห่อ transaction · ข้อมูลแปลงจริง · ลบคอนเทนเนอร์ทุกครั้ง)"],
  ["tests/tools/migration-0287.test.mjs", "ซ้อมลงใบ 0287 ดีลเลอร์ HQD ขายตรง: ย้ายทุกอย่างใต้ HQ (รวมที่ปิดแล้ว · ใบ/คำขอ/ลูกค้า/ไฟล์ตามไป) · เลขเดิม · ไม่แจ้งเตือน · ตารางย้อนกลับ + ซ้อมย้อนกลับตรงทุกแถว"],
  ["tests/tools/migration-0288-0289.test.mjs", "ซ้อมลงใบ 0288 (ย้อนใบ won = ดีลเลอร์ภายใน 7 วัน · HQ/สาขาอื่น/เกิน 7 วัน/ไม่มีเหตุผล = ปฏิเสธ · ไทม์ไลน์/บันทึก/แจ้ง HQ) + 0289 (พิมพ์ใบคืนอีเมล/เว็บไซต์)"],
  ["tests/tools/migration-0286.test.mjs", "ซ้อมลงใบ 0286 คำบนจอที่ฐานสร้าง: แถวเก่าคงคำเดิม · 11 ฟังก์ชันไม่มีคำห้าม · ผู้ทำโดยระบบ = ระบบทำให้"],
];
for (const [ไฟล์, อะไร] of ชุด) {
  test(`[tool] ${อะไร} (${ไฟล์})`, () => {
    test.setTimeout(600_000);
    const r = spawnSync(process.execPath, [ไฟล์], { encoding: "utf8", maxBuffer: 256 << 20 });
    const ออก = (r.stdout ?? "") + (r.stderr ?? "");
    expect(ออก, ออก.slice(-4000)).toContain("ALL PASS");
    expect(r.status).toBe(0);
  });
}
