// ── /api/v1/audit — บันทึกการใช้งาน ─────────────────────────────────────────────
//
// ย้ายตามมาเป็นกลุ่มที่ 2 เพราะ append ถูกเรียกจากแทบทุกหน้า (useAudit)
// ถ้าไม่ย้าย จะทดสอบโหมด api ต่อไม่ได้เลย — ทุกหน้าจะสะดุดที่ audit.append
//
// พฤติกรรมคัดมาจาก SupabaseAdapter.audit เป๊ะ ๆ:
//   list   : id desc · ไล่ดึงทีละหน้า (DB คืนสูงสุด 1,000 แถว/คำขอ ขอ 5,000 ก็ได้ 1,000)
//            ⚠️ ห้ามยิง range(0, limit-1) ครั้งเดียว — เคยทำให้ข้อมูลขาดแบบเงียบ ๆ
//              หน้า /hq/audit เห็น 1,000 รายการเหมือนเป็นทั้งหมด ทั้งที่ในระบบมี 9,666 (พบ 7 ส.ค. 69)
//
// ── เขียน: หน้าเว็บเขียนบันทึกเองไม่ได้แล้ว (ใบ 0240 · บอสสั่ง 22 ต.ค. 69) ──
//   เดิม POST รับทั้งแถว (ผู้ทำ/เรื่อง/เป้าหมาย) จากหน้าเว็บ แล้ว insert หลังการเปลี่ยนสำเร็จ — คนละคำขอกับการเปลี่ยน
//   ผู้ใช้เปลี่ยนหน้าเร็ว คำขอถูกตัดทิ้ง = มีการเปลี่ยนแต่ไม่มีบันทึก · ตอนนี้การเปลี่ยนข้อมูลทุกอย่างฐานลงเองในคำสั่งเดียวกัน (ตัวดัก)
//   POST เหลือ 2 เรื่องที่ไม่มีการเปลี่ยนข้อมูลให้ผูก — รับแค่ชนิดเรื่อง ฐานคิดผู้ทำ/เวลา/ข้อความเอง:
//     ?op=auth   { action: "เข้าสู่ระบบ" | "ออกจากระบบ" } → RPC audit_auth_event
//     ?op=export { file }                                  → RPC hq_settings_audit_export
//   แบบเดิม (ส่งทั้งแถว) ตอบ 410 · บัญชีผู้ใช้ไม่มีสิทธิ์ insert ตาราง audit_log แล้ว (0240)
import type { NextRequest } from "next/server";
import { handler, ok, dbFail, fail } from "./_ctx";
import { toCamel } from "@pms/shared/lib/data/supabase/mappers";
import type { AuditEntry } from "@pms/shared/lib/data/types";
import { วันเวลาไทย } from "@pms/shared/lib/thaiDate";

type Row = Record<string, unknown>;
const PAGE = 1000;

export { runtime } from "./_ctx";

/** timestamptz → สตริงไทยแบบเดียวกับที่หน้า /hq/audit อ่านได้ (parseDate)
 *  ⚠️ ต้องคิดเป็นเวลาไทย — ไฟล์นี้รันบนเซิร์ฟเวอร์ Vercel ซึ่งตั้งเครื่องเป็น UTC
 *     เดิมใช้ getHours() ตรง ๆ ทุกรายการจึงช้ากว่าจริง 7 ชม. (บอสแจ้ง 14 ก.ย. 69) */
function fmtAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : วันเวลาไทย(d);
}

export const GET = handler("audit.list", async (req: NextRequest, sb) => {
  const raw = Number(new URL(req.url).searchParams.get("limit") ?? 5000);
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 20000) : 5000;
  const rows: Row[] = [];
  for (let from = 0; from < limit; from += PAGE) {
    const to = Math.min(from + PAGE, limit) - 1;
    const { data, error } = await sb.from("audit_log").select("*").order("id", { ascending: false }).range(from, to);
    if (error) return dbFail("audit.list", error);
    const got = (data ?? []) as Row[];
    rows.push(...got);
    if (got.length < to - from + 1) break;   // หมดแล้ว ไม่ต้องยิงต่อ
  }
  return ok(rows.map(r => ({ ...toCamel<AuditEntry>(r), at: fmtAt(String(r.at)) })));
});

export const POST = handler("audit.write", async (req: NextRequest, sb) => {
  const op = new URL(req.url).searchParams.get("op");
  const body = (await req.json().catch(() => null)) as { action?: unknown; file?: unknown } | null;
  if (op === "auth") {
    const { error } = await sb.rpc("audit_auth_event", { p_action: typeof body?.action === "string" ? body.action : null });
    if (error) return dbFail("audit.authEvent", error);
    return ok({ ok: true });
  }
  if (op === "export") {
    const { error } = await sb.rpc("hq_settings_audit_export", { p_file: typeof body?.file === "string" ? body.file : null });
    if (error) return dbFail("audit.settingsExported", error);
    return ok({ ok: true });
  }
  return fail(410, "บันทึกการใช้งานฐานข้อมูลเขียนเอง — หน้าเว็บเขียนเองไม่ได้แล้ว");
});
