-- ── ใบ 0219: HQ ส่งใบ → ฐานขยับลีดเป็น "ได้ราคา HQ" เอง (บอสตัดสิน 19 ต.ค. 69 · รอบ 2 ช่วง ก2) ───────────────────────
--
-- สาเหตุเดิม: hq_quote_send (0185) เปลี่ยนแค่ใบ HQ = ส่งแล้ว · คำขอ = ส่งใบแล้ว ไม่แตะลีด (ตั้งใจตามใบ 0183/0200
--   "Lead คงเดิม + ป้ายได้ราคาแล้ว") ลีดออกจาก "รอราคา HQ" ได้ทางเดียวคือดีลเลอร์ส่งใบให้ลูกค้า
--   → ป้ายบนจอบอก "ได้ราคาแล้ว" แต่ตัวกรอง/ตัวเลข/กล่องงาน นับเป็นรอราคา
--
-- ใบนี้ (ใช้ค่า HQ_QUOTED จากใบ 0218):
--   1) คำขอ ใหม่/กำลังตีราคา → ส่งใบแล้ว (HQ ส่งใบ) : ลีด รอราคา HQ → ได้ราคา HQ        [ตัวดักที่ quote_requests]
--   2) ดีลเลอร์ส่งใบให้ลูกค้า : ลีด ได้ราคา HQ (หรือรอราคา HQ) → เสนอราคา              [quotations_flow_sync]
--   3) "ได้ราคา HQ" ตั้งเองไม่ได้ · ออกเองได้ทางเดียว = เสียโอกาส (ปิดไม่สำเร็จ + เหตุผล)   [leads_hq_pricing_guard]
--      ดีลเลอร์ปิดไม่สำเร็จตอนได้ราคา HQ → คำขอปิด (lost) ด้วย ให้กล่องงาน HQ ไม่ค้าง "รอดีลเลอร์"
--   4) ใบ HQ หมดอายุ ขณะลีด "ได้ราคา HQ" และยังไม่ได้ส่งใบให้ลูกค้า : ลีด → รวบรวมความต้องการ
--      เหตุผล: ลูกบอลกลับมาที่ดีลเลอร์ (ต้องขอราคาใหม่) — ผลเดียวกับดีลเลอร์ยกเลิกคำขอ (0183) · ไม่ใช่รอราคา (HQ ไม่ได้ถืองาน)
--        และไม่ใช่ได้ราคา (ราคาใช้ไม่ได้แล้ว) · ขอราคาใหม่ได้จากแผงลีด (ขอแก้ราคา → รอราคา HQ)
--      ทำในงานตั้งเวลาเดิม expire-hq-linked-quotations (ทุกชั่วโมง นาทีที่ 5 · ใบ 0201)
--   5) คำสั่งบันทึกลีด (lead_apply) รู้จักสถานะใหม่ · ไม่เลื่อนขั้นจากงานขณะได้ราคา HQ
--   6) แก้ลีดที่ค้างอยู่แล้ว: รอราคา HQ แต่ใบ HQ ส่งแล้ว → ได้ราคา HQ (ใบหมดอายุแล้ว → รวบรวมความต้องการ) · นับก่อน/หลัง
-- ข้อทดสอบ: supabase/tests/lead_hq_quoted.sql · tests/scenario/flow-a2-hq-quoted.spec.ts

-- ═══ 1. HQ ส่งใบ → ลีดได้ราคา HQ ═══════════════════════════════════════════════════════════════════════════════
create or replace function public.quote_requests_lead_quoted() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status = 'quoted' and old.status in ('new', 'pricing') then
    if exists (select 1 from leads where dealer_code = new.dealer_code and num_id = new.lead_num_id and status = 'HQ_PRICING') then
      perform _lead_flow_set_status(new.dealer_code, new.lead_num_id, 'HQ_QUOTED');
    end if;
  end if;
  return new;
