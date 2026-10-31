-- ── ใบ 0269: ลบช่องแพ็กเกจออกจากฐานถาวร (รอบที่ 2 · บอสสั่ง 30 ต.ค. 69 + เริ่มรอบ 1 พ.ย. 69) ─────────────────────────
-- รอบ 1 (0267 · ขึ้นเว็บแล้ว 1ef129c) ยกเลิกบังคับ + เอาออกจากทุกหน้าจอ · รอบนี้ลบช่องทิ้ง — ลบเฉพาะช่องแพ็กเกจ ห้ามแตะตารางอื่น
--   ช่องที่ลบ: dealers.package · dealer_package_proposals.package (+ ข้อบังคับค่าของช่อง)
--   ที่ต้องแก้ตามเพราะอ้างช่องนี้ (ไล่จากฐานจริงรุ่น 0268 ด้วย pg_proc/pg_views): ตัวบันทึกใบค่าแฟรนไชส์ · ตัวดักก่อนเขียนใบ ·
--     ทำฉบับใหม่ · ตัวบันทึกดีลเลอร์ · แผงดีลเลอร์ (hq_dealer_panel) · save_dealers · มุมมอง dealers_directory
--   ฟังก์ชันคัดจากนิยามล่าสุดบนฐาน แก้เฉพาะบรรทัดที่อ้างแพ็กเกจ · ชื่อตาราง dealer_package_proposals คงเดิม (เปลี่ยนชื่อ = แตะตาราง)
--   ค่าตั้ง "packages" ใน hq_recruit_settings (JSON) ไม่ใช่ช่อง — ไม่แตะ (หน้าจอไม่อ่านแล้ว)
-- ข้อทดสอบ: supabase/tests/package_dropped.sql · tests/unit/no-package-column.test.ts (ทั้ง 2 แอปไม่มีโค้ดอ้างช่องนี้)

CREATE OR REPLACE FUNCTION public.dealer_package_proposals_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      perform _audit_hq('ออกใบค่าแฟรนไชส์', เลข || ' · ' || ราย);
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
end $function$;

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
        raise exception 'proposal_draft_exists: ใบ % มีร่างเวอร์ชันใหม่ค้างอยู่แล้ว — แก้ร่างนั้นต่อ', p.proposal_no;
      end if;
      if exists (select 1 from dealer_package_proposals c where c.supersedes_id = p.id) then
        raise exception 'proposal_not_latest: ใบ % มีเวอร์ชันใหม่กว่าแล้ว — ทำต่อจากใบล่าสุด', p.proposal_no;
      end if;
      if p.status not in ('sent', 'rejected', 'expired') then
        raise exception 'proposal_status: ทำเวอร์ชันใหม่ได้เฉพาะใบที่ส่งแล้ว/ปฏิเสธ/หมดอายุ (ใบ % เป็น %)', p.proposal_no, p.status;
      end if;
      if new.status <> 'draft' then
        raise exception 'proposal_status: เวอร์ชันใหม่ต้องเริ่มจากร่าง';
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
        raise exception 'proposal_status: ตั้ง "ถูกแทนด้วยเวอร์ชันใหม่" เองไม่ได้ — ส่งเวอร์ชันใหม่แล้วระบบตั้งให้';
      end if;
      -- หมดอายุ: เลยวันยืนราคาแล้วจริงเท่านั้น · เลยแล้วตอบรับไม่ได้
      if new.status = 'expired' and not (old.valid_until is not null and old.valid_until < วันนี้) then
        raise exception 'proposal_status: ใบ % ยังไม่เลยวันยืนราคา — ยังไม่หมดอายุ', old.proposal_no;
      end if;
      if new.status = 'accepted' and old.valid_until is not null and old.valid_until < วันนี้ then
        raise exception 'proposal_expired: ใบ % เลยวันยืนราคาแล้ว (%) — ตอบรับไม่ได้ ทำเวอร์ชันใหม่', old.proposal_no, th_date(old.valid_until);
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
      raise exception 'proposal_locked: ใบที่ส่งแล้วแก้เนื้อหาไม่ได้ — ทำเวอร์ชันใหม่';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.dealer_proposal_new_version(p_id bigint)
 RETURNS dealer_package_proposals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p public.dealer_package_proposals;
  r public.dealer_package_proposals;
begin
  if not can_write_master() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่ที่ทำใบค่าแฟรนไชส์ได้'; end if;
  select * into p from dealer_package_proposals where id = p_id;
  if not found then raise exception 'proposal_not_found: ไม่พบใบค่าแฟรนไชส์ %', p_id; end if;
  insert into dealer_package_proposals (prospect_id, supersedes_id, region, province, amount, terms,
    proposed_date, valid_until, contract_months, annual_target, note, status)
  values (p.prospect_id, p.id, p.region, p.province, p.amount, p.terms,
    (now() at time zone 'Asia/Bangkok')::date,
    case when p.valid_until is null then null
         else (now() at time zone 'Asia/Bangkok')::date + greatest(p.valid_until - p.proposed_date, 0) end,
    p.contract_months, p.annual_target, p.note, 'draft')
  returning * into r;
  return r;
end $function$;

CREATE OR REPLACE FUNCTION public.dealers_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ช่อง constant text[] := array['name', 'province', 'region', 'revenue_target', 'target_manual'];
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
end $function$;

