-- ── ใบ HQ: บันทึกผู้ส่ง · จุดเดียวกำหนดว่าใครตีราคาได้ · ใบเวอร์ชันใหม่ปิดใบดีลเลอร์ของเวอร์ชันเก่า ──
--
-- ข้อตัดสิน 12 ต.ค. 69 (ต่อจาก 0183):
--   1. ตีราคาเปิดให้ทุกบทบาทของสำนักงานใหญ่ไว้ก่อน แต่ใบ HQ ต้องรู้ว่า "ใครเป็นคนส่ง"
--      และรายชื่อบทบาทต้องอยู่ที่เดียว — เอาบทบาทออกจากจุดนั้น บทบาทนั้นส่งใบไม่ได้ทันที
--   2. ใบเสนอราคาของดีลเลอร์ที่ผูกใบ HQ เวอร์ชันเก่า ระบบปิดให้เอง
--      · ปิดตอน HQ "ส่งเวอร์ชันใหม่" ไม่ใช่ตอนดีลเลอร์ขอแก้ราคา (ระหว่างรอ ลูกค้ายังถือใบเดิมอยู่)
--      · ปิดเป็น "หมดอายุ" พร้อมเหตุผล — ห้ามเป็น "ลูกค้าปฏิเสธ" เพราะจะไปนับเป็นงานที่แพ้
--        ทั้งที่ลูกค้ายังไม่ได้ปฏิเสธอะไร (อัตราแพ้และเหตุผลที่เสียงานต้องไม่ขยับ)

-- ═══ 1. ใครตีราคาได้ — จุดเดียว ═══════════════════════════════════════════════════════════
-- เก็บเป็น "ข้อมูล" ไม่ใช่รายชื่อในโค้ดของฟังก์ชัน
--   ⚠️ รอบแรกเขียนรายชื่อไว้ในฟังก์ชัน แล้วชุดทดสอบจับได้ว่า: แก้รายชื่อแล้วการเชื่อมต่อที่เปิดค้างอยู่
--      ยังใช้รายชื่อเก่า (ค่าถูกฝังลงแผนคำสั่งที่ฐานข้อมูลจำไว้) = ถอดสิทธิ์แล้วแต่ยังส่งใบได้
--      อ่านจากตารางทุกครั้งไม่มีปัญหานี้ — ลบแถวออก บทบาทนั้นทำ/ส่งใบไม่ได้ทันที
create table public.quote_pricing_roles (
  role text primary key check (role in ('SUPER_ADMIN', 'HQ_MANAGEMENT', 'HQ_STAFF'))
);
comment on table public.quote_pricing_roles is
  'บทบาทของสำนักงานใหญ่ที่ทำ/ส่งใบ HQ ได้ — จุดตั้งค่าเดียว ลบแถวออก = บทบาทนั้นตีราคาไม่ได้';
insert into public.quote_pricing_roles (role) values ('SUPER_ADMIN'), ('HQ_MANAGEMENT'), ('HQ_STAFF');

alter table public.quote_pricing_roles enable row level security;
revoke all on public.quote_pricing_roles from anon;
revoke insert, update, delete, truncate on public.quote_pricing_roles from authenticated;
grant select on public.quote_pricing_roles to authenticated;
create policy quote_pricing_roles_select on public.quote_pricing_roles for select to authenticated using (is_hq());

create or replace function public.can_price_quotes() returns boolean
  language sql stable security definer set search_path to 'public'
  as $$ select exists (select 1 from quote_pricing_roles where role = auth_role()) and public.is_account_active() $$;

-- ═══ 2. ผู้ส่งใบ HQ ═══════════════════════════════════════════════════════════════════════
alter table public.hq_quotes
  add column if not exists sent_by      uuid references auth.users(id) on delete set null,
  add column if not exists sent_by_name text not null default '';

-- ═══ 3. เหตุผลที่ใบของดีลเลอร์หมดอายุ (แยกจากเหตุผลที่ลูกค้าปฏิเสธ) ═════════════════════════
alter table public.quotations add column if not exists expired_reason text;

/** ข้อความเหตุผลเมื่อใบถูกปิดเพราะใบ HQ ออกเวอร์ชันใหม่ — ที่เดียว หน้าจอ/รายงานอ้างค่านี้ */
create or replace function public.hq_version_expired_reason() returns text
  language sql immutable as $$ select 'ราคา HQ เปลี่ยนเวอร์ชัน' $$;

