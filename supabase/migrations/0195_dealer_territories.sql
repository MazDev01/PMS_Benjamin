-- ── กฎพื้นที่: หนึ่งจังหวัด หนึ่งดีลเลอร์ (FLOW.html กฎที่ระบบบังคับ · ด่าน 1) ─────────────────────────────────
--
-- FLOW.html: "หนึ่งจังหวัด หนึ่งดีลเลอร์ — หน้างานต้องอยู่ในพื้นที่ตัวเอง จังหวัดที่ยังว่าง ใครยื่นก่อนได้งาน"
-- ข้อตัดสินของบอส 14 ต.ค. 69:
--   - dealer_territories: หนึ่งจังหวัด หนึ่งดีลเลอร์ (unique) บังคับกับการกำหนดพื้นที่ใหม่
--   - จังหวัดที่ดีลเลอร์เดิมทับกันอยู่ (ระบบจริง 32 จังหวัด): ยกเว้นไว้ ติดป้าย legacy ดีลเลอร์เดิมสร้างลูกค้าเป้าหมายได้ตามเดิม
--     HQ เห็นรายการจังหวัดทับซ้อน และเคลียร์ทีละจังหวัด — เคลียร์แล้วกฎใช้เต็ม
--   - ลูกค้าเป้าหมายใหม่: หน้างานต้องอยู่ในพื้นที่ตัวเอง · จังหวัดว่าง ใครยื่นก่อนได้งาน
--   - ลูกค้าเป้าหมายเดิมที่ไม่มีจังหวัด (ระบบจริง 80 ราย) ไม่ถูกบล็อก จนกว่าจะแก้จังหวัด
--   - ย้ายพื้นที่จากจังหวัดของดีลเลอร์เดิม โดยเทียบกับรายชื่อมาตรฐานเท่านั้น — สะกดไม่ตรง = ไม่จับคู่เอง รายงานให้ HQ แก้
--
-- การตีความของผม (ไฟล์ไม่ได้เขียนตรง ๆ): "จังหวัดว่าง ใครยื่นก่อนได้งาน" = งานเดียวกัน (ชื่อ + เบอร์หลังปรับรูปแบบ)
--   ในจังหวัดที่ยังไม่มีเจ้าของ ดีลเลอร์รายแรกที่ยื่นได้งาน รายถัดไปยื่นซ้ำไม่ได้ · งานคนละงานยื่นได้ทุกราย
--   (ในพื้นที่ของตัวเอง กันซ้ำเฉพาะในดีลเลอร์เดียวกันตามข้อตัดสิน 12 ต.ค. 69)

