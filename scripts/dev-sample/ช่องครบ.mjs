// ── ส่วน "ช่องครบ": ทุกช่องที่คนกรอกจริงในฟอร์มมีค่า + รายการล่าสุดที่หน้าจอดึงมาแสดงมีของ (บอสสั่ง 19 พ.ย. 69) ────────────
//   "ปรับข้อมูลตัวอย่างให้สมจริงตามแบบกรอกจริงทุกช่อง และทุกช่องที่เชื่อมต่อกันมาแสดงในหน้านั้นล่าสุด"
//   รายการช่องจากการไล่ฟอร์มจริง (ลูกค้าเป้าหมาย · ขอราคา · ใบ HQ · ใบให้ลูกค้า · ลูกค้า · นัดหมาย · บันทึก · ไฟล์ · ผู้สนใจ · ใบค่าแฟรนไชส์
//   · ดีลเลอร์/ตั้งค่าดีลเลอร์ · ผู้ใช้/พนักงาน) — เติมเฉพาะช่องที่ว่าง (ไม่ทับค่าที่ส่วนก่อนสร้าง) · ช่องตามสถานะ (เหตุผลยกเลิก/ปิดไม่สำเร็จ ฯลฯ) ไม่เติม
//   ช่องที่ไม่มีในฟอร์ม/ระบบคิดเอง/เลิกใช้ (leads.category/value · customers.contacts/category · quotations.quote_no · notif_prefs · wordmark) ไม่เติม
//   ตั้งใจเว้นว่างให้เห็นกรณีว่าง: แถวแรกของ RYG ต่อช่อง (1 ราย) — ช่องไม่บังคับเท่านั้น
//   ยังเป็นข้อมูลปลอม: โทร 000-000-xxxx · อีเมล @example.test · ชื่อบริษัทมี (ตัวอย่าง) · เลขที่บ้านสุ่ม (ตำบล/อำเภอ/รหัสไปรษณีย์ = เขตอำเภอเมืองของจังหวัด)
//   บันทึกของลูกค้า (customer_notes) 1–3 รายการต่อลูกค้าส่วนใหญ่ · วันที่อยู่ระหว่างวันเป็นลูกค้า–วันนี้ · ผู้เขียน = พนักงานขายของสาขา
//   ทำท้ายสุด (หลังชื่อสมจริง) · SQL ตรงแบบ replica (เติมช่องข้อมูล ไม่เปลี่ยนสถานะ/ยอด)
export const ชื่อ = "ช่องครบ";

const เขตเมือง = {
  ระยอง: ["ต.เชิงเนิน", "อ.เมืองระยอง", "21000"], เชียงใหม่: ["ต.หนองป่าครั่ง", "อ.เมืองเชียงใหม่", "50000"], ขอนแก่น: ["ต.ในเมือง", "อ.เมืองขอนแก่น", "40000"],
  ชลบุรี: ["ต.บ้านสวน", "อ.เมืองชลบุรี", "20000"], นครราชสีมา: ["ต.ในเมือง", "อ.เมืองนครราชสีมา", "30000"], ภูเก็ต: ["ต.ตลาดใหญ่", "อ.เมืองภูเก็ต", "83000"],
  สกลนคร: ["ต.ธาตุเชิงชุม", "อ.เมืองสกลนคร", "47000"], อุบลราชธานี: ["ต.ในเมือง", "อ.เมืองอุบลราชธานี", "34000"], ตราด: ["ต.บางพระ", "อ.เมืองตราด", "23000"],
  กรุงเทพมหานคร: ["แขวงบางนาเหนือ", "เขตบางนา", "10260"],
};
const ภาคของจังหวัด = { ระยอง: "ตะวันออก", ชลบุรี: "ตะวันออก", ตราด: "ตะวันออก", เชียงใหม่: "เหนือ", ขอนแก่น: "ตะวันออกเฉียงเหนือ", นครราชสีมา: "ตะวันออกเฉียงเหนือ",
  สกลนคร: "ตะวันออกเฉียงเหนือ", อุบลราชธานี: "ตะวันออกเฉียงเหนือ", ภูเก็ต: "ใต้", กรุงเทพมหานคร: "กลาง",
  ลำปาง: "เหนือ", นครสวรรค์: "เหนือ", สุราษฎร์ธานี: "ใต้", อุดรธานี: "ตะวันออกเฉียงเหนือ" };

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const อาร์เรย์ = (xs) => `array[${xs.map(q).join(", ")}]`;
/** เลือกจากชุดตามกุญแจ (คงที่ทุกรอบ) — SQL */
const เลือก = (xs, กุญแจ) => `(${อาร์เรย์(xs)})[1 + abs(hashtext(${กุญแจ}))::bigint % ${xs.length}]`;