end $$;
revoke all on function public.quote_requests_lead_quoted() from public, anon, authenticated, service_role;
drop trigger if exists quote_requests_lead_quoted on public.quote_requests;
create trigger quote_requests_lead_quoted after update of status on public.quote_requests
  for each row execute function public.quote_requests_lead_quoted();

-- ═══ 2. ดีลเลอร์ส่งใบให้ลูกค้า → เสนอราคา (ยกจาก 0183 · เปลี่ยนเฉพาะเงื่อนไขขั้น sent_to_client) ═════════════════════════
create or replace function public.quotations_flow_sync() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare
  h hq_quotes;
  r quote_requests;
  was text := case when tg_op = 'UPDATE' then old.status::text else '' end;
begin
  if new.hq_quote_id is null or new.status::text = was then return new; end if;
  select * into h from hq_quotes where id = new.hq_quote_id for update;
  select * into r from quote_requests where id = h.request_id for update;

  if new.status = 'sent_to_client' then
    -- ดีลเลอร์ส่งใบให้ลูกค้า: คำขอคงเดิม · ลูกค้าเป้าหมาย ได้ราคา HQ (หรือรอราคา HQ ของใบเดิม) → เสนอราคา
    if exists (select 1 from leads where dealer_code = r.dealer_code and num_id = r.lead_num_id and status in ('HQ_PRICING', 'HQ_QUOTED')) then
      perform _lead_flow_set_status(r.dealer_code, r.lead_num_id, 'QUOTED');
    end if;

  elsif new.status = 'won' then
    -- ลูกค้าตอบรับ: ใบ HQ = สั่งผลิต · คำขอปิด (won) · ลูกค้าเป้าหมาย → ปิดการขายสำเร็จ
    if h.status <> 'sent' then
      raise exception 'hq_quote_unusable: ปิดการขายไม่ได้ — ใบ HQ % ใช้ไม่ได้แล้ว (สถานะ %)', h.quote_no, h.status;
    end if;
    update hq_quotes set status = 'ordered', ordered_at = now() where id = h.id;
    update quote_requests set status = 'won', closed_at = now() where id = r.id;
    perform _lead_flow_set_status(r.dealer_code, r.lead_num_id, 'PAID');

  elsif new.status = 'lost' then
    -- ลูกค้าปฏิเสธ: คำขอปิด (lost) · ลูกค้าเป้าหมาย → ปิดไม่สำเร็จ + เหตุผล
    --   ยังมีใบอื่นของใบ HQ เดียวกันค้างอยู่ = งานยังไม่จบ ไม่ปิด
    if r.status = 'quoted' and not exists (
         select 1 from quotations q
          where q.hq_quote_id = new.hq_quote_id and (q.dealer_code, q.id) <> (new.dealer_code, new.id)
            and q.status in ('draft', 'sent_to_client', 'won')) then
      update quote_requests set status = 'lost', lost_reason = coalesce(new.lost_reason, ''), closed_at = now()
       where id = r.id;
      if exists (select 1 from leads where dealer_code = r.dealer_code and num_id = r.lead_num_id
                    and status not in ('PAID', 'CANCELLED')) then
        perform _lead_flow_set_status(r.dealer_code, r.lead_num_id, 'CANCELLED', coalesce(new.lost_reason, ''));
      end if;
    end if;
  end if;

  -- ย้อนการตอบรับ (won → อย่างอื่น): ใบ HQ กลับเป็นส่งแล้ว · คำขอกลับมาเปิด — ยอดขาย HQ ต้องลดตาม
  if was = 'won' and new.status <> 'won' and h.status = 'ordered' then
    update hq_quotes set status = 'sent', ordered_at = null where id = h.id;
    update quote_requests set status = 'quoted', closed_at = null where id = r.id and status = 'won';
  end if;
  return new;
end $$;

-- ═══ 3. ตัวกันสถานะ: รอราคา HQ / ได้ราคา HQ ตั้งเองไม่ได้ · ได้ราคา HQ ออกเองได้แค่ปิดไม่สำเร็จ ═══════════════════════════
create or replace function public.leads_hq_pricing_guard() returns trigger
  language plpgsql set search_path to 'public' as $$
