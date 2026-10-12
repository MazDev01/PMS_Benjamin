-- ── เปลี่ยนคำเรียกในข้อความที่ฐานข้อมูลเขียนเอง ให้ตรงกับ Flow ใหม่ ──────────────────────────
--
-- บอสสั่ง 12 ต.ค. 69 (เลือกทีละคำ): คำเรียกเดิมของ "ดีลเลอร์" และ "ใบค่าแฟรนไชส์" เปลี่ยนทั้งระบบ
--   · ลูกค้าเป้าหมาย / ลูกค้าเป้าหมาย (HQ) คงเดิม
--
-- หน้าจอเปลี่ยนในโค้ดแล้ว เหลือข้อความที่ตัวดักของฐานข้อมูลเขียนลงประวัติ/แจ้งกลับผู้ใช้ 5 ฟังก์ชัน
-- ใบนี้คือฟังก์ชันชุดเดิมทุกบรรทัด เปลี่ยนเฉพาะ "คำ" — ไม่แตะกติกา (สร้างจากตัวที่ใช้งานอยู่ ไม่ได้พิมพ์ใหม่)
--
-- ⚠️ ประวัติที่บันทึกไปแล้ว (dealer_prospect_activities · audit_log) ยังเป็นคำเดิม — ประวัติแก้ย้อนหลังไม่ได้ ตั้งใจ

CREATE OR REPLACE FUNCTION public.dealer_package_proposals_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  y int;
  n int;
begin
  if tg_op = 'INSERT' then
    y := extract(year from (now() at time zone 'Asia/Bangkok'))::int;
    insert into dealer_proposal_counters(year, next_no) values (y, 2)
      on conflict (year) do update set next_no = dealer_proposal_counters.next_no + 1
      returning next_no - 1 into n;
    new.proposal_no := 'DP-' || y || '-' || lpad(n::text, 4, '0');
  else
    new.id := old.id;
    new.prospect_id := old.prospect_id;
    new.proposal_no := old.proposal_no;
    new.created_at := old.created_at;

    if new.status is distinct from old.status and not (
         (old.status = 'draft' and new.status = 'sent')
      or (old.status = 'sent'  and new.status in ('accepted', 'rejected'))
    ) then
      raise exception 'proposal_status: เปลี่ยนสถานะใบค่าแฟรนไชส์จาก % เป็น % ไม่ได้', old.status, new.status;
    end if;

    if old.status <> 'draft' and (
         new.package         is distinct from old.package
      or new.region          is distinct from old.region
      or new.province        is distinct from old.province
      or new.amount          is distinct from old.amount
      or new.contract_months is distinct from old.contract_months
      or new.annual_target   is distinct from old.annual_target
      or new.terms           is distinct from old.terms
      or new.proposed_date   is distinct from old.proposed_date
      or new.valid_until     is distinct from old.valid_until
    ) then
      raise exception 'proposal_locked: ใบที่ส่งแล้วแก้เนื้อหาไม่ได้ — เปลี่ยนได้แค่สถานะ';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.dealer_package_proposals_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ป้าย text := case new.status when 'draft' then 'ร่าง' when 'sent' then 'ส่งแล้ว'
                               when 'accepted' then 'ตอบรับ' when 'rejected' then 'ปฏิเสธ' else new.status end;
