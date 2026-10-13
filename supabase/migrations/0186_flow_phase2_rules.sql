-- ── Flow ใหม่ ระยะ 2: กฎที่ฐานข้อมูลบังคับเอง ไม่พึ่งให้คนจำ ────────────────────────────────
--
-- ต่อจาก 0183/0185 (โครงคำขอ + ใบ HQ) · ไฟล์ Flow หัวข้อ "ฐานข้อมูลปฏิเสธเอง":
--   1. ใบลูกค้าตรงกับใบ HQ          รายการ/จำนวนล็อก · ราคา = ต้นทุน × (1 + %) · % ห้ามติดลบ
--   2. อายุใบไม่เกินใบ HQ           ใบ HQ หมดอายุ ใบลูกค้าส่ง/ปิดการขายไม่ได้
--   3. ราคาแม่แบบ HQ เห็นคนเดียว     มีสวิตช์ — ยังปิดไว้จนกว่าหน้าจอของ Flow ใหม่จะพร้อม (ดูข้อ 3)
--   4. ไม่มีลูกค้าเป้าหมายซ้ำ         ในดีลเลอร์เดียวกัน ชื่อ + เบอร์ซ้ำกับงานที่เปิดอยู่ สร้างไม่ได้
--   5. ลูกค้าเป้าหมายใหม่ต้องมีเบอร์โทรและจังหวัดหน้างาน
--
-- ไม่อยู่ในใบนี้ (ข้อตัดสิน 12 ต.ค. 69): "หนึ่งจังหวัดหนึ่งดีลเลอร์" ตัดออกรอบนี้ — ข้อมูลจริง 138 จาก 154 ราย
--   อยู่จังหวัดที่มีหลายราย · แทนด้วยรายการ "งานซ้ำข้ามดีลเลอร์" ให้ HQ เห็น (ข้อ 6)
--
-- ⚠️ กฎข้อ 1–2 ทำงานเฉพาะใบที่ผูกใบ HQ (hq_quote_id) — ใบแบบเดิมไม่ถูกแตะจนกว่าจะสลับ Flow

-- ═══ 1 + 2. ใบของดีลเลอร์สร้างจากใบ HQ เสมอ ══════════════════════════════════════════════════
-- ฐานข้อมูล "ประกอบรายการให้เอง" จากใบ HQ + % ที่ดีลเลอร์ใส่ — ไม่รับชื่อ/จำนวน/ราคาที่หน้าจอส่งมา
--   จึงไม่มีทางที่ใบลูกค้าจะต่างจากใบ HQ และไม่มีต้นทุนต่อหน่วยอยู่ในใบของดีลเลอร์เลย
--   % ต่อบรรทัด = line_items[i].markupPct · ไม่ใส่ = ใช้ % ทั้งใบ (markup_percent) · ไม่ใส่ทั้งคู่ = 0
create or replace function public.quotations_hq_apply_markup() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare
  h       hq_quotes;
  v_out   jsonb := '[]'::jsonb;
  v_sum   numeric := 0;
  v_line  jsonb;
  v_pct   numeric;
  v_price numeric;
  v_i     integer := 0;
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if new.hq_quote_id is null then return new; end if;
  -- ใบที่จบแล้วไม่คำนวณใหม่ (ราคาต้องนิ่งตามที่ปิดไว้ · ใบหมดอายุเพราะเปลี่ยนเวอร์ชันก็เช่นกัน)
  if tg_op = 'UPDATE' and old.status in ('won', 'lost', 'expired') and new.status = old.status then return new; end if;

  select * into h from hq_quotes where id = new.hq_quote_id;
  if not found then return new; end if;   -- ตัวดัก quotations_hq_link_guard แจ้งให้แล้ว

  if new.markup_percent is not null and new.markup_percent < 0 then
    raise exception 'markup_negative: %% ที่บวกต้องไม่ติดลบ — ขายต่ำกว่าต้นทุนจากสำนักงานใหญ่ไม่ได้';
  end if;

  for v_line in select * from jsonb_array_elements(h.line_items) loop
    v_pct := coalesce(nullif(new.line_items -> v_i ->> 'markupPct', '')::numeric, new.markup_percent, 0);
    if v_pct < 0 then
      raise exception 'markup_negative: %% ที่บวกต้องไม่ติดลบ (รายการ "%")', v_line ->> 'name';
    end if;
    v_price := round((v_line ->> 'unitCost')::numeric * (1 + v_pct / 100), 2);
    v_out := v_out || jsonb_build_object(
      'name', v_line ->> 'name', 'qty', (v_line ->> 'qty')::numeric, 'unit', coalesce(v_line ->> 'unit', ''),
      'unitPrice', v_price, 'markupPct', v_pct);
    v_sum := v_sum + round((v_line ->> 'qty')::numeric * v_price, 2);
    v_i := v_i + 1;
  end loop;

  new.line_items    := v_out;
  new.total_value   := v_sum;
  new.material_cost := h.total_cost;      -- ต้นทุนรวมจากใบ HQ — ให้สำนักงานใหญ่ดู margin ได้จากใบเดียว

  -- อายุใบลูกค้าไม่เกินวันยืนราคาของใบ HQ: ไม่ใส่หรือใส่เกิน = ใช้วันของใบ HQ
  if new.status in ('draft', 'sent_to_client') and h.valid_until is not null then
    if new.expiry is null or new.expiry !~ '^\d{4}-\d{2}-\d{2}$' or new.expiry::date > h.valid_until then
      new.expiry := to_char(h.valid_until, 'YYYY-MM-DD');
    end if;
  end if;

  -- ใบ HQ หมดอายุแล้ว: ส่งให้ลูกค้าไม่ได้ ปิดการขายไม่ได้ — ต้องขอราคาใหม่
  if new.status in ('sent_to_client', 'won')
     and (tg_op = 'INSERT' or new.status is distinct from old.status)
     and h.valid_until is not null and h.valid_until < v_today then
    raise exception 'hq_quote_expired: ใบ HQ % หมดอายุแล้ว (ยืนราคาถึง %) — ขอแก้ราคาเพื่อรับใบใหม่ก่อน',
      h.quote_no, to_char(h.valid_until, 'YYYY-MM-DD');
  end if;
  return new;