begin
  if coalesce(current_setting('pms.flow_sync', true), '') = '1' then return new; end if;
  if tg_op = 'INSERT' then
    if new.status = 'HQ_PRICING' then
      raise exception 'hq_pricing_locked: สถานะ "รอราคา HQ" ตั้งเองไม่ได้ — ต้องส่งคำขอใบเสนอราคา';
    elsif new.status = 'HQ_QUOTED' then
      raise exception 'hq_quoted_locked: สถานะ "ได้ราคา HQ" ตั้งเองไม่ได้ — ระบบตั้งให้เมื่อสำนักงานใหญ่ส่งใบ';
    end if;
  elsif new.status is distinct from old.status then
    if new.status = 'HQ_PRICING' then
      raise exception 'hq_pricing_locked: สถานะ "รอราคา HQ" ตั้งเองไม่ได้ — ต้องส่งคำขอใบเสนอราคา';
    elsif new.status = 'HQ_QUOTED' then
      raise exception 'hq_quoted_locked: สถานะ "ได้ราคา HQ" ตั้งเองไม่ได้ — ระบบตั้งให้เมื่อสำนักงานใหญ่ส่งใบ';
    elsif old.status = 'HQ_PRICING' then
      raise exception 'hq_pricing_locked: ลูกค้าเป้าหมายนี้รอราคาจากสำนักงานใหญ่อยู่ — เปลี่ยนสถานะเองไม่ได้ (ยกเลิกคำขอ หรือส่งใบเสนอราคาให้ลูกค้าก่อน)';
    elsif old.status = 'HQ_QUOTED' and new.status <> 'CANCELLED' then
      raise exception 'hq_quoted_locked: ได้ราคาจากสำนักงานใหญ่แล้ว — ขั้นต่อไปคือทำใบและส่งให้ลูกค้า (หรือปิดเป็นเสียโอกาส)';
    end if;
  end if;
  return new;
end $$;

-- ดีลเลอร์ปิดไม่สำเร็จขณะได้ราคา HQ → คำขอปิด (lost) ด้วยเหตุผลเดียวกัน (กล่องงาน HQ ไม่ค้าง "ส่งแล้ว รอดีลเลอร์")
create or replace function public.leads_close_open_request() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status = 'CANCELLED' and old.status = 'HQ_QUOTED' then
    update quote_requests set status = 'lost', lost_reason = coalesce(new.lost_reason, ''), closed_at = now()
     where dealer_code = new.dealer_code and lead_num_id = new.num_id and status = 'quoted';
  end if;
  return new;
end $$;
revoke all on function public.leads_close_open_request() from public, anon, authenticated, service_role;
drop trigger if exists leads_close_open_request on public.leads;
create trigger leads_close_open_request after update of status on public.leads
  for each row execute function public.leads_close_open_request();

-- ═══ 4. ใบ HQ หมดอายุ → ใบลูกค้าหมดตาม (เดิม 0201) + ลีดที่ได้ราคา HQ แต่ยังไม่ส่งใบให้ลูกค้า → รวบรวมความต้องการ ═══════════
--   งานตั้งเวลาเดิม expire-hq-linked-quotations เรียกตัวนี้ทุกชั่วโมง นาทีที่ 5 (ใบ 0201) — ไม่ต้องตั้งเวลาใหม่
create or replace function public.expire_hq_linked_quotations(p_as_of date default (now() at time zone 'Asia/Bangkok')::date)
  returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer; r record;
