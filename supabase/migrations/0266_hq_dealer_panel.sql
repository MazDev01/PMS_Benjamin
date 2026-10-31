-- ── ใบ 0266: แผงดีลเลอร์ด้านขวาของหน้า HQ ดีลเลอร์ (/hq/dealers · บอสสั่ง 30 ต.ค. 69) ──
--
-- แท็บ "ภาพรวม" = ข้อมูลทั้งหมดของดีลเลอร์ในหน้าเดียว · งานดูแล (เป็นจำนวน ไม่มีเงิน · FLOW H11 "ไม่มีตัวเลขยอดขาย")
--   counts         ลีดที่เปิดอยู่ · คำขอราคาที่รอ HQ (ใหม่/กำลังทำราคา) · ใบที่รอลูกค้าตอบ (ส่งให้ลูกค้าแล้ว) · ลูกค้า
--   lastLoginAt    เข้าระบบล่าสุดของบัญชีดีลเลอร์ (auth.users.last_sign_in_at · ไม่มี = null)
--   lastSalesAt    งานขายล่าสุด — ชุดเดียวกับ _dealer_active_since (0246): เพิ่ม/แก้ลีด · บันทึกการติดต่อ · ทำ/แก้ใบ · ขอราคา
--   issuer         ข้อมูลบริษัท (dealer_settings.issuer) + missing = ช่องที่ขาด กติกาเดียวกับด่านส่งใบแรก (_issuer_missing · 0247)
--   contact        ผู้ติดต่อ = บัญชีผู้ดูแลดีลเลอร์ (ชื่อ · อีเมลติดต่อ · เบอร์) — บอสเลือก 30 ต.ค. 69 (ข้อมูลบริษัทไม่มีช่องชื่อผู้ติดต่อ)
--   franchise      ใบค่าแฟรนไชส์ที่ตอบรับล่าสุดของผู้สนใจต้นทาง (dealers.prospect_id) — แพ็กเกจ · เลขใบ · สถานะชำระ
--                  (paid = ชำระครบ · partial = ชำระบางส่วน · unpaid = ยังไม่ชำระ) · ไม่ส่งยอดเงิน (แผงไม่มี ฿)
--   activity       กิจกรรมล่าสุดของดีลเลอร์จากบันทึกการใช้งาน (audit_log · target ขึ้นต้นด้วยรหัสสาขา) · p_activity_limit รายการ
-- เฉพาะ HQ · ดีลเลอร์เรียก = forbidden · รหัสที่ไม่มี/แถว HQ = null
-- ข้อทดสอบ: supabase/tests/hq_dealer_panel.sql · tests/scenario/hq-dealers-panel.spec.ts

create or replace function public.hq_dealer_panel(p_code text, p_activity_limit integer default 10) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare
  d record; ข้อมูล jsonb; ใบ record; ชำระ numeric; แฟรนไชส์ jsonb;
begin
  if not is_hq() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  select * into d from dealers where code = p_code;
  if not found or p_code = 'HQ' then return null; end if;
  ข้อมูล := coalesce((select s.issuer from dealer_settings s where s.dealer_code = p_code), '{}'::jsonb);

  select pr.id, pr.proposal_no, pr.package, coalesce(pr.amount, 0) as ยอด, pr.payment_due_on
    into ใบ
    from dealer_package_proposals pr
   where d.prospect_id is not null and pr.prospect_id = d.prospect_id and pr.status = 'accepted'
   order by pr.id desc limit 1;
  if found then   -- ไม่มีใบ = ไม่แตะฟิลด์ของ ใบ (record ยังไม่ถูกกำหนด)
    ชำระ := (select coalesce(sum(amount), 0) from dealer_proposal_payments where proposal_id = ใบ.id and cancelled_at is null);
    แฟรนไชส์ := jsonb_build_object('proposalId', ใบ.id, 'proposalNo', ใบ.proposal_no, 'package', ใบ.package, 'dueOn', ใบ.payment_due_on,
      'payment', case when ชำระ >= ใบ.ยอด then 'paid' when ชำระ > 0 then 'partial' else 'unpaid' end);
  end if;

  return jsonb_build_object(
    'code', d.code, 'name', d.name, 'province', d.province, 'region', d.region, 'status', d.status, 'package', d.package,
    'counts', jsonb_build_object(
      'openLeads',         (select count(*) from leads where dealer_code = p_code and status not in ('PAID', 'CANCELLED')),
      'requestsWaitingHq', (select count(*) from quote_requests where dealer_code = p_code and status in ('new', 'pricing')),
      'quotesAwaiting',    (select count(*) from quotations where dealer_code = p_code and status = 'sent_to_client'),
      'customers',         (select count(*) from customers where dealer_code = p_code)),
    'lastLoginAt', (select max(u.last_sign_in_at) from profiles p join auth.users u on u.id = p.id where p.dealer_code = p_code),
    'lastSalesAt', (select max(x) from (
        select greatest(l.created_at, (l.last_contact_at::timestamp at time zone 'Asia/Bangkok'), (l.created_date::timestamp at time zone 'Asia/Bangkok')) as x
          from leads l where l.dealer_code = p_code
        union all select greatest(q.created_at, q.updated_at) from quotations q where q.dealer_code = p_code
        union all select r.submitted_at from quote_requests r where r.dealer_code = p_code) t),
    'issuer', jsonb_build_object('company', coalesce(ข้อมูล ->> 'company', ''), 'address', coalesce(ข้อมูล ->> 'address', ''),
                                 'phone', coalesce(ข้อมูล ->> 'phone', ''), 'taxId', coalesce(ข้อมูล ->> 'taxId', ''),
                                 'missing', nullif(_issuer_missing(ข้อมูล), '')),
    'contact', (select jsonb_build_object('name', p.name, 'email', p.contact_email, 'phone', p.phone)
                  from profiles p where p.dealer_code = p_code and p.role = 'DEALER_ADMIN' order by p.created_at limit 1),
    'franchise', แฟรนไชส์,
    'activity', coalesce((select jsonb_agg(jsonb_build_object('at', a.at, 'action', a.action, 'target', a.target, 'user', a."user") order by a.at desc, a.id desc)
                            from (select * from audit_log where target like p_code || ' · %' or target = p_code
                                   order by at desc, id desc limit greatest(coalesce(p_activity_limit, 10), 1)) a), '[]'::jsonb)
  );
end $$;
revoke all on function public.hq_dealer_panel(text, integer) from public, anon, authenticated, service_role;
grant execute on function public.hq_dealer_panel(text, integer) to authenticated;
