-- ── ข้อทดสอบใบ 0237: ใบเสนอราคาต้องมีค่า VAT เสมอ (บอสสั่ง 22 ต.ค. 69) ─────────────────────────────────────────────
--   1) ค่า VAT ที่หน้าเว็บแสดง (_dealer_display_vat) ตรงกติกาหน้าเว็บทุกกรณี (useDealerVat: ตัวเลข >= 0 = ค่านั้น · อย่างอื่น = 7)
--   2) ใบ VAT ว่างก่อนลงใบ → หลังเติมได้ค่าเท่ากับที่เคยแสดง · ยอดรวมที่แสดงก่อน/หลังเท่ากัน · นับก่อน/หลัง · ใบล็อก/ตอบรับก็เติมได้
--      สถานะ มูลค่า ประวัติราคา บันทึกการใช้งาน ไม่เปลี่ยน · ตัวดักกลับมาเหมือนเดิม
--   3) ต่อไปห้ามว่าง: แก้ให้ว่างไม่ได้ · สร้างใบไม่ส่งค่า = ค่าของสาขา · ส่ง 0 = ไม่คิด VAT (ไม่ถูกทับ)
--   4) ทำฉบับใหม่: V2 ได้ VAT เท่า V1 · แก้แค่ % แล้วบันทึกได้ VAT ยังเท่า V1
-- รัน: docker exec -i supabase_db_pms-dbcheck psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/quote_vat_required.sql
-- ทรานแซกชันเดียวแล้ว rollback · ผ่าน = "ALL PASS"
begin;
create schema vattest;
create function vattest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function vattest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function vattest.as_dealer() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1),
    'role', 'authenticated', 'user_role', 'DEALER_ADMIN', 'dealer_code', 'CNX')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function vattest.as_hq() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'SUPER_ADMIN' limit 1),
    'role', 'authenticated', 'user_role', 'SUPER_ADMIN', 'dealer_code', '')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function vattest.as_db() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
-- ยอดที่หน้าเว็บแสดง (quoteTax.ts คิดภาษีใบเสนอราคา): รวมเป็นเงิน = มูลค่างาน + มูลค่างาน × อัตรา/100 (ปัดสตางค์)
create function vattest.รวมเป็นเงิน(p_subtotal numeric, p_rate numeric) returns numeric language sql immutable as $$
  select round(p_subtotal + round(p_subtotal * greatest(least(p_rate, 100), 0) / 100, 2), 2) $$;
create function vattest.ตั้งVAT(p_dealer text, p_doc jsonb) returns void language plpgsql as $$
begin
  if p_doc is null then delete from public.dealer_settings where dealer_code = p_dealer; return; end if;
  -- แถวใหม่ต้องมีข้อมูลบริษัทครบ — ไม่งั้นส่งใบให้ลูกค้าไม่ได้ (ใบ 0247) · แถวเดิมแก้แค่ document
  insert into public.dealer_settings (dealer_code, document, issuer) values (p_dealer, p_doc,
    jsonb_build_object('company', 'ZZVAT บริษัททดสอบ ' || p_dealer, 'address', 'ZZVAT ที่อยู่ทดสอบ', 'phone', '000-000-0000', 'taxId', '0000000000000'))
    on conflict (dealer_code) do update set document = excluded.document;
end $$;
grant usage on schema vattest to authenticated, service_role;
grant execute on all functions in schema vattest to authenticated, service_role;

-- ═══ 0. สภาพจริงของฐานหลังลงใบ (ตรวจก่อนข้อทดสอบแตะตาราง — ช่วงที่ 2 จำลองฐานก่อนลงใบแล้วคืนสภาพเอง) ═══
do $$
begin
  perform vattest.as_db();
  perform vattest.ok((select attnotnull from pg_attribute where attrelid = 'public.quotations'::regclass and attname = 'vat_percent'), '0ก) ฐานจริง: ช่อง vat_percent เป็น NOT NULL');
  perform vattest.ok((select tgenabled from pg_trigger where tgrelid = 'public.quotations'::regclass and tgname = 'quotations_vat_fill') = 'A', '0ข) ฐานจริง: มีตัวดักเติมค่าแบบ ALWAYS');
  perform vattest.ok((select count(*) from public.quotations where vat_percent is null) = 0, '0ค) ฐานจริง: ไม่มีใบ VAT ว่าง');
