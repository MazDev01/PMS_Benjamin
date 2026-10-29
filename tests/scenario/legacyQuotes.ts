// แยกจาก hqQuoteFixture.ts — global-setup เรียกได้โดยไม่ต้องโหลดตัวช่วยเข้าระบบ
import { รันSQLในฐาน } from "./localDb";

/** วาง "ใบเสนอราคาแบบเดิม" (ไม่มีใบ HQ) ลงฐานทดสอบในเครื่องตรง ๆ — ใช้กับข้อมูลตั้งต้นที่จำลองประวัติก่อนปิดทางเดิมเท่านั้น
 *  (ระบบจริงมีใบแบบนี้อยู่ และหน้าจอยังต้องแสดงได้) · ปิดตัวดัก hq_quote_required เฉพาะคำสั่งนี้แล้วเปิดคืนในทรานแซกชันเดียว
 *  ⚠️ ไม่ใช่ทางสร้างใบของแอป — ข้อทดสอบที่วัด "การสร้างใบ" ต้องใช้ เตรียมใบHQ + ทำใบลูกค้าจากใบHQ */
export function วางใบเดิมที่ฐาน(rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const json = JSON.stringify(rows).replace(/\$json\$/g, "");
  // ระบุเฉพาะคอลัมน์ที่ส่งมา — คอลัมน์อื่นใช้ค่าตั้งต้นของตาราง (populate_recordset ใส่ null ให้ทุกคอลัมน์ที่ไม่มี)
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(c => /^[a-z_]+$/.test(c)).join(", ");
  // ใบเดิมวางตามที่ส่งมาทุกช่อง รวมเวลาตอบรับ (won_at · ใบ 0260) — ไม่ส่ง = ใบเดิมที่ไม่มีบันทึกวันตอบรับ (รายงานใช้วันออกใบ)
  const sql = `alter table public.quotations disable trigger quotations_hq_link_guard;
    alter table public.quotations disable trigger quotations_won_at_column;
    insert into public.quotations (${cols}) select ${cols} from jsonb_populate_recordset(null::public.quotations, $json$${json}$json$::jsonb);
    alter table public.quotations enable trigger quotations_won_at_column;
    alter table public.quotations enable trigger quotations_hq_link_guard;`;
  if (รันSQLในฐาน(sql) === null) throw new Error("[วางใบเดิมที่ฐาน] ไม่พบฐานทดสอบในเครื่อง (docker) — วางใบแบบเดิมไม่ได้ตั้งแต่ปิดทางเดิม (ด่าน 3)");
}

/** ล้างทุกอย่างที่ผูกกับลูกค้าเป้าหมายของข้อทดสอบ (ใบลูกค้า · ใบ HQ · คำขอ · อีเมล · ลูกค้าเป้าหมาย) ที่ฐานทดสอบในเครื่อง */
export function ล้างใบHQทดสอบ(dealerCode: string, leadNums: number[]) {
  const nums = leadNums.filter(n => Number.isInteger(n) && n > 0);
  if (!nums.length) return;
  const ids = nums.join(",");
  const sql = `alter table public.hq_quotes disable trigger hq_quotes_lock_sent;
    alter table public.quotations disable trigger quotations_no_delete_won;
    delete from public.quotations q using public.hq_quotes h, public.quote_requests r
      where q.hq_quote_id = h.id and h.request_id = r.id and r.dealer_code = '${dealerCode}' and r.lead_num_id in (${ids});
    delete from public.quotations where dealer_code = '${dealerCode}' and deal_id in (${ids});
    delete from public.hq_quotes h using public.quote_requests r where h.request_id = r.id and r.dealer_code = '${dealerCode}' and r.lead_num_id in (${ids});
    alter table public.hq_quotes enable trigger hq_quotes_lock_sent;
    alter table public.quotations enable trigger quotations_no_delete_won;
    delete from public.email_outbox o using public.quote_requests r where o.ref_table = 'quote_requests' and o.ref_id = r.id::text and r.dealer_code = '${dealerCode}' and r.lead_num_id in (${ids});
    update public.quote_requests set supersedes_id = null, root_id = null where dealer_code = '${dealerCode}' and lead_num_id in (${ids});
    delete from public.quote_requests where dealer_code = '${dealerCode}' and lead_num_id in (${ids});
    delete from public.leads where dealer_code = '${dealerCode}' and num_id in (${ids});`;
  รันSQLในฐาน(sql);
}

/** ลบใบเสนอราคาของข้อทดสอบที่ฐานทดสอบในเครื่องตรง ๆ — รวมใบที่ลูกค้าตอบรับแล้ว (won) ซึ่งลบด้วยกุญแจไม่ได้แล้ว (ใบ 0203 · ด่าน 3)
 *  where = เงื่อนไข SQL ของแถวที่จะลบ (ผู้เรียกต้องจำกัดเฉพาะแถวทดสอบเท่านั้น เช่น customer like '%ZZTEST%') · คืนจำนวนที่ลบ */
export function ลบใบทดสอบที่ฐาน(where: string): number {
  if (!/ZZ|ZT|Q-RLSPAIR|TEST-RLS/.test(where)) throw new Error(`ลบใบทดสอบที่ฐาน: เงื่อนไขต้องจำกัดเฉพาะแถวทดสอบ (${where})`);
  const sql = `alter table public.quotations disable trigger quotations_no_delete_won;
    with d as (delete from public.quotations where ${where} returning 1) select count(*) from d;
    alter table public.quotations enable trigger quotations_no_delete_won;`;
  const out = รันSQLในฐาน(sql);
  if (out === null) return 0;
  return Number((out.match(/^\d+$/m) ?? ["0"])[0]);
}
