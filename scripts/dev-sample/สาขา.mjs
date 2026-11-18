// ── ส่วน "สาขา": ดีลเลอร์ที่มีบัญชีเข้าระบบ ≥ 4 ราย · จังหวัดเดียว 2 สาขา · ข้อมูลบริษัทครบ 3 ไม่ครบ 1 (บอสสั่ง 28 ต.ค. 69) ─────
// มีอยู่แล้วในข้อมูลตั้งต้น: RYG (ระยอง) · CNX (เชียงใหม่) — บัญชีเข้าระบบ + ข้อมูลบริษัทครบ
// ส่วนนี้เพิ่ม 2 สาขา ทางเดียวกับหน้าเว็บ (FLOW H2–H5: ผู้สนใจ → ใบค่าแฟรนไชส์ส่ง → ตอบรับ → ชำระครบ → แปลงเป็นดีลเลอร์):
//   RYT  ระยอง (จังหวัดเดียวกับ RYG · ใบ 0214 จังหวัดเดียวหลายดีลเลอร์) · ดีลเลอร์กรอกข้อมูลบริษัทครบที่หน้าตั้งค่า
//   SKN  สกลนคร · ข้อมูลบริษัทมีแค่ชื่อ (ค่าตั้งต้นตอนเปิดสาขา) = ไม่ครบ → ส่ง/พิมพ์ใบไม่ได้ (ใบ 0247)
// แปลงเป็นดีลเลอร์: ทำตามขั้นของ apps/hq/app/api/admin/dealers/route.ts (เส้นทางผู้ดูแลฝั่งเซิร์ฟเวอร์ · กุญแจ service_role)
//   — ตัวรันข้อมูลตัวอย่างทำงานก่อนเปิดเว็บ (scripts/dev-db.mjs) จึงเรียกเส้นทางเว็บไม่ได้ ทำขั้นเดียวกันด้วย ctx.svc
//   อีเมลเข้าระบบ = <รหัสสาขาตัวเล็ก>@dealer.benjaminpebsteel.com (lib/dealerLogin.ts · หน้าเข้าระบบพิมพ์รหัสสาขา) · รหัสผ่านในไฟล์นอก repo
//   ไม่ทำ: สำเนารหัสผ่านเข้ารหัส (dealer_login_secrets · ต้องใช้กุญแจของเว็บ · ฟีเจอร์ดูรหัสปิดอยู่) · แถวบันทึก "สร้างดีลเลอร์"
//   (เส้นทางเว็บเขียนแถวบันทึกตรง — ข้อมูลตัวอย่างไม่เขียนแถวบันทึกเอง)
// ฐานบังคับหนึ่งสาขาหนึ่งบัญชี (profiles_dealer_code_unique) — บทบาทหลายแบบในสาขาเดียวทำไม่ได้
import { เข้าHQ, ที่อยู่สมจริง } from "./งานขาย.mjs";

export const ชื่อ = "สาขา";
export const สาขาใหม่ = [
  // ดีลเลอร์ 1 ราย = 1 จังหวัดพอดี (ใบ 0259 · บอสตัดสิน 29 ต.ค. 69) — เดิม RYT/SKN ดูแล 2 จังหวัด ฐาน dev ลงใบ 0259 ไม่ได้ (30 ต.ค. 69)
  { code: "RYT", province: "ระยอง", region: "ตะวันออก", ครบ: true, เบอร์: 7101 },
  { code: "SKN", province: "สกลนคร", region: "ตะวันออกเฉียงเหนือ", ครบ: false, เบอร์: 7102 },
];
// ชื่อสมจริง (บอสสั่ง 18 พ.ย. 69 · เดิม "ดีลเลอร์ตัวอย่าง RYT" · "ว่าที่ดีลเลอร์ตัวอย่าง RYT" · "พนักงานขายตัวอย่าง RYT-1")
const ชื่อดีลเลอร์ใหม่ = { RYT: "มาบตาพุดสตีลโฮม (ตัวอย่าง)", SKN: "สกลนครเมทัลชีท (ตัวอย่าง)" };
const ชื่อสาขา = (code) => ชื่อดีลเลอร์ใหม่[code] ?? `ดีลเลอร์ตัวอย่าง ${code}`;
const ชื่อผู้สนใจ = (code) => ({ RYT: "คุณสุรพล วัฒนกิจ (ตัวอย่าง)", SKN: "คุณอำนวย ศรีภูมิ (ตัวอย่าง)" })[code] ?? `ว่าที่ดีลเลอร์ตัวอย่าง ${code}`;
const พนักงานสาขา = { RYT: ["วิทยา ชัยศรี", "อรอุมา ทองสุข"], SKN: ["ประยุทธ หอมจันทร์", "สมใจ ภูมิพันธ์"] };
// ผู้สนใจต้นทางของสาขา = อีเมล prospect-<รหัส>@example.test (ส่วนอื่นหาด้วยอีเมลนี้ · ชื่อแบบเดิมยังลบได้)
export const อีเมลผู้สนใจสาขา = (code) => `prospect-${code.toLowerCase()}@example.test`;
export const อีเมลสาขา = (code) => `${code.toLowerCase()}@dealer.benjaminpebsteel.com`;

