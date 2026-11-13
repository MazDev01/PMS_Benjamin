-- ── ใบ 0286: คำบนจอที่ฐานสร้าง รอบ 2 — แทนคำทับศัพท์ตามที่บอสอนุมัติ (11–12 พ.ย. 69 · จองโดยเซสชัน ef) ─────────────────
-- รายการจาก ef → b6 (คนรวมงาน) 12 พ.ย. 69 · บอสตอบผ่านคนรวมงาน: 7 คำ + "อัปเดตอัตโนมัติ" → "ระบบทำให้" + "คิวรอ" ตัดออก (ห้าม "รอโอน")
-- แทนเฉพาะข้อความในฟังก์ชัน (create or replace ทั้งตัว จากนิยามล่าสุดของฐาน ณ ใบ 0285) — ไม่แตะแถวข้อมูล · ไม่มี SET LOCAL
--   1) ผู้ทำงานที่ระบบติ๊กให้ (doneBy) 'อัปเดตอัตโนมัติ' → 'ระบบทำให้' — _lead_info_tasks · _lead_sync_append · _lead_tasks_five_steps (2) · lead_apply · quotations_created_lead_sync
--      แถวเก่าในฐานคงคำเดิม (ห้ามแก้ · บอสยืนยัน) — หน้าเว็บแปลงตอนแสดง (packages/shared/lib/systemActor.ts)
--   2) _lead_missing_for_quote: 'สเปก / รายละเอียดงาน' → 'รายละเอียดงาน'
--   3) customer_notes_required: 'หัวข้อโน้ต' → 'หัวข้อหมายเหตุ'
--   4) hq_materials_import: 'อัปเดตได้แค่ราคา' → 'ปรับได้แค่ราคา' · 'อัปเดตราคา N รายการ' → 'ปรับราคา N รายการ'
--   5) lead_apply: '(ขั้น/งาน/ไทม์ไลน์ ฐานเป็นเจ้าของ)' → '(ขั้น/งาน/ประวัติ ฐานเป็นเจ้าของ)'
--   6) quote_files_object_guard: 'ต้องขอสิทธิ์อัปโหลดจากระบบก่อน' → 'ต้องขอสิทธิ์แนบไฟล์จากระบบก่อน'
--   7) storage_quota_set: 'โควตาต้องมากกว่า 0 GB' → 'พื้นที่ที่ให้ใช้ต้องมากกว่า 0 GB'
--   8) transfer_hq_leads: ตัด '(อยู่ในคิวรอ)' (รหัส transfer_queue คงเดิม)
-- รหัสนำหน้าข้อความผิดพลาด (lead_field_not_allowed: · file_unreserved: · bad_quota: · unit_mismatch: · transfer_queue:) คงเดิม — หน้าเว็บจับด้วยรหัส
-- หมายเหตุในตัวฟังก์ชัน (ไม่ขึ้นจอ) คงเดิม · สิทธิ์/คำอธิบายของฟังก์ชันคงเดิม (create or replace ไม่ล้าง)
-- ข้อทดสอบ: supabase/tests/ui_terms_db.sql (ข้อความของ 11 ฟังก์ชันไม่มีคำห้าม · ผู้ทำโดยระบบ = ระบบทำให้)