end $$;

-- ชื่อขึ้นต้นด้วย q → ทำงานก่อนตัวดักชุด trg_* (ตรวจยอดตรงรายการ / นับรายการ) ซึ่งต้องเห็นค่าที่ประกอบแล้ว
create trigger quotations_hq_apply_markup before insert or update on public.quotations
  for each row execute function public.quotations_hq_apply_markup();

-- ═══ 3. ราคาแม่แบบ: สวิตช์ "HQ เห็นคนเดียว" ══════════════════════════════════════════════════
-- ⚠️ ยังไม่เปิด (ค่าตั้งต้น false): หน้าจอปัจจุบันของดีลเลอร์ยังอ่านราคาแม่แบบไปออกใบแบบเดิม
--    เปิดตอนนี้ = ดีลเลอร์ออกใบไม่ได้ทั้งเครือ · เปิดเมื่อหน้าจอของ Flow ใหม่พร้อม (ระยะ 7 สลับ Flow)
--    เปิดแล้ว: ดีลเลอร์อ่านตาราง master_catalog ไม่ได้เลย ต้องอ่านผ่านมุมมอง master_catalog_public
--    ซึ่งไม่มีราคา/ประวัติราคา — ปิดที่ฐานข้อมูล ไม่ใช่ซ่อนบนหน้าจอ
alter table public.hq_policy add column if not exists hide_catalog_price boolean not null default false;

create or replace function public.catalog_price_hidden() returns boolean
  language sql stable security definer set search_path to 'public'
  as $$ select coalesce((select hide_catalog_price from hq_policy order by id limit 1), false) $$;

drop policy if exists master_catalog_read on public.master_catalog;
-- ⚠️ ต้องระบุ to authenticated: รอบแรกลืมใส่ = กฎใช้กับทุกคน รวมคนที่ยังไม่เข้าระบบ → อ่านแม่แบบได้
--    (ชุดทดสอบ anon-exposure จับได้ 13 ต.ค. 69 ก่อนขึ้นระบบจริง)
create policy master_catalog_read on public.master_catalog for select to authenticated
  using (is_hq() or not public.catalog_price_hidden());

