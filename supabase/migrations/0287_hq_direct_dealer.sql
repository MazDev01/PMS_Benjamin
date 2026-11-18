-- ── ใบ 0287: ดีลเลอร์ HQD "สำนักงานใหญ่ (ขายตรง)" + ย้ายลูกค้าเป้าหมายใต้ HQ ที่ยังเปิดอยู่ไป HQD (บอสสั่ง 18 พ.ย. 69) ──
-- ทับข้อตัดสิน "HQ ไม่ขายตรง" (14 ต.ค. 69 · ใบ 0197): สำนักงานใหญ่ขายตรงได้ ผ่านรหัสดีลเลอร์ HQD ที่เข้าฝั่งดีลเลอร์ได้ 1 บัญชี
-- คำตัดสินบอส:
--   1) ดีลเลอร์ HQD ชื่อ "สำนักงานใหญ่ (ขายตรง)" · ไม่ดูแลจังหวัดใด (ไม่มีแถวพื้นที่ · ไม่มีจังหวัดที่ตั้ง/ภาค)
--   2) ย้ายทุกอย่างใต้ HQ ไป HQD (บอสสั่งเพิ่ม 18 พ.ย. 69): ลูกค้าเป้าหมายทั้งหมดรวมที่ปิดแล้ว + นัดหมาย/ใบเสนอราคา/คำขอราคา/ลูกค้า/ไฟล์
--      หลังลง ใต้ HQ = 0 · คงเลขเดิม · บรรทัดประวัติ "รับโอนจากสำนักงานใหญ่" · ไม่สร้างแจ้งเตือน · จดแถวเดิมในตารางย้อนกลับ hqd_move_0287
--      ย้อนกลับ: supabase/rollback/0287_rollback.sql · HQD อ่านไฟล์ที่ย้ายมาได้ (กฎ dealer_files_read_by_row)
--   3) บัญชีเข้าฝั่งดีลเลอร์: ไม่มีในใบนี้ (ไม่มีรหัสผ่านในใบ) — บอสสร้าง/ตั้งรหัสเอง
--   4) ตัวเลข: HQD นับในยอดรวมทั้งเครือ (ตัวนับแถวลีด/ใบ/ยอดขายตัด 'HQ' อย่างเดียว คงเดิม) แต่
--      ไม่ติดอันดับ (หน้าหลัก 10 อันดับ) · ไม่มีเป้า (ฐานกัน · ไม่อยู่ในเป้ารวม/ถึงเป้า) · ไม่นับในจำนวนดีลเลอร์
--      (หน้าหลัก · การ์ดทะเบียนดีลเลอร์ · ดีลเลอร์ที่มีลูกค้า) · ไม่อยู่ในดีลเลอร์ตามภาค
-- ข้อทดสอบ: supabase/tests/hq_direct_dealer.sql · tests/scenario/hq-direct-dealer.spec.ts · tests/scenario/hq-lead-transfer.spec.ts

-- ═══ 1) พื้นที่ดูแล: HQD เหมือนแถว HQ (ไม่บังคับจังหวัดที่ตั้ง · ไม่สร้างแถวพื้นที่ · เพิ่มพื้นที่ให้ HQD ไม่ได้) ═══

CREATE OR REPLACE FUNCTION public.dealers_territory_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.code in ('HQ', 'HQD') or not _province_ok(new.province) then return null; end if;
  if tg_op = 'UPDATE' and new.province is not distinct from old.province then return null; end if;
  perform set_config('pms.territory_sync', '1', true);
  update dealer_territories set province = new.province where dealer_code = new.code and province is distinct from new.province;
  if not exists (select 1 from dealer_territories where dealer_code = new.code) then
    insert into dealer_territories (province, dealer_code) values (new.province, new.code);
  end if;
  perform set_config('pms.territory_sync', '', true);
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.dealer_territories_keep_one()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(current_setting('pms.restore', true), '') = '1' then return null; end if;
  if old.dealer_code not in ('HQ', 'HQD') and exists (select 1 from dealers where code = old.dealer_code)
     and not exists (select 1 from dealer_territories where dealer_code = old.dealer_code) then
    raise exception 'dealer_territory_required: ดีลเลอร์ % ต้องมีจังหวัดที่ดูแล 1 จังหวัด — เปลี่ยนจังหวัดที่ตั้งแทนการลบพื้นที่', old.dealer_code;
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.dealer_territories_match_dealer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ที่ตั้ง text;
begin
  -- ขายตรงของสำนักงานใหญ่ (HQD · ใบ 0287) ไม่ดูแลจังหวัดใด — กันก่อนทางลัดทุกทาง
  if new.dealer_code = 'HQD' then
    raise exception 'hq_direct_no_territory: HQD (สำนักงานใหญ่ ขายตรง) ไม่ดูแลจังหวัดใด — เพิ่มพื้นที่ดูแลไม่ได้';
  end if;
  if coalesce(current_setting('pms.territory_sync', true), '') = '1'
     or coalesce(current_setting('pms.restore', true), '') = '1' then return new; end if;
  select province into ที่ตั้ง from dealers where code = new.dealer_code;
  if new.dealer_code not in ('HQ', 'HQD') and ที่ตั้ง is distinct from new.province then
    raise exception 'dealer_territory_mismatch: จังหวัดที่ดูแลต้องเป็นจังหวัดที่ตั้งของดีลเลอร์ (%) — ดีลเลอร์ดูแล 1 จังหวัด แก้ที่จังหวัดที่ตั้ง', coalesce(ที่ตั้ง, 'ยังไม่ระบุ');
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.dealers_province_standard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.code in ('HQ', 'HQD') then return new; end if;
  if tg_op = 'UPDATE' and new.province is not distinct from old.province then return new; end if;
  if btrim(coalesce(new.province, '')) = '' then
    raise exception 'dealer_province_required: ดีลเลอร์ต้องมีจังหวัดที่ดูแล 1 จังหวัด — เลือกจากรายชื่อ 77 จังหวัด';
  end if;
  if not _province_ok(new.province) then
    raise exception 'dealer_province_invalid: จังหวัด "%" ไม่อยู่ในรายชื่อจังหวัดมาตรฐาน — เลือกจากรายชื่อ 77 จังหวัด', new.province;
  end if;
  new.province := btrim(new.province);
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.dealers_territory_on_province_fix()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p text := btrim(coalesce(new.province, ''));
begin
  if new.code in ('HQ', 'HQD') or new.province is not distinct from old.province then return null; end if;
  if not exists (select 1 from th_provinces where name = p) then return null; end if;
  if exists (select 1 from dealer_territories where dealer_code = new.code) then return null; end if;
  insert into dealer_territories (province, dealer_code) values (p, new.code)
    on conflict (province, dealer_code) do nothing;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.territory_unmatched_dealers()
 RETURNS TABLE(dealer_code text, province text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select d.code, d.province from dealers d
   where d.code not in ('HQ', 'HQD')
     and not exists (select 1 from th_provinces p where p.name = d.province)
     and not exists (select 1 from dealer_territories t where t.dealer_code = d.code)
   order by d.code
$function$;


-- ═══ 2) แถว HQD: ไม่มีเป้า · ไม่มีจังหวัด/ภาค · ลบ/เปลี่ยนรหัสไม่ได้ (ถือลูกค้าเป้าหมายของสำนักงานใหญ่) ═══
--   ฐานกันเอง ไม่พึ่งหน้าเว็บ (หน้าตั้งเป้าไม่แสดง HQD อยู่แล้ว · ยิงตรงก็ต้องถูกปฏิเสธ) · ปิดใช้งานได้ตามปกติ
create or replace function public.dealers_hq_direct_guard() returns trigger
  language plpgsql set search_path to 'public' as $$
