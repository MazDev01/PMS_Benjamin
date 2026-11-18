// ── ประวัติการซื้อ: พื้นที่ของงานจากลูกค้าเป้าหมาย (บอสสั่ง 18 พ.ย. 69) ─────────────────────────────────────────────────
//   ใบที่ทำจากใบ HQ ไม่เก็บพื้นที่ (quotations.area ว่าง) → ใช้พื้นที่ของลูกค้าเป้าหมายของงาน (สาขาเดียวกัน + เลขลีด deal_id)
//   เลขลีดซ้ำข้ามสาขาได้ → กรองสาขาเสมอ (กับดักแยกสาขา) · อ่านไม่ได้ = คงค่าเดิม (หน้าจอขึ้น "—") ไม่ทำให้รายการใบพัง
//   ใช้ร่วม: เซิร์ฟเวอร์ (server/v1/sales.ts op=for-customer) + SupabaseAdapter.listForCustomer
import type { SupabaseClient } from "@supabase/supabase-js";

type แถว = Record<string, unknown>;

/** พื้นที่จากข้อความลีด ("1,050" · "800") → ตัวเลข · อ่านไม่ได้ = 0 */
export const พื้นที่จากข้อความ = (v: unknown) => Number(String(v ?? "").replace(/,/g, "")) || 0;

export async function เติมพื้นที่จากลีด(sb: SupabaseClient, dealer: string, rows: แถว[]): Promise<แถว[]> {
  const ขาด = [...new Set(rows.filter(r => !(Number(r.area) > 0) && r.deal_id != null).map(r => Number(r.deal_id)))];
  if (!ขาด.length) return rows;
  const { data, error } = await sb.from("leads").select("num_id, area").eq("dealer_code", dealer).in("num_id", ขาด);
  if (error || !data) return rows;
  const พื้นที่ = new Map((data as { num_id: number; area: unknown }[]).map(l => [Number(l.num_id), พื้นที่จากข้อความ(l.area)]));
  return rows.map(r => {
    const a = พื้นที่.get(Number(r.deal_id));
    return !(Number(r.area) > 0) && a ? { ...r, area: a } : r;
  });
}