begin
  if tg_op = 'INSERT' then
    insert into public.dealer_prospect_activities (prospect_id, kind, body)
    values (new.prospect_id, 'proposal', 'ออกใบค่าแฟรนไชส์ ' || new.proposal_no || ' · ' || ป้าย);
  elsif new.status is distinct from old.status then
    insert into public.dealer_prospect_activities (prospect_id, kind, body)
    values (new.prospect_id, 'proposal', 'ใบค่าแฟรนไชส์ ' || new.proposal_no || ' · ' || ป้าย);
  else
    return null;
  end if;

  if new.status = 'sent' then
    update public.dealer_prospects set status = 'considering'
    where id = new.prospect_id and status = 'meeting';
  elsif tg_op = 'UPDATE' and new.status = 'rejected' and not exists (
    select 1 from public.dealer_package_proposals
    where prospect_id = new.prospect_id and id <> new.id and status in ('sent', 'accepted')
  ) then
    perform set_config('app.prospect_step_note',
      'ใบค่าแฟรนไชส์ ' || coalesce(new.proposal_no, '') || ' ถูกปฏิเสธ → กลับไปนัดคุยแล้ว', true);
    update public.dealer_prospects set status = 'meeting'
    where id = new.prospect_id and status = 'considering';
    perform set_config('app.prospect_step_note', '', true);
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.dealer_prospects_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  เหตุผล text := nullif(current_setting('app.prospect_step_note', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.dealer_prospect_activities (prospect_id, kind, body, to_status)
    values (new.id, 'created',
            'เพิ่มลูกค้าเป้าหมาย' || case when new.status <> 'new' then ' · ขั้น ' || prospect_status_th(new.status) else '' end,
            new.status);
  elsif new.status is distinct from old.status then
    insert into public.dealer_prospect_activities (prospect_id, kind, body, from_status, to_status)
    values (new.id, 'status',
            case
              when เหตุผล is not null then เหตุผล
              when new.status = 'won'  then 'เป็นดีลเลอร์แล้ว · รหัส ' || coalesce(new.dealer_code, '—')
              when new.status = 'lost' then 'ปิดว่าไม่สำเร็จ' || coalesce(' · เหตุผล: ' || nullif(btrim(new.lost_reason), ''), '')
              when old.status = 'lost' then 'เปิดติดตามใหม่ · ' || prospect_status_th(new.status)
              else prospect_status_th(old.status) || ' → ' || prospect_status_th(new.status)
            end,
            old.status, new.status);
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.dealer_prospects_stage_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a int := prospect_stage_no(old.status);
  b int := prospect_stage_no(new.status);
begin
  -- ติดต่อล่าสุดตั้งได้จากบันทึกการติดต่อทางเดียว — แอปส่งทั้งแถวกลับมา ห้ามทับค่าที่ตัวดักตั้งไว้
  if current_setting('app.prospect_contact', true) is distinct from 'on' then
    new.last_contact_at := old.last_contact_at;
  end if;

  if new.status is not distinct from old.status then return new; end if;

  if old.status = 'won' then
    raise exception 'prospect_stage: รายนี้เป็นดีลเลอร์แล้ว เปลี่ยนขั้นไม่ได้';
  end if;
  if new.status = 'won' then
    if new.dealer_code is null then
      raise exception 'prospect_stage: สถานะ “เป็นดีลเลอร์แล้ว” ต้องผูกกับดีลเลอร์';
    end if;
    return new;
  end if;
  if new.status = 'lost' then return new; end if;

  -- จากขั้นติดตามไปขั้นติดตาม: ทีละหนึ่งขั้นเท่านั้น (เปิดติดตามใหม่จากไม่สำเร็จ ไปขั้นเดิมได้เลย)
  if old.status <> 'lost' and abs(b - a) <> 1 then
    raise exception 'prospect_stage: เลื่อนขั้นได้ทีละขั้น ห้ามข้ามขั้น (% → %)',
      prospect_status_th(old.status), prospect_status_th(new.status);
  end if;
  if new.status = 'considering' and not exists (
    select 1 from public.dealer_package_proposals
    where prospect_id = new.id and status in ('sent', 'accepted')
  ) then
    raise exception 'prospect_stage: ต้องส่งใบค่าแฟรนไชส์ก่อน ถึงจะเป็น “รอตัดสินใจ”';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.prospect_status_th(s text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case s
    when 'new' then 'รอติดต่อ'           when 'contacted' then 'ติดต่อแล้ว'
    when 'profile_sent' then 'ส่งข้อมูลบริษัทแล้ว' when 'meeting' then 'นัดคุยแล้ว'
    when 'considering' then 'รอตัดสินใจ'  when 'won' then 'เป็นดีลเลอร์แล้ว'
    when 'lost' then 'ไม่สำเร็จ'          else s end
$function$
;

