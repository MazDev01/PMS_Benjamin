// ── อีเมลติดต่อของดีลเลอร์: ส่งโค้ดยืนยัน · ยืนยันโค้ด · HQ ยืนยันแทน (ด่าน 1 · ใบ 0194) ─────────────────────
//
// ทำงานด้วยกุญแจฝั่งเซิร์ฟเวอร์เท่านั้น — สถานะ "ยืนยันแล้ว" ผู้ใช้ตั้งเองไม่ได้ (ตัวดักที่ฐาน)
// ด่านยืนยันอยู่ที่หน้าจอ ไม่ปิดข้อมูลที่ฐาน: SMTP ล่มต้องไม่ล็อกดีลเลอร์ออก (ข้อตัดสิน 14 ต.ค. 69)
//   ทางออกเมื่อส่งไม่ได้: ข้อความบอกชัด · ปุ่มส่งโค้ดใหม่ · HQ กด "ยืนยันอีเมลแทน" ในหน้าดีลเลอร์
import { createHash, randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ส่งอีเมลค้างส่ง, คลังบนฐาน, ตัวส่งSMTP } from "./mail/outbox";
import { เป็นอีเมลเข้าระบบดีลเลอร์ } from "@pms/shared/lib/dealerLogin";

export const อายุโค้ดนาที = 15;
export const ส่งใหม่ได้หลังวินาที = 60;
export const ลองโค้ดได้ = 5;
const รูปแบบอีเมล = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const แฮช = (userId: string, code: string) => createHash("sha256").update(`${userId}:${code}`).digest("hex");

export type ผลส่งโค้ด = { ok: true; sentTo: string } | { ok: false; status: number; error: string };

export async function สถานะอีเมลติดต่อ(admin: SupabaseClient, userId: string): Promise<{ contactEmail: string; contactEmailVerified: boolean }> {
  const { data, error } = await admin.from("profiles").select("contact_email, contact_email_verified_at").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return { contactEmail: String(data?.contact_email ?? ""), contactEmailVerified: !!data?.contact_email_verified_at };
}

/** บันทึกอีเมลติดต่อ (สถานะยืนยันถูกล้างเองที่ฐาน) แล้วส่งโค้ด 6 หลักไปที่อีเมลนั้นทันที */
export async function ส่งโค้ดยืนยันอีเมล(admin: SupabaseClient, who: { userId: string; dealerCode: string }, อีเมลที่กรอก: string): Promise<ผลส่งโค้ด> {
  const email = อีเมลที่กรอก.trim().toLowerCase();
  if (!รูปแบบอีเมล.test(email)) return { ok: false, status: 400, error: "รูปแบบอีเมลไม่ถูกต้อง" };
  if (เป็นอีเมลเข้าระบบดีลเลอร์(email)) return { ok: false, status: 400, error: "อีเมลนี้เป็นอีเมลเข้าระบบที่ไม่มีกล่องจดหมายจริง — ใช้อีเมลที่ติดต่อได้จริง" };

  const { data: เดิม } = await admin.from("contact_email_codes").select("sent_at").eq("user_id", who.userId).maybeSingle();
  if (เดิม?.sent_at) {
    const ผ่านไป = (Date.now() - new Date(String(เดิม.sent_at)).getTime()) / 1000;
    if (ผ่านไป < ส่งใหม่ได้หลังวินาที) {
      return { ok: false, status: 429, error: `เพิ่งส่งเลขยืนยันไป — ขอเลขยืนยันใหม่ได้อีกครั้งใน ${Math.ceil(ส่งใหม่ได้หลังวินาที - ผ่านไป)} วินาที` };
    }
  }

  const { error: upErr } = await admin.from("profiles").update({ contact_email: email }).eq("id", who.userId);
  if (upErr) return { ok: false, status: 503, error: "บันทึกอีเมลติดต่อไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง" };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { error: codeErr } = await admin.from("contact_email_codes").upsert({
    user_id: who.userId, email, code_hash: แฮช(who.userId, code), attempts: 0,
    expires_at: new Date(Date.now() + อายุโค้ดนาที * 60_000).toISOString(), sent_at: new Date().toISOString(),
  });
  if (codeErr) return { ok: false, status: 503, error: "สร้างเลขยืนยันไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง" };

  const { data: จดหมาย, error: mailErr } = await admin.from("email_outbox").insert({
    kind: "contact_email_verify", to_email: email, ref_table: "profiles", ref_id: who.userId,
    subject: `เลขยืนยันอีเมลติดต่อ Benjamin PMS: ${code}`,
    body: `เลขยืนยันอีเมลติดต่อของดีลเลอร์ ${who.dealerCode} คือ ${code}\n\nกรอกเลขยืนยันนี้ในหน้าจอภายใน ${อายุโค้ดนาที} นาที\n`
      + "อีเมลนี้จะใช้รับแจ้งเตือนจากสำนักงานใหญ่ เช่น เมื่อสำนักงานใหญ่ส่งใบเสนอราคาให้\n"
      + "ถ้าไม่ได้ขอเลขยืนยันนี้ ไม่ต้องทำอะไร",
  }).select("id").single();
  if (mailErr || !จดหมาย) return { ok: false, status: 503, error: "ส่งเลขยืนยันไม่สำเร็จ — ลองกด “ส่งเลขยืนยันใหม่” หรือติดต่อสำนักงานใหญ่ให้ยืนยันอีเมลแทน" };

  const ผล = await ส่งอีเมลค้างส่ง(คลังบนฐาน(admin, Number(จดหมาย.id)), await ตัวส่งSMTP(), 1);
  if (ผล.ส่งแล้ว !== 1) {
    if (ผล.ข้าม) console.warn(`[contact-email] ${ผล.ข้าม}`);
    return { ok: false, status: 503, error: "ระบบส่งอีเมลขัดข้อง ส่งเลขยืนยันไม่สำเร็จ — ลองกด “ส่งเลขยืนยันใหม่” ภายหลัง หรือติดต่อสำนักงานใหญ่ให้ยืนยันอีเมลแทน (ใช้งานระบบต่อได้ตามปกติ)" };
  }
  return { ok: true, sentTo: email };
}

