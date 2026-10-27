-- ── ใบ 0249: กล่องคำขอราคา HQ — ช่องเลือกสถานะแทนแถวปุ่มกรอง (บอสสั่ง 27 ต.ค. 69 · หน้า HQ คำขอใบเสนอราคา) ──
-- hq_quote_board รับกลุ่มเพิ่ม 2 แบบ (ตัวเลข/การจัดเรียงอื่นเหมือน 0244 ทุกตัว):
--   overdue = ต้องตีราคาเฉพาะที่เลยกำหนด (เงื่อนไขเดียวกับตัวนับ counts.overdue และป้าย "เกิน 14 วัน" — กดการ์ดแล้วจำนวนแถวตรงตัวเลขบนการ์ด)
--   all     = ทุกกลุ่ม เรียงคำขอใหม่สุดก่อน (ความจำ newest-first-tables)
-- ลายเซ็นเดิม → สิทธิ์เดิม (ประกาศซ้ำให้ชัด) · ข้อทดสอบ: supabase/tests/quote_board_groups.sql · tests/scenario/quote-requests-status-select.spec.ts

CREATE OR REPLACE FUNCTION public.hq_quote_board(p_group text DEFAULT 'todo'::text, p_q text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  q text := lower(btrim(coalesce(p_q, '')));
  นับ jsonb; แถว jsonb;
begin
  if not is_hq() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  if p_group not in ('todo', 'overdue', 'quoted', 'won', 'closed', 'all') then raise exception 'invalid_group: %', p_group; end if;

  with ค as (
    select r.*, coalesce(d.name, '') as dealer_name, coalesce(l.company, '') as lead_company,
           coalesce(l.contact, '') as lead_contact, coalesce(l.phone, '') as lead_phone,
           coalesce(l.email, '') as lead_email, coalesce(l.address, '') as lead_address,
           h.status as hq_status, h.valid_until, h.quote_no,
           case when r.status in ('new', 'pricing') then 'todo' when r.status = 'quoted' then 'quoted'
                when r.status = 'won' then 'won' else 'closed' end as กลุ่ม
      from quote_requests r
      left join dealers d on d.code = r.dealer_code
      left join leads l on l.dealer_code = r.dealer_code and l.num_id = r.lead_num_id
      left join hq_quotes h on h.request_id = r.id
     where q = '' or lower(concat_ws(' ', r.request_no, r.dealer_code, d.name, l.company, r.product, r.subtype, r.province)) like '%' || q || '%'
  )
  select jsonb_build_object(
           'todo',    count(*) filter (where กลุ่ม = 'todo'),
           'overdue', count(*) filter (where กลุ่ม = 'todo' and due_at < now()),
           'quoted',  count(*) filter (where กลุ่ม = 'quoted'),
           'won',     count(*) filter (where กลุ่ม = 'won'),
           'closed',  count(*) filter (where กลุ่ม = 'closed')),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'request_no', request_no, 'dealer_code', dealer_code, 'dealer_name', dealer_name,
           'lead_num_id', lead_num_id, 'lead_company', lead_company, 'product', product, 'subtype', subtype,
           'lead_contact', lead_contact, 'lead_phone', lead_phone, 'lead_email', lead_email, 'lead_address', lead_address,
           'estimate_items', estimate_items, 'estimate_total', estimate_total, 'estimate_deviation_pct', estimate_deviation_pct,
           'area', area, 'province', province, 'spec', spec, 'status', status, 'hq_status', hq_status, 'quote_no', quote_no,
           'valid_until', valid_until, 'submitted_at', submitted_at, 'due_at', due_at, 'quoted_at', quoted_at,
           'closed_at', closed_at, 'assignee_name', assignee_name, 'supersedes_id', supersedes_id,
           'waiting_days', greatest(0, floor(extract(epoch from (now() - submitted_at)) / 86400))::int,
           'tag', case
             when status in ('new', 'pricing') and due_at < now() then 'overdue'
             when status in ('new', 'pricing') and supersedes_id is not null then 'reprice'
             when status = 'pricing' and hq_status = 'draft' then 'draft'
             when status = 'new' then 'new'
             else status end)
           order by
             case when p_group in ('todo', 'overdue') then due_at end asc,
             case when p_group = 'all' then submitted_at end desc,
             case when p_group = 'quoted' then valid_until end asc nulls last,
             case when p_group in ('won', 'closed') then coalesce(closed_at, updated_at) end desc,
             id asc)
           filter (where p_group = 'all' or กลุ่ม = p_group or (p_group = 'overdue' and กลุ่ม = 'todo' and due_at < now())), '[]'::jsonb)
    into นับ, แถว
    from ค;

  return jsonb_build_object('counts', นับ, 'rows', แถว);
end $function$;

revoke all on function public.hq_quote_board(text, text) from public, anon, authenticated, service_role;
grant execute on function public.hq_quote_board(text, text) to authenticated;
