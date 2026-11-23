// ── งานตั้งเวลา: ดึงผู้สนใจจาก Google Sheets อัตโนมัติทุกชั่วโมง (ใบ 0295 · บอสสั่ง 23 พ.ย. 69) ──────────────────────────────
//
// ผู้เรียก: งานตั้งเวลาของฐาน pg_cron + pg_net (_cron_prospect_sheet · นาทีที่ 7 ทุกชั่วโมง · แบบเดียวกับ /api/cron/send-email ใบ 0212)
//   ส่ง Authorization: Bearer <CRON_SECRET> — ไม่มีหรือไม่ตรง = 401 (คนนอกสั่งดึง/นำเข้าไม่ได้)
//   ค่า env เดิมทั้งหมด (CRON_SECRET · SUPABASE_SERVICE_ROLE_KEY) — ไม่มีค่าใหม่
// ตรรกะอยู่ที่ packages/shared/server/prospectSheetSync.ts (ทางเดียวกับปุ่ม "ดึงตอนนี้")
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ดึงชีตรอบเดียว } from "@pms/shared/server/prospectSheetSync";
import { ตั้งค่าไม่ครบ } from "@pms/shared/lib/configMissing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) return NextResponse.json({ error: ตั้งค่าไม่ครบ("NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY", "cron-prospect-sheet") }, { status: 501 });
  const admin = createClient(url, key, { auth: { persistSession: false } });
  try {
    const ผล = await ดึงชีตรอบเดียว(admin, { กดเอง: false, ผู้ทำ: "ดึงอัตโนมัติ" });
    if (ผล.สถานะ === "failed") console.warn(`[cron/prospect-sheet] ${ผล.ข้อความ}`);
    return NextResponse.json(ผล);
  } catch (e) {
    console.error("[cron/prospect-sheet] รับงาน/จดผลไม่สำเร็จ", (e as Error)?.message);
    return NextResponse.json({ error: "ดึงชีตไม่สำเร็จ" }, { status: 500 });
  }
}