/** ตรวจโค้ด → ถูกต้อง = ตั้งสถานะยืนยันแล้ว และปลดเครื่องหมาย "ต้องยืนยันอีเมล" ของบัญชี */
export async function ยืนยันโค้ดอีเมล(admin: SupabaseClient, who: { userId: string; appMeta: Record<string, unknown> }, code: string)
  : Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: แถว } = await admin.from("contact_email_codes").select("email, code_hash, expires_at, attempts").eq("user_id", who.userId).maybeSingle();
  if (!แถว) return { ok: false, status: 400, error: "ยังไม่ได้ขอเลขยืนยัน หรือเลขยืนยันถูกใช้ไปแล้ว — กด “ส่งเลขยืนยัน” ก่อน" };
  if (new Date(String(แถว.expires_at)).getTime() < Date.now()) return { ok: false, status: 400, error: "เลขยืนยันหมดอายุแล้ว — กด “ส่งเลขยืนยันใหม่”" };
  if (Number(แถว.attempts) >= ลองโค้ดได้) return { ok: false, status: 429, error: "กรอกเลขยืนยันผิดหลายครั้งเกินไป — กด “ส่งเลขยืนยันใหม่”" };
  const { contactEmail } = await สถานะอีเมลติดต่อ(admin, who.userId);
  if (contactEmail.trim().toLowerCase() !== String(แถว.email)) return { ok: false, status: 400, error: "อีเมลติดต่อเปลี่ยนไปหลังขอเลขยืนยัน — กด “ส่งเลขยืนยันใหม่”" };
  // นับครั้งก่อนเทียบโค้ด ทุกครั้ง (บอสสั่ง 15 ต.ค. 69) — เขียนไม่สำเร็จ = ปฏิเสธ แม้โค้ดถูก
  //   เดิมนับเฉพาะตอนผิด และไม่ดูผล: เขียนไม่สำเร็จแล้วตัวนับไม่ขึ้น → เดาโค้ดได้ไม่จำกัด
  //   เขียนแบบมีเงื่อนไข (ตัวนับต้องยังเป็นค่าเดิม) — สองคำขอพร้อมกันนับซ้อนกันไม่ได้ อีกคำขอถูกปฏิเสธ
  const { data: นับแล้ว, error: นับErr } = await admin.from("contact_email_codes")
    .update({ attempts: Number(แถว.attempts) + 1 }).eq("user_id", who.userId).eq("attempts", Number(แถว.attempts)).select("attempts");
  if (นับErr || !นับแล้ว?.length) return { ok: false, status: 503, error: "ตรวจเลขยืนยันไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง" };
  if (แฮช(who.userId, code.trim()) !== แถว.code_hash) return { ok: false, status: 400, error: "เลขยืนยันไม่ถูกต้อง" };
  // โค้ดใช้ได้ครั้งเดียว: ลบก่อนตั้งสถานะ — ลบไม่สำเร็จ = ปฏิเสธ (ไม่ให้โค้ดเดิมใช้ซ้ำได้)
  const { data: ลบแล้ว, error: ลบErr } = await admin.from("contact_email_codes").delete().eq("user_id", who.userId).select("user_id");
  if (ลบErr || !ลบแล้ว?.length) return { ok: false, status: 503, error: "ยืนยันไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง" };
  const { error } = await admin.from("profiles").update({ contact_email_verified_at: new Date().toISOString() }).eq("id", who.userId);
  if (error) return { ok: false, status: 503, error: "ยืนยันไม่สำเร็จชั่วคราว — กด “ส่งเลขยืนยันใหม่” แล้วลองอีกครั้ง" };
  if (who.appMeta.must_verify_email) await admin.auth.admin.updateUserById(who.userId, { app_metadata: { ...who.appMeta, must_verify_email: false } });
  return { ok: true };
}

