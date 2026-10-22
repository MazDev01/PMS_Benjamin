-- ── ใบ 0232: สถานะลีดเปลี่ยนได้ทางเดียว (รอบ 4 · บอสสั่ง 21 ต.ค. 69 ข้อ 2 · 4 · 5 + ข้อตัดสิน 1 · 2) ───────────────────────
--
-- เดิม: ดีลเลอร์ตั้งสถานะลีดได้ 4 ทาง — ป้ายในตาราง (เมนูเลือกขั้น) · ลากการ์ดบนบอร์ด · ติ๊กงาน (ฐานเลื่อนขั้นตามงาน)
--   · ปุ่ม ได้งาน/ไม่ได้งาน/เปิดใหม่ ในแท็บงาน → สถานะบนจอพูดไม่ตรงกับของจริง และปิดสำเร็จได้โดยไม่มีใบที่ลูกค้าตอบรับ
-- ใบนี้ (ฐานปฏิเสธเอง ไม่พึ่งหน้าจอ):
--   1) ดีลเลอร์เปลี่ยนสถานะเองได้อย่างเดียว = "ปิดไม่สำเร็จ" (ปุ่มในกล่องขั้นต่อไป) · สร้างลีดใหม่ได้แค่ ติดต่อแล้ว / รวบรวมความต้องการ
--      ขั้นอื่นทั้งหมดฐานเลื่อนให้เองตามคำขอราคา/ใบเสนอราคา (pms.flow_sync) · "ติดตามผล" "เจรจาต่อรอง" เลิกใช้ (ลีดเก่าคงไว้)
--      ไม่มี "เปิดใหม่" แล้ว — ลีดที่ปิดไม่สำเร็จ ดีลเลอร์พากลับไม่ได้
--   2) มีใบที่ส่งให้ลูกค้าอยู่ (ขั้น 5) = ปิดไม่สำเร็จที่ลีดไม่ได้ ต้องกด "ลูกค้าปฏิเสธ" ที่ใบ (ข้อตัดสิน 2 · ฐานปิดลีดให้เอง)
--   3) ลีดเป็น "ปิดการขายสำเร็จ" ได้เฉพาะเมื่อมีใบของดีลนี้ที่ลูกค้าตอบรับแล้ว — ทุกบทบาท (รวม HQ และคำสั่งของระบบ)
--   4) คำสั่งบันทึกลีด (lead_apply) ไม่เลื่อนขั้นจากงานอีก (งาน = รายการเตือนอย่างเดียว) · deriveStage ที่ส่งมาถูกเมิน
-- ไม่ตรวจ: service role / งานในฐาน (กู้ข้อมูล · ชุดล้างข้อมูลทดสอบ) — แบบเดียวกับตัวดักลีดตัวอื่น (0186 · 0217)
-- ข้อทดสอบ: supabase/tests/lead_one_path.sql

-- ═══ 1. ตัวดักทางเปลี่ยนสถานะ ═══════════════════════════════════════════════════════════════════════════════════
create or replace function public.leads_status_one_path() returns trigger
  language plpgsql set search_path to 'public' as $$
