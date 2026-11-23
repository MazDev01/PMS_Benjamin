// ── /api/v1/option-lists — รายการกลางของเครือ (บอสตัดสิน 19 พ.ย. 69 · ใบ 0296) ─────────────────────────────────────
//
// ทำงานในนามผู้ใช้ที่เรียกมา (ใบผ่านของผู้ใช้) — ฐานตรวจสิทธิ์เอง
//   อ่าน: ทุกคนที่เข้าระบบ (กฎรายแถวของฐาน)
//   ?view=used: ตัวเลือกที่มีข้อมูลใช้ (ลบไม่ได้ · ซ่อนแทน · HQ เท่านั้น)
//   บันทึก: POST { list, rows } → option_lists_save (HQ เท่านั้น · ลบตัวที่มีข้อมูลใช้ = ฐานปฏิเสธ option_in_use · ฐานลงบันทึกการใช้งานเอง)
import type { NextRequest } from "next/server";
import { handler, ok, dbFail, fail } from "./_ctx";
import { จากแถว, รายการกลางทั้งหมด, type รายการกลาง } from "@pms/shared/lib/optionLists";

type Row = Record<string, unknown>;
export { runtime } from "./_ctx";

export const optionListsGET = handler("optionLists.list", async (req: NextRequest, sb) => {
  if (new URL(req.url).searchParams.get("view") === "used") {
    const { data, error } = await sb.rpc("option_lists_used");
    if (error) return dbFail("optionLists.used", error);
    return ok(((data ?? []) as Row[]).map(r => ({ list: String(r.list), code: String(r.code) })));
  }
  const { data, error } = await sb.from("option_lists").select("*").order("list").order("sort").order("code").limit(500);
  if (error) return dbFail("optionLists.list", error);
  return ok(((data ?? []) as Row[]).map(จากแถว));
});

export const optionListsPOST = handler("optionLists.save", async (req: NextRequest, sb) => {
  const b = (await req.json().catch(() => null)) as { list?: unknown; rows?: unknown } | null;
  if (!b || !รายการกลางทั้งหมด.includes(b.list as รายการกลาง) || !Array.isArray(b.rows)) {
    return fail(400, "ข้อมูลที่ส่งมาไม่ครบ — โหลดหน้าใหม่แล้วลองอีกครั้ง");
  }
  const { data, error } = await sb.rpc("option_lists_save", { p_list: b.list, p_rows: b.rows });
  if (error) return dbFail("optionLists.save", error);
  return ok(((data ?? []) as Row[]).map(จากแถว));
});
