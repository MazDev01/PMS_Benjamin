// ── ข้อทดสอบ: ด่านฐานจริงของ prod-live + ชุดล้าง (บอสสั่ง 28 ต.ค. 69 · scripts/lib/prodBackupMark.mjs) ─────────────────────
// เหตุ: 28 ต.ค. 69 ซ้อมกู้ตก แต่คำสั่งที่ต่อด้วย ";" ปล่อย prod-live เขียนสาขา ZZT ลงฐานจริงต่อ — ให้เครื่องกัน ไม่ใช่จำ
//   ทุกสคริปต์ที่เขียนฐานจริงต้องไม่รันเมื่อ: ก. ไม่มีผลสำรอง+ซ้อมกู้  ข. ผลล่าสุดไม่ผ่าน  ค. ผลผ่านเก่าเกิน 30 นาที
//   "ไม่รัน" = ออกรหัส 3 พร้อมข้อความ "⛔ ไม่รัน" และไม่สร้างไฟล์สถานะ (setup เดิมเขียนไฟล์สถานะก่อนต่อฐาน)
//   ง. ผลผ่านภายใน 30 นาที → ผ่านด่าน (ไปต่อจนต่อฐานปลอมไม่ได้)
// ไม่แตะฐานใด ๆ: ไฟล์กุญแจปลอมชี้ http://127.0.0.1:9 · ไฟล์ผลซ้อมกู้ชั่วคราว (PMS_BACKUP_RESULT)
//   ไม่รันขั้น cleanup ที่ผ่านด่าน (ขั้นนั้นเรียก supabase --linked)
// รัน: node tests/tools/prod-live-guard.test.mjs
//   พิสูจน์ว่าตกบนโค้ดเดิม: PMS_GUARD_ROOT=<โฟลเดอร์ที่แตกโค้ดรุ่นก่อน (tests/prod-live + scripts/lib)> node tests/tools/prod-live-guard.test.mjs
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const ราก = process.cwd();
const โค้ด = process.env.PMS_GUARD_ROOT ? path.resolve(process.env.PMS_GUARD_ROOT) : ราก;
const ที่ = path.join(ราก, "test-results", `prod-live-guard-${process.pid}`);   // ใน repo (หา node_modules เจอ) · git ไม่เก็บ
const ผลซ้อมกู้ = path.join(ที่, "ผลซ้อมกู้ล่าสุด.json");
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(-800)}`}`); };

rmSync(ที่, { recursive: true, force: true });
mkdirSync(ที่, { recursive: true });
writeFileSync(path.join(ที่, ".env.production.local"),
  "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9\nNEXT_PUBLIC_SUPABASE_ANON_KEY=ปลอม\nSUPABASE_SERVICE_ROLE_KEY=ปลอม\n");

const ตั้งผล = (ค่า) => { rmSync(ผลซ้อมกู้, { force: true }); if (ค่า) writeFileSync(ผลซ้อมกู้, JSON.stringify(ค่า)); };
const นาทีก่อน = n => new Date(Date.now() - n * 60_000).toISOString();
const กรณี = {
  "ไม่มีผลสำรอง+ซ้อมกู้": null,
  "ผลล่าสุดไม่ผ่าน": { ผ่าน: false, เวลา: นาทีก่อน(1), ชุด: "ชุดทดสอบ", เหตุ: "ตัวนับไม่ตรง" },
  "ผลผ่านเก่าเกิน 30 นาที": { ผ่าน: true, เวลา: นาทีก่อน(31), ชุด: "ชุดทดสอบ" },
};
const สคริปต์ = [
  ["prod-live setup", ["tests/prod-live/run.mjs", "--target", "prod", "setup"]],
  ["prod-live test", ["tests/prod-live/run.mjs", "--target", "prod", "test"]],
  ["prod-live files", ["tests/prod-live/run.mjs", "--target", "prod", "files"]],
  ["ชุดล้าง (prod-live cleanup)", ["tests/prod-live/run.mjs", "--target", "prod", "cleanup"]],
  ["ทดสอบส่งอีเมลจริง", ["tests/prod-live/email-send-once.mjs"]],
  ["ล้างแถวทดสอบส่งอีเมล --yes", ["tests/prod-live/email-send-cleanup.mjs", "--yes"]],
  ["ตรวจเข้าครั้งแรก", ["tests/prod-live/first-login-check.mjs"]],
  ["ตรวจคืนสิทธิ์", ["tests/prod-live/reset-closed-check.mjs"]],
];
const รัน = (args) => {
  const สถานะ = path.join(ที่, "live-state-prod.json");
  rmSync(สถานะ, { force: true });
  const r = spawnSync(process.execPath, [path.join(โค้ด, args[0]), ...args.slice(1)], {
    cwd: ที่, encoding: "utf8", timeout: 60_000,
    env: { ...process.env, PMS_BACKUP_RESULT: ผลซ้อมกู้, LIVE_STATE_DIR: ที่, PMS_PROD_OPS_DIR: path.join(ที่, "ไม่มีโฟลเดอร์ฐานจริง") },
  });
  return { รหัส: r.status, ออก: (r.stdout ?? "") + (r.stderr ?? ""), เขียนสถานะ: existsSync(สถานะ) };
};

