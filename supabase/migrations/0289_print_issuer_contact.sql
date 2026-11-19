-- ══ 0289 · หัวใบเสนอราคาที่พิมพ์มีอีเมล/เว็บไซต์ของบริษัทดีลเลอร์ (บอสเลือก ก · 19 พ.ย. 69 · ข้อแจ้งแยกงานข้อมูลตัวอย่าง ②) ══
-- เดิม: ตั้งค่า › ข้อมูลบริษัท อีเมล/เว็บไซต์ บันทึกแล้วไม่แสดงที่ไหน — หัวกระดาษมาจาก quotation_print_data (0247) ที่คืนแค่
--       ชื่อบริษัท · ที่อยู่ · โทร · เลขผู้เสียภาษี
-- ตอนนี้: quotation_print_data คืน email · website เพิ่ม (ช่องว่าง = '') — แอปพิมพ์ต่อจากบรรทัดโทร · ว่าง = ไม่พิมพ์
--   ที่มาเดิม: ข้อมูลที่ตรึงไว้กับใบ (ครบ) → ไม่งั้นข้อมูลปัจจุบันของสาขา · ตรวจครบ/สิทธิ์/จดเวลาพิมพ์เหมือนเดิมทุกอย่าง
--   ไม่แปลงข้อมูล (แทนฟังก์ชันเดียว) · ฐานจริง dealer_settings.issuer อีเมล/เว็บไซต์ ว่าง = พิมพ์เหมือนเดิม
-- ข้อทดสอบ: supabase/tests/issuer_required.sql (คืนอีเมล/เว็บไซต์) · tests/unit/quotationPrint.test.ts · ซ้อมลงใบ tests/tools/migration-0289.test.mjs

create or replace function public.quotation_print_data(p_dealer text, p_id text) returns jsonb
  language plpgsql volatile security definer set search_path to 'public' as $$
declare
  ใบ quotations;
  ข้อมูล jsonb;
  เวลา timestamptz := now();
begin
  if not (is_hq() or (coalesce(auth_dealer(), '') <> '' and auth_dealer() = p_dealer)) then
    raise exception 'forbidden: ไม่มีสิทธิ์พิมพ์ใบเสนอราคาของสาขา %', p_dealer;
  end if;
  select * into ใบ from quotations where dealer_code = p_dealer and id = p_id;
  if not found then raise exception 'quote_not_found: ไม่พบใบเสนอราคา % ของสาขา %', p_id, p_dealer; end if;
  -- หัวกระดาษ: ข้อมูลที่ตรึงไว้กับใบ (ครบ) → ไม่งั้นข้อมูลปัจจุบันของสาขา
  ข้อมูล := case when _issuer_complete(coalesce(ใบ.issuer, '{}'::jsonb)) then ใบ.issuer else _dealer_issuer(p_dealer) end;
  if not _issuer_complete(ข้อมูล) then
    raise exception 'issuer_incomplete: กรอกข้อมูลบริษัทให้ครบก่อนพิมพ์ใบเสนอราคา (ยังขาด: %)', _issuer_missing(ข้อมูล)
      using hint = 'ตั้งค่า › ข้อมูลบริษัท';
  end if;
  insert into quotation_prints (dealer_code, quote_id, printed_at) values (p_dealer, p_id, เวลา);
  return jsonb_build_object(
    'issuer', jsonb_build_object('company', btrim(ข้อมูล ->> 'company'), 'address', btrim(ข้อมูล ->> 'address'),
                                 'phone', coalesce(ข้อมูล ->> 'phone', ''), 'taxId', btrim(ข้อมูล ->> 'taxId'),
                                 'email', btrim(coalesce(ข้อมูล ->> 'email', '')), 'website', btrim(coalesce(ข้อมูล ->> 'website', ''))),
    'printedAt', เวลา);
end $$;
revoke all on function public.quotation_print_data(text, text) from public, anon, authenticated, service_role;
grant execute on function public.quotation_print_data(text, text) to authenticated;
