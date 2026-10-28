-- ── ใบ 0252: ใบที่ลูกค้าตอบรับแล้ว = ลีดปิดการขายสำเร็จเสมอ (บอสสั่ง 28 ต.ค. 69 · บั๊ก L037) ─────────────────────────────
--
-- อาการ: แผงลีดขึ้น "ปิดการขายสำเร็จ · ลูกค้าตอบรับแล้ว" (กล่องขั้นต่อไปอ่านจากใบ) แต่แถบ 5 ขั้น/ป้ายในตารางยังเป็น "5 รอลูกค้าตอบ"
--   (อ่านจากสถานะลีดผ่าน leadStage.ts) → ใบ won แต่ลีดไม่ใช่ PAID
-- ต้นเหตุ:
--   1) ข้อมูลตั้งต้นของฐานทดสอบ/ฐาน dev (tests/fixtures/test-baseline.sql ส่งออกจากฐานทดสอบรุ่นก่อนทางเดียว) มีลีด 22 ราย
--      ที่ใบตอบรับแล้วแต่ลีดค้างขั้นอื่น — ใบแบบเดิม (ไม่มีใบ HQ) ทั้งหมด · ฐานจริงนับแล้ว 0 ราย (อ่านอย่างเดียว 28 ต.ค. 69)
--   2) ช่องโหว่ในฐาน: ตัวขยับลีดตามใบ (quotations_flow_sync · 0219) ทำงานเฉพาะใบที่ทำจากใบ HQ
--      ใบแบบเดิมที่ยังเปิดอยู่เปลี่ยนเป็น won ได้ (0202 ล็อกเฉพาะใบที่ปิดแล้ว) แต่ลีดไม่ขยับ
--      และไม่มีอะไรกันลีดออกจาก PAID ทั้งที่ใบยังตอบรับอยู่
-- ใบนี้:
--   ก) ใบแบบเดิมเปลี่ยนเป็น won → ฐานตั้งลีดของดีลนั้นเป็น PAID ในคำสั่งเดียวกัน (ใบจากใบ HQ มีอยู่แล้วใน 0219)
--   ข) ตัวกัน (AFTER trigger ตรวจทันที): ลีดที่มีใบ won ของดีลนั้น (deal_id = num_id) ต้องเป็น PAID · ทุกบทบาทรวม service role
--      ลำดับที่ทำให้ตรวจทันทีได้: ใบ → won = ตัวขยับลีดทำก่อนตัวกัน (quotations_flow_sync · quotations_legacy_won_lead_paid เรียงชื่อก่อน
--      quotations_won_must_be_paid) · ย้อนการตอบรับ = เปลี่ยนใบก่อน แล้วค่อยพาลีดกลับขั้นเดิม (quotation_revert_won)
--      ไม่ใช้แบบตรวจตอนจบธุรกรรม (deferred) — สคริปต์ที่แก้ใบแล้ว ALTER TABLE quotations ในธุรกรรมเดียวกันจะพัง (pending trigger events)
--   ข2) ย้อนการตอบรับใบหนึ่ง ขณะดีลยังมีใบ won อีกใบ = ลีดคงปิดสำเร็จ (quotation_revert_won ยกจาก 0231)
--   ค) ซ่อมข้อมูลที่ค้าง: ลีดที่มีใบ won แต่ไม่ใช่ PAID → PAID (จำขั้นเดิมใน status_before_paid ไว้ย้อนได้) · ฐานจริง 0 แถว
-- ข้อทดสอบ: supabase/tests/won_quote_lead_paid.sql

-- ═══ ก. ใบแบบเดิม won → ลีด PAID ══════════════════════════════════════════════════════════════════════════════
create or replace function public.quotations_legacy_won_lead_paid() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if new.hq_quote_id is not null or new.deal_id is null or new.status <> 'won' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'won' and old.deal_id is not distinct from new.deal_id then return new; end if;
  perform _lead_flow_set_status(new.dealer_code, new.deal_id, 'PAID');
  return new;
end $$;
revoke all on function public.quotations_legacy_won_lead_paid() from public, anon, authenticated, service_role;
drop trigger if exists quotations_legacy_won_lead_paid on public.quotations;
create trigger quotations_legacy_won_lead_paid after insert or update of status, deal_id on public.quotations
  for each row execute function public.quotations_legacy_won_lead_paid();