-- ═══ 1. รายชื่อจังหวัดมาตรฐาน (ตรงกับ packages/shared/lib/provinces.ts · ไม่รวมชื่อย่อ เช่น "กรุงเทพฯ") ═══
create table public.th_provinces (
  name   text primary key,
  region text not null
);
insert into public.th_provinces (name, region) values
  ('เชียงใหม่', 'เหนือ'),
  ('เชียงราย', 'เหนือ'),
  ('ลำปาง', 'เหนือ'),
  ('ลำพูน', 'เหนือ'),
  ('แม่ฮ่องสอน', 'เหนือ'),
  ('น่าน', 'เหนือ'),
  ('พะเยา', 'เหนือ'),
  ('แพร่', 'เหนือ'),
  ('อุตรดิตถ์', 'เหนือ'),
  ('กาฬสินธุ์', 'อีสาน'),
  ('ขอนแก่น', 'อีสาน'),
  ('ชัยภูมิ', 'อีสาน'),
  ('นครพนม', 'อีสาน'),
  ('นครราชสีมา', 'อีสาน'),
  ('บึงกาฬ', 'อีสาน'),
  ('บุรีรัมย์', 'อีสาน'),
  ('มหาสารคาม', 'อีสาน'),
  ('มุกดาหาร', 'อีสาน'),
  ('ยโสธร', 'อีสาน'),
  ('ร้อยเอ็ด', 'อีสาน'),
  ('เลย', 'อีสาน'),
  ('ศรีสะเกษ', 'อีสาน'),
  ('สกลนคร', 'อีสาน'),
  ('สุรินทร์', 'อีสาน'),
  ('หนองคาย', 'อีสาน'),
  ('หนองบัวลำภู', 'อีสาน'),
  ('อำนาจเจริญ', 'อีสาน'),
  ('อุดรธานี', 'อีสาน'),
  ('อุบลราชธานี', 'อีสาน'),
  ('กรุงเทพมหานคร', 'กลาง'),
  ('กำแพงเพชร', 'กลาง'),
  ('ชัยนาท', 'กลาง'),
  ('นครนายก', 'กลาง'),
  ('นครปฐม', 'กลาง'),
  ('นครสวรรค์', 'กลาง'),
  ('นนทบุรี', 'กลาง'),
  ('ปทุมธานี', 'กลาง'),
  ('พระนครศรีอยุธยา', 'กลาง'),
  ('พิจิตร', 'กลาง'),
  ('พิษณุโลก', 'กลาง'),
  ('เพชรบูรณ์', 'กลาง'),
  ('ลพบุรี', 'กลาง'),
  ('สมุทรปราการ', 'กลาง'),
  ('สมุทรสงคราม', 'กลาง'),
  ('สมุทรสาคร', 'กลาง'),
  ('สระบุรี', 'กลาง'),
  ('สิงห์บุรี', 'กลาง'),
  ('สุโขทัย', 'กลาง'),
  ('สุพรรณบุรี', 'กลาง'),
  ('อ่างทอง', 'กลาง'),
  ('อุทัยธานี', 'กลาง'),
  ('จันทบุรี', 'ตะวันออก'),
  ('ฉะเชิงเทรา', 'ตะวันออก'),
  ('ชลบุรี', 'ตะวันออก'),
  ('ตราด', 'ตะวันออก'),
  ('ปราจีนบุรี', 'ตะวันออก'),
  ('ระยอง', 'ตะวันออก'),
  ('สระแก้ว', 'ตะวันออก'),
  ('กาญจนบุรี', 'ตะวันตก'),
  ('ตาก', 'ตะวันตก'),
  ('ประจวบคีรีขันธ์', 'ตะวันตก'),
  ('เพชรบุรี', 'ตะวันตก'),
  ('ราชบุรี', 'ตะวันตก'),
  ('กระบี่', 'ใต้'),
  ('ชุมพร', 'ใต้'),
  ('ตรัง', 'ใต้'),
  ('นครศรีธรรมราช', 'ใต้'),
  ('นราธิวาส', 'ใต้'),
  ('ปัตตานี', 'ใต้'),
  ('พังงา', 'ใต้'),
  ('พัทลุง', 'ใต้'),
  ('ภูเก็ต', 'ใต้'),
  ('ยะลา', 'ใต้'),
  ('ระนอง', 'ใต้'),
  ('สงขลา', 'ใต้'),
  ('สตูล', 'ใต้'),
  ('สุราษฎร์ธานี', 'ใต้');
comment on table public.th_provinces is 'รายชื่อจังหวัดมาตรฐาน 77 จังหวัด — พื้นที่ของดีลเลอร์ต้องเป็นชื่อในรายชื่อนี้เท่านั้น';
alter table public.th_provinces enable row level security;
create policy th_provinces_read on public.th_provinces for select to authenticated using (true);
create policy must_set_password_block on public.th_provinces as restrictive for all to authenticated
  using (not public.must_set_password()) with check (not public.must_set_password());
revoke all on table public.th_provinces from public, anon, authenticated;
grant select on table public.th_provinces to authenticated;
grant all on table public.th_provinces to service_role;

-- ═══ 2. พื้นที่ของดีลเลอร์ ═══════════════════════════════════════════════════════════════
create table public.dealer_territories (
  id          bigint generated always as identity primary key,
  province    text not null references public.th_provinces(name),
  dealer_code text not null references public.dealers(code) on update cascade on delete cascade,
  legacy      boolean not null default false,       -- ทับกับดีลเลอร์อื่นมาก่อนมีกฎ (รอ HQ เคลียร์)
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  unique (province, dealer_code)
);
-- หนึ่งจังหวัด หนึ่งดีลเลอร์ สำหรับพื้นที่ที่ไม่ใช่ legacy
create unique index dealer_territories_one_owner on public.dealer_territories (province) where not legacy;
create index dealer_territories_dealer_idx on public.dealer_territories (dealer_code);
comment on table public.dealer_territories is 'พื้นที่ (จังหวัด) ที่ดีลเลอร์ดูแล — หนึ่งจังหวัดหนึ่งดีลเลอร์ · legacy = ทับกันมาก่อนมีกฎ รอ HQ เคลียร์';

/** กันการกำหนดพื้นที่ใหม่ทับดีลเลอร์อื่น (รวมทับพื้นที่ legacy) · ป้าย legacy ตั้งได้เฉพาะตอนย้ายข้อมูล (ฝั่งเซิร์ฟเวอร์) */
create or replace function public.dealer_territories_guard() returns trigger
  language plpgsql set search_path to 'public' as $$
