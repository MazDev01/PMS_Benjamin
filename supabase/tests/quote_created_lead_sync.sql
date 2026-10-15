-- ใบ 0210: สร้างใบให้ลูกค้า → ฐานติ๊กงาน · จดกิจกรรม · สร้างแถวไฟล์ของใบ ในธุรกรรมเดียวกัน (ไม่พึ่งคำสั่งตามหลังของแอป)
-- รัน: docker exec -i supabase_db_pms-dbcheck psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/quote_created_lead_sync.sql
begin;
-- ใบที่ไม่ผูกใบ HQ ใส่ตรงไม่ได้แล้ว (ใบ 0203) — ปิดตัวดักผูกใบเฉพาะในธุรกรรมทดสอบนี้ (ย้อนทิ้งท้ายไฟล์)
alter table public.quotations disable trigger quotations_hq_link_guard;

insert into public.leads (id, num_id, dealer_code, company, name, contact, phone, province, product, status, tasks, activities, assigned)
values ('#L-ZQS1', 979000001, 'RYG', 'ZZTEST-QSYNC บริษัท', 'ZZTEST-QSYNC', 'ผู้ทดสอบ', '0800000001', 'ระยอง', 'โกดังสำเร็จรูป', 'BULLET', '[]', '[]', ''),
       ('#L-ZQS2', 979000002, 'RYG', 'ZZTEST-QSYNC2', 'ZZTEST-QSYNC2', 'ผู้ทดสอบ', '0800000002', 'ระยอง', 'โกดังสำเร็จรูป', 'BULLET', '[]', '[]', 'พนักงานขายทดสอบ');
-- สถานะ "รอราคา HQ"/ปิดแล้ว ฐานเป็นคนตั้ง (ตัวดักกันการตั้งเอง) — ตั้งผ่านทางเดียวกับฐาน
select set_config('pms.flow_sync', '1', true);
update public.leads set status = 'HQ_PRICING' where dealer_code = 'RYG' and num_id = 979000001;
update public.leads set status = 'PAID' where dealer_code = 'RYG' and num_id = 979000002;
select set_config('pms.flow_sync', '', true);