/** HQ ยืนยันอีเมลติดต่อแทนดีลเลอร์ (ทางออกเมื่อส่งอีเมลไม่ได้) — ยืนยันอีเมลที่ดีลเลอร์กรอกไว้แล้วเท่านั้น HQ ไม่ได้พิมพ์อีเมลเอง */
export async function ยืนยันอีเมลแทนดีลเลอร์(admin: SupabaseClient, dealerCode: string)
  : Promise<{ ok: true; email: string } | { ok: false; status: number; error: string }> {
  const { data: profs, error } = await admin.from("profiles").select("id, contact_email")
    .eq("dealer_code", dealerCode).eq("role", "DEALER_ADMIN");
  if (error) return { ok: false, status: 503, error: "อ่านบัญชีดีลเลอร์ไม่สำเร็จชั่วคราว" };
  const บัญชี = (profs ?? []).find(p => String(p.contact_email ?? "").trim());
  if (!บัญชี) return { ok: false, status: 400, error: "ดีลเลอร์ยังไม่ได้กรอกอีเมลติดต่อ — ให้ดีลเลอร์กรอกก่อน แล้วจึงยืนยันแทนได้" };
  // ล้างโค้ดที่ค้างก่อน — ล้างไม่สำเร็จ = ปฏิเสธ (บอสสั่ง 15 ต.ค. 69 · โค้ดค้างใช้ยืนยันซ้ำทีหลังได้)
  const { error: ลบErr } = await admin.from("contact_email_codes").delete().eq("user_id", บัญชี.id);
  if (ลบErr) return { ok: false, status: 503, error: "ยืนยันไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง" };
  const { error: upErr } = await admin.from("profiles").update({ contact_email_verified_at: new Date().toISOString() }).eq("id", บัญชี.id);
  if (upErr) return { ok: false, status: 503, error: "ยืนยันไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง" };
  const { data: u } = await admin.auth.admin.getUserById(String(บัญชี.id));
  const meta = (u?.user?.app_metadata ?? {}) as Record<string, unknown>;
  if (meta.must_verify_email) await admin.auth.admin.updateUserById(String(บัญชี.id), { app_metadata: { ...meta, must_verify_email: false } });
  return { ok: true, email: String(บัญชี.contact_email).trim().toLowerCase() };
}

// ── อีเมลผู้รับแจ้งเตือนของสาขา (รายการ · ใบ 0274 · บอสสั่ง 3 พ.ย. 69) ─────────────────────────────────────────
//   เพิ่ม/ลบรายการ = คำสั่งของฐาน (dealer_notify_recipient_add/remove ในนามผู้ใช้) · ยืนยันด้วยโค้ด = ที่นี่ (กุญแจฝั่งเซิร์ฟเวอร์)
//   ยืนยันแล้วเท่านั้นที่ได้รับแจ้งเตือน (_dealer_notify_emails) · ผู้ใช้ตั้ง "ยืนยันแล้ว" เองไม่ได้ (ตัวดักที่ฐาน)
const แฮชผู้รับ = (id: number, code: string) => createHash("sha256").update(`notify-recipient:${id}:${code}`).digest("hex");

