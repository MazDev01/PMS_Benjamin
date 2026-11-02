-- ── ล้างข้อมูลของทดสอบ flow บนเว็บจริง (สาขา ZZT + บัญชี live-*@example.test เท่านั้น) ──────────────
-- รันหลัง run.mjs files · ทรานแซกชันเดียว · ปลดตัวกันลบชั่วคราวแล้วเปิดคืนในทรานแซกชันเดียวกัน
-- ด่านกันพลาด: ถ้าสาขา ZZT ไม่ใช่สาขาทดสอบ (ชื่อไม่ตรง) → ยกเลิกทั้งหมด
begin;
do $$ begin
  if exists (select 1 from public.dealers where code = 'ZZT' and name <> 'สาขาทดสอบชั่วคราว (ลบทิ้ง)') then
    raise exception 'ZZT ไม่ใช่สาขาทดสอบ — ยกเลิก';
  end if;
end $$;
-- ด่านกันพลาดของชุดผู้สนใจ → ดีลเลอร์ใหม่ ZZTN (live-franchise.spec.ts · บอสสั่ง 1 พ.ย. 69) — ไม่ตรงข้อใดข้อหนึ่ง = ยกเลิกทั้งหมด ไม่ลบอะไรเลย
do $$ begin
  if exists (select 1 from public.dealers where code = 'ZZTN' and name not like 'ZZTEST-ผู้สนใจเว็บจริง-%') then
    raise exception 'ZZTN ไม่ใช่สาขาทดสอบ — ยกเลิก';
  end if;
  if exists (select 1 from public.dealer_prospects where name like 'ZZTEST-ผู้สนใจเว็บจริง-%' and dealer_code is not null and dealer_code <> 'ZZTN') then
    raise exception 'ผู้สนใจทดสอบผูกกับดีลเลอร์อื่น — ยกเลิก';
  end if;
  if exists (select 1 from public.dealers d join public.dealer_prospects x on x.id = d.prospect_id
              where d.code = 'ZZTN' and x.name not like 'ZZTEST-ผู้สนใจเว็บจริง-%') then
    raise exception 'ZZTN ผูกกับผู้สนใจจริง — ยกเลิก';
  end if;
  if exists (select 1 from public.profiles p left join auth.users u on u.id = p.id
              where p.dealer_code = 'ZZTN' and lower(coalesce(u.email, '')) <> 'zztn@dealer.benjaminpebsteel.com') then
    raise exception 'ZZTN มีบัญชีอื่นนอกเหนือบัญชีทดสอบ — ยกเลิก';
  end if;
end $$;
alter table public.hq_quotes disable trigger hq_quotes_lock_sent;
alter table public.quotations disable trigger quotations_no_delete_won;
alter table public.quotations disable trigger trg_price_history_append_only;
delete from public.email_outbox
 where (ref_table = 'quote_requests' and ref_id in (select id::text from public.quote_requests where dealer_code = 'ZZT'))
    or to_email like 'live-%@example.test'
    or subject like '%ZZTEST%' or body like '%ZZTEST%';   -- ตรงกับตัวถือจดหมาย tests/prod-live/mailHold.mjs (ถือไว้แต่ไม่ลบ = ส่งจริงรอบหลัง)
-- แจ้งเตือน (ใบ 0231): ของสาขา ZZT หายตามกุญแจนอกตอนลบสาขา · ของ HQ ที่เกิดจากงานของ ZZT (ไม่มีรหัสสาขา) ต้องลบเอง
--   ใบ 0231 ยังไม่ขึ้นฐานจริง = ไม่มีตาราง → ข้าม (to_regclass)
do $$ begin
  if to_regclass('public.notifications') is not null then
    execute $q$delete from public.notifications
      where dealer_code = 'ZZT'
         or (audience = 'hq' and (body like 'ZZT %' or body like '%· ZZT %'
             or dedupe_key ~ ('^(request_new|request_reprice|customer_accepted):(' || coalesce((select string_agg(id::text, '|') from public.quote_requests where dealer_code = 'ZZT'), '-1') || ')(:|$)')))$q$;
  end if;