end $$;

-- ═══ 1. ค่า VAT ที่หน้าเว็บแสดงของสาขา ═══
do $$
begin
  perform vattest.as_db();
  perform vattest.ตั้งVAT('CNX', '{"vatPercent": 10}');                perform vattest.ok(public._dealer_display_vat('CNX') = 10,  '1ก) สาขาตั้ง 10 → 10');
  perform vattest.ตั้งVAT('CNX', '{"vatPercent": 0}');                 perform vattest.ok(public._dealer_display_vat('CNX') = 0,   '1ข) สาขาตั้ง 0 (ไม่คิด VAT) → 0');
  perform vattest.ตั้งVAT('CNX', '{"vatPercent": 7.5}');               perform vattest.ok(public._dealer_display_vat('CNX') = 7.5, '1ค) ทศนิยม 7.5 → 7.5');
  perform vattest.ตั้งVAT('CNX', '{"vatPercent": "8"}');               perform vattest.ok(public._dealer_display_vat('CNX') = 7,   '1ง) เก็บเป็นข้อความ "8" (หน้าเว็บไม่นับ) → 7');
  perform vattest.ตั้งVAT('CNX', '{"vatPercent": null}');              perform vattest.ok(public._dealer_display_vat('CNX') = 7,   '1จ) ค่า null → 7');
  perform vattest.ตั้งVAT('CNX', '{"vatPercent": -3}');                perform vattest.ok(public._dealer_display_vat('CNX') = 7,   '1ฉ) ติดลบ → 7');
  perform vattest.ตั้งVAT('CNX', '{"stamp": ""}');                     perform vattest.ok(public._dealer_display_vat('CNX') = 7,   '1ช) ไม่มีช่อง vatPercent → 7');
  perform vattest.ตั้งVAT('CNX', '{"vatPercent": 150}');               perform vattest.ok(public._dealer_display_vat('CNX') = 100, '1ซ) เกิน 100 → 100 (สูตรคิดภาษีตัดที่ 100)');
  perform vattest.ตั้งVAT('CNX', null);                                 perform vattest.ok(public._dealer_display_vat('CNX') = 7,   '1ฌ) ไม่มีแถวตั้งค่า → 7');
  perform vattest.ok(public._dealer_display_vat('ZZ-ไม่มีสาขานี้') = 7, '1ญ) สาขาที่ไม่มี → 7');
end $$;

-- ═══ 2. เติมใบที่ VAT ว่าง (จำลองฐานก่อนลงใบ 0237: เอา NOT NULL + ตัวดักเติมค่าออกชั่วคราวในรายการนี้) ═══
do $$
declare
  ตัวดักก่อน jsonb; ตัวดักหลัง jsonb; ผล jsonb; ประวัติก่อน jsonb; ประวัติหลัง jsonb; บันทึกก่อน bigint; แสดงก่อน jsonb; แสดงหลัง jsonb;
