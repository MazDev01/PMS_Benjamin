// ── /api/v1/prospect-activities — ประวัติ + บันทึกการติดต่อ ของผู้สนใจเป็นดีลเลอร์ ─────────────
//
// ทำงาน "ในนามผู้ใช้ที่เรียกมา" — RLS ของ 0174 เป็นด่านสิทธิ์จริง
//   อ่าน = ฝั่งสำนักงานใหญ่ · เพิ่มได้แค่ "บันทึกการติดต่อ" (ผู้ดูแลข้อมูลกลาง) · แก้/ลบไม่ได้เลย
//   ประวัติชนิดอื่น (เพิ่มราย / เปลี่ยนขั้น / ใบเสนอ) ตัวดักของฐานข้อมูลเขียนเอง
// ⚠️ จัดข้อมูลและตรวจซ้ำที่นี่เสมอ — ห้ามเชื่อหน้าจอ
import type { NextRequest } from "next/server";
import { handler, ok, dbFail, fail } from "./_ctx";
import { toCamel, toCamelList } from "@pms/shared/lib/data/supabase/mappers";
import type { ProspectActivity, ProspectContactInput } from "@pms/shared/lib/data/types";
import { เตรียมบันทึกการติดต่อ, ตรวจบันทึกการติดต่อ } from "@pms/shared/lib/prospectJourney";

type Row = Record<string, unknown>;
const PAGE = 1000;

export { runtime } from "./_ctx";

export const prospectActivitiesGET = handler("prospectActivities.list", async (req: NextRequest, sb) => {
  const prospect = Number(new URL(req.url).searchParams.get("prospect"));
  if (!Number.isInteger(prospect) || prospect <= 0) return fail(400, "รหัสลูกค้าเป้าหมายไม่ถูกต้อง");
  // ⚠️ ไล่ทีละหน้าเสมอ — ฐานข้อมูลคืนสูงสุด 1,000 แถว/คำขอ
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from("dealer_prospect_activities").select("*")
      .eq("prospect_id", prospect)
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) return dbFail("prospectActivities.list", error);
    const got = (data ?? []) as Row[];
    rows.push(...got);
    if (got.length < PAGE) break;
  }
  return ok(toCamelList<ProspectActivity>(rows));
});

export const prospectActivitiesPOST = handler("prospectActivities.contact", async (req: NextRequest, sb) => {
  const body = (await req.json().catch(() => null)) as Partial<ProspectContactInput> | null;
  if (!body || typeof body !== "object") return fail(400, "ข้อมูลบันทึกการติดต่อไม่ถูกต้อง");
  const row = เตรียมบันทึกการติดต่อ(body);
  const ผิด = ตรวจบันทึกการติดต่อ(row);
  if (ผิด) return fail(400, ผิด);
  const { data, error } = await sb.from("dealer_prospect_activities")
    .insert({ prospect_id: row.prospectId, kind: "contact", channel: row.channel, body: row.body, next_follow_up: row.nextFollowUp })
    .select().single();
  if (error) return dbFail("prospectActivities.contact", error);
  return ok(toCamel<ProspectActivity>(data as Row));
});
