-- ── ใบ 0275: นำเข้าผู้สนใจเป็นดีลเลอร์จากไฟล์ทำงานจริงของทีม (HQ · บอสสั่ง 3 พ.ย. 69) ─────────────────────────────────────
-- หน้าเว็บอ่านไฟล์ + จับคู่คอลัมน์ + ให้ HQ ตรวจ (ตรรกะล้วน lib/prospectImport.ts) แล้วส่ง "แถวที่ตรวจแล้ว" มาที่นี่ทีเดียว
--   • hq_prospects_import(ชื่อไฟล์, แถว): ทั้งชุดในคำสั่งเดียว · ไม่เกิน 1,000 แถว · ผู้ดูแล/ผู้บริหาร HQ เท่านั้น
--     เบอร์ซ้ำกับที่มีอยู่ หรือซ้ำกันเองในชุด = ข้าม (ฐานตัดสิน · เทียบตัวเลขล้วน) · คืนรายการที่ข้ามพร้อมเหตุผล
--     หมายเหตุเดิม = บันทึกการติดต่อครั้งแรก (เก็บข้อความเดิมเสมอ · ช่องทาง "อื่น ๆ") · ติดต่อล่าสุด = วันเริ่มติดต่อในไฟล์ (ไม่มี = เวลานำเข้า)
--     บันทึกการใช้งานแถวเดียวต่อชุด (ไม่ลงทีละราย)
--   • hq_prospects_import_cancel(ชุด): ยกเลิกทั้งชุด = ลบผู้สนใจของชุดนั้น · ทำไม่ได้ถ้ามีรายใด "ถูกแตะแล้ว" (บอสสั่ง 3 พ.ย. 69):
--     บันทึกการติดต่อหลังนำเข้า · เปลี่ยนขั้น · ออกใบค่าแฟรนไชส์ · เป็นดีลเลอร์ — บันทึกการติดต่อแรกที่มาจากหมายเหตุในไฟล์ไม่นับ
--     (แถวที่คำสั่งนำเข้าสร้างมีเวลาเท่ากับเวลาสร้างชุดเป๊ะ = ธุรกรรมเดียวกัน · หลังจากนั้น = ถูกแตะ) · _import_batch_touched นับให้หน้าจอบอกจำนวน
--   • hq_prospect_import_batches(): ชุดที่นำเข้าล่าสุด (หน้าจอแสดงปุ่มยกเลิก)
-- ข้อทดสอบ: supabase/tests/prospect_import.sql · tests/scenario/prospect-import.spec.ts (ไฟล์ปลอมโครงเดียวกับไฟล์จริง)

create table public.prospect_import_batches (
  id           bigint generated always as identity primary key,
  file_name    text not null default '',
  row_count    integer not null default 0,
  inserted     integer not null default 0,
  skipped      integer not null default 0,
  created_by   text not null default '',
  created_at   timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by text
);
comment on table public.prospect_import_batches is 'ชุดนำเข้าผู้สนใจเป็นดีลเลอร์ (ใบ 0275) — ยกเลิกทั้งชุดได้ · เขียนผ่านคำสั่งของฐานเท่านั้น';
alter table public.prospect_import_batches enable row level security;
revoke all on table public.prospect_import_batches from public, anon, authenticated, service_role;
grant select on table public.prospect_import_batches to authenticated;
grant all on table public.prospect_import_batches to service_role;
create policy prospect_import_batches_read on public.prospect_import_batches for select to authenticated using (is_hq());

alter table public.dealer_prospects add column if not exists import_batch_id bigint references public.prospect_import_batches (id) on delete set null;
create index if not exists dealer_prospects_import_batch_idx on public.dealer_prospects (import_batch_id) where import_batch_id is not null;
comment on column public.dealer_prospects.import_batch_id is 'ชุดนำเข้าที่สร้างรายนี้ (ใบ 0275) · ว่าง = เพิ่มเองบนหน้าจอ';

/** เบอร์เป็นตัวเลขล้วน (เทียบซ้ำ) · +66 → 0 */
create or replace function public._phone_digits(p text) returns text
  language sql immutable set search_path to 'public' as $$
  select case when d ~ '^66\d{8,9}$' then '0' || substr(d, 3) else d end
    from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x
$$;
revoke all on function public._phone_digits(text) from public, anon, authenticated, service_role;

create or replace function public.hq_prospects_import(p_file text, p_rows jsonb) returns jsonb
  language plpgsql security definer set search_path to 'public' as $$
declare
  r jsonb; ชุด bigint; pid bigint; ลำดับ int := 0; เพิ่ม int := 0; แถวที่ text;
  ข้าม jsonb := '[]'::jsonb; เห็นแล้ว text[] := '{}'; เบอร์ text; ชื่อ text; สถานะ text; จังหวัด text; หมายเหตุติดต่อ text; เริ่ม date;
