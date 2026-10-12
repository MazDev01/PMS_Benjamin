// ── ย้ายข้อมูลงานขายทั้งหมดจากสาขาหนึ่งไปอีกสาขาหนึ่ง ─────────────────────────────
//
// ที่มา: สาขาที่ยังมีข้อมูลงานขายลบไม่ได้ (ดู DELETE /api/admin/dealers — คืน 409 dealer_has_data)
//   ซึ่งถูกแล้ว แต่เดิมทางออกเดียวคือ "ลบข้อมูลลูกค้าจริงทิ้ง" ที่ไม่มีใครกล้าทำ
//   เส้นทางนี้เปิดทางที่สาม: ยกงานทั้งหมดให้สาขาที่รับช่วงต่อ แล้วค่อยลบสาขาที่ว่างแล้ว
//
// งานจริงอยู่ในฟังก์ชันเดียวที่ฐานข้อมูล (move_dealer_data_atomic · 0138) = ธุรกรรมเดียว
//   พังตรงไหนย้อนกลับให้หมดเอง — เหตุผลเดียวกับ delete_dealer_atomic (0119) ที่เคยพังครึ่งทางมาแล้ว
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@pms/shared/lib/rateLimit";
import { bad, authorizeAdmin, auditLog, withErrors } from "@pms/shared/lib/adminRoute";

export const runtime = "nodejs";

const DENY = "ไม่มีสิทธิ์จัดการดีลเลอร์";
const NOT_CONFIGURED = "ระบบยังไม่ได้ตั้งค่าสิทธิ์ผู้ดูแล";

export const POST = withErrors("move-dealer-data", async (req: NextRequest) => {
  const authz = await authorizeAdmin(req, "dealers:manage", DENY, NOT_CONFIGURED);
  if (!authz.ok) return authz.res;
  const { admin, callerId, prof } = authz.auth;

  // เพดานต่ำ (5/นาที) — การย้ายเป็นงานที่ทำนาน ๆ ครั้งและกระทบข้อมูลทั้งสาขา ไม่ใช่งานทำรัว ๆ
  if (!(await checkRateLimit(admin, `move-dealer:${callerId}`, 5, 60))) {
    return bad(429, "ย้ายข้อมูลถี่เกินไป — รอสักครู่แล้วลองใหม่");
  }

  const body = await req.json().catch(() => null) as { from?: string; to?: string } | null;
  const from = (body?.from ?? "").trim().toUpperCase();
  const to   = (body?.to   ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2,5}$/.test(from) || !/^[A-Z]{2,5}$/.test(to)) return bad(400, "รหัสดีลเลอร์ไม่ถูกต้อง");
  if (from === to) return bad(400, "ต้นทางและปลายทางต้องเป็นคนละสาขา");

  const { data, error } = await admin.rpc("move_dealer_data_atomic", { p_from: from, p_to: to });
  if (error) {
    const msg = error.message ?? "";
    // เลขที่ชนกัน = ปลายทางมีข้อมูลของตัวเองอยู่แล้ว — ต้องบอกให้ชัดว่าชนที่ตารางไหนกี่แถว
    // ไม่งั้นผู้ดูแลได้แต่ข้อความ "ย้ายไม่สำเร็จ" ลอย ๆ แล้วไม่รู้จะทำอะไรต่อ
    const conflict = /id_conflict:([a-z_]+):(\d+)/.exec(msg);
    if (conflict) {
      const TH: Record<string, string> = {
        leads: "ลูกค้าเป้าหมาย", quotations: "ใบเสนอราคา",
        customers: "ลูกค้า", appointments: "นัดหมาย",
      };
      return bad(409,
        `ย้ายไม่ได้ — สาขาปลายทาง "${to}" มี${TH[conflict[1]] ?? conflict[1]}ที่ใช้เลขที่ซ้ำกับของ "${from}" อยู่ ${conflict[2]} รายการ · ` +
        `ระบบนับเลขที่แยกรายสาขา ย้ายรวมกันแล้วเลขจะชน — ย้ายเข้าสาขาที่ยังไม่มีข้อมูลเท่านั้น`);
    }
    if (/same_dealer:/.test(msg)) return bad(400, "ต้นทางและปลายทางต้องเป็นคนละสาขา");
    const notFound = /dealer_not_found:([A-Z]+)/.exec(msg);
    if (notFound) return bad(404, `ไม่พบดีลเลอร์รหัส "${notFound[1]}"`);
    if (/forbidden:/.test(msg)) return bad(403, DENY);
    console.error(`[move-dealer-data] ย้าย ${from} → ${to} ไม่สำเร็จ`, error);
    return bad(503, "ย้ายข้อมูลไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
  }

  const rows = (data ?? []) as { entity: string; moved: number }[];
  const total = rows.reduce((s, r) => s + Number(r.moved ?? 0), 0);
  await auditLog(admin, prof, "ย้ายข้อมูลดีลเลอร์", `${from} → ${to} · ${total} รายการ`);
  return NextResponse.json({ ok: true, moved: rows, total });
});
