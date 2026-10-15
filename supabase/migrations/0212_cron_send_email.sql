-- Benjamin PMS — ส่งอีเมลค้างส่งทุก 15 นาที ด้วยงานตั้งเวลาของฐาน (แทนงานตั้งเวลาของ Vercel)
--
-- เดิม: apps/hq/vercel.json มี crons */15 → แผน Hobby ของ Vercel รับได้แค่วันละครั้ง = deploy HQ ล้ม
--   บอสตัดสิน (15 ต.ค. 69): แผน Hobby → ย้ายไป pg_cron + pg_net · ห้ามลดเป็นวันละครั้ง
--
-- แก้: pg_cron เรียก public._cron_send_email() ทุก 15 นาที → pg_net ยิง GET ไปที่ /api/cron/send-email
--   พร้อม Authorization: Bearer <CRON_SECRET> (เส้นทางเดิม ตรรกะส่งอีเมลยังอยู่ฝั่งแอปเหมือนเดิม)
--   ที่อยู่ + รหัสลับเก็บใน Vault (ไม่อยู่ในไฟล์นี้) ชื่อ 'cron_send_email_url' และ 'cron_secret'
--   ยังไม่ได้ตั้งตัวใดตัวหนึ่ง = ข้ามเงียบ ๆ (ไม่ยิง ไม่ error) → ตั้งทีหลังได้โดยไม่ต้องลงใบใหม่
--   ตั้งค่า (SQL Editor · ครั้งเดียว · รหัสต้องตรงกับ CRON_SECRET บน Vercel benjamin-hq):
--     select vault.create_secret('https://pms.benjaminpebsteel.com/api/cron/send-email', 'cron_send_email_url');
--     select vault.create_secret('<CRON_SECRET>', 'cron_secret');
--
-- ทนทานต่อ pg_cron/pg_net: ถ้า extension ยังเปิดไม่ได้ → ข้ามแบบ no-op ไม่ทำให้ใบถัดไปพัง (เหมือน 0066/0193)

create or replace function public._cron_send_email()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'cron_send_email_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return;
  end if;
  perform net.http_get(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 60000
  );
end $$;

revoke all on function public._cron_send_email() from public, anon, authenticated, service_role;

do $$
begin
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron;
  perform cron.schedule('send-email', '*/15 * * * *', $q$ select public._cron_send_email() $q$);
exception when others then
  raise notice 'ข้าม send-email cron: pg_cron/pg_net ยังไม่พร้อม (%) — เปิดแล้วรันใบนี้ใหม่', sqlerrm;
end $$;
