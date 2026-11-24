-- ══ 0301 · เหตุผลปิดการขายไม่สำเร็จ / ลูกค้าปฏิเสธ = รายการกลางชุดเดียว (บอสตัดสิน 23 พ.ย. 69 ข้อ 14 · แบบเดียวกับใบ 0296) ══
-- เดิม: ดีลเลอร์เลือกจาก hq_sales_journey.lost (ข้อความ) · ข้อมูลเก็บข้อความ (leads/quotations/quote_requests.lost_reason)
--   กราฟเหตุผลของ HQ นับข้อความตามจริง → ป้ายคนละชุดกับฟอร์มดีลเลอร์ (ข้อมูลตัวอย่าง/พิมพ์เอง/ชื่อเก่า) (ผู้ตรวจ 23 พ.ย. 69)
-- ตอนนี้: option_lists รายการ lead_lost_reason (HQ ตั้งที่ ตั้งค่า › รายการกลาง) · ข้อมูลเก็บรหัส · "อื่น ๆ (ระบุ)" เก็บ "other:ข้อความ"
--   ใช้ที่: ปิดไม่สำเร็จ (ขั้นต่อไป/แผงลูกค้าเป้าหมาย) · ลูกค้าปฏิเสธใบเสนอราคา · กราฟ/ตาราง/ส่งออกเหตุผลของ HQ · ประวัติคำขอราคา
-- 1) ตัวเลือกตั้งต้น = รายการที่ HQ ตั้งไว้เดิม (hq_sales_journey.lost ตามลำดับ) · 4 ชื่อเดิมของระบบได้รหัสตายตัว · ชื่อที่ HQ เพิ่มเอง = r_<md5>
--    ชื่อเดิมที่ HQ เอาออกจากรายการแล้ว = ซ่อน (ข้อมูลเก่ายังแสดงชื่อ) · "อื่น ๆ (ระบุ)" ท้ายรายการเสมอ · hq_sales_journey.lost คงไว้ ไม่มีที่อ่านแล้ว
-- 2) ตัวจัดค่า _lead_lost_value(): รหัส/รหัส:ข้อความ = คงเดิม · ชื่อตรงรายการ (ไม่สนช่องว่าง · "อื่นๆ" = "อื่น ๆ") = รหัส
--    · ข้อความเดิมที่อยู่ใน "ตารางจับคู่" (lead_lost_reason_map · แก้ที่ก้อน ★ ตารางจับคู่ ★ ด้านล่างจุดเดียว) = รหัสตามตาราง
--    "อื่น ๆ: ข้อความ" / "อื่นๆ (ระบุเอง): ข้อความ" = other:ข้อความ · อื่น ๆ ทั้งหมด = "other:ข้อความเดิม" (ไม่ทิ้งข้อความ · ไม่เดาความหมาย)
--    ตัวกระตุ้นก่อนเขียนบน leads · quotations · quote_requests เรียกตัวนี้ทุกทาง (หน้าจอ · /api/v1 · ย้อนการตอบรับ · คำสั่งในฐาน · dev-sample)
-- 3) แปลงข้อมูลเดิมด้วยตัวเดียวกัน (ปิดตัวดัก · วิธีเดียวกับใบ 0296 — ไม่ลงประวัติ/บันทึก) · ค่าเดิมทุกแถวที่เปลี่ยนเก็บใน lost_reason_backup_0301
--    ตารางจับคู่ = FLOW กฎ lead-lost-reason (ชื่อตรงรายการ → รหัส · ไม่ตรง = อื่น ๆ + ข้อความเดิม)
-- 4) _option_in_use / option_lists_save รู้จักรายการใหม่ (ยกจากใบ 0296 · เปลี่ยนเฉพาะจุดรายการ)
-- 5) ประวัติคำขอราคา (quote_requests_log · ยกจากใบ 0224): หมายเหตุตอนปิดไม่ได้งาน = ชื่อเหตุผล (ไม่ใช่รหัส)
-- ข้อทดสอบ: ซ้อมลงใบ tests/tools/migration-0301.test.mjs (นับก่อน/หลัง · ตารางสำรอง) · tests/unit/optionLists.test.ts

-- ═══ 1. รายการ ═══════════════════════════════════════════════════════════════════════════════════════════
alter table public.option_lists drop constraint if exists option_lists_list_check;
alter table public.option_lists add constraint option_lists_list_check
  check (list in ('lead_source', 'appointment_type', 'prospect_lost_reason', 'lead_lost_reason'));