end $$;
delete from public.quotations where dealer_code = 'ZZT';
delete from public.hq_quotes where request_id in (select id from public.quote_requests where dealer_code = 'ZZT');
update public.quote_requests set supersedes_id = null, root_id = null where dealer_code = 'ZZT';
delete from public.quote_request_events where request_id in (select id from public.quote_requests where dealer_code = 'ZZT');
delete from public.quote_requests where dealer_code = 'ZZT';
delete from public.files where dealer_code = 'ZZT';
delete from public.customer_notes where dealer_code = 'ZZT';
delete from public.appointments where dealer_code = 'ZZT';
delete from public.leads where dealer_code = 'ZZT';
delete from public.customers where dealer_code = 'ZZT';
delete from public.quote_counters where dealer_code = 'ZZT';
delete from public.entity_counters where dealer_code = 'ZZT';
delete from public.dealer_settings where dealer_code = 'ZZT';
delete from public.dealer_lead_rules where dealer_code = 'ZZT';
delete from public.responsible_persons where dealer_code = 'ZZT';
delete from public.dealer_login_secrets where dealer_code = 'ZZT';
delete from public.dealer_account_changes where dealer_code = 'ZZT';   -- ตั้งรหัสครั้งแรก (first-login-check.mjs) บันทึกประวัติไว้
delete from public.dealer_account_requests where dealer_code = 'ZZT';
delete from public.profiles where id in (select id from auth.users where email like 'live-%@example.test');
delete from auth.users where email like 'live-%@example.test';
delete from public.dealers where code = 'ZZT';
-- ═══ ผู้สนใจทดสอบ → ใบค่าแฟรนไชส์ → ดีลเลอร์ ZZTN + บัญชี + จังหวัด ═══
--   ลบเฉพาะผู้สนใจชื่อขึ้นต้น ZZTEST-ผู้สนใจเว็บจริง- · สาขา ZZTN · บัญชี zztn@dealer.benjaminpebsteel.com เท่านั้น · ข้อทดสอบ tests/tools/franchise-cleanup.test.mjs
--   ใบ + การชำระ + ประวัติผู้สนใจ หายตามผู้สนใจ (กุญแจนอก) · จังหวัดที่ดูแล + รหัสที่จำไว้ + ตั้งค่า หายตามสาขา · ⛔ ไม่ย้อนตัวนับเลขใบ (ใบถัดไปข้ามเลข)
delete from public.email_outbox
 where ref_table = 'dealer_package_proposals' and ref_id in (select p.id::text from public.dealer_package_proposals p join public.dealer_prospects x on x.id = p.prospect_id where x.name like 'ZZTEST-ผู้สนใจเว็บจริง-%');
