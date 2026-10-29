-- ── ใบ 0259: จังหวัดจากรายชื่อ 77 จังหวัดทุกที่ + ดีลเลอร์ดูแล 1 จังหวัดพอดี (บอสสั่ง 29 ต.ค. 69) ──────────────────────
--
-- ข้อตัดสินของบอส:
--   - ทุกที่ที่กรอกจังหวัด (ดีลเลอร์ · ลีด · ลูกค้า · ผู้สนใจ · ตั้งเป็นดีลเลอร์ H5 · นำเข้าไฟล์) เลือกจาก 77 จังหวัด (th_provinces · ใบ 0195)
--     ฐานไม่รับชื่อที่ไม่อยู่ในรายชื่อ (ชื่อย่อ "กรุงเทพฯ" / "กทม" / สะกดผิด) · ลีดกันอยู่แล้ว (ใบ 0196)
--   - ดีลเลอร์ (ยกเว้นแถว HQ) ดูแล 1 จังหวัดพอดี · จังหวัดเดียวมีดีลเลอร์หลายรายได้ (ห้ามกันจังหวัดซ้ำระหว่างดีลเลอร์ · ใบ 0214)
-- นับบนฐานจริงแบบอ่านอย่างเดียวก่อนเปิดการกัน (29 ต.ค. 69 · รายงานบอสแล้ว):
--   ดีลเลอร์ 155 ราย (ไม่นับ HQ) มีจังหวัดดูแล 1 จังหวัดครบทุกราย · ชื่อตรงรายชื่อทุกราย · จังหวัดที่ตั้ง = จังหวัดดูแลทุกราย
--   ลีดจังหวัดว่าง 80 ราย (ข้อมูลเดิม) · ผู้สนใจจังหวัดไม่ตรงรายชื่อ 92 ราย (นำเข้าจาก Excel) — ใบนี้ไม่แก้ข้อมูลเดิม
--     การกันทำงานเฉพาะตอนเพิ่มใหม่หรือตอนแก้ช่องจังหวัด (แบบเดียวกับใบ 0196)
-- ออกแบบ: จังหวัดดูแลของดีลเลอร์ = จังหวัดที่ตั้ง (dealers.province) ช่องเดียว — ฐานเขียนพื้นที่ (dealer_territories) ให้เอง
--   สร้างดีลเลอร์ = ได้พื้นที่จังหวัดที่ตั้ง · แก้จังหวัดที่ตั้ง = พื้นที่ย้ายตาม (แทนใบ 0255 ที่เติมให้เฉพาะรายที่ยังไม่มีพื้นที่)
--   เพิ่มพื้นที่จังหวัดที่ 2 = ฐานปฏิเสธ · ลบพื้นที่สุดท้ายของดีลเลอร์ที่ยังอยู่ = ฐานปฏิเสธ
-- ข้อทดสอบ: supabase/tests/province_standard_everywhere.sql

create or replace function public._province_ok(p text) returns boolean
  language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from th_provinces where name = btrim(coalesce(p, '')))
$$;
revoke all on function public._province_ok(text) from public, anon, authenticated, service_role;

-- ═══ 1. ดีลเลอร์: จังหวัดที่ตั้ง (= จังหวัดดูแล) ต้องมี และต้องอยู่ในรายชื่อ · แถว HQ ("ทุกจังหวัด") ยกเว้น ═══
create or replace function public.dealers_province_standard() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if new.code = 'HQ' then return new; end if;
  if tg_op = 'UPDATE' and new.province is not distinct from old.province then return new; end if;
  if btrim(coalesce(new.province, '')) = '' then
    raise exception 'dealer_province_required: ดีลเลอร์ต้องมีจังหวัดที่ดูแล 1 จังหวัด — เลือกจากรายชื่อ 77 จังหวัด';
  end if;
  if not _province_ok(new.province) then
    raise exception 'dealer_province_invalid: จังหวัด "%" ไม่อยู่ในรายชื่อจังหวัดมาตรฐาน — เลือกจากรายชื่อ 77 จังหวัด', new.province;
  end if;
  new.province := btrim(new.province);
  return new;
end $$;
revoke all on function public.dealers_province_standard() from public, anon, authenticated, service_role;
drop trigger if exists dealers_province_standard on public.dealers;
create trigger dealers_province_standard before insert or update of province on public.dealers
  for each row execute function public.dealers_province_standard();

-- ═══ 2. พื้นที่ดูแล: ดีลเลอร์ 1 ราย = 1 แถวพอดี (จังหวัดซ้ำระหว่างดีลเลอร์ได้ — ไม่กันที่จังหวัด) ═══
create unique index if not exists dealer_territories_one_per_dealer on public.dealer_territories (dealer_code);

-- ฐานเขียนพื้นที่ตามจังหวัดที่ตั้งเอง (สร้าง/แก้ดีลเลอร์) — แทนตัวเติมของใบ 0255
drop trigger if exists dealers_territory_on_province_fix on public.dealers;
create or replace function public.dealers_territory_sync() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if new.code = 'HQ' or not _province_ok(new.province) then return null; end if;
  if tg_op = 'UPDATE' and new.province is not distinct from old.province then return null; end if;
  perform set_config('pms.territory_sync', '1', true);
  update dealer_territories set province = new.province where dealer_code = new.code and province is distinct from new.province;
  if not exists (select 1 from dealer_territories where dealer_code = new.code) then
    insert into dealer_territories (province, dealer_code) values (new.province, new.code);
  end if;
  perform set_config('pms.territory_sync', '', true);
  return null;
