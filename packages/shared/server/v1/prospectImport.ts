// ── /api/v1/prospect-import — นำเข้าผู้สนใจเป็นดีลเลอร์ทั้งชุด (HQ · ใบ 0275 · บอสสั่ง 3 พ.ย. 69) ─────────────────────────
//   ทำงานในนามผู้เรียก — ฐานตรวจสิทธิ์ (ผู้ดูแล/ผู้บริหาร HQ) · เบอร์ซ้ำ · กติกาขั้น/จังหวัด · ไม่เกิน 1,000 แถว เอง
//   GET = ชุดที่นำเข้าล่าสุด · POST op=import (fileName, rows) / op=cancel (batch)
import type { NextRequest } from "next/server";
import { handler, ok, dbFail, fail } from "./_ctx";

export { runtime } from "./_ctx";

export const prospectImportGET = handler("prospectImport.batches", async (_req: NextRequest, sb) => {
  const { data, error } = await sb.rpc("hq_prospect_import_batches");
  if (error) return dbFail("prospectImport.batches", error);
  return ok(data ?? []);
});

export const prospectImportPOST = handler("prospectImport.write", async (req: NextRequest, sb) => {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return fail(400, "ข้อมูลไม่ถูกต้อง");
  if (b.op === "import") {
    if (!Array.isArray(b.rows)) return fail(400, "ไม่มีแถวให้นำเข้า");
    const { data, error } = await sb.rpc("hq_prospects_import", { p_file: String(b.fileName ?? ""), p_rows: b.rows });
    if (error) return dbFail("prospectImport.import", error);
    return ok(data);
  }
  if (b.op === "cancel") {
    const { data, error } = await sb.rpc("hq_prospects_import_cancel", { p_batch: Number(b.batch) });
    if (error) return dbFail("prospectImport.cancel", error);
    return ok({ deleted: Number((data as { deleted?: number } | null)?.deleted ?? 0) });
  }
  return fail(400, "คำสั่งไม่ถูกต้อง");
});