begin
  if not can_write_master() then raise exception 'forbidden: นำเข้าผู้สนใจได้เฉพาะผู้ดูแลระบบ/ผู้บริหารสำนักงานใหญ่'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'import_rows: ข้อมูลแถวไม่ถูกต้อง'; end if;
  if jsonb_array_length(p_rows) = 0 then raise exception 'import_rows: ไม่มีแถวให้นำเข้า'; end if;
  if jsonb_array_length(p_rows) > 1000 then raise exception 'import_limit: นำเข้าได้ครั้งละไม่เกิน 1,000 แถว (ส่งมา %)', jsonb_array_length(p_rows); end if;

  perform pg_advisory_xact_lock(hashtext('hq_prospects_import'));   -- สองชุดพร้อมกันไม่สร้างเบอร์ซ้ำ
  insert into prospect_import_batches (file_name, row_count, created_by)
  values (left(btrim(coalesce(p_file, '')), 200), jsonb_array_length(p_rows), audit_actor_name()) returning id into ชุด;
  perform set_config('pms.audit_skip', 'on', true);                 -- บันทึกการใช้งานแถวเดียวต่อชุด (ท้ายคำสั่ง)

  for r in select * from jsonb_array_elements(p_rows) loop
    ลำดับ := ลำดับ + 1;
    แถวที่ := coalesce(r->>'row', ลำดับ::text);
    เบอร์ := _phone_digits(r->>'phone');
    ชื่อ := btrim(coalesce(r->>'name', ''));
    สถานะ := coalesce(nullif(r->>'status', ''), 'new');
    จังหวัด := nullif(btrim(coalesce(r->>'province', '')), '');
    if ชื่อ = '' then
      ข้าม := ข้าม || jsonb_build_object('row', แถวที่, 'reason', 'ไม่มีชื่อ'); continue;
    end if;
    if เบอร์ !~ '^0\d{8,9}$' then
      ข้าม := ข้าม || jsonb_build_object('row', แถวที่, 'reason', 'ไม่มีเบอร์โทรที่ถูกต้อง'); continue;
    end if;
    if เบอร์ = any(เห็นแล้ว) then
      ข้าม := ข้าม || jsonb_build_object('row', แถวที่, 'reason', 'เบอร์ซ้ำกับแถวก่อนหน้าในไฟล์'); continue;
    end if;
    if exists (select 1 from dealer_prospects p where _phone_digits(p.phone) = เบอร์) then
      ข้าม := ข้าม || jsonb_build_object('row', แถวที่, 'reason', 'เบอร์นี้มีผู้สนใจอยู่แล้ว'); continue;
    end if;
    if สถานะ not in ('new', 'contacted', 'profile_sent', 'lost') then
      raise exception 'import_status: แถว % ขั้น "%" นำเข้าไม่ได้ (ได้เฉพาะ รอติดต่อ · ติดต่อแล้ว · ส่งข้อมูลบริษัทแล้ว · ไม่สำเร็จ)', แถวที่, สถานะ;
    end if;
    if สถานะ = 'lost' and btrim(coalesce(r->>'lost_reason', '')) = '' then
      raise exception 'import_lost_reason: แถว % ไม่สำเร็จต้องมีเหตุผล', แถวที่;
    end if;
    if จังหวัด is not null and not _province_ok(จังหวัด) then
      raise exception 'province_invalid: แถว % จังหวัด "%" ไม่อยู่ในรายชื่อ 77 จังหวัด', แถวที่, จังหวัด;
    end if;
    เริ่ม := nullif(r->>'first_contact', '')::date;
    เห็นแล้ว := เห็นแล้ว || เบอร์;

    insert into dealer_prospects (name, social, phone, province, region, channel, first_contact, follow_up, note, status, lost_reason, import_batch_id)
    values (left(ชื่อ, 200), nullif(left(btrim(coalesce(r->>'social', '')), 200), ''),
            case when length(เบอร์) = 10 then substr(เบอร์, 1, 3) || '-' || substr(เบอร์, 4, 3) || '-' || substr(เบอร์, 7)
                 else substr(เบอร์, 1, 2) || '-' || substr(เบอร์, 3, 3) || '-' || substr(เบอร์, 6) end,
            จังหวัด, (select t.region from th_provinces t where t.name = จังหวัด),
            nullif(left(btrim(coalesce(r->>'channel', '')), 50), ''), เริ่ม, nullif(r->>'follow_up', '')::date,
            nullif(left(btrim(coalesce(r->>'note', '')), 2000), ''), สถานะ,
            case when สถานะ = 'lost' then left(btrim(r->>'lost_reason'), 200) end, ชุด)
    returning id into pid;
    -- หมายเหตุเดิม = บันทึกการติดต่อครั้งแรก (ข้อความเดิมเสมอ) · ติดต่อล่าสุด = วันเริ่มติดต่อในไฟล์
    หมายเหตุติดต่อ := btrim(coalesce(r->>'contact_note', ''));
    if หมายเหตุติดต่อ <> '' then
      insert into dealer_prospect_activities (prospect_id, kind, channel, body)
      values (pid, 'contact', 'อื่น ๆ', left('จากไฟล์นำเข้า: ' || หมายเหตุติดต่อ, 2000));
      perform set_config('app.prospect_contact', 'on', true);
      update dealer_prospects
         set last_contact_at = case when เริ่ม is not null then (เริ่ม::timestamp + interval '9 hours') at time zone 'Asia/Bangkok' else last_contact_at end,
             first_contact = coalesce(เริ่ม, first_contact), status = สถานะ
       where id = pid;
      perform set_config('app.prospect_contact', 'off', true);
    end if;
    เพิ่ม := เพิ่ม + 1;
  end loop;

  perform set_config('pms.audit_skip', '', true);
  update prospect_import_batches set inserted = เพิ่ม, skipped = jsonb_array_length(ข้าม) where id = ชุด;
  perform _audit_hq('นำเข้าผู้สนใจเป็นดีลเลอร์', coalesce(nullif(btrim(p_file), ''), 'ไฟล์ไม่มีชื่อ') || ' · เพิ่ม ' || เพิ่ม || ' ราย · ข้าม ' || jsonb_array_length(ข้าม) || ' แถว · ชุด ' || ชุด);
  return jsonb_build_object('batch', ชุด, 'inserted', เพิ่ม, 'skipped', ข้าม);
