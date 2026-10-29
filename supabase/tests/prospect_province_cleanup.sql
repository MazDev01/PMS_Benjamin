-- ── ข้อทดสอบใบ 0261: แก้จังหวัดผู้สนใจที่สะกดไม่ตรงรายชื่อ 77 จังหวัด (บอสตัดสิน 29 ต.ค. 69) ─────────────────────────
--   ข้อที่บอสสั่ง: หลังแก้ ผู้สนใจทุกรายมีจังหวัดตรงรายชื่อหรือว่าง · รายที่ระบุหลายจังหวัด/ภาค มีข้อความเดิมในหมายเหตุครบ
--   · จำนวนผู้สนใจเท่าเดิม · ตารางแปลง 1 ต่อ 1 + ชื่อเมือง 4 ชื่อ แปลงถูก
-- รัน: docker exec -i supabase_db_pms-dbcheck psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/prospect_province_cleanup.sql
-- ทรานแซกชันเดียวแล้ว rollback · รอบปิดด่านรันผ่าน tests/scenario/db-rule-tests.spec.ts · ผ่าน = "ALL PASS"
-- ตกบนโค้ดก่อนใบ 0261: ไม่มีตัวแก้ (_prospect_province_cleanup)
begin;
create schema pptest;
create table pptest.fails (what text);
create function pptest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin
  if p_cond is not true then insert into pptest.fails values (p_what); raise notice 'FAIL %', p_what; return; end if;
  raise notice 'ok  %', p_what;
end $$;

-- แถวของข้อนี้ (ใส่แบบปิดตัวดัก — ตัวกันจังหวัดใบ 0259 ไม่รับชื่อพวกนี้แล้ว · จำลองข้อมูลเดิมก่อนมีตัวกัน)
set local session_replication_role = replica;
insert into public.dealer_prospects (id, name, province, note) values
  (990701, 'ZZTEST ผู้สนใจ 1', 'กทม', null),
  (990702, 'ZZTEST ผู้สนใจ 2', ' ปทุม ', 'โน้ตเดิม'),
  (990703, 'ZZTEST ผู้สนใจ 3', 'หาดใหญ่', null),
  (990704, 'ZZTEST ผู้สนใจ 4', 'ชลบุรี ระยอง ฉะเชิงทรา', 'คุยแล้วสนใจ'),
  (990705, 'ZZTEST ผู้สนใจ 5', 'อีสาน', null),
  (990706, 'ZZTEST ผู้สนใจ 6', 'เชียงใหม่', 'ตรงอยู่แล้ว'),
  (990707, 'ZZTEST ผู้สนใจ 7', null, null),
  (990708, 'ZZTEST ผู้สนใจ 8', 'ทุกจังหวัด', null);
-- ตอนลงใบ ใบ 0261 ปิดตัวดักรอบการแก้ (ข้อนี้ทำเหมือนกัน · บล็อกทดสอบด้านล่างแก้ข้อมูลอย่างเดียว)

do $$
declare ก่อน int := (select count(*) from public.dealer_prospects); r jsonb;
begin
  -- แก้ทั้งตาราง (แถวของข้อนี้ + ข้อมูลตั้งต้นของฐานทดสอบ) — เหมือนตอนลงใบบนฐานจริง
  r := _prospect_province_cleanup();
  perform pptest.ok((select count(*) from public.dealer_prospects) = ก่อน, format('จำนวนผู้สนใจเท่าเดิม (%s)', ก่อน));
  perform pptest.ok(not exists (select 1 from public.dealer_prospects p
                                 where btrim(coalesce(p.province, '')) <> '' and p.province <> 'ทุกจังหวัด'
                                   and not exists (select 1 from th_provinces t where t.name = p.province)),
    'ผู้สนใจทุกรายมีจังหวัดตรงรายชื่อ 77 จังหวัด หรือว่าง (หรือ "ทุกจังหวัด")');

  perform pptest.ok((select province from public.dealer_prospects where id = 990701) = 'กรุงเทพมหานคร', 'กทม → กรุงเทพมหานคร');
  perform pptest.ok((select province from public.dealer_prospects where id = 990702) = 'ปทุมธานี', 'ปทุม (มีช่องว่างหน้าหลัง) → ปทุมธานี');
  perform pptest.ok((select note from public.dealer_prospects where id = 990702) = 'โน้ตเดิม', 'แปลงชื่อแล้วหมายเหตุไม่ถูกแตะ');
  perform pptest.ok((select province from public.dealer_prospects where id = 990703) = 'สงขลา', 'ชื่อเมือง หาดใหญ่ → สงขลา');

  perform pptest.ok((select province is null from public.dealer_prospects where id = 990704), 'หลายจังหวัด: ล้างช่องจังหวัดเป็นว่าง');
  perform pptest.ok((select note from public.dealer_prospects where id = 990704) = E'คุยแล้วสนใจ\nจังหวัดที่ระบุไว้เดิม: ชลบุรี ระยอง ฉะเชิงทรา',
    'หลายจังหวัด: ข้อความเดิมต่อท้ายหมายเหตุครบ (หมายเหตุเดิมยังอยู่)');
  perform pptest.ok((select province is null from public.dealer_prospects where id = 990705), 'ภาค: ล้างช่องจังหวัดเป็นว่าง');
  perform pptest.ok((select note from public.dealer_prospects where id = 990705) = 'จังหวัดที่ระบุไว้เดิม: อีสาน', 'ภาค: ข้อความเดิมอยู่ในหมายเหตุ (ไม่มีหมายเหตุเดิม)');

  perform pptest.ok((select province = 'เชียงใหม่' and note = 'ตรงอยู่แล้ว' from public.dealer_prospects where id = 990706), 'จังหวัดที่ตรงอยู่แล้ว ไม่ถูกแตะ');
  perform pptest.ok((select province is null and note is null from public.dealer_prospects where id = 990707), 'ไม่มีจังหวัด ไม่ถูกแตะ');
  perform pptest.ok((select province = 'ทุกจังหวัด' from public.dealer_prospects where id = 990708), '"ทุกจังหวัด" ไม่ถูกแตะ');

  -- เรียกซ้ำ = ไม่เปลี่ยนอะไรอีก (ข้อความไม่ต่อท้ายซ้ำ)
  r := _prospect_province_cleanup();
  perform pptest.ok((r ->> 'แปลง')::int = 0 and (r ->> 'ย้ายไปหมายเหตุ')::int = 0, 'เรียกซ้ำไม่แก้ซ้ำ');

  if exists (select 1 from pptest.fails) then
    raise exception 'FAIL % ข้อ: %', (select count(*) from pptest.fails), (select string_agg(what, ' · ') from pptest.fails);
  end if;
end $$;
set local session_replication_role = origin;

select 'ALL PASS' as result;
rollback;
