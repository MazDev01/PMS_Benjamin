// ── /api/v1/quote-requests — คำขอใบเสนอราคา (Flow ใหม่ · ใบ 0183) ────────────────────────────────────
//
// ทำงานในนามผู้ใช้ที่เรียกมา (ใบผ่านของผู้ใช้) — คำสั่งของฐานตรวจสิทธิ์และขยับสถานะทั้งสองฝั่งเอง
//   ดีลเลอร์: ส่ง · ยกเลิก · ขอแก้ราคา · ดูคำขอของลูกค้าเป้าหมายตัวเอง
//   HQ: ดูคิว · รับเรื่อง
import type { NextRequest } from "next/server";
import { handler, ok, dbFail, fail } from "./_ctx";
import { toCamel, toCamelList } from "@pms/shared/lib/data/supabase/mappers";

type Row = Record<string, unknown>;
export { runtime } from "./_ctx";
const PAGE = 1000;

export const quoteRequestsGET = handler("quoteRequests.list", async (req: NextRequest, sb) => {
  const q = new URL(req.url).searchParams;
  if (q.get("view") === "queue") {
    const rows: Row[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb.from("quote_requests").select("*").in("status", ["new", "pricing", "quoted"])
        .order("due_at", { ascending: true }).order("id", { ascending: true }).range(from, from + PAGE - 1);
      if (error) return dbFail("quoteRequests.queue", error);
      rows.push(...((data ?? []) as Row[]));
      if ((data ?? []).length < PAGE) break;
    }
    // ชื่อบริษัทของลูกค้าเป้าหมาย (ไม่มีในตารางคำขอ)
    const ชื่อ = new Map<string, string>();
    const byDealer = new Map<string, number[]>();
    for (const r of rows) byDealer.set(String(r.dealer_code), [...(byDealer.get(String(r.dealer_code)) ?? []), Number(r.lead_num_id)]);
    for (const [dealer, nums] of byDealer) {
      for (let i = 0; i < nums.length; i += 200) {
        const { data, error } = await sb.from("leads").select("dealer_code, num_id, company").eq("dealer_code", dealer).in("num_id", nums.slice(i, i + 200));
        if (error) return dbFail("quoteRequests.queue.leads", error);
        for (const l of (data ?? []) as Row[]) ชื่อ.set(`${l.dealer_code}#${l.num_id}`, String(l.company ?? ""));
      }
    }
    return ok(toCamelList<Row>(rows).map(r => ({ ...r, leadCompany: ชื่อ.get(`${r.dealerCode}#${r.leadNumId}`) ?? "" })));
  }
  const dealer = String(q.get("dealer") ?? "").trim().toUpperCase(), lead = Number(q.get("lead"));
  if (!/^[A-Z]{2,5}$/.test(dealer) || !Number.isInteger(lead)) return fail(400, "ระบุ dealer และ lead");
  const { data, error } = await sb.from("quote_requests").select("*").eq("dealer_code", dealer).eq("lead_num_id", lead).order("id", { ascending: false });
  if (error) return dbFail("quoteRequests.forLead", error);
  return ok(toCamelList((data ?? []) as Row[]));
});

export const quoteRequestsPOST = handler("quoteRequests.write", async (req: NextRequest, sb) => {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return fail(400, "ข้อมูลไม่ถูกต้อง");
  const id = Number(b.id);
  switch (b.op) {
    case "submit": {
      const { data, error } = await sb.rpc("quote_request_submit", {
        p_lead_num_id: Number(b.leadNumId), p_product: String(b.product ?? ""), p_subtype: String(b.subtype ?? ""),
        p_area: b.area == null || b.area === "" ? null : Number(b.area), p_spec: String(b.spec ?? ""), p_province: String(b.province ?? ""),
      });
      if (error) return dbFail("quoteRequests.submit", error);
      return ok(toCamel(data as Row));
    }
    case "cancel": {
      const { error } = await sb.rpc("quote_request_cancel", { p_id: id, p_reason: String(b.reason ?? ""), p_close_lead: b.closeLead === true });
      if (error) return dbFail("quoteRequests.cancel", error);
      return ok({ ok: true });
    }
    case "reprice": {
      const { data, error } = await sb.rpc("quote_request_reprice", { p_id: id, p_reason: String(b.reason ?? ""), p_spec: b.spec == null ? null : String(b.spec) });
      if (error) return dbFail("quoteRequests.reprice", error);
      return ok(toCamel(data as Row));
    }
    case "accept": {
      const { data: u } = await sb.auth.getUser();
      const { error } = await sb.rpc("quote_request_accept", { p_id: id, p_assignee: u.user?.id ?? null });
      if (error) return dbFail("quoteRequests.accept", error);
      return ok({ ok: true });
    }
    default: return fail(400, "คำสั่งไม่ถูกต้อง");
  }
});