const รายงานลีด = {
  WAITING: ["ลูกค้าโทรเข้ามาสอบถาม นัดคุยรายละเอียดสัปดาห์นี้", "ส่งโบรชัวร์และผลงานเดิมให้ทางไลน์แล้ว รอลูกค้าตอบกลับ", "ลูกค้ายังเลือกที่ดินอยู่ 2 แปลง ขอข้อมูลขนาดมาตรฐานไปก่อน"],
  BULLET: ["คุยความต้องการแล้ว ต้องการหลังคาสูง 8 ม. ประตูม้วน 2 บาน", "ลูกค้าส่งผังที่ดินมาแล้ว รอวัดหน้างาน", "ผู้ตัดสินใจคือเจ้าของกิจการ นัดคุยรอบสองพร้อมแบบร่าง"],
  QUOTED: ["ส่งใบเสนอราคาแล้ว ลูกค้าขอเทียบกับอีก 1 ราย", "ลูกค้าขอปรับผนังเป็นแซนด์วิชพาเนล รอยืนยันก่อนแก้ใบ", "โทรติดตามแล้ว ลูกค้าจะสรุปภายในสิ้นเดือน"],
  PAID: ["ลูกค้าตอบรับใบเสนอราคา ชำระมัดจำแล้ว ส่งต่อฝ่ายผลิต", "เซ็นสัญญาเรียบร้อย นัดเข้าหน้างานเตรียมพื้นที่", "ลูกค้าตอบรับ ขอแบ่งชำระ 3 งวดตามความคืบหน้างาน"],
  CANCELLED: ["ลูกค้าเลื่อนโครงการไปปีหน้า เก็บข้อมูลไว้ติดต่อใหม่", "ลูกค้าเลือกผู้รับเหมาในพื้นที่ที่ราคาต่ำกว่า", "งบประมาณไม่ผ่านอนุมัติของบริษัทแม่"],
};
const ติดต่อ = ["โทรแนะนำบริษัทและสอบถามขนาดพื้นที่ที่ต้องการ", "ส่งผลงานโกดังที่สร้างแล้วให้ลูกค้าทางไลน์", "ลูกค้าโทรกลับมาถามระยะเวลาก่อสร้าง",
  "นัดดูหน้างานกับลูกค้า วัดพื้นที่จริง", "โทรติดตามความคืบหน้าการตัดสินใจ", "ส่งรายละเอียดสเปกหลังคาและผนังทางอีเมล"];
const หมายเหตุใบ = ["ราคานี้ไม่รวมงานฐานรากและงานดิน", "ราคารวมค่าขนส่งและติดตั้งถึงหน้างาน ไม่รวมงานไฟฟ้า", "ชำระมัดจำ 30% เมื่อเซ็นสัญญา ส่วนที่เหลือตามงวดงาน",
  "ระยะเวลาผลิตและติดตั้งประมาณ 45 วันหลังยืนยันแบบ", "รับประกันโครงสร้าง 5 ปี หลังคารั่วซึม 2 ปี"];
const บันทึกลูกค้า = [
  ["ลูกค้าขอสำเนาใบกำกับภาษี", "ส่งสำเนาใบกำกับภาษีทางอีเมลแล้ว ลูกค้าแจ้งให้ส่งฉบับจริงทางไปรษณีย์ด้วย"],
  ["นัดตรวจรับงานงวดสุดท้าย", "ลูกค้าสะดวกช่วงเช้า ให้โทรแจ้งก่อนเข้าหน้างาน 1 วัน"],
  ["ลูกค้าสนใจต่อเติมกันสาด", "สอบถามราคาต่อเติมกันสาดด้านหน้าอาคาร ยาวประมาณ 20 ม. รอส่งแบบร่าง"],
  ["ผู้ติดต่อใหม่ฝ่ายจัดซื้อ", "ผู้ติดต่อเดิมย้ายแผนก ให้ติดต่อฝ่ายจัดซื้อแทนเรื่องเอกสารและการชำระเงิน"],
  ["แจ้งรอบบำรุงรักษาหลังคา", "แนะนำตรวจสกรูและรอยต่อหลังคาก่อนหน้าฝน ลูกค้าขอให้นัดช่าง"],
  ["ลูกค้าแนะนำเพื่อนธุรกิจ", "ลูกค้าแนะนำเจ้าของโรงงานข้างเคียงที่สนใจสร้างโกดัง ได้เบอร์ติดต่อมาแล้ว"],
  ["ชำระเงินงวดที่ 2 แล้ว", "ฝ่ายบัญชีลูกค้ายืนยันการโอนงวดที่ 2 ส่งใบเสร็จให้แล้ว"],
];
const ประเภทธุรกิจ = ["ผู้รับเหมาก่อสร้าง", "ร้านวัสดุก่อสร้าง", "ผู้ค้าเหล็ก", "บริษัทออกแบบอาคาร"];
const เงื่อนไขเอกสาร = "1. ราคานี้ไม่รวมงานฐานราก งานดิน และงานระบบไฟฟ้า\n2. ชำระมัดจำ 30% เมื่อยืนยันสั่งผลิต ส่วนที่เหลือแบ่งตามงวดงาน\n3. ระยะเวลาผลิตและติดตั้งประมาณ 45 วันหลังยืนยันแบบ\n4. รับประกันโครงสร้าง 5 ปี";
const ตำแหน่งพนักงาน = ["พนักงานขาย", "พนักงานขายอาวุโส", "หัวหน้าฝ่ายขาย"];

