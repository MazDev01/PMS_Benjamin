// ── /api/v1/notifications — แจ้งเตือนของผู้ใช้ที่ล็อกอิน (ใบ 0231) ──────────────────────────────────
//
// อ่านอย่างเดียว · คำขอวิ่งด้วยตัวตนของผู้เรียก → กฎรายแถวของฐานให้เห็นเฉพาะของผู้รับ (ดีลเลอร์ = สาขาตัวเอง · HQ = ของ HQ)
// แจ้งเตือนสร้างที่ฐานจากตารางกลาง notification_kinds ทางเดียว (_notify) — ที่นี่ไม่มีทางเขียน
import type { NextRequest } from "next/server";
import { handler, ok, dbFail, fail } from "./_ctx";
import { toCamel } from "@pms/shared/lib/data/supabase/mappers";
import type { AppNotification } from "@pms/shared/lib/data/types";

export { runtime } from "./_ctx";

export const GET = handler("notifications.list", async (req: NextRequest, sb) => {
  const q = new URL(req.url).searchParams;
  // ค่าตั้งรายเรื่อง / อีเมลผู้รับ (ใบ 0274) — คำสั่งของฐานตรวจสิทธิ์และฝั่งเอง
  if (q.get("view") === "prefs") {
    const { data, error } = await sb.rpc("notification_prefs_get");
    if (error) return dbFail("notifications.prefs", error);
    return ok(data ?? []);
  }
  if (q.get("view") === "recipients") {
    const { data, error } = await sb.rpc("dealer_notify_recipients_list", { p_dealer: q.get("dealer") || null });
    if (error) return dbFail("notifications.recipients", error);
    return ok(data ?? []);
  }
  const raw = Number(q.get("limit") ?? 100);
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 200) : 100;
  const { data, error } = await sb.from("notifications").select("id, kind, title, body, href, created_at")
    .order("id", { ascending: false }).limit(limit);
  if (error) return dbFail("notifications.list", error);
  return ok(((data ?? []) as Record<string, unknown>[]).map(r => toCamel<AppNotification>(r)));
});

// เขียน: ค่าตั้งรายเรื่อง · เพิ่ม/ลบอีเมลผู้รับ — ในนามผู้เรียก (ฐานกันเรื่องจำเป็น · สาขาตัวเอง · รูปแบบอีเมล · เพดาน 5)
//   ยืนยันโค้ด/ส่งอีเมลทดสอบ ไม่อยู่ที่นี่ (ต้องใช้กุญแจฝั่งเซิร์ฟเวอร์ + ตัวส่งอีเมล) — ดู /api/account · /api/admin/notify-test
export const POST = handler("notifications.write", async (req: NextRequest, sb) => {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return fail(400, "ข้อมูลไม่ถูกต้อง");
  switch (b.op) {
    case "set-pref": {
      if (typeof b.bell !== "boolean" || typeof b.email !== "boolean") return fail(400, "ต้องระบุเปิด/ปิดทั้งกระดิ่งและอีเมล");
      const { data, error } = await sb.rpc("notification_prefs_set", { p_kind: String(b.kind ?? ""), p_bell: b.bell, p_email: b.email });
      if (error) return dbFail("notifications.setPref", error);
      return ok(data ?? []);
    }
    case "add-recipient": {
      const { data, error } = await sb.rpc("dealer_notify_recipient_add", { p_email: String(b.email ?? "") });
      if (error) return dbFail("notifications.addRecipient", error);
      return ok(data);
    }
    case "remove-recipient": {
      const { error } = await sb.rpc("dealer_notify_recipient_remove", { p_id: Number(b.id) });
      if (error) return dbFail("notifications.removeRecipient", error);
      return ok({ ok: true });
    }
    default: return fail(400, "คำสั่งไม่ถูกต้อง");
  }
});
