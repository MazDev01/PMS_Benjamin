// ── ส่งออกชื่อผู้ใช้ + รหัสผ่านชั่วคราวของดีลเลอร์ เป็นไฟล์ CSV (เปิดด้วย Excel) — บอสอนุมัติ 19 ต.ค. 69 ───────────
//
// ใช้ส่งให้ดีลเลอร์แยกเป็นรายสาขา (ประกาศถึงดีลเลอร์) · หน้าเว็บ HQ ดูได้ทีละสาขาเท่านั้น (การ์ด "ข้อมูลเข้าระบบ")
// หนึ่งแถวต่อดีลเลอร์: ชื่อสาขา · ชื่อผู้ใช้ (= รหัสสาขา) · รหัสผ่านชั่วคราว — เกณฑ์อยู่ที่ scripts/lib/dealerLoginExport.mjs
//
// ใช้:
//   node scripts/export-dealer-logins.mjs --out <ไฟล์.csv นอก repo>            ฐานทดสอบ
//   node scripts/export-dealer-logins.mjs --prod --yes-prod --out <ไฟล์.csv>  ฐานจริง
// ⚠️ ไฟล์มีรหัสผ่านทุกสาขา: ห้ามเขียนใน repo (สคริปต์ปฏิเสธ) · ไม่เขียนทับไฟล์เดิม · ไม่พิมพ์รหัสลงจอ
//    บันทึกการใช้งาน (audit_log) 1 แถวว่าส่งออกกี่สาขา · ส่งครบแล้วลบไฟล์ทิ้ง
import { createClient } from "@supabase/supabase-js";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readEnvFile, refOf } from "./lib/targetEnv.mjs";
import { ตัวถอดรหัส } from "./lib/dealerSecretNode.mjs";
import { แถวส่งออก, เป็นCSV } from "./lib/dealerLoginExport.mjs";

const args = process.argv.slice(2);
const มี = f => args.includes(f);
const ฐานจริง = มี("--prod");
const iOut = args.indexOf("--out");
const out = iOut >= 0 ? args[iOut + 1] : "";
const ตาย = m => { console.error(`❌ ${m}`); process.exitCode = 1; };

const repo = path.resolve(".");
const ปลายทาง = out ? path.resolve(out) : "";
if (!ปลายทาง || !/\.csv$/i.test(ปลายทาง)) ตาย("ต้องบอกที่เก็บไฟล์ --out <ไฟล์.csv> (นอก repo)");
else if ((ปลายทาง + path.sep).toLowerCase().startsWith(repo.toLowerCase() + path.sep)) ตาย("ห้ามเขียนไฟล์รหัสผ่านไว้ใน repo — เลือกที่เก็บนอก repo");
else if (existsSync(ปลายทาง)) ตาย("มีไฟล์นี้อยู่แล้ว — ไม่เขียนทับ (ลบเองหรือใช้ชื่อใหม่)");
else if (ฐานจริง && !มี("--yes-prod")) ตาย("ส่งออกจากฐานจริงต้องใส่ --yes-prod เพื่อยืนยันว่าตั้งใจ");
else await ส่งออก();

async function ส่งออก() {
  const env = readEnvFile(ฐานจริง ? ".env.production.local" : "apps/hq/.env.local");
  if (!ฐานจริง && /^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
  const prodRef = refOf(readEnvFile(".env.production.local").NEXT_PUBLIC_SUPABASE_URL ?? "");
  const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_ || !KEY) return ตาย("ไม่พบค่าเชื่อมต่อฐานข้อมูล");
  const เป็นฐานจริง = prodRef !== "(ไม่ทราบ)" && refOf(URL_) === prodRef;
  if (เป็นฐานจริง && !ฐานจริง) return ตาย("ไฟล์ค่าเชื่อมต่อของฐานทดสอบชี้ไปที่ฐานจริง — หยุด (จะใช้ฐานจริงต้องใส่ --prod เอง)");
  const ถอด = ตัวถอดรหัส(env.DEALER_SECRET_KEY ?? "");
  if (!ถอด) return ตาย("ไม่มีกุญแจถอดรหัส (DEALER_SECRET_KEY) ในไฟล์ค่าเชื่อมต่อ");
  console.log(`\n🎯 ฐานข้อมูล: ${เป็นฐานจริง ? "ชุดจริง" : "ชุดทดสอบ"} · ส่งออกชื่อผู้ใช้ + รหัสผ่านชั่วคราว`);

  const svc = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const ทั้งหมด = async (table, cols) => {
    const o = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await svc.from(table).select(cols).range(from, from + 999);
      if (error) throw new Error(`อ่าน ${table} ไม่ได้: ${error.message}`);
      o.push(...data);
      if (data.length < 1000) return o;
    }
  };
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return ตาย(`อ่านรายชื่อบัญชีไม่ได้: ${error.message}`);
    users.push(...data.users.map(u => ({ id: u.id, email: u.email })));
    if (data.users.length < 1000) break;
  }
  const { แถว, สรุป } = แถวส่งออก({
    dealers: await ทั้งหมด("dealers", "code,name"), profiles: await ทั้งหมด("profiles", "id,role,dealer_code"),
    users, secrets: await ทั้งหมด("dealer_login_secrets", "dealer_code,secret,updated_by"), ถอด,
  });
  for (const [k, v] of Object.entries(สรุป)) console.log(`  ${k.padEnd(24)} ${v}`);
  writeFileSync(ปลายทาง, เป็นCSV(แถว), { encoding: "utf8", flag: "wx" });
  const { error } = await svc.from("audit_log").insert({ user: "สคริปต์ส่งออก (เครื่องผู้ดูแล)", role: "SUPER_ADMIN",
    action: "ส่งออกชื่อผู้ใช้และรหัสผ่านชั่วคราวของดีลเลอร์", target: `${แถว.length} สาขา` });
  if (error) console.log(`  ⚠️ บันทึกการใช้งานไม่สำเร็จ: ${error.message}`);
  console.log(`\n✓ เขียนไฟล์แล้ว ${แถว.length} แถว — ไฟล์มีรหัสผ่านทุกสาขา ส่งครบแล้วลบทิ้ง\n`);
}