/** ส่วนท้ายที่อยู่ (ตำบล อำเภอ จังหวัด รหัสไปรษณีย์) ตามจังหวัด — SQL case */
const ท้ายที่อยู่ = (คอลัมน์จังหวัด) => `case ${Object.entries(เขตเมือง).map(([p, [ต, อ, ไปรษณีย์]]) =>
  `when ${คอลัมน์จังหวัด} = ${q(p)} then ${q(p === "กรุงเทพมหานคร" ? ` ${ต} ${อ} กรุงเทพมหานคร ${ไปรษณีย์}` : ` ${ต} ${อ} จ.${p} ${ไปรษณีย์}`)}`).join(" ")}
  else ' อ.เมือง' || ${คอลัมน์จังหวัด} || ' จ.' || ${คอลัมน์จังหวัด} end`;
/** ที่อยู่ที่ยังไม่มีรหัสไปรษณีย์ → ตัดส่วน อ./จ./เขต เดิมแล้วต่อท้ายเต็ม */
const เติมที่อยู่ = (ตาราง, คอลัมน์, คอลัมน์จังหวัด, เงื่อนไข = "true") => `
  update public.${ตาราง} set ${คอลัมน์} = regexp_replace(${คอลัมน์}, ' (อ\\.|เขต|จ\\.).*$', '') || ${ท้ายที่อยู่(คอลัมน์จังหวัด)}
   where coalesce(${คอลัมน์}, '') <> '' and ${คอลัมน์} !~ '[0-9]{5}$' and coalesce(${คอลัมน์จังหวัด}, '') <> '' and ${เงื่อนไข};`;