begin
  update quotations q
     set status = 'expired', expired_reason = 'ใบ HQ ' || h.quote_no || ' หมดอายุ (ยืนราคาถึง ' || to_char(h.valid_until, 'DD/MM/YYYY') || ')'
    from hq_quotes h
   where q.hq_quote_id = h.id
     and q.status in ('draft', 'sent_to_client')
     and h.valid_until is not null and h.valid_until < p_as_of;
  get diagnostics n = row_count;

  for r in
    select l.dealer_code, l.num_id from leads l
     where l.status = 'HQ_QUOTED'
       and not exists (   -- ยังมีใบ HQ ที่ใช้ได้อยู่ = ไม่แตะ
         select 1 from quote_requests rq join hq_quotes h on h.request_id = rq.id
          where rq.dealer_code = l.dealer_code and rq.lead_num_id = l.num_id and rq.status = 'quoted'
            and h.status = 'sent' and (h.valid_until is null or h.valid_until >= p_as_of))
  loop
    perform _lead_flow_set_status(r.dealer_code, r.num_id, 'BULLET');
    -- ไทม์ไลน์ + กระดิ่งดีลเลอร์ (บอสสั่ง 20 ต.ค. 69: "ราคา HQ ของลีด X หมดอายุ ขอราคาใหม่ได้")
    --   กระดิ่งอ่านกิจกรรมชนิด hq_expired (Topbar buildNotifications) — ฐานเป็นคนจด ไม่ใช่แอปเดา
    perform set_config('pms.flow_sync', '1', true);
    update leads set activities = coalesce(activities, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'id', coalesce((select max((x ->> 'id')::numeric) from jsonb_array_elements(coalesce(activities, '[]'::jsonb)) x
                         where (x ->> 'id') ~ '^\d+(\.\d+)?$'), 0) + 1,
        'type', 'hq_expired', 'icon', 'doc',
        'date', _thai_date(now(), true),
        'at', now(),
        'text', 'ราคาจากสำนักงานใหญ่หมดอายุ — ขอราคาใหม่ได้ที่แท็บใบเสนอราคา (ขอแก้ราคา)'))
     where dealer_code = r.dealer_code and num_id = r.num_id;
    perform set_config('pms.flow_sync', '', true);
  end loop;
  return n;
end $$;
revoke all on function public.expire_hq_linked_quotations(date) from public, anon, authenticated, service_role;
grant execute on function public.expire_hq_linked_quotations(date) to service_role;

-- ═══ 5. คำสั่งบันทึกลีด (ยกจาก 0211 · เพิ่ม HQ_QUOTED ในลำดับ/ป้าย และไม่เลื่อนขั้นจากงานขณะได้ราคา HQ) ═════════════════
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
  ลำดับ       jsonb := '{"WAITING":0,"BULLET":1,"HQ_PRICING":1,"HQ_QUOTED":1,"QUOTED":2,"FOLLOWUP":3,"NEGO":4,"PAID":5,"CANCELLED":2}';
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

  -- ── งาน: รวมทีละงาน ──
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

  -- ── ขั้น ──
  ขั้นใหม่ := l.status;
  เหตุผล := l.lost_reason;
  if jsonb_typeof(p_intent -> 'stage') = 'object' then
    ขั้นใหม่ := (p_intent -> 'stage' ->> 'status')::lead_status;
    if ขั้นใหม่ = 'CANCELLED' and nullif(btrim(p_intent -> 'stage' ->> 'lostReason'), '') is not null then
      เหตุผล := btrim(p_intent -> 'stage' ->> 'lostReason');
    end if;
  elsif p_intent ->> 'deriveStage' in ('any', 'up') and l.status not in ('HQ_PRICING', 'HQ_QUOTED', 'PAID', 'CANCELLED') then
    -- ขั้น = ขั้นของงานล่าสุดที่ทำแล้วตามลำดับแม่แบบ (ไม่นับงานปิดการขาย) — เหมือน stageFromTasks ของแอป
    select coalesce((select (t ->> 'stage') from jsonb_array_elements(tpl) with ordinality as e(t, o)
                      where t ->> 'key' <> 'close'
                        and exists (select 1 from jsonb_array_elements(v_tasks) x where x ->> 'key' = t ->> 'key' and coalesce((x ->> 'done')::boolean, false))
                      order by o desc limit 1), 'WAITING')::lead_status into ขั้นใหม่;
    if p_intent ->> 'deriveStage' = 'up' and (ลำดับ ->> ขั้นใหม่::text)::int <= (ลำดับ ->> l.status::text)::int then
      ขั้นใหม่ := l.status;
    end if;
  end if;

  if ขั้นใหม่ is distinct from l.status then
    if ขั้นใหม่ = 'PAID' and not exists (
         select 1 from quotations q where q.dealer_code = l.dealer_code and q.status <> 'draft'
            and (q.deal_id = l.num_id or q.customer = l.company)) then
      raise exception 'lead_close_needs_sent_quote: ปิดการขายสำเร็จไม่ได้ — ต้องมีใบเสนอราคาที่ส่งให้ลูกค้าแล้วอย่างน้อยหนึ่งใบ';
    end if;
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
  -- เลขกิจกรรม: ต่อจากเลขสูงสุดในฐาน (ตัวดัก 0192 ตั้งเลขใหม่ให้อีกชั้นเมื่อเป็นคำขอของผู้ใช้)
  logs := (select coalesce(jsonb_agg(x || jsonb_build_object('id',
             coalesce((select max((a ->> 'id')::numeric) from jsonb_array_elements(coalesce(l.activities, '[]'::jsonb)) a
                        where (a ->> 'id') ~ '^\d+(\.\d+)?$'), 0) + o) order by o), '[]'::jsonb)
             from jsonb_array_elements(logs) with ordinality as e(x, o));

  -- ── เขียน: ช่อง + งาน + ไทม์ไลน์ (สถานะแยกคำสั่ง — ตัวดักขั้นทำงานเฉพาะตอนเปลี่ยนจริง) ──
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