do $$
declare l leads; n int; f files;
begin
  -- ① ใบร่าง → ติ๊ก "จัดทำใบเสนอราคา" เท่านั้น · งานสร้างจากแม่แบบของ HQ (ลูกค้าเป้าหมายยังไม่มีรายการงาน)
  insert into quotations (id, dealer_code, customer, project, total, total_value, status, date, deal_id, line_items)
  values ('ZZ-QS-1', 'RYG', 'ZZTEST-QSYNC บริษัท', 'โครงการ ZZ', '฿15', 15, 'draft', '2026-10-15', 979000001, '[{"name":"x","qty":1,"unit":"ชุด","unitPrice":15}]');
  select * into l from leads where dealer_code = 'RYG' and num_id = 979000001;
  if jsonb_array_length(l.tasks) <> (select jsonb_array_length(tasks) from hq_sales_journey limit 1) then raise exception 'FAIL: งานต้องสร้างจากแม่แบบ HQ'; end if;
  if not exists (select 1 from jsonb_array_elements(l.tasks) t where t->>'key' = 'makeQuote' and (t->>'done')::boolean
                  and t->>'doneBy' = 'อัปเดตอัตโนมัติ' and t->>'doneAt' ~ '^\d{1,2} \S+ \d{4}$') then raise exception 'FAIL: ต้องติ๊ก makeQuote'; end if;
  if exists (select 1 from jsonb_array_elements(l.tasks) t where t->>'key' = 'sendQuote' and (t->>'done')::boolean) then raise exception 'FAIL: ใบร่างต้องไม่ติ๊ก sendQuote'; end if;
  if (select count(*) from jsonb_array_elements(l.activities) a where a->>'text' = 'ออกใบเสนอราคา ZZ-QS-1 (V1) · ยอด ฿15' and a->>'id' = '1'
        and a->>'date' ~ '^\d{1,2} \S+ \d{4} · \d{2}:\d{2}$') <> 1 then raise exception 'FAIL: ต้องจดกิจกรรมออกใบ 1 บรรทัด'; end if;
  if l.status <> 'HQ_PRICING' then raise exception 'FAIL: สถานะต้องไม่ถูกแตะ (%)', l.status; end if;
  select * into f from files where dealer_code = 'RYG' and name = 'ใบเสนอราคา_ZZ-QS-1_ZZTEST-QSYNCบริษัท.pdf';
  if not found or f.source <> 'lead' or f.record_id <> 979000001 or f.uploaded_by <> 'ระบบ · จากใบเสนอราคา' or f.size <> '' then raise exception 'FAIL: แถวไฟล์ของใบ'; end if;

  -- ② ใบที่สร้างเป็น "ส่งแล้ว" → ติ๊ก sendQuote ด้วย · กิจกรรมเลขถัดไป · makeQuote ที่ติ๊กแล้วไม่ประทับซ้ำ
  insert into quotations (id, dealer_code, customer, project, total, total_value, status, date, deal_id, revision, line_items)
  values ('ZZ-QS-2', 'RYG', 'ZZTEST-QSYNC บริษัท', 'โครงการ ZZ', '฿20', 20, 'sent_to_client', '2026-10-15', 979000001, 'V2', '[{"name":"x","qty":1,"unit":"ชุด","unitPrice":20}]');
  select * into l from leads where dealer_code = 'RYG' and num_id = 979000001;
  if not exists (select 1 from jsonb_array_elements(l.tasks) t where t->>'key' = 'sendQuote' and (t->>'done')::boolean) then raise exception 'FAIL: ใบส่งแล้วต้องติ๊ก sendQuote'; end if;
  if (select count(*) from jsonb_array_elements(l.activities)) <> 2 or l.activities->1->>'id' <> '2'
     or l.activities->1->>'text' <> 'ออกใบเสนอราคา ZZ-QS-2 (V2) · ยอด ฿20' then raise exception 'FAIL: กิจกรรมใบที่ 2'; end if;

  -- ③ ลูกค้าเป้าหมายที่ปิดแล้ว → ไม่แตะงาน/กิจกรรม (แต่ยังมีแถวไฟล์ของใบ)
  insert into quotations (id, dealer_code, customer, project, total, total_value, status, date, deal_id, line_items)
  values ('ZZ-QS-3', 'RYG', 'ZZTEST-QSYNC2', 'โครงการ ZZ', '฿15', 15, 'draft', '2026-10-15', 979000002, '[{"name":"x","qty":1,"unit":"ชุด","unitPrice":15}]');
  select * into l from leads where dealer_code = 'RYG' and num_id = 979000002;
  if l.tasks <> '[]'::jsonb or l.activities <> '[]'::jsonb then raise exception 'FAIL: ลูกค้าเป้าหมายที่ปิดแล้วต้องไม่ถูกแตะ'; end if;
  if not exists (select 1 from files where dealer_code = 'RYG' and position('ZZ-QS-3' in name) > 0) then raise exception 'FAIL: แถวไฟล์ของใบ 3'; end if;

  -- ④ ไฟล์ของใบไม่ซ้ำ: มีแถวชื่อเลขใบอยู่แล้ว → ไม่เพิ่ม
  insert into files (dealer_code, name, category, uploaded_by) values ('RYG', 'ใบเสนอราคา_ZZ-QS-4_เดิม.pdf', 'ใบเสนอราคา', 'ผู้ใช้');
  insert into quotations (id, dealer_code, customer, project, total, total_value, status, date, deal_id, line_items)
  values ('ZZ-QS-4', 'RYG', 'ZZTEST-QSYNC บริษัท', 'โครงการ ZZ', '฿15', 15, 'draft', '2026-10-15', 979000001, '[{"name":"x","qty":1,"unit":"ชุด","unitPrice":15}]');
  select count(*) into n from files where dealer_code = 'RYG' and position('ZZ-QS-4' in name) > 0;
  if n <> 1 then raise exception 'FAIL: ไฟล์ของใบต้องไม่ซ้ำ (%)', n; end if;

  -- ⑤ ผู้ใช้เรียกตัวช่วยตรงไม่ได้
  if has_function_privilege('authenticated', 'public.quotations_created_lead_sync()', 'execute')
     or has_function_privilege('authenticated', 'public._thai_date(timestamptz, boolean)', 'execute') then raise exception 'FAIL: สิทธิ์เรียกฟังก์ชัน'; end if;
  raise notice 'ALL PASS';
end $$;
rollback;