export async function มีแล้ว(ctx) {
  const { count } = await ctx.svc.from("dealers").select("code", { count: "exact", head: true }).in("code", สาขาใหม่.map(s => s.code));
  return (count ?? 0) === สาขาใหม่.length;
}

// ลบสาขาตัวอย่างทั้งก้อน: ทุกตารางที่มีคอลัมน์ dealer_code ของสาขานั้น (รวมข้อมูลของส่วนอื่นที่ผูกสาขานี้) + บัญชีเข้าระบบ + ผู้สนใจต้นทาง
//   ปิดตัวดักทั้งหมดในธุรกรรมเดียว (replica) — ใบที่ส่งแล้ว/บันทึกการชำระ ฐานกันการลบ
export async function ลบ(ctx) {
  const รหัส = สาขาใหม่.map(s => `'${s.code}'`).join(",");
  const ผู้สนใจ = `select id from public.dealer_prospects where email in (${สาขาใหม่.map(s => `'${อีเมลผู้สนใจสาขา(s.code)}'`).join(",")})
    or name in (${สาขาใหม่.map(s => `'ว่าที่ดีลเลอร์ตัวอย่าง ${s.code}'`).join(",")})`;
  ctx.sql(`begin;
    set local session_replication_role = replica;
    do $$ declare t text; begin
      for t in select c.table_name from information_schema.columns c join information_schema.tables x
                 on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
                where c.table_schema = 'public' and c.column_name = 'dealer_code' and c.table_name <> 'dealers' loop
        execute format('delete from public.%I where dealer_code in (${รหัส.replace(/'/g, "''")})', t);
      end loop;
    end $$;
    delete from public.quotation_won_at where dealer_code in (${รหัส});
    delete from public.dealer_proposal_payments p using public.dealer_package_proposals x
      where p.proposal_id = x.id and x.prospect_id in (${ผู้สนใจ});
    delete from public.dealer_package_proposals x where x.prospect_id in (${ผู้สนใจ});
    delete from public.dealer_prospect_activities a where a.prospect_id in (${ผู้สนใจ});
    delete from public.dealers where code in (${รหัส});
    delete from public.dealer_prospects where id in (${ผู้สนใจ});
    -- ใบค่าแฟรนไชส์ที่ผู้สนใจถูกลบไปแล้ว (รอบก่อน 18 พ.ย. 69 ลบผู้สนใจในโหมด replica → ใบค้างไม่มีเจ้าของ ขึ้น "—" ในหน้าใบค่าแฟรนไชส์ · เพิ่มรอบละ 2 ใบ)
    delete from public.dealer_proposal_payments p using public.dealer_package_proposals x
      where p.proposal_id = x.id and not exists (select 1 from public.dealer_prospects d where d.id = x.prospect_id);
    delete from public.dealer_package_proposals x where not exists (select 1 from public.dealer_prospects d where d.id = x.prospect_id);
    commit;`);
  // บัญชีเข้าระบบ (โปรไฟล์ลบไปกับตารางด้านบนแล้ว)
  const { data: list } = await ctx.svc.auth.admin.listUsers({ perPage: 1000 });
  for (const s of สาขาใหม่) {
    const u = list?.users?.find(x => x.email === อีเมลสาขา(s.code));
    if (u) ctx.ต้อง(await ctx.svc.auth.admin.deleteUser(u.id), `ลบบัญชี ${s.code}`);
  }
}