-- ═══ 6. แก้ลีดที่ค้างอยู่แล้ว (นับก่อน/หลัง) ═══════════════════════════════════════════════════════════════════════
do $$
declare ก่อน int; ได้ราคา int := 0; หมดอายุ int := 0; หลัง int; r record;
  วันนี้ date := (now() at time zone 'Asia/Bangkok')::date;
begin
  select count(*) into ก่อน from leads l where l.status = 'HQ_PRICING' and exists (
    select 1 from quote_requests rq join hq_quotes h on h.request_id = rq.id
     where rq.dealer_code = l.dealer_code and rq.lead_num_id = l.num_id and rq.status = 'quoted' and h.status = 'sent');
  for r in
    select l.dealer_code, l.num_id, bool_or(h.valid_until is null or h.valid_until >= วันนี้) as ยังใช้ได้
      from leads l
      join quote_requests rq on rq.dealer_code = l.dealer_code and rq.lead_num_id = l.num_id and rq.status = 'quoted'
      join hq_quotes h on h.request_id = rq.id and h.status = 'sent'
     where l.status = 'HQ_PRICING'
     group by l.dealer_code, l.num_id
  loop
    if r.ยังใช้ได้ then
      perform _lead_flow_set_status(r.dealer_code, r.num_id, 'HQ_QUOTED'); ได้ราคา := ได้ราคา + 1;
    else
      perform _lead_flow_set_status(r.dealer_code, r.num_id, 'BULLET'); หมดอายุ := หมดอายุ + 1;
    end if;
  end loop;
  select count(*) into หลัง from leads l where l.status = 'HQ_PRICING' and exists (
    select 1 from quote_requests rq join hq_quotes h on h.request_id = rq.id
     where rq.dealer_code = l.dealer_code and rq.lead_num_id = l.num_id and rq.status = 'quoted' and h.status = 'sent');
  raise notice 'ลีดค้าง (รอราคา HQ แต่ใบ HQ ส่งแล้ว): ก่อน % · เป็นได้ราคา HQ % · ใบหมดอายุแล้วกลับเป็นรวบรวมความต้องการ % · หลัง %',
    ก่อน, ได้ราคา, หมดอายุ, หลัง;
  if หลัง <> 0 then raise exception 'แก้ลีดค้างไม่ครบ — เหลือ % แถว', หลัง; end if;
end $$;
