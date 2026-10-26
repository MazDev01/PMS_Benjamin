// ── /api/v1/material-templates — แม่แบบวัสดุ (บอสสั่ง 26 ต.ค. 69 · ใบ 0244) ─────────────────────────────────────
//
// ทำงานในนามผู้ใช้ที่เรียกมา (ใบผ่านของผู้ใช้) — ฐานตรวจสิทธิ์เอง
//   อ่าน: HQ ทุกแถว · ดีลเลอร์เฉพาะที่เปิดใช้ (กฎรายแถวของฐาน)
//   บันทึก: material_templates_save (เฉพาะผู้ดูแล/ผู้บริหาร HQ · ฐานลงบันทึกการใช้งานเอง)
//   ?view=accuracy: ค่าเฉลี่ย % ราคาประเมินคลาดจากใบ HQ (HQ เท่านั้น)
import type { NextRequest } from "next/server";
import { handler, ok, dbFail, fail } from "./_ctx";
import { toCamelList } from "@pms/shared/lib/data/supabase/mappers";

type Row = Record<string, unknown>;
export { runtime } from "./_ctx";

export const materialTemplatesGET = handler("materialTemplates.list", async (req: NextRequest, sb) => {
  if (new URL(req.url).searchParams.get("view") === "accuracy") {
    const { data, error } = await sb.rpc("material_estimate_accuracy");
    if (error) return dbFail("materialTemplates.accuracy", error);
    const a = (data ?? {}) as { n?: number; avg_abs_pct?: number | null; avg_pct?: number | null };
    return ok({ n: Number(a.n ?? 0), avgAbsPct: a.avg_abs_pct ?? null, avgPct: a.avg_pct ?? null });
  }
  const { data, error } = await sb.from("material_templates").select("*").order("category").order("name").order("id").limit(2000);
  if (error) return dbFail("materialTemplates.list", error);
  return ok(toCamelList((data ?? []) as Row[]));
});

export const materialTemplatesPOST = handler("materialTemplates.save", async (req: NextRequest, sb) => {
  const b = (await req.json().catch(() => null)) as { rows?: unknown; deleteIds?: unknown } | null;
  if (!b || !Array.isArray(b.rows)) return fail(400, "ข้อมูลไม่ถูกต้อง");
  const ids = Array.isArray(b.deleteIds) ? b.deleteIds.map(Number).filter(n => Number.isInteger(n) && n > 0) : [];
  const { data, error } = await sb.rpc("material_templates_save", { p_rows: b.rows, p_delete_ids: ids });
  if (error) return dbFail("materialTemplates.save", error);
  return ok(toCamelList((data ?? []) as Row[]));
});
