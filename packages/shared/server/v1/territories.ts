// ── /api/v1/territories — พื้นที่ของดีลเลอร์ (กฎหนึ่งจังหวัด หนึ่งดีลเลอร์ · ใบ 0195) ─────────────────────
//
// ทำงานในนามผู้ใช้ที่เรียกมา (ใบผ่านของผู้ใช้) — สิทธิ์บังคับที่ฐานข้อมูลเหมือนทางต่อฐานตรง
//   อ่าน: ทุกบัญชีที่เข้าระบบ · เคลียร์จังหวัดทับซ้อน: ตัวคำสั่งของฐานตรวจว่าเป็นสำนักงานใหญ่เอง
import type { NextRequest } from "next/server";
import { handler, ok, dbFail, fail } from "./_ctx";
import { toCamelList } from "@pms/shared/lib/data/supabase/mappers";

type Row = Record<string, unknown>;
export { runtime } from "./_ctx";

export const territoriesGET = handler("territories.list", async (req: NextRequest, sb) => {
  const view = new URL(req.url).searchParams.get("view");
  if (view === "overlaps") {
    const { data, error } = await sb.from("territory_overlaps").select("*").order("province");
    if (error) return dbFail("territories.overlaps", error);
    return ok(toCamelList((data ?? []) as Row[]));
  }
  if (view === "unmatched") {
    const { data, error } = await sb.rpc("territory_unmatched_dealers");
    if (error) return dbFail("territories.unmatched", error);
    return ok(toCamelList((data ?? []) as Row[]));
  }
  return fail(400, "ระบุ view=overlaps หรือ view=unmatched");
});

export const territoriesPOST = handler("territories.write", async (req: NextRequest, sb) => {
  const b = (await req.json().catch(() => null)) as { op?: string; province?: string; keep?: string } | null;
  if (b?.op !== "resolve-overlap") return fail(400, "คำสั่งไม่ถูกต้อง");
  const province = String(b.province ?? "").trim(), keep = String(b.keep ?? "").trim().toUpperCase();
  if (!province || !/^[A-Z]{2,5}$/.test(keep)) return fail(400, "ระบุจังหวัดและรหัสดีลเลอร์ที่จะเก็บไว้");
  const { error } = await sb.rpc("territory_resolve_overlap", { p_province: province, p_keep: keep });
  if (error) return dbFail("territories.resolveOverlap", error);
  return ok({ ok: true });
});
