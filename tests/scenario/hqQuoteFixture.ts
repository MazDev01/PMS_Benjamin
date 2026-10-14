// ── ตัวช่วยข้อทดสอบ: ใบ HQ ที่ส่งแล้ว + ใบลูกค้าที่ทำจากใบ HQ (ด่าน 3 · ใบ 0201) ─────────────────────────────────
//
// ตั้งแต่ปิดทางออกใบลูกค้าแบบเดิม ฐานข้อมูลปฏิเสธใบเสนอราคาใหม่ที่ไม่มีใบ HQ ทุกทาง
//   ข้อทดสอบที่ต้องการ "ใบเสนอราคาสักใบ" จึงต้องเดินทางเดียวกับของจริง:
//   ลูกค้าเป้าหมาย → ดีลเลอร์ขอราคา → HQ ทำ BOQ + ส่งใบ → ดีลเลอร์ทำใบลูกค้าจากใบ HQ (บวก %)
//   ทั้งหมดผ่านคำสั่งของฐานในนามผู้ใช้จริง (ดีลเลอร์ / HQ) — ไม่ข้ามกฎใด ๆ
// ล้างทิ้ง: ใบ HQ ที่ส่งแล้วลบไม่ได้แม้ด้วยกุญแจฝั่งเซิร์ฟเวอร์ (ตั้งใจ) → ลบที่ฐานทดสอบในเครื่องตรง ๆ (docker)
import { execFileSync } from "node:child_process";
import { ADMIN, type Account } from "./supabaseEnv";
import { db } from "./funcHelpers";

export type ใบHQบรรทัด = { name: string; qty: number; unit: string; unitCost: number };
export type ใบHQพร้อมใช้ = { dealerCode: string; leadNum: number; requestId: number; hqQuoteId: number; quoteNo: string };

let ลำดับ = 0;
/** เลขลูกค้าเป้าหมายของข้อทดสอบ — ช่วง 97x ล้าน (ไม่ชนข้อมูลจริง) · ไม่ซ้ำกันภายในตัวรันเดียว */
export const เลขลูกค้าเป้าหมายทดสอบ = () => 970_000_000 + ((Date.now() % 9_000_000) * 10 + (ลำดับ++ % 10)) % 9_999_999;

/** สร้างลูกค้าเป้าหมาย → ขอราคา → HQ ส่งใบ HQ (ยืนราคา validDays วัน) */
export async function เตรียมใบHQ(dealer: Account & { code?: string }, opts: {
  dealerCode: string; company: string; province: string; lines: ใบHQบรรทัด[]; validDays?: number; product?: string; leadNum?: number;
}): Promise<ใบHQพร้อมใช้> {
  const sb = await db(dealer);
  const leadNum = opts.leadNum ?? เลขลูกค้าเป้าหมายทดสอบ();
  const phone = `08${String(leadNum).slice(-8)}`;
  const l = await sb.from("leads").insert({
    id: `#L-${leadNum}`, num_id: leadNum, dealer_code: opts.dealerCode, company: opts.company, name: opts.company,
    contact: "ผู้ทดสอบ", phone, province: opts.province, product: opts.product ?? "โกดังสำเร็จรูป", status: "BULLET",
  });
  if (l.error) throw new Error(`สร้างลูกค้าเป้าหมายทดสอบไม่สำเร็จ: ${l.error.message}`);
  const r = await sb.rpc("quote_request_submit", { p_lead_num_id: leadNum, p_product: opts.product ?? "โกดังสำเร็จรูป" });
  if (r.error) throw new Error(`ส่งคำขอราคาไม่สำเร็จ: ${r.error.message}`);
  const requestId = Number((r.data as { id: number }).id);
  const hq = await db(ADMIN);
  const valid = new Date(Date.now() + 7 * 3_600_000 + (opts.validDays ?? 30) * 86_400_000).toISOString().slice(0, 10);
  const s = await hq.rpc("hq_quote_save", { p_request_id: requestId, p_lines: opts.lines, p_valid_until: valid, p_note: "" });
  if (s.error) throw new Error(`HQ บันทึกใบไม่สำเร็จ: ${s.error.message}`);
  const h = await hq.rpc("hq_quote_send", { p_request_id: requestId });
  if (h.error) throw new Error(`HQ ส่งใบไม่สำเร็จ: ${h.error.message}`);
  const row = h.data as { id: number; quote_no: string };
  return { dealerCode: opts.dealerCode, leadNum, requestId, hqQuoteId: Number(row.id), quoteNo: String(row.quote_no) };
}

