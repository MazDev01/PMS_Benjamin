-- ── ใบ 0240: บันทึกการใช้งานของ HQ ฐานเขียนเองในคำสั่งเดียวกับการเปลี่ยน (บอสสั่ง 22 ต.ค. 69) ─────────────────────────
--
-- ปัญหา (พบในรอบตรวจเต็มใบ 0239 · hq-proposals.spec.ts): หน้าเว็บเปลี่ยนข้อมูลก่อน แล้วค่อยยิงคำขอ "บันทึกการใช้งาน" แยกอีกคำขอ
--   ผู้ใช้กดไปหน้าอื่นก่อนคำขอนั้นตอบ → เบราว์เซอร์ตัดทิ้ง (net::ERR_ABORTED) → ข้อมูลเปลี่ยนจริง แต่ไม่มีบันทึกว่าใครเปลี่ยน
--   และหน้าเว็บเป็นคนกำหนดชื่อผู้ทำ/ข้อความเอง (ฐานตรวจได้แค่ว่าชื่อตรงบัญชี)
-- ทางแก้ (บอสสั่ง: ให้ฐานบันทึกในคำสั่งเดียวกับการเปลี่ยน ไม่พึ่งคำขอแยก · หน้าเว็บห้ามเขียนบันทึกเอง):
--   1) ตัวดักหลังเขียน บนตารางที่หน้าเว็บเคยบันทึกเอง: ใบค่าแฟรนไชส์ · การชำระ · ผู้สนใจเป็นดีลเลอร์ · ดีลเลอร์ · ผู้ใช้ HQ
--      · ตั้งค่า 5 ตาราง · ข้อมูลบริษัท — อยู่ในรายการเดียวกับการเปลี่ยน สำเร็จพร้อมกัน/ย้อนพร้อมกัน
--   2) เรื่องที่ไม่มีการเปลี่ยนข้อมูลให้ผูก (ส่งออกการตั้งค่า · เข้า/ออกระบบ) และการกู้คืน/คืนค่า (ต้องบอกชนิด+ชื่อไฟล์)
--      = คำสั่งฐานที่บันทึกเอง ผู้ทำคิดที่ฐาน
--   3) ถอนสิทธิ์เขียนตาราง audit_log จากบัญชีผู้ใช้ (anon/authenticated) — เขียนได้เฉพาะฟังก์ชันของฐาน (security definer)
--      และเส้นทางผู้ดูแลฝั่งเซิร์ฟเวอร์ (service_role · สร้าง/ลบบัญชี · ผูกผู้สนใจ — บันทึกชื่อคนทำเองอยู่แล้ว)
--
-- บันทึกเฉพาะ "การกระทำของผู้ใช้โดยตรง" (กันบันทึกซ้ำ/ท่วม):
--   • ต้องมีผู้ใช้ในคำขอ (auth.uid()) — งานตามเวลา/สคริปต์/เส้นทางผู้ดูแล (service_role) ไม่ลง (เส้นทางผู้ดูแลลงเองแล้ว)
--   • pg_trigger_depth() = 1 — ผลข้างเคียงของตัวดักอื่นไม่ลง (ใบเดิมถูกแทนที่ตอนส่งเวอร์ชันใหม่ · ขั้นผู้สนใจเลื่อนเองตอนส่งใบ
--     · ใบที่ลบตามผู้สนใจ (on delete cascade) · เป้าที่ตามแพ็กเกจ)
--   • ไม่มีอะไรเปลี่ยนจริง (บันทึกค่าเดิมซ้ำ · หน้าเว็บส่งรายชื่อดีลเลอร์ทั้งชุด) = ไม่ลง
-- ชื่อผู้ทำ = ชื่อในโปรไฟล์ (ไม่มีชื่อ → อีเมลในใบผ่าน) — แบบเดียวกับที่หน้าเว็บ/เส้นทางผู้ดูแลลงไว้เดิม หน้าบันทึกการใช้งานอ่านต่อเนื่อง
-- ข้อความเรื่อง/เป้าหมาย = ตัวอักษรเดียวกับที่หน้าเว็บเคยลง (ป้ายสถานะ/แพ็กเกจ/บทบาท ตรงกับ lib/dealerProposals.ts ·
--   lib/dealerProspects.ts · UsersPanel ROLES) · วันที่แสดงปี พ.ศ. (th_date ใบ 0239)
-- ข้อทดสอบ: supabase/tests/audit_in_db.sql · ตัวตรวจหน้าเว็บ: scripts/check-audit-from-db.mjs

