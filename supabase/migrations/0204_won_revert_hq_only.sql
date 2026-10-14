-- ── ใบที่ won: ดีลเลอร์เปลี่ยนสถานะไม่ได้ · ย้อนได้เฉพาะ HQ พร้อมไทม์ไลน์ (ด่าน 3 · ข้อตัดสินของบอส 14 ต.ค. 69) ──────
--
-- ปิดทางอ้อมของ 0203 (ห้ามลบใบ won): ดีลเลอร์ย้อน won → ไม่สำเร็จ แล้วลบ
--   - ใบที่ won (ทั้งใบเก่าและใบจากใบ HQ) เปลี่ยนสถานะออกจาก won ได้ทางเดียว: คำสั่ง quotation_revert_won() ของ HQ
--     แก้ตรงที่ตาราง (รวมสิทธิ์สูงสุด/ฝั่งเซิร์ฟเวอร์) ไม่ได้ · ย้อนต้องมีเหตุผล
--   - ย้อนแล้วลงไทม์ไลน์ของลูกค้าเป้าหมาย (ใคร · เมื่อไร · ใบไหน · เพราะอะไร) + บันทึกการใช้งานของ HQ
--   - ใบจากใบ HQ: ตัวขยับสถานะของ Flow คืนใบ HQ เป็นส่งแล้ว และคำขอกลับมาเปิด (0183) · ยอดลูกค้ารวมใหม่ตามตัวดักเดิม
--   ย้ายข้อมูลดีลเลอร์ไม่แตะสถานะใบ จึงไม่ถูกกัน
-- ตัวดักชื่อขึ้นต้น guard ให้ทำงานก่อน quotations_legacy_lock (เรียงตามชื่อ) — ใบเก่าที่ won ได้ข้อความเดียวกับใบจากใบ HQ

create or replace function public.quotations_guard_won_status() returns trigger
  language plpgsql set search_path to 'public' as $$
begin
  if old.status = 'won' and new.status is distinct from 'won'
     and coalesce(current_setting('pms.revert_won', true), '') <> '1' then
    raise exception 'quote_won_locked: ใบเสนอราคาที่ลูกค้าตอบรับแล้ว (%) เปลี่ยนสถานะไม่ได้ — ย้อนได้เฉพาะสำนักงานใหญ่', old.id;
  end if;
  return new;
end $$;
revoke all on function public.quotations_guard_won_status() from public, anon, authenticated, service_role;
drop trigger if exists quotations_guard_won_status on public.quotations;
create trigger quotations_guard_won_status before update on public.quotations
  for each row execute function public.quotations_guard_won_status();

-- ใบเก่าที่ปิดแล้วล็อกทั้งใบ (0202) — ยกเว้นการย้อนของ HQ ผ่านคำสั่งด้านล่าง (เปลี่ยนเฉพาะสถานะ/เหตุผล)
create or replace function public.quotations_legacy_lock() returns trigger
  language plpgsql set search_path to 'public' as $$
declare
  ผูกครั้งแรก boolean;
begin
  if old.hq_quote_id is not null or new.hq_quote_id is not null then return new; end if;
  if pg_trigger_depth() > 1 then return new; end if;
  if coalesce(current_setting('pms.revert_won', true), '') = '1' and old.status = 'won'
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
    raise exception 'legacy_quote_locked: ใบเสนอราคาเดิม (ไม่มีใบ HQ) ทำเวอร์ชันใหม่ไม่ได้ — ขอราคาจากสำนักงานใหญ่แล้วทำใบใหม่จากใบ HQ';
  end if;
  if new.deal_id is distinct from old.deal_id
     or (old.customer_id is not null and new.customer_id is distinct from old.customer_id) then
    raise exception 'legacy_quote_locked: ใบเสนอราคาเดิม (ไม่มีใบ HQ) ย้ายลูกค้าเป้าหมายหรือลูกค้าที่ผูกอยู่ไม่ได้';
  end if;
  return new;
end $$;
revoke all on function public.quotations_legacy_lock() from public, anon, authenticated, service_role;

/** HQ ย้อนการตอบรับของใบเสนอราคา (won → ส่งแล้ว หรือ ไม่สำเร็จ) — ทางเดียวที่ใบ won เปลี่ยนสถานะได้ */
create or replace function public.quotation_revert_won(p_dealer text, p_id text, p_reason text, p_to quotation_status default 'sent_to_client')
  returns quotations language plpgsql security definer set search_path to 'public' as $$
declare
  q quotations; l leads; v_actor text; v_max bigint; v_when text; v_label text;
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

  -- ไทม์ไลน์ของลูกค้าเป้าหมาย (ต่อท้ายเสมอ · รูปแบบv_whenเดียวกับที่แอปเขียน)
  if q.deal_id is not null then
    select * into l from leads where dealer_code = p_dealer and num_id = q.deal_id for update;
    if found then
      v_when := to_char(now() at time zone 'Asia/Bangkok', 'FMDD') || ' ' ||
        (array['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'])[extract(month from now() at time zone 'Asia/Bangkok')::int]
        || ' ' || (extract(year from now() at time zone 'Asia/Bangkok')::int + 543) || ' · ' || to_char(now() at time zone 'Asia/Bangkok', 'HH24:MI');
      select coalesce(max((x ->> 'id')::bigint), 0) into v_max
        from jsonb_array_elements(coalesce(l.activities, '[]'::jsonb)) x where (x ->> 'id') ~ '^\d+$';
      perform set_config('pms.flow_sync', '1', true);
      update leads set activities = coalesce(activities, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'id', v_max + 1, 'type', 'doc', 'icon', 'doc', 'date', v_when,
          'text', 'สำนักงานใหญ่ (' || v_actor || ') ย้อนการตอบรับใบเสนอราคา ' || p_id || ' → ' || v_label || ' · เหตุผล: ' || btrim(p_reason)))
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
