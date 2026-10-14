// ── อีเมลติดต่อของดีลเลอร์: ส่งโค้ดยืนยัน · ยืนยันโค้ด · HQ ยืนยันแทน (ด่าน 1 · ใบ 0194) ─────────────────────
//
// ทำงานด้วยกุญแจฝั่งเซิร์ฟเวอร์เท่านั้น — สถานะ "ยืนยันแล้ว" ผู้ใช้ตั้งเองไม่ได้ (ตัวดักที่ฐาน)
// ด่านยืนยันอยู่ที่หน้าจอ ไม่ปิดข้อมูลที่ฐาน: SMTP ล่มต้องไม่ล็อกดีลเลอร์ออก (ข้อตัดสิน 14 ต.ค. 69)
//   ทางออกเมื่อส่งไม่ได้: ข้อความบอกชัด · ปุ่มส่งโค้ดใหม่ · HQ กด "ยืนยันอีเมลแทน" ในหน้าดีลเลอร์
import { createHash, randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ส่งอีเมลค้างส่ง, คลังบนฐาน, ตัวส่งSMTP } from "./mail/outbox";

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
  if (/@partner-agent\.co\.th$/.test(email)) return { ok: false, status: 400, error: "อีเมลนี้เป็นอีเมลเข้าระบบที่ไม่มีกล่องจดหมายจริง — ใช้อีเมลที่ติดต่อได้จริง" };

  const { data: เดิม } = await admin.from("contact_email_codes").select("sent_at").eq("user_id", who.userId).maybeSingle();
  if (เดิม?.sent_at) {
    const ผ่านไป = (Date.now() - new Date(String(เดิม.sent_at)).getTime()) / 1000;
    if (ผ่านไป < ส่งใหม่ได้หลังวินาที) {
      return { ok: false, status: 429, error: `เพิ่งส่งโค้ดไป — ขอโค้ดใหม่ได้อีกครั้งใน ${Math.ceil(ส่งใหม่ได้หลังวินาที - ผ่านไป)} วินาที` };
    }
  }

  const { error: upErr } = await admin.from("profiles").update({ contact_email: email }).eq("id", who.userId);
  if (upErr) return { ok: false, status: 503, error: "บันทึกอีเมลติดต่อไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง" };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { error: codeErr } = await admin.from("contact_email_codes").upsert({
    user_id: who.userId, email, code_hash: แฮช(who.userId, code), attempts: 0,
    expires_at: new Date(Date.now() + อายุโค้ดนาที * 60_000).toISOString(), sent_at: new Date().toISOString(),
  });
  if (codeErr) return { ok: false, status: 503, error: "สร้างโค้ดยืนยันไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง" };

  const { data: จดหมาย, error: mailErr } = await admin.from("email_outbox").insert({
    kind: "contact_email_verify", to_email: email, ref_table: "profiles", ref_id: who.userId,
    subject: `โค้ดยืนยันอีเมลติดต่อ Benjamin PMS: ${code}`,
    body: `โค้ดยืนยันอีเมลติดต่อของดีลเลอร์ ${who.dealerCode} คือ ${code}\n\nกรอกโค้ดนี้ในหน้าจอภายใน ${อายุโค้ดนาที} นาที\n`
      + "อีเมลนี้จะใช้รับแจ้งเตือนจากสำนักงานใหญ่ เช่น เมื่อสำนักงานใหญ่ส่งใบเสนอราคาให้\n"
      + "ถ้าไม่ได้ขอโค้ดนี้ ไม่ต้องทำอะไร",
  }).select("id").single();
  if (mailErr || !จดหมาย) return { ok: false, status: 503, error: "ส่งโค้ดไม่สำเร็จ — ลองกด “ส่งโค้ดใหม่” หรือติดต่อสำนักงานใหญ่ให้ยืนยันอีเมลแทน" };

  const ผล = await ส่งอีเมลค้างส่ง(คลังบนฐาน(admin, Number(จดหมาย.id)), await ตัวส่งSMTP(), 1);
  if (ผล.ส่งแล้ว !== 1) {
    if (ผล.ข้าม) console.warn(`[contact-email] ${ผล.ข้าม}`);
    return { ok: false, status: 503, error: "ระบบส่งอีเมลขัดข้อง ส่งโค้ดไม่สำเร็จ — ลองกด “ส่งโค้ดใหม่” ภายหลัง หรือติดต่อสำนักงานใหญ่ให้ยืนยันอีเมลแทน (ใช้งานระบบต่อได้ตามปกติ)" };
  }
  return { ok: true, sentTo: email };
}

/** ตรวจโค้ด → ถูกต้อง = ตั้งสถานะยืนยันแล้ว และปลดเครื่องหมาย "ต้องยืนยันอีเมล" ของบัญชี */
export async function ยืนยันโค้ดอีเมล(admin: SupabaseClient, who: { userId: string; appMeta: Record<string, unknown> }, code: string)
  : Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: แถว } = await admin.from("contact_email_codes").select("email, code_hash, expires_at, attempts").eq("user_id", who.userId).maybeSingle();
  if (!แถว) return { ok: false, status: 400, error: "ยังไม่ได้ขอโค้ด หรือโค้ดถูกใช้ไปแล้ว — กด “ส่งโค้ด” ก่อน" };
  if (new Date(String(แถว.expires_at)).getTime() < Date.now()) return { ok: false, status: 400, error: "โค้ดหมดอายุแล้ว — กด “ส่งโค้ดใหม่”" };
  if (Number(แถว.attempts) >= ลองโค้ดได้) return { ok: false, status: 429, error: "กรอกโค้ดผิดหลายครั้งเกินไป — กด “ส่งโค้ดใหม่”" };
  const { contactEmail } = await สถานะอีเมลติดต่อ(admin, who.userId);
  if (contactEmail.trim().toLowerCase() !== String(แถว.email)) return { ok: false, status: 400, error: "อีเมลติดต่อเปลี่ยนไปหลังขอโค้ด — กด “ส่งโค้ดใหม่”" };
  if (แฮช(who.userId, code.trim()) !== แถว.code_hash) {
    await admin.from("contact_email_codes").update({ attempts: Number(แถว.attempts) + 1 }).eq("user_id", who.userId);
    return { ok: false, status: 400, error: "โค้ดไม่ถูกต้อง" };
  }
  const { error } = await admin.from("profiles").update({ contact_email_verified_at: new Date().toISOString() }).eq("id", who.userId);
  if (error) return { ok: false, status: 503, error: "ยืนยันไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง" };
  await admin.from("contact_email_codes").delete().eq("user_id", who.userId);
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
  const { error: upErr } = await admin.from("profiles").update({ contact_email_verified_at: new Date().toISOString() }).eq("id", บัญชี.id);
  if (upErr) return { ok: false, status: 503, error: "ยืนยันไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง" };
  await admin.from("contact_email_codes").delete().eq("user_id", บัญชี.id);
  const { data: u } = await admin.auth.admin.getUserById(String(บัญชี.id));
  const meta = (u?.user?.app_metadata ?? {}) as Record<string, unknown>;
  if (meta.must_verify_email) await admin.auth.admin.updateUserById(String(บัญชี.id), { app_metadata: { ...meta, must_verify_email: false } });
  return { ok: true, email: String(บัญชี.contact_email).trim().toLowerCase() };
}
