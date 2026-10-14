-- ── ไทม์ไลน์ของลูกค้าเป้าหมาย: ผู้ใช้ "ต่อท้ายได้อย่างเดียว" — เขียนทับของเดิมไม่ได้ ───────────────────
--
-- บั๊กจริง (พบ 13–14 ต.ค. 69 · ข้อทดสอบ quote-versions-timeline ตกเป็นครั้งคราว แล้วไล่จนเจอต้นเหตุ):
--   ไทม์ไลน์เก็บเป็นรายการ (jsonb) ในแถวของลูกค้าเป้าหมาย · หน้าจอจดกิจกรรมใหม่ด้วยการ
--   "อ่านทั้งแถว → ต่อท้ายหนึ่งบรรทัด → เขียนทับทั้งแถว" จากสำเนาที่ตัวเองถืออยู่
--   แต่ "รายการ" ลูกค้าเป้าหมายตั้งใจไม่ดึงไทม์ไลน์มาด้วย (แถวละหลาย KB · ดู LEAD_LIST_COLS)
--   สำเนาที่มาจากรายการจึงมีไทม์ไลน์ว่าง → เขียนกลับเป็น [บรรทัดใหม่บรรทัดเดียว] ทับประวัติทั้งหมดในฐาน
--   ผู้ใช้เห็นประวัติหายเงียบ ๆ เช่น ออกใบ → ส่งใบ → แก้เป็น V2 แล้วบรรทัด "ออกใบ" หาย
--   (และเกิดได้เช่นกันเมื่อสองหน้าจอ/สองเครื่องของสาขาเดียวกันจดกิจกรรมของรายเดียวกัน)
--
-- แก้ที่ฐาน ไม่แก้ที่หน้าจอ: ทางเขียนมีหลายทาง (เว็บต่อฐานตรง · /api/v1 · อนาคต) ด่านเดียวที่ทุกทางต้องผ่านคือฐานข้อมูล
--   เมื่อผู้ใช้แก้ไทม์ไลน์ ฐานข้อมูล "รวม" แทน "แทนที่":
--     - บรรทัดเดิมอยู่ครบและอยู่ลำดับเดิมเสมอ
--     - บรรทัดที่ส่งมาและยังไม่มี (เทียบข้อความ + วันเวลา · นับจำนวนด้วย เผื่อบรรทัดเหมือนกันสองครั้งในนาทีเดียว) → ต่อท้าย
--     - เลขของบรรทัดใหม่ออกโดยฐาน (มากสุด + 1) — เลขที่หน้าจอคิดจากสำเนาไม่ครบชนกับของเดิมได้
--   หน้าจอไม่มีที่ไหนให้ลบหรือแก้บรรทัดในไทม์ไลน์ กติกานี้จึงไม่ตัดความสามารถอะไรออก
--   ฝั่งเซิร์ฟเวอร์ (ไม่มีผู้ใช้ในใบผ่าน: สคริปต์กู้ข้อมูล · ตัวเตรียมข้อมูลทดสอบ) ยังแทนที่ทั้งก้อนได้ตามเดิม
--
-- ตัวดักนี้ต้องทำงานก่อน trg_lead_dates (คิดวันติดต่อล่าสุดจากไทม์ไลน์) — ตัวดักทำงานตามลำดับชื่อ: leads_a… มาก่อน trg_…

create or replace function public.leads_activities_append_only() returns trigger
  language plpgsql set search_path to 'public' as $$
declare
  kept   jsonb := coalesce(old.activities, '[]'::jsonb);
  e      jsonb;
  k      text;
  seen   jsonb := '{}'::jsonb;     -- ข้อความ+วันเวลา → พบในชุดที่ส่งมาแล้วกี่ครั้ง
  have   integer;
  n      integer;
  max_id bigint;
begin
  if auth.uid() is null then return new; end if;                       -- ฝั่งเซิร์ฟเวอร์: แทนที่ได้ตามเดิม
  if new.activities is not distinct from old.activities then return new; end if;
  if jsonb_typeof(coalesce(new.activities, '[]'::jsonb)) <> 'array' then
    new.activities := kept; return new;                                -- รูปแบบผิด: คงของเดิม
  end if;

  select coalesce(max((x ->> 'id')::bigint), 0) into max_id
    from jsonb_array_elements(kept) x where (x ->> 'id') ~ '^\d+$';

  for e in select * from jsonb_array_elements(coalesce(new.activities, '[]'::jsonb)) loop
    k := coalesce(e ->> 'text', '') || E'\x1f' || coalesce(e ->> 'date', '');
    n := coalesce((seen ->> k)::integer, 0) + 1;
    seen := jsonb_set(seen, array[k], to_jsonb(n));
    select count(*) into have from jsonb_array_elements(kept) x
     where coalesce(x ->> 'text', '') || E'\x1f' || coalesce(x ->> 'date', '') = k;
    if have < n then
      max_id := max_id + 1;
      kept := kept || jsonb_build_array(e || jsonb_build_object('id', max_id));
    end if;
  end loop;

  new.activities := kept;
  return new;
end $$;
revoke all on function public.leads_activities_append_only() from public, anon, authenticated, service_role;

drop trigger if exists leads_activities_append_only on public.leads;
create trigger leads_activities_append_only before update of activities on public.leads
  for each row execute function public.leads_activities_append_only();
