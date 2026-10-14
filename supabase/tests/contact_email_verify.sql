-- ── ทดสอบใบ 0194: อีเมลติดต่อของดีลเลอร์ต้องยืนยันก่อนรับแจ้งเตือน ─────────────────────────────────
-- รัน: docker exec -i <คอนเทนเนอร์ฐานทดสอบ> psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/contact_email_verify.sql
-- ทุกอย่างอยู่ในทรานแซกชันเดียวแล้ว rollback ท้ายไฟล์ · ผ่าน = บรรทัดสุดท้ายขึ้น "ALL PASS"
begin;

create schema flowtest;
create table flowtest.t_ctx as
select (select id from profiles where role = 'DEALER_ADMIN' and dealer_code = 'CNX' limit 1) as cnx_uid;
grant select on flowtest.t_ctx to authenticated;
create function flowtest.as_dealer(p_code text, p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated',
    'user_role', 'DEALER_ADMIN', 'dealer_code', p_code, 'email', lower(p_code) || '@test')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function flowtest.as_root() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
create function flowtest.ok(p_cond boolean, p_what text) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_what; end if; raise notice 'ok  %', p_what; end $$;
create function flowtest.must_fail(p_sql text, p_like text, p_what text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then raise notice 'ok  % (ถูกปฏิเสธ)', p_what; return; end if;
    raise exception 'FAIL: % — ถูกปฏิเสธแต่ข้อความไม่ตรง: %', p_what, sqlerrm;
  end;
  raise exception 'FAIL: % — ควรถูกปฏิเสธแต่ผ่าน', p_what;
end $$;
grant usage on schema flowtest to authenticated;
grant execute on all functions in schema flowtest to authenticated;

do $$
declare c record; v timestamptz;
begin
  select * into c from flowtest.t_ctx;

  -- เตรียม: ฝั่งเซิร์ฟเวอร์ยืนยันอีเมล A ให้ (ทางเดียวที่ตั้งสถานะยืนยันได้)
  update profiles set contact_email = 'a@example.test' where id = c.cnx_uid;
  update profiles set contact_email_verified_at = now() where id = c.cnx_uid;
  perform flowtest.ok((select contact_email_verified_at is not null from profiles where id = c.cnx_uid), 'ฝั่งเซิร์ฟเวอร์ตั้งสถานะยืนยันได้');
  perform flowtest.ok(_dealer_notify_emails('CNX') = array['a@example.test'], 'อีเมลที่ยืนยันแล้ว = ผู้รับแจ้งเตือนของดีลเลอร์');

  -- ══ เปลี่ยน A → B: สถานะยืนยันถูกล้างเอง และแจ้งเตือนไม่ไป B จนกว่าจะยืนยัน ══
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  update profiles set contact_email = 'b@example.test' where id = c.cnx_uid;
  perform flowtest.as_root();
  perform flowtest.ok((select contact_email = 'b@example.test' and contact_email_verified_at is null from profiles where id = c.cnx_uid),
    'ดีลเลอร์แก้อีเมลติดต่อจาก A เป็น B → สถานะกลับเป็นยังไม่ยืนยัน');
  perform flowtest.ok(coalesce(array_length(_dealer_notify_emails('CNX'), 1), 0) = 0, 'B ยังไม่ยืนยัน → ไม่มีผู้รับแจ้งเตือน (ไม่ส่งไป B และไม่ส่งไป A)');

  -- ══ ผู้ใช้ตั้งสถานะยืนยันเองไม่ได้ ══
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  update profiles set contact_email_verified_at = now() where id = c.cnx_uid;
  perform flowtest.as_root();
  perform flowtest.ok((select contact_email_verified_at is null from profiles where id = c.cnx_uid), 'ดีลเลอร์ตั้งสถานะยืนยันของตัวเองไม่ได้ (ระบบคงค่าเดิม)');

  -- ══ แก้อีเมลเป็นค่าเดิมแบบตัวพิมพ์/ช่องว่างต่าง → ถือว่าเปลี่ยน (เทียบตามที่เก็บ) แต่ยืนยันแล้วคงอยู่ถ้าไม่ได้แตะอีเมล ══
  update profiles set contact_email_verified_at = now() where id = c.cnx_uid;    -- ฝั่งเซิร์ฟเวอร์ยืนยัน B
  select contact_email_verified_at into v from profiles where id = c.cnx_uid;
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  update profiles set phone = '081-000-0000' where id = c.cnx_uid;
  perform flowtest.as_root();
  perform flowtest.ok((select contact_email_verified_at = v from profiles where id = c.cnx_uid), 'แก้ช่องอื่นของโปรไฟล์ → สถานะยืนยันไม่หาย');
  perform flowtest.ok(_dealer_notify_emails('CNX') = array['b@example.test'], 'ยืนยัน B แล้ว → แจ้งเตือนไป B');

  -- ══ ตารางโค้ดยืนยันแตะได้เฉพาะฝั่งเซิร์ฟเวอร์ ══
  perform flowtest.as_dealer('CNX', c.cnx_uid);
  perform flowtest.must_fail('select count(*) from contact_email_codes', 'permission denied', 'ดีลเลอร์อ่านตารางโค้ดยืนยันไม่ได้');
  perform flowtest.must_fail('select _dealer_notify_emails(''CNX'')', 'permission denied', 'ผู้ใช้เรียกตัวหาผู้รับแจ้งเตือนตรง ๆ ไม่ได้');
  perform flowtest.as_root();
  raise notice 'ALL PASS';
end $$;

rollback;