async function ผู้รับของสาขา(admin: SupabaseClient, dealerCode: string, id: number) {
  const { data, error } = await admin.from("dealer_notify_recipients").select("id, dealer_code, email, verified_at").eq("id", id).maybeSingle();
  if (error) return { ok: false as const, status: 503, error: "อ่านรายชื่อผู้รับไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง" };
  // ของสาขาอื่น = ตอบเหมือนไม่มี (ไม่บอกว่ามีอยู่)
  if (!data || String(data.dealer_code) !== dealerCode) return { ok: false as const, status: 404, error: "ไม่พบอีเมลนี้ในรายชื่อของสาขา" };
  return { ok: true as const, row: { id: Number(data.id), email: String(data.email), verified: !!data.verified_at } };
}

/** ส่งโค้ด 6 หลักไปที่อีเมลในรายชื่อ (ยังไม่ยืนยัน) — ส่งซ้ำได้ทุก 60 วินาที */
export async function ส่งโค้ดผู้รับแจ้งเตือน(admin: SupabaseClient, who: { dealerCode: string }, id: number): Promise<ผลส่งโค้ด> {
  const r = await ผู้รับของสาขา(admin, who.dealerCode, id);
  if (!r.ok) return r;
  if (r.row.verified) return { ok: false, status: 400, error: "อีเมลนี้ยืนยันแล้ว" };
  const { data: เดิม } = await admin.from("dealer_notify_recipient_codes").select("sent_at").eq("recipient_id", id).maybeSingle();
  if (เดิม?.sent_at) {
    const ผ่านไป = (Date.now() - new Date(String(เดิม.sent_at)).getTime()) / 1000;
    if (ผ่านไป < ส่งใหม่ได้หลังวินาที) return { ok: false, status: 429, error: `เพิ่งส่งเลขยืนยันไป — ขอเลขยืนยันใหม่ได้อีกครั้งใน ${Math.ceil(ส่งใหม่ได้หลังวินาที - ผ่านไป)} วินาที` };
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { error: codeErr } = await admin.from("dealer_notify_recipient_codes").upsert({
    recipient_id: id, code_hash: แฮชผู้รับ(id, code), attempts: 0,
    expires_at: new Date(Date.now() + อายุโค้ดนาที * 60_000).toISOString(), sent_at: new Date().toISOString(),
  });
  if (codeErr) return { ok: false, status: 503, error: "สร้างเลขยืนยันไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง" };
  const { data: จดหมาย, error: mailErr } = await admin.from("email_outbox").insert({
    kind: "notify_recipient_verify", to_email: r.row.email, ref_table: "dealer_notify_recipients", ref_id: String(id),
    subject: `เลขยืนยันอีเมลรับแจ้งเตือน Benjamin PMS: ${code}`,
    body: `เลขยืนยันอีเมลรับแจ้งเตือนของดีลเลอร์ ${who.dealerCode} คือ ${code}\n\nกรอกเลขยืนยันนี้ในหน้า ตั้งค่า › การแจ้งเตือน ภายใน ${อายุโค้ดนาที} นาที\n`
      + "ยืนยันแล้วอีเมลนี้จะได้รับแจ้งเตือนจากระบบ เช่น เมื่อสำนักงานใหญ่ส่งราคาให้\n"
      + "ถ้าไม่ได้ขอเลขยืนยันนี้ ไม่ต้องทำอะไร",
  }).select("id").single();
  if (mailErr || !จดหมาย) return { ok: false, status: 503, error: "ส่งเลขยืนยันไม่สำเร็จ — ลองกด “ส่งเลขยืนยัน” อีกครั้ง" };
  const ผล = await ส่งอีเมลค้างส่ง(คลังบนฐาน(admin, Number(จดหมาย.id)), await ตัวส่งSMTP(), 1);
  if (ผล.ส่งแล้ว !== 1) {
    if (ผล.ข้าม) console.warn(`[notify-recipient] ${ผล.ข้าม}`);
    return { ok: false, status: 503, error: "ระบบส่งอีเมลขัดข้อง ส่งเลขยืนยันไม่สำเร็จ — ลองกด “ส่งเลขยืนยัน” อีกครั้งภายหลัง" };
  }
  return { ok: true, sentTo: r.row.email };
}

/** ตรวจโค้ด → ถูกต้อง = อีเมลนี้ยืนยันแล้ว (เริ่มรับแจ้งเตือน) · นับครั้งก่อนเทียบทุกครั้ง · โค้ดใช้ได้ครั้งเดียว */
export async function ยืนยันโค้ดผู้รับแจ้งเตือน(admin: SupabaseClient, who: { dealerCode: string }, id: number, code: string)
  : Promise<{ ok: true; email: string } | { ok: false; status: number; error: string }> {
  const r = await ผู้รับของสาขา(admin, who.dealerCode, id);
  if (!r.ok) return r;
  if (r.row.verified) return { ok: true, email: r.row.email };
  const { data: แถว } = await admin.from("dealer_notify_recipient_codes").select("code_hash, expires_at, attempts").eq("recipient_id", id).maybeSingle();
  if (!แถว) return { ok: false, status: 400, error: "ยังไม่ได้ขอเลขยืนยัน หรือเลขยืนยันถูกใช้ไปแล้ว — กด “ส่งเลขยืนยัน” ก่อน" };
  if (new Date(String(แถว.expires_at)).getTime() < Date.now()) return { ok: false, status: 400, error: "เลขยืนยันหมดอายุแล้ว — กด “ส่งเลขยืนยัน” ใหม่" };
  if (Number(แถว.attempts) >= ลองโค้ดได้) return { ok: false, status: 429, error: "กรอกเลขยืนยันผิดหลายครั้งเกินไป — กด “ส่งเลขยืนยัน” ใหม่" };
  const { data: นับแล้ว, error: นับErr } = await admin.from("dealer_notify_recipient_codes")
    .update({ attempts: Number(แถว.attempts) + 1 }).eq("recipient_id", id).eq("attempts", Number(แถว.attempts)).select("attempts");
  if (นับErr || !นับแล้ว?.length) return { ok: false, status: 503, error: "ตรวจเลขยืนยันไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง" };
  if (แฮชผู้รับ(id, code.trim()) !== แถว.code_hash) return { ok: false, status: 400, error: "เลขยืนยันไม่ถูกต้อง" };
  const { data: ลบแล้ว, error: ลบErr } = await admin.from("dealer_notify_recipient_codes").delete().eq("recipient_id", id).select("recipient_id");
  if (ลบErr || !ลบแล้ว?.length) return { ok: false, status: 503, error: "ยืนยันไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง" };
  const { error } = await admin.from("dealer_notify_recipients").update({ verified_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, status: 503, error: "ยืนยันไม่สำเร็จชั่วคราว — กด “ส่งเลขยืนยัน” แล้วลองอีกครั้ง" };
  return { ok: true, email: r.row.email };
}

export type ผลอีเมลทดสอบ = { email: string; ok: boolean; error?: string };

/** ส่งอีเมลทดสอบถึงทุกอีเมลในรายชื่อ — ส่งทันทีทีละฉบับ แล้วบอกผลรายอีเมล (ไม่มีผู้รับ = รายการว่าง) */
export async function ส่งอีเมลทดสอบ(admin: SupabaseClient, รายชื่อ: string[], ฝั่ง: string): Promise<ผลอีเมลทดสอบ[]> {
  const ตัวส่ง = await ตัวส่งSMTP();
  const ผล: ผลอีเมลทดสอบ[] = [];
  for (const email of [...new Set(รายชื่อ.map(e => e.trim().toLowerCase()).filter(Boolean))]) {
    if (!ตัวส่ง) { ผล.push({ email, ok: false, error: "ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ส่งอีเมล" }); continue; }
    const { data: จดหมาย, error } = await admin.from("email_outbox").insert({
      kind: "notify_test", to_email: email, ref_table: "notify_test", ref_id: ฝั่ง,
      subject: "อีเมลทดสอบการแจ้งเตือน Benjamin PMS",
      body: `อีเมลนี้ส่งจากปุ่ม “ส่งอีเมลทดสอบ” ในหน้า ตั้งค่า › การแจ้งเตือน (${ฝั่ง})\n\nได้รับอีเมลนี้ = อีเมลแจ้งเตือนของระบบส่งถึงที่อยู่นี้ได้\nไม่ต้องตอบกลับ`,
    }).select("id").single();
    if (error || !จดหมาย) { ผล.push({ email, ok: false, error: "วางจดหมายไม่สำเร็จชั่วคราว" }); continue; }
    const r = await ส่งอีเมลค้างส่ง(คลังบนฐาน(admin, Number(จดหมาย.id)), ตัวส่ง, 1);
    ผล.push(r.ส่งแล้ว === 1 ? { email, ok: true } : { email, ok: false, error: "เซิร์ฟเวอร์อีเมลไม่รับ — ตรวจที่อยู่อีเมลหรือลองใหม่ภายหลัง" });
  }
  return ผล;
}
