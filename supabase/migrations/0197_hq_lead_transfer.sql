-- ── โอนลูกค้าเป้าหมายจาก HQ ให้ดีลเลอร์ (ด่าน 1) ─────────────────────────────────────────────────────
--
-- FLOW.html: "HQ ไม่คุยกับลูกค้าปลายทางโดยตรง" — ลูกค้าเป้าหมายใต้รหัส HQ (ระบบจริง 252 ราย) ต้องโอนออก
-- ข้อตัดสินของบอส 14 ต.ค. 69:
--   - จังหวัดที่มีดีลเลอร์รายเดียว → โอนอัตโนมัติได้ (HQ กดยืนยันเป็นชุด)
--   - จังหวัดทับซ้อน → HQ เลือกดีลเลอร์เป็นชุดต่อจังหวัด
--   - ไม่มีจังหวัด (80 ราย) / จังหวัดว่าง → อยู่ในคิวรอ ไม่โอน
--   - โอนแล้ว ลูกค้าเป้าหมายย้ายพร้อมประวัติ นัดหมาย โน้ต และ HQ ไม่ได้เป็นเจ้าของอีกต่อไป
--
-- วิธีย้าย: เลขของลูกค้าเป้าหมายแยกรายสาขา (กุญแจหลัก = รหัสสาขา + เลข) — ย้ายแล้วต้องได้เลขใหม่ของสาขาปลายทาง
--   ประวัติ (activities) และโน้ต (note) อยู่ในแถวเดียวกัน ย้ายไปพร้อมกัน · เพิ่มบรรทัด "รับโอนจากสำนักงานใหญ่"
--   นัดหมายผูกด้วย (รหัสสาขา, เลขลูกค้าเป้าหมาย) แบบแก้ตาม → ตามไปเอง · เลขของนัดหมายก็แยกรายสาขา จึงออกเลขใหม่ด้วย
--     (ย้ายเลขนัดหมายไปเป็นค่าลบชั่วคราวก่อน กันชนกับเลขของสาขาปลายทางระหว่างที่กุญแจนอกพาย้าย)
--   ลูกค้าเป้าหมายที่มีใบเสนอราคา/คำขอราคา/ลูกค้าผูกอยู่แล้ว ไม่โอน (HQ ไม่ขายตรง — ไม่ควรมี ถ้ามีต้องให้คนดู)

/** แผนการโอน: ต่อจังหวัด — auto = มีดีลเลอร์ดูแลรายเดียว · choose = ทับซ้อน HQ เลือก · queue = ไม่มีจังหวัด/จังหวัดว่าง */
create or replace function public.hq_lead_transfer_plan()
  returns table (province text, mode text, leads bigint, dealer_codes text[])
  language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not can_write_master() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  return query
  with l as (
    select btrim(coalesce(x.province, '')) as p, count(*) as n
      from leads x
     where x.dealer_code = 'HQ' and x.status not in ('PAID', 'CANCELLED')
     group by 1),
  t as (
    select tt.province as p, array_agg(tt.dealer_code order by tt.dealer_code) as codes
      from dealer_territories tt group by tt.province)
  select l.p,
         case when l.p = '' or t.codes is null then 'queue'
              when array_length(t.codes, 1) = 1 then 'auto' else 'choose' end,
         l.n, coalesce(t.codes, '{}')
    from l left join t on t.p = l.p
   order by 1;
end $$;
revoke all on function public.hq_lead_transfer_plan() from public, anon, authenticated, service_role;
grant execute on function public.hq_lead_transfer_plan() to authenticated;

/** โอนลูกค้าเป้าหมายของ HQ ในจังหวัดหนึ่งให้ดีลเลอร์ที่ดูแลจังหวัดนั้น — คืนจำนวนที่โอน */
create or replace function public.transfer_hq_leads(p_province text, p_to text) returns integer
  language plpgsql security definer set search_path to 'public' as $$
declare
  p text := btrim(coalesce(p_province, ''));
  l record; a record; n integer := 0; new_num integer; hist jsonb; max_id bigint;