do $seed$
declare
  เดิม text[] := coalesce((select lost from public.hq_sales_journey where id = 1), '{}');
  มีเดิม boolean;
  x record;
  n int := 0;
begin
  มีเดิม := coalesce(array_length(เดิม, 1), 0) > 0;
  -- 4 ชื่อเดิมของระบบ (ค่าตั้งต้น LOST_REASONS · ใบ 0021) — ไม่อยู่ในรายการที่ HQ ตั้งแล้ว = ซ่อน
  insert into public.option_lists (list, code, label, sort, hidden, free_text)
  select 'lead_lost_reason', d.code, d.label, d.sort,
         มีเดิม and not exists (select 1 from unnest(เดิม) e where public._option_key(e) = public._option_key(d.label)), false
    from (values ('price_high', 'ราคาสูงเกินงบประมาณ', 1), ('competitor', 'คู่แข่งให้ข้อเสนอดีกว่า', 2),
                 ('budget', 'งบประมาณไม่พร้อม', 3), ('no_response', 'ลูกค้าไม่ตอบสนอง', 4)) as d(code, label, sort)
  on conflict (list, code) do nothing;
  -- ชื่อที่ HQ ตั้งเพิ่มเอง (ตามลำดับเดิม · ชื่อซ้ำ/อื่น ๆ ข้าม)
  for x in select btrim(e) as label, o from unnest(เดิม) with ordinality as t(e, o) order by o loop
    continue when x.label = '' or char_length(x.label) > 60;
    continue when public._option_key(x.label) like public._option_key('อื่น ๆ') || '%';
    continue when exists (select 1 from public.option_lists where list = 'lead_lost_reason' and public._option_key(label) = public._option_key(x.label));
    n := n + 1;
    insert into public.option_lists (list, code, label, sort, hidden, free_text)
    values ('lead_lost_reason', 'r_' || substr(md5(x.label), 1, 10), x.label, 10 + n, false, false)
    on conflict (list, code) do nothing;
  end loop;
  insert into public.option_lists (list, code, label, sort, hidden, free_text)
  values ('lead_lost_reason', 'other', 'อื่น ๆ (ระบุ)', 90, false, true)
  on conflict (list, code) do nothing;
end $seed$;

-- ═══ 1b. ★ ตารางจับคู่ข้อความเดิม → รหัส ★ (จุดเดียวที่แก้ · บอสกำหนดหลังดูค่าจริงบนฐานจริง · คนรวมงาน 24 พ.ย. 69) ═══════
--   ตอนนี้ว่าง = จับคู่เฉพาะชื่อตรงรายการ · เพิ่มแถว: ('ข้อความเดิม', 'รหัสในรายการ') เช่น ('งบประมาณไม่พอ', 'budget')
--   เทียบแบบไม่สนช่องว่าง/ตัวเล็กใหญ่ ("อื่นๆ" = "อื่น ๆ") · รหัสที่ไม่มีในรายการ = ลงใบไม่ผ่าน (กันพิมพ์ผิด)
create table if not exists public.lead_lost_reason_map (
  old_key text primary key,
  old_text text not null,
  code text not null
);
comment on table public.lead_lost_reason_map is 'ตารางจับคู่ข้อความเหตุผลเดิม → รหัส lead_lost_reason (ใบ 0301) — ตัวจัดค่า _lead_lost_value ใช้';
alter table public.lead_lost_reason_map enable row level security;
revoke all on table public.lead_lost_reason_map from public, anon, authenticated;
grant all on table public.lead_lost_reason_map to service_role;
insert into public.lead_lost_reason_map (old_key, old_text, code)
select public._option_key(m.old_text), m.old_text, m.code
  from (values
    ('', '')   -- ★ ใส่แถวจับคู่ที่นี่ (แถวนี้เป็นตัวยึดที่ว่าง — ถูกข้าม)
  ) as m(old_text, code)
 where btrim(m.old_text) <> ''
on conflict (old_key) do update set old_text = excluded.old_text, code = excluded.code;
do $chk$ begin
  if exists (select 1 from public.lead_lost_reason_map m
              where not exists (select 1 from public.option_lists o where o.list = 'lead_lost_reason' and o.code = m.code and not o.free_text)) then
    raise exception 'lost_reason_map_bad_code: ตารางจับคู่มีรหัสที่ไม่มีในรายการ lead_lost_reason';
  end if;
end $chk$;

