-- ── รอบ 3 · ใบเสนอราคาฉบับใหม่ (V2) ส่วนที่ 2: กติกา + ห้ามลบใบที่ส่งแล้ว (บอสสั่ง 21 ต.ค. 69) ──────────────────────────────
--
-- 1) ลูกค้าต่อรองใบที่ส่งแล้ว → ดีลเลอร์ "ทำฉบับใหม่" ได้เอง ไม่ต้องรอ HQ (กลับไปใช้คำสั่ง 21 ส.ค. 69 · ทำเป็นใบใหม่ ไม่แก้ทับ)
--    - ใบที่ส่งแล้วยังแก้ทับตรง ๆ ไม่ได้ (0226 คงไว้) · ฉบับใหม่ = ใบร่างแถวใหม่ เลขที่เดิมต่อท้าย -V2 (-V3 …) ผูกใบ HQ เดิม
--    - ฉบับใหม่แก้ได้เฉพาะ % · ชื่อลูกค้า โครงการ จังหวัด พื้นที่ (และภาษี ประเภทงาน) คัดลอกจากใบเดิม แก้ไม่ได้
--    - ส่งฉบับใหม่แล้ว ใบเดิมเป็น "ถูกแทนที่" อ่านได้อย่างเดียว · ตอบรับ/ปฏิเสธได้เฉพาะฉบับล่าสุด (ใบที่ถูกแทนที่เปลี่ยนสถานะไม่ได้)
--    - มูลค่าลีด (0223) = ใบล่าสุดที่ไม่ใช่ใบร่าง → ส่ง V2 แล้วเป็นยอด V2 · V2 ที่ยังเป็นร่างไม่นับ (ไม่ต้องแก้ตัวคำนวณ)
-- 2) ใบที่ส่งแล้วห้ามลบ — ลบได้เฉพาะใบร่าง (ขยายตัวดักเดิมของใบ won · 0203 — ชื่อตัวดักเดิม เครื่องมือล้างข้อมูลทดสอบใช้ต่อได้)
--    ผลที่ตามมาแบบเดียวกับใบ won: ลบลูกค้า/ดีลเลอร์ที่มีใบที่ส่งแล้วไม่ได้ (ใบต้องไม่หายตาม)

-- ═══ 2. ห้ามลบใบที่ไม่ใช่ใบร่าง ═══════════════════════════════════════════════════════════════════════════════════
create or replace function public.quotations_no_delete_won() returns trigger
  language plpgsql set search_path to 'public' as $$
begin
  if old.status = 'won' then
    raise exception 'quote_won_locked: ใบเสนอราคาที่ลูกค้าตอบรับแล้ว (%) ลบไม่ได้ — เป็นยอดขายที่ปิดแล้ว', old.id;
  end if;
  if old.status <> 'draft' then
    raise exception 'quote_sent_no_delete: ใบเสนอราคา % ส่งให้ลูกค้าแล้ว ลบไม่ได้ — ลบได้เฉพาะใบร่าง', old.id;
  end if;
  return old;
end $$;
revoke all on function public.quotations_no_delete_won() from public, anon, authenticated, service_role;

-- ═══ 1ก. ทำฉบับใหม่จากใบที่ส่งแล้ว ═════════════════════════════════════════════════════════════════════════════
--   มีฉบับใหม่ที่ยังเป็นร่างอยู่แล้ว = คืนใบนั้น (กดซ้ำไม่ได้ใบที่สอง) · ฉบับใหม่ส่งไปแล้ว = ใบนี้ถูกแทนที่ ทำซ้ำไม่ได้
create or replace function public.quotation_new_version(p_dealer text, p_id text) returns public.quotations
  language plpgsql security definer set search_path to 'public' as $$
declare
  v1 quotations; ถัดไป quotations; ผล quotations; n int;
