-- ── ใบ 0279: นำเข้ารายการวัสดุจากไฟล์ + ยกเลิกทั้งชุด (HQ · ตั้งค่า › รายการวัสดุ · บอสสั่ง 5 พ.ย. 69) ─────────────────────────────
-- หน้าเว็บอ่านไฟล์ + แบ่งกลุ่ม พร้อม/อัปเดตราคา/ต้องตรวจ/ข้าม (ตรรกะล้วน lib/materialImport.ts) แล้วส่งแถวที่ตรวจแล้วมาที่นี่ทีเดียว
--   • hq_materials_import(ชื่อไฟล์, แถว): ทั้งชุดในคำสั่งเดียว (ทั้งหมดหรือไม่เลย) · ไม่เกิน 1,000 แถว · ผู้ดูแล/ผู้บริหาร HQ เท่านั้น
--     ฐานตัดสินซ้ำเอง: หมวด+ชื่อตรงของเดิม (ตัวกันซ้ำเดียวกับ material_templates_name_uq) = อัปเดตราคา · ไม่ตรง = วัสดุใหม่
--     อัปเดตราคาเปลี่ยนแค่ราคา (บอสตอบข้อ 3 = ก) · หน่วยต้องตรงของเดิม (ต่าง = ปฏิเสธทั้งชุด · หน้าเว็บให้ตรวจก่อน · บอสตอบข้อ 1 = ก)
--     เปิดใช้ในไฟล์ใช้กับวัสดุใหม่เท่านั้น (ว่าง = เปิดใช้) · ซ้ำกันเองในชุด = ปฏิเสธ · ห้ามลบวัสดุที่มีอยู่ผ่านการนำเข้า (ไม่มีทางลบในคำสั่งนี้)
--     จดทุกแถวที่เปลี่ยนไว้ (material_import_changes: เพิ่ม / ราคาเดิม→ใหม่ + วันอัปเดตราคาเดิม) · บันทึกการใช้งานแถวเดียวต่อชุด
--   • hq_materials_import_cancel(ชุด): ลบวัสดุที่ชุดเพิ่ม + คืนราคาเดิม (และวันอัปเดตราคาเดิม) ของแถวที่อัปเดตราคา
--     ทำไม่ได้ถ้า: มีคำขอราคาที่สร้างหลังนำเข้าใช้วัสดุในชุด (ใบไหนใช้แล้ว · บอสสั่ง) · หรือวัสดุในชุดถูกแก้ราคา/ลบหลังนำเข้า (คืนแล้วจะทับของที่แก้)
--   • hq_material_import_batches(): ชุดที่นำเข้าล่าสุด 20 ชุด + ยกเลิกได้หรือไม่ (เหตุผล)
-- ข้อทดสอบ: supabase/tests/material_import.sql · tests/scenario/material-import.spec.ts

create table public.material_import_batches (
  id           bigint generated always as identity primary key,
  file_name    text not null default '',
  inserted     integer not null default 0,
  updated      integer not null default 0,
  created_by   text not null default '',
  created_at   timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by text
);
comment on table public.material_import_batches is 'ชุดนำเข้ารายการวัสดุ (ใบ 0279) — ยกเลิกทั้งชุดได้ · เขียนผ่านคำสั่งของฐานเท่านั้น';
alter table public.material_import_batches enable row level security;
revoke all on table public.material_import_batches from public, anon, authenticated, service_role;
grant select on table public.material_import_batches to authenticated;
grant all on table public.material_import_batches to service_role;
create policy material_import_batches_read on public.material_import_batches for select to authenticated using (is_hq());

create table public.material_import_changes (
  batch_id               bigint not null references public.material_import_batches (id) on delete cascade,
  template_id            bigint not null,
  kind                   text not null check (kind in ('insert', 'update')),
  new_price              numeric(14,2) not null,
  old_price              numeric(14,2),
  old_price_updated_at   timestamptz,
  primary key (batch_id, template_id)
);
comment on table public.material_import_changes is 'แถวที่ชุดนำเข้าวัสดุเปลี่ยน (ใบ 0279) — เพิ่ม / ราคาเดิม→ใหม่ · ใช้คืนตอนยกเลิกทั้งชุด';
alter table public.material_import_changes enable row level security;
revoke all on table public.material_import_changes from public, anon, authenticated, service_role;
grant all on table public.material_import_changes to service_role;

-- วันอัปเดตราคา: คืนราคาเดิมตอนยกเลิกชุด = คืนวันเดิมด้วย (สวิตช์ pms.material_restore เฉพาะคำสั่งยกเลิกชุด) · อื่น ๆ เหมือนใบ 0244
create or replace function public.material_templates_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then new.price_updated_at := now();
  elsif coalesce(current_setting('pms.material_restore', true), '') = 'on' then null;   -- คืนวันเดิมที่คำสั่งยกเลิกชุดส่งมา
  elsif new.unit_price is distinct from old.unit_price then new.price_updated_at := now();
  else new.price_updated_at := old.price_updated_at;
  end if;
  return new;