function sqlเติม() {
  const ไทยเวลา = (ts) => `(extract(day from (${ts}) at time zone 'Asia/Bangkok')::int || ' ' || (array['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'])[extract(month from (${ts}) at time zone 'Asia/Bangkok')::int] || ' ' || (extract(year from (${ts}) at time zone 'Asia/Bangkok')::int + 543) || ' · ' || to_char((${ts}) at time zone 'Asia/Bangkok', 'HH24:MI'))`;
  return `begin;
  set local session_replication_role = replica;
  -- แถวที่ตั้งใจเว้นว่าง (กรณีช่องไม่บังคับว่าง): ลีด/ลูกค้า/ใบ แรกของ RYG
  create temp table เว้น as select
    (select min(num_id) from public.leads where dealer_code = 'RYG') ลีด,
    (select min(id) from public.customers where dealer_code = 'RYG') ลูกค้า,
    (select min(id) from public.quotations where dealer_code = 'RYG' and status <> 'draft') ใบ;

  -- ── รหัสลีดตามกติกาแอป "#L-" + (40321 + เลขลีด) (ใบ 0036) — ข้อมูลตั้งต้นใช้ "#L-<เลข>" → HQ เปิดแผงจากลิงก์ที่รู้แค่เลขไม่เจอ ──
  --    ตารางอื่นอ้างลีดด้วยเลข (num_id) ไม่ใช่รหัส · ทำก่อนเติมช่องอื่น (ช่องที่สุ่มตามรหัสคงที่ทุกรอบ)
  update public.leads set id = '#L-' || (40321 + num_id) where id is distinct from '#L-' || (40321 + num_id);
  -- มูลค่าลีด = ใบล่าสุดที่ส่งแล้ว (ตัวกลางฐาน _lead_quote_value · ใบ 0223) — ใบตั้งต้นลงแบบปิดตัวดัก ค่ามูลค่าลีดจึงไม่ถูกคำนวณ (หัวแผงขึ้น "—")
  update public.leads l set quote_value = public._lead_quote_value(l.dealer_code, l.num_id)
   where l.quote_value is distinct from public._lead_quote_value(l.dealer_code, l.num_id);

  -- ── ลูกค้าเป้าหมาย: หมายเหตุลูกค้าเป้าหมาย (report) · อีเมล · ที่อยู่ · บันทึกการติดต่อ ──
  update public.leads l set report = case l.status::text
      ${Object.entries(รายงานลีด).map(([s, xs]) => `when ${q(s)} then ${เลือก(xs, "l.id")}`).join("\n      ")}
      else ${เลือก(รายงานลีด.BULLET, "l.id")} end
   where coalesce(l.report, '') = '' and l.num_id <> (select ลีด from เว้น);
  update public.leads l set email = 'sample-' || lower(l.dealer_code) || '-' || (l.num_id % 100000) || '@example.test'
   where coalesce(l.email, '') = '' and l.num_id <> (select ลีด from เว้น);
  update public.leads l set address = (10 + abs(hashtext('ที่:' || l.id)) % 290) || '/' || (1 + abs(hashtext('ซ:' || l.id)) % 40) || ' หมู่ ' || (1 + abs(hashtext('ม:' || l.id)) % 9)
      || ' ถ.' || ${เลือก(["ราษฎร์บำรุง", "สุขาภิบาล 2", "ประชาร่วมใจ", "เจริญสุข", "นิมิตใหม่", "พัฒนาการ"], "l.id")}
   where coalesce(l.address, '') = '' and l.num_id <> (select ลีด from เว้น);
  ${เติมที่อยู่("leads", "address", "province")}
  -- บันทึกการติดต่อของข้อมูลตั้งต้นที่ยังเป็นคำทดสอบ → ข้อความจริง
  update public.leads l set activities = (select jsonb_agg(case when x->>'text' ~ '^บันทึกการติดต่อทดสอบ' then jsonb_set(x, '{text}', to_jsonb((array[
    'ติดตามลูกค้า (โทร) · โทรแนะนำบริษัท ' || coalesce(nullif(l.contact, ''), 'ลูกค้า') || ' สนใจอาคารราว ' || coalesce(nullif(l.area, ''), '600') || ' ตร.ม. ที่' || l.province,
    'ติดตามลูกค้า (LINE) · ส่งผลงาน' || coalesce(nullif(l.project, ''), 'โกดัง') || 'ใน' || l.province || ' ' || (2 + abs(hashtext('w' || l.id || coalesce(x->>'id', ''))) % 4) || ' แห่งให้ ' || l.company,
    'ติดตามลูกค้า (โทร) · ' || coalesce(nullif(l.contact, ''), 'ลูกค้า') || ' ถามระยะเวลาผลิตและติดตั้งงาน ' || coalesce(nullif(l.area, ''), '600') || ' ตร.ม. ตอบว่าราว ' || (35 + abs(hashtext('t' || l.id)) % 30) || ' วัน',
    'ส่งข้อมูล (อีเมล) · ส่งสเปกหลังคาและผนังสำหรับ' || coalesce(nullif(l.project, ''), 'โกดัง') || ' ให้ ' || l.company,
    'เข้าพบลูกค้า (พบลูกค้า) · วัดพื้นที่จริงที่' || l.province || ' หน้ากว้างถนน ' || (6 + abs(hashtext('r' || l.id)) % 10) || ' ม. รถเครนเข้าได้',
    'ติดตามลูกค้า (โทร) · ' || coalesce(nullif(l.contact, ''), 'ลูกค้า') || ' ขอเวลาปรึกษาหุ้นส่วนอีก ' || (3 + abs(hashtext('d' || l.id || coalesce(x->>'id', ''))) % 12) || ' วัน'
  ])[1 + abs(hashtext(l.id || coalesce(x->>'id', '')))::bigint % 6])) else x end order by o)
      from jsonb_array_elements(l.activities) with ordinality t(x, o))
   where l.activities::text like '%บันทึกการติดต่อทดสอบ%';
  -- บันทึกการติดต่อครั้งแรก/ตามขั้น: ส่วน งานขายเต็ม.mjs (ทุกลีด รวมที่เข้าวันนี้ · บอสสั่ง 19 พ.ย. 69)

  -- ── ลูกค้า: ผู้ติดต่อ (name) · อีเมล · ที่อยู่เต็ม · ผู้รับผิดชอบ (owner = ผู้รับผิดชอบลีด หรือพนักงานขายของสาขา) ──
  update public.customers c set name = coalesce((select l.contact from public.leads l where l.dealer_code = c.dealer_code and l.customer_id = c.id and coalesce(l.contact, '') <> '' order by l.num_id limit 1), 'คุณ' || ${เลือก(["สมชาย ใจดี", "วิภาวรรณ ทองดี", "ประเสริฐ มั่นคง", "อรุณี ศรีสุข"], "c.id::text")})
   where coalesce(trim(c.name), '') = '' and c.id <> (select ลูกค้า from เว้น);
  update public.customers c set email = 'cust-' || lower(c.dealer_code) || '-' || (c.id % 100000) || '@example.test'
   where coalesce(c.email, '') = '' and c.id <> (select ลูกค้า from เว้น);
  ${เติมที่อยู่("customers", "address", "province")}
  update public.customers c set owner = coalesce(
      (select l.assigned from public.leads l where l.dealer_code = c.dealer_code and l.customer_id = c.id and coalesce(l.assigned, '') <> '' order by l.num_id desc limit 1),
      (select p.name from public.responsible_persons p where p.dealer_code = c.dealer_code and p.active order by abs(hashtext(p.name || c.id)) limit 1))
   where coalesce(c.owner, '') = '';

  -- ── ใบเสนอราคาให้ลูกค้า: หมายเหตุ · พื้นที่ (ฉบับแรก = พื้นที่ของงาน) ──
  update public.quotations x set note = ${เลือก(หมายเหตุใบ, "x.id")}
   where coalesce(x.note, '') = '' and x.id <> (select ใบ from เว้น);
  update public.quotations x set area = l.area from public.leads l
   where l.dealer_code = x.dealer_code and l.num_id = x.deal_id and coalesce(x.area, '') = '' and coalesce(l.area, '') <> '';

  -- ── นัดหมาย: สถานที่ (ฟอร์มปฏิทิน) = ที่อยู่หน้างานของลีด ──
  update public.appointments a set location = coalesce(nullif(l.address, ''), 'หน้างาน จ.' || l.province) from public.leads l
   where l.dealer_code = a.dealer_code and l.num_id = a.lead_id and coalesce(a.location, '') = '';

  -- ── คำขอราคา: HQ รับเรื่องแล้ว (ตีราคา/ส่งใบ/จบ) ต้องมีผู้รับเรื่อง + วันรับเรื่อง ──
  update public.quote_requests r set assignee = h.id, assignee_name = h.name,
      accepted_at = coalesce(r.accepted_at, r.submitted_at + interval '3 hours')
    from (select id, name, row_number() over (order by name) n from public.profiles where role::text = 'SUPER_ADMIN' and name <> 'ผู้ดูแลระบบสำนักงานใหญ่') h
   where r.assignee is null and r.status in ('pricing', 'quoted', 'won', 'lost')
     and h.n = 1 + abs(hashtext(r.request_no)) % (select count(*) from public.profiles where role::text = 'SUPER_ADMIN' and name <> 'ผู้ดูแลระบบสำนักงานใหญ่');

  -- ── ค่าที่ต้องเป็นตัวเลือกในฟอร์มจริง: ช่องทางที่มาของลีด · ประเภทนัดหมาย · เหตุผลผู้สนใจไม่สำเร็จ = รหัสในรายการกลาง (ใบ 0290 · option_lists)
  --    แหล่งที่มาของผู้สนใจ (recruitSettings ช่องทางที่เข้ามาเริ่มต้น) · ข้อมูลตั้งต้นมีคำนอกรายการ → ฟอร์มขึ้น "(ตามที่บันทึกไว้)" ──
  update public.leads l set source = case when l.source in ('ลูกค้าแนะนำ', 'แนะนำ') then 'referral' else ${เลือก(["facebook", "line", "walk_in", "website"], "l.id")} end
   where not exists (select 1 from public.option_lists o where o.list = 'lead_source' and o.code = l.source and not o.hidden);
  update public.appointments a set type = ${เลือก(["visit", "follow_up", "presentation", "site_visit"], "a.id::text")}
   where not exists (select 1 from public.option_lists o where o.list = 'appointment_type' and o.code = a.type and not o.hidden);
  update public.dealer_prospects p set lost_reason = ${เลือก(["no_capital", "not_ready", "other_brand", "bad_location"], "p.id::text")}
   where p.status = 'lost' and not exists (select 1 from public.option_lists o where o.list = 'prospect_lost_reason' and o.code = p.lost_reason and not o.free_text);
  update public.dealer_prospects p set channel = case when p.channel ilike 'line oa' then 'LINE OA' else ${เลือก(["Facebook", "LINE OA", "แนะนำต่อ", "โทรเข้ามาเอง"], "p.id::text")} end
   where coalesce(p.channel, '') not in ('Facebook', 'LINE OA', 'LINE ส่วนตัว', 'โทรเข้ามาเอง', 'แนะนำต่อ', 'อื่น ๆ');

  -- ── ผู้สนใจเป็นดีลเลอร์: ประเภทธุรกิจ · ชื่อบนโซเชียล · ภาค · ผู้ดูแล (HQ) · ติดตามครั้งถัดไป (ยังคุยอยู่) ──
  update public.dealer_prospects p set business_type = ${เลือก(ประเภทธุรกิจ, "p.id::text")} where coalesce(p.business_type, '') = '';
  update public.dealer_prospects p set social = 'LINE: ' || ${เลือก(["steelhome", "metalbuild", "warehouse.pro", "siamsteel"], "p.id::text")} || '_' || (p.id % 1000) || ' (ตัวอย่าง)' where coalesce(p.social, '') = '';
  update public.dealer_prospects p set region = case p.province ${Object.entries(ภาคของจังหวัด).map(([j, ภ]) => `when ${q(j)} then ${q(ภ)}`).join(" ")} else p.region end where coalesce(p.region, '') = '';
  update public.dealer_prospects p set assigned = (select name from public.profiles where role::text = 'SUPER_ADMIN' and name <> 'ผู้ดูแลระบบสำนักงานใหญ่' order by abs(hashtext(name || p.id)) limit 1)
   where coalesce(p.assigned, '') = '';
  update public.dealer_prospects p set follow_up = (now() at time zone 'Asia/Bangkok')::date + (3 + p.id % 10)::int
   where p.follow_up is null and p.status in ('new', 'contacted', 'considering', 'profile_sent');

  -- ── ดีลเลอร์ › ตั้งค่า: ข้อมูลบริษัท (เว็บไซต์ · ที่อยู่เต็ม) · เอกสาร (ภาษี/ยืนราคา/หัก ณ ที่จ่าย/เงื่อนไข) · % บวกตั้งต้น ──
  update public.dealer_settings s set issuer = s.issuer || jsonb_build_object('website', 'https://' || lower(s.dealer_code) || '.example.test')
   where coalesce(s.issuer->>'website', '') = '' and s.issuer ? 'company';
  update public.dealer_settings s set issuer = jsonb_set(s.issuer, '{address}', to_jsonb(regexp_replace(s.issuer->>'address', ' (อ\\.|เขต|จ\\.).*$', '') || ${ท้ายที่อยู่("d.province")}))
    from public.dealers d where d.code = s.dealer_code and coalesce(s.issuer->>'address', '') <> '' and (s.issuer->>'address') !~ '[0-9]{5}$';
  -- ตั้งค่าเอกสาร: คีย์ที่แอปอ่าน (vatPercent/validityDays/whtPercent/quotePrefix/termsAndConditions/header/footer) — เติมทุกคีย์ที่ว่างหรือยังเป็นคำทดสอบ
  --   คีย์รุ่นเก่า (vat/terms/prefix/running) เอาออก · หัว/ท้ายเอกสารสมจริงทุกสาขา (บอสสั่ง 19 พ.ย. 69 · เดิม CNX ท้ายเอกสาร "ข้อความเอกสารทดสอบ CNX")
  --   เดิม: ค่าใหม่ || ค่าเดิม → ช่องที่มีอยู่แต่ว่าง (termsAndConditions = '') ชนะค่าใหม่ เติมไม่ติด
  update public.dealer_settings s set document = (coalesce(s.document, '{}'::jsonb) - 'vat' - 'terms' - 'prefix' - 'running') || jsonb_strip_nulls(jsonb_build_object(
      'vatPercent',   case when jsonb_typeof(s.document->'vatPercent') = 'number' then null else to_jsonb(7) end,
      'validityDays', case when jsonb_typeof(s.document->'validityDays') = 'number' then null else to_jsonb(30) end,
      'whtPercent',   case when jsonb_typeof(s.document->'whtPercent') = 'number' then null else to_jsonb(3) end,
      'quotePrefix',  case when coalesce(s.document->>'quotePrefix', '') <> '' then null else to_jsonb('Q-' || s.dealer_code || '-') end,
      'termsAndConditions', case when coalesce(s.document->>'termsAndConditions', '') <> '' and s.document->>'termsAndConditions' not like '%ทดสอบ%' then null else to_jsonb(${q(เงื่อนไขเอกสาร)}::text) end,
      'header', case when coalesce(s.document->>'header', '') <> '' and s.document->>'header' not like '%ทดสอบ%' then null
                     else to_jsonb('ผู้แทนจำหน่ายอาคารเหล็กสำเร็จรูป · ออกแบบ ผลิต ติดตั้งครบวงจร' || coalesce(' · จ.' || nullif(d.province, ''), '')) end,
      'footer', case when coalesce(s.document->>'footer', '') <> '' and s.document->>'footer' not like '%ทดสอบ%' then null
                     else to_jsonb(${เลือก([
                       "เงื่อนไขชำระเงิน: มัดจำ 30% เมื่อยืนยันสั่งผลิต · 60% เมื่อส่งโครงเหล็กถึงหน้างาน · 10% เมื่อส่งมอบงาน · ระยะส่งมอบประมาณ 45–60 วัน · รับประกันโครงสร้าง 5 ปี หลังคารั่วซึม 2 ปี",
                       "ชำระเงินโอนเข้าบัญชีบริษัทเท่านั้น · ระยะผลิตและติดตั้งประมาณ 50 วันหลังยืนยันแบบ · รับประกันงานโครงสร้าง 5 ปี · ขอบคุณที่ไว้วางใจ",
                       "ราคานี้รวมค่าขนส่งและติดตั้ง ไม่รวมงานฐานรากและไฟฟ้า · ระยะส่งมอบ 45 วัน · รับประกันโครงสร้าง 5 ปี สีหลังคา 10 ปี"], "s.dealer_code")}::text) end))
    from public.dealers d where d.code = s.dealer_code;
  -- ผู้ทำงานรายขั้นที่ยังเป็นชื่อทดสอบ (ข้อมูลตั้งต้น "ผู้ใช้ทดสอบ") → ผู้รับผิดชอบของลีด
  update public.leads l set tasks = (select jsonb_agg(case when t->>'doneBy' like '%ทดสอบ%' then jsonb_set(t, '{doneBy}', to_jsonb(coalesce(nullif(l.assigned, ''), 'พนักงานขาย'))) else t end order by o)
      from jsonb_array_elements(l.tasks) with ordinality x(t, o))
   where jsonb_typeof(l.tasks) = 'array' and l.tasks::text like '%ทดสอบ%';
  update public.dealer_settings s set pricing = coalesce(s.pricing, '{}'::jsonb) || jsonb_build_object('defaultPct', 10 + abs(hashtext(s.dealer_code)) % 8)
   where coalesce(s.pricing->>'defaultPct', '') = '';

  -- ── ผู้ใช้/พนักงาน: เบอร์ผู้ใช้ · แผนก (HQ) · พนักงานขาย (ตำแหน่ง/โทร/อีเมล) ──
  update public.profiles p set phone = '000-000-' || lpad((5100 + abs(hashtext(p.id::text)) % 800)::text, 4, '0') where coalesce(p.phone, '') = '';
  update public.profiles p set department = 'ฝ่ายบริหารเครือข่าย' where coalesce(p.department, '') = '' and p.role::text = 'SUPER_ADMIN';
  update public.responsible_persons p set title = ${เลือก(ตำแหน่งพนักงาน, "p.name")} where coalesce(p.title, '') = '';
  update public.responsible_persons p set phone = '000-000-' || lpad((4000 + abs(hashtext(p.name)) % 900)::text, 4, '0') where coalesce(p.phone, '') = '';
  update public.responsible_persons p set email = 'sales-' || lower(p.dealer_code) || '-' || (abs(hashtext(p.name)) % 1000) || '@example.test' where coalesce(p.email, '') = '';

  -- ── บันทึกของลูกค้า 1–3 รายการ ทุกราย (บอสสั่ง 19 พ.ย. 69 "ทุกแท็บมีของ") · วันที่ระหว่างวันเป็นลูกค้า–วันนี้ · ผู้เขียน = พนักงานขายของสาขา ──
  insert into public.customer_notes (id, dealer_code, customer_id, title, content, category, pinned, color, author, created_at, updated_at) overriding system value
  select 970000000 + row_number() over (order by c.dealer_code, c.id, k), c.dealer_code, c.id, (b.x)[1], (b.x)[2], 'ลูกค้า', false, '#003366',
         coalesce(nullif(c.owner, ''), (select p.name from public.responsible_persons p where p.dealer_code = c.dealer_code order by p.name limit 1), ''),
         เวลา, เวลา
    from public.customers c
    cross join lateral generate_series(1, 1 + abs(hashtext('น:' || c.id)) % 3) k
    cross join lateral (select greatest(coalesce(nullif(c.join_date, '')::date, c.created_at::date), (c.created_at - interval '400 days')::date) เริ่ม) ช
    cross join lateral (select (ช.เริ่ม + ((abs(hashtext('ว:' || c.id || ':' || k)) % greatest(1, (current_date - ช.เริ่ม)))::int) * interval '1 day'
                               + ((8 + abs(hashtext('ช:' || c.id || k)) % 9)::int) * interval '1 hour') at time zone 'Asia/Bangkok' เวลา) ว
    cross join lateral (select array[${บันทึกลูกค้า.map(([h, b]) => `array[${q(h)}, ${q(b)}]`).join(", ")}] ชุด) ช2
    cross join lateral (select array[ช2.ชุด[1 + (abs(hashtext('ห:' || c.id)) + k) % ${บันทึกลูกค้า.length}][1], ช2.ชุด[1 + (abs(hashtext('ห:' || c.id)) + k) % ${บันทึกลูกค้า.length}][2]] x) b
   where ช.เริ่ม <= current_date
     and not exists (select 1 from public.customer_notes n where n.dealer_code = c.dealer_code and n.customer_id = c.id);
  commit;`;
}

