-- ── ด่าน 4: เป้าสาขา = เป้าในใบค่าแฟรนไชส์ (ข้อตัดสินของบอส 15 ต.ค. 69) ────────────────────────────────────────
--   เป้าของแพ็กเกจ = ค่าตั้งต้นที่เติมตอนออกใบค่าแฟรนไชส์ใหม่เท่านั้น
--   ตั้งเป็นดีลเลอร์แล้ว เป้าสาขาต้องเท่ากับเป้าในใบ · แก้เป้าของแพ็กเกจทีหลังต้องไม่ทับเป้าของดีลเลอร์ที่มีอยู่
--   (เดิมตัวดัก 0178/0179 ทับทั้งสองกรณี — รอบปิดด่าน 3 ใบระบุ 12,000,000 สาขาได้ 3,000,000)
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/franchise_target.sql
begin;
create schema flowtest;
create function flowtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;

-- แพ็กเกจ standard ตั้งเป้า 3,000,000 (ภาคตะวันออก 2,400,000)
update hq_recruit_settings set config = jsonb_set(coalesce(config, '{}'::jsonb), '{proposal,packages}',
  '{"standard":{"annualTarget":3000000,"targetsByRegion":{"ตะวันออก":2400000}},"exclusive":{"annualTarget":null,"targetsByRegion":{}}}'::jsonb, true)
 where id = 1;

-- 1) ตั้งเป็นดีลเลอร์จากใบที่ระบุ 12,000,000 (เส้นทางสร้างดีลเลอร์ใส่เป้าจากใบ) → เป้าสาขาต้องเป็น 12,000,000
insert into dealers (code, name, province, region, revenue_target, status, package)
values ('ZZFT1', 'ZZTEST เป้าจากใบ', 'ระยอง', 'ตะวันออก', 12000000, 'active', 'standard');
select flowtest.ok((select revenue_target from dealers where code = 'ZZFT1') = 12000000,
  'ตั้งเป็นดีลเลอร์: เป้าสาขา = เป้าในใบ 12,000,000 (ไม่ใช่เป้าแพ็กเกจ 2,400,000/3,000,000)');

-- 2) แก้เป้าของแพ็กเกจทีหลัง → ดีลเลอร์ที่มีอยู่ต้องไม่เปลี่ยน
update hq_recruit_settings set config = jsonb_set(config, '{proposal,packages,standard,annualTarget}', '5000000'::jsonb)
 where id = 1;
update hq_recruit_settings set config = jsonb_set(config, '{proposal,packages,standard,targetsByRegion}', '{"ตะวันออก":4000000}'::jsonb)
 where id = 1;
select flowtest.ok((select revenue_target from dealers where code = 'ZZFT1') = 12000000,
  'แก้เป้าแพ็กเกจทีหลัง: เป้าของดีลเลอร์ที่มีอยู่ยังเป็น 12,000,000');

-- 3) แก้ข้อมูลอื่นของดีลเลอร์ (ภาค/แพ็กเกจ) → เป้าต้องไม่ถูกเปลี่ยนตามแพ็กเกจ
update dealers set region = 'เหนือ' where code = 'ZZFT1';
update dealers set package = 'exclusive' where code = 'ZZFT1';
select flowtest.ok((select revenue_target from dealers where code = 'ZZFT1') = 12000000,
  'เปลี่ยนภาค/แพ็กเกจของดีลเลอร์: เป้ายังเป็นของดีลเลอร์เอง 12,000,000');

-- 4) HQ แก้เป้าของดีลเลอร์เองได้ (เป้าเป็นของดีลเลอร์รายนั้น ไม่ผูกกับแพ็กเกจแล้ว)
update dealers set revenue_target = 9000000 where code = 'ZZFT1';
select flowtest.ok((select revenue_target from dealers where code = 'ZZFT1') = 9000000,
  'แก้เป้าของดีลเลอร์เอง: ได้ 9,000,000 ตามที่แก้');

-- 5) เป้าของแพ็กเกจยังใช้เป็นค่าตั้งต้นของใบใหม่ได้ (อ่านจากค่าตั้งค่า)
select flowtest.ok(package_annual_target('standard', 'ตะวันออก') = 4000000 and package_annual_target('standard', 'เหนือ') = 5000000,
  'เป้าของแพ็กเกจยังอ่านได้ (ค่าตั้งต้นตอนออกใบใหม่)');

\echo 'ALL PASS'
rollback;