export async function สร้าง(ctx) {
  const { svc, วัน, ต้อง, เบอร์ } = ctx;
  const hq = await เข้าHQ(ctx);

  for (const s of สาขาใหม่) {
    const name = ชื่อสาขา(s.code);
    // ── H2 ผู้สนใจเป็นดีลเลอร์ (HQ เพิ่มที่หน้าผู้สนใจ) ──
    const ราย = ต้อง(await hq.from("dealer_prospects").insert({ name: ชื่อผู้สนใจ(s.code), province: s.province, region: s.region,
      status: "considering", phone: เบอร์(s.เบอร์), email: อีเมลผู้สนใจสาขา(s.code), channel: "งานแสดงสินค้า",
      first_contact: วัน(-60), note: `ทำร้านวัสดุก่อสร้างใน${s.province}มา 10 ปี สนใจเปิดสาขาขายโกดังโครงเหล็ก` }).select("id").single(), `ผู้สนใจ ${s.code}`);
    // ── H3–H4 ใบค่าแฟรนไชส์: ส่ง → ตอบรับ → ชำระครบ ──
    // ใบต้องครบ 8 ช่องบังคับ (ใบ 0276) · ช่องแพ็กเกจลบไปแล้ว (ใบ 0269)
    const ใบ = ต้อง(await hq.from("dealer_package_proposals").insert({ prospect_id: ราย.id, status: "sent",
      region: s.region, province: s.province, valid_until: วัน(15), terms: "ราคานี้รวมค่าอบรมเริ่มต้น",
      proposed_date: วัน(-45), contract_months: 12, annual_target: s.ครบ ? 18_000_000 : 6_000_000, amount: 300_000 }).select("id").single(), `ใบค่าแฟรนไชส์ ${s.code}`);
    ต้อง(await hq.from("dealer_package_proposals").update({ status: "accepted", payment_due_on: วัน(-30) }).eq("id", ใบ.id), `ตอบรับใบ ${s.code}`);
    ต้อง(await hq.from("dealer_proposal_payments").insert({ proposal_id: ใบ.id, paid_on: วัน(-32), amount: 300_000, reference: `TR-ตัวอย่าง-${s.code}` }), `ชำระ ${s.code}`);
    const ยังไม่พร้อม = ต้อง(await svc.rpc("dealer_conversion_ready", { p_prospect: ราย.id }), `ตรวจความพร้อม ${s.code}`);
    if (ยังไม่พร้อม) throw new Error(`แปลง ${s.code} ไม่ได้: ${ยังไม่พร้อม}`);

    // ── H5 แปลงเป็นดีลเลอร์ (ขั้นเดียวกับเส้นทางผู้ดูแล) ──
    // 13 พ.ย. 69: เอาคอลัมน์ package ออก (เอาแพ็กเกจออก 30 ต.ค. 69 · ใบ 0269) — เดิมเลือก package แล้วได้ null เงียบ ๆ (ไม่ผ่าน ต้อง) → ข้อมูลตัวอย่างพังทั้งชุด
    const ใบตอบรับ = ต้อง(await svc.from("dealer_package_proposals").select("annual_target").eq("id", ใบ.id).single(), `อ่านใบค่าแฟรนไชส์ ${s.code}`);
    ต้อง(await svc.from("dealers").insert({ code: s.code, name, province: s.province, region: s.region, status: "active",
      revenue_target: Number(ใบตอบรับ.annual_target), prospect_id: ราย.id }), `ทะเบียนสาขา ${s.code}`);
    //   พื้นที่ดูแล = จังหวัดที่ตั้ง — ฐานเขียนให้เอง (ตัวดัก dealers_territory_sync · ใบ 0259) ไม่ใส่เอง
    await ctx.บัญชีผู้ใช้({ email: อีเมลสาขา(s.code), role: "DEALER_ADMIN", dealer_code: s.code, name });
    ต้อง(await svc.from("dealer_settings").insert({ dealer_code: s.code, issuer: { company: name } }), `ชื่อบริษัทตั้งต้น ${s.code}`);
    ต้อง(await svc.from("dealer_prospects").update({ status: "won", dealer_code: s.code, converted_at: new Date().toISOString(), lost_reason: null })
      .eq("id", ราย.id), `ผูกผู้สนใจ ${s.code}`);

    // ── ดีลเลอร์เข้าระบบครั้งแรก: ผู้รับผิดชอบ (พนักงานขาย) + ข้อมูลบริษัท (หน้าตั้งค่า) ──
    const b = ctx.อ่านบัญชี().บัญชี.find(x => x.email === อีเมลสาขา(s.code));
    const sb = await ctx.เข้า(b.email, b.password);
    ต้อง(await sb.from("responsible_persons").insert([1, 2].map(i => ({ dealer_code: s.code, name: พนักงานสาขา[s.code]?.[i - 1] ?? `พนักงานขายตัวอย่าง ${s.code}-${i}`,
      title: "พนักงานขาย", phone: เบอร์(s.เบอร์ * 10 + i), email: `sales-${s.code.toLowerCase()}-${i}@example.test`, active: true }))), `ผู้รับผิดชอบ ${s.code}`);
    if (s.ครบ) {
      ต้อง(await sb.from("dealer_settings").upsert({ dealer_code: s.code, updated_at: new Date().toISOString(),
        issuer: { company: `บริษัท ${name.replace(" (ตัวอย่าง)", "")} (ตัวอย่าง) จำกัด`, address: ที่อยู่สมจริง(`สาขา:${s.code}`, s.province), taxId: "0000000000000",
          phone: เบอร์(s.เบอร์), email: `${s.code.toLowerCase()}@example.test`, website: "" },
        document: { vatPercent: 7, validityDays: 30, quotePrefix: "Q-",
          termsAndConditions: "ชำระมัดจำ 30% เมื่อเซ็นสัญญา · 60% เมื่อส่งโครงเหล็กถึงหน้างาน · 10% เมื่อส่งมอบงาน · ราคานี้ไม่รวมงานฐานราก" } },
        { onConflict: "dealer_code" }), `ข้อมูลบริษัท ${s.code}`);
    }
    console.log(`✓ ${s.code} ${s.province} · บัญชี ${อีเมลสาขา(s.code)} · พื้นที่ ${s.province} · ข้อมูลบริษัท${s.ครบ ? "ครบ" : "ไม่ครบ (มีแค่ชื่อ)"}`);
  }
  console.log("✓ ดีลเลอร์มีบัญชี 4 ราย (RYG · CNX · RYT · SKN) · ระยองมี 2 สาขา (RYG · RYT) · ข้อมูลบริษัทครบ 3 ไม่ครบ 1 (SKN)");
}
