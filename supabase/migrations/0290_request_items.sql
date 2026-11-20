-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ใบ 0290: รายการในคำขอราคา — ดีลเลอร์พิมพ์รายการเอง (บอสสั่ง 20 พ.ย. 69 · หลังเอารายการวัสดุออกทั้งระบบ)
--   ฟอร์มขอราคา/ขอแก้ราคาของดีลเลอร์: รายการ + จำนวน + หน่วย · ไม่มีราคา (HQ ตีราคา) · ไม่บังคับ · ส่งไปกับคำขอ
--   ใช้ช่อง estimate_items เดิม (ไม่มีตาราง/คอลัมน์ใหม่ · ไม่แปลงข้อมูลเก่า) — แถวแบบใหม่ { name, qty, unit } ไม่มีรหัสวัสดุ/ราคา
--   1) _estimate_snapshot: รับแถวแบบใหม่ (ไม่มี templateId) · แถวแบบเดิม (มี templateId) ตรวจ/เก็บตามเดิม — คำขอเก่าไม่กระทบ
--   2) _estimate_total: นับเฉพาะแถวที่มีราคา · ไม่มีแถวมีราคาเลย = null (คำขอใหม่ไม่มีราคาประเมิน/% คลาด ตรงกับที่เอาออก)
--   3) quote_request_reprice: รับ p_estimate (null = คัดลอกรายการของคำขอเดิมตามเดิม) — ฟอร์มขอแก้ราคาแก้รายการได้
--   สิทธิ์: _estimate_* คงเดิม (ไม่มีใครเรียกตรง) · reprice 4 อาร์กิวเมนต์ให้ authenticated แทนแบบ 3 อาร์กิวเมนต์ (ลบตัวเดิม)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public._estimate_snapshot(p_items jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb; m material_templates; ผล jsonb := '[]'::jsonb; v_qty numeric; v_name text; v_unit text;
begin
  if p_items is null or p_items = 'null'::jsonb then return ผล; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'estimate_invalid: รายการต้องเป็นรายการ'; end if;
  if jsonb_array_length(p_items) > 200 then raise exception 'estimate_invalid: รายการได้ไม่เกิน 200 แถว'; end if;
  for v in select * from jsonb_array_elements(p_items) loop
    if nullif(v ->> 'templateId', '') is not null then
      -- แบบเดิม (รายการวัสดุ · ใบ 0244) — คงตรรกะเดิมทุกบรรทัด
      select * into m from material_templates where id = (v ->> 'templateId')::bigint and active;
      if not found then raise exception 'estimate_invalid: ไม่พบวัสดุที่เลือก หรือ HQ ปิดใช้แล้ว'; end if;
      begin v_qty := (v ->> 'qty')::numeric;
      exception when others then raise exception 'estimate_invalid: จำนวนของ "%" ไม่ใช่ตัวเลข', m.name; end;
      if v_qty is null or v_qty <= 0 then raise exception 'estimate_invalid: จำนวนของ "%" ต้องมากกว่า 0', m.name; end if;
      ผล := ผล || jsonb_build_object('templateId', m.id, 'category', m.category, 'name', m.name, 'unit', m.unit,
                                     'qty', v_qty, 'unitPrice', m.unit_price);
    else
      -- แบบใหม่ (20 พ.ย. 69): ดีลเลอร์พิมพ์เอง — ไม่มีราคา · ไม่รับราคาจากผู้เรียก
      v_name := left(btrim(coalesce(v ->> 'name', '')), 200);
      v_unit := left(btrim(coalesce(v ->> 'unit', '')), 30);
      if v_name = '' then raise exception 'estimate_invalid: รายการต้องมีชื่อ'; end if;
      begin v_qty := (v ->> 'qty')::numeric;
      exception when others then raise exception 'estimate_invalid: จำนวนของ "%" ไม่ใช่ตัวเลข', v_name; end;
      if v_qty is null or v_qty <= 0 then raise exception 'estimate_invalid: จำนวนของ "%" ต้องมากกว่า 0', v_name; end if;
      if jsonb_array_length(ผล) >= 50 then raise exception 'estimate_invalid: รายการที่พิมพ์เองได้ไม่เกิน 50 แถว'; end if;
      ผล := ผล || jsonb_build_object('name', v_name, 'qty', v_qty, 'unit', v_unit);
    end if;
  end loop;
  return ผล;
end $$;
revoke all on function public._estimate_snapshot(jsonb) from public, anon, authenticated, service_role;

create or replace function public._estimate_total(p_items jsonb) returns numeric
language sql immutable set search_path = public as $$
  select sum(round((e ->> 'qty')::numeric * (e ->> 'unitPrice')::numeric, 2))
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
   where nullif(e ->> 'unitPrice', '') is not null;
$$;

-- ═══ 3. ขอแก้ราคา: แก้รายการในคำขอได้ (p_estimate · null = คัดลอกของเดิม) ═══
--   เปลี่ยนจำนวนอาร์กิวเมนต์ = คำสั่งใหม่ → ลบตัวเดิม (3 อาร์กิวเมนต์) แล้วกำหนดสิทธิ์ใหม่ (ผู้เรียกเดิม: ดีลเลอร์ผ่าน authenticated)
drop function if exists public.quote_request_reprice(bigint, text, text);
CREATE OR REPLACE FUNCTION public.quote_request_reprice(p_id bigint, p_reason text, p_spec text DEFAULT NULL::text, p_estimate jsonb DEFAULT NULL::jsonb)
 RETURNS quote_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  old_r quote_requests;
  r     quote_requests;
  v_id  bigint;
begin
  if not can_write_sales() then raise exception 'forbidden: ไม่มีสิทธิ์ขอแก้ราคา'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'reason_required: ต้องระบุว่าขอแก้ราคาเพราะอะไร'; end if;

  select * into old_r from quote_requests where id = p_id and dealer_code = auth_dealer() for update;
  if not found then raise exception 'request_not_found: ไม่พบคำขอนี้'; end if;
  if old_r.status <> 'quoted' then
    raise exception 'request_stage: ขอแก้ราคาได้เฉพาะคำขอที่ได้ใบ HQ แล้วและยังไม่ปิด (สถานะ %)', old_r.status;
  end if;

  update quote_requests set status = 'superseded', closed_at = now() where id = p_id;
  update hq_quotes set status = 'superseded' where request_id = p_id and status = 'sent';

  v_id := nextval(pg_get_serial_sequence('public.quote_requests', 'id'));
  insert into quote_requests (id, request_no, dealer_code, lead_num_id, root_id, supersedes_id, product, subtype,
                              area, province, spec, due_at, created_by, estimate_items, estimate_total)
  values (v_id,
          'RQ-' || to_char(now() at time zone 'Asia/Bangkok', 'YYYY') || '-' || lpad(v_id::text, 5, '0'),
          old_r.dealer_code, old_r.lead_num_id, coalesce(old_r.root_id, old_r.id), old_r.id,
          old_r.product, old_r.subtype, old_r.area, old_r.province,
          btrim(coalesce(nullif(btrim(coalesce(p_spec, '')), ''), old_r.spec) || E'\n[ขอแก้ราคา] ' || btrim(p_reason)),
          now() + make_interval(days => quote_request_sla_days()), auth.uid(),
          -- รายการในคำขอ (ใบ 0290): ส่งมา = ใช้รายการใหม่ (ตรวจผ่าน _estimate_snapshot) · ไม่ส่ง (null) = คัดลอกของคำขอเดิมตามเดิม
          case when p_estimate is null then old_r.estimate_items else _estimate_snapshot(p_estimate) end,
          case when p_estimate is null then old_r.estimate_total else _estimate_total(_estimate_snapshot(p_estimate)) end)
  returning * into r;

  perform _lead_flow_set_status(r.dealer_code, r.lead_num_id, 'HQ_PRICING');
  return r;
end $function$;
revoke all on function public.quote_request_reprice(bigint, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.quote_request_reprice(bigint, text, text, jsonb) to authenticated;
