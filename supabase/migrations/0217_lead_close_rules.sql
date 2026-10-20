-- ── ใบ 0217: กติกาปิดงานของลีด (บอสตัดสิน 19 ต.ค. 69 · รอบ 2 ช่วง ก ข้อ 3 · 4 · 6) ─────────────────────────────────
--
-- ข้อ 3  ลีดที่ "ปิดการขายสำเร็จ" (PAID) — ดีลเลอร์ย้อนเองไม่ได้ ให้ HQ ทำได้คนเดียว
--        เดิม: ปุ่ม "เปิดใหม่" / ช่องเลือกสถานะ ของดีลเลอร์ พาลีดออกจาก PAID ได้ · ฐานกันแค่ที่ใบเสนอราคา (0204/0205)
-- ข้อ 4  HQ ย้อนการตอบรับ (quotation_revert_won) → ลีดกลับไปสถานะก่อนปิดการขาย
--        ใช้ช่องใหม่ leads.status_before_paid (ฐานจดเองทุกครั้งที่ลีดเข้า PAID)
--        ลีดที่ปิดก่อนใบนี้ไม่มีประวัติ → "เสนอราคา" (QUOTED = ส่งใบเสนอราคาแล้ว) ตามที่บอสกำหนด
--        เดิม: ใบกลับเป็นส่งแล้ว แต่ลีดค้าง PAID
-- ข้อ 6  ดีลเลอร์ลบลีดได้เฉพาะลีดที่ยังไม่มีคำขอราคาหรือใบเสนอราคาผูกอยู่ — มีแล้วให้ใช้ "เสียโอกาส" แทน
--        (FK แบบ restrict กันอยู่แล้ว แต่ข้อความเป็นภาษาระบบ — ใบนี้ให้ข้อความที่บอกทางไปต่อ)
--
-- ไม่ตรวจ: service role / งานในฐาน (กู้ข้อมูล · ชุดล้างข้อมูลทดสอบ) — แบบเดียวกับตัวดักลีดตัวอื่น (0186)
-- ข้อทดสอบ: supabase/tests/lead_close_rules.sql

-- ═══ 1. ช่องจดสถานะก่อนปิดการขาย ═══════════════════════════════════════════════════════════════════
alter table public.leads add column if not exists status_before_paid public.lead_status;
comment on column public.leads.status_before_paid is
  'สถานะก่อนเข้า "ปิดการขายสำเร็จ" ครั้งล่าสุด — ฐานจดเอง (leads_paid_guard) · ใช้ตอน HQ ย้อนการตอบรับ (ใบ 0217)';

-- ═══ 2. ตัวดัก: จดสถานะก่อนปิด + ดีลเลอร์พาออกจาก PAID ไม่ได้ ════════════════════════════════════════
create or replace function public.leads_paid_guard() returns trigger
  language plpgsql set search_path to 'public' as $$
begin
  if new.status = 'PAID' and old.status is distinct from 'PAID' then
    new.status_before_paid := old.status;
  end if;
  if old.status = 'PAID' and new.status is distinct from 'PAID'
     and coalesce(auth.role(), '') = 'authenticated'
     and not is_hq()
     and coalesce(current_setting('pms.flow_sync', true), '') <> '1' then
    raise exception 'lead_won_locked: ลูกค้าเป้าหมายนี้ปิดการขายสำเร็จแล้ว — ย้อนได้เฉพาะสำนักงานใหญ่ (ย้อนการตอบรับใบเสนอราคา)';
  end if;
  return new;
end $$;
revoke all on function public.leads_paid_guard() from public, anon, authenticated, service_role;

drop trigger if exists leads_paid_guard on public.leads;
create trigger leads_paid_guard before update of status on public.leads
  for each row execute function public.leads_paid_guard();

-- ═══ 3. ตัวดัก: ลบลีดที่มีคำขอราคา/ใบเสนอราคาแล้วไม่ได้ ═════════════════════════════════════════════
create or replace function public.leads_delete_guard() returns trigger
  language plpgsql set search_path to 'public' as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return old; end if;   -- service role / งานในฐานข้อมูล
  if exists (select 1 from quote_requests r where r.dealer_code = old.dealer_code and r.lead_num_id = old.num_id)
     or exists (select 1 from quotations q where q.dealer_code = old.dealer_code and q.deal_id = old.num_id) then
    raise exception 'lead_has_quotes: ลูกค้าเป้าหมายนี้มีคำขอราคาหรือใบเสนอราคาแล้ว — ลบไม่ได้ ให้ใช้ "เสียโอกาส" (ปิดการขายไม่สำเร็จ) แทน';
  end if;
  return old;
end $$;
revoke all on function public.leads_delete_guard() from public, anon, authenticated, service_role;

drop trigger if exists leads_delete_guard on public.leads;
create trigger leads_delete_guard before delete on public.leads
  for each row execute function public.leads_delete_guard();

-- ═══ 4. HQ ย้อนการตอบรับ → ลีดกลับสถานะก่อนปิดการขาย ═══════════════════════════════════════════════
--   เหมือน 0204 ทุกอย่าง + ขั้น "ลีดกลับ" ต่อท้ายไทม์ไลน์ในข้อความเดียวกัน
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
      if l.status = 'PAID' then
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

  insert into audit_log("user", role, action, target)
  values (v_actor, coalesce(auth.jwt() ->> 'user_role', 'HQ'), 'ย้อนการตอบรับใบเสนอราคา',
          p_dealer || ' · ' || p_id || ' → ' || v_label || ' · ' || btrim(p_reason));
  return q;
end $$;
revoke all on function public.quotation_revert_won(text, text, text, quotation_status) from public, anon, authenticated, service_role;
grant execute on function public.quotation_revert_won(text, text, text, quotation_status) to authenticated;
