-- ── ข้อทดสอบใบ 0222: แถว HQ ในทะเบียนดีลเลอร์ลบ/ปิดใช้งาน/เปลี่ยนรหัสไม่ได้ · ดีลเลอร์อื่นยังแก้ได้ตามปกติ ─────────────────
-- รัน: docker exec -i supabase_db_pms-dbcheck psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 < supabase/tests/hq_row_protected.sql
-- ทรานแซกชันเดียวแล้ว rollback · รอบปิดด่านรันผ่าน tests/scenario/db-rule-tests.spec.ts · ผ่าน = "ALL PASS"
begin;
create schema hqrow;
create function hqrow.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;

do $$
declare n int;
begin
  if not exists (select 1 from dealers where code = 'HQ') then raise exception 'FAIL: ข้อมูลตั้งต้นต้องมีแถว HQ'; end if;
  -- งานฝั่งเซิร์ฟเวอร์ (สิทธิ์สูงสุด) ก็ต้องถูกปฏิเสธ — เส้นทางผู้ดูแลใช้กุญแจฝั่งเซิร์ฟเวอร์
  perform hqrow.must_fail($s$delete from dealers where code = 'HQ'$s$, 'hq_row_protected', 'ลบแถว HQ');
  perform hqrow.must_fail($s$update dealers set status = 'inactive' where code = 'HQ'$s$, 'hq_row_protected', 'ปิดใช้งานแถว HQ');
  perform hqrow.must_fail($s$update dealers set code = 'HQX' where code = 'HQ'$s$, 'hq_row_protected', 'เปลี่ยนรหัสแถว HQ');
  update dealers set name = name where code = 'HQ';
  raise notice 'ok  แก้ช่องอื่นของแถว HQ ได้ (ชื่อ ฯลฯ)';
  update dealers set status = 'inactive' where code = 'RYG';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: ปิดใช้งานดีลเลอร์ทั่วไปไม่ได้'; end if;
  raise notice 'ok  ดีลเลอร์ทั่วไปยังปิดใช้งานได้ตามปกติ';
  raise notice 'ALL PASS';
end $$;
rollback;