declare ระบบ boolean := coalesce(current_setting('pms.flow_sync', true), '') = '1';
begin
  if coalesce(auth.role(), '') <> 'authenticated' and not ระบบ then return new; end if;   -- service role / งานในฐาน

  -- ข้อ 3 ปิดสำเร็จต้องมีใบที่ตอบรับ (ทุกบทบาท รวมคำสั่งของระบบ)
  if new.status = 'PAID' and (tg_op = 'INSERT' or old.status is distinct from 'PAID') and not exists (
       select 1 from quotations q
        where q.dealer_code = new.dealer_code and q.status = 'won'
          and (q.deal_id = new.num_id or (q.deal_id is null and q.customer = new.company))) then
    raise exception 'lead_won_needs_accepted_quote: ปิดการขายสำเร็จได้ทางเดียว — กด "ลูกค้าตอบรับ" ที่ใบเสนอราคาในแผงลูกค้าเป้าหมาย';
  end if;

  if ระบบ or is_hq() then return new; end if;

  -- ข้อ 1 ดีลเลอร์
  if tg_op = 'INSERT' then
    if new.status not in ('WAITING', 'BULLET') then
      raise exception 'lead_status_one_path: ลูกค้าเป้าหมายใหม่เริ่มได้ที่ "ติดต่อแล้ว" หรือ "รวบรวมความต้องการ" เท่านั้น — ขั้นอื่นระบบเลื่อนให้เอง';
    end if;
    return new;
  end if;
  if new.status is not distinct from old.status then return new; end if;
  if new.status <> 'CANCELLED' then
    raise exception 'lead_status_one_path: เปลี่ยนสถานะเองได้เฉพาะ "ปิดไม่สำเร็จ" ที่กล่องขั้นต่อไป — ขั้นอื่นระบบเลื่อนให้เองตามคำขอราคาและใบเสนอราคา';
  end if;
  -- ข้อ 2 มีใบที่ส่งให้ลูกค้าอยู่ → ปิดที่ใบ
  if exists (select 1 from quotations q where q.dealer_code = new.dealer_code and q.deal_id = new.num_id and q.status = 'sent_to_client') then
    raise exception 'lead_has_sent_quote: มีใบเสนอราคาที่ส่งให้ลูกค้าอยู่ — ลูกค้าไม่เอา ให้กด "ลูกค้าปฏิเสธ" ที่ใบ (ระบบปิดลูกค้าเป้าหมายให้เอง)';
  end if;
  return new;
end $$;
revoke all on function public.leads_status_one_path() from public, anon, authenticated, service_role;

drop trigger if exists leads_status_one_path on public.leads;
create trigger leads_status_one_path before insert or update of status on public.leads
  for each row execute function public.leads_status_one_path();

-- ═══ 2. คำสั่งบันทึกลีด: ไม่เลื่อนขั้นจากงาน (ยกจาก 0219 · ตัดส่วน deriveStage ออก ที่เหลือเหมือนเดิมทุกบรรทัด) ════════════════
create or replace function public.lead_apply(p_id text, p_intent jsonb) returns public.leads
  language plpgsql security invoker set search_path to 'public' as $$
declare
  l          leads;
  f          jsonb := coalesce(p_intent -> 'fields', '{}'::jsonb);
  ช่องได้     text[] := array['name','company','contact','phone','email','province','product','category','value','area',
                              'assigned','source','note','report','project','address','logo','customer_id'];
  จด         boolean := coalesce((p_intent ->> 'log')::boolean, true);
  tpl        jsonb;
  v_tasks    jsonb;
  c          jsonb;
  k          text;
  เดิมทำ      boolean;
  logs       jsonb := '[]'::jsonb;
  ขั้นใหม่     lead_status;
  เหตุผล      text;
  ป้าย        jsonb := '{"WAITING":"ติดต่อแล้ว","BULLET":"รวบรวมความต้องการ","HQ_PRICING":"รอราคา HQ","HQ_QUOTED":"ได้ราคา HQ","QUOTED":"เสนอราคา",
                         "FOLLOWUP":"ติดตามผล","NEGO":"เจรจาต่อรอง","PAID":"ปิดการขายสำเร็จ","CANCELLED":"ปิดการขายไม่สำเร็จ"}';
  ตอนนี้      text := _thai_date(now(), true);
  งานเปลี่ยน   boolean := false;