export async function มีแล้ว(ctx) {
  return Number(ctx.sql(`select count(*) from public.customer_notes where id >= 970000000;`).trim()) > 0;
}

// ── ชื่องานเป็นอาคารโครงเหล็กทุกงาน (บอสสั่ง 20 พ.ย. 69 "ข้อมูลตัวอย่างเน้นโครงเหล็ก") ─────────────────────────────────
//   ลีด/คำขอ/ใบ/ไฟล์/นัด ที่ลงก่อนวันนี้ยังใช้ชื่อเดิม (ชื่อสมจริงแทนครั้งเดียวตอนสร้างฐาน) → แทนเป็นชื่อโครงเหล็กชุดเดียวกับ ชื่อสมจริง.mjs
//   regexp_replace + (?!โครงเหล็ก) กันแทนซ้ำเมื่อชื่อใหม่ขึ้นต้นด้วยชื่อเดิม (โรงจอดรถบรรทุก → โรงจอดรถบรรทุกโครงเหล็ก) · รันซ้ำได้
//   ไม่แตะ notifications/audit_log (ข้อความที่ส่งไปแล้ว)
const ชื่องานโครงเหล็ก = [
  ["โกดังเก็บสินค้า", "โกดังโครงเหล็กเก็บสินค้า"], ["โรงงานผลิตชิ้นส่วน", "โรงงานโครงเหล็กผลิตชิ้นส่วน"],
  ["อาคารโครงเหล็กสำนักงาน", "อาคารสำนักงานโครงเหล็ก"], ["ห้องเย็นเก็บผลผลิต", "ห้องเย็นโครงเหล็กเก็บผลผลิต"],
  ["โรงจอดรถบรรทุก", "โรงจอดรถบรรทุกโครงเหล็ก"], ["โกดังพักสินค้า", "โกดังโครงเหล็กพักสินค้า"],
  ["อาคารคลังสินค้าเกษตร", "อาคารโครงเหล็กคลังสินค้าเกษตร"],
];
const ช่องชื่องาน = [["leads", "project"], ["leads", "product"], ["quote_requests", "product"], ["quotations", "project"],
  ["quotations", "product_line"], ["files", "project"], ["appointments", "building_type"]];
