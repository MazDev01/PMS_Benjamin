-- ── ใบ 0285: คำบนจอที่ฐานสร้าง ให้ตรงคลังคำ (จองโดยเซสชัน ef · บอสสั่ง 9 พ.ย. 69 "ตรวจคำที่ดูแปลกทั้ง 2 แอป" · docs/glossary.md) ──
-- ข้อความที่ฐานเขียนเอง (กระดิ่ง/อีเมล · ข้อความผิดพลาด) แก้ได้ทางใบปรับฐานเท่านั้น · แถวที่ส่งไปแล้ว (notifications · email_outbox ·
-- audit_log) ไม่แก้ย้อนหลัง — มีผลกับข้อความที่สร้างหลังลงใบนี้ · รันซ้ำได้ (create or replace · update ด้วยคีย์)
--   1) กระดิ่ง/อีเมล HQ "ลูกค้าตอบรับ (ปิดการขายได้)" → "ลูกค้าตอบรับ (ปิดการขายสำเร็จ)" (คลังคำ: เลิกใช้ "ปิดการขายได้")
--   2) ข้อความผิดพลาดของ Send Email Hook "อีเมลของระบบล็อกอินปิดอยู่" → "อีเมลของระบบเข้าระบบปิดอยู่" (ทั้งระบบใช้ "เข้าระบบ")
--      คงรหัสนำหน้า auth_email_disabled: (ข้อทดสอบ/หน้าเว็บจับด้วยรหัสนี้)
-- ข้อทดสอบ: supabase/tests/ui_terms_db.sql (ข้อความของฐานไม่มีคำห้ามในคลังคำ)

update public.notification_kinds set title = 'ลูกค้าตอบรับ (ปิดการขายสำเร็จ)'
 where kind = 'customer_accepted' and title = 'ลูกค้าตอบรับ (ปิดการขายได้)';

create or replace function public.hook_send_email(event jsonb) returns jsonb
  language plpgsql stable set search_path to '' as $$
begin
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'auth_email_disabled: อีเมลของระบบเข้าระบบปิดอยู่ — ลืมรหัสผ่าน ติดต่อ HQ'));
end $$;
comment on function public.hook_send_email(jsonb) is
  'Send Email Hook ของ Supabase Auth — ปฏิเสธทุกคำขอส่งอีเมลของระบบเข้าระบบ (ลืมรหัสผ่าน/เลขเข้าระบบ) · ใบ 0213 · ข้อความใบ 0285';
revoke all on function public.hook_send_email(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.hook_send_email(jsonb) to supabase_auth_admin;

-- 3) บรรทัดในอีเมลถึง HQ (จาก 0281 ทุกตัวอักษร · เปลี่ยนแค่วิธีเขียนขึ้นบรรทัด) — เดิมขึ้นบรรทัดด้วยการกด Enter ใน E'…'
--    git บนเครื่อง Windows (core.autocrlf=true) checkout ไฟล์ใบเป็น CRLF → อีเมลได้ \r\n ตามเครื่องที่ลงใบ (ฐานจริง/ฐานทดสอบไม่เหมือนกัน)
--    · ข้อทดสอบ dealer_display_name ตกในโฟลเดอร์ที่ checkout ใหม่ (พบ 9 พ.ย. 69 โดยผู้ช่วย stage4) → ใช้ E'\n' ไม่ขึ้นกับขึ้นบรรทัดของไฟล์
create or replace function public._quote_request_mail_lines(r quote_requests) returns text
  language sql stable security definer set search_path to 'public' as $function$
  select 'เลขคำขอ: ' || r.request_no || E'\n'
      || 'ดีลเลอร์: ' || _dealer_display_name(r.dealer_code) || E'\n'
      || 'ลูกค้าเป้าหมาย: ' || coalesce((select nullif(l.company, '') from leads l where l.dealer_code = r.dealer_code and l.num_id = r.lead_num_id), '—') || E'\n'
      || 'งานที่ขอ: ' || coalesce(nullif(r.product, ''), '—') || case when r.subtype <> '' then ' · ' || r.subtype else '' end || E'\n'
      || 'จังหวัดหน้างาน: ' || coalesce(nullif(r.province, ''), '—') || E'\n'
      || 'กำหนดส่งใบ HQ: ' || th_datetime(r.due_at) || ' น.'
$function$;
revoke all on function public._quote_request_mail_lines(public.quote_requests) from public, anon, authenticated, service_role;