begin
  if new.legacy and (tg_op = 'INSERT' or not old.legacy) and auth.uid() is not null then
    raise exception 'territory_legacy_readonly: ป้ายพื้นที่ทับซ้อนเดิมตั้งเองไม่ได้ — มีเฉพาะจังหวัดที่ทับกันมาก่อนมีกฎพื้นที่';
  end if;
  if not new.legacy and exists (select 1 from dealer_territories t
                                 where t.province = new.province and t.dealer_code <> new.dealer_code and t.id <> new.id) then
    raise exception 'territory_taken: จังหวัด % มีดีลเลอร์ดูแลอยู่แล้ว — หนึ่งจังหวัด หนึ่งดีลเลอร์', new.province;
  end if;
  return new;
end $$;
revoke all on function public.dealer_territories_guard() from public, anon, authenticated, service_role;
create trigger dealer_territories_guard before insert or update on public.dealer_territories
  for each row execute function public.dealer_territories_guard();

alter table public.dealer_territories enable row level security;
create policy dealer_territories_read on public.dealer_territories for select to authenticated using (true);
create policy dealer_territories_hq_write on public.dealer_territories for all to authenticated
  using (public.can_write_master()) with check (public.can_write_master());
create policy must_set_password_block on public.dealer_territories as restrictive for all to authenticated
  using (not public.must_set_password()) with check (not public.must_set_password());
revoke all on table public.dealer_territories from public, anon, authenticated;
grant select, insert, update, delete on table public.dealer_territories to authenticated;
grant all on table public.dealer_territories to service_role;
revoke all on sequence public.dealer_territories_id_seq from public, anon, authenticated;
grant usage, select on sequence public.dealer_territories_id_seq to authenticated;
grant all on sequence public.dealer_territories_id_seq to service_role;

-- ═══ 3. ย้ายพื้นที่จากจังหวัดของดีลเลอร์เดิม ════════════════════════════════════════════════
--   จังหวัดที่มีดีลเลอร์รายเดียว → พื้นที่เต็มกฎ · หลายราย → legacy ทุกราย · สะกดไม่ตรงรายชื่อมาตรฐาน → ไม่จับคู่ (ข้อ 4)
--   แถวรหัส HQ ไม่ได้พื้นที่: FLOW.html "HQ ไม่คุยกับลูกค้าปลายทางโดยตรง"
insert into public.dealer_territories (province, dealer_code, legacy)
select d.province, d.code, count(*) over (partition by d.province) > 1
  from public.dealers d join public.th_provinces p on p.name = d.province
 where d.code <> 'HQ';

do $$
declare n_bad int; codes text;
begin
  select count(*), string_agg(code, ', ' order by code) into n_bad, codes
    from public.dealers d
   where d.code <> 'HQ' and not exists (select 1 from public.th_provinces p where p.name = d.province);
  raise notice 'กฎพื้นที่: ดีลเลอร์ที่จังหวัดไม่ตรงรายชื่อมาตรฐาน % ราย (ไม่ได้พื้นที่ · HQ ต้องแก้เอง)%', n_bad,
    case when n_bad > 0 then ': ' || codes else '' end;
end $$;

-- ═══ 4. สิ่งที่ HQ ต้องเห็น ════════════════════════════════════════════════════════════════
/** จังหวัดที่ทับซ้อน (ติดป้าย legacy) พร้อมดีลเลอร์ที่ทับกัน */
create view public.territory_overlaps with (security_invoker = true) as
select t.province, p.region, array_agg(t.dealer_code order by t.dealer_code) as dealer_codes
  from public.dealer_territories t join public.th_provinces p on p.name = t.province
 group by t.province, p.region
having count(*) > 1 or bool_or(t.legacy);
revoke all on public.territory_overlaps from public, anon, authenticated;
grant select on public.territory_overlaps to authenticated, service_role;

/** ดีลเลอร์ที่ไม่มีพื้นที่ เพราะจังหวัดในทะเบียนไม่ตรงรายชื่อมาตรฐาน — HQ แก้จังหวัดหรือกำหนดพื้นที่เอง (ระบบไม่เดา) */
create or replace function public.territory_unmatched_dealers()
  returns table (dealer_code text, province text) language sql stable set search_path to 'public' as $$
  select d.code, d.province from dealers d
   where d.code <> 'HQ'
     and not exists (select 1 from th_provinces p where p.name = d.province)
     and not exists (select 1 from dealer_territories t where t.dealer_code = d.code)
   order by d.code
$$;
revoke all on function public.territory_unmatched_dealers() from public, anon, authenticated, service_role;
grant execute on function public.territory_unmatched_dealers() to authenticated, service_role;

/** HQ เคลียร์จังหวัดทับซ้อน: เก็บดีลเลอร์ p_keep ไว้รายเดียว ที่เหลือถอดออก แล้วกฎใช้เต็ม */
create or replace function public.territory_resolve_overlap(p_province text, p_keep text) returns void
  language plpgsql security definer set search_path to 'public' as $$
