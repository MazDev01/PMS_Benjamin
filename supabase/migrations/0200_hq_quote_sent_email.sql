-- ── อีเมลถึงดีลเลอร์เมื่อ HQ ส่งใบ (FLOW.html ตารางสถานะแถว "HQ ส่งใบ" · ด่าน 2) ─────────────────────────────
--
-- FLOW: HQ ส่งใบ → คำขอ "ส่งใบแล้ว" · Lead คงเดิม + ป้าย "ได้ราคาแล้ว" · อีเมลถึงดีลเลอร์
-- ผู้รับ = อีเมลติดต่อที่ยืนยันแล้วของดีลเลอร์เจ้าของคำขอเท่านั้น (_dealer_notify_emails · ใบ 0194)
--   ยังไม่ยืนยัน = ไม่ส่ง (ข้อตัดสินด่าน 1) — ส่งใบได้ตามปกติ ดีลเลอร์เห็นป้ายในระบบ
-- เนื้ออีเมลไม่มีตัวเลขต้นทุน: อีเมลถูกส่งต่อถึงลูกค้าได้ง่าย ("ต้นทุนไม่หลุดถึงลูกค้า") — ดูราคาในระบบ
-- กันซ้ำด้วย dedupe_key ต่อคำขอ × ผู้รับ (ขอแก้ราคา = คำขอใหม่ = อีเมลฉบับใหม่)

create or replace function public._email_enqueue_dealer(p_dealer text, p_kind text, p_subject text, p_body text, p_ref_table text, p_ref_id text)
  returns integer language plpgsql security definer set search_path to 'public' as $$
declare e text; n integer := 0; k integer;
begin
  foreach e in array _dealer_notify_emails(p_dealer) loop
    insert into email_outbox (kind, to_email, subject, body, ref_table, ref_id, dedupe_key)
    values (p_kind, e, p_subject, p_body, p_ref_table, p_ref_id, p_kind || ':' || p_ref_id || ':' || e)
    on conflict (dedupe_key) do nothing;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end $$;
revoke all on function public._email_enqueue_dealer(text, text, text, text, text, text) from public, anon, authenticated, service_role;

create or replace function public.quote_requests_email() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare h hq_quotes;
begin
  if tg_op = 'INSERT' then
    if new.supersedes_id is not null then            -- แถว 7: ขอแก้ราคา (คำขอใหม่มาแทนคำขอเดิม)
      perform _email_enqueue_hq('quote_request_reprice',
        'ดีลเลอร์ขอแก้ราคา ' || new.request_no,
        'ดีลเลอร์ขอแก้ราคาจากใบ HQ เดิม ระบบเปิดคำขอใหม่และเริ่มนับ 14 วันใหม่' || E'\n\n' || _quote_request_mail_lines(new),
        'quote_requests', new.id::text);
    else                                             -- แถว 1: ดีลเลอร์ส่งคำขอ
      perform _email_enqueue_hq('quote_request_new',
        'คำขอใบเสนอราคาใหม่ ' || new.request_no,
        'มีคำขอใบเสนอราคาใหม่เข้าคิว' || E'\n\n' || _quote_request_mail_lines(new),
        'quote_requests', new.id::text);
    end if;
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then   -- แถว 6: ดีลเลอร์ยกเลิกคำขอ
    perform _email_enqueue_hq('quote_request_cancelled',
      'ดีลเลอร์ยกเลิกคำขอ ' || new.request_no,
      'ดีลเลอร์ยกเลิกคำขอใบเสนอราคา' || E'\n' || 'เหตุผล: ' || new.cancel_reason || E'\n\n' || _quote_request_mail_lines(new),
      'quote_requests', new.id::text);
  elsif new.status = 'quoted' and old.status is distinct from 'quoted' then         -- แถว 4: HQ ส่งใบ → ดีลเลอร์
    select * into h from hq_quotes where request_id = new.id;
    perform _email_enqueue_dealer(new.dealer_code, 'hq_quote_sent',
      'ได้ราคาจากสำนักงานใหญ่แล้ว ' || new.request_no,
      'สำนักงานใหญ่ส่งใบเสนอราคา HQ ให้แล้ว เข้าระบบเพื่อดูรายการและทำใบเสนอราคาให้ลูกค้า' || E'\n\n'
        || 'เลขใบ HQ: ' || coalesce(h.quote_no, '—') || ' (เวอร์ชัน ' || coalesce(h.version::text, '—') || ')' || E'\n'
        || 'ยืนราคาถึง: ' || coalesce(to_char(h.valid_until, 'DD/MM/YYYY'), '—') || E'\n'
        || 'เลขคำขอ: ' || new.request_no || E'\n'
        || 'ลูกค้าเป้าหมาย: ' || coalesce((select nullif(l.company, '') from leads l where l.dealer_code = new.dealer_code and l.num_id = new.lead_num_id), '—') || E'\n'
        || 'งานที่ขอ: ' || coalesce(nullif(new.product, ''), '—') || case when new.subtype <> '' then ' · ' || new.subtype else '' end,
      'quote_requests', new.id::text);
  end if;
  return new;
end $$;
revoke all on function public.quote_requests_email() from public, anon, authenticated, service_role;
