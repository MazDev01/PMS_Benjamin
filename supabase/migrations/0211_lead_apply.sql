-- ── ตัวกลางบันทึกลูกค้าเป้าหมายจากแอป: รับ "ส่วนต่าง" ไม่รับทั้งแถว (บอสสั่ง 15 ต.ค. 69 · ก่อนขึ้นระบบจริง ข้อ 14) ──────────
--
-- เดิมแอปเขียน leads ทั้งแถวจากสำเนาในเครื่อง (PUT ทั้งแถว) — หน้าที่เปิดค้างไว้ถือสำเนาเก่า
--   ฐานติ๊กงานไปแล้ว (เช่น ใบ 0210 ตอนสร้างใบ) → ผู้ใช้กดบันทึกช่องอื่นจากหน้าค้าง → งานที่ฐานติ๊กถูกเขียนทับกลับเป็นยังไม่ทำ
--   ขั้นเคยโดนแบบเดียวกัน (แก้ปะไว้ที่แอป: ไม่ส่งขั้น "รอราคา HQ") · ไทม์ไลน์กันไว้แล้วที่ใบ 0192 (ต่อท้ายอย่างเดียว)
-- ตอนนี้: แอปส่ง "เจตนา" มาที่นี่ทางเดียว แล้วรวมกับค่าล่าสุดในฐานภายในธุรกรรมเดียว
--   fields     ช่องที่ผู้ใช้แก้ (เฉพาะช่องในรายการข้างล่าง — ขั้น/งาน/ไทม์ไลน์/เหตุผลปิดไม่สำเร็จ ส่งทางนี้ไม่ได้)
--   tasks      งานที่ผู้ใช้ติ๊ก/เลิกติ๊ก ทีละงาน [{key, done, label?, doneAt?, doneBy?}] — งานอื่นในฐานไม่ถูกแตะ
--   deriveStage "any" = ขั้นตามงานที่ทำล่าสุด (ขึ้น/ลงได้ เหมือนติ๊กในรายการงาน) · "up" = เลื่อนขึ้นเท่านั้น
--              ฐานคิดจากงานในฐาน (ไม่ใช่สำเนาในเครื่อง) · ไม่แตะลูกค้าเป้าหมายที่รอราคา HQ/ปิดแล้ว (ฐานเป็นเจ้าของขั้นเหล่านั้น)
--   stage      ขั้นที่ผู้ใช้ตั้งใจเปลี่ยนเอง {status, lostReason?} (ลากการ์ด · ปิดการขาย · เปิดใหม่)
--   activities บรรทัดไทม์ไลน์ที่ต่อท้าย [{text, type}] — วันเวลาฐานใส่เอง
--   log        false = ไม่จดไทม์ไลน์อัตโนมัติ (ติ๊กงานโดยระบบ / ลากการ์ด — ตามที่แอปทำเดิม)
-- ไทม์ไลน์อัตโนมัติ (ฐานจดเอง เดิมแอปจด): "ทำงาน: …" · "เปลี่ยนขั้นเป็น "…"" · "เปลี่ยนผู้รับผิดชอบเป็น …"
-- กฎปิดการขาย (เดิมอยู่ที่เซิร์ฟเวอร์แอปเท่านั้น — ต่อฐานตรงข้ามได้) ย้ายมาบังคับที่นี่:
--   ปิดสำเร็จต้องมีใบที่ส่งแล้ว · ปิดไม่สำเร็จต้องมีเหตุผล
-- ทำงานด้วยสิทธิ์ผู้เรียก: กฎรายแถวและตัวดักเดิมทั้งหมดยังคุม (สาขาอื่นหาแถวไม่เจอ = not_found → 404)

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
  ลำดับ       jsonb := '{"WAITING":0,"BULLET":1,"HQ_PRICING":1,"QUOTED":2,"FOLLOWUP":3,"NEGO":4,"PAID":5,"CANCELLED":2}';
  ป้าย        jsonb := '{"WAITING":"ติดต่อแล้ว","BULLET":"รวบรวมความต้องการ","HQ_PRICING":"รอราคา HQ","QUOTED":"เสนอราคา",
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
  elsif p_intent ->> 'deriveStage' in ('any', 'up') and l.status not in ('HQ_PRICING', 'PAID', 'CANCELLED') then
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
-- lead_apply ทำงานด้วยสิทธิ์ผู้เรียก จึงต้องเรียกตัวจัดรูปแบบวันไทยได้ — ฟังก์ชันจัดรูปแบบล้วน ไม่อ่านข้อมูลใด
grant execute on function public._thai_date(timestamptz, boolean) to authenticated;