begin
  if not can_write_master() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  if p = '' then raise exception 'transfer_queue: ลูกค้าเป้าหมายที่ไม่มีจังหวัด โอนไม่ได้ — แก้จังหวัดก่อน (อยู่ในคิวรอ)'; end if;
  if not exists (select 1 from dealer_territories where province = p and dealer_code = p_to) then
    raise exception 'transfer_not_owner: % ไม่ได้ดูแลจังหวัด% — โอนให้ได้เฉพาะดีลเลอร์ที่ดูแลจังหวัดนั้น', p_to, p;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('transfer-hq-leads#' || p_to, 0));

  for l in select * from leads x
            where x.dealer_code = 'HQ' and btrim(coalesce(x.province, '')) = p
              and x.status not in ('PAID', 'CANCELLED') and x.customer_id is null
              and not exists (select 1 from quotations q where q.dealer_code = 'HQ' and q.deal_id = x.num_id)
              and not exists (select 1 from quote_requests r where r.dealer_code = 'HQ' and r.lead_num_id = x.num_id)
            order by x.num_id for update loop
    new_num := next_entity_id(p_to, 'leads');
    -- กันเลขชนกับของที่มีอยู่แล้วของสาขาปลายทาง (ตัวนับอาจตามหลังข้อมูลที่นำเข้าตรง)
    while exists (select 1 from leads where dealer_code = p_to and (num_id = new_num or id = '#L-' || (40321 + new_num))) loop
      new_num := next_entity_id(p_to, 'leads');
    end loop;

    select coalesce(max((x ->> 'id')::bigint), 0) into max_id
      from jsonb_array_elements(coalesce(l.activities, '[]'::jsonb)) x where (x ->> 'id') ~ '^\d+$';
    hist := coalesce(l.activities, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'id', max_id + 1, 'type', 'note', 'icon', 'note',
      'date', to_char(now() at time zone 'Asia/Bangkok', 'FMDD') || ' ' ||
              (array['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'])[extract(month from now() at time zone 'Asia/Bangkok')::int]
              || ' ' || (extract(year from now() at time zone 'Asia/Bangkok')::int + 543) || ' · ' || to_char(now() at time zone 'Asia/Bangkok', 'HH24:MI'),
      'text', 'รับโอนจากสำนักงานใหญ่ (จังหวัด' || p || ')'));

    -- นัดหมาย: เลขชั่วคราวติดลบก่อน (กันชนกับเลขของสาขาปลายทางตอนกุญแจนอกพาย้าย)
    update appointments set id = -id where dealer_code = 'HQ' and lead_id = l.num_id;
    perform set_config('pms.flow_sync', '1', true);   -- ข้ามตัวดักของงานขาย (ไม่ใช่การกระทำของดีลเลอร์)
    update leads set dealer_code = p_to, num_id = new_num, id = '#L-' || (40321 + new_num), activities = hist
     where dealer_code = 'HQ' and id = l.id;
    perform set_config('pms.flow_sync', '', true);
    for a in select id from appointments where dealer_code = p_to and id < 0 loop
      update appointments set id = next_entity_id(p_to, 'appointments') where dealer_code = p_to and id = a.id;
    end loop;
    n := n + 1;
  end loop;

  if n > 0 then
    insert into audit_log("user", role, action, target)
    values (audit_actor(), auth_role(), 'โอนลูกค้าเป้าหมายของ HQ ให้ดีลเลอร์', p || ' → ' || p_to || ' · ' || n || ' ราย');
  end if;
  return n;
end $$;
revoke all on function public.transfer_hq_leads(text, text) from public, anon, authenticated, service_role;
grant execute on function public.transfer_hq_leads(text, text) to authenticated;

/** HQ กดยืนยันเป็นชุด: โอนทุกจังหวัดที่มีดีลเลอร์ดูแลรายเดียว — คืนจำนวนที่โอนทั้งหมด */
create or replace function public.transfer_hq_leads_auto() returns integer
  language plpgsql security definer set search_path to 'public' as $$
declare r record; n integer := 0;
begin
  if not can_write_master() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  for r in select * from hq_lead_transfer_plan() where mode = 'auto' loop
    n := n + transfer_hq_leads(r.province, r.dealer_codes[1]);
  end loop;
  return n;
end $$;
revoke all on function public.transfer_hq_leads_auto() from public, anon, authenticated, service_role;
grant execute on function public.transfer_hq_leads_auto() to authenticated;