begin
  if coalesce(current_setting('pms.restore', true), '') = '1' then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    if old.code = 'HQD' then
      raise exception 'hq_direct_protected: แถว "สำนักงานใหญ่ (ขายตรง) HQD" ลบไม่ได้ — เป็นเจ้าของลูกค้าเป้าหมายที่สำนักงานใหญ่ขายตรง';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.code = 'HQD' and new.code is distinct from old.code then
    raise exception 'hq_direct_protected: เปลี่ยนรหัสของแถว "สำนักงานใหญ่ (ขายตรง) HQD" ไม่ได้';
  end if;
  if new.code = 'HQD' then
    if coalesce(new.revenue_target, 0) <> 0 then
      raise exception 'hq_direct_no_target: HQD (สำนักงานใหญ่ ขายตรง) ไม่มีเป้ายอดขาย';
    end if;
    if btrim(coalesce(new.province, '')) <> '' or btrim(coalesce(new.region, '')) <> '' then
      raise exception 'hq_direct_no_territory: HQD (สำนักงานใหญ่ ขายตรง) ไม่ดูแลจังหวัด/ภาคใด';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.dealers_hq_direct_guard() from public, anon, authenticated, service_role;
drop trigger if exists dealers_hq_direct_guard on public.dealers;
create trigger dealers_hq_direct_guard before insert or update or delete on public.dealers
  for each row execute function public.dealers_hq_direct_guard();

-- ═══ 3) สร้างดีลเลอร์ HQD (ไม่ผ่านผู้สนใจ — ใบปรับฐานไม่ใช่ผู้ใช้ที่ล็อกอิน ด่าน 0208 ไม่บังคับ) ═══
insert into public.dealers (code, name, province, region, revenue_target, status)
values ('HQD', 'สำนักงานใหญ่ (ขายตรง)', null, null, 0, 'active')
on conflict (code) do nothing;
-- ชื่อบริษัทตั้งต้นบนเอกสาร = ชื่อดีลเลอร์ (เหมือนสร้างดีลเลอร์ผ่านหน้าเว็บ · ดีลเลอร์แก้เองได้ที่หน้าตั้งค่า)
insert into public.dealer_settings (dealer_code, issuer)
values ('HQD', jsonb_build_object('company', 'สำนักงานใหญ่ (ขายตรง)'))
on conflict (dealer_code) do nothing;
do $$ begin
  if exists (select 1 from dealer_territories where dealer_code = 'HQD') then
    raise exception 'ใบ 0287: HQD ต้องไม่มีแถวพื้นที่ดูแล — หยุดลงใบ';
  end if;
end $$;

-- ═══ 4) แจ้งเตือน "HQ ส่งลีดใหม่ให้" (0231): ย้ายไปขายตรง HQD ไม่ใช่การส่งให้ดีลเลอร์ → ไม่แจ้ง ═══
create or replace function public.leads_from_hq_notify() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if new.dealer_code = 'HQD' then return new; end if;   -- ใบ 0287 · บอสสั่งห้ามสร้างแจ้งเตือน 243 รายการตอนย้าย
  perform _notify('lead_from_hq', new.dealer_code, new.id,
    jsonb_build_object('lead', new.num_id, 'company', new.company, 'province', new.province), 'leads', new.dealer_code || ':' || new.num_id);
  return new;
end $$;
revoke all on function public.leads_from_hq_notify() from public, anon, authenticated, service_role;

-- ═══ 5) ตัวเลข: HQD ไม่ติดอันดับ · ไม่นับในจำนวนดีลเลอร์/ภาค/ทะเบียน · ไม่อยู่ในเป้ารวม (ยอดรวมทั้งเครือนับ HQD ตามเดิม) ═══
--   ยกนิยามล่าสุดจากฐาน แก้เฉพาะจุดที่นับ "ดีลเลอร์" (code <> 'HQ' → not in ('HQ', 'HQD')) · จุดที่นับแถวลีด/ใบ/ยอดขายคงเดิม

