// ── /api/v1/territories — พื้นที่ของดีลเลอร์ (ใบ 0195 · จังหวัดเดียวมีหลายดีลเลอร์ได้ตั้งแต่ใบ 0214) ──
//
// ทำงานในนามผู้ใช้ที่เรียกมา (ใบผ่านของผู้ใช้) — สิทธิ์บังคับที่ฐานข้อมูลเหมือนทางต่อฐานตรง
//   อ่าน: ทุกบัญชีที่เข้าระบบ · โอนลีดของ HQ: ตัวคำสั่งของฐานตรวจสิทธิ์เอง
import type { NextRequest } from "next/server";
import { handler, ok, dbFail, fail } from "./_ctx";
import { toCamelList } from "@pms/shared/lib/data/supabase/mappers";

type Row = Record<string, unknown>;
export { runtime } from "./_ctx";

export const territoriesGET = handler("territories.list", async (req: NextRequest, sb) => {
  const view = new URL(req.url).searchParams.get("view");
  // view=overlaps (จังหวัดทับซ้อน) เอาออกแล้ว — ใบ 0214 ยกเลิกหนึ่งจังหวัดหนึ่งดีลเลอร์ (16 ต.ค. 69)
  if (view === "owners") {
    const { data, error } = await sb.from("dealer_territories").select("province, dealer_code, legacy").order("province");
    if (error) return dbFail("territories.owners", error);
    return ok(toCamelList((data ?? []) as Row[]));
  }
  if (view === "unmatched") {
    const { data, error } = await sb.rpc("territory_unmatched_dealers");
    if (error) return dbFail("territories.unmatched", error);
    return ok(toCamelList((data ?? []) as Row[]));
  }
  if (view === "transfer-plan") {
    const { data, error } = await sb.rpc("hq_lead_transfer_plan");
    if (error) return dbFail("territories.transferPlan", error);
    return ok(toCamelList<Row>((data ?? []) as Row[]).map(r => ({ ...r, leads: Number(r.leads) })));
  }
  return fail(400, "ระบุ view=owners · unmatched · transfer-plan");
});

export const territoriesPOST = handler("territories.write", async (req: NextRequest, sb) => {
  const b = (await req.json().catch(() => null)) as { op?: string; province?: string; keep?: string; to?: string } | null;
  // โอนลูกค้าเป้าหมายของ HQ (ใบ 0197) — ตัวคำสั่งของฐานตรวจว่าเป็นสำนักงานใหญ่ และดีลเลอร์ปลายทางดูแลจังหวัดนั้น
  if (b?.op === "transfer-auto") {
    const { data, error } = await sb.rpc("transfer_hq_leads_auto");
    if (error) return dbFail("territories.transferAuto", error);
    return ok({ moved: Number(data ?? 0) });
  }
  if (b?.op === "transfer") {
    const to = String(b.to ?? "").trim().toUpperCase();
    if (!/^[A-Z]{2,5}$/.test(to)) return fail(400, "ระบุรหัสดีลเลอร์ปลายทาง");
    const { data, error } = await sb.rpc("transfer_hq_leads", { p_province: String(b.province ?? ""), p_to: to });
    if (error) return dbFail("territories.transfer", error);
    return ok({ moved: Number(data ?? 0) });
  }
  // op=resolve-overlap (เคลียร์จังหวัดทับซ้อน) เอาออกแล้ว — ใบ 0214
  return fail(400, "คำสั่งไม่ถูกต้อง");
});
