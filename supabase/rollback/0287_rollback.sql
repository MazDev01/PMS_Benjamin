-- ── ย้อนกลับใบ 0287 (ย้ายข้อมูลของ HQ ไป HQD) — ไม่ใช่ใบปรับฐาน · บอสรันเองเมื่อต้องการย้อน (บอสสั่ง 18 พ.ย. 69) ──────────────
-- ทำอะไร: ทุกแถวที่ใบ 0287 ย้าย (จดไว้ทั้งแถวใน public.hqd_move_0287 ก่อนแก้) กลับเป็นค่าเดิมตรงตัวทุกช่อง
--   (รหัสสาขา HQ · ประวัติลูกค้าเป้าหมายก่อนเติมบรรทัดรับโอน · ทุกช่องอื่น) · ตัวนับเลขของ HQD กลับเป็นก่อนใบ
--   วิธี: ปิดตัวดัก/ข้อผูกในธุรกรรมเดียว (session_replication_role = replica) → ลบแถวที่ย้าย (ใต้ HQD เลขเดิม) → ใส่แถวเดิมกลับจาก JSON
-- ไม่ย้อน: แถว HQD เอง · ฟังก์ชัน/ตัวกันที่ใบสร้าง (ใช้ต่อได้ ไม่กระทบข้อมูล) · ข้อมูลที่ HQD สร้างใหม่หลังลงใบ (เลขไม่ชนกับแถวเดิม จึงอยู่ต่อใต้ HQD)
--   ⚠️ แถวที่ย้ายแล้วถูกแก้หลังลงใบ จะกลับเป็นค่าก่อนใบ (การแก้นั้นหาย) — ก่อนรันให้สำรองฐานด้วยเครื่องมือเดิมก่อนเสมอ
-- รันซ้ำ = ใส่แถวเดิมซ้ำไม่ได้ (กุญแจหลักชน) → ล้มทั้งธุรกรรม ไม่เสียหาย
-- ข้อทดสอบ: tests/tools/migration-0287.test.mjs (ซ้อมใบ: ใส่ลีด HQ ตัวอย่าง → ลง 0287 → ย้อนกลับ → ทุกแถวตรงก่อนลงใบ)
-- ปิดตัวดัก/ข้อผูกระหว่างย้าย (คำสั่ง SET ระดับบนสุดแบบใบ 0252 · บัญชี postgres ตั้งผ่าน set_config ในฟังก์ชันไม่ได้) — คืนค่าท้ายคำสั่ง
set session_replication_role = replica;
do $$
declare
  t text; n int; เงื่อนไข text; ผล jsonb := '{}'::jsonb;
begin
  if not exists (select 1 from public.hqd_move_0287) then raise exception 'ย้อนกลับ 0287: ตารางย้อนกลับว่าง — ไม่มีอะไรให้ย้อน'; end if;
  -- ตัวดัก 2 ตัวของใบเสนอราคาตั้งให้ทำงานตลอด (ALWAYS · แม้ปิดตัวดัก) — แก้เวลาปรับปรุง/VAT ระหว่างย้าย → ปิดชั่วคราวในธุรกรรมนี้ แล้วคืนเป็น ALWAYS
  alter table public.quotations disable trigger zz_quotations_updated_at;
  alter table public.quotations disable trigger quotations_vat_fill;
  for t in select distinct tbl from public.hqd_move_0287 where tbl not in ('entity_counters', 'quote_counters') order by 1 loop
    -- จับแถวด้วยกุญแจหลักของตาราง (ช่องรหัสสาขาตอนนี้เป็น HQD · ช่องอื่นเลขเดิม)
    select string_agg(case when a.attname = 'dealer_code' then 'x.dealer_code = ''HQD'''
                           else format('x.%1$I = (m.old_row ->> %1$L)::%2$s', a.attname, format_type(a.atttypid, a.atttypmod)) end, ' and ')
      into เงื่อนไข
      from pg_index i cross join unnest(i.indkey) k(attnum) join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
     where i.indrelid = format('public.%I', t)::regclass and i.indisprimary;
    execute format('delete from public.%I x using public.hqd_move_0287 m where m.tbl = %L and x.dealer_code = ''HQD'' and %s', t, t, เงื่อนไข);
    get diagnostics n = row_count;
    execute format('insert into public.%I overriding system value select (jsonb_populate_record(null::public.%I, m.old_row)).* from public.hqd_move_0287 m where m.tbl = %L', t, t, t);
    ผล := ผล || jsonb_build_object(t, n);
  end loop;
  -- ตัวนับเลขของ HQD กลับเป็นก่อนใบ (ก่อนใบไม่มี = ลบ)
  delete from public.entity_counters where dealer_code = 'HQD' and entity in ('leads', 'appointments', 'customers');
  insert into public.entity_counters select (jsonb_populate_record(null::public.entity_counters, old_row)).* from public.hqd_move_0287 where tbl = 'entity_counters'
    on conflict (dealer_code, entity) do update set next_id = excluded.next_id;
  delete from public.quote_counters where dealer_code = 'HQD';
  insert into public.quote_counters select (jsonb_populate_record(null::public.quote_counters, old_row)).* from public.hqd_move_0287 where tbl = 'quote_counters';
  alter table public.quotations enable always trigger zz_quotations_updated_at;
  alter table public.quotations enable always trigger quotations_vat_fill;
  insert into public.audit_log("user", role, action, target)
  values (public.audit_actor(), public.auth_role(), 'ย้อนกลับการย้ายข้อมูลของ HQ ไป HQD (ใบ 0287)', ผล::text);
  raise notice 'ย้อนกลับ 0287 สำเร็จ (จำนวนแถวที่กลับเป็น HQ ต่อตาราง): %', ผล;
end $$;
set session_replication_role = origin;