-- ═══ 2. ตัวจัดค่า + ตัวกระตุ้น ═══════════════════════════════════════════════════════════════════════════════
create or replace function public._lead_lost_value(p text) returns text
  language plpgsql stable security definer set search_path to 'public' as $$
declare
  v text := btrim(coalesce(p, ''));
  i int;
  รหัส text;
  หลัง text;
begin
  if v = '' then return p; end if;
  if exists (select 1 from option_lists where list = 'lead_lost_reason' and code = v) then return v; end if;
  i := position(':' in v);
  if i > 1 and exists (select 1 from option_lists where list = 'lead_lost_reason' and code = left(v, i - 1) and free_text) then return v; end if;
  -- ชื่อตรงรายการ (ตัวที่แสดงก่อนตัวที่ซ่อน)
  select code into รหัส from option_lists
   where list = 'lead_lost_reason' and not free_text and _option_key(label) = _option_key(v)
   order by hidden, sort, code limit 1;
  if รหัส is not null then return รหัส; end if;
  -- ตารางจับคู่ (ข้อความเดิมที่บอสกำหนด)
  select m.code into รหัส from lead_lost_reason_map m
   where m.old_key = _option_key(v) and exists (select 1 from option_lists o where o.list = 'lead_lost_reason' and o.code = m.code);
  if รหัส is not null then return รหัส; end if;
  if not exists (select 1 from option_lists where list = 'lead_lost_reason' and code = 'other' and free_text) then return v; end if;
  -- "อื่น ๆ: ข้อความ" · "อื่นๆ (ระบุเอง): ข้อความ" → other:ข้อความ
  if _option_key(v) like _option_key('อื่น ๆ') || '%' and i > 1 then
    หลัง := btrim(substr(v, i + 1));
    if หลัง <> '' then return 'other:' || left(หลัง, 200); end if;
  end if;
  return 'other:' || left(v, 200);
end $$;
revoke all on function public._lead_lost_value(text) from public, anon, authenticated, service_role;

create or replace function public._lead_lost_reason_code() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' or new.lost_reason is distinct from old.lost_reason then
    new.lost_reason := _lead_lost_value(new.lost_reason);
  end if;
  return new;
end $$;
revoke all on function public._lead_lost_reason_code() from public, anon, authenticated, service_role;
-- "aa_" = ทำก่อนตัวดักอื่นของตาราง (ตัวดักที่คัดลอกเหตุผลไปตารางอื่นเห็นรหัสแล้ว — ตารางปลายทางก็จัดซ้ำอีกชั้น)
drop trigger if exists aa_lost_reason_code on public.leads;
create trigger aa_lost_reason_code before insert or update of lost_reason on public.leads
  for each row execute function public._lead_lost_reason_code();
drop trigger if exists aa_lost_reason_code on public.quotations;
create trigger aa_lost_reason_code before insert or update of lost_reason on public.quotations
  for each row execute function public._lead_lost_reason_code();
drop trigger if exists aa_lost_reason_code on public.quote_requests;
create trigger aa_lost_reason_code before insert or update of lost_reason on public.quote_requests
  for each row execute function public._lead_lost_reason_code();

-- ═══ 3. แปลงข้อมูลเดิม (สำรองค่าเดิมทุกแถวที่เปลี่ยน) ═══════════════════════════════════════════════════════
create table if not exists public.lost_reason_backup_0301 (
  tbl text not null, row_key text not null, old_value text, new_value text, at timestamptz not null default now(),
  primary key (tbl, row_key)
);
comment on table public.lost_reason_backup_0301 is 'ค่าเหตุผลเดิมก่อนแปลงเป็นรหัส (ใบ 0301) — ย้อนได้ด้วย update … set lost_reason = old_value · ไม่มีหน้าจออ่าน';
alter table public.lost_reason_backup_0301 enable row level security;
revoke all on table public.lost_reason_backup_0301 from public, anon, authenticated;
grant all on table public.lost_reason_backup_0301 to service_role;

insert into public.lost_reason_backup_0301 (tbl, row_key, old_value, new_value)
select 'leads', id, lost_reason, public._lead_lost_value(lost_reason) from public.leads
 where btrim(coalesce(lost_reason, '')) <> '' and public._lead_lost_value(lost_reason) is distinct from lost_reason