-- ═══ ข. ตัวกัน: ใบ won = ลีด PAID ═══════════════════════════════════════════════════════════════════════════════════
create or replace function public._lead_won_must_be_paid(p_dealer text, p_num integer) returns void
  language plpgsql security definer set search_path to 'public' as $$
declare s lead_status;
begin
  if p_num is null then return; end if;
  select status into s from leads where dealer_code = p_dealer and num_id = p_num;
  if not found or s = 'PAID' then return; end if;
  if exists (select 1 from quotations where dealer_code = p_dealer and deal_id = p_num and status = 'won') then
    raise exception 'lead_won_not_paid: ลูกค้าเป้าหมายที่มีใบเสนอราคาที่ลูกค้าตอบรับแล้ว ต้องเป็น "ปิดการขายสำเร็จ" — ถ้าตอบรับผิด ให้สำนักงานใหญ่ย้อนการตอบรับที่ใบ';
  end if;
end $$;
revoke all on function public._lead_won_must_be_paid(text, integer) from public, anon, authenticated, service_role;

create or replace function public.leads_won_must_be_paid() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  perform _lead_won_must_be_paid(new.dealer_code, new.num_id);
  return null;
end $$;
revoke all on function public.leads_won_must_be_paid() from public, anon, authenticated, service_role;

create or replace function public.quotations_won_must_be_paid() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status = 'won' then perform _lead_won_must_be_paid(new.dealer_code, new.deal_id); end if;
  return null;
end $$;
revoke all on function public.quotations_won_must_be_paid() from public, anon, authenticated, service_role;

drop trigger if exists leads_won_must_be_paid on public.leads;
create trigger leads_won_must_be_paid after insert or update of status on public.leads
  for each row execute function public.leads_won_must_be_paid();
drop trigger if exists quotations_won_must_be_paid on public.quotations;
create trigger quotations_won_must_be_paid after insert or update of status, deal_id on public.quotations
  for each row execute function public.quotations_won_must_be_paid();

-- ═══ ข2. ย้อนการตอบรับ: ยังมีใบอื่นของดีลที่ตอบรับอยู่ = ลีดคงปิดสำเร็จ (ยกจาก 0231 · เปลี่ยนเฉพาะเงื่อนไขพาลีดกลับ) ═══
--   เดิมพาลีดกลับขั้นก่อนปิดทุกครั้ง แม้ดีลมีใบ won อีกใบ → ขัดตัวกันข้อ ข (lead_won_not_paid) ย้อนไม่ได้
create or replace function public.quotation_revert_won(p_dealer text, p_id text, p_reason text, p_to quotation_status default 'sent_to_client')
  returns quotations language plpgsql security definer set search_path to 'public' as $$
declare
  q quotations; l leads; v_actor text; v_max bigint; v_when text; v_label text;
  v_back lead_status; v_back_label text;
