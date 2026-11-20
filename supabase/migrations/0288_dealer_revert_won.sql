-- ══ 0288 · ย้อนใบที่ลูกค้าตอบรับแล้ว (won) = ดีลเลอร์ทำเอง · HQ ดูอย่างเดียว (บอสตัดสิน 18 พ.ย. 69 · ทับคำตัดสิน 14 ต.ค. 69 / ใบ 0204) ══
-- เดิม: quotation_revert_won เรียกได้เฉพาะสำนักงานใหญ่ (is_hq) แล้วแจ้งดีลเลอร์ (won_reverted · D6)
-- ตอนนี้:
--   · ดีลเลอร์ย้อนได้เฉพาะใบของสาขาตัวเอง (auth_dealer · บทบาทเขียนงานขาย) · ภายใน 7 วันหลังลูกค้าตอบรับ (วันตอบรับที่ฐานเก็บ quotation_won_at)
--   · ต้องใส่เหตุผล · ย้อนเป็น "ส่งให้ลูกค้าแล้ว" หรือ "ลูกค้าปฏิเสธ" (ทางเดิม)
--   · สำนักงานใหญ่เรียกตรงต้องถูกปฏิเสธ (หน้าเว็บ HQ เอาปุ่มออกแล้ว · ดูอย่างเดียว)
--   · ผลเหมือนเดิมทุกอย่าง (ตัวดักเดิมของใบ: ใบ HQ กลับส่งแล้ว · คำขอเปิด · ยอดลูกค้า · ลีดกลับขั้นก่อนปิดเมื่อดีลไม่มีใบ won อื่น)
--   · ลงไทม์ไลน์ลูกค้าเป้าหมาย + บันทึกการใช้งาน + แจ้ง HQ ทุกครั้ง (เรื่องใหม่ won_reverted_by_dealer · H9 · ปิดไม่ได้)
--   · won_reverted (แจ้งดีลเลอร์เมื่อ HQ ย้อน) ไม่ถูกส่งอีก — คงแถวในตารางกลางไว้ (แจ้งเตือนเดิมอ้างอยู่ · ตัวโยงข้อมูล)
-- ข้อทดสอบ: supabase/tests/dealer_revert_won.sql · tests/scenario/customer-quote-flow.spec.ts ([D8r] · [H10]) · ซ้อมลงใบ tests/tools/migration-0288-0289.test.mjs

-- ═══ 1. แจ้งเตือน HQ (ตารางกลาง · FLOW แถว H9) ═══════════════════════════════════════════════════════════════════════
insert into public.notification_kinds (kind, flow_row, audience, bell, email, title, body, href, sort, locked, goes_to) values
  ('won_reverted_by_dealer', 'H9', 'hq', true, true, 'ดีลเลอร์ย้อนการตอบรับ',
     '{dealer} ย้อนการตอบรับใบ {quote} · {company} → {to} — เหตุผล: {reason}', '/hq/quotations?open={quote}', 180, true, 'ใบเสนอราคานั้น')
on conflict (kind, audience) do nothing;

-- ═══ 2. คำสั่งย้อน: ดีลเลอร์เจ้าของใบ · 7 วัน · เหตุผล (ตัวยกจาก 0252 · เปลี่ยนเฉพาะสิทธิ์ · ข้อความไทม์ไลน์ · แจ้งเตือน) ═══════════════
create or replace function public.quotation_revert_won(p_dealer text, p_id text, p_reason text, p_to quotation_status default 'sent_to_client')
  returns quotations language plpgsql security definer set search_path to 'public' as $$
declare
  q quotations; l leads; v_actor text; v_max bigint; v_when text; v_label text;
  v_back lead_status; v_back_label text; v_won timestamptz; v_dealer_name text;