delete from public.notifications where dealer_code = 'ZZTN' or (audience = 'hq' and body like '%ZZTEST-ผู้สนใจเว็บจริง-%');
delete from public.quotations where dealer_code = 'ZZTN';
delete from public.hq_quotes where request_id in (select id from public.quote_requests where dealer_code = 'ZZTN');
update public.quote_requests set supersedes_id = null, root_id = null where dealer_code = 'ZZTN';
delete from public.quote_request_events where request_id in (select id from public.quote_requests where dealer_code = 'ZZTN');
delete from public.quote_requests where dealer_code = 'ZZTN';
delete from public.files where dealer_code = 'ZZTN';
delete from public.customer_notes where dealer_code = 'ZZTN';
delete from public.appointments where dealer_code = 'ZZTN';
delete from public.leads where dealer_code = 'ZZTN';
delete from public.customers where dealer_code = 'ZZTN';
delete from public.dealer_lead_rules where dealer_code = 'ZZTN';
delete from public.responsible_persons where dealer_code = 'ZZTN';
delete from public.dealer_account_changes where dealer_code = 'ZZTN';
delete from public.dealer_account_requests where dealer_code = 'ZZTN';
delete from public.dealer_prospects where name like 'ZZTEST-ผู้สนใจเว็บจริง-%';
delete from public.profiles where dealer_code = 'ZZTN';
delete from auth.users where lower(email) = 'zztn@dealer.benjaminpebsteel.com';
delete from public.dealers where code = 'ZZTN';
-- ═══ จบชุดผู้สนใจทดสอบ ═══
-- ⚠️ ต้องอยู่หลังลบแถวสาขา ZZT ทั้งหมด: ลบแถวสาขาทำให้ฐานจดบันทึกการใช้งานใหม่ (ใบ 0240) — เดิมอยู่ก่อน → เหลือแถวทดสอบค้าง 6 แถวบนฐานจริง 27 ต.ค. 69
--   ข้อทดสอบลำดับ: tests/tools/audit-cleanup.test.mjs
-- ═══ บันทึกการใช้งาน (ใบ 0240 ให้ฐานบันทึกเอง · ใบ 0241 กันแก้/ลบ · บอสสั่ง 26 ต.ค. 69) ═══
--   ลบเฉพาะแถวของสาขาทดสอบ ZZT และบัญชีชั่วคราว live-* (ชื่อแสดง 'บัญชีทดสอบชั่วคราว' = บัญชี live-* ที่ run.mjs สร้าง)
--   นับก่อนลบ: tests/prod-live/cleanup-audit-count.sql (เงื่อนไขชุดเดียวกัน — แก้ที่หนึ่งต้องแก้อีกที่ · ข้อทดสอบ audit-cleanup.test.mjs)
--   ด่านกันพลาด: เงื่อนไขนี้จับแถวที่ไม่ใช่แถวทดสอบได้แม้แถวเดียว → ยกเลิกทั้งชุด (ตัวดักใบ 0241 ก็ปฏิเสธซ้ำอีกชั้น)
do $$ begin
  if to_regprocedure('public._audit_is_test_row(text,text,text)') is not null and exists (
       select 1 from public.audit_log
        where ("user" like 'live-%@example.test' or "user" = 'บัญชีทดสอบชั่วคราว' or target like 'ZZT · %' or target = 'ZZT' or target like 'ZZTN · %' or target = 'ZZTN' or "user" like 'ZZTEST-ผู้สนใจเว็บจริง-%' or target like 'ZZTEST-ผู้สนใจเว็บจริง-%')
          and not public._audit_is_test_row("user", target, action)) then
    raise exception 'เงื่อนไขลบบันทึกการใช้งานจับแถวที่ไม่ใช่แถวทดสอบ — ยกเลิกทั้งชุด';
  end if;
end $$;
set local pms.audit_delete = 'test';
-- ใบ 0245: ฐานเขียนบันทึกสรุปการลบเอง ต้องมีชื่อชุดสำรองก่อนลบ — ค่าตัวอย่างนี้ถูกแทนตอนรัน (ไม่แทน = ฐานปฏิเสธ ไม่ลบ)
--   ฐานจริง: ชื่อโฟลเดอร์สำรองที่ซ้อมกู้ผ่านแล้ว · รอบตรวจในเครื่อง: scripts/test-prodbuild.mjs แทนให้
set local pms.audit_backup = '__ชุดสำรองก่อนลบ__';
delete from public.audit_log
 where "user" like 'live-%@example.test' or "user" = 'บัญชีทดสอบชั่วคราว' or target like 'ZZT · %' or target = 'ZZT' or target like 'ZZTN · %' or target = 'ZZTN' or "user" like 'ZZTEST-ผู้สนใจเว็บจริง-%' or target like 'ZZTEST-ผู้สนใจเว็บจริง-%';
set local pms.audit_delete = '';
set local pms.audit_backup = '';
-- ═══ จบบันทึกการใช้งาน ═══
alter table public.hq_quotes enable trigger hq_quotes_lock_sent;
alter table public.quotations enable trigger quotations_no_delete_won;
alter table public.quotations enable trigger trg_price_history_append_only;
-- ⛔ ห้ามตั้ง/ย้อนตัวนับลำดับ (setval) ที่นี่ — ไฟล์นี้รันกับฐานจริง (บอสสั่ง 19 ต.ค. 69)
--   เดิมตั้งลำดับคำขอ/ใบ HQ/อีเมล/ไฟล์กลับไป 1 เมื่อตารางว่าง (ไว้ให้ใบจริงใบแรกได้ 00001 ก่อนเปิดระบบ)
--   ระบบจริงมีคำขอจริงแล้ว: ย้อนตัวนับ = เลขเอกสารซ้ำกับที่เคยออก · ตัวตรวจ scripts/check-prod-counter-safety.mjs
commit;
