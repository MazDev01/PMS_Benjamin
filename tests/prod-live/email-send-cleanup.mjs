// ── ล้างแถวที่การทดสอบส่งอีเมลจริง (email-send-once.mjs) สร้างไว้ — เลือกด้วยรหัสบัญชีทดสอบเท่านั้น ─────────────
//   ⚠️ ห้ามเลือกด้วยอีเมลผู้รับ: ผู้รับคือผู้รับแจ้งเตือน HQ ซึ่งมีแถวงานจริงอยู่ในกล่องขาออกด้วย (บอสสั่ง 19 ต.ค. 69)
//   ลบ: กล่องขาออก (ref_table=profiles · ref_id=รหัสบัญชี) · แถวโค้ด (user_id=รหัสบัญชี)
//       บันทึกการใช้งาน 1 แถว ("ดีลเลอร์ขอโค้ดยืนยันอีเมลติดต่อ") — ตารางนี้ไม่มีช่องรหัสบัญชี จึงเลือกด้วยรหัสสาขาทดสอบ ZZT
//   รันก่อน cleanup.sql (ตัวนั้นลบบัญชีทดสอบ = หารหัสไม่เจออีก) · ไม่ใส่ --yes = นับอย่างเดียว ไม่ลบ
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(".env.production.local", "utf8").split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const st = JSON.parse(readFileSync(path.join(process.env.LIVE_STATE_DIR ?? ".", "live-state-prod.json"), "utf8"));
const ลบจริง = process.argv.includes("--yes");
// ใบ 0245: ลบแถวทดสอบในบันทึกการใช้งาน ฐานเขียนบันทึกสรุป + ชื่อชุดสำรองก่อนลบ — ลบจริงต้องระบุ --backup <ชื่อโฟลเดอร์สำรองที่ซ้อมกู้ผ่านแล้ว>
const ชุดสำรอง = process.argv.includes("--backup") ? process.argv[process.argv.indexOf("--backup") + 1] : "";
if (ลบจริง && !ชุดสำรอง) { console.error("✗ ลบจริงต้องระบุ --backup <ชื่อชุดสำรองก่อนลบ> (ใบ 0245)"); process.exit(1); }
const userId = st.emailTest?.userId;
if (!userId || st.code !== "ZZT") { console.error("✗ ไม่มีรหัสบัญชีทดสอบในไฟล์สถานะ — ไม่ทำอะไร"); process.exit(1); }
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
// ด่านกันพลาด: รหัสนี้ต้องเป็นบัญชีชั่วคราวของสาขาทดสอบจริง
const { data: u } = await svc.auth.admin.getUserById(userId);
const { data: pf } = await svc.from("profiles").select("dealer_code").eq("id", userId).maybeSingle();
if (!/^live-dealer-\d+@example\.test$/.test(u?.user?.email ?? "") || pf?.dealer_code !== "ZZT") { console.error("✗ รหัสบัญชีไม่ใช่บัญชีทดสอบชั่วคราว — ยกเลิก"); process.exit(1); }

const ชุด = [
  ["กล่องขาออก", () => svc.from("email_outbox").select("id", { count: "exact", head: true }).eq("ref_table", "profiles").eq("ref_id", userId),
                 () => svc.from("email_outbox").delete().eq("ref_table", "profiles").eq("ref_id", userId)],
  ["แถวโค้ดยืนยัน", () => svc.from("contact_email_codes").select("user_id", { count: "exact", head: true }).eq("user_id", userId),
                 () => svc.from("contact_email_codes").delete().eq("user_id", userId)],
  ["บันทึกการใช้งาน", () => svc.from("audit_log").select("id", { count: "exact", head: true }).eq("action", "ดีลเลอร์ขอโค้ดยืนยันอีเมลติดต่อ").like("target", "ZZT · %"),
                 () => svc.rpc("audit_test_cleanup", { p_action_like: "ดีลเลอร์ขอโค้ดยืนยันอีเมลติดต่อ", p_target_like: "ZZT · %", p_backup: ชุดสำรอง })],   // ลบตรงไม่ได้ (ใบ 0241)
];
const { count: ทั้งกล่องก่อน } = await svc.from("email_outbox").select("id", { count: "exact", head: true });
for (const [ชื่อ, นับ, ลบ] of ชุด) {
  const ก่อน = (await นับ()).count;
  if (ลบจริง) { const { error } = await ลบ(); if (error) { console.error(`✗ ลบ${ชื่อ}ไม่สำเร็จ: ${error.message}`); process.exit(1); } }
  const หลัง = (await นับ()).count;
  console.log(`${ชื่อ}: ก่อน ${ก่อน} · หลัง ${หลัง}${ลบจริง ? "" : " (นับอย่างเดียว)"}`);
}
const { count: ทั้งกล่องหลัง } = await svc.from("email_outbox").select("id", { count: "exact", head: true });
console.log(`กล่องขาออกทั้งตาราง: ก่อน ${ทั้งกล่องก่อน} · หลัง ${ทั้งกล่องหลัง}`);