-- มุมมองสำหรับดีลเลอร์: รูป สเปก แบบ หน่วย แม่แบบย่อย — ไม่มี price / subtype_prices / price_history
-- (เป็นมุมมองที่อ่านด้วยสิทธิ์เจ้าของโดยตั้งใจ เพื่อให้อ่านได้แม้ตารางจริงถูกปิด — เลือกเฉพาะคอลัมน์ที่เปิดเผยได้)
create or replace view public.master_catalog_public as
  select id, name, spec, unit, image, subtypes, subtype_images, plans, subtype_plans, created_at
    from public.master_catalog;
revoke all on public.master_catalog_public from anon;
grant select on public.master_catalog_public to authenticated;

-- ═══ 4 + 5. ลูกค้าเป้าหมาย: กันซ้ำในดีลเลอร์เดียวกัน · รายใหม่ต้องมีเบอร์โทรและจังหวัด ═══════════════
/** กุญแจเทียบซ้ำ = ชื่อบริษัท (ตัดช่องว่างซ้ำ ไม่สนตัวพิมพ์) + เบอร์โทร (เฉพาะตัวเลข) */
create or replace function public.lead_dedupe_key(p_company text, p_phone text) returns text
  language sql immutable as $$
    select lower(regexp_replace(btrim(coalesce(p_company, '')), '\s+', ' ', 'g'))
           || '|' || regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
  $$;

create index if not exists leads_dedupe_idx
  on public.leads (dealer_code, public.lead_dedupe_key(company, phone))
  where status not in ('PAID', 'CANCELLED') and customer_id is null;

-- ใช้ตัวดัก ไม่ใช่ unique index / check constraint โดยตั้งใจ:
--   · ข้อมูลเดิมมีรายซ้ำอยู่แล้ว (ฐานจริง 7 คู่) และมีรายที่ไม่มีเบอร์/จังหวัด (10 / 80 ราย) — index จะสร้างไม่ผ่าน
--     และ check constraint แบบ NOT VALID ยังตรวจ "ทุกครั้งที่แก้แถวเดิม" = รายเก่าที่ไม่มีเบอร์จะแก้อะไรไม่ได้อีกเลย
--   · ตัวดักตรวจเฉพาะตอนเพิ่มราย (และตอนแก้ชื่อ/เบอร์/เปิดรายที่ปิดไปแล้วกลับมา) รายเดิมยังทำงานต่อได้
--   · งานดูแลระบบ (กู้คืนข้อมูล/นำเข้า ด้วยสิทธิ์ service role) ไม่ถูกตรวจ — ต้องใส่ข้อมูลเดิมกลับได้ครบ
create or replace function public.leads_new_lead_guard() returns trigger
  language plpgsql set search_path to 'public' as $$
declare
  v_key  text;
  v_dup  text;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return new; end if;   -- service role / งานในฐานข้อมูล
  if coalesce(current_setting('pms.flow_sync', true), '') = '1' then return new; end if;

  -- งานขายใหม่ของ "ลูกค้าเดิม" (ผูก customer_id) ไม่บังคับเบอร์/จังหวัด — ลูกค้ารายนั้นระบุตัวได้อยู่แล้ว
  --   และลูกค้าเก่าบางรายไม่มีเบอร์ในระบบ บังคับ = กด "เพิ่มงานขายใหม่" ไม่ได้ (ชุดทดสอบจับได้ 13 ต.ค. 69)
  if tg_op = 'INSERT' and new.customer_id is null then
    if regexp_replace(coalesce(new.phone, ''), '\D', '', 'g') = '' then
      raise exception 'lead_phone_required: ลูกค้าเป้าหมายใหม่ต้องมีเบอร์โทร';
    end if;
    if btrim(coalesce(new.province, '')) = '' then
      raise exception 'lead_province_required: ลูกค้าเป้าหมายใหม่ต้องระบุจังหวัดหน้างาน';
    end if;
  elsif new.company is not distinct from old.company and new.phone is not distinct from old.phone
        and not (old.status in ('PAID', 'CANCELLED') and new.status not in ('PAID', 'CANCELLED')) then
    return new;   -- ไม่ได้แตะชื่อ/เบอร์ และไม่ได้เปิดรายที่ปิดแล้วกลับมา
  end if;

  -- ลูกค้าเดิม (ผูก customer_id = สร้างผ่าน "เพิ่มงานขายใหม่") และรายที่ปิดแล้ว ไม่นับว่าซ้ำ
  if new.customer_id is not null or new.status in ('PAID', 'CANCELLED') then return new; end if;
  if regexp_replace(coalesce(new.phone, ''), '\D', '', 'g') = '' then return new; end if;   -- รายเก่าไม่มีเบอร์ เทียบไม่ได้

  v_key := lead_dedupe_key(new.company, new.phone);
  perform pg_advisory_xact_lock(hashtextextended(new.dealer_code || '#' || v_key, 0));   -- กันกดพร้อมกันสองจอ
  select l.id into v_dup from leads l
   where l.dealer_code = new.dealer_code and lead_dedupe_key(l.company, l.phone) = v_key
     and l.status not in ('PAID', 'CANCELLED') and l.customer_id is null
     and l.id <> new.id
   limit 1;
  if v_dup is not null then
    raise exception 'lead_duplicate: มีลูกค้าเป้าหมายชื่อและเบอร์โทรนี้เปิดอยู่แล้ว (%) — ลูกค้าเดิมให้เพิ่มงานขายใหม่จากหน้าลูกค้า', v_dup;
  end if;
  return new;