begin
  perform vattest.as_db();
  perform vattest.ตั้งVAT('CNX', '{"vatPercent": 10}');
  perform vattest.ตั้งVAT('RYG', null);
  alter table public.quotations alter column vat_percent drop not null;
  alter table public.quotations disable trigger quotations_vat_fill;
  set local session_replication_role = replica;   -- วางใบตัวอย่างตรงที่ฐาน (ใบที่ส่งแล้ว/ตอบรับแล้วต้องเติมได้)
  insert into public.quotations (dealer_code, id, customer, project, status, total_value, date, vat_percent, price_history, customer_id) values
    ('CNX', 'ZZVAT-1', 'ZZVAT ร่าง',       'ZZVAT', 'draft',          100000, '2026-10-01', null, '[]', null),
    ('CNX', 'ZZVAT-2', 'ZZVAT ส่งแล้ว',    'ZZVAT', 'sent_to_client', 250000, '2026-10-02', null, '[{"at":"2026-10-02","total":250000}]', null),
    ('RYG', 'ZZVAT-3', 'ZZVAT ตอบรับแล้ว', 'ZZVAT', 'won',            333333.33, '2026-10-03', null, '[]', (select min(id) from public.customers where dealer_code = 'RYG')),
    ('CNX', 'ZZVAT-4', 'ZZVAT มีค่าแล้ว',  'ZZVAT', 'sent_to_client', 50000,  '2026-10-04', 5,    '[]', null);
  set local session_replication_role = origin;
  perform vattest.ok((select count(*) from public.quotations where vat_percent is null) = 3, '2ก) ก่อนเติม: ใบ VAT ว่าง 3 ใบ');

  -- ยอดที่หน้าเว็บแสดงก่อนเติม = q.vatPercent ?? VAT ของสาขา (ค่าที่รู้ล่วงหน้า: CNX 10 · RYG ไม่ได้ตั้ง = 7)
  select jsonb_object_agg(id, vattest.รวมเป็นเงิน(total_value, coalesce(vat_percent, case dealer_code when 'CNX' then 10 when 'RYG' then 7 end)))
    into แสดงก่อน from public.quotations where id like 'ZZVAT-%';
  select jsonb_object_agg(id, price_history) into ประวัติก่อน from public.quotations where id like 'ZZVAT-%';
  select count(*) into บันทึกก่อน from public.audit_log;
  alter table public.quotations enable always trigger quotations_vat_fill;   -- คืนสภาพหลังลงใบ ก่อนเรียกตัวเติม (ตัวเติมต้องไม่เปลี่ยนสภาพตัวดัก)
  select jsonb_object_agg(tgname, tgenabled) into ตัวดักก่อน from pg_trigger where tgrelid = 'public.quotations'::regclass and not tgisinternal;

  ผล := public._quote_vat_backfill();
  perform vattest.ok((ผล->>'before')::int = 3 and (ผล->>'after')::int = 0, '2ข) ตัวเติมนับก่อน 3 · หลัง 0 (' || ผล::text || ')');
  perform vattest.ok((select vat_percent from public.quotations where id = 'ZZVAT-1') = 10, '2ค) ใบร่าง CNX → 10 (ค่าที่เคยแสดง)');
  perform vattest.ok((select vat_percent from public.quotations where id = 'ZZVAT-2') = 10, '2ง) ใบส่งแล้ว (ล็อก) CNX → 10');
  perform vattest.ok((select vat_percent from public.quotations where id = 'ZZVAT-3') = 7,  '2จ) ใบตอบรับแล้ว RYG (สาขาไม่ได้ตั้ง) → 7');
  perform vattest.ok((select vat_percent from public.quotations where id = 'ZZVAT-4') = 5,  '2ฉ) ใบที่มีค่าอยู่แล้วไม่ถูกแตะ (5)');
  select jsonb_object_agg(id, vattest.รวมเป็นเงิน(total_value, vat_percent)) into แสดงหลัง from public.quotations where id like 'ZZVAT-%';
  perform vattest.ok(แสดงหลัง = แสดงก่อน, '2ช) ยอดรวมที่แสดงก่อน/หลังเติมเท่ากันทุกใบ ' || แสดงหลัง::text);
  perform vattest.ok((select jsonb_object_agg(id, status::text || ':' || total_value::text) from public.quotations where id like 'ZZVAT-%')
    = '{"ZZVAT-1":"draft:100000","ZZVAT-2":"sent_to_client:250000","ZZVAT-3":"won:333333.33","ZZVAT-4":"sent_to_client:50000"}'::jsonb, '2ซ) สถานะ/มูลค่าไม่เปลี่ยน');
  select jsonb_object_agg(id, price_history) into ประวัติหลัง from public.quotations where id like 'ZZVAT-%';
  perform vattest.ok(ประวัติหลัง = ประวัติก่อน, '2ฌ) ประวัติราคาไม่เปลี่ยน');
  perform vattest.ok((select count(*) from public.audit_log) = บันทึกก่อน, '2ญ) ไม่เกิดบันทึกการใช้งาน');
  select jsonb_object_agg(tgname, tgenabled) into ตัวดักหลัง from pg_trigger where tgrelid = 'public.quotations'::regclass and not tgisinternal;
  perform vattest.ok(ตัวดักหลัง = ตัวดักก่อน and ตัวดักหลัง->>'quotations_vat_fill' = 'A', '2ฎ) ตัวดักกลับมาเหมือนเดิม (ตัวเติมค่ายัง ALWAYS)');
  perform vattest.ok((public._quote_vat_backfill()->>'before')::int = 0, '2ฏ) เรียกซ้ำ = ไม่มีใบให้เติม');
  alter table public.quotations alter column vat_percent set not null;