CREATE OR REPLACE FUNCTION public._lead_info_tasks(p_tasks jsonb, p_status text, p_assigned text, p_company text, p_contact text, p_phone text, p_province text, p_project text, p_area text, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  ลูกค้า boolean := _lead_customer_info_complete(p_company, p_contact, p_phone);
  งาน   boolean := _lead_job_info_complete(p_province, p_project, p_area, p_note);
  ผู้ทำ  text := coalesce(nullif(btrim(p_assigned), ''), 'ระบบทำให้');
  t jsonb := case when jsonb_typeof(p_tasks) = 'array' then p_tasks else '[]'::jsonb end;
begin
  if p_status in ('PAID', 'CANCELLED') then return p_tasks; end if;
  if jsonb_array_length(t) = 0 then
    if not ลูกค้า and not งาน then return p_tasks; end if;
    t := coalesce((select jsonb_agg(jsonb_build_object('key', e ->> 'key', 'label', e ->> 'label', 'done', false) order by o)
                     from hq_sales_journey j, jsonb_array_elements(j.tasks) with ordinality x(e, o) where j.id = 1), '[]'::jsonb);
  end if;
  t := _lead_task_set(t, 'collect', 'เก็บข้อมูลลูกค้า', ลูกค้า, ผู้ทำ);
  t := _lead_task_set(t, 'requirement', 'สรุปความต้องการ', งาน, ผู้ทำ);
  return t;
end $function$
;

CREATE OR REPLACE FUNCTION public._lead_missing_for_quote(l leads)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select array_remove(array[
    case when btrim(coalesce(l.company, '')) = '' then 'ชื่อบริษัท / ชื่อลูกค้า' end,
    case when btrim(coalesce(l.contact, '')) = '' then 'ผู้ติดต่อ' end,
    case when btrim(coalesce(l.phone, '')) = '' then 'โทรศัพท์' end,
    case when btrim(coalesce(l.province, '')) = '' then 'จังหวัดหน้างาน' end,
    case when btrim(coalesce(l.project, '')) = '' then 'งานที่ต้องการ' end,
    case when not coalesce(btrim(l.area) ~ '^[0-9]+(\.[0-9]+)?$' and btrim(l.area)::numeric > 0, false) then 'พื้นที่ (ตร.ม.)' end,
    case when btrim(coalesce(l.note, '')) = '' then 'รายละเอียดงาน' end
  ], null);
$function$
;

CREATE OR REPLACE FUNCTION public._lead_sync_append(p_dealer text, p_num integer, p_keys text[], p_text text, p_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  l leads;
  v_tasks jsonb;
  v_changed boolean := false;
  v_acts jsonb;
begin
  if p_num is null or p_num = 0 then return; end if;
  select * into l from leads where dealer_code = p_dealer and num_id = p_num for update;
  if not found then return; end if;

  v_tasks := l.tasks;
  if coalesce(array_length(p_keys, 1), 0) > 0 and l.status not in ('PAID', 'CANCELLED') then
    -- ลีดที่ยังไม่มีรายการงาน ใช้แม่แบบของสำนักงานใหญ่ (เหมือนใบ 0210 / buildLeadTasks)
    v_tasks := case when jsonb_typeof(l.tasks) = 'array' and jsonb_array_length(l.tasks) > 0 then l.tasks
                  else coalesce((select jsonb_agg(jsonb_build_object('key', t->>'key', 'label', t->>'label', 'done', false) order by o)
                                   from hq_sales_journey j, jsonb_array_elements(j.tasks) with ordinality as e(t, o)), '[]'::jsonb) end;
    select coalesce(jsonb_agg(
             case when t->>'key' = any(p_keys) and not coalesce((t->>'done')::boolean, false)
                  then t || jsonb_build_object('done', true, 'doneAt', _thai_date(now()),
                                               'doneBy', coalesce(nullif(btrim(l.assigned), ''), 'ระบบทำให้'))
                  else t end order by o), '[]'::jsonb),
           coalesce(bool_or(t->>'key' = any(p_keys) and not coalesce((t->>'done')::boolean, false)), false)
      into v_tasks, v_changed
      from jsonb_array_elements(v_tasks) with ordinality as e(t, o);
  end if;

  v_acts := case when jsonb_typeof(l.activities) = 'array' then l.activities else '[]'::jsonb end;
  if nullif(btrim(coalesce(p_text, '')), '') is not null then
    v_acts := v_acts || jsonb_build_array(jsonb_build_object(
      'id', coalesce((select max((a->>'id')::numeric) from jsonb_array_elements(v_acts) a where (a->>'id') ~ '^\d+(\.\d+)?$'), 0) + 1,
      'date', _thai_date(now(), true), 'icon', p_type, 'type', p_type, 'text', p_text));
  end if;

  if not v_changed and v_acts is not distinct from l.activities then return; end if;
  perform set_config('pms.flow_sync', '1', true);   -- งานของระบบ (ตัวกันขั้นลีดไม่ต้องตัดสิน)
  update leads set tasks = case when v_changed then v_tasks else leads.tasks end, activities = v_acts
   where dealer_code = l.dealer_code and num_id = l.num_id;
  perform set_config('pms.flow_sync', '', true);
end $function$
;

CREATE OR REPLACE FUNCTION public._lead_tasks_five_steps(p_tasks jsonb, p_dealer text, p_num integer, p_appt text DEFAULT 'appointment'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with แม่แบบ as (select e, o from jsonb_array_elements((select tasks from hq_sales_journey where id = 1)) with ordinality x(e, o)),
       เดิม as (select t ->> 'key' as k, t from jsonb_array_elements(p_tasks) t),
       คำขอ as (select min(r.submitted_at) as ส่ง, min(r.quoted_at) as ได้ใบ
                 from quote_requests r where r.dealer_code = p_dealer and r.lead_num_id = p_num),
       แถว as (
         select a.o, case
           when m.t is not null then (m.t - 'label' - 'key') || jsonb_build_object('key', a.e ->> 'key', 'label', a.e ->> 'label')
           when a.e ->> 'key' = 'requestQuote' and (select ส่ง from คำขอ) is not null
             then jsonb_build_object('key', 'requestQuote', 'label', a.e ->> 'label', 'done', true,
                                     'doneAt', _thai_date((select ส่ง from คำขอ), true), 'doneBy', 'ระบบทำให้')
           when a.e ->> 'key' = 'hqQuote' and (select ได้ใบ from คำขอ) is not null
             then jsonb_build_object('key', 'hqQuote', 'label', a.e ->> 'label', 'done', true,
                                     'doneAt', _thai_date((select ได้ใบ from คำขอ), true), 'doneBy', 'ระบบทำให้')
           else jsonb_build_object('key', a.e ->> 'key', 'label', a.e ->> 'label', 'done', false) end as t
           from แม่แบบ a
           left join lateral (select d.t from เดิม d
                               where d.k = a.e ->> 'key' or (a.e ->> 'key' = 'followCustomer' and d.k = 'followup')
                                  or (a.e ->> 'key' = 'appointment' and d.k = p_appt)
                               order by (d.k = a.e ->> 'key') desc limit 1) m on true
         union all
         -- รายการเฉพาะของลีดนี้ที่ไม่อยู่ในแม่แบบ (ไม่ใช่ของ flow เก่า) — เก็บไว้ท้ายรายการ
         select 1000, d.t from เดิม d
          where d.k not in (select e ->> 'key' from แม่แบบ) and d.k not in ('followup', 'negotiate', 'close', 'catalog') and d.k <> p_appt)
  select coalesce(jsonb_agg(t order by o), '[]'::jsonb) from แถว
$function$
;

CREATE OR REPLACE FUNCTION public.customer_notes_required()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if req_blanked(old.title, new.title) then perform req_fail('หัวข้อหมายเหตุ'); end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.hq_materials_import(p_file text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb; ชุด bigint; เดิม material_templates; tid bigint; ราคา numeric; เพิ่ม int := 0; แก้ int := 0; ลำดับ int := 0;
  หมวด text; ชื่อ text; หน่วย text; เห็นแล้ว text[] := '{}'; คีย์ text;
begin
  if not can_write_master() then raise exception 'forbidden: นำเข้ารายการวัสดุได้เฉพาะผู้ดูแลระบบ/ผู้บริหารสำนักงานใหญ่'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'import_rows: ข้อมูลแถวไม่ถูกต้อง'; end if;
  if jsonb_array_length(p_rows) = 0 then raise exception 'import_rows: ไม่มีแถวให้นำเข้า'; end if;
  if jsonb_array_length(p_rows) > 1000 then raise exception 'import_limit: นำเข้าได้ครั้งละไม่เกิน 1,000 แถว (ส่งมา %)', jsonb_array_length(p_rows); end if;

  perform pg_advisory_xact_lock(hashtext('hq_materials_import'));
  insert into material_import_batches (file_name, created_by) values (left(btrim(coalesce(p_file, '')), 200), audit_actor_name()) returning id into ชุด;

  for v in select * from jsonb_array_elements(p_rows) loop
    ลำดับ := ลำดับ + 1;
    หมวด := btrim(coalesce(v ->> 'category', '')); ชื่อ := btrim(coalesce(v ->> 'name', '')); หน่วย := btrim(coalesce(v ->> 'unit', ''));
    if ชื่อ = '' or หน่วย = '' then raise exception 'import_rows: แถวที่ % ต้องมีชื่อวัสดุและหน่วย', ลำดับ; end if;
    begin ราคา := (v ->> 'unitPrice')::numeric;
    exception when others then raise exception 'import_rows: ราคาต่อหน่วยของ "%" ไม่ใช่ตัวเลข', ชื่อ; end;
    if ราคา is null or ราคา < 0 then raise exception 'import_rows: ต้องใส่ราคาต่อหน่วย (0 ขึ้นไป) ของ "%"', ชื่อ; end if;
    คีย์ := lower(หมวด) || E'\x1f' || lower(ชื่อ);
    if คีย์ = any(เห็นแล้ว) then raise exception 'import_rows: "%" (หมวด "%") ซ้ำกันในไฟล์', ชื่อ, หมวด; end if;
    เห็นแล้ว := เห็นแล้ว || คีย์;

    select * into เดิม from material_templates where lower(btrim(category)) = lower(หมวด) and lower(btrim(name)) = lower(ชื่อ) for update;
    if found then
      if lower(btrim(เดิม.unit)) <> lower(หน่วย) then
        raise exception 'unit_mismatch: "%" มีอยู่แล้วด้วยหน่วย "%" แต่ไฟล์เป็น "%" — ปรับได้แค่ราคา', ชื่อ, เดิม.unit, หน่วย;
      end if;
      if เดิม.unit_price is distinct from round(ราคา, 2) then
        insert into material_import_changes (batch_id, template_id, kind, new_price, old_price, old_price_updated_at)
        values (ชุด, เดิม.id, 'update', round(ราคา, 2), เดิม.unit_price, เดิม.price_updated_at);
        update material_templates set unit_price = round(ราคา, 2) where id = เดิม.id;
        แก้ := แก้ + 1;
      end if;
    else
      insert into material_templates (category, name, unit, unit_price, active)
      values (หมวด, ชื่อ, หน่วย, round(ราคา, 2), coalesce((v ->> 'active')::boolean, true)) returning id into tid;
      insert into material_import_changes (batch_id, template_id, kind, new_price) values (ชุด, tid, 'insert', round(ราคา, 2));
      เพิ่ม := เพิ่ม + 1;
    end if;
  end loop;

  if เพิ่ม + แก้ = 0 then raise exception 'import_rows: ไม่มีแถวที่เปลี่ยน (ราคาเท่าเดิมทุกแถว)'; end if;
  update material_import_batches set inserted = เพิ่ม, updated = แก้ where id = ชุด;
  perform _audit_hq('นำเข้ารายการวัสดุ', concat_ws(' · ', coalesce(nullif(left(btrim(coalesce(p_file, '')), 200), ''), 'ไฟล์ไม่มีชื่อ'),
    case when เพิ่ม > 0 then 'เพิ่ม ' || เพิ่ม || ' รายการ' end, case when แก้ > 0 then 'ปรับราคา ' || แก้ || ' รายการ' end, 'ชุด ' || ชุด));
  return jsonb_build_object('batch', ชุด, 'inserted', เพิ่ม, 'updated', แก้);
end $function$
;

CREATE OR REPLACE FUNCTION public.lead_apply(p_id text, p_intent jsonb)
 RETURNS leads
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
    raise exception 'lead_field_not_allowed: ช่อง "%" แก้ทางนี้ไม่ได้ (ขั้น/งาน/ประวัติ ฐานเป็นเจ้าของ)', k;
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
                     'doneBy', coalesce(nullif(btrim(c ->> 'doneBy'), ''), nullif(btrim(l.assigned), ''), 'ระบบทำให้'))
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
end $function$
;

CREATE OR REPLACE FUNCTION public.quotations_created_lead_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  l leads;
  keys text[] := case when new.status = 'draft' then array['makeQuote'] else array['makeQuote', 'sendQuote'] end;
  v_tasks jsonb;
  v_acts jsonb;
  v_changed boolean := false;
begin
  -- ③ แถวไฟล์ของใบ — กันซ้ำด้วยเลขใบในชื่อ (แบบเดียวกับแอปเดิม)
  if not exists (select 1 from files f where f.dealer_code = new.dealer_code and f.category = 'ใบเสนอราคา'
                  and position(new.id in f.name) > 0) then
    insert into files (dealer_code, name, size, ext, category, project, uploaded_by, uploaded_at, source, record_id, customer_id)
    values (new.dealer_code,
            'ใบเสนอราคา_' || new.id || '_' || regexp_replace(coalesce(new.customer, ''), '\s+', '', 'g') || '.pdf',
            '', 'pdf', 'ใบเสนอราคา', new.project, 'ระบบ · จากใบเสนอราคา', new.date,
            case when coalesce(new.deal_id, 0) <> 0 then 'lead' else 'customer' end,
            case when coalesce(new.deal_id, 0) <> 0 then new.deal_id else new.customer_id end,
            new.customer_id);
  end if;

  if coalesce(new.deal_id, 0) = 0 then return new; end if;
  select * into l from leads where dealer_code = new.dealer_code and num_id = new.deal_id for update;
  if not found or l.status in ('PAID', 'CANCELLED') then return new; end if;

  -- ① ติ๊กงาน — ลูกค้าเป้าหมายที่ยังไม่มีรายการงาน ใช้แม่แบบของสำนักงานใหญ่ (เหมือน buildLeadTasks)
  v_tasks := case when jsonb_typeof(l.tasks) = 'array' and jsonb_array_length(l.tasks) > 0 then l.tasks
                else coalesce((select jsonb_agg(jsonb_build_object('key', t->>'key', 'label', t->>'label', 'done', false) order by o)
                                 from hq_sales_journey j, jsonb_array_elements(j.tasks) with ordinality as e(t, o)), '[]'::jsonb) end;
  select coalesce(jsonb_agg(
           case when t->>'key' = any(keys) and not coalesce((t->>'done')::boolean, false)
                then t || jsonb_build_object('done', true, 'doneAt', _thai_date(now()),
                                             'doneBy', coalesce(nullif(btrim(l.assigned), ''), 'ระบบทำให้'))
                else t end order by o), '[]'::jsonb),
         bool_or(t->>'key' = any(keys) and not coalesce((t->>'done')::boolean, false))
    into v_tasks, v_changed
    from jsonb_array_elements(v_tasks) with ordinality as e(t, o);

  -- ② กิจกรรม (ต่อท้าย · เลขถัดไป)
  v_acts := case when jsonb_typeof(l.activities) = 'array' then l.activities else '[]'::jsonb end;
  v_acts := v_acts || jsonb_build_array(jsonb_build_object(
    'id', coalesce((select max((a->>'id')::numeric) from jsonb_array_elements(v_acts) a where (a->>'id') ~ '^\d+(\.\d+)?$'), 0) + 1,
    'date', _thai_date(now(), true), 'icon', 'doc', 'type', 'doc',
    'text', 'ออกใบเสนอราคา ' || new.id || ' (' || coalesce(nullif(new.revision, ''), 'V1') || ') · ยอด ' || coalesce(new.total, '')));

  update leads set tasks = case when coalesce(v_changed, false) then v_tasks else leads.tasks end, activities = v_acts
   where dealer_code = l.dealer_code and num_id = l.num_id;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.quote_files_object_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare f quote_files;
begin
  if new.bucket_id <> 'quote-files' then return new; end if;
  if tg_op = 'UPDATE' then
    if new.name is distinct from old.name then raise exception 'file_locked: ย้าย/เปลี่ยนชื่อไฟล์แนบไม่ได้'; end if;
    return new;
  end if;
  select * into f from quote_files where object_name = new.name and status = 'pending' for update;
  if not found then raise exception 'file_unreserved: ต้องขอสิทธิ์แนบไฟล์จากระบบก่อน' using errcode = 'check_violation'; end if;
  if f.uploaded_by is distinct from coalesce(auth.uid(), new.owner) then
    raise exception 'forbidden: ไฟล์นี้จองไว้ให้ผู้ใช้อื่น' using errcode = 'check_violation';
  end if;
  if not _quote_file_ext_ok(_quote_file_ext(new.name)) then
    raise exception 'file_type: ไม่รองรับไฟล์ชนิดนี้' using errcode = 'check_violation';
  end if;
  if not _quote_file_open(f.request_id, f.side, f.hq_quote_id) then
    raise exception 'file_locked: ส่งใบ HQ แล้ว — แนบไฟล์ไม่ได้' using errcode = 'check_violation';
  end if;
  if coalesce((new.metadata ->> 'size')::bigint, 0) > 20971520 then
    raise exception 'file_size: ไฟล์ใหญ่เกิน 20 MB' using errcode = 'check_violation';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.storage_quota_set(p_gb numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not can_write_master() then raise exception 'forbidden: เฉพาะผู้ดูแล/ผู้บริหาร HQ'; end if;
  if p_gb is not null and (p_gb <= 0 or p_gb > 100000) then raise exception 'bad_quota: พื้นที่ที่ให้ใช้ต้องมากกว่า 0 GB'; end if;
  update hq_policy set storage_quota_gb = p_gb where id = 1;
end $function$
;

CREATE OR REPLACE FUNCTION public.transfer_hq_leads(p_province text, p_to text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p text := btrim(coalesce(p_province, ''));
  l record; a record; n integer := 0; new_num integer; hist jsonb; max_id bigint;
begin
  if not can_write_master() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  if p = '' then raise exception 'transfer_queue: ลูกค้าเป้าหมายที่ไม่มีจังหวัด โอนไม่ได้ — แก้จังหวัดก่อน'; end if;
  if not exists (select 1 from dealer_territories where province = p and dealer_code = p_to) then
    raise exception 'transfer_not_owner: % ไม่ได้ดูแลจังหวัด% — โอนให้ได้เฉพาะดีลเลอร์ที่ดูแลจังหวัดนั้น', p_to, p;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('transfer-hq-leads#' || p_to, 0));

  for l in select * from leads x
            where x.dealer_code = 'HQ' and btrim(coalesce(x.province, '')) = p
              and x.status not in ('PAID', 'CANCELLED') and x.customer_id is null
              and not exists (select 1 from quotations q where q.dealer_code = 'HQ' and q.deal_id = x.num_id)
              and not exists (select 1 from quote_requests r where r.dealer_code = 'HQ' and r.lead_num_id = x.num_id)
            order by x.num_id for update loop
    new_num := next_entity_id(p_to, 'leads');
    -- กันเลขชนกับของที่มีอยู่แล้วของสาขาปลายทาง (ตัวนับอาจตามหลังข้อมูลที่นำเข้าตรง)
    while exists (select 1 from leads where dealer_code = p_to and (num_id = new_num or id = '#L-' || (40321 + new_num))) loop
      new_num := next_entity_id(p_to, 'leads');
    end loop;

    select coalesce(max((x ->> 'id')::bigint), 0) into max_id
      from jsonb_array_elements(coalesce(l.activities, '[]'::jsonb)) x where (x ->> 'id') ~ '^\d+$';
    hist := coalesce(l.activities, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'id', max_id + 1, 'type', 'note', 'icon', 'note',
      'date', to_char(now() at time zone 'Asia/Bangkok', 'FMDD') || ' ' ||
              (array['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'])[extract(month from now() at time zone 'Asia/Bangkok')::int]
              || ' ' || (extract(year from now() at time zone 'Asia/Bangkok')::int + 543) || ' · ' || to_char(now() at time zone 'Asia/Bangkok', 'HH24:MI'),
      'text', 'รับโอนจากสำนักงานใหญ่ (จังหวัด' || p || ')'));

    -- นัดหมาย: เลขชั่วคราวติดลบก่อน (กันชนกับเลขของสาขาปลายทางตอนกุญแจนอกพาย้าย)
    update appointments set id = -id where dealer_code = 'HQ' and lead_id = l.num_id;
    perform set_config('pms.flow_sync', '1', true);   -- ข้ามตัวดักของงานขาย (ไม่ใช่การกระทำของดีลเลอร์)
    update leads set dealer_code = p_to, num_id = new_num, id = '#L-' || (40321 + new_num), activities = hist
     where dealer_code = 'HQ' and id = l.id;
    perform set_config('pms.flow_sync', '', true);
    for a in select id from appointments where dealer_code = p_to and id < 0 loop
      update appointments set id = next_entity_id(p_to, 'appointments') where dealer_code = p_to and id = a.id;
    end loop;
    n := n + 1;
  end loop;

  if n > 0 then
    insert into audit_log("user", role, action, target)
    values (audit_actor(), auth_role(), 'โอนลูกค้าเป้าหมายของ HQ ให้ดีลเลอร์', p || ' → ' || p_to || ' · ' || n || ' ราย');
  end if;
  return n;
end $function$;
