-- ── กล่องงานคำขอราคาของ HQ (หน้า 5 · UI ตาม flow · บอสอนุมัติ 16 ต.ค. 69) ─────────────────────────────────────
--
-- หน้า /hq/quote-requests แบบ 2 ช่อง: ซ้าย = กล่องงานแบ่ง 4 กลุ่มพร้อมจำนวน · ขวา = ใบ HQ ของคำขอที่เลือก
-- ตัวเลขบนปุ่มกลุ่มคิดที่ฐานที่เดียว (กติกา "ตัวเลขคิดที่ฐาน") — คำค้นเดียวกันกรองทั้งจำนวนและรายการ
--   ต้องตีราคา      = new + pricing (อยู่กับ HQ)
--   ส่งแล้ว รอดีลเลอร์ = quoted
--   สั่งผลิต         = won
--   ปิด/ยกเลิก       = lost + cancelled + superseded
-- ลำดับในกลุ่ม (ข้อยกเว้นของกติกาเรียงใหม่สุดก่อน: งานตามขั้น/ด่วน):
--   ต้องตีราคา = กำหนดส่งใกล้สุดก่อน (เกินกำหนดขึ้นก่อนเสมอ) · รอดีลเลอร์ = ราคาใกล้หมดอายุก่อน · ที่เหลือ = ปิดล่าสุดก่อน
-- ป้ายของแถว (tag) คิดที่นี่ด้วย ให้ทุกหน้าจอพูดตรงกัน:
--   overdue = อยู่กับ HQ และเลยกำหนด · reprice = ดีลเลอร์ขอแก้ราคา (มีเวอร์ชันก่อน) · draft = ร่างใบ HQ ค้าง
--   new = ยังไม่มีใครรับเรื่อง · pricing = กำลังตีราคา · ที่เหลือ = สถานะของคำขอ
-- ข้อทดสอบ: supabase/tests/hq_quote_board.sql (ชุดข้อมูลที่รู้ค่าล่วงหน้า)

create or replace function public.hq_quote_board(p_group text default 'todo', p_q text default '')
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  q text := lower(btrim(coalesce(p_q, '')));
  นับ jsonb; แถว jsonb;
begin
  if not is_hq() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  if p_group not in ('todo', 'quoted', 'won', 'closed') then raise exception 'invalid_group: %', p_group; end if;

  with ค as (
    select r.*, coalesce(d.name, '') as dealer_name, coalesce(l.company, '') as lead_company,
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
             case when p_group = 'todo' then due_at end asc,
             case when p_group = 'quoted' then valid_until end asc nulls last,
             case when p_group in ('won', 'closed') then coalesce(closed_at, updated_at) end desc,
             id asc)
           filter (where กลุ่ม = p_group), '[]'::jsonb)
    into นับ, แถว
    from ค;

  return jsonb_build_object('counts', นับ, 'rows', แถว);
end $$;

comment on function public.hq_quote_board(text, text) is
  'กล่องงานคำขอราคาของ HQ: จำนวน 4 กลุ่ม + รายการของกลุ่มที่เลือก (คำค้นเดียวกัน) · ใบ 0215 · หน้า 5 UI ตาม flow';

revoke all on function public.hq_quote_board(text, text) from public, anon, authenticated, service_role;
grant execute on function public.hq_quote_board(text, text) to authenticated;