on conflict do nothing;
insert into public.lost_reason_backup_0301 (tbl, row_key, old_value, new_value)
select 'quotations', dealer_code || '|' || id, lost_reason, public._lead_lost_value(lost_reason) from public.quotations
 where btrim(coalesce(lost_reason, '')) <> '' and public._lead_lost_value(lost_reason) is distinct from lost_reason
on conflict do nothing;
insert into public.lost_reason_backup_0301 (tbl, row_key, old_value, new_value)
select 'quote_requests', id::text, lost_reason, public._lead_lost_value(lost_reason) from public.quote_requests
 where btrim(coalesce(lost_reason, '')) <> '' and public._lead_lost_value(lost_reason) is distinct from lost_reason
on conflict do nothing;

set session_replication_role = replica;
update public.leads l set lost_reason = b.new_value
  from public.lost_reason_backup_0301 b where b.tbl = 'leads' and b.row_key = l.id and l.lost_reason is not distinct from b.old_value;
update public.quotations q set lost_reason = b.new_value
  from public.lost_reason_backup_0301 b where b.tbl = 'quotations' and b.row_key = q.dealer_code || '|' || q.id and q.lost_reason is not distinct from b.old_value;
update public.quote_requests r set lost_reason = b.new_value
  from public.lost_reason_backup_0301 b where b.tbl = 'quote_requests' and b.row_key = r.id::text and r.lost_reason is not distinct from b.old_value;
set session_replication_role = origin;

-- ═══ 4. รายการกลางรู้จักรายการใหม่ (ยกจากใบ 0296) ═══════════════════════════════════════════════════════════
create or replace function public._option_in_use(p_list text, p_code text) returns boolean
  language plpgsql stable security definer set search_path to 'public' as $$
begin
  if p_list = 'lead_source' then
    return exists (select 1 from leads where source = p_code);
  elsif p_list = 'appointment_type' then
    return exists (select 1 from appointments where type = p_code);
  elsif p_list = 'lead_lost_reason' then   -- ใบ 0301
    return exists (select 1 from leads where lost_reason = p_code or left(lost_reason, char_length(p_code) + 1) = p_code || ':')
        or exists (select 1 from quotations where lost_reason = p_code or left(lost_reason, char_length(p_code) + 1) = p_code || ':')
        or exists (select 1 from quote_requests where lost_reason = p_code or left(lost_reason, char_length(p_code) + 1) = p_code || ':');
  elsif p_list = 'prospect_lost_reason' then
    return exists (select 1 from dealer_prospects
                    where lost_reason = p_code or left(lost_reason, char_length(p_code) + 1) = p_code || ':')
        or exists (select 1 from dealer_package_proposals
                    where status = 'rejected' and (close_reason = p_code or left(close_reason, char_length(p_code) + 1) = p_code || ':'));
  end if;
  return false;
end $$;
revoke all on function public._option_in_use(text, text) from public, anon, authenticated, service_role;

create or replace function public.option_lists_save(p_list text, p_rows jsonb) returns setof public.option_lists
  language plpgsql security definer set search_path to 'public' as $$
declare
  r jsonb;
  n int := 0;
  รหัส text;
  ชื่อ text;
  ซ่อน boolean;
  เก็บ text[] := '{}';
  ชื่อที่แสดง text[] := '{}';
  แสดง int := 0;
  เดิม int;