end $$;

-- ═══ 3. ต่อไปห้ามว่าง ═══
do $$
declare q quotations;
begin
  perform vattest.as_db();
  perform vattest.ok((select attnotnull from pg_attribute where attrelid = 'public.quotations'::regclass and attname = 'vat_percent'), '3ก) ช่อง vat_percent เป็น NOT NULL');
  perform vattest.ok((select tgenabled from pg_trigger where tgrelid = 'public.quotations'::regclass and tgname = 'quotations_vat_fill') = 'A', '3ข) ตัวดักเติมค่าเป็น ALWAYS');
  perform vattest.must_fail($s$update public.quotations set vat_percent = null where id = 'ZZVAT-1'$s$, 'vat_percent', '3ค) แก้ให้ VAT ว่างไม่ได้');
  -- วางใบตรงที่ฐาน (ทางเดียวกับตัวช่วยวางใบเดิมของชุดทดสอบ: ปิดเฉพาะตัวดักผูกใบ HQ)
  alter table public.quotations disable trigger quotations_hq_link_guard;
  insert into public.quotations (dealer_code, id, customer, project, status, total_value, date, price_history)
    values ('CNX', 'ZZVAT-5', 'ZZVAT วางตรง', 'ZZVAT', 'draft', 1000, '2026-10-05', '[]') returning * into q;
  perform vattest.ok(q.vat_percent = 10, '3ง) วางใบตรงที่ฐานโดยไม่ส่งค่า → VAT ของสาขา (10)');
  insert into public.quotations (dealer_code, id, customer, project, status, total_value, date, price_history, vat_percent)
    values ('CNX', 'ZZVAT-7', 'ZZVAT ไม่คิดVAT', 'ZZVAT', 'draft', 1000, '2026-10-05', '[]', 0) returning * into q;
  perform vattest.ok(q.vat_percent = 0, '3ฉ) ส่ง 0 (ไม่คิด VAT) → เก็บ 0 ไม่ถูกทับด้วยค่าสาขา');
  alter table public.quotations enable trigger quotations_hq_link_guard;
  set local session_replication_role = replica;
  insert into public.quotations (dealer_code, id, customer, project, status, total_value, date, price_history)
    values ('RYG', 'ZZVAT-6', 'ZZVAT ปิดตัวดัก', 'ZZVAT', 'draft', 1000, '2026-10-05', '[]') returning * into q;
  set local session_replication_role = origin;
  perform vattest.ok(q.vat_percent = 7, '3จ) ช่วงปิดตัวดักทั่วไป (replica) ก็ยังเติมค่า (7)');
end $$;