CREATE OR REPLACE FUNCTION public.hq_dashboard(p_start date, p_end date, p_dealer text DEFAULT NULL::text, p_today date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  วันนี้ date := coalesce(p_today, (now() at time zone 'Asia/Bangkok')::date);
  วัน int := greatest(1, p_end - p_start + 1);
  เป้าปี numeric;
  เป้าช่วง numeric;
  ต้นเดือน date;
  งานวันนี้ jsonb; การ์ด jsonb; อันดับ jsonb; แนวโน้ม jsonb; รายเดือน jsonb; ภาค jsonb; กิจกรรม jsonb;
  จำนวนดีลเลอร์ int;
begin
  if not is_hq() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'bad_range: ช่วงเวลาไม่ถูกต้อง'; end if;
  ต้นเดือน := (date_trunc('month', วันนี้) - interval '11 months')::date;

  -- เป้า (ใบ 0283 · บอสสั่ง 9 พ.ย. 69): ทั้งเครือ = ผลรวมเป้าสาขาอัตโนมัติ · ตัวกลางเดียวกับหน้าภาพรวมยอดขาย (_network_target)
  select t.annual, t.period into เป้าปี, เป้าช่วง
    from _network_target(case when p_dealer is null then null else array[p_dealer] end, วัน) t;

  -- ── วันนี้ต้องทำ (ไม่ขึ้นกับตัวกรอง) ──
  select jsonb_build_object(
      'requestsOpen',    (select count(*) from quote_requests where status in ('new', 'pricing')),
      'requestsOverdue', (select count(*) from quote_requests where status in ('new', 'pricing') and now() > due_at),
      'franchiseOverdue', (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(ค้าง), 0),
                                    'ids', coalesce(jsonb_agg(id order by payment_due_on, id), '[]'::jsonb))
                             from (select p.id, p.payment_due_on,
                                          coalesce(p.amount, 0) - coalesce((select sum(amount) from dealer_proposal_payments x
                                                                             where x.proposal_id = p.id and x.cancelled_at is null), 0) as ค้าง
                                     from dealer_package_proposals p
                                    where p.status = 'accepted' and p.payment_due_on is not null
                                      and p.payment_due_on < (now() at time zone 'Asia/Bangkok')::date) y
                            where ค้าง > 0))
    into งานวันนี้;

  -- ── ใบตอบรับ (ยอดขาย) ตามวันตอบรับ · ใบในช่วง · ลีดในช่วง ──
  select jsonb_build_object(
      'sales',      (select coalesce(sum(value), 0) from _hd_won(p_dealer) where d between p_start and p_end),
      'target',     เป้าช่วง,
      'annualTarget', เป้าปี,
      'days',       วัน,
      'leadsNew',   (select count(*) from leads where dealer_code <> 'HQ' and (p_dealer is null or dealer_code = p_dealer)
                       and created_date between p_start and p_end),
      'quotesSent', (select count(*) from quotations where dealer_code <> 'HQ' and (p_dealer is null or dealer_code = p_dealer)
                       and status in ('sent_to_client', 'won', 'lost', 'expired')
                       and date ~ '^\d{4}-\d{2}-\d{2}' and substring(date, 1, 10)::date between p_start and p_end),
      'closedWon',  (select count(*) from leads where dealer_code <> 'HQ' and (p_dealer is null or dealer_code = p_dealer)
                       and created_date between p_start and p_end and status = 'PAID'),
      'closedLost', (select count(*) from leads where dealer_code <> 'HQ' and (p_dealer is null or dealer_code = p_dealer)
                       and created_date between p_start and p_end and status = 'CANCELLED'))
    into การ์ด;

  -- ── 10 อันดับ: เฉพาะดีลเลอร์ที่มียอดขายในช่วง ──
  select coalesce(jsonb_agg(x order by x.sales desc, x.code), '[]'::jsonb) into อันดับ
    from (select d.code, d.name, s.sales,
                 case when coalesce(d.revenue_target, 0) = 0 then null else round(d.revenue_target * วัน / 365) end as target,
                 (select count(*) from leads l where l.dealer_code = d.code and l.created_date between p_start and p_end and l.status = 'PAID') as "closedWon",
                 (select count(*) from leads l where l.dealer_code = d.code and l.created_date between p_start and p_end and l.status = 'CANCELLED') as "closedLost"
            from (select dealer_code, sum(value) as sales from _hd_won(p_dealer) where d between p_start and p_end group by 1 having sum(value) > 0) s
            join dealers d on d.code = s.dealer_code
           where d.code not in ('HQ', 'HQD')   -- อันดับ: ไม่มีแถวขายตรง HQD (ใบ 0287)
           order by s.sales desc, d.code limit 10) x;

  select jsonb_build_object(
      'byMonth', coalesce((select jsonb_agg(x order by x.y, x.m) from (
          select extract(year from d)::int as y, extract(month from d)::int - 1 as m, sum(value) as sales
            from _hd_won(p_dealer) where d between p_start and p_end group by 1, 2) x), '[]'::jsonb),
      'byDay',   coalesce((select jsonb_agg(x order by x.d) from (
          select to_char(d, 'YYYY-MM-DD') as d, sum(value) as sales
            from _hd_won(p_dealer) where d between p_start and p_end group by d) x), '[]'::jsonb),
      'byHour',  coalesce((select jsonb_agg(x order by x.h) from (
          select h, sum(value) as sales from _hd_won(p_dealer) where d between p_start and p_end group by h) x), '[]'::jsonb))
    into แนวโน้ม;

  -- ── 12 เดือนย้อนหลัง (ไม่ขึ้นกับตัวกรองเวลา) ──
  select coalesce(jsonb_agg(jsonb_build_object('y', extract(year from m)::int, 'm', extract(month from m)::int - 1,
           'leads',  (select count(*) from leads where dealer_code <> 'HQ' and (p_dealer is null or dealer_code = p_dealer)
                        and created_date >= m and created_date < m + interval '1 month'),
           'quotes', (select count(*) from quotations where dealer_code <> 'HQ' and (p_dealer is null or dealer_code = p_dealer)
                        and status in ('sent_to_client', 'won', 'lost', 'expired') and date ~ '^\d{4}-\d{2}-\d{2}'   -- ใบที่ส่ง ไม่นับร่าง/ถูกแทนที่ (0268)
                        and substring(date, 1, 10)::date >= m and substring(date, 1, 10)::date < m + interval '1 month'),
           'won',    (select count(*) from _hd_won(p_dealer) where d >= m and d < m + interval '1 month'),
           'sales',  (select coalesce(sum(value), 0) from _hd_won(p_dealer) where d >= m and d < m + interval '1 month'))
         order by m), '[]'::jsonb)
    into รายเดือน
    from generate_series(ต้นเดือน, date_trunc('month', วันนี้)::date, interval '1 month') as g(m);

  -- ── ดีลเลอร์ตามภาค ──
  select count(*) into จำนวนดีลเลอร์ from dealers where code not in ('HQ', 'HQD') and (p_dealer is null or code = p_dealer);   -- จำนวนดีลเลอร์ไม่นับ HQD
  select coalesce(jsonb_agg(x order by x.dealers desc, x.region), '[]'::jsonb) into ภาค
    from (select coalesce(nullif(btrim(d.region), ''), 'ไม่ระบุ') as region, count(*) as dealers,
                 coalesce(sum((select sum(value) from _hd_won(p_dealer) w where w.dealer_code = d.code and w.d between p_start and p_end)), 0) as sales
            from dealers d where d.code not in ('HQ', 'HQD') and (p_dealer is null or d.code = p_dealer)   -- ภาค: ไม่นับ HQD
           group by 1) x;

  -- ── กิจกรรมล่าสุด ──
  select coalesce(jsonb_agg(x order by x.at desc, x.id desc), '[]'::jsonb) into กิจกรรม
    from (select id, "user", action, target, at from audit_log_hq a                -- เฉพาะที่คนของ HQ ทำ (ใบ 0274 · กติกาเดียวกับ /hq/audit)
           where (a.at at time zone 'Asia/Bangkok')::date between p_start and p_end
             and coalesce(a."user", '') <> 'บัญชีทดสอบชั่วคราว'             -- บัญชีชั่วคราวของ prod-live (tests/prod-live/run.mjs)
             and coalesce(a."user", '') !~* '@example\.test$|^zz'
             and coalesce(a.target, '') !~* 'ZZTEST|ZZLOAD|ZZE2E'
             and coalesce(a.target, '') !~ '(^|[ →])ZZ[A-Z0-9]*( |$)'       -- สาขาทดสอบ ZZ*
           order by a.at desc, a.id desc limit 50) x;

  return jsonb_build_object('today', งานวันนี้, 'cards', การ์ด, 'top', อันดับ, 'trend', แนวโน้ม,
    'monthly', รายเดือน, 'monthlyTarget', case when เป้าปี is null then null else round(เป้าปี / 12) end,
    'regions', ภาค, 'dealerCount', จำนวนดีลเลอร์, 'activity', กิจกรรม);
end $function$;