end $$;

create trigger leads_new_lead_guard before insert or update of company, phone, status on public.leads
  for each row execute function public.leads_new_lead_guard();

-- ═══ 6. งานซ้ำข้ามดีลเลอร์ — ให้ HQ เห็นตอนตีราคา (ไม่บล็อก) ═══════════════════════════════════
-- พื้นที่ทับกันได้ ดีลเลอร์คนละรายจึงขอราคางานเดียวกันได้ · HQ เห็นว่าใครยื่นก่อน และหยิบ BOQ เดิมมาใช้ได้
create or replace function public.quote_request_duplicates(p_id bigint)
returns table (request_id bigint, request_no text, dealer_code text, status text, submitted_at timestamptz,
               hq_quote_id bigint, hq_quote_no text, hq_quote_status text)
language plpgsql stable security definer set search_path to 'public' as $$
declare v_key text; v_dealer text;
begin
  if not is_hq() then raise exception 'forbidden: เฉพาะสำนักงานใหญ่'; end if;
  select lead_dedupe_key(l.company, l.phone), r.dealer_code into v_key, v_dealer
    from quote_requests r join leads l on l.dealer_code = r.dealer_code and l.num_id = r.lead_num_id
   where r.id = p_id;
  if v_key is null or v_key like '%|' then return; end if;   -- ไม่มีเบอร์โทร = เทียบไม่ได้ ไม่เดา
  return query
    select r.id, r.request_no, r.dealer_code, r.status, r.submitted_at, h.id, h.quote_no, h.status
      from quote_requests r
      join leads l on l.dealer_code = r.dealer_code and l.num_id = r.lead_num_id
      left join hq_quotes h on h.request_id = r.id
     where r.dealer_code <> v_dealer and lead_dedupe_key(l.company, l.phone) = v_key
       and r.status <> 'cancelled'
     order by r.submitted_at;
end $$;

/** HQ ใช้ BOQ เดิมของงานซ้ำ — คัดลอกรายการจากใบ HQ ที่ส่งแล้วของอีกคำขอมาเป็นร่างของคำขอนี้ (ราคาเดียวกันทุกดีลเลอร์) */
create or replace function public.hq_quote_copy_from(p_request_id bigint, p_source_hq_quote_id bigint)
returns public.hq_quotes language plpgsql security definer set search_path to 'public' as $$
declare src hq_quotes;
begin
  if not can_price_quotes() then raise exception 'forbidden: บทบาทนี้ทำใบ HQ ไม่ได้'; end if;
  select * into src from hq_quotes where id = p_source_hq_quote_id and status <> 'draft';
  if not found then raise exception 'source_missing: ไม่พบใบ HQ ต้นทางที่ส่งแล้ว'; end if;
  return hq_quote_save(p_request_id, src.line_items,
                       greatest(src.valid_until, (now() at time zone 'Asia/Bangkok')::date), src.note);
end $$;

revoke all on function public.quote_request_duplicates(bigint), public.hq_quote_copy_from(bigint, bigint) from public, anon;
grant execute on function public.quote_request_duplicates(bigint), public.hq_quote_copy_from(bigint, bigint) to authenticated;