end $$;
revoke all on function public.material_templates_touch() from public, anon, authenticated, service_role;

create or replace function public.hq_materials_import(p_file text, p_rows jsonb) returns jsonb
  language plpgsql security definer set search_path to 'public' as $$
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
        raise exception 'unit_mismatch: "%" มีอยู่แล้วด้วยหน่วย "%" แต่ไฟล์เป็น "%" — อัปเดตได้แค่ราคา', ชื่อ, เดิม.unit, หน่วย;
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
    case when เพิ่ม > 0 then 'เพิ่ม ' || เพิ่ม || ' รายการ' end, case when แก้ > 0 then 'อัปเดตราคา ' || แก้ || ' รายการ' end, 'ชุด ' || ชุด));
  return jsonb_build_object('batch', ชุด, 'inserted', เพิ่ม, 'updated', แก้);
end $$;
revoke all on function public.hq_materials_import(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.hq_materials_import(text, jsonb) to authenticated;

/** เหตุที่ยกเลิกชุดไม่ได้ (null = ได้) — ใช้ทั้งคำสั่งยกเลิกและรายการชุดบนหน้าจอ */
create or replace function public._material_import_block(p_batch bigint) returns text
  language sql stable security definer set search_path to 'public' as $$
  select case
    when b.cancelled_at is not null then 'ยกเลิกไปแล้ว'
    when exists (select 1 from material_import_changes c
                   join quote_requests r on r.submitted_at > b.created_at
                    and r.estimate_items @> jsonb_build_array(jsonb_build_object('templateId', c.template_id))
                  where c.batch_id = b.id)
      then 'มีคำขอราคาใช้วัสดุในชุดนี้แล้ว'
    when exists (select 1 from material_import_changes c left join material_templates t on t.id = c.template_id
                  where c.batch_id = b.id and (t.id is null or t.unit_price is distinct from c.new_price))
      then 'วัสดุในชุดนี้ถูกแก้ราคาหรือลบหลังนำเข้า'
    end
    from material_import_batches b where b.id = p_batch
$$;
revoke all on function public._material_import_block(bigint) from public, anon, authenticated, service_role;

create or replace function public.hq_materials_import_cancel(p_batch bigint) returns jsonb
  language plpgsql security definer set search_path to 'public' as $$
declare b material_import_batches; เหตุ text; ลบ int; คืน int;
begin
  if not can_write_master() then raise exception 'forbidden: ยกเลิกการนำเข้าได้เฉพาะผู้ดูแลระบบ/ผู้บริหารสำนักงานใหญ่'; end if;
  perform pg_advisory_xact_lock(hashtext('hq_materials_import'));
  select * into b from material_import_batches where id = p_batch for update;
  if not found then raise exception 'not_found: ไม่พบชุดนำเข้านี้'; end if;
  เหตุ := _material_import_block(p_batch);
  if เหตุ = 'ยกเลิกไปแล้ว' then raise exception 'import_cancelled: ชุดนี้ยกเลิกไปแล้ว'; end if;
  if เหตุ is not null then raise exception 'import_in_use: ยกเลิกทั้งชุดไม่ได้ — %', เหตุ; end if;

  delete from material_templates t using material_import_changes c where c.batch_id = p_batch and c.kind = 'insert' and t.id = c.template_id;
  get diagnostics ลบ = row_count;
  perform set_config('pms.material_restore', 'on', true);
  update material_templates t set unit_price = c.old_price, price_updated_at = c.old_price_updated_at
    from material_import_changes c where c.batch_id = p_batch and c.kind = 'update' and t.id = c.template_id;
  get diagnostics คืน = row_count;
  perform set_config('pms.material_restore', '', true);
  update material_import_batches set cancelled_at = now(), cancelled_by = audit_actor_name() where id = p_batch;
  perform _audit_hq('ยกเลิกการนำเข้ารายการวัสดุ', concat_ws(' · ', coalesce(nullif(b.file_name, ''), 'ไฟล์ไม่มีชื่อ'),
    'ลบ ' || ลบ || ' รายการ', 'คืนราคาเดิม ' || คืน || ' รายการ', 'ชุด ' || p_batch));
  return jsonb_build_object('batch', p_batch, 'deleted', ลบ, 'restored', คืน);
end $$;
revoke all on function public.hq_materials_import_cancel(bigint) from public, anon, authenticated, service_role;
grant execute on function public.hq_materials_import_cancel(bigint) to authenticated;

create or replace function public.hq_material_import_batches() returns jsonb
  language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_hq() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'fileName', b.file_name, 'inserted', b.inserted, 'updated', b.updated,
                                                     'createdBy', b.created_by, 'createdAt', b.created_at, 'cancelledAt', b.cancelled_at,
                                                     'blocked', _material_import_block(b.id))
                                  order by b.id desc)
                     from (select * from material_import_batches order by id desc limit 20) b), '[]'::jsonb);
end $$;
revoke all on function public.hq_material_import_batches() from public, anon, authenticated, service_role;
grant execute on function public.hq_material_import_batches() to authenticated;