/** ดีลเลอร์ทำใบลูกค้าจากใบ HQ (ทางเดียวกับหน้าจอ: คำสั่งออกเลขใบ) — ฐานคิดราคา = ต้นทุน × (1 + %) */
export async function ทำใบลูกค้าจากใบHQ(dealer: Account, ใบ: ใบHQพร้อมใช้, opts: {
  customer: string; markupPercent?: number; linePcts?: number[]; status?: "draft" | "sent_to_client"; extra?: Record<string, unknown>;
}): Promise<{ id: string; total_value: number; line_items: { unitPrice: number; markupPct: number }[] }> {
  const sb = await db(dealer);
  const hq = await sb.from("hq_quotes").select("line_items").eq("id", ใบ.hqQuoteId).single();
  if (hq.error) throw new Error(`ดีลเลอร์อ่านใบ HQ ไม่ได้: ${hq.error.message}`);
  const lines = (hq.data.line_items as ใบHQบรรทัด[]).map((l, i) => ({
    name: l.name, qty: l.qty, unit: l.unit, unitPrice: 0, markupPct: opts.linePcts?.[i] ?? opts.markupPercent ?? 0,
  }));
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const q = await sb.rpc("create_quotation", {
    p_dealer: ใบ.dealerCode, p_prefix: "Q-",
    p_payload: {
      customer: opts.customer, project: opts.customer, total: "0", status: opts.status ?? "draft", date: today,
      line_items: lines, items: lines.length, hq_quote_id: ใบ.hqQuoteId, deal_id: ใบ.leadNum,
      markup_percent: opts.markupPercent ?? null, ...(opts.extra ?? {}),
    },
  });
  if (q.error) throw new Error(`ทำใบลูกค้าจากใบ HQ ไม่สำเร็จ: ${q.error.message}`);
  return q.data as { id: string; total_value: number; line_items: { unitPrice: number; markupPct: number }[] };
}

/** ล้างทุกอย่างที่ผูกกับลูกค้าเป้าหมายของข้อทดสอบ (ใบลูกค้า · ใบ HQ · คำขอ · อีเมล · ลูกค้าเป้าหมาย) ที่ฐานทดสอบในเครื่อง */
export function ล้างใบHQทดสอบ(dealerCode: string, leadNums: number[]) {
  const nums = leadNums.filter(n => Number.isInteger(n) && n > 0);
  if (!nums.length) return;
  const ids = nums.join(",");
  const sql = `alter table public.hq_quotes disable trigger hq_quotes_lock_sent;
    delete from public.quotations q using public.hq_quotes h, public.quote_requests r
      where q.hq_quote_id = h.id and h.request_id = r.id and r.dealer_code = '${dealerCode}' and r.lead_num_id in (${ids});
    delete from public.quotations where dealer_code = '${dealerCode}' and deal_id in (${ids});
    delete from public.hq_quotes h using public.quote_requests r where h.request_id = r.id and r.dealer_code = '${dealerCode}' and r.lead_num_id in (${ids});
    alter table public.hq_quotes enable trigger hq_quotes_lock_sent;
    delete from public.email_outbox o using public.quote_requests r where o.ref_table = 'quote_requests' and o.ref_id = r.id::text and r.dealer_code = '${dealerCode}' and r.lead_num_id in (${ids});
    update public.quote_requests set supersedes_id = null, root_id = null where dealer_code = '${dealerCode}' and lead_num_id in (${ids});
    delete from public.quote_requests where dealer_code = '${dealerCode}' and lead_num_id in (${ids});
    delete from public.leads where dealer_code = '${dealerCode}' and num_id in (${ids});`;
  const c = execFileSync("docker", ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"], { encoding: "utf8" })
    .split(/\r?\n/).find(n => n.includes("dbcheck")) ?? "";
  if (c) execFileSync("docker", ["exec", "-i", c, "psql", "-U", "postgres", "-d", "postgres", "-q", "-c", sql], { stdio: "ignore" });
}

export { วางใบเดิมที่ฐาน } from "./legacyQuotes";
