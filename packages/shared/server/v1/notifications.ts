// ── /api/v1/notifications — แจ้งเตือนของผู้ใช้ที่ล็อกอิน (ใบ 0231) ──────────────────────────────────
//
// อ่านอย่างเดียว · คำขอวิ่งด้วยตัวตนของผู้เรียก → กฎรายแถวของฐานให้เห็นเฉพาะของผู้รับ (ดีลเลอร์ = สาขาตัวเอง · HQ = ของ HQ)
// แจ้งเตือนสร้างที่ฐานจากตารางกลาง notification_kinds ทางเดียว (_notify) — ที่นี่ไม่มีทางเขียน
import type { NextRequest } from "next/server";
import { handler, ok, dbFail } from "./_ctx";
import { toCamel } from "@pms/shared/lib/data/supabase/mappers";
import type { AppNotification } from "@pms/shared/lib/data/types";

export { runtime } from "./_ctx";

export const GET = handler("notifications.list", async (req: NextRequest, sb) => {
  const raw = Number(new URL(req.url).searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 200) : 100;
  const { data, error } = await sb.from("notifications").select("id, kind, title, body, href, created_at")
    .order("id", { ascending: false }).limit(limit);
  if (error) return dbFail("notifications.list", error);
  return ok(((data ?? []) as Record<string, unknown>[]).map(r => toCamel<AppNotification>(r)));
});