CREATE OR REPLACE FUNCTION public.kpi_cards(p_page text, p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date, p_dealer text DEFAULT NULL::text, p_today date DEFAULT NULL::date, p_filters jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  วันนี้ date := coalesce(p_today, (now() at time zone 'Asia/Bangkok')::date);
  ต้นปี date;
  ต้นสัปดาห์ date;
  ช่วงต้น date := p_start;
  ช่วงท้าย date := p_end;
  สาขา text;
  ได้ int; เสีย int; ส่ง int; รอ int; เป้า numeric; ยอด numeric; เป้าช่วง numeric;
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  ชุด text[];
  ชุดสาขา text[];
  ชุดจังหวัด text[];
  ชุดสาขาค้น text[];
  ซื้อจาก date;
  ซื้อถึง date;
  จังหวัด text := nullif(btrim(coalesce(f ->> 'province', '')), '');
  ช่องทาง text := nullif(btrim(coalesce(f ->> 'source', '')), '');
  คำค้น text := nullif(lower(btrim(coalesce(f ->> 'search', ''))), '');
begin
  ต้นปี := date_trunc('year', วันนี้)::date;
  ต้นสัปดาห์ := วันนี้ - (extract(isodow from วันนี้)::int - 1);
  if (ช่วงต้น is null) <> (ช่วงท้าย is null) or ช่วงท้าย < ช่วงต้น then raise exception 'bad_range: ช่วงเวลาไม่ถูกต้อง'; end if;
  if jsonb_typeof(f) <> 'object' then raise exception 'bad_filters: ตัวกรองต้องเป็นก้อนข้อมูล'; end if;
  if jsonb_typeof(f -> 'ids') = 'array' then ชุด := array(select jsonb_array_elements_text(f -> 'ids')); end if;
  if jsonb_typeof(f -> 'dealerCodes') = 'array' then ชุดสาขา := array(select jsonb_array_elements_text(f -> 'dealerCodes')); end if;
  if jsonb_typeof(f -> 'searchDealers') = 'array' then ชุดสาขาค้น := array(select jsonb_array_elements_text(f -> 'searchDealers')); end if;
  if jsonb_typeof(f -> 'provinces') = 'array' then ชุดจังหวัด := array(select jsonb_array_elements_text(f -> 'provinces')); end if;

  -- ══ หน้าดีลเลอร์ — สาขาของผู้เรียกเท่านั้น (ไม่มีช่วง = ทุกช่วงเวลา) ══
  if p_page like 'dealer.%' then
    สาขา := auth_dealer();
    if coalesce(สาขา, '') = '' or สาขา = 'HQ' then raise exception 'forbidden: เฉพาะดีลเลอร์'; end if;

    if p_page = 'dealer.dashboard' then
      select nullif(coalesce(revenue_target, 0), 0) into เป้า from dealers where code = สาขา;
      select coalesce(sum(w.value), 0) into ยอด from _kpi_won(สาขา) w where w.d between ต้นปี and วันนี้;
      select count(*) filter (where status = 'PAID'), count(*) filter (where status = 'CANCELLED') into ได้, เสีย
        from leads where dealer_code = สาขา and (ช่วงต้น is null or created_date between ช่วงต้น and ช่วงท้าย);
      return jsonb_build_object(
        'target',   jsonb_build_object('annual', เป้า, 'ytd', ยอด, 'pct', case when เป้า is null then null else round(100 * ยอด / เป้า) end),
        'pipeline', (select jsonb_build_object('count', count(*), 'value', coalesce(sum(quote_value), 0))
                       from leads where dealer_code = สาขา and status not in ('PAID', 'CANCELLED')),
        'awaiting', (select jsonb_build_object('count', count(*), 'value', coalesce(sum(total_value), 0))
                       from quotations where dealer_code = สาขา and status = 'sent_to_client'),
        'won',      jsonb_build_object('count', ได้, 'lost', เสีย, 'rate', case when ได้ + เสีย = 0 then null else round(100.0 * ได้ / (ได้ + เสีย)) end));

    elsif p_page = 'dealer.leads' then
      return (select jsonb_build_object(
        'open',            count(*) filter (where l.status not in ('PAID', 'CANCELLED')),
        'hqPricing',       count(*) filter (where l.status = 'HQ_PRICING'),
        -- ใบร่างของลีด = กติกาเดียวกับหน้าเว็บ (lib/leadQuote.ts quoteBelongsToLead): ผูกดีล = เลขดีลตรง · ไม่ผูก = ลูกค้าเดียวกัน หรือชื่อบริษัทตรง
        'hqQuotedNoDraft', count(*) filter (where l.status = 'HQ_QUOTED' and not exists (
                              select 1 from quotations q where q.dealer_code = l.dealer_code and q.status = 'draft'
                                 and case when q.deal_id is not null then q.deal_id = l.num_id
                                          else (l.customer_id is not null and q.customer_id = l.customer_id) or q.customer = l.company end)),
        'awaitingClient',  count(*) filter (where l.status in ('QUOTED', 'FOLLOWUP', 'NEGO')),
        -- ขั้นเสนอราคาลูกค้า (ใบ 0284 · ยุบ 2 ขั้นเดิม 9 พ.ย. 69) = ได้ราคา HQ + มีใบร่าง (กติกาเดียวกับ hqQuotedNoDraft) + ส่งใบแล้ว
        'quoteStage',      count(*) filter (where l.status = 'QUOTED' or (l.status = 'HQ_QUOTED' and exists (
                              select 1 from quotations q where q.dealer_code = l.dealer_code and q.status = 'draft'
                                 and case when q.deal_id is not null then q.deal_id = l.num_id
                                          else (l.customer_id is not null and q.customer_id = l.customer_id) or q.customer = l.company end))))
        from leads l where l.dealer_code = สาขา and (ชุด is null or l.id = any(ชุด)));

    elsif p_page = 'dealer.quotations' then
      return jsonb_build_object(
        'drafts',   (select count(*) from quotations where dealer_code = สาขา and status = 'draft' and (ชุด is null or id = any(ชุด))),
        'awaiting', (select count(*) from quotations where dealer_code = สาขา and status = 'sent_to_client' and (ชุด is null or id = any(ชุด))),
        'won',      (select jsonb_build_object('count', count(*), 'value', coalesce(sum(w.value), 0))
                       from _kpi_won(สาขา) w where (ช่วงต้น is null or w.d between ช่วงต้น and ช่วงท้าย) and (ชุด is null or w.quote_id = any(ชุด))),
        'expiring', (select count(*) from quotations q where q.dealer_code = สาขา and q.status = 'sent_to_client' and (ชุด is null or q.id = any(ชุด))
                       and _quote_valid_until(q) between วันนี้ and วันนี้ + 3));

    elsif p_page = 'dealer.customers' then
      return jsonb_build_object(
        'total',    (select count(*) from customers where dealer_code = สาขา and (ชุด is null or id::text = any(ชุด))),
        -- ลูกค้าใหม่ = วันที่เป็นลูกค้า (join_date · ช่องเดียวกับที่หน้าเว็บแสดง/กรอง) อยู่ในช่วง
        'new',      (select count(*) from customers where dealer_code = สาขา and join_date ~ '^\d{4}-\d{2}-\d{2}' and (ชุด is null or id::text = any(ชุด))
                       and (ช่วงต้น is null or substring(join_date, 1, 10)::date between ช่วงต้น and ช่วงท้าย)),
        'sales',    (select coalesce(sum(w.value), 0) from _kpi_won(สาขา) w
                      where (ช่วงต้น is null or w.d between ช่วงต้น and ช่วงท้าย) and (ชุด is null or w.customer_id::text = any(ชุด))),
        'openDeal', (select count(distinct customer_id) from leads where dealer_code = สาขา and customer_id is not null
                       and status not in ('PAID', 'CANCELLED') and (ชุด is null or customer_id::text = any(ชุด))));

    elsif p_page = 'dealer.calendar' then
      return (select jsonb_build_object(
        'today',    count(*) filter (where ว = วันนี้),
        'week',     count(*) filter (where ว between ต้นสัปดาห์ and ต้นสัปดาห์ + 6),
        'overdue',  count(*) filter (where ว < วันนี้ and coalesce(a.status, '') not in ('done', 'cancelled')),   -- 0253: นัดที่ยกเลิกแล้วไม่ใช่ "ยังไม่ปิด"
        'doneWeek', count(*) filter (where ว between ต้นสัปดาห์ and ต้นสัปดาห์ + 6 and a.status = 'done'))
        from (select status, case when date ~ '^\d{4}-\d{2}-\d{2}' then substring(date, 1, 10)::date end as ว
                from appointments where dealer_code = สาขา and (ชุด is null or id::text = any(ชุด))) a);
    end if;
    raise exception 'invalid_page: %', p_page;
  end if;

  -- ══ หน้า HQ ══
  if not is_hq() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  if p_dealer is not null and not exists (select 1 from dealers where code = p_dealer and code <> 'HQ') then
    raise exception 'invalid_dealer: %', p_dealer;
  end if;
  -- การ์ด "ในช่วงนี้" ของหน้า HQ ต้องมีช่วง (หน้าที่ไม่มีตัวกรองส่งเดือนนี้มา)
  if ช่วงต้น is null and p_page not in ('hq.dealers', 'hq.users') then raise exception 'bad_range: ต้องระบุช่วงเวลา'; end if;

  if p_page = 'hq.prospects' then
    return jsonb_build_object(
      'talking',   (select count(*) from dealer_prospects where status in ('new', 'contacted', 'profile_sent', 'meeting', 'considering')
                      and (ชุด is null or id::text = any(ชุด))),
      'followDue', (select count(*) from dealer_prospects where status in ('new', 'contacted', 'profile_sent', 'meeting', 'considering')
                      and follow_up is not null and follow_up <= วันนี้ and (ชุด is null or id::text = any(ชุด))),
      -- ไม่ได้ติดต่อ 14 วัน (บอสสั่ง 1 พ.ย. 69 · แทน "รอตอบใบค่าแฟรนไชส์") = สูตรเดียวกับตัวกรอง idle14 ของหน้าผู้สนใจ (prospectJourney.ไม่ได้ติดต่อเกิน):
      --   ยังติดตามอยู่ (ไม่ใช่ won/lost) · นับจากติดต่อล่าสุด ไม่เคยติดต่อ = วันเพิ่มรายชื่อ · วันตามเวลาไทย · ห่าง ≥ 14 วัน
      'idle14',    (select count(*) from dealer_prospects where status not in ('won', 'lost')
                      and (coalesce(last_contact_at, created_at) at time zone 'Asia/Bangkok')::date <= วันนี้ - 14
                      and (ชุด is null or id::text = any(ชุด))),
      'converted', (select count(*) from dealer_prospects where status = 'won' and converted_at is not null and (ชุด is null or id::text = any(ชุด))
                      and (converted_at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย));

  elsif p_page = 'hq.proposals' then
    return (select jsonb_build_object(
      'waiting',  (select count(*) from dealer_package_proposals where status = 'sent' and (ชุด is null or id::text = any(ชุด))),
      -- ids = เลขใบ ให้หน้าเว็บกรองตารางตรงกับตัวเลข (กดการ์ด) — ฐานตัดสินว่าใบไหนค้าง/เกินกำหนด ไม่คิดซ้ำในเบราว์เซอร์
      'unpaid',   jsonb_build_object('count', count(*) filter (where ค้าง > 0), 'amount', coalesce(sum(ค้าง) filter (where ค้าง > 0), 0),
                                     'ids', coalesce(jsonb_agg(id order by id) filter (where ค้าง > 0), '[]'::jsonb)),
      'overdue',  jsonb_build_object('count', count(*) filter (where ค้าง > 0 and payment_due_on < วันนี้),
                                     'amount', coalesce(sum(ค้าง) filter (where ค้าง > 0 and payment_due_on < วันนี้), 0),
                                     'ids', coalesce(jsonb_agg(id order by id) filter (where ค้าง > 0 and payment_due_on < วันนี้), '[]'::jsonb)),
      'paid',     (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(x.amount), 0),
                                             'ids', coalesce(jsonb_agg(distinct x.proposal_id), '[]'::jsonb)) from dealer_proposal_payments x
                    where x.cancelled_at is null and x.paid_on between ช่วงต้น and ช่วงท้าย and (ชุด is null or x.proposal_id::text = any(ชุด))))
      from (select p.id, p.payment_due_on, coalesce(p.amount, 0) - coalesce((select sum(x.amount) from dealer_proposal_payments x
                                                                              where x.proposal_id = p.id and x.cancelled_at is null), 0) as ค้าง
              from dealer_package_proposals p where p.status = 'accepted' and (ชุด is null or p.id::text = any(ชุด))) y);

  elsif p_page = 'hq.dealers' then
    return (select jsonb_build_object(
      'total',    count(*),
      'active',   count(*) filter (where status = 'active'),
      'moving',   count(*) filter (where เคลื่อนไหว),
      'idle',     count(*) filter (where not เคลื่อนไหว),
      -- รหัสสาขา ให้หน้าเว็บกรองตารางตรงกับตัวเลข (กดการ์ด) — ฐานตัดสินว่าสาขาไหนเคลื่อนไหว
      'movingCodes', coalesce(jsonb_agg(code order by code) filter (where เคลื่อนไหว), '[]'::jsonb),
      'idleCodes',   coalesce(jsonb_agg(code order by code) filter (where not เคลื่อนไหว), '[]'::jsonb))
      from (select code, status, _dealer_active_since(code, วันนี้ - 30) as เคลื่อนไหว from dealers
             where code not in ('HQ', 'HQD') and (ชุด is null or code = any(ชุด))) x);   -- ทะเบียนดีลเลอร์ไม่นับ HQD (ใบ 0287)

  elsif p_page = 'hq.pipeline' then
    -- เป้า (ใบ 0283 · บอสสั่ง 9 พ.ย. 69 ทับข้อตัดสิน 22 ต.ค. 69): ทั้งเครือ = ผลรวมเป้าสาขาอัตโนมัติ (ไม่ใช้ hq_targets แล้ว)
    --   เป้าตามช่วง = ผลรวมเป้าตามช่วงรายสาขา (ตัวกลาง _network_target) = ผลรวมคอลัมน์เป้าในตารางผลงาน (hq_pipeline_dealers) เสมอ
    select t.annual, t.period into เป้า, เป้าช่วง
      from _network_target(case when p_dealer is not null then array[p_dealer] else ชุดสาขา end, ช่วงท้าย - ช่วงต้น + 1) t;
    select count(*) filter (where status = 'PAID'), count(*) filter (where status = 'CANCELLED') into ได้, เสีย
      from leads where dealer_code <> 'HQ' and (p_dealer is null or dealer_code = p_dealer) and (ชุดสาขา is null or dealer_code = any(ชุดสาขา))
       and created_date between ช่วงต้น and ช่วงท้าย;
    return jsonb_build_object(
      'sales',   jsonb_build_object('value', (select coalesce(sum(w.value), 0) from _kpi_won(p_dealer) w
                                               where w.d between ช่วงต้น and ช่วงท้าย and (ชุดสาขา is null or w.dealer_code = any(ชุดสาขา))),
                                    'target', เป้าช่วง),
      'winRate', jsonb_build_object('won', ได้, 'lost', เสีย, 'rate', case when ได้ + เสีย = 0 then null else round(100.0 * ได้ / (ได้ + เสีย)) end),
      -- margin เฉลี่ย = ส่วนบวกของใบลูกค้า won ที่ผูกใบ HQ (ตอบรับในช่วง) เป็น % ของราคาขาย · สูตรเดียวกับ hq_overview 0209
      'margin',  (select jsonb_build_object('quotes', count(*), 'pct', case when coalesce(sum(q.total_value), 0) = 0 then null
                           else round(100.0 * (sum(q.total_value) - sum(h.total_cost)) / sum(q.total_value), 1) end)
                    from quotations q join hq_quotes h on h.id = q.hq_quote_id
                    join quotation_won_at w on w.dealer_code = q.dealer_code and w.quote_id = q.id
                   where q.status = 'won' and q.dealer_code <> 'HQ' and (p_dealer is null or q.dealer_code = p_dealer)
                     and (ชุดสาขา is null or q.dealer_code = any(ชุดสาขา))
                     and (w.won_at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย),
      -- ถึงเป้า (ใบ 0283 · บอสสั่ง 9 พ.ย. 69) = ยอดในช่วงที่เลือก ≥ เป้าตามช่วงของสาขา (เป้าปี × วัน ÷ 365) — ช่วงเดียวกับการ์ด
      --   ตรงแผงรายชื่อ + คอลัมน์ onTarget ของ hq_pipeline_dealers · นับเฉพาะสาขาที่ตั้งเป้า · (แดชบอร์ดดีลเลอร์ยังเทียบต้นปี/ทั้งปี ไม่แตะ)
      'onTarget', (select jsonb_build_object('reached', count(*) filter (where t.sales >= t.target), 'of', count(*),
                                             'codes', coalesce(jsonb_agg(t.code order by t.code) filter (where t.sales >= t.target), '[]'::jsonb))
                     from (select x.code, round(x.revenue_target * (ช่วงท้าย - ช่วงต้น + 1) / 365) as target,
                                  (select coalesce(sum(w.value), 0) from _kpi_won(x.code) w where w.d between ช่วงต้น and ช่วงท้าย) as sales
                             from dealers x where x.code not in ('HQ', 'HQD') and coalesce(x.revenue_target, 0) > 0
                              and (p_dealer is null or x.code = p_dealer) and (ชุดสาขา is null or x.code = any(ชุดสาขา))) t));

  -- ══ 3 หน้าเจาะลึก (ใบ 0271 · บอสสั่ง 2 พ.ย. 69): การ์ด = ผลรวมแถวรายดีลเลอร์ของ hq_drill ชุดเดียวกับตาราง/แผงที่มา ══
  --   ตัวกรองที่ใช้ = สาขา (p_dealer · dealerCodes) เท่านั้น — ระดับ ภูมิภาค/จังหวัด/ดีลเลอร์ ของหน้าส่งมาเป็นชุดสาขา · ไม่นับแถว HQ
  elsif p_page in ('hq.leads', 'hq.quotations', 'hq.customers') then
    if ช่วงต้น is null then raise exception 'bad_range: ต้องระบุช่วงเวลา'; end if;
    return (with ร as (
      select r from jsonb_array_elements(hq_drill(substring(p_page from 4), ช่วงต้น, ช่วงท้าย, วันนี้) -> 'dealers') r
       where (p_dealer is null or r->>'code' = p_dealer) and (ชุดสาขา is null or r->>'code' = any(ชุดสาขา))
    ), ส as (
      select coalesce(sum((r->>'leads')::int), 0) as leads, coalesce(sum((r->>'open')::int), 0) as open, coalesce(sum((r->>'qr')::int), 0) as qr,
             coalesce(sum((r->>'stale')::int), 0) as stale, coalesce(sum((r->>'sent')::int), 0) as sent, coalesce(sum((r->>'wait')::int), 0) as wait,
             coalesce(sum((r->>'won')::int), 0) as won, coalesce(sum((r->>'sales')::numeric), 0) as sales,
             coalesce(sum((r->>'cust')::int), 0) as cust, coalesce(sum((r->>'newc')::int), 0) as newc,
             count(*) filter (where (r->>'cust')::int > 0 and r->>'code' <> 'HQD') as withc, count(*) filter (where r->>'code' <> 'HQD') as n   -- ดีลเลอร์ที่มีลูกค้า/ทั้งหมด ไม่นับ HQD
        from ร)
    select case p_page
      when 'hq.leads' then jsonb_build_object('open', open, 'new', leads, 'qr', qr, 'idle', stale)
      when 'hq.quotations' then jsonb_build_object('sent', sent, 'awaiting', wait, 'won', jsonb_build_object('count', won, 'value', sales),
                                                   'acceptRate', case when sent = 0 then null else round(100.0 * won / sent, 1) end)
      else jsonb_build_object('total', cust, 'new', newc, 'dealers', jsonb_build_object('with', withc, 'of', n)) end
      from ส);

  elsif p_page = 'hq.audit' then
    return (select jsonb_build_object(
      'actionsToday',   count(*) filter (where (a.at at time zone 'Asia/Bangkok')::date = วันนี้),
      'usersToday',     count(distinct a."user") filter (where (a.at at time zone 'Asia/Bangkok')::date = วันนี้),
      'impersonations', count(*) filter (where a.action = 'เข้าระบบแทนดีลเลอร์' and (a.at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย),
      'reversals',      count(*) filter (where (a.action like 'ย้อน%' or a.action like 'ยกเลิก%') and (a.at at time zone 'Asia/Bangkok')::date between ช่วงต้น and ช่วงท้าย))
      from audit_log_hq a                                          -- เฉพาะที่คนของ HQ ทำ (ใบ 0274 · ชุดเดียวกับตาราง/ส่งออกของหน้า)
     where not _audit_is_test_row(a."user", a.target, a.action)   -- นิยามแถวทดสอบตัวเดียวกับตัวล้างบันทึก (0241)
       and (ชุด is null or a.id::text = any(ชุด)));

  elsif p_page = 'hq.users' then
    return (select jsonb_build_object(
      'total',      count(*),
      'active',     count(*) filter (where p.status = 'active'),
      'inactive',   count(*) filter (where p.status <> 'active'),
      'signedIn30', count(*) filter (where u.last_sign_in_at >= now() - interval '30 days'))
      from profiles p left join auth.users u on u.id = p.id
     where p.role in ('SUPER_ADMIN', 'HQ_MANAGEMENT', 'HQ_STAFF') and (ชุด is null or p.id::text = any(ชุด)));
  end if;
  raise exception 'invalid_page: %', p_page;
end $function$;

CREATE OR REPLACE FUNCTION public._network_target(p_codes text[], p_days integer, OUT annual numeric, OUT period numeric)
 RETURNS record
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select nullif(coalesce(sum(revenue_target), 0), 0), nullif(coalesce(sum(round(revenue_target * p_days / 365)), 0), 0)
    from dealers where code not in ('HQ', 'HQD') and coalesce(revenue_target, 0) > 0 and (p_codes is null or code = any(p_codes)) $function$;


-- ═══ 6) ย้ายทุกอย่างใต้ HQ ไป HQD — ลูกค้าเป้าหมายทั้งหมด (เปิดอยู่ + ปิดแล้ว · บอสสั่งเพิ่ม 18 พ.ย. 69: หลังลง ใต้ HQ = 0) ═══
--   ย้ายพร้อมของที่ผูกกัน: นัดหมาย · ใบเสนอราคา (+วันตอบรับ · ประวัติพิมพ์) · คำขอราคา (+ไฟล์คำขอ) · ลูกค้า (+โน้ตลูกค้า) · แถวไฟล์แนบ · ผู้รับผิดชอบ
--   คงเลขเดิมทุกแถว (คนรวมงานอนุมัติ 18 พ.ย. 69 · HQD ว่าง ไม่มีเลขชน · ใบ/ลูกค้าที่อ้างกันไม่ต้องตามแก้ · ย้อนกลับได้ตรงตัว)
--     ตัวนับเลขของ HQD ต่อจากเลขสูงสุดที่ย้ายมา
--   ทำในคำสั่งเดียว (DO = ธุรกรรมเดียว) แบบปิดตัวดัก/ข้อผูก (session_replication_role = replica · วิธีเดียวกับใบ 0250/0252/0257/0284)
--     — ข้อผูกพาย้ายตามกันทีละตารางไม่ได้ (ใบเสนอราคาผูกทั้งลูกค้าเป้าหมายและลูกค้าด้วยรหัสสาขาช่องเดียว) และตัวดักของใบ
--       (ล็อกใบที่ส่งแล้ว · บันทึก · แจ้งเตือน) ไม่ควรทำงานกับการย้ายเจ้าของ · ตรวจความครบของข้อผูกเองท้ายคำสั่ง (ขาด = ใบล้ม ย้อนทั้งหมด)
--   ตารางย้อนกลับ public.hqd_move_0287: แถวเดิมทั้งแถว (JSON) ของทุกแถวที่ย้าย ก่อนแก้ · คำสั่งย้อนกลับ supabase/rollback/0287_rollback.sql
create table if not exists public.hqd_move_0287 (
  id      bigint generated always as identity primary key,
  tbl     text not null,
  old_row jsonb not null,
  at      timestamptz not null default now()
);
alter table public.hqd_move_0287 enable row level security;   -- ไม่มี policy = anon/authenticated อ่าน/เขียนไม่ได้
revoke all on table public.hqd_move_0287 from public, anon, authenticated;
comment on table public.hqd_move_0287 is 'ใบ 0287: แถวเดิมก่อนย้ายจาก HQ ไป HQD (ย้อนกลับด้วย supabase/rollback/0287_rollback.sql) — ห้ามแก้มือ';

-- อ่านไฟล์ที่ย้ายมา: ที่เก็บ dealer-files กันสิทธิ์ตามโฟลเดอร์สาขา (HQ/…) → HQD เปิดไฟล์เดิมไม่ได้
--   กฎเพิ่ม: อ่านได้เมื่อมีแถวในตาราง files ของสาขาตัวเองชี้ไฟล์นั้นพอดี (storage_path = ชื่อไฟล์) · เขียน/ลบยังตามโฟลเดอร์เดิม
drop policy if exists dealer_files_read_by_row on storage.objects;
create policy dealer_files_read_by_row on storage.objects for select
  using (bucket_id = 'dealer-files' and exists (
    select 1 from public.files f where f.storage_path = storage.objects.name and f.dealer_code = public.auth_dealer() and f.dealer_code <> ''));

-- ปิดตัวดัก/ข้อผูกระหว่างย้าย (คำสั่ง SET ระดับบนสุดแบบใบ 0252 · บัญชี postgres ตั้งผ่าน set_config ในฟังก์ชันไม่ได้) — คืนค่าท้ายคำสั่ง
set session_replication_role = replica;
do $$
declare
  ตาราง text[] := array['leads', 'appointments', 'customers', 'customer_notes', 'quotations', 'quotation_won_at', 'quotation_prints',
                       'quote_requests', 'quote_files', 'files', 'responsible_persons'];
  t text; n int; ผล jsonb := '{}'::jsonb; ขาด text; วัน text;
begin
  if not exists (select 1 from dealers where code = 'HQD') then raise exception 'ใบ 0287: ยังไม่มีดีลเลอร์ HQD'; end if;
  if exists (select 1 from hqd_move_0287) then raise exception 'ใบ 0287: ตารางย้อนกลับมีข้อมูลแล้ว (ลงซ้ำ?) — หยุด'; end if;
  -- ตัวดัก 2 ตัวของใบเสนอราคาตั้งให้ทำงานตลอด (ALWAYS · แม้ปิดตัวดัก) — แก้เวลาปรับปรุง/VAT ระหว่างย้าย → ปิดชั่วคราวในธุรกรรมนี้ แล้วคืนเป็น ALWAYS
  alter table public.quotations disable trigger zz_quotations_updated_at;
  alter table public.quotations disable trigger quotations_vat_fill;

  -- จดแถวเดิม (ทั้งแถว) ก่อนแก้
  foreach t in array ตาราง loop
    execute format('insert into hqd_move_0287 (tbl, old_row) select %L, to_jsonb(x) from public.%I x where x.dealer_code = %L', t, t, 'HQ');
    get diagnostics n = row_count;
    ผล := ผล || jsonb_build_object(t, n);
  end loop;
  -- ตัวนับเลขเดิมของ HQD (ไม่มี = ย้อนกลับลบทิ้ง)
  insert into hqd_move_0287 (tbl, old_row) select 'entity_counters', to_jsonb(x) from entity_counters x where x.dealer_code = 'HQD';
  insert into hqd_move_0287 (tbl, old_row) select 'quote_counters', to_jsonb(x) from quote_counters x where x.dealer_code = 'HQD';

  -- บรรทัดประวัติ "รับโอนจากสำนักงานใหญ่" ในลูกค้าเป้าหมายทุกราย (ต่อท้าย · ไม่แก้ของเดิม)
  วัน := to_char(now() at time zone 'Asia/Bangkok', 'FMDD') || ' ' ||
         (array['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'])[extract(month from now() at time zone 'Asia/Bangkok')::int]
         || ' ' || (extract(year from now() at time zone 'Asia/Bangkok')::int + 543) || ' · ' || to_char(now() at time zone 'Asia/Bangkok', 'HH24:MI');
  update leads l set activities = coalesce(l.activities, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'id', coalesce((select max((x ->> 'id')::bigint) from jsonb_array_elements(coalesce(l.activities, '[]'::jsonb)) x where (x ->> 'id') ~ '^\d+$'), 0) + 1,
      'type', 'note', 'icon', 'note', 'date', วัน, 'text', 'รับโอนจากสำนักงานใหญ่ (ขายตรง HQD)'))
   where l.dealer_code = 'HQ';

  -- ย้ายเจ้าของ (เลขเดิม)
  foreach t in array ตาราง loop
    execute format('update public.%I set dealer_code = %L where dealer_code = %L', t, 'HQD', 'HQ');
  end loop;

  -- ตัวนับเลขของ HQD ต่อจากเลขสูงสุด (ลูกค้าเป้าหมาย · นัดหมาย · ลูกค้า) · เลขใบเสนอราคาต่อจากตัวนับของ HQ
  insert into entity_counters (dealer_code, entity, next_id)
  values ('HQD', 'leads', coalesce((select max(num_id) from leads where dealer_code = 'HQD'), 0) + 1),
         ('HQD', 'appointments', coalesce((select max(id) from appointments where dealer_code = 'HQD'), 0) + 1),
         ('HQD', 'customers', coalesce((select max(id) from customers where dealer_code = 'HQD'), 0) + 1)
  on conflict (dealer_code, entity) do update set next_id = greatest(entity_counters.next_id, excluded.next_id);
  insert into quote_counters (dealer_code, next_no)
  select 'HQD', q.next_no from quote_counters q where q.dealer_code = 'HQ'
  on conflict (dealer_code) do update set next_no = greatest(quote_counters.next_no, excluded.next_no);

  -- ความครบของข้อผูก (ปิดตัวดักอยู่ จึงตรวจเอง) — ขาด = ใบล้ม ย้อนทั้งหมด
  select string_agg(x, ' · ') into ขาด from (
    select 'นัดหมาย→ลูกค้าเป้าหมาย ' || a.dealer_code || ':' || a.id as x from appointments a
     where a.dealer_code = 'HQD' and a.lead_id is not null and not exists (select 1 from leads l where l.dealer_code = a.dealer_code and l.num_id = a.lead_id)
    union all select 'ใบ→ลูกค้าเป้าหมาย ' || q.dealer_code || ':' || q.id from quotations q
     where q.dealer_code = 'HQD' and q.deal_id is not null and not exists (select 1 from leads l where l.dealer_code = q.dealer_code and l.num_id = q.deal_id)
    union all select 'ใบ→ลูกค้า ' || q.dealer_code || ':' || q.id from quotations q
     where q.dealer_code = 'HQD' and q.customer_id is not null and not exists (select 1 from customers c where c.dealer_code = q.dealer_code and c.id = q.customer_id)
    union all select 'คำขอ→ลูกค้าเป้าหมาย ' || r.id from quote_requests r
     where r.dealer_code = 'HQD' and not exists (select 1 from leads l where l.dealer_code = r.dealer_code and l.num_id = r.lead_num_id)
    union all select 'วันตอบรับ→ใบ ' || w.dealer_code || ':' || w.quote_id from quotation_won_at w
     where w.dealer_code = 'HQD' and not exists (select 1 from quotations q where q.dealer_code = w.dealer_code and q.id = w.quote_id)
    union all select 'โน้ต→ลูกค้า ' || n.id from customer_notes n
     where n.dealer_code = 'HQD' and not exists (select 1 from customers c where c.dealer_code = n.dealer_code and c.id = n.customer_id)
    union all select 'ลูกค้าเป้าหมาย→ลูกค้า ' || l.dealer_code || ':' || l.num_id from leads l
     where l.dealer_code = 'HQD' and l.customer_id is not null and not exists (select 1 from customers c where c.dealer_code = l.dealer_code and c.id = l.customer_id)
  ) z;
  if ขาด is not null then raise exception 'ใบ 0287: ข้อผูกขาดหลังย้าย — %', left(ขาด, 2000); end if;
  foreach t in array ตาราง loop
    execute format('select count(*) from public.%I where dealer_code = %L', t, 'HQ') into n;
    if n > 0 then raise exception 'ใบ 0287: ยังเหลือใต้ HQ ในตาราง % (% แถว)', t, n; end if;
  end loop;

  alter table public.quotations enable always trigger zz_quotations_updated_at;
  alter table public.quotations enable always trigger quotations_vat_fill;
  insert into audit_log("user", role, action, target)
  values (audit_actor(), auth_role(), 'ย้ายข้อมูลของ HQ ไปขายตรง (HQD)',
          'ลูกค้าเป้าหมาย ' || (ผล ->> 'leads') || ' ราย · นัดหมาย ' || (ผล ->> 'appointments') || ' · ลูกค้า ' || (ผล ->> 'customers')
          || ' · ใบเสนอราคา ' || (ผล ->> 'quotations') || ' · คำขอราคา ' || (ผล ->> 'quote_requests') || ' · ไฟล์ ' || (ผล ->> 'files')
          || ' · ไฟล์คำขอ ' || (ผล ->> 'quote_files') || ' · เลขเดิม · ย้อนกลับได้ (supabase/rollback/0287_rollback.sql)');
  raise notice 'ใบ 0287 ย้ายจาก HQ ไป HQD (จำนวนแถวต่อตาราง): %', ผล;
  raise notice 'ใบ 0287 ลูกค้าเป้าหมายที่ย้าย แยกตามสถานะ: %',
    (select coalesce(jsonb_object_agg(s, k), '{}'::jsonb) from (select (old_row ->> 'status') s, count(*) k from hqd_move_0287 where tbl = 'leads' group by 1) x);
  raise notice 'ใบ 0287 ไฟล์แนบที่ย้าย % แถว (อ่านได้ผ่านกฎ dealer_files_read_by_row · ตัวไฟล์อยู่โฟลเดอร์ HQ/ เดิม)', ผล ->> 'files';
end $$;
set session_replication_role = origin;
