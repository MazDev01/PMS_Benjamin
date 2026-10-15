// ── งานตั้งเวลา: ส่งอีเมลที่ค้างในกล่องขาออก + ตรวจคำขอใบเสนอราคาเกิน 14 วัน ──────────────────────────
//
// ผู้เรียก: งานตั้งเวลาของฐาน pg_cron + pg_net (ใบ 0212 · ทุก 15 นาที · แผน Hobby ของ Vercel ตั้งถี่ไม่ได้) — ส่ง Authorization: Bearer <CRON_SECRET>
//   ไม่มีหรือไม่ตรง = 401 (คนนอกสั่งให้ระบบยิงอีเมลรัว ๆ ไม่ได้)
// ตรรกะอยู่ที่ packages/shared/server/mail/outbox.ts · ตารางกล่องขาออก: ใบ 0193
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ส่งอีเมลค้างส่ง, คลังบนฐาน, ตัวส่งSMTP } from "@pms/shared/server/mail/outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูลฝั่งเซิร์ฟเวอร์" }, { status: 501 });
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const ผล = await ส่งอีเมลค้างส่ง(คลังบนฐาน(admin), await ตัวส่งSMTP());
  if (ผล.ข้าม) console.warn(`[cron/send-email] ${ผล.ข้าม}`);
  if (ผล.ไม่สำเร็จ) console.error(`[cron/send-email] ส่งไม่สำเร็จ ${ผล.ไม่สำเร็จ} ฉบับ (จะลองใหม่รอบถัดไป)`);
  return NextResponse.json(ผล);
}