-- ── ตัวช่วยกลาง ─────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.audit_actor_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif(btrim(name), '') from profiles where id = auth.uid()),
    nullif(auth.jwt() ->> 'email', ''),
    'system');
$$;

-- ลงบันทึก 1 แถวในนามผู้ใช้ของคำขอ · ไม่มีผู้ใช้ (ระบบเบื้องหลัง/service_role) = ไม่ลง
create or replace function public._audit_hq(p_action text, p_target text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into audit_log("user", role, action, target) values (audit_actor_name(), auth_role(), p_action, coalesce(p_target, ''));
end $$;

-- ตัวดักควรลงไหม: ผู้ใช้ทำเองตรง ๆ (ไม่ใช่ผลข้างเคียงของตัวดักอื่น) และไม่อยู่ระหว่างกู้คืนการตั้งค่า (ซึ่งลงบันทึกรวมแถวเดียว)
create or replace function public._audit_direct() returns boolean
language sql stable set search_path = public as $$
  select pg_trigger_depth() <= 1 and coalesce(current_setting('pms.audit_skip', true), '') <> 'on';
$$;

create or replace function public._audit_baht(n numeric) returns text
language sql immutable set search_path = public as $$
  select to_char(n, 'FM999,999,999,999,990.00');
$$;

-- ── ผู้สนใจเป็นดีลเลอร์ ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function public._prospect_status_th(s text) returns text
language sql immutable set search_path = public as $$
  select case s when 'new' then 'รอติดต่อ' when 'contacted' then 'ติดต่อแล้ว' when 'profile_sent' then 'ส่งข้อมูลบริษัทแล้ว'
    when 'meeting' then 'นัดคุยแล้ว' when 'considering' then 'รอตัดสินใจ' when 'won' then 'เป็นดีลเลอร์แล้ว'
    when 'lost' then 'ไม่สำเร็จ' else s end;
$$;

create or replace function public.dealer_prospects_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  -- ช่องที่ระบบเขียนเอง/ไปกับการเปลี่ยนขั้น — ไม่นับเป็น "แก้ไข"
  ข้าม constant text[] := array['status', 'lost_reason', 'dealer_code', 'converted_at', 'updated_at', 'last_contact_at', 'created_at'];
begin
  if not _audit_direct() then return null; end if;
  if tg_op = 'INSERT' then
    perform _audit_hq('เพิ่มผู้สนใจเป็นดีลเลอร์', new.name);
  elsif tg_op = 'DELETE' then
    perform _audit_hq('ลบผู้สนใจเป็นดีลเลอร์', old.name);
  elsif new.status is distinct from old.status then
    perform _audit_hq('เปลี่ยนขั้นผู้สนใจเป็นดีลเลอร์',
      new.name || ' · ' || _prospect_status_th(old.status::text) || ' → ' || _prospect_status_th(new.status::text));
  elsif (to_jsonb(new) - ข้าม) is distinct from (to_jsonb(old) - ข้าม) then
    perform _audit_hq('แก้ไขผู้สนใจเป็นดีลเลอร์', new.name);
  end if;
  return null;
end $$;
drop trigger if exists dealer_prospects_audit on public.dealer_prospects;
create trigger dealer_prospects_audit after insert or update or delete on public.dealer_prospects
  for each row execute function public.dealer_prospects_audit();

-- ── ใบค่าแฟรนไชส์ ───────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public._proposal_status_th(s text) returns text
language sql immutable set search_path = public as $$
  select case s when 'draft' then 'ร่าง' when 'sent' then 'ส่งแล้ว' when 'accepted' then 'ตอบรับ' when 'rejected' then 'ปฏิเสธ'
    when 'expired' then 'หมดอายุ' when 'superseded' then 'ถูกแทนด้วยเวอร์ชันใหม่' else s end;
$$;

create or replace function public.dealer_package_proposals_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r dealer_package_proposals := coalesce(new, old);
  ราย text := coalesce((select name from dealer_prospects where id = r.prospect_id), '');
  เลข text := coalesce(r.proposal_no, '');
  -- ช่องที่ไม่ใช่เนื้อหาใบ — สถานะ/ปิดใบ/วันครบกำหนดชำระ ลงเป็นเรื่องของตัวเอง
  ข้าม constant text[] := array['status', 'close_reason', 'closed_at', 'payment_due_on', 'updated_at', 'created_at'];
begin
  if not _audit_direct() then return null; end if;
  if tg_op = 'INSERT' then
    if new.supersedes_id is null then
      perform _audit_hq('ออกใบค่าแฟรนไชส์', เลข || ' · ' || ราย || ' · ' || initcap(new.package::text));
    else
      perform _audit_hq('ทำเวอร์ชันใหม่ใบค่าแฟรนไชส์',
        coalesce((select proposal_no from dealer_package_proposals where id = new.supersedes_id), '') || ' → ' || เลข || ' · ' || ราย);
    end if;
  elsif tg_op = 'DELETE' then
    -- ลบตามผู้สนใจ (on delete cascade) ไม่นับเป็นชั้นตัวดัก — ผู้สนใจต้นทางหายไปแล้ว = ลบตามกัน ลงแค่ "ลบผู้สนใจ" แถวเดียว
    if not exists (select 1 from dealer_prospects where id = old.prospect_id) then return null; end if;
    perform _audit_hq('ลบใบค่าแฟรนไชส์ (ร่าง)', เลข || ' · ' || ราย);
  else
    if new.status is distinct from old.status then
      perform _audit_hq('เปลี่ยนสถานะใบค่าแฟรนไชส์',
        เลข || ' · ' || ราย || ' → ' || _proposal_status_th(new.status::text)
          || coalesce(' · ' || nullif(btrim(new.close_reason), ''), ''));
    elsif (to_jsonb(new) - ข้าม) is distinct from (to_jsonb(old) - ข้าม) then
      perform _audit_hq('แก้ไขใบค่าแฟรนไชส์', เลข || ' · ' || ราย);
    end if;
    if new.payment_due_on is distinct from old.payment_due_on then
      perform _audit_hq('ตั้งวันครบกำหนดชำระค่าแฟรนไชส์',
        เลข || ' · ' || coalesce(th_date(new.payment_due_on), 'ล้างวัน'));
    end if;
  end if;
  return null;
end $$;
drop trigger if exists dealer_package_proposals_audit on public.dealer_package_proposals;
create trigger dealer_package_proposals_audit after insert or update or delete on public.dealer_package_proposals
  for each row execute function public.dealer_package_proposals_audit();

-- ── การชำระค่าแฟรนไชส์ (บันทึก · ยกเลิก — แก้/ลบไม่ได้อยู่แล้ว 0208) ──────────────────────────────────────────────
create or replace function public.dealer_proposal_payments_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare เลข text := coalesce((select proposal_no from dealer_package_proposals where id = new.proposal_id), '');
begin
  if not _audit_direct() then return null; end if;
  if tg_op = 'INSERT' then
    perform _audit_hq('บันทึกการชำระค่าแฟรนไชส์', เลข || ' · ' || _audit_baht(new.amount) || ' บาท · ' || coalesce(new.reference, ''));
  elsif old.cancelled_at is null and new.cancelled_at is not null then
    perform _audit_hq('ยกเลิกการชำระค่าแฟรนไชส์', เลข || ' · ' || _audit_baht(new.amount) || ' บาท · ' || coalesce(new.cancel_reason, ''));
  end if;
  return null;
end $$;
drop trigger if exists dealer_proposal_payments_audit on public.dealer_proposal_payments;
create trigger dealer_proposal_payments_audit after insert or update on public.dealer_proposal_payments
  for each row execute function public.dealer_proposal_payments_audit();

-- ── ดีลเลอร์ (แก้ไข · ปิด/เปิดใช้งาน — สร้างดีลเลอร์ทำที่เส้นทางผู้ดูแล ซึ่งลงบันทึกเองแล้ว) ──────────────────────────
create or replace function public.dealers_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare ช่อง constant text[] := array['name', 'province', 'region', 'revenue_target', 'package', 'target_manual'];
  ใหม่ jsonb := to_jsonb(new); เดิม jsonb := to_jsonb(old); k text; ต่าง boolean := false;
begin
  if not _audit_direct() then return null; end if;
  if new.status is distinct from old.status then
    perform _audit_hq(case when new.status = 'inactive' then 'ปิดใช้งานดีลเลอร์' else 'เปิดใช้งานดีลเลอร์' end, new.code || ' · ' || new.name);
  end if;
  foreach k in array ช่อง loop
    if ใหม่ -> k is distinct from เดิม -> k then ต่าง := true; end if;
  end loop;
  if ต่าง then perform _audit_hq('แก้ไขดีลเลอร์', new.code || ' · ' || new.name); end if;
  return null;
end $$;
drop trigger if exists dealers_audit on public.dealers;
create trigger dealers_audit after update on public.dealers
  for each row execute function public.dealers_audit();

-- ── ผู้ใช้ HQ (แผงผู้ใช้ · แก้โปรไฟล์ตัวเองของ HQ) — เพิ่ม/ลบบัญชีทำที่เส้นทางผู้ดูแล ซึ่งลงบันทึกเองแล้ว ─────────────────
create or replace function public._role_th(r text) returns text
language sql immutable set search_path = public as $$
  select case r when 'SUPER_ADMIN' then 'ผู้ดูแลระบบ' when 'HQ_MANAGEMENT' then 'ผู้บริหารสำนักงานใหญ่'
    when 'HQ_STAFF' then 'เจ้าหน้าที่สำนักงานใหญ่' else r end;
$$;

create or replace function public.profiles_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare ช่อง constant text[] := array['name', 'department', 'avatar', 'phone', 'contact_email'];
  ใหม่ jsonb := to_jsonb(new); เดิม jsonb := to_jsonb(old); k text; ต่าง boolean := false;
  อีเมล text;
begin
  if not _audit_direct() then return null; end if;
  -- บันทึกการใช้งานเป็นของ HQ — บัญชีดีลเลอร์ไม่ลง (เดิมหน้าเว็บก็ลงเฉพาะแผงผู้ใช้ของ HQ)
  if not (old.role::text in ('SUPER_ADMIN', 'HQ_MANAGEMENT', 'HQ_STAFF') or new.role::text in ('SUPER_ADMIN', 'HQ_MANAGEMENT', 'HQ_STAFF')) then
    return null;
  end if;
  อีเมล := coalesce((select email::text from auth.users where id = new.id), new.contact_email, '');
  if new.role is distinct from old.role then
    perform _audit_hq('เปลี่ยนบทบาทผู้ใช้', อีเมล || ': ' || _role_th(old.role::text) || ' → ' || _role_th(new.role::text));
  end if;
  if new.status is distinct from old.status then
    perform _audit_hq(case when new.status = 'inactive' then 'ปิดใช้งานผู้ใช้' else 'เปิดใช้งานผู้ใช้' end, อีเมล);
  end if;
  foreach k in array ช่อง loop
    if ใหม่ -> k is distinct from เดิม -> k then ต่าง := true; end if;
  end loop;
  if ต่าง then perform _audit_hq('แก้ไขผู้ใช้', อีเมล); end if;
  return null;
end $$;
drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit after update on public.profiles
  for each row execute function public.profiles_audit();

-- ── ตั้งค่า 5 ตาราง + ข้อมูลบริษัท (หน้าเว็บ upsert แถวเดียว id=1) ───────────────────────────────────────────────────
create or replace function public.hq_settings_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not _audit_direct() then return null; end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'updated_at') is not distinct from (to_jsonb(old) - 'updated_at') then return null; end if;
  if tg_table_name = 'hq_company' then
    perform _audit_hq('บันทึกข้อมูลบริษัท', coalesce(nullif(btrim(to_jsonb(new) ->> 'name'), ''), '(ยังไม่ระบุชื่อบริษัท)'));
  else
    perform _audit_hq('บันทึกการตั้งค่า', case tg_table_name
      when 'hq_policy' then 'นโยบายใบเสนอราคา' when 'hq_targets' then 'เป้าหมายยอดขาย' when 'hq_notif_rules' then 'การแจ้งเตือน'
      when 'hq_sales_journey' then 'เส้นทางการขาย' when 'hq_recruit_settings' then 'หาดีลเลอร์' else tg_table_name end);
  end if;
  return null;