function sqlชื่องานโครงเหล็ก() {
  const คำสั่ง = ช่องชื่องาน.map(([t, c]) => `update public.${t} set ${c} = ${ชื่องานโครงเหล็ก.reduce((x, [เดิม, ใหม่]) =>
    `regexp_replace(${x}, '${เดิม}(?!โครงเหล็ก)', '${ใหม่}', 'g')`, c)} where ${c} ~ '(${ชื่องานโครงเหล็ก.map(([เดิม]) => เดิม).join("|")})';`);
  return `begin; set local session_replication_role = replica;\n${คำสั่ง.join("\n")}\ncommit;`;
}

export async function สร้าง(ctx) {
  ctx.sql(sqlชื่องานโครงเหล็ก());
  ctx.sql(sqlเติม());
  const นับ = (s) => Number(ctx.sql(s).trim());
  console.log(`✓ ช่องครบ: บันทึกของลูกค้า ${นับ("select count(*) from public.customer_notes where id >= 970000000")} รายการ`
    + ` (ลูกค้า ${นับ("select count(distinct (dealer_code, customer_id)) from public.customer_notes where id >= 970000000")} ราย)`
    + ` · ลีดไม่มีหมายเหตุ ${นับ("select count(*) from public.leads where coalesce(report, '') = ''")}`
    + ` · ใบไม่มีหมายเหตุ ${นับ("select count(*) from public.quotations where coalesce(note, '') = ''")}`
    + ` · ลูกค้าไม่มีผู้รับผิดชอบ ${นับ("select count(*) from public.customers where coalesce(owner, '') = ''")}`);
}

export async function ลบ(ctx) {
  // บันทึกของลูกค้าที่ส่วนนี้สร้าง (ช่องอื่นที่เติมอยู่ในแถวของส่วนก่อน — ลบไปพร้อมแถวตอนส่วนก่อนลบ)
  ctx.sql(`delete from public.customer_notes where id >= 970000000;`);
}
