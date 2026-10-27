// ── ตัวตรวจ: หน้าเว็บห้ามเขียนไทม์ไลน์/ติ๊กงานของลีดเองตามหลังขั้นของใบหรือนัดหมาย (บอสสั่ง 27 ต.ค. 69 · ใบ 0248) ──────
// เหตุ: คำสั่งตามหลังหายได้เมื่อผู้ใช้ปิดหน้า/เน็ตหลุดหลังกด (ไทม์ไลน์ "ลูกค้าตอบรับ" หาย) → ฐานทำในคำสั่งเดียวกันแล้ว (ใบ 0210 · 0248)
// ตก เมื่อ:
//   ① โค้ดหน้าเว็บส่งบรรทัดไทม์ไลน์ (activities ในเจตนาเขียนลีด) นอกตัวจดเดียวที่อนุญาต (logLeadActivity ซึ่งโหมดฐานไม่ทำอะไร)
//   ② ตัวจด/ตัวติ๊กของระบบ (logLeadActivity · completeLeadQuoteTasks · completeAppointmentTask) ไม่ได้หยุดทันทีในโหมดฐาน
// บันทึกการติดต่อที่ผู้ใช้พิมพ์เอง (รายงานติดตาม) ไม่ใช่ไทม์ไลน์ของระบบ — ไม่อยู่ในกติกานี้
// mutation proof: PMS_TIMELINE_CHECK_ROOT=<โฟลเดอร์ที่คัดไปแก้> (ลบตัวหยุด / เพิ่มที่ส่ง activities) → ต้องตก
// รัน: node scripts/check-no-client-timeline.mjs (อยู่ใน npm run checks)
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ราก = process.env.PMS_TIMELINE_CHECK_ROOT || process.cwd();
const ข้าม = new Set(["node_modules", ".next", ".turbo", "dist", "server"]);   // server/ = เส้นทางของเซิร์ฟเวอร์ (ส่งต่อเจตนาเฉย ๆ)
const ไม่ตรวจ = [/lib[\\/]data[\\/]local[\\/]/, /lib[\\/]leadIntent\.ts$/, /lib[\\/]mock\.ts$/];   // โหมดตัวอย่าง / สำเนาตรรกะฐาน / ข้อมูลตัวอย่าง
const ไฟล์ = [];
const เดิน = (d) => {
  for (const n of readdirSync(d)) {
    if (ข้าม.has(n)) continue;
    const p = path.join(d, n);
    if (statSync(p).isDirectory()) เดิน(p);
    else if (/\.(ts|tsx)$/.test(n) && !/\.d\.ts$/.test(n) && !ไม่ตรวจ.some(r => r.test(p))) ไฟล์.push(p);
  }
};
for (const d of ["apps", "packages"]) เดิน(path.join(ราก, d));

const ผิด = [];
const ตัวหยุด = ["logLeadActivity", "completeLeadQuoteTasks", "completeAppointmentTask"];
let เจอตัวหยุด = 0;
for (const f of ไฟล์) {
  const s = readFileSync(f, "utf8").replace(/\r\n/g, "\n");
  const ชื่อ = path.relative(ราก, f).replaceAll("\\", "/");
  // ② ตัวจด/ตัวติ๊กของระบบต้องหยุดทันทีในโหมดฐาน
  for (const fn of ตัวหยุด) {
    const m = new RegExp(`const ${fn} = useCallback\\(\\(([^)]*)\\)[^{]*=> \\{\\n([^\\n]*)`).exec(s);
    if (!m) continue;
    เจอตัวหยุด++;
    if (!/^\s*if \(USE_SUPABASE\) return;/.test(m[2])) ผิด.push(`${ชื่อ}: ${fn} ต้องขึ้นต้นด้วย "if (USE_SUPABASE) return;" (โหมดฐาน ฐานจด/ติ๊กเอง · ใบ 0248)`);
  }
  // ① บรรทัดไทม์ไลน์ในเจตนาเขียนลีด — อนุญาตเฉพาะในตัว logLeadActivity
  const ช่วงอนุญาต = (() => {
    const i = s.indexOf("const logLeadActivity = useCallback(");
    return i < 0 ? [-1, -1] : [i, s.indexOf("\n  }, [", i)];
  })();
  for (const m of s.matchAll(/\bactivities\s*:\s*\[/g)) {
    const ก่อน = s.slice(Math.max(0, m.index - 300), m.index);
    const เขียนลีด = /(บันทึกลีด|\.apply|persistLead\.\w+|leadsRepo\.\w+)\s*\([^;]*$/.test(ก่อน);
    if (!เขียนลีด) continue;
    if (m.index > ช่วงอนุญาต[0] && m.index < ช่วงอนุญาต[1]) continue;
    const บรรทัด = s.slice(0, m.index).split("\n").length;
    ผิด.push(`${ชื่อ}:${บรรทัด}: หน้าเว็บส่งบรรทัดไทม์ไลน์ของลีดเอง — ให้ฐานจดในคำสั่งเดียวกับขั้นนั้น (ดูใบ 0210 · 0248)`);
  }
}
if (เจอตัวหยุด < ตัวหยุด.length) ผิด.push(`หาตัวจด/ตัวติ๊กของระบบไม่ครบ (${เจอตัวหยุด}/${ตัวหยุด.length}) — ย้ายชื่อแล้วต้องแก้ตัวตรวจนี้ด้วย`);

if (ผิด.length) {
  console.error(`❌ check-no-client-timeline: ${ผิด.length} จุด\n   ${ผิด.join("\n   ")}`);
  process.exit(1);
}
console.log(`✓ check-no-client-timeline: หน้าเว็บไม่เขียนไทม์ไลน์/ติ๊กงานของระบบเอง (${ไฟล์.length} ไฟล์)`);
