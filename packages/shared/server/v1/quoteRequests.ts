// ── /api/v1/quote-requests — คำขอใบเสนอราคา (Flow ใหม่ · ใบ 0183) ────────────────────────────────────
//
// ทำงานในนามผู้ใช้ที่เรียกมา (ใบผ่านของผู้ใช้) — คำสั่งของฐานตรวจสิทธิ์และขยับสถานะทั้งสองฝั่งเอง
//   ดีลเลอร์: ส่ง · ยกเลิก · ขอแก้ราคา · ดูคำขอของลูกค้าเป้าหมายตัวเอง
//   HQ: ดูคิว · รับเรื่อง · ทำ BOQ (ร่างใบ HQ) · ส่งใบ · เริ่มเวอร์ชันใหม่จากใบเดิม (ด่าน 2)
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
  if (q.get("view") === "hq-quote") {
    // ดีลเลอร์เห็นเฉพาะใบที่ส่งแล้วของสาขาตัวเอง — กฎรายแถวของฐานกรองให้ (ใบผ่านของผู้เรียก)
    const { data, error } = await sb.from("hq_quotes").select("*").eq("request_id", Number(q.get("request"))).maybeSingle();
    if (error) return dbFail("quoteRequests.hqQuote", error);
    return ok(data ? toCamel(data as Row) : null);
  }
  if (q.get("view") === "hq-quote-id") {
    const { data, error } = await sb.from("hq_quotes").select("*").eq("id", Number(q.get("id"))).maybeSingle();
    if (error) return dbFail("quoteRequests.hqQuoteById", error);
    return ok(data ? toCamel(data as Row) : null);
  }
  if (q.get("view") === "margin") {
    // ฐานข้อมูลคิดและตรวจสิทธิ์เอง (security invoker) — ดีลเลอร์อื่นได้ null
    const { data, error } = await sb.rpc("quotation_margin", { p_dealer: String(q.get("dealer") ?? ""), p_id: String(q.get("quote") ?? "") });
    if (error) return dbFail("quoteRequests.margin", error);
    return ok(data ?? null);
  }
  if (q.get("view") === "quoted-leads") {
    const { data, error } = await sb.from("quote_requests").select("lead_num_id")
      .eq("dealer_code", String(q.get("dealer") ?? "").trim().toUpperCase()).eq("status", "quoted");
    if (error) return dbFail("quoteRequests.quotedLeads", error);
    return ok(((data ?? []) as Row[]).map(r => Number(r.lead_num_id)));
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
    case "save-hq": {
      const { data, error } = await sb.rpc("hq_quote_save", {
        p_request_id: id, p_lines: Array.isArray(b.lines) ? b.lines : [], p_valid_until: b.validUntil ? String(b.validUntil) : null, p_note: String(b.note ?? ""),
      });
      if (error) return dbFail("quoteRequests.saveHq", error);
      return ok(toCamel(data as Row));
    }
    case "send-hq": {
      const { data, error } = await sb.rpc("hq_quote_send", { p_request_id: id });
      if (error) return dbFail("quoteRequests.sendHq", error);
      return ok(toCamel(data as Row));
    }
    case "copy-hq": {
      const { data, error } = await sb.rpc("hq_quote_copy_from", { p_request_id: id, p_source_hq_quote_id: Number(b.sourceId) });
      if (error) return dbFail("quoteRequests.copyHq", error);
      return ok(toCamel(data as Row));
    }
    // HQ ย้อนการตอบรับ (won) ของใบลูกค้า — คำสั่งของฐานตรวจว่าเป็น HQ · ต้องมีเหตุผล · จดไทม์ไลน์เอง (0204/0205)
    case "revert-won": {
      const to = b.to === "lost" ? "lost" : "sent_to_client";
      const reason = String(b.reason ?? "").trim().slice(0, 500);
      if (!reason) return fail(400, "ย้อนการตอบรับต้องระบุเหตุผล");
      const { error } = await sb.rpc("quotation_revert_won", { p_dealer: String(b.dealer ?? ""), p_id: String(b.quote ?? ""), p_reason: reason, p_to: to });
      if (error) return dbFail("quoteRequests.revertWon", error);
      return ok({ ok: true });
    }
    default: return fail(400, "คำสั่งไม่ถูกต้อง");
  }
});