-- ═══ 4. ส่งใบ HQ: จดผู้ส่ง + ปิดใบดีลเลอร์ของเวอร์ชันก่อนหน้า ═════════════════════════════
create or replace function public.hq_quote_send(p_request_id bigint)
returns public.hq_quotes language plpgsql security definer set search_path to 'public' as $$
declare
  r      quote_requests;
  h      hq_quotes;
  v_name text;
begin
  if not can_price_quotes() then raise exception 'forbidden: บทบาทนี้ส่งใบ HQ ไม่ได้'; end if;
  select * into r from quote_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found: ไม่พบคำขอนี้'; end if;
  if r.status <> 'pricing' then raise exception 'request_stage: ส่งใบได้เฉพาะคำขอที่กำลังทำราคา (สถานะ %)', r.status; end if;

  select * into h from hq_quotes where request_id = p_request_id and status = 'draft' for update;
  if not found then raise exception 'quote_missing: ยังไม่มีร่างใบ HQ ของคำขอนี้'; end if;
  if jsonb_array_length(h.line_items) = 0 or h.total_cost <= 0 then
    raise exception 'quote_empty: ใบ HQ ต้องมีรายการและยอดรวมมากกว่า 0';
  end if;
  if h.valid_until is null or h.valid_until < (now() at time zone 'Asia/Bangkok')::date then
    raise exception 'quote_validity: ต้องกำหนดวันยืนราคา และต้องไม่ย้อนหลัง';
  end if;

  select coalesce(nullif(btrim(name), ''), audit_actor()) into v_name from profiles where id = auth.uid();
  update hq_quotes set status = 'sent', sent_at = now(), sent_by = auth.uid(), sent_by_name = coalesce(v_name, audit_actor())
   where id = h.id returning * into h;
  update quote_requests set status = 'quoted', quoted_at = now() where id = p_request_id;

  -- เวอร์ชันใหม่ถึงมือดีลเลอร์แล้ว → ใบของดีลเลอร์ที่ยังค้างอยู่กับเวอร์ชันก่อนหน้าในงานเดียวกัน หมดอายุ
  update quotations q
     set status = 'expired', expired_reason = hq_version_expired_reason()
    from hq_quotes oh
    join quote_requests orq on orq.id = oh.request_id
   where q.hq_quote_id = oh.id
     and oh.id <> h.id
     and coalesce(orq.root_id, orq.id) = coalesce(r.root_id, r.id)
     and q.status in ('draft', 'sent_to_client');
  return h;
end $$;

-- ═══ 5. ส่งแล้ว ผู้ส่ง/เวลาส่งก็แก้ไม่ได้ ═══════════════════════════════════════════════════
create or replace function public.hq_quotes_lock_sent() returns trigger
  language plpgsql set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'hq_quote_locked: ใบ HQ ที่ส่งแล้วลบไม่ได้'; end if;
    return old;
  end if;
  if old.status <> 'draft' and (
       new.line_items is distinct from old.line_items or new.total_cost is distinct from old.total_cost
    or new.valid_until is distinct from old.valid_until or new.version is distinct from old.version
    or new.request_id is distinct from old.request_id or new.quote_no is distinct from old.quote_no
    -- sent_by กลายเป็นว่างได้ทางเดียวคือบัญชีผู้ส่งถูกลบ (ชื่อผู้ส่งยังอยู่ใน sent_by_name)
    or (new.sent_by is distinct from old.sent_by and new.sent_by is not null) or new.sent_by_name is distinct from old.sent_by_name
    or new.sent_at is distinct from old.sent_at) then
    raise exception 'hq_quote_locked: ใบ HQ ที่ส่งแล้วแก้ไม่ได้ — ต้องออกเวอร์ชันใหม่ผ่านการขอแก้ราคา';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'draft'   and new.status = 'sent')
    or (old.status = 'sent'    and new.status in ('ordered', 'superseded'))
    or (old.status = 'ordered' and new.status = 'sent')) then        -- ย้อนการตอบรับของลูกค้า
    raise exception 'hq_quote_locked: เปลี่ยนสถานะใบ HQ จาก % เป็น % ไม่ได้', old.status, new.status;
  end if;
  return new;
end $$;
