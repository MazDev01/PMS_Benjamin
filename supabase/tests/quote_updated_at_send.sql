-- ── ข้อทดสอบใบ 0238: เวลาแก้ล่าสุดของใบเสนอราคา + ส่งใบด้วยราคาในฐาน (บอสสั่ง 22 ต.ค. 69) ─────────────────────────────
--   0) สภาพจริงของฐาน: มีช่อง updated_at ไม่ว่างทุกแถว · ตัวดักใส่เวลาเป็น ALWAYS และทำงานหลังตัวดักอื่นทั้งหมด
--   1) ฐานใส่ updated_at เองทุกครั้ง: เพิ่มแถว/แก้แถว · หน้าเว็บส่งค่ามาเอง (เก่า/อนาคต) ถูกทับ · แก้ซ้ำในรายการเดียวกันเวลาก็ขยับขึ้น
--   2) ส่งใบ (quotation_send): เปลี่ยนแค่สถานะ + วันที่ส่ง (วันนี้เวลาไทย) ราคา/รายการ/ภาษีเป็นของในฐาน · ส่งอีกครั้งได้
--      ใบตอบรับแล้ว/ถูกแทนที่/ใบสาขาอื่น ส่งไม่ได้ · ฉบับใหม่ส่งแล้วใบเดิมถูกแทนที่ (ตัวกันเดิมยังทำงาน)
-- รัน: docker exec -i supabase_db_pms-dbcheck psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/quote_updated_at_send.sql
-- ทรานแซกชันเดียวแล้ว rollback · ผ่าน = "ALL PASS"
begin;
create schema uatest;
create function uatest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function uatest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function uatest.as_dealer(p_code text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'DEALER_ADMIN' and dealer_code = p_code limit 1),
    'role', 'authenticated', 'user_role', 'DEALER_ADMIN', 'dealer_code', p_code)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function uatest.as_hq() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'SUPER_ADMIN' limit 1),
    'role', 'authenticated', 'user_role', 'SUPER_ADMIN', 'dealer_code', '')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function uatest.as_db() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
create function uatest.q(p_id text) returns public.quotations language sql as $$ select * from public.quotations where dealer_code = 'CNX' and id = p_id $$;
grant usage on schema uatest to authenticated, service_role;
grant execute on all functions in schema uatest to authenticated, service_role;

-- ═══ 0. สภาพจริงของฐานหลังลงใบ ═══
do $$
begin
  perform uatest.as_db();
  perform uatest.ok((select attnotnull from pg_attribute where attrelid = 'public.quotations'::regclass and attname = 'updated_at'), '0ก) มีช่อง updated_at และห้ามว่าง');
  perform uatest.ok((select count(*) from public.quotations where updated_at is null) = 0, '0ข) แถวเดิมทุกแถวมีค่าเริ่มต้น');
  perform uatest.ok((select tgenabled from pg_trigger where tgrelid = 'public.quotations'::regclass and tgname = 'zz_quotations_updated_at') = 'A', '0ค) ตัวดักใส่เวลาเป็น ALWAYS');
  perform uatest.ok((select max(tgname) from pg_trigger where tgrelid = 'public.quotations'::regclass and not tgisinternal and tgtype & 2 = 2) = 'zz_quotations_updated_at',
    '0ง) ตัวดักใส่เวลาทำงานหลังตัวดัก BEFORE ตัวอื่นทั้งหมด (ชื่อเรียงท้ายสุด)');
end $$;