end $$;
do $$
declare t text;
begin
  foreach t in array array['hq_policy', 'hq_targets', 'hq_notif_rules', 'hq_sales_journey', 'hq_recruit_settings', 'hq_company'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update on public.%I for each row execute function public.hq_settings_audit()', t || '_audit', t);
  end loop;
end $$;

-- ── กู้คืน (นำเข้าไฟล์) / คืนค่าเริ่มต้น — ลงบันทึกรวมแถวเดียวพร้อมชนิด+ชื่อไฟล์ ไม่ลงรายตาราง ─────────────────────────────
create or replace function public.hq_settings_restore(
  p_kind         text,
  p_file         text  default null,
  p_policy       jsonb default null,
  p_targets      jsonb default null,
  p_notif_rules  jsonb default null,
  p_lost_reasons jsonb default null,
  p_company      jsonb default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_write_master() then raise exception 'forbidden: no permission to restore hq settings'; end if;
  if p_kind is null or p_kind not in ('import', 'reset') then raise exception 'invalid restore kind: %', p_kind; end if;
  perform set_config('pms.audit_skip', 'on', true);
  perform restore_hq_settings(p_policy, p_targets, p_notif_rules, p_lost_reasons, p_company);
  perform set_config('pms.audit_skip', '', true);
  if p_kind = 'import' then
    perform _audit_hq('นำเข้าการตั้งค่า (กู้คืน)', coalesce(nullif(btrim(p_file), ''), '(ไม่ระบุชื่อไฟล์)'));
  else
    perform _audit_hq('คืนค่าเริ่มต้น', 'นโยบาย/เป้าหมาย/กฎแจ้งเตือน/เหตุผลปิดการขาย');
  end if;
end $$;

-- ── ส่งออกการตั้งค่า (ไม่มีการเปลี่ยนข้อมูลให้ผูก) ──────────────────────────────────────────────────────────────────
create or replace function public.hq_settings_audit_export(p_file text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_hq() then raise exception 'forbidden: hq only'; end if;
  perform _audit_hq('ส่งออกการตั้งค่า', coalesce(nullif(btrim(p_file), ''), '(ไม่ระบุชื่อไฟล์)'));
end $$;

-- ── เข้า/ออกระบบของ HQ (ดีลเลอร์ไม่ลง — เหมือนเดิม) ────────────────────────────────────────────────────────────────
create or replace function public.audit_auth_event(p_action text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_action is null or p_action not in ('เข้าสู่ระบบ', 'ออกจากระบบ') then raise exception 'invalid auth event: %', p_action; end if;
  if not is_hq() then return; end if;
  perform _audit_hq(p_action, 'Benjamin HQ');   -- ค่าเดียวกับชื่อสาขาในเซสชัน HQ ของแอป (lib/supabaseAuth.ts · cookieAuth.ts)
end $$;

-- ── สิทธิ์ ───────────────────────────────────────────────────────────────────────────────────────────────────────
-- ตัวช่วยภายใน/ตัวดัก: ไม่มีใครเรียกตรงได้ (ตัวดักรันได้โดยไม่ต้องมีสิทธิ์เรียก)
revoke all on function public.audit_actor_name() from public, anon, authenticated, service_role;
revoke all on function public._audit_hq(text, text) from public, anon, authenticated, service_role;
revoke all on function public._audit_direct() from public, anon, authenticated, service_role;
revoke all on function public._audit_baht(numeric) from public, anon, authenticated, service_role;
revoke all on function public._prospect_status_th(text) from public, anon, authenticated, service_role;
revoke all on function public._proposal_status_th(text) from public, anon, authenticated, service_role;
revoke all on function public._role_th(text) from public, anon, authenticated, service_role;
revoke all on function public.dealer_prospects_audit() from public, anon, authenticated, service_role;
revoke all on function public.dealer_package_proposals_audit() from public, anon, authenticated, service_role;
revoke all on function public.dealer_proposal_payments_audit() from public, anon, authenticated, service_role;
revoke all on function public.dealers_audit() from public, anon, authenticated, service_role;
revoke all on function public.profiles_audit() from public, anon, authenticated, service_role;
revoke all on function public.hq_settings_audit() from public, anon, authenticated, service_role;
revoke all on function public.hq_settings_restore(text, text, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.hq_settings_audit_export(text) from public, anon, authenticated, service_role;
revoke all on function public.audit_auth_event(text) from public, anon, authenticated, service_role;
grant execute on function public.hq_settings_restore(text, text, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.hq_settings_audit_export(text) to authenticated;
grant execute on function public.audit_auth_event(text) to authenticated;
-- กู้คืนแบบเดิมเรียกตรงไม่ได้แล้ว — ต้องผ่าน hq_settings_restore ที่ลงบันทึก
revoke execute on function public.restore_hq_settings(jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;

-- ตาราง audit_log: บัญชีผู้ใช้อ่านได้ตามกฎเดิม (audit_read) แต่เขียน/แก้/ลบเองไม่ได้ · service_role (เส้นทางผู้ดูแล) คงเดิม
revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;