begin
  if jsonb_typeof(f) <> 'object' then raise exception 'lead_intent_invalid: fields ต้องเป็นออบเจ็กต์'; end if;
  select k2 into k from jsonb_object_keys(f) k2 where k2 <> all(ช่องได้) limit 1;
  if k is not null then
    raise exception 'lead_field_not_allowed: ช่อง "%" แก้ทางนี้ไม่ได้ (ขั้น/งาน/ไทม์ไลน์ ฐานเป็นเจ้าของ)', k;
  end if;

  select * into l from leads where id = p_id for update;
  if not found then raise exception 'not_found: ไม่พบลูกค้าเป้าหมายนี้ (อาจถูกลบ หรือไม่มีสิทธิ์)'; end if;   -- not_found: = เซิร์ฟเวอร์ตอบ 404
  select j.tasks into tpl from hq_sales_journey j order by j.id limit 1;
  tpl := coalesce(tpl, '[]'::jsonb);

  -- ── งาน (รายการเตือน): รวมทีละงาน · ไม่เลื่อนขั้น ──
  v_tasks := case when jsonb_typeof(l.tasks) = 'array' and jsonb_array_length(l.tasks) > 0 then l.tasks
                  else coalesce((select jsonb_agg(jsonb_build_object('key', t ->> 'key', 'label', t ->> 'label', 'done', false) order by o)
                                   from jsonb_array_elements(tpl) with ordinality as e(t, o)), '[]'::jsonb) end;
  for c in select * from jsonb_array_elements(coalesce(p_intent -> 'tasks', '[]'::jsonb)) loop
    k := c ->> 'key';
    if coalesce(k, '') = '' then continue; end if;
    select coalesce((t ->> 'done')::boolean, false) into เดิมทำ from jsonb_array_elements(v_tasks) t where t ->> 'key' = k limit 1;
    if not found then
      v_tasks := v_tasks || jsonb_build_array(jsonb_build_object('key', k, 'label', coalesce(c ->> 'label', k), 'done', false));
      เดิมทำ := false;
    end if;
    if coalesce((c ->> 'done')::boolean, false) and not เดิมทำ then
      v_tasks := (select jsonb_agg(case when t ->> 'key' = k then t || jsonb_build_object('done', true,
                     'doneAt', coalesce(nullif(c ->> 'doneAt', ''), ตอนนี้),
                     'doneBy', coalesce(nullif(btrim(c ->> 'doneBy'), ''), nullif(btrim(l.assigned), ''), 'อัปเดตอัตโนมัติ'))
                   else t end order by o) from jsonb_array_elements(v_tasks) with ordinality as e(t, o));
      งานเปลี่ยน := true;
      if จด then
        logs := logs || jsonb_build_array(jsonb_build_object('date', ตอนนี้, 'icon', 'task', 'type', 'task',
                  'text', 'ทำงาน: ' || coalesce((select t ->> 'label' from jsonb_array_elements(v_tasks) t where t ->> 'key' = k limit 1), k)));
      end if;
    elsif not coalesce((c ->> 'done')::boolean, false) and เดิมทำ then
      v_tasks := (select jsonb_agg(case when t ->> 'key' = k then (t - 'doneAt' - 'doneBy') || jsonb_build_object('done', false)
                   else t end order by o) from jsonb_array_elements(v_tasks) with ordinality as e(t, o));
      งานเปลี่ยน := true;
    end if;
  end loop;

  -- ── ขั้น: เฉพาะที่ผู้ใช้ตั้งใจเปลี่ยน (ตัวดัก leads_status_one_path ตัดสินว่าทำได้ไหม) ──
  ขั้นใหม่ := l.status;
  เหตุผล := l.lost_reason;
  if jsonb_typeof(p_intent -> 'stage') = 'object' then
    ขั้นใหม่ := (p_intent -> 'stage' ->> 'status')::lead_status;
    if ขั้นใหม่ = 'CANCELLED' and nullif(btrim(p_intent -> 'stage' ->> 'lostReason'), '') is not null then
      เหตุผล := btrim(p_intent -> 'stage' ->> 'lostReason');
    end if;
  end if;

  if ขั้นใหม่ is distinct from l.status then
    if ขั้นใหม่ = 'CANCELLED' and coalesce(btrim(เหตุผล), '') = '' then
      raise exception 'lead_lost_needs_reason: ปิดการขายไม่สำเร็จต้องระบุเหตุผลเสมอ';
    end if;
    if จด then
      logs := logs || jsonb_build_array(jsonb_build_object('date', ตอนนี้, 'icon', 'task', 'type', 'task',
                'text', 'เปลี่ยนขั้นเป็น "' || (ป้าย ->> ขั้นใหม่::text) || '"'));
    end if;
  elsif ขั้นใหม่ = 'CANCELLED' and เหตุผล is distinct from l.lost_reason and coalesce(btrim(เหตุผล), '') = '' then
    raise exception 'lead_lost_needs_reason: ปิดการขายไม่สำเร็จต้องระบุเหตุผลเสมอ';
  end if;

  if จด and f ? 'assigned' and nullif(btrim(f ->> 'assigned'), '') is not null and (f ->> 'assigned') is distinct from l.assigned then
    logs := logs || jsonb_build_array(jsonb_build_object('date', ตอนนี้, 'icon', 'note', 'type', 'note',
              'text', 'เปลี่ยนผู้รับผิดชอบเป็น ' || (f ->> 'assigned')));
  end if;
  for c in select * from jsonb_array_elements(coalesce(p_intent -> 'activities', '[]'::jsonb)) loop
    if nullif(btrim(c ->> 'text'), '') is null then continue; end if;
    logs := logs || jsonb_build_array(jsonb_build_object('date', ตอนนี้, 'icon', coalesce(nullif(c ->> 'type', ''), 'task'),
              'type', coalesce(nullif(c ->> 'type', ''), 'task'), 'text', c ->> 'text'));
  end loop;
  logs := (select coalesce(jsonb_agg(x || jsonb_build_object('id',
             coalesce((select max((a ->> 'id')::numeric) from jsonb_array_elements(coalesce(l.activities, '[]'::jsonb)) a
                        where (a ->> 'id') ~ '^\d+(\.\d+)?$'), 0) + o) order by o), '[]'::jsonb)
             from jsonb_array_elements(logs) with ordinality as e(x, o));

  update leads set
    name     = case when f ? 'name'     then f ->> 'name'     else name end,
    company  = case when f ? 'company'  then f ->> 'company'  else company end,
    contact  = case when f ? 'contact'  then f ->> 'contact'  else contact end,
    phone    = case when f ? 'phone'    then f ->> 'phone'    else phone end,
    email    = case when f ? 'email'    then f ->> 'email'    else email end,
    province = case when f ? 'province' then f ->> 'province' else province end,
    product  = case when f ? 'product'  then f ->> 'product'  else product end,
    category = case when f ? 'category' then f ->> 'category' else category end,
    value    = case when f ? 'value'    then f ->> 'value'    else value end,
    area     = case when f ? 'area'     then f ->> 'area'     else area end,
    assigned = case when f ? 'assigned' then f ->> 'assigned' else assigned end,
    source   = case when f ? 'source'   then f ->> 'source'   else source end,
    note     = case when f ? 'note'     then f ->> 'note'     else note end,
    report   = case when f ? 'report'   then f ->> 'report'   else report end,
    project  = case when f ? 'project'  then f ->> 'project'  else project end,
    address  = case when f ? 'address'  then f ->> 'address'  else address end,
    logo     = case when f ? 'logo'     then f ->> 'logo'     else logo end,
    customer_id = case when f ? 'customer_id' then nullif(f ->> 'customer_id', '')::integer else customer_id end,
    tasks    = case when งานเปลี่ยน then v_tasks else tasks end,
    activities = case when jsonb_array_length(logs) > 0 then coalesce(activities, '[]'::jsonb) || logs else activities end
  where id = p_id;
  if ขั้นใหม่ is distinct from l.status or เหตุผล is distinct from l.lost_reason then
    update leads set status = ขั้นใหม่, lost_reason = เหตุผล where id = p_id;
  end if;

  select * into l from leads where id = p_id;
  return l;
end $$;
revoke all on function public.lead_apply(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.lead_apply(text, jsonb) to authenticated;
