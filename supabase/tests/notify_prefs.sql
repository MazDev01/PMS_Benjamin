-- ── ข้อทดสอบใบ 0274 (A): ตั้งค่าแจ้งเตือนรายเรื่อง + อีเมลผู้รับของดีลเลอร์ (บอสสั่ง 3 พ.ย. 69) ─────────────────────────────
--   1) เรื่องจำเป็น 5 เรื่องตามคำสั่ง · ทุกเรื่องมี "กดแล้วไปไหน" · ค่าเริ่มต้น = เปิดหมด
--   2) ปิดอีเมล → ไม่มีจดหมายในกล่องขาออก แต่กระดิ่งยังขึ้น · ปิดกระดิ่ง → ไม่มีกระดิ่ง (อีเมลยังส่ง)
--   3) เรื่องจำเป็นปิดไม่ได้ — ทางคำสั่ง และเขียนตรงที่ฐาน
--   4) ดีลเลอร์ A ตั้งของ B ไม่ได้ · ค่าของ A ไม่กระทบ B · ดีลเลอร์ตั้งเรื่องของ HQ ไม่ได้ · HQ เจ้าหน้าที่ทั่วไปตั้งไม่ได้
--   5) อีเมลผู้รับ: รูปแบบผิด/อีเมลเข้าระบบ/ซ้ำ/เกิน 5 = ฐานปฏิเสธ · แจ้งเตือนถึงทุกอีเมลที่ยืนยันแล้ว · ยังไม่ยืนยัน = ไม่ได้รับ
--      ผู้ใช้ตั้ง "ยืนยันแล้ว" เองไม่ได้ · ลบของสาขาอื่นไม่ได้ · อีเมลติดต่อที่ยืนยันในหน้าบัญชี = อยู่ในรายการเอง (เปลี่ยน = ออก)
--   6) ตั้งค่าแล้วลงบันทึกการใช้งาน
--   ตกบนโค้ดก่อนใบ 0274: ไม่มีตาราง/คำสั่งตั้งค่า · _notify ไม่ดูค่าตั้ง · ผู้รับดีลเลอร์มีบัญชีเดียว
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/notify_prefs.sql
begin;
create schema nptest;
create function nptest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function nptest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ: %)', p_what, sqlerrm; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
create function nptest.as_user(p_uid uuid, p_role text, p_dealer text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'user_role', p_role, 'dealer_code', p_dealer, 'email', 'zznp@example.test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function nptest.as_admin() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
create function nptest.as_a() returns void language sql as $$ select nptest.as_user('00000000-0000-4000-8000-00000000e001', 'DEALER_ADMIN', 'ZZNPA') $$;
create function nptest.as_b() returns void language sql as $$ select nptest.as_user('00000000-0000-4000-8000-00000000e002', 'DEALER_ADMIN', 'ZZNPB') $$;
create function nptest.as_hq() returns void language sql as $$ select nptest.as_user('00000000-0000-4000-8000-00000000e003', 'SUPER_ADMIN', '') $$;
create function nptest.as_staff() returns void language sql as $$ select nptest.as_user('00000000-0000-4000-8000-00000000e004', 'HQ_STAFF', '') $$;
-- ค่าที่ตั้งของเรื่องหนึ่ง (มุมมองของผู้เรียก)
create function nptest.pref(p_kind text) returns jsonb language sql as $$
  select x from jsonb_array_elements(public.notification_prefs_get()) x where x->>'kind' = p_kind $$;
create function nptest.bells(p_key text) returns int language sql as $$ select count(*)::int from public.notifications where dedupe_key = p_key $$;
create function nptest.mails(p_key text, p_to text) returns int language sql as $$
  select count(*)::int from public.email_outbox where dedupe_key = p_key || ':' || p_to $$;
grant usage on schema nptest to authenticated;
grant execute on all functions in schema nptest to authenticated;

-- ═══ ข้อมูลของข้อ: สาขา ZZNPA · ZZNPB · ผู้ดูแลสาขาละคน · HQ ผู้ดูแล + เจ้าหน้าที่ · ผู้รับของ HQ 1 อีเมล ═══
set local session_replication_role = replica;
insert into dealers (code, name, province, region, status, revenue_target) values
  ('ZZNPA', 'ZZTEST แจ้งเตือน A', 'ตราด', 'ตะวันออก', 'active', 0), ('ZZNPB', 'ZZTEST แจ้งเตือน B', 'ตราด', 'ตะวันออก', 'active', 0);
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-00000000e001', 'zznpa@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000e002', 'zznpb@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000e003', 'zznph@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000e004', 'zznps@example.test', 'authenticated', 'authenticated');
insert into profiles (id, role, dealer_code, name, status) values
  ('00000000-0000-4000-8000-00000000e001', 'DEALER_ADMIN', 'ZZNPA', 'ZZNP ดีลเลอร์ A', 'active'),
  ('00000000-0000-4000-8000-00000000e002', 'DEALER_ADMIN', 'ZZNPB', 'ZZNP ดีลเลอร์ B', 'active'),
  ('00000000-0000-4000-8000-00000000e003', 'SUPER_ADMIN', '', 'ZZNP ผู้ดูแล HQ', 'active'),
  ('00000000-0000-4000-8000-00000000e004', 'HQ_STAFF', '', 'ZZNP เจ้าหน้าที่ HQ', 'active');
-- ผู้รับของสาขา: A ยืนยันแล้ว 1 + รอยืนยัน 1 · B ยืนยันแล้ว 1 (วางตรงในนามระบบ = แบบที่เซิร์ฟเวอร์ยืนยันโค้ดแล้ว)
insert into dealer_notify_recipients (dealer_code, email, verified_at) values
  ('ZZNPA', 'zznp-a1@example.test', now()), ('ZZNPA', 'zznp-a2@example.test', null), ('ZZNPB', 'zznp-b1@example.test', now());
set local session_replication_role = origin;
update hq_notif_rules set email_recipients = array['zznp-hq@example.test'] where id = 1;

do $$
declare v jsonb; n int;
begin
  -- ═══ 1) ตารางกลาง ═══
  perform nptest.ok((select array_agg(kind order by kind) from notification_kinds where locked)
                    = array['hq_quote_sent', 'lead_from_hq', 'request_new', 'requests_overdue', 'won_reverted'],
                    '1) เรื่องจำเป็น = HQ: คำขอราคาใหม่ · สรุปคำขอค้าง / ดีลเลอร์: HQ ส่งราคา · ย้อนปิดการขาย · HQ ส่งลีด');
  perform nptest.ok(not exists (select 1 from notification_kinds where btrim(goes_to) = ''), '1) ทุกเรื่องมี "กดแล้วไปไหน"');

  perform nptest.as_a();
  v := public.notification_prefs_get();
  perform nptest.ok(jsonb_array_length(v) = (select count(*) from notification_kinds where audience = 'dealer')
                    and not exists (select 1 from jsonb_array_elements(v) x where x->>'kind' in (select kind from notification_kinds where audience = 'hq')),
                    '1) ดีลเลอร์เห็นเฉพาะเรื่องของฝั่งดีลเลอร์');
  perform nptest.ok(not exists (select 1 from jsonb_array_elements(v) x
                                 where (x->>'bell')::boolean is distinct from (x->>'bellAvailable')::boolean
                                    or (x->>'email')::boolean is distinct from (x->>'emailAvailable')::boolean),
                    '1) ค่าเริ่มต้น = เปิดทุกช่องที่เรื่องนั้นมี');

  -- ═══ 2) ปิดอีเมล / ปิดกระดิ่ง ═══
  perform public.notification_prefs_set('hq_quote_expiring', true, false);
  perform nptest.ok((nptest.pref('hq_quote_expiring')->>'email')::boolean = false and (nptest.pref('hq_quote_expiring')->>'bell')::boolean,
                    '2) A ปิดอีเมลเรื่องราคา HQ ใกล้หมดอายุ — ค่าที่อ่านกลับตรง');
  perform nptest.as_admin();
  perform public._notify('hq_quote_expiring', 'ZZNPA', 'zznp-1a', '{"company":"ZZTEST"}'::jsonb);
  perform public._notify('hq_quote_expiring', 'ZZNPB', 'zznp-1b', '{"company":"ZZTEST"}'::jsonb);
  perform nptest.ok(nptest.bells('hq_quote_expiring:zznp-1a') = 1, '2) อีเมลปิด: กระดิ่งของ A ยังขึ้น');
  perform nptest.ok(nptest.mails('hq_quote_expiring:zznp-1a', 'zznp-a1@example.test') = 0, '2) อีเมลปิด: ไม่มีจดหมายถึง A ในกล่องขาออก');
  perform nptest.ok(nptest.bells('hq_quote_expiring:zznp-1b') = 1 and nptest.mails('hq_quote_expiring:zznp-1b', 'zznp-b1@example.test') = 1,
                    '2) ค่าของ A ไม่กระทบ B — B ได้ทั้งกระดิ่งและอีเมล');

  perform nptest.as_a();
  perform public.notification_prefs_set('hq_quote_expiring', false, true);
  perform nptest.as_admin();
  perform public._notify('hq_quote_expiring', 'ZZNPA', 'zznp-2', '{"company":"ZZTEST"}'::jsonb);
  perform nptest.ok(nptest.bells('hq_quote_expiring:zznp-2') = 0, '2) กระดิ่งปิด: ไม่มีกระดิ่ง');
  perform nptest.ok(nptest.mails('hq_quote_expiring:zznp-2', 'zznp-a1@example.test') = 1, '2) กระดิ่งปิด: อีเมลยังส่งถึงอีเมลที่ยืนยันแล้ว');
  perform nptest.ok(nptest.mails('hq_quote_expiring:zznp-2', 'zznp-a2@example.test') = 0, '5) อีเมลที่ยังไม่ยืนยันไม่ได้รับ');
  perform public._notify('hq_quote_expiring', 'ZZNPA', 'zznp-2', '{"company":"ZZTEST"}'::jsonb);
  perform nptest.ok(nptest.mails('hq_quote_expiring:zznp-2', 'zznp-a1@example.test') = 1, '2) กระดิ่งปิด: เรื่องเดิมรอบสองไม่ส่งซ้ำ');

  perform nptest.as_a();
  perform public.notification_prefs_set('hq_quote_expiring', false, false);
  perform nptest.as_admin();
  perform nptest.ok(public._notify('hq_quote_expiring', 'ZZNPA', 'zznp-3', '{}'::jsonb) = false
                    and nptest.bells('hq_quote_expiring:zznp-3') = 0 and nptest.mails('hq_quote_expiring:zznp-3', 'zznp-a1@example.test') = 0,
                    '2) ปิดทั้งสองช่อง: ไม่มีทั้งกระดิ่งและอีเมล');

  -- เรื่องจำเป็นส่งถึงทุกอีเมลที่ยืนยันแล้ว (เพิ่มอีเมลยืนยันแล้วอีก 1)
  insert into dealer_notify_recipients (dealer_code, email, verified_at) values ('ZZNPA', 'zznp-a3@example.test', now());
  perform public._notify('hq_quote_sent', 'ZZNPA', 'zznp-4', '{"company":"ZZTEST"}'::jsonb);
  perform nptest.ok(nptest.bells('hq_quote_sent:zznp-4') = 1 and nptest.mails('hq_quote_sent:zznp-4', 'zznp-a1@example.test') = 1
                    and nptest.mails('hq_quote_sent:zznp-4', 'zznp-a3@example.test') = 1 and nptest.mails('hq_quote_sent:zznp-4', 'zznp-a2@example.test') = 0,
                    '5) แจ้งเตือนถึงทุกอีเมลที่ยืนยันแล้ว (2 ฉบับ) · รอยืนยันไม่ได้');

  -- ═══ 3) เรื่องจำเป็นปิดไม่ได้ ═══
  perform nptest.as_a();
  perform nptest.must_fail($q$select public.notification_prefs_set('hq_quote_sent', false, true)$q$, 'notify_locked', '3) ดีลเลอร์ปิดกระดิ่งเรื่องจำเป็นไม่ได้');
  perform nptest.must_fail($q$select public.notification_prefs_set('won_reverted', true, false)$q$, 'notify_locked', '3) ดีลเลอร์ปิดอีเมลเรื่องจำเป็นไม่ได้');
  perform nptest.as_hq();
  perform nptest.must_fail($q$select public.notification_prefs_set('requests_overdue', true, false)$q$, 'notify_locked', '3) HQ ปิดเรื่องจำเป็นไม่ได้');
  perform nptest.as_admin();
  perform nptest.must_fail($q$insert into public.notification_prefs (audience, dealer_code, kind, bell, email) values ('dealer', 'ZZNPA', 'lead_from_hq', false, true)$q$,
                           'notify_locked', '3) เขียนตรงที่ฐาน: ปิดเรื่องจำเป็นไม่ได้');
  insert into notification_prefs (audience, dealer_code, kind, bell, email) values ('hq', '', 'request_new', true, true);
  perform nptest.must_fail($q$update public.notification_prefs set email = false where audience = 'hq' and kind = 'request_new'$q$,
                           'notify_locked', '3) เขียนตรงที่ฐาน: แก้แถวเดิมให้ปิดไม่ได้');
  perform nptest.as_a();
  perform nptest.ok((nptest.pref('hq_quote_sent')->>'locked')::boolean and (nptest.pref('hq_quote_sent')->>'bell')::boolean, '3) หน้าตั้งค่าเห็นว่าเป็นเรื่องจำเป็น เปิดอยู่');

  -- ═══ 4) ขอบเขต ═══
  perform nptest.must_fail($q$insert into public.notification_prefs (audience, dealer_code, kind, bell, email) values ('dealer', 'ZZNPB', 'quote_expiring', false, false)$q$,
                           'permission denied', '4) A เขียนตารางค่าตั้งตรง (ของ B) ไม่ได้');
  perform nptest.must_fail($q$select public.notification_prefs_set('request_new', true, true)$q$, 'notify_kind', '4) ดีลเลอร์ตั้งเรื่องของ HQ ไม่ได้');
  perform public.notification_prefs_set('quote_expiring', false, false);
  perform nptest.as_b();
  perform nptest.ok((nptest.pref('quote_expiring')->>'bell')::boolean and (nptest.pref('hq_quote_expiring')->>'email')::boolean,
                    '4) ค่าที่ A ตั้งไม่โผล่ที่ B (B ยังเปิดอยู่)');
  perform nptest.ok((select count(*) from notification_prefs where dealer_code = 'ZZNPA') = 0, '4) B อ่านค่าตั้งของ A ไม่ได้');
  perform nptest.as_staff();
  perform nptest.must_fail($q$select public.notification_prefs_set('request_reprice', true, false)$q$, 'forbidden', '4) เจ้าหน้าที่ HQ ทั่วไปตั้งค่าแจ้งเตือนไม่ได้');

  -- HQ ปิดอีเมลเรื่องขอแก้ราคา → กระดิ่ง HQ ยังขึ้น ไม่มีอีเมลถึงผู้รับของ HQ
  perform nptest.as_hq();
  perform public.notification_prefs_set('request_reprice', true, false);
  perform nptest.as_admin();
  perform public._notify('request_reprice', '', 'zznp-5', '{"dealer":"ZZNPA"}'::jsonb);
  perform public._notify('request_new', '', 'zznp-5', '{"dealer":"ZZNPA"}'::jsonb);
  perform nptest.ok(nptest.bells('request_reprice:zznp-5') = 1 and nptest.mails('request_reprice:zznp-5', 'zznp-hq@example.test') = 0,
                    '2) HQ ปิดอีเมลขอแก้ราคา: กระดิ่งขึ้น ไม่มีอีเมล');
  perform nptest.ok(nptest.mails('request_new:zznp-5', 'zznp-hq@example.test') = 1, '2) เรื่องอื่นของ HQ ยังส่งอีเมลตามปกติ');

  -- ═══ 6) บันทึกการใช้งาน ═══
  perform nptest.ok(exists (select 1 from audit_log where action = 'ตั้งค่าแจ้งเตือน' and role = 'DEALER_ADMIN' and target like '%ZZNPA%'),
                    '6) ดีลเลอร์ตั้งค่า → ลงบันทึก (พร้อมรหัสสาขา)');
  perform nptest.ok(exists (select 1 from audit_log where action = 'ตั้งค่าแจ้งเตือน' and role = 'SUPER_ADMIN' and target like 'ดีลเลอร์ขอแก้ราคา%อีเมล ปิด'),
                    '6) HQ ตั้งค่า → ลงบันทึก');

  -- ═══ 5) อีเมลผู้รับ ═══
  perform nptest.as_a();
  perform nptest.must_fail($q$select public.dealer_notify_recipient_add('ไม่ใช่อีเมล')$q$, 'notify_email_format', '5) รูปแบบผิด = ฐานปฏิเสธ');
  perform nptest.must_fail($q$select public.dealer_notify_recipient_add('zznpa@dealer.benjaminpebsteel.com')$q$, 'notify_email_login', '5) อีเมลเข้าระบบของดีลเลอร์ใช้ไม่ได้');
  perform nptest.must_fail($q$select public.dealer_notify_recipient_add('ZZNP-A1@example.test ')$q$, 'notify_email_dup', '5) ซ้ำ (ตัวพิมพ์ใหญ่/ช่องว่าง) = ปฏิเสธ');
  v := public.dealer_notify_recipient_add('  ZZNP-A4@Example.TEST ');
  perform nptest.ok(v->>'email' = 'zznp-a4@example.test' and (v->>'verified')::boolean = false, '5) เพิ่มได้ · เก็บตัวเล็ก · เริ่มที่รอยืนยัน');
  perform public.dealer_notify_recipient_add('zznp-a5@example.test');
  perform nptest.must_fail($q$select public.dealer_notify_recipient_add('zznp-a6@example.test')$q$, 'notify_email_limit', '5) เกิน 5 รายการ = ปฏิเสธ');
  perform nptest.must_fail($q$update public.dealer_notify_recipients set verified_at = now() where email = 'zznp-a4@example.test'$q$,
                           'permission denied', '5) ผู้ใช้ตั้ง "ยืนยันแล้ว" เองไม่ได้');
  perform nptest.ok(jsonb_array_length(public.dealer_notify_recipients_list()) = 5
                    and not exists (select 1 from jsonb_array_elements(public.dealer_notify_recipients_list()) x where x->>'email' like 'zznp-b%'),
                    '5) A เห็นเฉพาะรายชื่อของสาขาตัวเอง');
  perform nptest.as_admin();
  n := (select id from dealer_notify_recipients where email = 'zznp-a4@example.test');
  perform nptest.as_b();
  perform nptest.must_fail(format('select public.dealer_notify_recipient_remove(%s)', n),
                           'not_found', '5) B ลบอีเมลของ A ไม่ได้');
  perform nptest.as_hq();
  perform nptest.must_fail($q$select public.dealer_notify_recipient_add('zznp-h@example.test')$q$, 'forbidden', '5) HQ เพิ่มแทนดีลเลอร์ไม่ได้');
  perform nptest.ok(jsonb_array_length(public.dealer_notify_recipients_list('ZZNPA')) = 5, '5) HQ เห็นรายชื่อของสาขาที่เลือก (แผงดีลเลอร์)');
  perform nptest.as_admin();
  n := (select id from dealer_notify_recipients where email = 'zznp-a5@example.test');
  perform nptest.as_a();
  perform public.dealer_notify_recipient_remove(n);
  perform nptest.ok(not exists (select 1 from dealer_notify_recipients where email = 'zznp-a5@example.test'), '5) A ลบของตัวเองได้');

  -- อีเมลติดต่อในหน้าบัญชี (ใบ 0194): ยืนยัน = อยู่ในรายการเอง ไม่นับเพดาน · เปลี่ยนอีเมล = แถวเดิมออก
  perform nptest.as_admin();
  update profiles set contact_email = 'zznp-contact@example.test' where id = '00000000-0000-4000-8000-00000000e001';
  update profiles set contact_email_verified_at = now() where id = '00000000-0000-4000-8000-00000000e001';
  perform nptest.ok(exists (select 1 from dealer_notify_recipients where dealer_code = 'ZZNPA' and email = 'zznp-contact@example.test' and is_contact and verified_at is not null),
                    '5) อีเมลติดต่อที่ยืนยันแล้ว = อยู่ในรายการ (ยืนยันแล้ว · ไม่ต้องยืนยันซ้ำ)');
  perform nptest.ok('zznp-contact@example.test' = any(public._dealer_notify_emails('ZZNPA')), '5) อีเมลติดต่อได้รับแจ้งเตือน');
  update profiles set contact_email = 'zznp-contact2@example.test' where id = '00000000-0000-4000-8000-00000000e001';
  perform nptest.ok(not exists (select 1 from dealer_notify_recipients where email = 'zznp-contact@example.test')
                    and not ('zznp-contact2@example.test' = any(public._dealer_notify_emails('ZZNPA'))),
                    '5) เปลี่ยนอีเมลติดต่อ = แถวเดิมออก · อีเมลใหม่ยังไม่ได้รับจนกว่าจะยืนยัน');

  -- ลบสาขา = ค่าตั้งของสาขาหายตาม (ไม่ค้าง)
  insert into dealers (code, name, province, region, status, revenue_target) values ('ZZNPC', 'ZZTEST แจ้งเตือน C', 'ตราด', 'ตะวันออก', 'active', 0);
  insert into notification_prefs (audience, dealer_code, kind, bell, email) values ('dealer', 'ZZNPC', 'quote_expiring', false, false);
  delete from dealers where code = 'ZZNPC';
  perform nptest.ok(not exists (select 1 from notification_prefs where dealer_code = 'ZZNPC'), '4) ลบสาขา → ค่าตั้งแจ้งเตือนของสาขาหายตาม');
end $$;

select 'ALL PASS' as result;
rollback;