-- ═══ เตรียมใบจริงทางเดียวกับหน้าเว็บ: ลีด → ขอราคา → HQ ส่งใบ HQ → ดีลเลอร์ทำใบ (V1) ═══
create table uatest.r (k text primary key, v text);
grant all on uatest.r to authenticated;
do $$
declare n int; rid bigint; hqid bigint; v1 quotations;
begin
  perform uatest.as_db();
  n := (select coalesce(max(num_id), 0) from public.leads where dealer_code = 'CNX') + 1;
  insert into public.leads (id, num_id, dealer_code, company, name, contact, phone, province, status)
  values ('#L-' || n, n, 'CNX', 'ZZTEST-ส่งใบ0238', 'ZZTEST-ส่งใบ0238', 'ผู้ทดสอบ', '000-000-' || lpad((n % 10000)::text, 4, '0'), 'เชียงใหม่', 'BULLET');
  perform uatest.as_dealer('CNX');
  rid := (public.quote_request_submit(n, 'โกดังสำเร็จรูป')).id;
  perform uatest.as_hq();
  perform public.hq_quote_save(rid, '[{"name":"โครงเหล็ก","qty":2,"unit":"ชุด","unitCost":1000},{"name":"หลังคา","qty":1,"unit":"งาน","unitCost":500}]'::jsonb,
    (now() at time zone 'Asia/Bangkok')::date + 30);
  perform public.hq_quote_send(rid);
  perform uatest.as_db();
  hqid := (select id from public.hq_quotes where request_id = rid);
  perform uatest.as_dealer('CNX');
  v1 := public.create_quotation('CNX', 'Q-', jsonb_build_object('customer', 'ZZTEST-ส่งใบ0238', 'project', 'ZZTEST-ส่งใบ0238', 'province', 'เชียงใหม่',
    'total', '0', 'status', 'draft', 'date', '2026-01-05', 'vat_percent', 7,
    'line_items', '[{"name":"โครงเหล็ก","qty":2,"unit":"ชุด","unitPrice":0,"markupPct":10},{"name":"หลังคา","qty":1,"unit":"งาน","unitPrice":0,"markupPct":10}]'::jsonb,
    'items', 2, 'hq_quote_id', hqid, 'deal_id', n, 'markup_percent', 10));
  perform uatest.as_db();
  insert into uatest.r values ('v1', v1.id), ('lead', n::text);
end $$;

-- ═══ 1. ฐานใส่ updated_at เอง ═══
do $$
declare v1 text := (select v from uatest.r where k = 'v1'); ก quotations; ข quotations; ค quotations;
begin
  perform uatest.as_db();
  ก := uatest.q(v1);
  perform uatest.ok(ก.updated_at is not null and ก.updated_at <= clock_timestamp() and ก.updated_at > clock_timestamp() - interval '1 minute', '1ก) เพิ่มแถว → ฐานใส่เวลาเอง');
  perform uatest.as_dealer('CNX');
  -- หน้าเว็บส่ง updated_at มาเอง (ค่าเก่ามาก) พร้อมแก้ % → ถูกทับด้วยเวลาจริง
  update public.quotations set updated_at = '2000-01-01', markup_percent = 20,
    line_items = '[{"name":"โครงเหล็ก","qty":2,"unit":"ชุด","unitPrice":0,"markupPct":20},{"name":"หลังคา","qty":1,"unit":"งาน","unitPrice":0,"markupPct":10}]'::jsonb
    where dealer_code = 'CNX' and id = v1;
  perform uatest.as_db();
  ข := uatest.q(v1);
  perform uatest.ok(ข.updated_at > ก.updated_at, '1ข) แก้แถว → เวลาขยับขึ้น (ค่าเก่าที่หน้าเว็บส่งมาถูกทับ)');
  perform uatest.ok(ข.total_value = 2950, '1ค) % ใหม่ลงฐาน (2×1,200 + 550 = 2,950)');
  perform uatest.as_dealer('CNX');
  update public.quotations set updated_at = '2999-01-01' where dealer_code = 'CNX' and id = v1;   -- ส่งเวลาอนาคตมา
  perform uatest.as_db();
  ค := uatest.q(v1);
  perform uatest.ok(ค.updated_at > ข.updated_at and ค.updated_at < '2999-01-01', '1ง) ส่งเวลาอนาคตมา → ถูกทับด้วยเวลาจริง (ไม่ใช่ 2999)');
  -- แก้ซ้ำในรายการเดียวกัน (เวลารายการไม่ขยับ) → ยังขยับขึ้นทุกครั้ง
  update public.quotations set note = 'ครั้งที่ 1' where dealer_code = 'CNX' and id = v1;
  ก := uatest.q(v1);
  update public.quotations set note = 'ครั้งที่ 2' where dealer_code = 'CNX' and id = v1;
  ข := uatest.q(v1);
  perform uatest.ok(ข.updated_at > ก.updated_at, '1จ) แก้ 2 ครั้งติดกันในรายการเดียว → เวลาครั้งหลังมากกว่าเสมอ');
  set local session_replication_role = replica;
  update public.quotations set note = 'ครั้งที่ 3' where dealer_code = 'CNX' and id = v1;
  set local session_replication_role = origin;
  ค := uatest.q(v1);
  perform uatest.ok(ค.updated_at > ข.updated_at, '1ฉ) ช่วงปิดตัวดักทั่วไป (replica) เวลาก็ยังขยับ');