end $$;
revoke all on function public.hq_prospects_import(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.hq_prospects_import(text, jsonb) to authenticated;

/** จำนวนรายในชุดที่ถูกแตะแล้วหลังนำเข้า (บันทึกการติดต่อ/เปลี่ยนขั้น/ใบค่าแฟรนไชส์/เป็นดีลเลอร์) */
create or replace function public._import_batch_touched(p_batch bigint) returns integer
  language sql stable security definer set search_path to 'public' as $$
  select count(*)::int
    from dealer_prospects p
    join prospect_import_batches b on b.id = p.import_batch_id
   where p.import_batch_id = p_batch
     and (p.status = 'won' or p.dealer_code is not null
          or exists (select 1 from dealer_package_proposals x where x.prospect_id = p.id)
          or exists (select 1 from dealer_prospect_activities a
                      where a.prospect_id = p.id and a.kind in ('contact', 'status', 'proposal') and a.created_at > b.created_at))
$$;
revoke all on function public._import_batch_touched(bigint) from public, anon, authenticated, service_role;

create or replace function public.hq_prospects_import_cancel(p_batch bigint) returns jsonb
  language plpgsql security definer set search_path to 'public' as $$
declare b prospect_import_batches; แตะ int; n int;
begin
  if not can_write_master() then raise exception 'forbidden: ยกเลิกการนำเข้าได้เฉพาะผู้ดูแลระบบ/ผู้บริหารสำนักงานใหญ่'; end if;
  select * into b from prospect_import_batches where id = p_batch for update;
  if not found then raise exception 'not_found: ไม่พบชุดนำเข้านี้'; end if;
  if b.cancelled_at is not null then raise exception 'import_cancelled: ชุดนี้ยกเลิกไปแล้ว'; end if;
  แตะ := _import_batch_touched(p_batch);
  if แตะ > 0 then
    raise exception 'import_in_use: ยกเลิกทั้งชุดไม่ได้ — มี % รายที่ถูกแตะแล้วหลังนำเข้า (บันทึกการติดต่อ · เปลี่ยนขั้น · ออกใบค่าแฟรนไชส์)', แตะ;
  end if;
  perform set_config('pms.audit_skip', 'on', true);
  delete from dealer_prospects where import_batch_id = p_batch;
  get diagnostics n = row_count;
  perform set_config('pms.audit_skip', '', true);
  update prospect_import_batches set cancelled_at = now(), cancelled_by = audit_actor_name() where id = p_batch;
  perform _audit_hq('ยกเลิกการนำเข้าผู้สนใจ', coalesce(nullif(b.file_name, ''), 'ไฟล์ไม่มีชื่อ') || ' · ลบ ' || n || ' ราย · ชุด ' || p_batch);
  return jsonb_build_object('batch', p_batch, 'deleted', n);
end $$;
revoke all on function public.hq_prospects_import_cancel(bigint) from public, anon, authenticated, service_role;
grant execute on function public.hq_prospects_import_cancel(bigint) to authenticated;

create or replace function public.hq_prospect_import_batches() returns jsonb
  language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_hq() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'fileName', b.file_name, 'rowCount', b.row_count, 'inserted', b.inserted,
                                                     'skipped', b.skipped, 'createdBy', b.created_by, 'createdAt', b.created_at,
                                                     'cancelledAt', b.cancelled_at, 'touched', _import_batch_touched(b.id),
                                                     'remaining', (select count(*) from dealer_prospects p where p.import_batch_id = b.id))
                                  order by b.id desc)
                     from (select * from prospect_import_batches order by id desc limit 20) b), '[]'::jsonb);
end $$;
revoke all on function public.hq_prospect_import_batches() from public, anon, authenticated, service_role;
grant execute on function public.hq_prospect_import_batches() to authenticated;