-- ══ ส่วนที่ 4 (บอสเลือกตาราง 15 คำ 9 พ.ย. 69 · docs/glossary.md) ══════════════════════════════════════════════════════════════
--   คำบนจอที่ฐานสร้าง: ลีด → ลูกค้าเป้าหมาย · คำขอราคา → คำขอใบเสนอราคา · เวอร์ชัน → ฉบับ · ดีล → งานขาย · โครงการ → ชื่องาน
--   · ติดต่อผู้ดูแลระบบ → ติดต่อสำนักงานใหญ่ (ข้อความถึงดีลเลอร์)
--   ไม่แตะ (ตั้งใจ): ชื่อการกระทำ/ไทม์ไลน์ในบันทึก (บันทึกเดิม + ตัวกรอง/ลิงก์ผูกชื่อ) · ค่าข้อมูลที่ใช้เทียบ (เหตุผลปิด "ราคา HQ เปลี่ยนเวอร์ชัน")
--   · ชื่อสินค้า "ออกแบบเฉพาะโครงการ" · รายการงาน JSON · แถวแจ้งเตือน/อีเมลที่ส่งไปแล้ว
--   ฟังก์ชันด้านล่าง = pg_get_functiondef ของฐานที่ลงถึงใบ 0285 ส่วน 1–3 ทุกตัวอักษร แทนเฉพาะคำในเครื่องหมายคำพูด (สร้างด้วยสคริปต์ · สิทธิ์เดิมคงไว้)
update public.notification_kinds set
    title   = replace(replace(title, 'ลีด', 'ลูกค้าเป้าหมาย'), 'คำขอราคา', 'คำขอใบเสนอราคา'),
    body    = replace(replace(body, 'ลีด', 'ลูกค้าเป้าหมาย'), 'คำขอราคา', 'คำขอใบเสนอราคา'),
    goes_to = replace(replace(goes_to, 'ลีด', 'ลูกค้าเป้าหมาย'), 'คำขอราคา', 'คำขอใบเสนอราคา')
 where title ~ 'ลีด|คำขอราคา' or body ~ 'ลีด|คำขอราคา' or goes_to ~ 'ลีด|คำขอราคา';

CREATE OR REPLACE FUNCTION public.material_templates_block_used_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if exists (select 1 from quote_requests r where r.estimate_items @> jsonb_build_array(jsonb_build_object('templateId', old.id))) then
    raise exception 'material_in_use: วัสดุ "%" เคยใช้ในคำขอใบเสนอราคา/ใบ HQ แล้ว ลบไม่ได้ — ปิดใช้แทน', old.name;
  end if;
  return old;
end $function$;

CREATE OR REPLACE FUNCTION public.quotations_hq_link_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  h hq_quotes;
  r quote_requests;
begin
  if tg_op = 'INSERT' and new.hq_quote_id is null then
    raise exception 'hq_quote_required: ใบเสนอราคาให้ลูกค้าต้องทำจากใบ HQ — ส่งคำขอใบเสนอราคาให้สำนักงานใหญ่ก่อน';
  end if;
  if tg_op = 'UPDATE' and old.hq_quote_id is not null and new.hq_quote_id is distinct from old.hq_quote_id then
    raise exception 'hq_link_locked: ใบเสนอราคานี้ผูกกับใบ HQ แล้ว เปลี่ยนไม่ได้ — ออกใบใหม่จากใบ HQ ฉบับใหม่';
  end if;
  if new.hq_quote_id is null or (tg_op = 'UPDATE' and new.hq_quote_id is not distinct from old.hq_quote_id) then
    return new;
  end if;

  select * into h from hq_quotes where id = new.hq_quote_id;
  if found then select * into r from quote_requests where id = h.request_id; end if;
  if h.id is null or r.dealer_code is distinct from new.dealer_code or h.status = 'draft' then
    raise exception 'hq_link_invalid: ไม่พบใบ HQ นี้ในคำขอของสาขา';
  end if;
  if h.status <> 'sent' then
    raise exception 'hq_link_invalid: ใบ HQ % ใช้ออกใบใหม่ไม่ได้แล้ว (สถานะ %)', h.quote_no, h.status;
  end if;
  if new.deal_id is null then new.deal_id := r.lead_num_id;
  elsif new.deal_id <> r.lead_num_id then
    raise exception 'hq_link_invalid: ใบ HQ นี้เป็นของลูกค้าเป้าหมายรายอื่น';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.hq_quotes_lock_sent()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'hq_quote_locked: ใบ HQ ที่ส่งแล้วลบไม่ได้'; end if;
    return old;
  end if;
  if old.status <> 'draft' and (
       new.line_items is distinct from old.line_items or new.total_cost is distinct from old.total_cost
    or new.valid_until is distinct from old.valid_until or new.version is distinct from old.version
    or new.request_id is distinct from old.request_id or new.quote_no is distinct from old.quote_no
    -- sent_by กลายเป็นว่างได้ทางเดียวคือบัญชีผู้ส่งถูกลบ (ชื่อผู้ส่งยังอยู่ใน sent_by_name)
    or (new.sent_by is distinct from old.sent_by and new.sent_by is not null) or new.sent_by_name is distinct from old.sent_by_name
    or new.sent_at is distinct from old.sent_at
    or new.recipient_dealer_code is distinct from old.recipient_dealer_code
    or new.recipient_dealer_name is distinct from old.recipient_dealer_name) then
    raise exception 'hq_quote_locked: ใบ HQ ที่ส่งแล้วแก้ไม่ได้ — ต้องออกฉบับใหม่ผ่านการขอแก้ราคา';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'draft'   and new.status = 'sent')
    or (old.status = 'sent'    and new.status in ('ordered', 'superseded'))
    or (old.status = 'ordered' and new.status = 'sent')) then        -- ย้อนการตอบรับของลูกค้า
    raise exception 'hq_quote_locked: เปลี่ยนสถานะใบ HQ จาก % เป็น % ไม่ได้', old.status, new.status;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  p record;