end $$;

-- ═══ 2. ส่งใบ = เปลี่ยนแค่สถานะ + วันที่ ราคาเป็นของในฐาน ═══
do $$
declare v1 text := (select v from uatest.r where k = 'v1'); ก่อน quotations; ส่ง quotations; อีกครั้ง quotations; v2 quotations; v2ส่ง quotations;
  วันนี้ text := to_char((now() at time zone 'Asia/Bangkok')::date, 'YYYY-MM-DD');
begin
  perform uatest.as_db();
  ก่อน := uatest.q(v1);
  perform uatest.as_dealer('CNX');
  ส่ง := public.quotation_send('CNX', v1);
  perform uatest.ok(ส่ง.status = 'sent_to_client' and ส่ง.date = วันนี้, '2ก) ส่งใบร่าง → ส่งแล้ว · วันที่ = วันนี้ (เวลาไทย)');
  perform uatest.ok(ส่ง.total_value = ก่อน.total_value and ส่ง.line_items = ก่อน.line_items and ส่ง.vat_percent = ก่อน.vat_percent
    and ส่ง.markup_percent = ก่อน.markup_percent and ส่ง.customer = ก่อน.customer and ส่ง.project = ก่อน.project,
    '2ข) ราคา/รายการ/ภาษี/ลูกค้า = ของในฐานทุกช่อง (2,950)');
  perform uatest.ok(ส่ง.updated_at > ก่อน.updated_at, '2ค) ส่งแล้วเวลาแก้ล่าสุดขยับ (หน้าเว็บใช้แทนของบนจอ)');
  perform uatest.as_db();
  update public.quotations set date = '2026-01-05' where dealer_code = 'CNX' and id = v1;   -- ย้อนวันที่ให้วัดการส่งอีกครั้งได้
  perform uatest.as_dealer('CNX');
  อีกครั้ง := public.quotation_send('CNX', v1);
  perform uatest.ok(อีกครั้ง.status = 'sent_to_client' and อีกครั้ง.date = วันนี้ and อีกครั้ง.total_value = 2950, '2ง) ส่งอีกครั้ง → วันที่ใหม่ ราคาเดิม');

  -- ฉบับใหม่ V2: ส่งแล้ว V1 ถูกแทนที่ (ตัวกันเดิม 0228 ทำงานผ่านคำสั่งส่ง)
  v2 := public.quotation_new_version('CNX', v1);
  v2ส่ง := public.quotation_send('CNX', v2.id);
  perform uatest.as_db();
  perform uatest.ok(v2ส่ง.status = 'sent_to_client' and (uatest.q(v1)).status = 'superseded', '2จ) ส่ง V2 → V1 ถูกแทนที่');
  perform uatest.as_dealer('CNX');
  perform uatest.must_fail(format('select quotation_send(%L, %L)', 'CNX', v1), 'quote_send_invalid', '2ฉ) ใบที่ถูกแทนที่ส่งไม่ได้');
  perform uatest.must_fail(format('select quotation_send(%L, %L)', 'RYG', v2.id), 'forbidden', '2ช) ส่งใบในนามสาขาอื่นไม่ได้');
  perform uatest.as_dealer('RYG');
  perform uatest.must_fail(format('select quotation_send(%L, %L)', 'RYG', v2.id), 'quote_send_invalid', '2ซ) ดีลเลอร์สาขาอื่นมองไม่เห็นใบ (RLS) → ส่งไม่ได้');
  perform uatest.as_dealer('CNX');
  perform uatest.must_fail(format('select quotation_send(%L, %L)', 'CNX', 'ZZ-ไม่มีใบนี้'), 'quote_send_invalid', '2ฌ) ใบที่ไม่มี → บอกเหตุผล');
end $$;

do $$ begin raise notice 'ALL PASS'; end $$;
rollback;