begin
  if not is_hq() then raise exception 'forbidden: ย้อนการตอบรับได้เฉพาะสำนักงานใหญ่'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'reason_required: ต้องระบุเหตุผลที่ย้อนการตอบรับ'; end if;
  if p_to not in ('sent_to_client', 'lost') then raise exception 'invalid_target: ย้อนได้เป็น "ส่งแล้ว" หรือ "ไม่สำเร็จ" เท่านั้น'; end if;
  select * into q from quotations where dealer_code = p_dealer and id = p_id for update;
  if not found then raise exception 'quote_not_found: ไม่พบใบเสนอราคานี้'; end if;
  if q.status <> 'won' then raise exception 'not_won: ใบนี้ไม่ได้อยู่ในสถานะตอบรับ (สถานะ %)', q.status; end if;

  select coalesce(nullif(btrim(name), ''), audit_actor()) into v_actor from profiles where id = auth.uid();
  v_actor := coalesce(v_actor, audit_actor());
  v_label := case p_to when 'lost' then 'ไม่สำเร็จ' else 'ส่งแล้ว' end;

  perform set_config('pms.revert_won', '1', true);
  update quotations set status = p_to, lost_reason = case when p_to = 'lost' then btrim(p_reason) else lost_reason end
   where dealer_code = p_dealer and id = p_id returning * into q;
  perform set_config('pms.revert_won', '', true);

  if q.deal_id is not null then
    select * into l from leads where dealer_code = p_dealer and num_id = q.deal_id for update;
    if found then
      -- ลีดกลับไปสถานะก่อนปิดการขาย (ไม่มีประวัติ = เสนอราคา) — เฉพาะลีดที่ยังอยู่ PAID
      --   ยังมีใบอื่นของดีลนี้ที่ตอบรับอยู่ = ลีดคงปิดสำเร็จ (ใบ 0252: ใบ won = ลีด PAID เสมอ)
      if l.status = 'PAID' and not exists (
           select 1 from quotations o where o.dealer_code = p_dealer and o.deal_id = q.deal_id and o.status = 'won') then
        v_back := coalesce(nullif(l.status_before_paid, 'PAID'), 'QUOTED');
        v_back_label := ('{"WAITING":"ติดต่อแล้ว","BULLET":"รวบรวมความต้องการ","HQ_PRICING":"รอราคา HQ","QUOTED":"เสนอราคา",'
          '"FOLLOWUP":"ติดตามผล","NEGO":"เจรจาต่อรอง","CANCELLED":"ปิดการขายไม่สำเร็จ"}'::jsonb) ->> v_back::text;
      end if;
      v_when := to_char(now() at time zone 'Asia/Bangkok', 'FMDD') || ' ' ||
        (array['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'])[extract(month from now() at time zone 'Asia/Bangkok')::int]
        || ' ' || (extract(year from now() at time zone 'Asia/Bangkok')::int + 543) || ' · ' || to_char(now() at time zone 'Asia/Bangkok', 'HH24:MI');
      select coalesce(max((x ->> 'id')::bigint), 0) into v_max
        from jsonb_array_elements(coalesce(l.activities, '[]'::jsonb)) x where (x ->> 'id') ~ '^\d+$';
      perform set_config('pms.flow_sync', '1', true);
      update leads set
          status = coalesce(v_back, status),
          status_before_paid = case when v_back is not null then null else status_before_paid end,
          activities = coalesce(activities, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'id', v_max + 1, 'type', 'doc', 'icon', 'doc', 'date', v_when,
          'text', 'สำนักงานใหญ่ (' || v_actor || ') ย้อนการตอบรับใบเสนอราคา ' || p_id || ' → ' || v_label
                  || coalesce(' · ลูกค้าเป้าหมายกลับเป็น "' || v_back_label || '"', '') || ' · เหตุผล: ' || btrim(p_reason)))
       where dealer_code = p_dealer and num_id = q.deal_id;
      perform set_config('pms.flow_sync', '', true);
    end if;
  end if;

  -- แจ้งดีลเลอร์ (D6 · ใบ 0231)
  perform _notify('won_reverted', p_dealer, p_dealer || ':' || p_id || ':' || extract(epoch from clock_timestamp())::bigint,
    jsonb_build_object('lead', q.deal_id, 'quote', p_id, 'company', coalesce(l.company, nullif(q.customer, ''), q.project),
      'reason', btrim(p_reason)),
    'quotations', p_dealer || ':' || p_id);

  insert into audit_log("user", role, action, target)
  values (v_actor, coalesce(auth.jwt() ->> 'user_role', 'HQ'), 'ย้อนการตอบรับใบเสนอราคา',
          p_dealer || ' · ' || p_id || ' → ' || v_label || ' · ' || btrim(p_reason));
  return q;
end $$;
revoke all on function public.quotation_revert_won(text, text, text, quotation_status) from public, anon, authenticated, service_role;
grant execute on function public.quotation_revert_won(text, text, text, quotation_status) to authenticated;

-- ═══ ค. ซ่อมข้อมูลที่ค้าง ═══════════════════════════════════════════════════════════════════════════════════
--   ตั้งตรง (ไม่ผ่านตัวดักลีด) — จำขั้นเดิมไว้ใน status_before_paid ให้ย้อนการตอบรับกลับได้ถูกขั้น
--   ปิดไม่สำเร็จที่มีใบ won = ข้อมูลขัดกันเอง → ใบชนะ (ลูกค้าตอบรับจริง) · ล้างเหตุผลที่เสีย
set session_replication_role = replica;
update public.leads l
   set status_before_paid = l.status, status = 'PAID', lost_reason = case when l.status = 'CANCELLED' then null else l.lost_reason end
 where l.status <> 'PAID'
   and exists (select 1 from public.quotations q where q.dealer_code = l.dealer_code and q.deal_id = l.num_id and q.status = 'won');
set session_replication_role = origin;
