// ── /api/v1/prospects — ลูกค้าเป้าหมายของสำนักงานใหญ่ (ผู้สนใจเป็นดีลเลอร์) ────────────
//
// ทำงาน "ในนามผู้ใช้ที่เรียกมา" เหมือนเส้นทางอื่นในระยะ 1 — RLS ของ 0170 เป็นด่านสิทธิ์จริง
//   อ่าน = ฝั่งสำนักงานใหญ่ · เขียน = ผู้ดูแลข้อมูลกลาง · ดีลเลอร์ไม่เห็นสักแถว
//
// ⚠️ จัดข้อมูลและตรวจความถูกต้องซ้ำที่นี่เสมอ (เตรียมบันทึก / ตรวจผู้สนใจ) — ห้ามเชื่อหน้าจอ
//    ใครยิง API ตรงก็ถึง เช่น ตั้งสถานะ "เป็นดีลเลอร์แล้ว" โดยไม่ผูกสาขา = นับเป็นความสำเร็จปลอม
import type { NextRequest } from "next/server";
import { handler, ok, dbFail, fail } from "./_ctx";
import { toCamel, toCamelList, toSnake } from "@pms/shared/lib/data/supabase/mappers";
import type { DealerProspect } from "@pms/shared/lib/data/types";
import { เตรียมบันทึก, ตรวจผู้สนใจ } from "@pms/shared/lib/dealerProspects";

type Row = Record<string, unknown>;
const PAGE = 1000;

export { runtime } from "./_ctx";

export const prospectsGET = handler("prospects.list", async (_req: NextRequest, sb) => {
  // ⚠️ ไล่ทีละหน้าเสมอ — ฐานข้อมูลคืนสูงสุด 1,000 แถว/คำขอ ขอครั้งเดียวข้อมูลจะขาดแบบเงียบ ๆ
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from("dealer_prospects").select("*")
      .order("id", { ascending: false }).range(from, from + PAGE - 1);
    if (error) return dbFail("prospects.list", error);
    const got = (data ?? []) as Row[];
    rows.push(...got);
    if (got.length < PAGE) break;
  }
  return ok(toCamelList<DealerProspect>(rows));
});

export const prospectsPOST = handler("prospects.create", async (req: NextRequest, sb) => {
  const body = (await req.json().catch(() => null)) as Partial<DealerProspect> | null;
  if (!body || typeof body !== "object") return fail(400, "ข้อมูลลูกค้าเป้าหมายไม่ถูกต้อง");
  const row = เตรียมบันทึก(body);
  const ผิด = ตรวจผู้สนใจ(row);
  if (ผิด) return fail(400, ผิด);
  const { data, error } = await sb.from("dealer_prospects").insert(toSnake(row as unknown as Row)).select().single();
  if (error) return dbFail("prospects.create", error);
  return ok(toCamel<DealerProspect>(data as Row));
});

export const prospectsPUT = handler("prospects.update", async (req: NextRequest, sb) => {
  const body = (await req.json().catch(() => null)) as Partial<DealerProspect> | null;
  const id = Number(body?.id);
  if (!body || !Number.isInteger(id) || id <= 0) return fail(400, "ไม่ได้ระบุลูกค้าเป้าหมายที่จะแก้");
  const row = เตรียมบันทึก(body);
  const ผิด = ตรวจผู้สนใจ(row);
  if (ผิด) return fail(400, ผิด);
  const { data, error } = await sb.from("dealer_prospects").update(toSnake(row as unknown as Row)).eq("id", id).select().single();
  if (error) return dbFail("prospects.update", error);
  return ok(toCamel<DealerProspect>(data as Row));
});

export const prospectsDELETE = handler("prospects.remove", async (req: NextRequest, sb) => {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return fail(400, "ไม่ได้ระบุลูกค้าเป้าหมายที่จะลบ");
  const { error } = await sb.from("dealer_prospects").delete().eq("id", id);
  if (error) return dbFail("prospects.remove", error);
  return ok({ ok: true });
});
