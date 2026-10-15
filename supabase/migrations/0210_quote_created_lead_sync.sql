-- ── สร้างใบให้ลูกค้า → ฐานอัปเดตลูกค้าเป้าหมายเองในธุรกรรมเดียวกัน (บอสสั่ง 15 ต.ค. 69 · หลัก "ฐานเป็นเจ้าของสถานะ") ─────
--
-- เดิมแอปยิงคำสั่งตามหลังอีก 3 คำสั่งหลังใบลงฐาน (SalesContext.createQuotation):
--   ① ติ๊กงาน "จัดทำใบเสนอราคา" (+ "ส่งใบเสนอราคา" ถ้าสร้างเป็นสถานะส่งแล้ว)  ② จดกิจกรรม "ออกใบเสนอราคา …"
--   ③ แถวไฟล์ของใบ (ตัวชี้ ไม่ใช่ไฟล์จริง)
--   ผู้ใช้ปิดแท็บ/เปลี่ยนหน้า/เน็ตหลุดหลังกดสร้าง 30 ms → ใบมี แต่ลูกค้าเป้าหมายไม่ครบ
--   (พบจาก trace customer-quote-flow:81 · และคำสั่ง ①② เขียนลูกค้าเป้าหมาย "ทั้งแถว" ทับ — ค่าที่คนอื่นเพิ่งแก้หายได้)
-- ทั้งสามเป็นค่าที่ระบบคิดจากใบเอง ไม่มีส่วนที่ผู้ใช้กรอก → ย้ายมาทำที่นี่ · แอปเหลือแค่อ่านลูกค้าเป้าหมายกลับ (โหมดฐานจริง)
--
-- สถานะลูกค้าเป้าหมายไม่แตะ: ใบให้ลูกค้าทุกใบต้องผูกใบ HQ (ใบ 0203) ลูกค้าเป้าหมายจึงอยู่ที่ "รอราคา HQ" ตอนสร้างใบ
--   และฐานเป็นคนขยับต่อเองตอนส่งใบให้ลูกค้า (quotations_flow_sync · ใบ 0183) — แอปเดิมก็ไม่เลื่อนขั้นจาก HQ_PRICING
-- รูปแบบค่าเหมือนที่แอปเขียนเดิมทุกช่อง (วันไทย "15 ต.ค. 2569" · กิจกรรม "15 ต.ค. 2569 · 14:13" · ผู้ทำ = ผู้รับผิดชอบ หรือ "อัปเดตอัตโนมัติ")

create or replace function public._thai_date(p timestamptz, p_with_time boolean default false) returns text
  language sql stable set search_path to 'public' as $$
  select extract(day from t)::int || ' '
      || (array['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'])[extract(month from t)::int] || ' '
      || (extract(year from t)::int + 543)
      || case when p_with_time then ' · ' || to_char(t, 'HH24:MI') else '' end
  from (select p at time zone 'Asia/Bangkok' as t) x
$$;
revoke all on function public._thai_date(timestamptz, boolean) from public, anon, authenticated, service_role;

create or replace function public.quotations_created_lead_sync() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare
  l leads;
  keys text[] := case when new.status = 'draft' then array['makeQuote'] else array['makeQuote', 'sendQuote'] end;
  v_tasks jsonb;
  v_acts jsonb;
  v_changed boolean := false;
begin
  -- ③ แถวไฟล์ของใบ — กันซ้ำด้วยเลขใบในชื่อ (แบบเดียวกับแอปเดิม)
  if not exists (select 1 from files f where f.dealer_code = new.dealer_code and f.category = 'ใบเสนอราคา'
                  and position(new.id in f.name) > 0) then
    insert into files (dealer_code, name, size, ext, category, project, uploaded_by, uploaded_at, source, record_id, customer_id)
    values (new.dealer_code,
            'ใบเสนอราคา_' || new.id || '_' || regexp_replace(coalesce(new.customer, ''), '\s+', '', 'g') || '.pdf',
            '', 'pdf', 'ใบเสนอราคา', new.project, 'ระบบ · จากใบเสนอราคา', new.date,
            case when coalesce(new.deal_id, 0) <> 0 then 'lead' else 'customer' end,
            case when coalesce(new.deal_id, 0) <> 0 then new.deal_id else new.customer_id end,
            new.customer_id);
  end if;

  if coalesce(new.deal_id, 0) = 0 then return new; end if;
  select * into l from leads where dealer_code = new.dealer_code and num_id = new.deal_id for update;
  if not found or l.status in ('PAID', 'CANCELLED') then return new; end if;

  -- ① ติ๊กงาน — ลูกค้าเป้าหมายที่ยังไม่มีรายการงาน ใช้แม่แบบของสำนักงานใหญ่ (เหมือน buildLeadTasks)
  v_tasks := case when jsonb_typeof(l.tasks) = 'array' and jsonb_array_length(l.tasks) > 0 then l.tasks
                else coalesce((select jsonb_agg(jsonb_build_object('key', t->>'key', 'label', t->>'label', 'done', false) order by o)
                                 from hq_sales_journey j, jsonb_array_elements(j.tasks) with ordinality as e(t, o)), '[]'::jsonb) end;
  select coalesce(jsonb_agg(
           case when t->>'key' = any(keys) and not coalesce((t->>'done')::boolean, false)
                then t || jsonb_build_object('done', true, 'doneAt', _thai_date(now()),
                                             'doneBy', coalesce(nullif(btrim(l.assigned), ''), 'อัปเดตอัตโนมัติ'))
                else t end order by o), '[]'::jsonb),
         bool_or(t->>'key' = any(keys) and not coalesce((t->>'done')::boolean, false))
    into v_tasks, v_changed
    from jsonb_array_elements(v_tasks) with ordinality as e(t, o);

  -- ② กิจกรรม (ต่อท้าย · เลขถัดไป)
  v_acts := case when jsonb_typeof(l.activities) = 'array' then l.activities else '[]'::jsonb end;
  v_acts := v_acts || jsonb_build_array(jsonb_build_object(
    'id', coalesce((select max((a->>'id')::numeric) from jsonb_array_elements(v_acts) a where (a->>'id') ~ '^\d+(\.\d+)?$'), 0) + 1,
    'date', _thai_date(now(), true), 'icon', 'doc', 'type', 'doc',
    'text', 'ออกใบเสนอราคา ' || new.id || ' (' || coalesce(nullif(new.revision, ''), 'V1') || ') · ยอด ' || coalesce(new.total, '')));

  update leads set tasks = case when coalesce(v_changed, false) then v_tasks else leads.tasks end, activities = v_acts
   where dealer_code = l.dealer_code and num_id = l.num_id;
  return new;
end $$;
revoke all on function public.quotations_created_lead_sync() from public, anon, authenticated, service_role;

drop trigger if exists quotations_created_lead_sync on public.quotations;
create trigger quotations_created_lead_sync after insert on public.quotations
  for each row execute function public.quotations_created_lead_sync();