CREATE OR REPLACE FUNCTION public.hq_dealer_panel(p_code text, p_activity_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  d record; ข้อมูล jsonb; ใบ record; ชำระ numeric; แฟรนไชส์ jsonb;
begin
  if not is_hq() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  select * into d from dealers where code = p_code;
  if not found or p_code = 'HQ' then return null; end if;
  ข้อมูล := coalesce((select s.issuer from dealer_settings s where s.dealer_code = p_code), '{}'::jsonb);

  select pr.id, pr.proposal_no, coalesce(pr.amount, 0) as ยอด, pr.payment_due_on
    into ใบ
    from dealer_package_proposals pr
   where d.prospect_id is not null and pr.prospect_id = d.prospect_id and pr.status = 'accepted'
   order by pr.id desc limit 1;
  if found then   -- ไม่มีใบ = ไม่แตะฟิลด์ของ ใบ (record ยังไม่ถูกกำหนด)
    ชำระ := (select coalesce(sum(amount), 0) from dealer_proposal_payments where proposal_id = ใบ.id and cancelled_at is null);
    แฟรนไชส์ := jsonb_build_object('proposalId', ใบ.id, 'proposalNo', ใบ.proposal_no, 'dueOn', ใบ.payment_due_on,
      'payment', case when ชำระ >= ใบ.ยอด then 'paid' when ชำระ > 0 then 'partial' else 'unpaid' end);
  end if;

  return jsonb_build_object(
    'code', d.code, 'name', d.name, 'province', d.province, 'region', d.region, 'status', d.status,
    'counts', jsonb_build_object(
      'openLeads',         (select count(*) from leads where dealer_code = p_code and status not in ('PAID', 'CANCELLED')),
      'requestsWaitingHq', (select count(*) from quote_requests where dealer_code = p_code and status in ('new', 'pricing')),
      'quotesAwaiting',    (select count(*) from quotations where dealer_code = p_code and status = 'sent_to_client'),
      'customers',         (select count(*) from customers where dealer_code = p_code)),
    'lastLoginAt', (select max(u.last_sign_in_at) from profiles p join auth.users u on u.id = p.id where p.dealer_code = p_code),
    'lastSalesAt', (select max(x) from (
        select greatest(l.created_at, (l.last_contact_at::timestamp at time zone 'Asia/Bangkok'), (l.created_date::timestamp at time zone 'Asia/Bangkok')) as x
          from leads l where l.dealer_code = p_code
        union all select greatest(q.created_at, q.updated_at) from quotations q where q.dealer_code = p_code
        union all select r.submitted_at from quote_requests r where r.dealer_code = p_code) t),
    'issuer', jsonb_build_object('company', coalesce(ข้อมูล ->> 'company', ''), 'address', coalesce(ข้อมูล ->> 'address', ''),
                                 'phone', coalesce(ข้อมูล ->> 'phone', ''), 'taxId', coalesce(ข้อมูล ->> 'taxId', ''),
                                 'missing', nullif(_issuer_missing(ข้อมูล), '')),
    'contact', (select jsonb_build_object('name', p.name, 'email', p.contact_email, 'phone', p.phone)
                  from profiles p where p.dealer_code = p_code and p.role = 'DEALER_ADMIN' order by p.created_at limit 1),
    'franchise', แฟรนไชส์,
    'activity', coalesce((select jsonb_agg(jsonb_build_object('at', a.at, 'action', a.action, 'target', a.target, 'user', a."user") order by a.at desc, a.id desc)
                            from (select * from audit_log where target like p_code || ' · %' or target = p_code
                                   order by at desc, id desc limit greatest(coalesce(p_activity_limit, 10), 1)) a), '[]'::jsonb)
  );
end $function$;

CREATE OR REPLACE FUNCTION public.save_dealers(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r jsonb;
  touched integer := 0;
  n integer;
begin
  if not can_write_master() then
    raise exception 'forbidden: no permission to write dealers';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    update dealers set
      name           = r->>'name',
      province       = r->>'province',
      region         = r->>'region',
      status         = coalesce(r->>'status', 'active')::dealer_status,
      revenue_target = greatest(coalesce(nullif(r->>'revenue_target', '')::numeric, 0), 0),
      target_manual  = case when r ? 'target_manual' then coalesce(nullif(r->>'target_manual', '')::boolean, false) else target_manual end
    where code = r->>'code';
    get diagnostics n = row_count;
    touched := touched + n;
  end loop;

  return touched;
end $function$;

-- มุมมองดีลเลอร์ (0220) — ตัดช่อง package · ลบช่องของมุมมองด้วย create or replace ไม่ได้ จึง drop แล้วสร้างใหม่ + สิทธิ์ตาม 0220
drop view public.dealers_directory;
create view public.dealers_directory as
select
  code, name, province, region, status, created_at,
  case when is_hq() or code = auth_dealer() then revenue_target else null end as revenue_target,
  target_manual
from public.dealers
where is_hq() or code = auth_dealer() or coalesce(auth.role(), '') = 'service_role';
revoke all on public.dealers_directory from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.dealers_directory from anon, authenticated, service_role;
grant select on public.dealers_directory to authenticated, service_role;

-- ลบช่องแพ็กเกจ (ข้อบังคับค่าของช่องหายไปพร้อมช่อง)
alter table public.dealers drop column package;
alter table public.dealer_package_proposals drop column package;
