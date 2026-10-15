-- Benjamin PMS — ด่าน 4 · ใบค่าแฟรนไชส์: ส่งแล้วแก้ไม่ได้ ต้องทำเวอร์ชันใหม่ · ปฏิเสธ/หมดอายุ → ปิดพร้อมเหตุผล
--
-- FLOW ช่วงที่ 1 (หาดีลเลอร์ใหม่): ใบค่าแฟรนไชส์ → ตกลง + ชำระ | ปฏิเสธหรือหมดอายุ → ปิด พร้อมเหตุผล
-- ข้อตกลงกับบอส 15 ต.ค. 69: แยกจากระบบใบ HQ · ใช้ร่วมแค่หลัก "ส่งแล้วแก้ไม่ได้ ต้องทำเวอร์ชันใหม่" เป็นกฎของตัวเอง
--
-- ของเดิม (0172/0173): ร่าง → ส่ง → ตอบรับ/ปฏิเสธ · ส่งแล้วแก้เนื้อหาไม่ได้ — แต่ไม่มีทางออก (แก้ไม่ได้ และทำใหม่ก็ไม่ผูกกับใบเดิม)
-- เพิ่ม:
--   • เวอร์ชัน: version + supersedes_id · คำสั่ง dealer_proposal_new_version (HQ) คัดลอกเป็นร่างเวอร์ชันถัดไป เลขใบ = เลขเดิม-V<n>
--       ทำได้จากใบล่าสุดของสาย ที่ส่งแล้ว/ปฏิเสธ/หมดอายุ · มีร่างเวอร์ชันใหม่ค้างอยู่ = ทำซ้ำไม่ได้
--       ส่งเวอร์ชันใหม่ → ใบก่อนหน้าที่ยังเปิดอยู่ (ส่งแล้ว) = superseded อัตโนมัติ
--   • ปิดพร้อมเหตุผล: ปฏิเสธ/หมดอายุต้องมี close_reason · เก็บ closed_at · ปิดแล้วแก้เหตุผลไม่ได้
--   • หมดอายุ: งานตั้งเวลาปิดใบที่เลยวันยืนราคา · เลยวันยืนราคาแล้วตอบรับไม่ได้
--   • ส่งแล้วแก้ไม่ได้: เพิ่มหมายเหตุเข้ากลุ่มเนื้อหาที่ล็อก
-- ทุกเงื่อนไขตรวจจากข้อมูลจริง ไม่ใช้ธงชั่วคราว (ไม่มีช่องให้ผู้สั่ง SQL ตั้งธงเองแล้วข้ามด่าน — ดู 0205)
-- ข้อทดสอบ: supabase/tests/franchise_proposal_rules.sql

-- ═══ 1. คอลัมน์ + สถานะ ═══════════════════════════════════════════════════════════════════
alter table public.dealer_package_proposals
  add column if not exists version       int not null default 1,
  add column if not exists supersedes_id bigint references public.dealer_package_proposals(id),
  add column if not exists close_reason  text,
  add column if not exists closed_at     timestamptz;
comment on column public.dealer_package_proposals.version is 'เวอร์ชันของใบในสายเดียวกัน (1 = ใบแรก)';
comment on column public.dealer_package_proposals.supersedes_id is 'ใบเวอร์ชันก่อนหน้า (ทำเวอร์ชันใหม่จากใบนี้)';
comment on column public.dealer_package_proposals.close_reason is 'เหตุผลที่ปิด — ปฏิเสธ/หมดอายุต้องมี · ถูกแทนด้วยเวอร์ชันใหม่ระบบใส่ให้';
create index if not exists dealer_package_proposals_supersedes_idx on public.dealer_package_proposals (supersedes_id);

alter table public.dealer_package_proposals drop constraint if exists dealer_package_proposals_status_check;
alter table public.dealer_package_proposals add constraint dealer_package_proposals_status_check
  check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired', 'superseded'));

-- ═══ 2. กฎตอนเขียน ═══════════════════════════════════════════════════════════════════════
create or replace function public.dealer_package_proposals_before_write() returns trigger
  language plpgsql security definer set search_path = public as $$
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
        raise exception 'proposal_expired: ใบ % เลยวันยืนราคาแล้ว (%) — ตอบรับไม่ได้ ทำเวอร์ชันใหม่', old.proposal_no, to_char(old.valid_until, 'DD/MM/YYYY');
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
         new.package         is distinct from old.package
      or new.region          is distinct from old.region
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
end $$;

-- ═══ 3. ส่งเวอร์ชันใหม่ → ใบก่อนหน้าที่ยังเปิดอยู่ = ถูกแทน ═════════════════════════════════════
create or replace function public.dealer_package_proposals_supersede() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.supersedes_id is not null and old.status = 'draft' and new.status = 'sent' then
    update dealer_package_proposals
       set status = 'superseded', close_reason = 'แทนด้วย ' || new.proposal_no
     where id in (
       with recursive สาย as (
         select id, supersedes_id from dealer_package_proposals where id = new.supersedes_id
         union all
         select p.id, p.supersedes_id from dealer_package_proposals p join สาย s on p.id = s.supersedes_id)
       select id from สาย)
       and status = 'sent';
  end if;
  return null;