begin
  if not (can_write_sales() and p_dealer = auth_dealer()) then
    raise exception 'forbidden: ไม่มีสิทธิ์ทำฉบับใหม่ของใบเสนอราคาสาขา %', p_dealer;
  end if;
  select * into v1 from quotations where dealer_code = p_dealer and id = p_id for update;
  if not found then raise exception 'not_found: ไม่พบใบเสนอราคา %', p_id; end if;
  select * into ถัดไป from quotations where dealer_code = p_dealer and supersedes_id = p_id;
  if found then
    if ถัดไป.status = 'draft' then return ถัดไป; end if;
    raise exception 'quote_version_exists: ใบ % มีฉบับใหม่ (%) แล้ว', p_id, ถัดไป.id;
  end if;
  if v1.status <> 'sent_to_client' then
    raise exception 'quote_version_not_sent: ทำฉบับใหม่ได้เฉพาะใบที่ส่งให้ลูกค้าแล้วและลูกค้ายังไม่ตอบ (ใบ % สถานะ %)', p_id, v1.status;
  end if;
  if v1.hq_quote_id is null then
    raise exception 'quote_version_legacy: ใบเดิมที่ไม่มีใบ HQ ทำฉบับใหม่ไม่ได้ — ขอราคาจากสำนักงานใหญ่แล้วทำใบใหม่';
  end if;
  n := coalesce(nullif(regexp_replace(coalesce(v1.revision, 'V1'), '[^0-9]', '', 'g'), '')::int, 1) + 1;
  insert into quotations
    select * from jsonb_populate_record(null::quotations,
      (to_jsonb(v1) - 'vat_amount' - 'wht_amount' - 'total_amount' - 'net_payable')
      || jsonb_build_object(
        'id', regexp_replace(v1.id, '-V[0-9]+$', '') || '-V' || n,
        'status', 'draft', 'revision', 'V' || n, 'supersedes_id', v1.id,
        'created_at', now(), 'date', to_char((now() at time zone 'Asia/Bangkok')::date, 'YYYY-MM-DD'),
        'price_history', '[]'::jsonb, 'lost_reason', null, 'expired_reason', null))
    returning * into ผล;
  return ผล;
end $$;
revoke all on function public.quotation_new_version(text, text) from public, anon, authenticated, service_role;
grant execute on function public.quotation_new_version(text, text) to authenticated;

-- ═══ 1ข. กติกาของฉบับใหม่ + ใบที่ถูกแทนที่ ═════════════════════════════════════════════════════════════════════
--   ใช้ตัวเทียบรูปแบบเดียวกับ 0226 (ค่าว่าง/"" · "450.50"/"450.5" เป็นค่าเดียวกัน — หน้าเว็บส่งกลับทั้งแถว)
create or replace function public.quotations_version_guard() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
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
      raise exception 'quote_version_copy: ฉบับใหม่ต้องเป็นใบร่างที่คัดลอกลูกค้า โครงการ จังหวัด พื้นที่ ภาษี จากใบเดิม — ใช้ปุ่ม "ทำฉบับใหม่"';
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
      raise exception 'quote_version_locked: ฉบับใหม่แก้ได้เฉพาะ %% — ชื่อลูกค้า โครงการ จังหวัด พื้นที่ คัดลอกจากใบเดิม แก้ไม่ได้';
    end if;
    if old.status = 'draft' and new.status = 'sent_to_client' then
      select * into v1 from quotations where dealer_code = old.dealer_code and id = old.supersedes_id for update;
      if v1.status is distinct from 'sent_to_client' then
        raise exception 'quote_version_closed: ใบเดิม % ปิดไปแล้ว (%) ส่งฉบับใหม่ไม่ได้', old.supersedes_id, coalesce(v1.status::text, 'ไม่พบ');
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.quotations_version_guard() from public, anon, authenticated, service_role;
drop trigger if exists quotations_version_guard on public.quotations;
create trigger quotations_version_guard before insert or update on public.quotations
  for each row execute function public.quotations_version_guard();

-- ═══ 1ค. ส่งฉบับใหม่ → ใบเดิมถูกแทนที่ ═══════════════════════════════════════════════════════════════════════
create or replace function public.quotations_version_supersede() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if new.supersedes_id is not null and old.status = 'draft' and new.status = 'sent_to_client' then
    update quotations set status = 'superseded'
     where dealer_code = new.dealer_code and id = new.supersedes_id and status = 'sent_to_client';
  end if;
  return new;
end $$;
revoke all on function public.quotations_version_supersede() from public, anon, authenticated, service_role;
drop trigger if exists quotations_version_supersede on public.quotations;
create trigger quotations_version_supersede after update of status on public.quotations
  for each row execute function public.quotations_version_supersede();