declare removed text;
begin
  if not can_write_master() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่ที่จัดการพื้นที่ได้'; end if;
  if not exists (select 1 from territory_overlaps o where o.province = p_province) then
    raise exception 'territory_not_overlap: จังหวัด % ไม่ได้ทับซ้อน', p_province;
  end if;
  if not exists (select 1 from dealer_territories where province = p_province and dealer_code = p_keep) then
    raise exception 'territory_keep_missing: ดีลเลอร์ % ไม่ได้อยู่ในจังหวัด %', p_keep, p_province;
  end if;
  select string_agg(dealer_code, ', ' order by dealer_code) into removed
    from dealer_territories where province = p_province and dealer_code <> p_keep;
  delete from dealer_territories where province = p_province and dealer_code <> p_keep;
  update dealer_territories set legacy = false where province = p_province and dealer_code = p_keep;
  insert into audit_log("user", role, action, target)
  values (audit_actor(), auth_role(), 'เคลียร์จังหวัดทับซ้อน', p_province || ' · เก็บ ' || p_keep || ' · ถอด ' || coalesce(removed, '—'));
end $$;
revoke all on function public.territory_resolve_overlap(text, text) from public, anon, authenticated, service_role;
grant execute on function public.territory_resolve_overlap(text, text) to authenticated;

-- ═══ 5. ลูกค้าเป้าหมาย: หน้างานต้องอยู่ในพื้นที่ตัวเอง · จังหวัดว่าง ใครยื่นก่อนได้งาน ═════════════════════
--   ทำงานตอนสร้างลูกค้าเป้าหมาย และตอนแก้จังหวัดเท่านั้น — รายเดิมที่ไม่ได้แตะจังหวัดไม่ถูกบล็อก
--   ไม่ใช้กับ: ฝั่งเซิร์ฟเวอร์/งานในฐาน · สำนักงานใหญ่ (จัดสรรงานเอง) · งานขายใหม่ของลูกค้าเดิม (ผูก customer_id)
--   ทำงานด้วยสิทธิ์เจ้าของ: ต้องเห็นลูกค้าเป้าหมายของดีลเลอร์อื่นเพื่อตรวจ "ยื่นก่อน" (ดีลเลอร์มองไม่เห็นของสาขาอื่นเอง)
create or replace function public.leads_territory_guard() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare
  p text := btrim(coalesce(new.province, ''));
  v_key text; v_dup text;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return new; end if;
  if coalesce(current_setting('pms.flow_sync', true), '') = '1' then return new; end if;
  if is_hq() then return new; end if;
  if tg_op = 'UPDATE' and new.province is not distinct from old.province then return new; end if;
  if p = '' or new.customer_id is not null then return new; end if;

  if exists (select 1 from dealer_territories t where t.province = p and t.dealer_code = new.dealer_code) then
    return new;                                                     -- พื้นที่ของตัวเอง (รวมพื้นที่ทับซ้อนเดิม)
  end if;
  if exists (select 1 from dealer_territories t where t.province = p) then
    raise exception 'lead_outside_territory: หน้างานจังหวัด % อยู่ในพื้นที่ของดีลเลอร์อื่น — หนึ่งจังหวัด หนึ่งดีลเลอร์', p;
  end if;

  -- จังหวัดว่าง: งานเดียวกันที่ดีลเลอร์อื่นยื่นไว้ก่อนและยังเปิดอยู่ = ยื่นซ้ำไม่ได้
  if regexp_replace(coalesce(new.phone, ''), '\D', '', 'g') = '' then return new; end if;
  v_key := lead_dedupe_key(new.company, new.phone);
  perform pg_advisory_xact_lock(hashtextextended('free-province#' || p || '#' || v_key, 0));
  select l.dealer_code into v_dup from leads l
   where l.dealer_code <> new.dealer_code and btrim(l.province) = p
     and lead_dedupe_key(l.company, l.phone) = v_key
     and l.status not in ('PAID', 'CANCELLED') and l.customer_id is null
   limit 1;
  if v_dup is not null then
    raise exception 'lead_taken: งานนี้ในจังหวัด % มีดีลเลอร์อื่นยื่นไว้ก่อนแล้ว — จังหวัดที่ยังว่าง ใครยื่นก่อนได้งาน', p;
  end if;
  return new;
end $$;
revoke all on function public.leads_territory_guard() from public, anon, authenticated, service_role;
drop trigger if exists leads_territory_guard on public.leads;
create trigger leads_territory_guard before insert or update of province on public.leads
  for each row execute function public.leads_territory_guard();