end $$;
revoke all on function public.dealer_package_proposals_supersede() from public, anon, authenticated, service_role;
drop trigger if exists dealer_package_proposals_supersede on public.dealer_package_proposals;
create trigger dealer_package_proposals_supersede after update of status on public.dealer_package_proposals
  for each row execute function public.dealer_package_proposals_supersede();

-- ═══ 4. คำสั่งทำเวอร์ชันใหม่ (HQ) ════════════════════════════════════════════════════════════
create or replace function public.dealer_proposal_new_version(p_id bigint) returns public.dealer_package_proposals
  language plpgsql security definer set search_path = public as $$
declare
  p public.dealer_package_proposals;
  r public.dealer_package_proposals;
begin
  if not can_write_master() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่ที่ทำใบค่าแฟรนไชส์ได้'; end if;
  select * into p from dealer_package_proposals where id = p_id;
  if not found then raise exception 'proposal_not_found: ไม่พบใบค่าแฟรนไชส์ %', p_id; end if;
  insert into dealer_package_proposals (prospect_id, supersedes_id, package, region, province, amount, terms,
    proposed_date, valid_until, contract_months, annual_target, note, status)
  values (p.prospect_id, p.id, p.package, p.region, p.province, p.amount, p.terms,
    (now() at time zone 'Asia/Bangkok')::date,
    case when p.valid_until is null then null
         else (now() at time zone 'Asia/Bangkok')::date + greatest(p.valid_until - p.proposed_date, 0) end,
    p.contract_months, p.annual_target, p.note, 'draft')
  returning * into r;
  return r;
end $$;
revoke all on function public.dealer_proposal_new_version(bigint) from public, anon, authenticated, service_role;
grant execute on function public.dealer_proposal_new_version(bigint) to authenticated;

-- ═══ 5. หมดอายุอัตโนมัติ ══════════════════════════════════════════════════════════════════
create or replace function public.expire_dealer_proposals() returns integer
  language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update dealer_package_proposals
     set status = 'expired', close_reason = 'หมดอายุ — เลยวันยืนราคา ' || to_char(valid_until, 'DD/MM/YYYY')
   where status = 'sent' and valid_until is not null and valid_until < (now() at time zone 'Asia/Bangkok')::date;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.expire_dealer_proposals() from public, anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'expire-dealer-proposals') then
    perform cron.unschedule('expire-dealer-proposals');
  end if;
  perform cron.schedule('expire-dealer-proposals', '10 * * * *', 'select public.expire_dealer_proposals()');
end $$;

-- ═══ 6. ประวัติผู้สนใจ: ป้ายสถานะใหม่ · หมดอายุถือเหมือนปฏิเสธ (กลับไปนัดคุยถ้าไม่มีใบอื่นเปิดอยู่) ═══════════
create or replace function public.dealer_package_proposals_log() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  ป้าย text := case new.status when 'draft' then 'ร่าง' when 'sent' then 'ส่งแล้ว'
                               when 'accepted' then 'ตอบรับ' when 'rejected' then 'ปฏิเสธ'
                               when 'expired' then 'หมดอายุ' when 'superseded' then 'ถูกแทนด้วยเวอร์ชันใหม่'
                               else new.status end;
begin
  if tg_op = 'INSERT' then
    insert into public.dealer_prospect_activities (prospect_id, kind, body)
    values (new.prospect_id, 'proposal', 'ออกใบค่าแฟรนไชส์ ' || new.proposal_no || ' · ' || ป้าย);
  elsif new.status is distinct from old.status then
    insert into public.dealer_prospect_activities (prospect_id, kind, body)
    values (new.prospect_id, 'proposal', 'ใบค่าแฟรนไชส์ ' || new.proposal_no || ' · ' || ป้าย
      || case when new.status in ('rejected', 'expired', 'superseded') and coalesce(new.close_reason, '') <> ''
              then ' · ' || new.close_reason else '' end);
  else
    return null;
  end if;

  if new.status = 'sent' then
    update public.dealer_prospects set status = 'considering'
    where id = new.prospect_id and status = 'meeting';
  elsif tg_op = 'UPDATE' and new.status in ('rejected', 'expired') and not exists (
    select 1 from public.dealer_package_proposals
    where prospect_id = new.prospect_id and id <> new.id and status in ('draft', 'sent', 'accepted')
  ) then
    perform set_config('app.prospect_step_note',
      'ใบค่าแฟรนไชส์ ' || coalesce(new.proposal_no, '') || ' ' || case new.status when 'rejected' then 'ถูกปฏิเสธ' else ป้าย end
        || ' → กลับไปนัดคุยแล้ว', true);
    update public.dealer_prospects set status = 'meeting'
    where id = new.prospect_id and status = 'considering';
    perform set_config('app.prospect_step_note', '', true);
  end if;
  return null;
end $$;
