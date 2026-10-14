-- ── ลบดีลเลอร์ / ย้ายข้อมูลดีลเลอร์ ต้องรู้จักตารางของ Flow ใหม่ (คำขอราคา · ใบ HQ) ──────────────────
--
-- ที่มา (13 ต.ค. 69): สองคำสั่งนี้เขียนรายชื่อตารางไว้ตายตัวตั้งแต่ก่อนมีตารางคำขอราคา (0183)
--   ตรวจด้วยข้อทดสอบจริงแล้ว "ยังไม่มีข้อมูลเสียหาย" — เพราะโครงของฐานช่วยไว้ ไม่ใช่เพราะคำสั่งตั้งใจ:
--     ลบ:  คำขอราคาต้องมีลูกค้าเป้าหมายเสมอ สาขาที่มีคำขอราคาจึงถูกปฏิเสธที่ตาราง leads ไปก่อน (409 ถูกต้อง)
--     ย้าย: กุญแจนอก (รหัสสาขา, เลขลูกค้าเป้าหมาย) ของคำขอราคาเป็นแบบแก้ตาม จึงตามลูกค้าเป้าหมายไปเอง
--   สิ่งที่ผิดจริง: ผลที่คำสั่งย้ายรายงานกลับ (และที่ลงบันทึกการใช้งาน) ไม่นับคำขอราคาและใบ HQ ที่ย้าย
--   และไม่มีอะไรเตือนเมื่อเพิ่มตารางใหม่ที่ผูกกับสาขา — ตัวตรวจ scripts/db-audit5.mjs เจอ 5 จุดที่คำสั่งไม่รู้จัก
--
-- แก้:
--   ลบ:  นับคำขอราคาเป็น "ข้อมูลของสาขา" ในตัวคำสั่งเอง (ไม่ฝากไว้กับตาราง leads)
--        และตรวจคำขอราคาก่อนตารางอื่น — ผู้ดูแลได้รู้ว่าสิ่งที่ค้างคือคำขอราคา (ซึ่งกันการลบลูกค้าเป้าหมายอยู่ด้วย)
--        ล้างประวัติ/คำขอเปลี่ยนบัญชีในธุรกรรมเดียวกับการลบสาขา (เดิมเส้นทางของ HQ ลบเองทีหลัง นอกธุรกรรม)
--        สาขาที่มีใบ HQ ส่งแล้ว: ปฏิเสธด้วยเหตุผลเฉพาะ (dealer_has_hq_quote) — เส้นทางของ HQ บอกทางไปต่อ: ปิดใช้งานหรือย้ายข้อมูล
--   ย้าย: พูดถึงคำขอราคาตรง ๆ · มีด่านหยุดทั้งธุรกรรมถ้าคำขอราคาไม่ตามไปครบหรือหลุดจากลูกค้าเป้าหมาย
--        รายงานจำนวนคำขอราคาและใบ HQ ที่ย้าย
--   ใบ HQ: จำ "ผู้รับ" (รหัสสาขา + ชื่อสาขา) ไว้บนใบตอนส่ง แก้ไม่ได้หลังส่ง
--        ใบ HQ ไม่มีรหัสสาขาของตัวเอง รู้ผู้รับผ่านคำขอราคา — ย้ายข้อมูลสาขาแล้วใบที่ออกให้สาขา ก จะกลายเป็นของสาขา ข ย้อนหลัง
--        และเปลี่ยนชื่อสาขาแล้วชื่อบนใบเก่าเปลี่ยนตาม · ใบที่ส่งแล้วเป็นหลักฐาน ต้องบอกได้ว่าตอนนั้นออกให้ใคร
-- สิทธิ์เรียกคำสั่งไม่เปลี่ยน (create or replace คงสิทธิ์เดิมของใบ 0188: ฝั่งเซิร์ฟเวอร์เท่านั้น)
-- (นิยามเดิมทุกบรรทัด แก้เฉพาะจุดข้างบน — สร้างจากตัวที่ใช้งานอยู่ ไม่ได้พิมพ์ใหม่)