end $$;
revoke all on function public.dealers_territory_sync() from public, anon, authenticated, service_role;
drop trigger if exists dealers_territory_sync on public.dealers;
create trigger dealers_territory_sync after insert or update of province on public.dealers
  for each row execute function public.dealers_territory_sync();

-- เขียนพื้นที่ตรง (ไม่ผ่านจังหวัดที่ตั้ง) ต้องตรงกับจังหวัดที่ตั้ง — กันพื้นที่กับที่ตั้งแยกกันอีก
create or replace function public.dealer_territories_match_dealer() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare ที่ตั้ง text;
begin
  if coalesce(current_setting('pms.territory_sync', true), '') = '1'
     or coalesce(current_setting('pms.restore', true), '') = '1' then return new; end if;
  select province into ที่ตั้ง from dealers where code = new.dealer_code;
  if new.dealer_code <> 'HQ' and ที่ตั้ง is distinct from new.province then
    raise exception 'dealer_territory_mismatch: จังหวัดที่ดูแลต้องเป็นจังหวัดที่ตั้งของดีลเลอร์ (%) — ดีลเลอร์ดูแล 1 จังหวัด แก้ที่จังหวัดที่ตั้ง', coalesce(ที่ตั้ง, 'ยังไม่ระบุ');
  end if;
  return new;
end $$;
revoke all on function public.dealer_territories_match_dealer() from public, anon, authenticated, service_role;
drop trigger if exists dealer_territories_match_dealer on public.dealer_territories;
create trigger dealer_territories_match_dealer before insert or update of province, dealer_code on public.dealer_territories
  for each row execute function public.dealer_territories_match_dealer();

-- ลบพื้นที่สุดท้ายของดีลเลอร์ที่ยังอยู่ = ไม่ได้ (ลบดีลเลอร์ทั้งราย = พื้นที่ลบตาม ไม่ติดกฎนี้)
create or replace function public.dealer_territories_keep_one() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(current_setting('pms.restore', true), '') = '1' then return null; end if;
  if old.dealer_code <> 'HQ' and exists (select 1 from dealers where code = old.dealer_code)
     and not exists (select 1 from dealer_territories where dealer_code = old.dealer_code) then
    raise exception 'dealer_territory_required: ดีลเลอร์ % ต้องมีจังหวัดที่ดูแล 1 จังหวัด — เปลี่ยนจังหวัดที่ตั้งแทนการลบพื้นที่', old.dealer_code;
  end if;
  return null;
end $$;
revoke all on function public.dealer_territories_keep_one() from public, anon, authenticated, service_role;
drop trigger if exists dealer_territories_keep_one on public.dealer_territories;
create trigger dealer_territories_keep_one after delete on public.dealer_territories
  for each row execute function public.dealer_territories_keep_one();

-- ═══ 3. ผู้สนใจเป็นดีลเลอร์ + ลูกค้า: จังหวัดที่กรอกใหม่/แก้ ต้องอยู่ในรายชื่อ (ว่างได้) ═══
--   ผู้สนใจยังเลือก "ทุกจังหวัด" ได้ (ภาค "ทุกภาค" · บอสตัดสิน 14 ก.ย. 69 ผู้สนใจทั่วประเทศ)
create or replace function public.province_field_standard() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare p text := btrim(coalesce(new.province, ''));
begin
  if tg_op = 'UPDATE' and new.province is not distinct from old.province then return new; end if;
  if p = '' or (tg_table_name = 'dealer_prospects' and p = 'ทุกจังหวัด') then return new; end if;
  if not _province_ok(p) then
    raise exception 'province_invalid: จังหวัด "%" ไม่อยู่ในรายชื่อจังหวัดมาตรฐาน — เลือกจากรายชื่อ 77 จังหวัด', p;
  end if;
  return new;
end $$;
revoke all on function public.province_field_standard() from public, anon, authenticated, service_role;
drop trigger if exists dealer_prospects_province_standard on public.dealer_prospects;
create trigger dealer_prospects_province_standard before insert or update of province on public.dealer_prospects
  for each row execute function public.province_field_standard();
drop trigger if exists customers_province_standard on public.customers;
create trigger customers_province_standard before insert or update of province on public.customers
  for each row execute function public.province_field_standard();

-- ตรวจสภาพตอนลง (ไม่แก้ข้อมูล)
do $$
begin
  raise notice 'ใบ 0259: ดีลเลอร์ (ไม่นับ HQ) ไม่มีพื้นที่ % ราย · ที่ตั้งไม่ตรงรายชื่อ % ราย · ที่ตั้งไม่ตรงพื้นที่ % ราย',
    (select count(*) from dealers d where d.code <> 'HQ' and not exists (select 1 from dealer_territories t where t.dealer_code = d.code)),
    (select count(*) from dealers d where d.code <> 'HQ' and not _province_ok(d.province)),
    (select count(*) from dealers d join dealer_territories t on t.dealer_code = d.code where d.code <> 'HQ' and t.province is distinct from d.province);
end $$;