begin
  select pr.role                                as role,
         coalesce(pr.dealer_code, '')           as dealer_code,
         pr.status::text                        as user_status,
         coalesce(d.status::text, 'active')     as dealer_status
    into p
    from public.profiles pr
    left join public.dealers d on d.code = pr.dealer_code
   where pr.id = (event ->> 'user_id')::uuid;

  -- ไม่มีโปรไฟล์ = ไม่ใส่ claim สิทธิ์ให้ (พฤติกรรมเดิมของ 0005 — RLS จะปฏิเสธเอง)
  if not found then
    return jsonb_set(event, '{claims}', claims);
  end if;

  -- บัญชีหรือสาขาถูกปิด → ไม่ออก token
  if p.user_status <> 'active' or (p.dealer_code <> '' and p.dealer_status <> 'active') then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message',   'บัญชีนี้ถูกปิดใช้งาน — กรุณาติดต่อสำนักงานใหญ่'));
  end if;

  claims := jsonb_set(claims, '{user_role}',   to_jsonb(p.role::text));
  claims := jsonb_set(claims, '{dealer_code}', to_jsonb(p.dealer_code));
  -- เครื่องหมาย "ยังไม่ได้ตั้งรหัสผ่านของตัวเอง" (0187) — ยกขึ้นเป็น claim ชั้นบนแบบเดียวกับ user_role / dealer_code
  --   ต้นทางคือ app_metadata ของบัญชี ซึ่งแก้ได้เฉพาะฝั่งเซิร์ฟเวอร์ (ผู้ใช้เรียก auth.updateUser แก้เองไม่ได้)
  claims := jsonb_set(claims, '{must_change_password}',
                      to_jsonb(coalesce(claims #>> '{app_metadata,must_change_password}', 'false') = 'true'));
  return jsonb_set(event, '{claims}', claims);
end;
$function$;

CREATE OR REPLACE FUNCTION public.dealer_package_proposals_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  y int;
  n int;
  p public.dealer_package_proposals;
  วันนี้ date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if tg_op = 'INSERT' then
    new.closed_at := null; new.close_reason := null;
    -- ใบใหม่เริ่มได้ที่ร่าง หรือออกแล้วส่งทันที · ข้ามไปตอบรับ/ปฏิเสธ/หมดอายุตั้งแต่สร้างไม่ได้ (เดิมไม่ได้กันตอนสร้าง)
    if new.status not in ('draft', 'sent') then
      raise exception 'proposal_status: ใบค่าแฟรนไชส์ใหม่ต้องเริ่มที่ร่างหรือส่งแล้ว (ได้ %)', new.status;
    end if;
    if new.supersedes_id is null then
      new.version := 1;
      y := extract(year from (now() at time zone 'Asia/Bangkok'))::int;
      insert into dealer_proposal_counters(year, next_no) values (y, 2)
        on conflict (year) do update set next_no = dealer_proposal_counters.next_no + 1
        returning next_no - 1 into n;
      new.proposal_no := 'DP-' || y || '-' || lpad(n::text, 4, '0');
    else
      -- เวอร์ชันใหม่: ต่อจากใบล่าสุดของสาย ที่ส่งแล้ว/ปฏิเสธ/หมดอายุ · ห้ามมีร่างเวอร์ชันใหม่ค้าง
      select * into p from dealer_package_proposals where id = new.supersedes_id for update;
      if not found or p.prospect_id is distinct from new.prospect_id then
        raise exception 'proposal_version: ใบต้นทางไม่ใช่ของผู้สนใจรายนี้';
      end if;
      if exists (select 1 from dealer_package_proposals c where c.supersedes_id = p.id and c.status = 'draft') then
        raise exception 'proposal_draft_exists: ใบ % มีร่างฉบับใหม่ค้างอยู่แล้ว — แก้ร่างนั้นต่อ', p.proposal_no;
      end if;
      if exists (select 1 from dealer_package_proposals c where c.supersedes_id = p.id) then
        raise exception 'proposal_not_latest: ใบ % มีฉบับใหม่กว่าแล้ว — ทำต่อจากใบล่าสุด', p.proposal_no;
      end if;
      if p.status not in ('sent', 'rejected', 'expired') then
        raise exception 'proposal_status: ทำฉบับใหม่ได้เฉพาะใบที่ส่งแล้ว/ปฏิเสธ/หมดอายุ (ใบ % เป็น %)', p.proposal_no, p.status;
      end if;
      if new.status <> 'draft' then
        raise exception 'proposal_status: ฉบับใหม่ต้องเริ่มจากร่าง';
      end if;
      new.version := p.version + 1;
      new.proposal_no := regexp_replace(p.proposal_no, '-V\d+$', '') || '-V' || new.version;
    end if;
  else
    new.id := old.id;
    new.prospect_id := old.prospect_id;
    new.proposal_no := old.proposal_no;
    new.created_at := old.created_at;
    new.version := old.version;
    new.supersedes_id := old.supersedes_id;

    if new.status is distinct from old.status then
      if not (
           (old.status = 'draft' and new.status = 'sent')
        or (old.status = 'sent'  and new.status in ('accepted', 'rejected', 'expired', 'superseded'))
      ) then
        raise exception 'proposal_status: เปลี่ยนสถานะใบค่าแฟรนไชส์จาก % เป็น % ไม่ได้', old.status, new.status;
      end if;
      -- ถูกแทน: มีเวอร์ชันถัดไปที่ส่งแล้วจริงเท่านั้น (ระบบตั้งให้ตอนส่งเวอร์ชันใหม่)
      if new.status = 'superseded' and not exists (
        select 1 from dealer_package_proposals c where c.supersedes_id = old.id and c.status <> 'draft'
      ) then
        raise exception 'proposal_status: ตั้ง "ถูกแทนด้วยฉบับใหม่" เองไม่ได้ — ส่งฉบับใหม่แล้วระบบตั้งให้';
      end if;
      -- หมดอายุ: เลยวันยืนราคาแล้วจริงเท่านั้น · เลยแล้วตอบรับไม่ได้
      if new.status = 'expired' and not (old.valid_until is not null and old.valid_until < วันนี้) then
        raise exception 'proposal_status: ใบ % ยังไม่เลยวันยืนราคา — ยังไม่หมดอายุ', old.proposal_no;
      end if;
      if new.status = 'accepted' and old.valid_until is not null and old.valid_until < วันนี้ then
        raise exception 'proposal_expired: ใบ % เลยวันยืนราคาแล้ว (%) — ตอบรับไม่ได้ ทำฉบับใหม่', old.proposal_no, th_date(old.valid_until);
      end if;
      if new.status in ('rejected', 'expired') and btrim(coalesce(new.close_reason, '')) = '' then
        raise exception 'proposal_close_reason: ปิดใบค่าแฟรนไชส์ (%) ต้องระบุเหตุผล', new.status;
      end if;
      if new.status in ('rejected', 'expired', 'superseded') then new.closed_at := now();
      else new.close_reason := old.close_reason; new.closed_at := old.closed_at;
      end if;
    else
      new.closed_at := old.closed_at;
      if new.close_reason is distinct from old.close_reason then
        raise exception 'proposal_locked: แก้เหตุผลได้เฉพาะตอนปิดใบ';
      end if;
    end if;

    if old.status <> 'draft' and (
         new.region          is distinct from old.region
      or new.province        is distinct from old.province
      or new.amount          is distinct from old.amount
      or new.contract_months is distinct from old.contract_months
      or new.annual_target   is distinct from old.annual_target
      or new.terms           is distinct from old.terms
      or new.note            is distinct from old.note
      or new.proposed_date   is distinct from old.proposed_date
      or new.valid_until     is distinct from old.valid_until
    ) then
      raise exception 'proposal_locked: ใบที่ส่งแล้วแก้เนื้อหาไม่ได้ — ทำฉบับใหม่';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.delete_customer_cascade(p_customer_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_dealer   text := auth_dealer();
  v_active   int;
  v_paths    text[];
  v_quotes   int;
  v_leads    int;
  v_closed   int[];
begin
  if not can_write_sales() then
    raise exception 'forbidden: ไม่มีสิทธิ์ลบลูกค้า';
  end if;

  -- จองแถวลูกค้าไว้ก่อน — กันอีกคนปิดการขายใบใหม่เข้ามาระหว่างที่เรากำลังนับว่า "ลบได้ไหม"
  perform 1 from customers
    where id = p_customer_id and dealer_code = v_dealer
    for update;
  if not found then
    raise exception 'not_found: ไม่พบลูกค้ารายนี้ในสาขา %', v_dealer;
  end if;

  -- ดีลที่ยังขายอยู่ = ห้ามลบ · ข้อความต้องบอกจำนวนให้ตรงกับที่หน้าจอนับ (นับจากภาพเดียวกัน)
  select count(*) into v_active from leads
    where dealer_code = v_dealer and customer_id = p_customer_id
      and status not in ('PAID', 'CANCELLED');
  if v_active > 0 then
    raise exception 'active_deals: ลบลูกค้าไม่ได้ — ยังมีงานขายที่เปิดอยู่ % รายการ', v_active;
  end if;

  -- ดีลที่จบแล้วของลูกค้ารายนี้ (เก็บเลขไว้ใช้ตามล่าใบ/ไฟล์ที่ผูกกับดีลเหล่านั้น)
  select coalesce(array_agg(num_id), '{}') into v_closed from leads
    where dealer_code = v_dealer and customer_id = p_customer_id and num_id is not null;

  -- พาธไฟล์ทั้งหมดที่กำลังจะหายไป — รวบไว้ก่อนลบแถว (ลบแล้วตามหาไม่ได้อีก)
  select coalesce(array_agg(storage_path), '{}') into v_paths from files
    where dealer_code = v_dealer and storage_path is not null
      and ( (source = 'customer' and (record_id = p_customer_id or customer_id = p_customer_id))
         or (source = 'lead' and record_id = any(v_closed)) );

  delete from files
    where dealer_code = v_dealer
      and ( (source = 'customer' and (record_id = p_customer_id or customer_id = p_customer_id))
         or (source = 'lead' and record_id = any(v_closed)) );

  -- ลำดับสำคัญ: ใบ → ดีล → ลูกค้า (FK เป็น restrict ทั้งสองชั้น ลบสลับลำดับจะถูกปฏิเสธ)
  with gone as (
    delete from quotations
      where dealer_code = v_dealer
        and (customer_id = p_customer_id or deal_id = any(v_closed))
      returning 1
  ) select count(*) into v_quotes from gone;

  with gone as (
    delete from leads
      where dealer_code = v_dealer and customer_id = p_customer_id
      returning 1
  ) select count(*) into v_leads from gone;

  -- โน้ตลูกค้าไปเองด้วย FK cascade (0089) ไม่ต้องลบซ้ำที่นี่
  delete from customers where id = p_customer_id and dealer_code = v_dealer;

  return jsonb_build_object(
    'quotations', v_quotes,
    'leads',      v_leads,
    'storagePaths', to_jsonb(v_paths)
  );
end $function$;

CREATE OR REPLACE FUNCTION public.hq_quote_save(p_request_id bigint, p_lines jsonb, p_valid_until date DEFAULT NULL::date, p_note text DEFAULT ''::text)
 RETURNS hq_quotes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r       quote_requests;
  h       hq_quotes;
  v_total numeric := 0;
  v_line  jsonb;
  v_ver   integer;
  v_id    bigint;
begin
  if not can_price_quotes() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่เท่านั้นที่ทำใบ HQ ได้'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then raise exception 'lines_invalid: รายการต้องเป็นรายการสินค้า'; end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if btrim(coalesce(v_line ->> 'name', '')) = '' then raise exception 'lines_invalid: ทุกรายการต้องมีชื่อ'; end if;
    if coalesce((v_line ->> 'qty')::numeric, 0) <= 0 then raise exception 'lines_invalid: จำนวนต้องมากกว่า 0 (%)', v_line ->> 'name'; end if;
    if coalesce((v_line ->> 'unitCost')::numeric, -1) < 0 then raise exception 'lines_invalid: ต้องใส่ต้นทุนต่อหน่วย (%)', v_line ->> 'name'; end if;
    v_total := v_total + round((v_line ->> 'qty')::numeric * (v_line ->> 'unitCost')::numeric, 2);
  end loop;

  select * into r from quote_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found: ไม่พบคำขอนี้'; end if;
  if r.status not in ('new', 'pricing') then
    raise exception 'request_stage: แก้ใบ HQ ได้เฉพาะคำขอที่ยังไม่ได้ส่งใบ (สถานะ %) — ส่งแล้วต้องออกฉบับใหม่', r.status;
  end if;

  -- เริ่มทำราคาโดยยังไม่กดรับเรื่อง = รับเรื่องให้เลย
  if r.status = 'new' then perform quote_request_accept(p_request_id); end if;

  select * into h from hq_quotes where request_id = p_request_id;
  if found then
    update hq_quotes set line_items = p_lines, total_cost = v_total, valid_until = p_valid_until,
                         note = btrim(coalesce(p_note, ''))
     where id = h.id returning * into h;
  else
    -- เวอร์ชัน = ลำดับของคำขอในสายเดียวกัน (ขอแก้ราคาครั้งที่ n = V{n+1})
    select count(*) into v_ver from quote_requests q
     where coalesce(q.root_id, q.id) = coalesce(r.root_id, r.id) and q.id <= r.id;
    v_id := nextval(pg_get_serial_sequence('public.hq_quotes', 'id'));
    insert into hq_quotes (id, request_id, version, quote_no, line_items, total_cost, valid_until, note, created_by)
    values (v_id, p_request_id, v_ver,
            'HQ-' || to_char(now() at time zone 'Asia/Bangkok', 'YYYY') || '-' ||
              lpad(coalesce(r.root_id, r.id)::text, 5, '0') || '-V' || v_ver,
            p_lines, v_total, p_valid_until, btrim(coalesce(p_note, '')), auth.uid())
    returning * into h;
  end if;
  return h;
end $function$;

CREATE OR REPLACE FUNCTION public.quotations_legacy_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  ผูกครั้งแรก boolean;
begin
  if old.hq_quote_id is not null or new.hq_quote_id is not null then return new; end if;
  if pg_trigger_depth() > 1 then return new; end if;
  -- การย้อนของ HQ (ธง + ผู้เรียกเป็น HQ) เปลี่ยนได้เฉพาะสถานะ/เหตุผลของใบเก่าที่ won
  if coalesce(current_setting('pms.revert_won', true), '') = '1' and is_hq() and old.status = 'won'
     and (to_jsonb(new) - 'status' - 'lost_reason') = (to_jsonb(old) - 'status' - 'lost_reason') then
    return new;
  end if;

  ผูกครั้งแรก := old.customer_id is null and new.customer_id is not null
    and (to_jsonb(new) - 'customer_id') = (to_jsonb(old) - 'customer_id');
  if ผูกครั้งแรก then return new; end if;

  if old.status in ('won', 'lost', 'expired') then
    raise exception 'legacy_quote_locked: ใบเสนอราคาเดิม (ไม่มีใบ HQ) ที่ปิดแล้วแก้ไม่ได้ — ทำใบใหม่จากใบ HQ แทน';
  end if;
  if new.revision is distinct from old.revision then
    raise exception 'legacy_quote_locked: ใบเสนอราคาเดิม (ไม่มีใบ HQ) ทำฉบับใหม่ไม่ได้ — ขอราคาจากสำนักงานใหญ่แล้วทำใบใหม่จากใบ HQ';
  end if;
  if new.deal_id is distinct from old.deal_id
     or (old.customer_id is not null and new.customer_id is distinct from old.customer_id) then
    raise exception 'legacy_quote_locked: ใบเสนอราคาเดิม (ไม่มีใบ HQ) ย้ายลูกค้าเป้าหมายหรือลูกค้าที่ผูกอยู่ไม่ได้';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.leads_delete_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return old; end if;   -- service role / งานในฐานข้อมูล
  if exists (select 1 from quote_requests r where r.dealer_code = old.dealer_code and r.lead_num_id = old.num_id)
     or exists (select 1 from quotations q where q.dealer_code = old.dealer_code and q.deal_id = old.num_id) then
    raise exception 'lead_has_quotes: ลูกค้าเป้าหมายนี้มีคำขอใบเสนอราคาหรือใบเสนอราคาแล้ว — ลบไม่ได้ ให้ใช้ "เสียโอกาส" (ปิดการขายไม่สำเร็จ) แทน';
  end if;
  return old;
end $function$;

CREATE OR REPLACE FUNCTION public.quotations_version_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v1 quotations; n int;
  ช่องเดียวกัน boolean;
begin
  if tg_op = 'INSERT' then
    if new.supersedes_id is null then return new; end if;
    select * into v1 from quotations where dealer_code = new.dealer_code and id = new.supersedes_id;
    if not found or v1.status <> 'sent_to_client' then
      raise exception 'quote_version_not_sent: ทำฉบับใหม่ได้เฉพาะจากใบที่ส่งให้ลูกค้าแล้วและลูกค้ายังไม่ตอบ';
    end if;
    n := coalesce(nullif(regexp_replace(coalesce(v1.revision, 'V1'), '[^0-9]', '', 'g'), '')::int, 1) + 1;
    ช่องเดียวกัน := _quote_lock_text(new.customer) is not distinct from _quote_lock_text(v1.customer)
      and _quote_lock_text(new.project) is not distinct from _quote_lock_text(v1.project)
      and _quote_lock_text(new.province) is not distinct from _quote_lock_text(v1.province)
      and _quote_lock_area(new.area) is not distinct from _quote_lock_area(v1.area)
      and _quote_lock_text(new.building_type) is not distinct from _quote_lock_text(v1.building_type)
      and coalesce(new.vat_percent, 0) = coalesce(v1.vat_percent, 0) and coalesce(new.wht_rate, 0) = coalesce(v1.wht_rate, 0);
    if new.status <> 'draft' or new.hq_quote_id is distinct from v1.hq_quote_id or new.deal_id is distinct from v1.deal_id
       or new.revision is distinct from 'V' || n or not ช่องเดียวกัน then
      raise exception 'quote_version_copy: ฉบับใหม่ต้องเป็นใบร่างที่คัดลอกลูกค้า ชื่องาน จังหวัด พื้นที่ ภาษี จากใบเดิม — ใช้ปุ่ม "ทำฉบับใหม่"';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.supersedes_id is distinct from old.supersedes_id then
    raise exception 'quote_version_link_locked: เปลี่ยนใบเดิมที่ฉบับนี้มาแทนไม่ได้';
  end if;
  if old.status = 'superseded' and new.status is distinct from old.status then
    raise exception 'quote_superseded: ใบ % ถูกแทนที่ด้วยฉบับใหม่แล้ว อ่านได้อย่างเดียว — ตอบรับ/ปฏิเสธที่ฉบับล่าสุด', old.id;
  end if;
  if new.status = 'superseded' and old.status is distinct from 'superseded' and pg_trigger_depth() < 2 then
    raise exception 'quote_superseded_manual: ใบจะถูกแทนที่เองเมื่อส่งฉบับใหม่ให้ลูกค้า — ตั้งเองไม่ได้';
  end if;
  if old.supersedes_id is not null then
    if _quote_lock_text(new.customer) is distinct from _quote_lock_text(old.customer)
       or _quote_lock_text(new.project) is distinct from _quote_lock_text(old.project)
       or _quote_lock_text(new.province) is distinct from _quote_lock_text(old.province)
       or _quote_lock_area(new.area) is distinct from _quote_lock_area(old.area)
       or _quote_lock_text(new.building_type) is distinct from _quote_lock_text(old.building_type)
       or coalesce(new.vat_percent, 0) <> coalesce(old.vat_percent, 0) or coalesce(new.wht_rate, 0) <> coalesce(old.wht_rate, 0)   -- ไม่คิดภาษี: ว่าง = 0 (หน้าเว็บบันทึกเป็น 0)
       or new.revision is distinct from old.revision then
      raise exception 'quote_version_locked: ฉบับใหม่แก้ได้เฉพาะ %% — ชื่อลูกค้า ชื่องาน จังหวัด พื้นที่ คัดลอกจากใบเดิม แก้ไม่ได้';
    end if;
    if old.status = 'draft' and new.status = 'sent_to_client' then
      select * into v1 from quotations where dealer_code = old.dealer_code and id = old.supersedes_id for update;
      if v1.status is distinct from 'sent_to_client' then
        raise exception 'quote_version_closed: ใบเดิม % ปิดไปแล้ว (%) ส่งฉบับใหม่ไม่ได้', old.supersedes_id, coalesce(v1.status::text, 'ไม่พบ');
      end if;
    end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.leads_status_one_path()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare ระบบ boolean := coalesce(current_setting('pms.flow_sync', true), '') = '1';
begin
  if coalesce(auth.role(), '') <> 'authenticated' and not ระบบ then return new; end if;   -- service role / งานในฐาน

  -- ข้อ 3 ปิดสำเร็จต้องมีใบที่ตอบรับ (ทุกบทบาท รวมคำสั่งของระบบ)
  if new.status = 'PAID' and (tg_op = 'INSERT' or old.status is distinct from 'PAID') and not exists (
       select 1 from quotations q
        where q.dealer_code = new.dealer_code and q.status = 'won'
          and (q.deal_id = new.num_id or (q.deal_id is null and q.customer = new.company))) then
    raise exception 'lead_won_needs_accepted_quote: ปิดการขายสำเร็จได้ทางเดียว — กด "ลูกค้าตอบรับ" ที่ใบเสนอราคาในแผงลูกค้าเป้าหมาย';
  end if;

  -- ลีดใหม่ = ขั้นข้อมูลลูกค้าเสมอ ฐานตั้งเอง (บอสสั่ง 28 ต.ค. 69) — ผู้ใช้ทุกบทบาท (รวม HQ)
  --   ส่งสถานะในขั้นข้อมูลลูกค้ามา (ติดต่อแล้ว/รวบรวมความต้องการ · ไคลเอนต์รุ่นเก่า) = ฐานเก็บเป็นสถานะตั้งต้น WAITING
  --   ส่งสถานะขั้นอื่นมา = ปฏิเสธ (หน้าเว็บตั้งขั้นเองไม่ได้)
  if tg_op = 'INSERT' and not ระบบ then
    if new.status is null or new.status in ('WAITING', 'BULLET') then
      new.status := 'WAITING';
    else
      raise exception 'lead_new_status_locked: ลูกค้าเป้าหมายใหม่เริ่มที่ขั้น "ข้อมูลลูกค้า" เสมอ — ระบบตั้งให้เอง ขั้นอื่นระบบเลื่อนให้ตามคำขอใบเสนอราคาและใบเสนอราคา';
    end if;
  end if;

  if ระบบ or is_hq() then return new; end if;

  -- ข้อ 1 ดีลเลอร์
  if tg_op = 'INSERT' then return new; end if;
  if new.status is not distinct from old.status then return new; end if;
  if new.status <> 'CANCELLED' then
    raise exception 'lead_status_one_path: เปลี่ยนสถานะเองได้เฉพาะ "ปิดไม่สำเร็จ" ที่กล่องขั้นต่อไป — ขั้นอื่นระบบเลื่อนให้เองตามคำขอใบเสนอราคาและใบเสนอราคา';
  end if;
  -- ข้อ 2 มีใบที่ส่งให้ลูกค้าอยู่ → ปิดที่ใบ
  if exists (select 1 from quotations q where q.dealer_code = new.dealer_code and q.deal_id = new.num_id and q.status = 'sent_to_client') then
    raise exception 'lead_has_sent_quote: มีใบเสนอราคาที่ส่งให้ลูกค้าอยู่ — ลูกค้าไม่เอา ให้กด "ลูกค้าปฏิเสธ" ที่ใบ (ระบบปิดลูกค้าเป้าหมายให้เอง)';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public._proposal_status_th(s text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case s when 'draft' then 'ร่าง' when 'sent' then 'ส่งแล้ว' when 'accepted' then 'ตอบรับ' when 'rejected' then 'ปฏิเสธ'
    when 'expired' then 'หมดอายุ' when 'superseded' then 'ถูกแทนด้วยฉบับใหม่' else s end;
$function$;

CREATE OR REPLACE FUNCTION public.quote_requests_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare h hq_quotes; v_files integer;
begin
  if tg_op = 'INSERT' then
    perform _notify(case when new.supersedes_id is not null then 'request_reprice' else 'request_new' end, null,
      new.id::text, _quote_request_vars(new), 'quote_requests', new.id::text, _quote_request_mail_lines(new));
  elsif new.status = 'quoted' and old.status in ('new', 'pricing') then          -- HQ ส่งใบ (ไม่นับย้อนการตอบรับ won → quoted)
    select * into h from hq_quotes where request_id = new.id;
    select count(*) into v_files from quote_files where hq_quote_id = h.id and status = 'ready';   -- ใบ 0273
    perform _notify('hq_quote_sent', new.dealer_code, new.id::text, _quote_request_vars(new) || jsonb_build_object('files', v_files::text),
      'quote_requests', new.id::text,
      'เลขใบ HQ: ' || coalesce(h.quote_no, '—') || ' (ฉบับ ' || coalesce(h.version::text, '—') || ')' || E'\n'
        || 'ยืนราคาถึง: ' || coalesce(th_date(h.valid_until), '—') || E'\n'
        || 'ไฟล์แนบจาก HQ: ' || v_files || ' ไฟล์ (ดาวน์โหลดได้ในแผงลูกค้าเป้าหมาย › ราคาจากสำนักงานใหญ่)');
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then      -- H6 ดีลเลอร์ยกเลิกคำขอ (คืนตาม FLOW D3x · 21 ต.ค. 69)
    perform _notify('request_cancelled', null, new.id::text,
      _quote_request_vars(new) || jsonb_build_object('reason', new.cancel_reason), 'quote_requests', new.id::text,
      _quote_request_mail_lines(new));
  elsif new.status = 'won' and old.status is distinct from 'won' then             -- ลูกค้าตอบรับ (ตอบรับซ้ำหลังย้อน = เรื่องใหม่)
    select * into h from hq_quotes where request_id = new.id;
    perform _notify('customer_accepted', null, new.id::text || ':' || extract(epoch from coalesce(new.closed_at, now()))::bigint,
      _quote_request_vars(new) || jsonb_build_object('quote_no', h.quote_no), 'quote_requests', new.id::text,
      _quote_request_mail_lines(new));
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public._material_import_block(p_batch bigint)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when b.cancelled_at is not null then 'ยกเลิกไปแล้ว'
    when exists (select 1 from material_import_changes c
                   join quote_requests r on r.submitted_at > b.created_at
                    and r.estimate_items @> jsonb_build_array(jsonb_build_object('templateId', c.template_id))
                  where c.batch_id = b.id)
      then 'มีคำขอใบเสนอราคาใช้วัสดุในชุดนี้แล้ว'
    when exists (select 1 from material_import_changes c left join material_templates t on t.id = c.template_id
                  where c.batch_id = b.id and (t.id is null or t.unit_price is distinct from c.new_price))
      then 'วัสดุในชุดนี้ถูกแก้ราคาหรือลบหลังนำเข้า'
    end
    from material_import_batches b where b.id = p_batch
$function$;

CREATE OR REPLACE FUNCTION public.quote_requests_no_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(current_setting('pms.quote_request_delete', true), '') = 'test'
     and (_quote_request_is_test_row(old.dealer_code) or to_regclass('public._pms_test_database') is not null) then return old; end if;
  raise exception 'request_no_delete: คำขอใบเสนอราคา % ลบไม่ได้ — ยกเลิกแทน (สถานะ "ยกเลิกแล้ว" + เหตุผล)', old.request_no;
end $function$;

CREATE OR REPLACE FUNCTION public.leads_old_flow_retired()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare เก่า jsonb := '{"FOLLOWUP":"ติดตามผล","NEGO":"เจรจาต่อรอง"}';
begin
  if new.status::text in ('FOLLOWUP', 'NEGO') then
    raise exception 'lead_status_retired: สถานะ "%" เลิกใช้แล้ว (FLOW 4 ขั้น) — ลูกค้าเป้าหมายที่ส่งใบเสนอราคาให้ลูกค้าแล้วอยู่ขั้น "เสนอราคาลูกค้า" จนลูกค้าตอบรับหรือปฏิเสธที่ใบ',
      เก่า ->> new.status::text;
  end if;
  if new.status_before_paid::text in ('FOLLOWUP', 'NEGO') then
    raise exception 'lead_status_retired: สถานะก่อนปิด "%" เลิกใช้แล้ว (FLOW 4 ขั้น) — ใช้ "เสนอราคา"', เก่า ->> new.status_before_paid::text;
  end if;
  if (tg_op = 'INSERT' or new.tasks is distinct from old.tasks) and _lead_tasks_has_old_flow(new.tasks) then
    raise exception 'lead_task_retired: รายการเตือนแบบเก่า (ติดตามผล/เจรจาต่อรอง/ปิดการขาย/ส่งแม่แบบ หรือผูกสถานะลูกค้าเป้าหมายแบบเก่า) เลิกใช้แล้ว — งานในแต่ละขั้นมีตามแม่แบบ 4 ขั้นเท่านั้น';
  end if;
  return new;
end $function$;