begin
  if is_hq() then raise exception 'forbidden: สำนักงานใหญ่ดูอย่างเดียว — ดีลเลอร์เจ้าของใบเป็นผู้ย้อนการตอบรับ'; end if;
  if coalesce(auth_dealer(), '') = '' or auth_dealer() <> p_dealer then
    raise exception 'forbidden: ย้อนการตอบรับได้เฉพาะใบของสาขาตัวเอง';
  end if;
  if not can_write_sales() then raise exception 'forbidden: บัญชีนี้ไม่มีสิทธิ์แก้งานขาย'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'reason_required: ต้องระบุเหตุผลที่ย้อนการตอบรับ'; end if;
  if p_to not in ('sent_to_client', 'lost') then raise exception 'invalid_target: ย้อนได้เป็น "ส่งแล้ว" หรือ "ไม่สำเร็จ" เท่านั้น'; end if;
  select * into q from quotations where dealer_code = p_dealer and id = p_id for update;
  if not found then raise exception 'quote_not_found: ไม่พบใบเสนอราคานี้'; end if;
  if q.status <> 'won' then raise exception 'not_won: ใบนี้ไม่ได้อยู่ในสถานะตอบรับ (สถานะ %)', q.status; end if;
  -- ภายใน 7 วันหลังลูกค้าตอบรับ (วันตอบรับที่ฐานเก็บ · ไม่มีบันทึกวันตอบรับ = ย้อนไม่ได้ ไม่เดา)
  select won_at into v_won from quotation_won_at where dealer_code = p_dealer and quote_id = p_id;
  if v_won is null or now() - v_won > interval '7 days' then
    raise exception 'revert_window: ย้อนการตอบรับได้ภายใน 7 วันหลังลูกค้าตอบรับเท่านั้น';
  end if;

  select coalesce(nullif(btrim(name), ''), audit_actor()) into v_actor from profiles where id = auth.uid();
  v_actor := coalesce(v_actor, audit_actor());
  v_label := case p_to when 'lost' then 'ลูกค้าปฏิเสธ' else 'ส่งให้ลูกค้าแล้ว' end;
  select coalesce(nullif(btrim(name), ''), p_dealer) into v_dealer_name from dealers where code = p_dealer;

  -- ธงของคำสั่งย้อน = "สาขา:เลขใบ" — ตัวดักยอมเฉพาะใบนี้ + ผู้เรียกเป็นดีลเลอร์เจ้าของใบ (ข้อ 3)
  perform set_config('pms.revert_won', p_dealer || ':' || p_id, true);
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
          'text', v_actor || ' ย้อนการตอบรับใบเสนอราคา ' || p_id || ' → ' || v_label
                  || coalesce(' · ลูกค้าเป้าหมายกลับเป็น "' || v_back_label || '"', '') || ' · เหตุผล: ' || btrim(p_reason)))
       where dealer_code = p_dealer and num_id = q.deal_id;
      perform set_config('pms.flow_sync', '', true);
    end if;
  end if;

  -- แจ้งสำนักงานใหญ่ทุกครั้ง (H9 · ปิดไม่ได้)
  perform _notify('won_reverted_by_dealer', '', p_dealer || ':' || p_id || ':' || extract(epoch from clock_timestamp())::bigint,
    jsonb_build_object('dealer', v_dealer_name, 'quote', p_id, 'company', coalesce(l.company, nullif(q.customer, ''), q.project),
      'to', v_label, 'reason', btrim(p_reason)),
    'quotations', p_dealer || ':' || p_id);

  insert into audit_log("user", role, action, target)
  values (v_actor, coalesce(auth.jwt() ->> 'user_role', ''), 'ย้อนการตอบรับใบเสนอราคา',
          p_dealer || ' · ' || p_id || ' → ' || v_label || ' · ' || btrim(p_reason));
  return q;
end $$;
revoke all on function public.quotation_revert_won(text, text, text, quotation_status) from public, anon, authenticated, service_role;
grant execute on function public.quotation_revert_won(text, text, text, quotation_status) to authenticated;

-- ═══ 3. ตัวดักใบ won: ยอมเฉพาะคำสั่งย้อน (ธง "สาขา:เลขใบ" ของใบนี้) + ผู้เรียกเป็นดีลเลอร์เจ้าของใบ ═══════════════════════════════
--   เดิม (0205 · 0285): ธง "1" + ผู้เรียกเป็น HQ · ตอนนี้ HQ ย้อนไม่ได้แล้ว (ข้อ 2) — ดีลเลอร์สาขาอื่น/ตั้งธงของใบอื่น ไม่ผ่าน
create or replace function public.quotations_guard_won_status() returns trigger
  language plpgsql set search_path to 'public' as $$
begin
  if old.status = 'won' and new.status is distinct from 'won'
     and not (coalesce(current_setting('pms.revert_won', true), '') = old.dealer_code || ':' || old.id
              and not is_hq() and auth_dealer() = old.dealer_code) then
    raise exception 'quote_won_locked: ใบเสนอราคาที่ลูกค้าตอบรับแล้ว (%) เปลี่ยนสถานะไม่ได้ — ดีลเลอร์เจ้าของใบย้อนการตอบรับได้ภายใน 7 วัน (ปุ่มย้อนการตอบรับ)', old.id;
  end if;
  return new;
end $$;
revoke all on function public.quotations_guard_won_status() from public, anon, authenticated, service_role;

-- ตัวดักใบเดิม (ไม่มีใบ HQ) — ยกจาก 0285 ทุกบรรทัด เปลี่ยนเฉพาะเงื่อนไขคำสั่งย้อน
create or replace function public.quotations_legacy_lock() returns trigger
  language plpgsql set search_path to 'public' as $$
declare
  ผูกครั้งแรก boolean;
begin
  if old.hq_quote_id is not null or new.hq_quote_id is not null then return new; end if;
  if pg_trigger_depth() > 1 then return new; end if;
  -- คำสั่งย้อนของดีลเลอร์เจ้าของใบ (ธงของใบนี้) เปลี่ยนได้เฉพาะสถานะ/เหตุผลของใบเก่าที่ won
  if coalesce(current_setting('pms.revert_won', true), '') = old.dealer_code || ':' || old.id
     and not is_hq() and auth_dealer() = old.dealer_code and old.status = 'won'
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
end $$;
revoke all on function public.quotations_legacy_lock() from public, anon, authenticated, service_role;