-- ═══ 4. สร้างใบผ่านหน้าเว็บ (create_quotation) + ทำฉบับใหม่ ═══
do $$
declare n int; rid bigint; v1 quotations; v2 quotations; hqid bigint;
begin
  perform vattest.as_db();
  perform vattest.ตั้งVAT('CNX', '{"vatPercent": 10}');
  n := (select coalesce(max(num_id), 0) from public.leads where dealer_code = 'CNX') + 1;
  insert into public.leads (id, num_id, dealer_code, company, name, contact, phone, province, status)
  values ('#L-' || n, n, 'CNX', 'ZZTEST-VATฉบับใหม่', 'ZZTEST-VATฉบับใหม่', 'ผู้ทดสอบ', '000-000-' || lpad((n % 10000)::text, 4, '0'), 'เชียงใหม่', 'BULLET');
  perform vattest.as_dealer();
  rid := (public.quote_request_submit(n, 'โกดังสำเร็จรูป')).id;
  perform vattest.as_hq();
  perform public.hq_quote_save(rid, '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitCost":1000000}]'::jsonb, (now() at time zone 'Asia/Bangkok')::date + 30);
  perform public.hq_quote_send(rid);
  perform vattest.as_db();
  hqid := (select id from public.hq_quotes where request_id = rid);
  perform vattest.as_dealer();
  -- ไม่ส่งภาษีมาเลย (ทางเดียวกับใบบนฐานจริงที่ว่าง) → บันทึก VAT ของสาขา
  v1 := public.create_quotation('CNX', 'Q-', jsonb_build_object('customer', 'ZZTEST-VATลูกค้า', 'project', 'ZZTEST-VAT', 'province', 'เชียงใหม่',
    'total', '0', 'status', 'draft', 'date', (now() at time zone 'Asia/Bangkok')::date,
    'line_items', '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitPrice":0,"markupPct":10}]'::jsonb,
    'items', 1, 'hq_quote_id', hqid, 'deal_id', n, 'markup_percent', 10));
  perform vattest.ok(v1.vat_percent = 10, '4ก) สร้างใบไม่ส่งค่า VAT → บันทึก VAT ของสาขา (10) ไม่ว่าง');

  update public.quotations set status = 'sent_to_client' where dealer_code = 'CNX' and id = v1.id;
  -- สาขาเปลี่ยน VAT หลังส่ง V1 แล้ว (10 → 8) — V2 ต้องยังคิดตาม V1 ที่ลูกค้าได้ไป ไม่ใช่ค่าสาขาใหม่
  perform vattest.as_db();
  perform vattest.ตั้งVAT('CNX', '{"vatPercent": 8}');
  perform vattest.as_dealer();
  v2 := public.quotation_new_version('CNX', v1.id);
  perform vattest.ok(v2.vat_percent = v1.vat_percent, '4ข) ฉบับใหม่ V2 ได้ VAT เท่า V1 (' || v2.vat_percent || ') ไม่ใช่ค่าสาขาที่เปลี่ยนเป็น 8');
  -- แก้แค่ % (หน้าเว็บส่งทั้งแถวกลับ รวม VAT ที่คัดลอกมา) → บันทึกได้ ไม่ติด quote_version_locked
  update public.quotations set line_items = '[{"name":"โครงเหล็ก","qty":1,"unit":"ชุด","unitPrice":0,"markupPct":20}]'::jsonb, markup_percent = 20,
    vat_percent = v2.vat_percent where dealer_code = 'CNX' and id = v2.id;
  perform vattest.as_db();
  perform vattest.ok((select total_value from public.quotations where id = v2.id) = 1200000 and (select vat_percent from public.quotations where id = v2.id) = v1.vat_percent,
    '4ค) V2 แก้ % เป็น 20 บันทึกได้ (1,200,000) · VAT ยังเท่า V1');
  perform vattest.as_dealer();
  perform vattest.must_fail(format($s$update public.quotations set vat_percent = 7 where dealer_code = 'CNX' and id = %L$s$, v2.id), 'quote_version_locked', '4ง) V2 เปลี่ยน VAT ไม่ได้ (ช่องล็อกเดิม)');
end $$;

do $$ begin raise notice 'ALL PASS'; end $$;
rollback;