CREATE OR REPLACE FUNCTION public.delete_dealer_atomic(p_code text)
 RETURNS TABLE(member_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t       text;
  n       integer;
  members uuid[];
begin
  -- auth.uid() ว่าง = เรียกจากเซิร์ฟเวอร์ด้วย service_role (ผ่านการตรวจสิทธิ์มาแล้วที่ชั้น route)
  if auth.uid() is not null and not can_write_master() then
    raise exception 'forbidden: no permission to delete dealer';
  end if;

  -- ใบ HQ ที่ส่งแล้วคือหลักฐานราคาที่สำนักงานใหญ่ออกให้ ลบไม่ได้ (ตัวล็อก hq_quotes_lock_sent) — สาขาที่มีใบแบบนี้จึงลบไม่ได้ตลอดไป
  --   บอกเหตุผลนี้แยกจาก "ยังมีข้อมูล": ทางไปต่อคือปิดใช้งานสาขาหรือย้ายข้อมูล ไม่ใช่ไปไล่ลบข้อมูล (ซึ่งลบไม่ได้อยู่ดี)
  select count(*) into n from hq_quotes h join quote_requests r on r.id = h.request_id
   where r.dealer_code = p_code and h.status <> 'draft';
  if n > 0 then
    raise exception 'dealer_has_hq_quote:%', n;
  end if;

  foreach t in array array['quote_requests','leads','quotations','customers','appointments','files','customer_notes'] loop
    execute format('select count(*) from %I where dealer_code = $1', t) into n using p_code;
    if n > 0 then
      raise exception 'dealer_has_data:%:%', t, n;
    end if;
  end loop;

  select coalesce(array_agg(id), '{}') into members from profiles where dealer_code = p_code;

  delete from responsible_persons where dealer_code = p_code;
  delete from dealer_lead_rules   where dealer_code = p_code;
  -- ประวัติ/คำขอเปลี่ยนบัญชีของรหัสนี้ (0165) ผูกด้วยรหัสสาขาเฉย ๆ ไม่มีกุญแจนอก จึงไม่หายตามแถวสาขา
  --   รหัสสาขาถูกนำกลับมาใช้ใหม่ได้ — ไม่ล้าง = สาขาใหม่รับโควตาแก้บัญชีและคำขอค้างของสาขาเก่าไปด้วย
  --   เดิมเส้นทางของ HQ ลบสองตารางนี้เองหลังคำสั่งนี้จบ (นอกธุรกรรม · ล้มแล้วไม่ย้อน) ย้ายเข้ามาอยู่ในธุรกรรมเดียวกัน (0189)
  delete from dealer_account_changes  where dealer_code = p_code;
  delete from dealer_account_requests where dealer_code = p_code;

  delete from dealers where code = p_code;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'dealer_not_found:%', p_code;
  end if;

  return query select unnest(members);
end $function$;

CREATE OR REPLACE FUNCTION public.move_dealer_data_atomic(p_from text, p_to text)
 RETURNS TABLE(entity text, moved bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t text;
  n bigint;
  n_req bigint;
  n_hq  bigint;
begin
  -- auth.uid() ว่าง = เรียกจากเซิร์ฟเวอร์ด้วย service_role (ผ่านการตรวจสิทธิ์มาแล้วที่ชั้น route)
  if auth.uid() is not null and not can_write_master() then
    raise exception 'forbidden: no permission to move dealer data';
  end if;

  if p_from is null or p_to is null or p_from = p_to then
    raise exception 'same_dealer: ต้นทางและปลายทางต้องคนละสาขา';
  end if;
  if not exists (select 1 from dealers where code = p_from) then
    raise exception 'dealer_not_found:%', p_from;
  end if;
  if not exists (select 1 from dealers where code = p_to) then
    raise exception 'dealer_not_found:%', p_to;
  end if;

  -- ── ด่านเลขชน — ตรวจให้ครบทุกตารางก่อน แล้วค่อยเริ่มย้าย ──
  foreach t in array array['leads','quotations','customers','appointments'] loop
    execute format(
      'select count(*) from %I a where a.dealer_code = $1 and exists '
      '(select 1 from %I b where b.dealer_code = $2 and b.id = a.id)', t, t)
      into n using p_from, p_to;
    if n > 0 then
      raise exception 'id_conflict:%:%', t, n;
    end if;
  end loop;

  -- ── คำขอราคาและใบ HQ ของสาขาต้นทาง (0189) — นับไว้ก่อนย้าย ──
  select count(*) into n_req from quote_requests where dealer_code = p_from;
  select count(*) into n_hq  from hq_quotes h join quote_requests r on r.id = h.request_id where r.dealer_code = p_from;

  -- ── คัดลอกผู้รับผิดชอบที่ถูกอ้างอิงอยู่จริง (ตามชื่อ) ──
  insert into responsible_persons (dealer_code, name, title, phone, email, active, avatar)
  select p_to, rp.name, rp.title, rp.phone, rp.email, rp.active, rp.avatar
    from responsible_persons rp
   where rp.dealer_code = p_from
     and rp.name is not null and rp.name <> ''
     and (exists (select 1 from leads     l where l.dealer_code = p_from and l.assigned = rp.name)
       or exists (select 1 from customers c where c.dealer_code = p_from and c.owner    = rp.name))
     and not exists (select 1 from responsible_persons y where y.dealer_code = p_to and y.name = rp.name);

  -- ── ย้ายจริง · ลำดับสำคัญ: แม่ก่อนลูก ──
  --   customers ต้องมาก่อน leads/quotations ที่อ้างถึง
  --   leads ต้องมาก่อน quotations/appointments ที่อ้างถึง
  --   files/customer_notes เลขที่ไม่ซ้ำทั้งระบบ (identity) ไม่มีใครอ้างถึง จึงอยู่ท้ายสุดได้
  foreach t in array array['customers','leads','quotations','appointments','files','customer_notes'] loop
    execute format('update %I set dealer_code = $2 where dealer_code = $1', t) using p_from, p_to;
    get diagnostics n = row_count;
    entity := t; moved := n; return next;
  end loop;

  -- ── คำขอราคา + ใบ HQ (0189) ──
  -- คำขอราคาผูกกับลูกค้าเป้าหมายด้วย (รหัสสาขา, เลขลูกค้าเป้าหมาย) แบบแก้ตาม — ตอนย้าย leads ข้างบน คำขอราคาตามไปแล้ว
  --   และยังชี้ลูกค้าเป้าหมายรายเดิม (เลขลูกค้าเป้าหมายไม่เปลี่ยนตอนย้าย · ด่านเลขชนกันไว้แล้ว)
  --   ใบ HQ และประวัติคำขอราคาไม่มีรหัสสาขาของตัวเอง ผูกกับคำขอราคาด้วยเลขคำขอ จึงตามไปเอง
  -- บรรทัด update นี้ปกติได้ 0 แถว — มีไว้ให้คำสั่งพูดชัดว่าคำขอราคาต้องย้าย ไม่ฝากไว้กับกติกาของกุญแจนอกอย่างเดียว
  --   ถ้าวันหนึ่งกุญแจนอกถูกเปลี่ยนจนคำขอราคาไม่ตามไป ด่านข้างล่างจะหยุดทั้งธุรกรรม ไม่ปล่อยให้ย้ายไปครึ่งเดียว
  update quote_requests set dealer_code = p_to where dealer_code = p_from;
  select count(*) into n from quote_requests r where r.dealer_code = p_from;
  if n > 0 then
    raise exception 'move_incomplete:quote_requests:%', n;
  end if;
  select count(*) into n from quote_requests r
   where r.dealer_code = p_to
     and not exists (select 1 from leads l where l.dealer_code = r.dealer_code and l.num_id = r.lead_num_id);
  if n > 0 then
    raise exception 'move_incomplete:quote_requests_without_lead:%', n;
  end if;
  entity := 'quote_requests'; moved := n_req; return next;
  entity := 'hq_quotes';      moved := n_hq;  return next;

  -- ── ตัวนับเลขที่ ──
  -- ลบทิ้งทั้งสองฝั่ง: next_entity_id จะตั้งต้นใหม่จาก max(id) จริงของสาขานั้นเองเมื่อถูกเรียกครั้งถัดไป
  delete from entity_counters where dealer_code in (p_from, p_to);

  return;
end $function$;

-- ═══ ผู้รับของใบ HQ: จำไว้ตอนส่ง ═══════════════════════════════════════════════════════════
alter table public.hq_quotes
  add column if not exists recipient_dealer_code text not null default '',
  add column if not exists recipient_dealer_name text not null default '';
comment on column public.hq_quotes.recipient_dealer_code is 'รหัสสาขาที่ใบนี้ถูกส่งให้ ณ ตอนส่ง (ว่าง = ยังเป็นร่าง) · ระบบใส่เอง แก้ไม่ได้หลังส่ง · ไม่เปลี่ยนตามการย้ายข้อมูลสาขา';
comment on column public.hq_quotes.recipient_dealer_name is 'ชื่อสาขาผู้รับ ณ ตอนส่ง · ไม่เปลี่ยนตามการเปลี่ยนชื่อสาขาทีหลัง';

-- ใบที่ส่งไปก่อนมีสองช่องนี้: เติมจากสาขาเจ้าของคำขอ ณ ตอนนี้ (ข้อมูลที่ดีที่สุดที่มี — ยังไม่เคยมีการย้ายข้อมูลสาขาที่มีใบ HQ)
--   ปิดตัวล็อกชั่วคราวเฉพาะคำสั่งนี้ (อยู่ในธุรกรรมของใบแก้ฐานข้อมูล ล้มแล้วย้อนทั้งหมด)
alter table public.hq_quotes disable trigger hq_quotes_lock_sent;
update public.hq_quotes h
   set recipient_dealer_code = r.dealer_code, recipient_dealer_name = d.name
  from public.quote_requests r join public.dealers d on d.code = r.dealer_code
 where r.id = h.request_id and h.status <> 'draft' and h.recipient_dealer_code = '';
alter table public.hq_quotes enable trigger hq_quotes_lock_sent;

/** ใส่ผู้รับของใบ HQ เอง: ร่าง = ว่างเสมอ · ตอนเปลี่ยนเป็นส่งแล้ว (หรือถูกสร้างเป็นส่งแล้วตั้งแต่แรก) = สาขาเจ้าของคำขอ ณ ตอนนั้น
 *  ค่าที่ผู้เรียกใส่มาถูกทับเสมอ — ผู้รับไม่ใช่สิ่งที่เลือกได้ มาจากคำขอราคาเท่านั้น
 *  ทำงานด้วยสิทธิ์เจ้าของ: การอ่านคำขอราคา/สาขาต้องไม่ขึ้นกับกฎรายแถวของผู้ส่ง · เป็นตัวดักเท่านั้น ไม่มีใครเรียกตรงได้ */
create or replace function public.hq_quotes_set_recipient() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status = 'draft' then
    new.recipient_dealer_code := '';
    new.recipient_dealer_name := '';
  elsif tg_op = 'INSERT' or old.status = 'draft' then
    select r.dealer_code, d.name into new.recipient_dealer_code, new.recipient_dealer_name
      from quote_requests r join dealers d on d.code = r.dealer_code
     where r.id = new.request_id;
  end if;
  return new;
end $$;
revoke all on function public.hq_quotes_set_recipient() from public, anon, authenticated;

-- ชื่อตัวดักต้องเรียงหลัง hq_quotes_lock_sent (ตัวดักทำงานตามลำดับชื่อ): ตัวล็อกตรวจค่าที่ผู้เรียกส่งมาก่อน แล้วตัวนี้ค่อยใส่ผู้รับ
drop trigger if exists hq_quotes_set_recipient on public.hq_quotes;
create trigger hq_quotes_set_recipient before insert or update on public.hq_quotes
  for each row execute function public.hq_quotes_set_recipient();

-- ตัวล็อกใบ HQ: ผู้รับแก้ไม่ได้หลังส่ง (นิยามเดิมทุกบรรทัด เพิ่มเฉพาะสองช่องผู้รับ)
CREATE OR REPLACE FUNCTION public.hq_quotes_lock_sent()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
    or new.sent_at is distinct from old.sent_at
    or new.recipient_dealer_code is distinct from old.recipient_dealer_code
    or new.recipient_dealer_name is distinct from old.recipient_dealer_name) then
    raise exception 'hq_quote_locked: ใบ HQ ที่ส่งแล้วแก้ไม่ได้ — ต้องออกเวอร์ชันใหม่ผ่านการขอแก้ราคา';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'draft'   and new.status = 'sent')
    or (old.status = 'sent'    and new.status in ('ordered', 'superseded'))
    or (old.status = 'ordered' and new.status = 'sent')) then        -- ย้อนการตอบรับของลูกค้า
    raise exception 'hq_quote_locked: เปลี่ยนสถานะใบ HQ จาก % เป็น % ไม่ได้', old.status, new.status;
  end if;
  return new;
end $function$;
