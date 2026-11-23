-- ── ใบ 0297: ถอนสิทธิ์ตาราง/มุมมองทั้งหมดจากคนนอก (anon) + กฎ RLS "to public" → "to authenticated" (คนรวมงานสั่ง 23 พ.ย. 69 · งานความปลอดภัยเชิงป้องกัน) ──
-- เหตุ: ค่าตั้งต้นของสคีมา public (Supabase) ให้ anon ได้ทุกสิทธิ์ทุกตารางที่สร้างใหม่ · กฎ RLS ส่วนใหญ่ประกาศ "to public" (= anon ด้วย)
--   ที่กันอยู่ตอนนี้ = เงื่อนไขในกฎต้องเข้าระบบ (auth.uid() / is_hq() …) — ถ้ากฎตัวใดเงื่อนไขหลวม คนนอกจะอ่าน/เขียนได้ทันที (ยังไม่พบช่องรั่วจริง · พบตอนถ่ายค่าสิทธิ์ใหม่ใบ 0295)
-- ทำ (anon เท่านั้น · ไม่แตะ authenticated / service_role):
--   1) ถอนทุกสิทธิ์ของทุกตาราง/มุมมองในสคีมา public จาก anon (และ PUBLIC) — ไล่จากสิทธิ์จริงในฐาน ไม่เขียนรายชื่อด้วยมือ
--   2) ถอนค่าตั้งต้นของบัญชี postgres (บัญชีที่ลงใบ) ที่ให้ anon ได้สิทธิ์ตาราง/ตัวนับเลขที่สร้างใหม่ → ใบถัดไปสร้างตารางใหม่ก็ไม่เปิดให้คนนอกอีก
--   3) กฎ RLS ที่ประกาศ to public → to authenticated (เงื่อนไขเดิมทุกตัว) · service_role/postgres ข้าม RLS อยู่แล้ว · ไม่กระทบผู้ใช้ที่เข้าระบบ
--   4) health_ping(): ตัวตรวจสุขภาพ (/api/health) เดิมอ่านตาราง dealers ด้วยกุญแจสาธารณะ (ได้ 0 แถว) — ถอนแล้วจะได้ 401
--      → ให้คนนอกเรียกคำสั่งนี้แทน (อ่านตารางจริงในฐาน · คืนแค่ true · ไม่คืนข้อมูล) · หน้าเว็บเรียกคำสั่งนี้ก่อน ไม่มี = ถอยไปอ่าน dealers แบบเดิม
-- ไล่หน้าที่ทำงานก่อนเข้าระบบแล้ว: เข้าระบบ/ต่ออายุใช้บริการยืนยันตัวตน (auth) ไม่อ่านตาราง · /api/v1/* ทุกทางต้องมีใบผ่าน (asCaller) ·
--   events ใช้ใบผ่าน · ตัวตรวจสุขภาพ = ข้อ 4 · storage อยู่สคีมา storage (ไม่แตะ) · คำสั่งของฐาน (rpc) ไม่อยู่ในใบนี้ (ตัวตรวจสิทธิ์คำสั่งดูแลอยู่แล้ว)
-- ไม่มีข้อมูลเปลี่ยน (สิทธิ์/กฎเท่านั้น) · ย้อนกลับ = grant คืน (ไม่ควร)
-- ข้อทดสอบ: supabase/tests/anon_no_table_access.sql · tests/scenario/anon-exposure.spec.ts (ทุกตาราง/มุมมอง = ปฏิเสธ) · ซ้อมลงใบ tests/tools/migration-0297.test.mjs

-- ═══ 1) ถอนสิทธิ์ตาราง/มุมมองจาก anon ═══════════════════════════════════════════════════════════════════════════════
do $$
declare t record;
begin
  for t in select c.relname, c.relkind from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
  loop
    execute format('revoke all on table public.%I from anon, public', t.relname);
  end loop;
end $$;

-- ═══ 2) ค่าตั้งต้นของตาราง/ตัวนับเลขที่สร้างใหม่ (บัญชี postgres = บัญชีที่ลงใบ) ═══════════════════════════════════════
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- ═══ 3) กฎ RLS "to public" → "to authenticated" ═══════════════════════════════════════════════════════════════════════
do $$
declare p record;
begin
  for p in select pol.polname, c.relname from pg_policy pol join pg_class c on c.oid = pol.polrelid
            where c.relnamespace = 'public'::regnamespace and pol.polroles = array[0::oid]
  loop
    execute format('alter policy %I on public.%I to authenticated', p.polname, p.relname);
  end loop;
end $$;

-- ═══ 4) ตัวตรวจสุขภาพสำหรับคนนอก ═══════════════════════════════════════════════════════════════════════════════════
create or replace function public.health_ping() returns boolean
  language sql stable security definer set search_path to '' as $$
  select (select count(*) from (select 1 from public.dealers limit 1) x) >= 0;
$$;
revoke all on function public.health_ping() from public, anon, authenticated, service_role;
grant execute on function public.health_ping() to anon, authenticated;
