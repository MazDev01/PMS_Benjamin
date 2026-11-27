-- ── ใบ 0305: บันทึกใบ HQ ใบเดียวกันพร้อมกัน ห้ามทับกันเงียบ (บอสสั่ง 12 พ.ย. 69 ผ่านคนรวมงาน · ทำ 26 พ.ย. 69) ──
-- เดิม: HQ 2 คนเปิดร่างใบ HQ ใบเดียวกัน → คนแรกบันทึก → คนที่สองบันทึกทับทั้งใบโดยไม่รู้ว่ามีคนแก้ก่อน (งานของคนแรกหายเงียบ)
-- ใหม่: หน้าเว็บส่ง "ฉบับที่เปิดมา" (เวลาแก้ไขล่าสุด updated_at ของใบ HQ ตอนโหลด · ยังไม่มีใบ = ว่าง) มาเทียบที่ฐาน
--   ไม่ตรงกับใบในฐานตอนนี้ = ปฏิเสธ quote_stale: "มีคนแก้ใบนี้ก่อนคุณ โหลดใหม่ก่อนบันทึก" · ไม่เขียนอะไรเลย
--   ตรวจหลังล็อกแถวคำขอ (for update เดิม) — สองคนกดพร้อมกัน คนที่สองรอคนแรก commit แล้วเห็นเวลาใหม่ → ถูกปฏิเสธ
--   ยังไม่มีใบตอนเปิด (ฉบับว่าง) แต่มีคนสร้างร่างก่อน = ปฏิเสธเหมือนกัน
-- ผู้เรียกที่ไม่ส่ง p_check_base (สคริปต์ข้อมูลตัวอย่าง · ข้อทดสอบเดิม) = ทำงานแบบเดิม ไม่ตรวจ — หน้าเว็บ HQ ส่งทุกครั้ง
-- ช่องเวลาส่งเป็นข้อความเดิมที่ฐานตอบ (ละเอียดถึงไมโครวินาที) — หน้าเว็บไม่แปลงเป็น Date (ทศนิยมหายแล้วจะไม่ตรงเอง)
-- รูปคำสั่งเปลี่ยน (เพิ่ม 2 ช่อง) จึงต้องลบตัวเดิมก่อน — มีสองรูปพร้อมกัน = เรียกด้วยชื่อช่องเดิมแล้วฐานเลือกไม่ได้
--   ลบแล้วสร้างใหม่ = สิทธิ์เรียกเดิมหาย → ถอนสิทธิ์ตั้งต้นแล้วให้ authenticated ตามเดิม (ใบ 0190)
-- เงื่อนไขใน IF ไม่ใช้ CASE (ใบ 0292 เคยพัง) · เนื้อคำสั่งส่วนอื่นเหมือนใบ 0285
-- hq_quote_copy_from ("เริ่มจากใบฉบับก่อน") เดิมเรียก hq_quote_save ไม่ตรวจฉบับ → ทับร่างที่คนอื่นทำไว้แล้วเงียบได้
--   ใหม่: คัดลอกได้เฉพาะเมื่อคำขอยังไม่มีร่าง (ปุ่มขึ้นเฉพาะตอนยังไม่มีใบ) · มีร่างแล้ว = quote_stale เหมือนกัน · รูปคำสั่งเดิม สิทธิ์เดิมคงอยู่
-- ข้อทดสอบ: supabase/tests/hq_quote_save_stale.sql · tests/scenario/hq-quote-save-stale.spec.ts

drop function if exists public.hq_quote_save(bigint, jsonb, date, text);

create function public.hq_quote_save(
  p_request_id bigint, p_lines jsonb, p_valid_until date default null::date, p_note text default ''::text,
  p_check_base boolean default false, p_base_updated_at timestamptz default null::timestamptz)
 returns hq_quotes
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  select * into h from hq_quotes where request_id = p_request_id;
  -- ฉบับที่เปิดมาต้องตรงกับใบในฐานตอนนี้ (หลังล็อกแถวคำขอ · ก่อนเขียนอะไรทั้งหมด รวมการรับเรื่องให้)
  if p_check_base and ((h.id is null and p_base_updated_at is not null)
                       or (h.id is not null and (p_base_updated_at is null or h.updated_at <> p_base_updated_at))) then
    raise exception 'quote_stale: มีคนแก้ใบนี้ก่อนคุณ โหลดใหม่ก่อนบันทึก';
  end if;

  -- เริ่มทำราคาโดยยังไม่กดรับเรื่อง = รับเรื่องให้เลย
  if r.status = 'new' then perform quote_request_accept(p_request_id); end if;

  if h.id is not null then
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

revoke all on function public.hq_quote_save(bigint, jsonb, date, text, boolean, timestamptz) from public, anon, authenticated, service_role;
-- หน้าเว็บเรียก (ใบ HQ · HqQuoteEditor) · ใบเดิมให้สิทธิ์ผู้ใช้ไว้ชัด (ใบ 0190)
grant execute on function public.hq_quote_save(bigint, jsonb, date, text, boolean, timestamptz) to authenticated;

-- ── เริ่มจากใบฉบับก่อน: ห้ามทับร่างที่มีอยู่ (เนื้อเดิมจากใบ 0186 · เพิ่มเฉพาะฉบับว่างตอนเรียก hq_quote_save) ──
create or replace function public.hq_quote_copy_from(p_request_id bigint, p_source_hq_quote_id bigint)
returns public.hq_quotes language plpgsql security definer set search_path to 'public' as $$
declare src hq_quotes;
begin
  if not can_price_quotes() then raise exception 'forbidden: บทบาทนี้ทำใบ HQ ไม่ได้'; end if;
  select * into src from hq_quotes where id = p_source_hq_quote_id and status <> 'draft';
  if not found then raise exception 'source_missing: ไม่พบใบ HQ ต้นทางที่ส่งแล้ว'; end if;
  -- ฉบับว่าง = คาดว่าคำขอนี้ยังไม่มีร่าง · มีคนทำร่างไว้แล้ว = quote_stale (ไม่ทับ)
  return hq_quote_save(p_request_id, src.line_items,
                       greatest(src.valid_until, (now() at time zone 'Asia/Bangkok')::date), src.note, true, null);
end $$;