for (const [ชื่อกรณี, ค่า] of Object.entries(กรณี)) {
  ตั้งผล(ค่า);
  for (const [ชื่อ, args] of สคริปต์) {
    const r = รัน(args);
    ผล(r.รหัส === 3 && r.ออก.includes("⛔ ไม่รัน") && !r.เขียนสถานะ, `${ชื่อกรณี} → ${ชื่อ} ไม่รัน`,
      `รหัส ${r.รหัส} · เขียนไฟล์สถานะ ${r.เขียนสถานะ} · ${r.ออก}`);
  }
}

// ง. ผลผ่านเมื่อ 2 นาทีก่อน → setup ผ่านด่าน (เขียนไฟล์สถานะแล้วต่อฐานปลอมไม่ได้ = รหัส 1) — ด่านไม่ได้ขวางตลอด
ตั้งผล({ ผ่าน: true, เวลา: นาทีก่อน(2), ชุด: "ชุดทดสอบ" });
{
  const r = รัน(["tests/prod-live/run.mjs", "--target", "prod", "setup"]);
  ผล(!r.ออก.includes("⛔ ไม่รัน") && r.เขียนสถานะ && r.รหัส === 1, "ผลผ่านภายใน 30 นาที → setup ผ่านด่าน (ไปต่อจนต่อฐานปลอมไม่ได้)",
    `รหัส ${r.รหัส} · เขียนไฟล์สถานะ ${r.เขียนสถานะ} · ${r.ออก}`);
}

// จ. ตัวอ่านผลโดยตรง (เฉพาะโค้ดปัจจุบัน · โค้ดเดิมไม่มีไฟล์นี้ = ตก)
const ไฟล์ด่าน = path.join(โค้ด, "scripts/lib/prodBackupMark.mjs");
if (!existsSync(ไฟล์ด่าน)) ผล(false, "มี scripts/lib/prodBackupMark.mjs", "ไม่มีไฟล์");
else {
  process.env.PMS_BACKUP_RESULT = ผลซ้อมกู้;
  const { ผลสำรองล่าสุด, บันทึกผลซ้อมกู้ } = await import(`file:///${ไฟล์ด่าน.replaceAll("\\", "/")}`);
  ตั้งผล({ ผ่าน: true, เวลา: นาทีก่อน(-5), ชุด: "ชุดทดสอบ" });
  ผล(!!ผลสำรองล่าสุด().ปัญหา, "เวลาผลอยู่ในอนาคต → ไม่ยอม");
  ตั้งผล({ ผ่าน: true, เวลา: นาทีก่อน(1) });
  ผล(!!ผลสำรองล่าสุด().ปัญหา, "ผลผ่านแต่ไม่มีชื่อชุดสำรอง → ไม่ยอม");
  writeFileSync(ผลซ้อมกู้, "{เสีย");
  ผล(!!ผลสำรองล่าสุด().ปัญหา, "ไฟล์ผลเสีย → ไม่ยอม");
  บันทึกผลซ้อมกู้({ ผ่าน: false, ชุด: "ชุดใหม่", เหตุ: "กำลังสำรอง" });
  ผล(/ไม่ผ่าน/.test(ผลสำรองล่าสุด().ปัญหา ?? ""), "เริ่มสำรองรอบใหม่ (เขียน 'กำลังสำรอง') → ผลผ่านเก่าใช้ไม่ได้ทันที");
  บันทึกผลซ้อมกู้({ ผ่าน: true, ชุด: "ชุดใหม่" });
  ผล(ผลสำรองล่าสุด().ชุด === "ชุดใหม่", "ซ้อมกู้ผ่าน → คืนชื่อชุดสำรอง (ชุดล้างใช้ชื่อนี้แทนค่าตัวอย่างใน cleanup.sql)");
}

rmSync(ที่, { recursive: true, force: true });
console.log(ตก ? `FAIL ${ตก}` : "ALL PASS");
process.exitCode = ตก ? 1 : 0;