begin
  if not can_write_master() then raise exception 'forbidden: ตั้งค่ารายการกลางได้เฉพาะสำนักงานใหญ่'; end if;
  if p_list is null or p_list not in ('lead_source', 'appointment_type', 'prospect_lost_reason', 'lead_lost_reason') then
    raise exception 'option_list_unknown: ไม่รู้จักรายการ %', coalesce(p_list, '(ว่าง)');
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'option_list_empty: รายการต้องมีอย่างน้อย 1 ตัวเลือก';
  end if;
  if jsonb_array_length(p_rows) > 50 then raise exception 'option_list_too_long: ใส่ได้ไม่เกิน 50 ตัวเลือก'; end if;
  select count(*) into เดิม from option_lists where list = p_list;

  -- ตรวจทั้งชุดก่อนเขียน
  for r in select value from jsonb_array_elements(p_rows) loop
    ชื่อ := replace(btrim(regexp_replace(coalesce(r ->> 'label', ''), '\s+', ' ', 'g')), 'อื่นๆ', 'อื่น ๆ');
    ซ่อน := coalesce((r ->> 'hidden')::boolean, false);
    รหัส := nullif(btrim(coalesce(r ->> 'code', '')), '');
    if ชื่อ = '' then raise exception 'option_label_required: ชื่อตัวเลือกว่างไม่ได้'; end if;
    if char_length(ชื่อ) > 60 then raise exception 'option_label_too_long: ชื่อ "%" ยาวเกิน 60 ตัวอักษร', left(ชื่อ, 20); end if;
    if รหัส is not null then
      if not exists (select 1 from option_lists where list = p_list and code = รหัส) then
        raise exception 'option_not_found: ไม่พบตัวเลือกรหัส % ในรายการนี้ — โหลดหน้าใหม่แล้วลองอีกครั้ง', รหัส;
      end if;
      if รหัส = any(เก็บ) then raise exception 'option_duplicate: ตัวเลือกรหัส % ซ้ำในชุดที่ส่งมา', รหัส; end if;
      เก็บ := เก็บ || รหัส;
    end if;
    if not ซ่อน then
      if _option_key(ชื่อ) = any(ชื่อที่แสดง) then
        raise exception 'option_label_duplicate: ชื่อ "%" ซ้ำกัน — ตัวที่แสดงต้องชื่อไม่ซ้ำ', ชื่อ;
      end if;
      ชื่อที่แสดง := ชื่อที่แสดง || _option_key(ชื่อ);
      แสดง := แสดง + 1;
    end if;
  end loop;
  if แสดง = 0 then raise exception 'option_list_all_hidden: ต้องแสดงอย่างน้อย 1 ตัวเลือก'; end if;

  -- ลบตัวที่ไม่อยู่ในชุด (ตัวดักกันตัวที่มีข้อมูลใช้)
  delete from option_lists where list = p_list and not (code = any(เก็บ));

  -- เขียนตามลำดับ
  for r in select value from jsonb_array_elements(p_rows) loop
    n := n + 1;
    ชื่อ := replace(btrim(regexp_replace(coalesce(r ->> 'label', ''), '\s+', ' ', 'g')), 'อื่นๆ', 'อื่น ๆ');
    ซ่อน := coalesce((r ->> 'hidden')::boolean, false);
    รหัส := nullif(btrim(coalesce(r ->> 'code', '')), '');
    if รหัส is null then
      insert into option_lists (list, code, label, sort, hidden)
      values (p_list, 'c' || substr(md5(random()::text || clock_timestamp()::text || n::text), 1, 12), ชื่อ, n, ซ่อน);
    else
      update option_lists set label = ชื่อ, sort = n, hidden = ซ่อน
       where list = p_list and code = รหัส
         and (label, sort, hidden) is distinct from (ชื่อ, n, ซ่อน);
    end if;
  end loop;

  perform _audit_hq('ตั้งค่ารายการกลาง',
    case p_list when 'lead_source' then 'ช่องทางที่มาลูกค้าเป้าหมาย' when 'appointment_type' then 'ประเภทนัดหมาย'
                when 'lead_lost_reason' then 'เหตุผลปิดการขายไม่สำเร็จ'
                else 'เหตุผลผู้สนใจไม่สำเร็จ' end
      || ' · ' || jsonb_array_length(p_rows) || ' ตัวเลือก (เดิม ' || เดิม || ')');
  return query select * from option_lists where list = p_list order by sort, code;
end $$;
revoke all on function public.option_lists_save(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.option_lists_save(text, jsonb) to authenticated;

-- ═══ 5. ประวัติคำขอราคา: หมายเหตุตอนปิดไม่ได้งาน = ชื่อเหตุผล (ยกจากใบ 0224) ════════════════════════════════════
create or replace function public.quote_requests_log() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into quote_request_events (request_id, from_status, to_status, note, actor, actor_role)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status,
            case new.status when 'cancelled' then new.cancel_reason
                            when 'lost' then coalesce(_option_label('lead_lost_reason', new.lost_reason), '') else '' end,   -- ใบ 0301: ชื่อเหตุผล
            audit_actor(), auth_role());
    insert into audit_log("user", role, action, target)
    values (audit_actor(), auth_role(),
            case when tg_op = 'INSERT' and new.supersedes_id is not null then 'ขอแก้ราคา'
                 when tg_op = 'INSERT' then 'ส่งคำขอใบเสนอราคา'
                 else 'คำขอใบเสนอราคา ' || old.status || ' → ' || new.status end,
            new.dealer_code || ' · ' || new.request_no);
  end if;
  return new;
end $$;
revoke all on function public.quote_requests_log() from public, anon, authenticated, service_role;
