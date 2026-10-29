import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON, RYG, CNX, ADMIN, skipReason, type Account } from "./supabaseEnv";
import { วางใบเดิมที่ฐาน, ลบใบทดสอบที่ฐาน } from "./legacyQuotes";
import { adminClient } from "./testDealers";

// กฎความปลอดภัยที่ "มีจริงเฉพาะโหมด supabase" — RLS / สิทธิ์เขียน / FK / ตัวนับเลขที่ (M5)
//
// ทำไมไม่ทดสอบผ่านหน้าจอ: กฎพวกนี้บังคับที่ฐานข้อมูล ไม่ใช่ที่ UI
// การกดผ่านหน้าจอพิสูจน์ได้แค่ว่า "ปุ่มไม่โผล่" ซึ่งข้ามได้ด้วยการยิง API ตรง
// ชุดนี้จึงล็อกอินด้วยบัญชีจริงแล้วยิง PostgREST ตรง ๆ เหมือนผู้ไม่หวังดีจะทำ
//
// ตารางงานขายบน DB จริงยังว่าง (ไม่ยัด mock ลงของจริง) → เทสต์ที่ต้องมีข้อมูล
// จะสร้างแถวของตัวเองแล้วลบทิ้งเสมอ ไม่งั้นจะ "ผ่านเพราะไม่มีอะไรให้เจอ" ซึ่งไม่ได้พิสูจน์อะไรเลย

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");

// ใช้ client เดิมซ้ำต่อหนึ่งบัญชี — ชุดนี้มีหลายสิบเทสต์ ถ้าล็อกอินใหม่ทุกครั้ง
// Supabase Auth จะตอบ "Request rate limit reached" แล้วเทสต์ตกแบบสุ่ม (ไม่ใช่บั๊กของแอป)
const clients = new Map<string, Promise<SupabaseClient>>();
function signIn(who: Account): Promise<SupabaseClient> {
  const cached = clients.get(who.email);
  if (cached) return cached;
  const p = (async () => {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await sb.auth.signInWithPassword(who);
    if (error) throw new Error(`ล็อกอิน ${who.email} ไม่ผ่าน: ${error.message}`);
    return sb;
  })();
  clients.set(who.email, p);
  return p;
}

// PostgREST ปฏิเสธการเขียนที่ผิด RLS ได้สองแบบ: ตอบ error ตรง ๆ หรือเงียบแล้วไม่มีแถวถูกแตะ
// ทั้งสองแบบถือว่า "กันได้" — แต่ "สำเร็จและมีแถวเปลี่ยน" คือรั่ว
function wasBlocked(res: { error: unknown; data: unknown }): boolean {
  if (res.error) return true;
  return Array.isArray(res.data) ? res.data.length === 0 : res.data == null;
}

const lead = (id: string, dealer: string) => ({
  id, dealer_code: dealer, company: `เทสต์อัตโนมัติ ${id}`, status: "WAITING",
  phone: "081-999-0101",   // รายใหม่ต้องมีเบอร์โทรและจังหวัด (ใบ 0186)
  // หน้างานต้องอยู่ในพื้นที่ของสาขานั้น (กฎพื้นที่ ใบ 0195) — สาขาอื่นใช้จังหวัดของตัวเอง
  province: ({ RYG: "ระยอง", CNX: "เชียงใหม่" } as Record<string, string>)[dealer] ?? "ระยอง",
});

test("[rls] แต่ละสาขาเห็นเฉพาะลูกค้าเป้าหมายของตัวเอง · HQ เห็นทั้งสองสาขา", async () => {
  const ryg = await signIn(RYG);
  const cnx = await signIn(CNX);
  const hq  = await signIn(ADMIN);
  const idR = "TEST-RLS-RYG", idC = "TEST-RLS-CNX";
  const both = [idR, idC];

  try {
    // สร้างลูกค้าเป้าหมายจริงคนละสาขา — ถ้าสร้างไม่ได้ ทั้งเทสต์ไม่มีความหมาย จึงต้องฟ้องทันที
    const insR = await ryg.from("leads").insert(lead(idR, "RYG")).select();
    const insC = await cnx.from("leads").insert(lead(idC, "CNX")).select();
    expect(insR.error, `RYG สร้างลูกค้าเป้าหมายของตัวเองไม่ได้: ${JSON.stringify(insR.error)}`).toBeNull();
    expect(insC.error, `CNX สร้างลูกค้าเป้าหมายของตัวเองไม่ได้: ${JSON.stringify(insC.error)}`).toBeNull();

    const seen = async (sb: SupabaseClient) =>
      ((await sb.from("leads").select("id").in("id", both)).data ?? []).map(r => r.id).sort();

    expect(await seen(ryg), "RYG ต้องเห็นเฉพาะลูกค้าเป้าหมายของ RYG").toEqual([idR]);
    expect(await seen(cnx), "CNX ต้องเห็นเฉพาะลูกค้าเป้าหมายของ CNX").toEqual([idC]);
    expect(await seen(hq),  "HQ ต้องเห็นลูกค้าเป้าหมายของทั้งสองสาขา").toEqual([idC, idR].sort());
  } finally {
    await ryg.from("leads").delete().eq("id", idR);
    await cnx.from("leads").delete().eq("id", idC);
  }
});

test("[rls] ดีลเลอร์แก้/ลบลูกค้าเป้าหมายของสาขาอื่นไม่ได้", async () => {
  const ryg = await signIn(RYG);
  const cnx = await signIn(CNX);
  const id = "TEST-RLS-CROSS";
  try {
    expect((await cnx.from("leads").insert(lead(id, "CNX")).select()).error).toBeNull();

    const edited = await ryg.from("leads").update({ company: "โดนแก้ข้ามสาขา" }).eq("id", id).select();
    expect(wasBlocked(edited), "RYG ต้องแก้ลูกค้าเป้าหมายของ CNX ไม่ได้").toBe(true);

    const deleted = await ryg.from("leads").delete().eq("id", id).select();
    expect(wasBlocked(deleted), "RYG ต้องลบลูกค้าเป้าหมายของ CNX ไม่ได้").toBe(true);

    // ของจริงต้องยังอยู่ครบ ไม่ถูกแตะ
    const still = (await cnx.from("leads").select("company").eq("id", id)).data ?? [];
    expect(still[0]?.company, "ข้อมูลของ CNX ต้องไม่เปลี่ยน").toBe(`เทสต์อัตโนมัติ ${id}`);
  } finally {
    await cnx.from("leads").delete().eq("id", id);
  }
});

test("[rls] ดีลเลอร์สร้างลูกค้าเป้าหมายใส่สาขาอื่นไม่ได้", async () => {
  const sb = await signIn(RYG);
  const res = await sb.from("leads").insert(lead("TEST-RLS-XDEALER", "CNX")).select();
  expect(wasBlocked(res), "เขียนข้ามสาขาต้องถูกปฏิเสธ").toBe(true);
});

test("[rls] HQ เขียนงานขายของดีลเลอร์ไม่ได้ (C3)", async () => {
  const sb = await signIn(ADMIN);
  const res = await sb.from("leads").insert(lead("TEST-RLS-HQWRITE", "RYG")).select();
  expect(wasBlocked(res), "HQ มีสิทธิ์อ่านงานขาย แต่ต้องเขียนไม่ได้").toBe(true);
});

test("[fk] สร้างลูกค้าเป้าหมายใส่รหัสสาขาที่ไม่มีจริงไม่ได้ (0018)", async () => {
  const sb = await signIn(RYG);
  const res = await sb.from("leads").insert(lead("TEST-RLS-GHOST", "ZZZ")).select();
  expect(wasBlocked(res), "รหัสสาขาที่ไม่มีใน dealers ต้องถูกปฏิเสธ").toBe(true);
});

test("[rls] ดีลเลอร์แก้แคตตาล็อกกลางไม่ได้ · HQ แก้ได้ (0015)", async () => {
  const hq = await signIn(ADMIN);
  const { data: rows, error } = await hq.from("master_catalog").select("id,name").limit(1);
  expect(error).toBeNull();
  const row = (rows ?? [])[0];
  expect(row, "ต้องมีแม่แบบในแคตตาล็อกกลางอย่างน้อย 1 รายการ").toBeTruthy();

  // ดีลเลอร์พยายามแก้ราคากลาง → ต้องไม่มีแถวไหนเปลี่ยน
  const dealer = await signIn(CNX);
  const blocked = await dealer.from("master_catalog").update({ name: row.name }).eq("id", row.id).select();
  expect(wasBlocked(blocked), "ดีลเลอร์ต้องแก้แคตตาล็อกกลางไม่ได้").toBe(true);

  // HQ แก้ได้ — เขียนทับด้วยค่าเดิม ไม่เปลี่ยนข้อมูลจริง
  const allowed = await hq.from("master_catalog").update({ name: row.name }).eq("id", row.id).select();
  expect(allowed.error).toBeNull();
  expect(allowed.data?.length, "HQ ต้องแก้แคตตาล็อกกลางได้").toBe(1);
});

test("[rpc] เลข id ลูกค้าเดินหน้าทีละหนึ่ง แยกตามสาขา (0016)", async () => {
  const sb = await signIn(RYG);
  const a = await sb.rpc("next_entity_id", { p_dealer: "RYG", p_entity: "customers" });
  const b = await sb.rpc("next_entity_id", { p_dealer: "RYG", p_entity: "customers" });
  expect(a.error).toBeNull();
  expect(b.error).toBeNull();
  expect(Number(b.data) - Number(a.data), "เรียกสองครั้งต้องได้เลขต่างกัน 1").toBe(1);
});

test("[rpc-guard] ดีลเลอร์เรียก RPC 'ออกเลข/สร้างใบ' ของสาขาอื่นไม่ได้ (dealer mismatch)", async () => {
  // ยิง RPC ตรงเหมือนผู้ไม่หวังดี — guard ที่ฟังก์ชัน (security definer) ต้องปฏิเสธ ไม่ใช่แค่ RLS
  //   next_entity_id (0016) · next_quote_no (0031) · create_quotation (0034) มี dealer-match guard
  const cnx = await signIn(CNX); // ล็อกอินสาขา CNX แล้วพยายามทำของสาขา RYG
  const idOfRYG = await cnx.rpc("next_entity_id", { p_dealer: "RYG", p_entity: "customers" });
  expect(idOfRYG.error, "CNX ออกเลข id ลูกค้าของ RYG ไม่ได้").not.toBeNull();
  const quoteNoOfRYG = await cnx.rpc("next_quote_no", { p_dealer: "RYG" });
  expect(quoteNoOfRYG.error, "CNX ออกเลขที่ใบของ RYG ไม่ได้").not.toBeNull();
  const createForRYG = await cnx.rpc("create_quotation", { p_dealer: "RYG", p_prefix: "Q-2026-", p_payload: { customer: "เทสต์อัตโนมัติ" } });
  expect(createForRYG.error, "CNX สร้างใบเสนอราคาให้ RYG ไม่ได้").not.toBeNull();
});

test("[rpc] ใบที่ส่งแล้วและเลยกำหนด ถูกปิดเป็น 'หมดอายุ' · HQ สั่งไม่ได้ (H5+C3)", async () => {
  const ryg = await signIn(RYG);
  const hq  = await signIn(ADMIN);
  const id = "TEST-RLS-EXPIRE";
  try {
    // ใบเดิมที่ส่งแล้วและเลยกำหนด — สร้างผ่านแอปไม่ได้แล้ว (ด่าน 3) จึงวางที่ฐานตรง ๆ (ข้อนี้วัดสิทธิ์สั่งปิดใบหมดอายุ)
    วางใบเดิมที่ฐาน([{ id, dealer_code: "RYG", customer: "เทสต์อัตโนมัติ", status: "sent_to_client", expiry: "2026-01-01", date: "2025-12-01" }]);

    // HQ เรียกได้แต่ไม่มีสิทธิ์เขียนงานขาย → ต้องไม่ปิดใบของใครเลย
    //
    // จดสถานะไว้ "ทันทีก่อน" ให้ HQ เรียก แล้วเทียบว่าไม่เปลี่ยน — ห้ามล็อกค่าไว้เป็น sent_to_client ตายตัว
    //   เพราะแอปฝั่งดีลเลอร์สั่งปิดใบหมดอายุของสาขาตัวเองอัตโนมัติทุกครั้งที่เปิดแอป (expireOverdue ใน SalesContext)
    //   ตอนรันชุดเต็ม สเปกอื่นที่ล็อกอินเป็น RYG จะไปปิดใบทดสอบใบนี้ให้เอง = ถูกต้องตามระบบ ไม่ใช่ HQ เป็นคนปิด
    //   สิ่งที่เทสต์นี้ต้องพิสูจน์คือ "HQ ไม่ได้เปลี่ยนอะไร" เท่านั้น
    const before = (await ryg.from("quotations").select("status").eq("id", id)).data?.[0]?.status;
    const byHQ = await hq.rpc("expire_quotations", { p_as_of: "2026-06-30" });
    expect(byHQ.error).toBeNull();
    expect(Number(byHQ.data), "HQ ต้องปิดใบของดีลเลอร์ไม่ได้").toBe(0);
    expect((await ryg.from("quotations").select("status").eq("id", id)).data?.[0]?.status,
      "HQ ต้องไม่เปลี่ยนสถานะใบของดีลเลอร์").toBe(before);

    // สาขาเจ้าของเรียกเอง → ใบของตัวเองต้องถูกปิด
    const byDealer = await ryg.rpc("expire_quotations", { p_as_of: "2026-06-30" });
    expect(byDealer.error).toBeNull();
    expect((await ryg.from("quotations").select("status").eq("id", id)).data?.[0]?.status,
      "ใบที่เลยกำหนดต้องกลายเป็นหมดอายุ").toBe("expired");
  } finally {
    // ใบที่ส่งแล้ว/หมดอายุลบด้วยกุญแจไม่ได้แล้ว (ใบ 0228) — ล้างที่ฐานทดสอบตรง ๆ ไม่งั้นค้างแล้วรอบหน้าวางใบเลขเดิมไม่ได้
    ลบใบทดสอบที่ฐาน(`id = '${id}'`);
  }
});

test("[hq→dealer] เหตุผลปิดการขายไม่สำเร็จที่ HQ ตั้ง ไปถึงดีลเลอร์จริง (0021)", async () => {
  const hq = await signIn(ADMIN);
  const dealer = await signIn(RYG);
  const before = (await hq.from("hq_sales_journey").select("lost").eq("id", 1)).data?.[0]?.lost as string[];
  expect(before, "ต้องมีแถวตั้งค่าอยู่แล้ว (0021 seed ให้)").toBeTruthy();

  const probe = [...before, "เทสต์อัตโนมัติ-ห้ามค้าง"];
  try {
    // ดีลเลอร์แก้เองไม่ได้
    const blocked = await dealer.from("hq_sales_journey").update({ lost: probe }).eq("id", 1).select();
    expect(wasBlocked(blocked), "ดีลเลอร์ต้องแก้รายการเหตุผลไม่ได้").toBe(true);

    // HQ แก้ได้ แล้วดีลเลอร์ต้องอ่านเห็นค่าใหม่ (คนละ session — พิสูจน์ว่าไม่ได้ผ่าน localStorage)
    const saved = await hq.from("hq_sales_journey").update({ lost: probe }).eq("id", 1).select();
    expect(saved.error).toBeNull();
    const seen = (await dealer.from("hq_sales_journey").select("lost").eq("id", 1)).data?.[0]?.lost as string[];
    expect(seen, "ดีลเลอร์ต้องเห็นรายการที่ HQ เพิ่งตั้ง").toEqual(probe);
  } finally {
    await hq.from("hq_sales_journey").update({ lost: before }).eq("id", 1);
  }
});

test("[multi-tenant] สองสาขาสร้างลูกค้าเป้าหมาย/ใบเสนอราคาเลขเดียวกันได้ (0022)", async () => {
  const ryg = await signIn(RYG);
  const cnx = await signIn(CNX);
  // เลขที่แอปออกให้ "ลูกค้าเป้าหมายแรก" ของทุกสาขาเหมือนกัน เพราะนับจากลูกค้าเป้าหมายที่ตัวเองเห็น (RLS กรองรายสาขา)
  // ⚠️ ห้ามใช้เลขที่แอปออกให้จริง — "#L-40322" / "Q-{สาขา}-{ปี}-0001" คือเลขใบแรกเมื่อตารางว่าง
  //    เทสต์ func-* สร้างลูกค้าเป้าหมาย/ใบผ่านหน้าจอด้วย worker คนละตัวในเวลาเดียวกัน แล้วได้เลขชุดเดียวกันพอดี
  //    → ชน leads_pkey แบบสุ่ม · รันเดี่ยวผ่าน รันรวมพัง = เทสต์ที่เชื่อผลไม่ได้
  //    ประเด็นของเทสต์นี้คือ "สองสาขาใช้เลขเดียวกันได้" ตัวเลขเป็นอะไรก็ได้ ขอแค่ทั้งคู่ใช้ตัวเดียวกัน
  //    จึงใช้รูปแบบที่ตัวออกเลขของแอปไม่มีทางสร้างได้ (มีตัวอักษรตรงส่วนที่แอปใช้ตัวเลขล้วน)
  //
  //    และต้องไม่มีคำว่า ZZTEST อยู่ในเลขด้วย — เป็นแท็กที่ funcHelpers.cleanup() ใช้กวาดข้อมูล
  //    (`leads.delete().like("id", "%ZZTEST%")`) เทสต์ชุด func-* จะลบแถวของเทสต์นี้ทิ้งกลางคัน
  const LID = "#L-RLSPAIR";
  const QID = "Q-RLSPAIR-01";
  try {
    const a = await ryg.from("leads").insert({ phone: "081-999-0101", province: "ระยอง", id: LID, dealer_code: "RYG", company: "ทดสอบ RYG", status: "WAITING" }).select();
    const b = await cnx.from("leads").insert({ phone: "081-999-0101", province: "เชียงใหม่", id: LID, dealer_code: "CNX", company: "ทดสอบ CNX", status: "WAITING" }).select();
    expect(a.error, `RYG สร้างลูกค้าเป้าหมายไม่ได้: ${JSON.stringify(a.error)}`).toBeNull();
    expect(b.error, `CNX สร้างลูกค้าเป้าหมายเลขเดียวกันไม่ได้ = ระบบใช้หลายสาขาไม่ได้: ${JSON.stringify(b.error)}`).toBeNull();

    // ต่างสาขาต่างเห็นของตัวเอง ไม่ปนกัน
    expect(((await ryg.from("leads").select("company").eq("id", LID)).data ?? [])[0]?.company).toBe("ทดสอบ RYG");
    expect(((await cnx.from("leads").select("company").eq("id", LID)).data ?? [])[0]?.company).toBe("ทดสอบ CNX");

    // เลขใบซ้ำข้ามสาขา: วัดที่คีย์ของตาราง (dealer_code, id) — ใบเดิมสร้างผ่านแอปไม่ได้แล้ว (ด่าน 3) จึงวางที่ฐานตรง ๆ
    วางใบเดิมที่ฐาน([{ id: QID, dealer_code: "RYG", customer: "ทดสอบ RYG", status: "draft" }, { id: QID, dealer_code: "CNX", customer: "ทดสอบ CNX", status: "draft" }]);
    expect(((await ryg.from("quotations").select("customer").eq("id", QID)).data ?? []).map(r => r.customer), "RYG เห็นใบของตัวเองเท่านั้น").toEqual(["ทดสอบ RYG"]);
    expect(((await cnx.from("quotations").select("customer").eq("id", QID)).data ?? []).map(r => r.customer), "CNX เห็นใบของตัวเองเท่านั้น").toEqual(["ทดสอบ CNX"]);
  } finally {
    await ryg.from("leads").delete().eq("id", LID);
    await cnx.from("leads").delete().eq("id", LID);
    await ryg.from("quotations").delete().eq("id", QID);
    await cnx.from("quotations").delete().eq("id", QID);
  }
});

test("[rpc] คำนำหน้าเลขที่ที่ดีลเลอร์ตั้ง มีผลกับเลขที่ DB ออกให้ (A3)", async () => {
  const sb = await signIn(RYG);
  // ไม่ส่งคำนำหน้า → ใช้ค่า default ของฟังก์ชัน
  const def = await sb.rpc("next_quote_no", { p_dealer: "RYG" });
  expect(def.error).toBeNull();
  expect(String(def.data), "ค่า default ต้องขึ้นต้น Q-RYG- (รหัสสาขาฝังอยู่เสมอ — 0088)").toMatch(/^Q-RYG-\d{4}-\d{4}$/);

  // ส่งคำนำหน้าของดีลเลอร์ → ต้องใช้ตามนั้น (รหัสสาขา+ปียังต่อท้ายเสมอ ไม่ว่าจะกำหนด prefix เองหรือไม่)
  const mine = await sb.rpc("next_quote_no", { p_dealer: "RYG", p_prefix: "RYG-2569-" });
  expect(mine.error).toBeNull();
  expect(String(mine.data), "ต้องใช้คำนำหน้าที่ส่งไป").toMatch(/^RYG-2569-RYG-\d{4}-\d{4}$/);

  // ตัวนับต้องเดินหน้าต่อเนื่อง ไม่รีเซ็ตเพราะเปลี่ยนคำนำหน้า
  const a = parseInt(String(def.data).slice(-4), 10);
  const b = parseInt(String(mine.data).slice(-4), 10);
  expect(b - a, "เรียกสองครั้งติดกันต้องได้เลขต่างกัน 1").toBe(1);
});

test("[repo] HQ ลบดีลเลอร์แล้วหายจาก DB จริง ไม่ใช่แค่หายจากหน้าจอ (A4)", async () => {
  const sb = await signIn(ADMIN);
  const CODE = "ZTEST";
  const before = (await sb.from("dealers").select("code")).data ?? [];
  expect(before.length, "ต้องมีดีลเลอร์อยู่ก่อน").toBeGreaterThan(0);
  try {
    // HQ เพิ่มแถวดีลเลอร์ตรงไม่ได้แล้ว — ต้องมาจากผู้สนใจที่ตอบรับ + ชำระครบ (ฐานข้อมูลบังคับ 0208 · ด่าน 4)
    const ตรง = await sb.from("dealers").insert({
      code: CODE, name: "สาขาทดสอบอัตโนมัติ", province: "กรุงเทพมหานคร", region: "กลาง", status: "active",
    }).select("code");
    expect(ตรง.error?.message ?? "", "HQ เพิ่มดีลเลอร์ตรงโดยไม่ผูกผู้สนใจต้องถูกปฏิเสธ").toContain("conversion_needs_prospect");
    // เพิ่มดีลเลอร์ชั่วคราวด้วยสิทธิ์เซิร์ฟเวอร์ (ทางเดียวกับสคริปต์ลงทะเบียนสาขาตั้งต้น) — ข้อนี้ทดสอบการลบของ HQ
    const ins = await adminClient().from("dealers").insert({
      code: CODE, name: "สาขาทดสอบอัตโนมัติ", province: "กรุงเทพมหานคร", region: "กลาง", status: "active",
    }).select("code");
    expect(ins.error, `เพิ่มไม่ได้: ${JSON.stringify(ins.error)}`).toBeNull();
    expect(((await sb.from("dealers").select("code")).data ?? []).length).toBe(before.length + 1);

    // จำลองสิ่งที่ dealers.save ทำ: upsert ชุดที่ "ไม่มี ZTEST" แล้วลบส่วนเกิน
    const keep = before.map(d => `"${d.code}"`).join(",");
    const del = await sb.from("dealers").delete().not("code", "in", `(${keep})`).select("code");
    expect(del.error, `ลบไม่ได้: ${JSON.stringify(del.error)}`).toBeNull();

    const after = (await sb.from("dealers").select("code")).data ?? [];
    expect(after.length, "ดีลเลอร์ที่ถูกเอาออกต้องหายจาก DB").toBe(before.length);
    expect(after.some(d => d.code === CODE), "ZTEST ต้องไม่เหลือ").toBe(false);
  } finally {
    await sb.from("dealers").delete().eq("code", CODE);
  }
});

test("[schema] ตาราง dealers ไม่มีคอลัมน์ KPI เดโมแล้ว (0023)", async () => {
  const sb = await signIn(ADMIN);
  // 0091: SELECT ทั้งตารางถูก revoke จาก authenticated แล้ว เหลือแค่คอลัมน์ปลอดภัยที่ grant ไว้
  const { data, error } = await sb.from("dealers").select("code, name, province, region, status, created_at").limit(1);
  expect(error).toBeNull();
  const row = (data ?? [])[0];
  expect(row, "ต้องมีดีลเลอร์อย่างน้อย 1 สาขา").toBeTruthy();
  // ค่าพวกนี้เป็น "ผลลัพธ์ที่คำนวณได้" จากใบเสนอราคา/ลูกค้าเป้าหมาย — เก็บในตารางเมื่อไหร่ก็เพี้ยนจากของจริง
  for (const col of ["revenue_actual", "win_rate", "active_projects", "on_time_pct"]) {
    expect(Object.keys(row), `คอลัมน์ ${col} ต้องถูกลบไปแล้ว`).not.toContain(col);
  }
  // revenue_target ถูกดึงคอลัมน์ระดับสิทธิ์ออกจากตารางฐานแล้ว (0090) — อ่านได้เฉพาะผ่าน dealers_directory
  // เท่านั้น (มาสก์ตาม is_hq()/auth_dealer() ที่ view) แม้แต่ HQ เองก็อ่านจากตารางตรงไม่ได้อีกต่อไป
  expect(Object.keys(row), "revenue_target ต้องไม่อยู่ในตารางฐานอีกต่อไป (อ่านผ่าน dealers_directory เท่านั้น — 0090)").not.toContain("revenue_target");
});

test("[schema] dealers_directory: ดีลเลอร์เห็นแถวตัวเองแถวเดียว (0220) · HQ เห็นครบพร้อมเป้า (0077/0090)", async () => {
  const ryg = await signIn(RYG);
  const hq  = await signIn(ADMIN);

  const byDealer = await ryg.from("dealers_directory").select("code, revenue_target");
  expect(byDealer.error).toBeNull();
  const mine = byDealer.data?.find(d => d.code === "RYG");
  expect(mine?.revenue_target, "ดีลเลอร์ต้องเห็น revenue_target ของสาขาตัวเอง").not.toBeNull();
  // ใบ 0220 (บอสสั่ง 20 ต.ค. 69): เดิมเห็นแถวสาขาอื่นแต่เป้าเป็น null · ตอนนี้ไม่เห็นแถวสาขาอื่นเลย
  expect((byDealer.data ?? []).filter(d => d.code !== "RYG"), "ดีลเลอร์ต้องไม่เห็นแถวของสาขาอื่น").toEqual([]);

  const byHQ = await hq.from("dealers_directory").select("code, revenue_target");
  expect(byHQ.error).toBeNull();
  expect(byHQ.data?.every(d => d.revenue_target !== null), "HQ ต้องเห็น revenue_target ครบทุกสาขา").toBe(true);
});

test("[dealer-settings] หัวกระดาษ/เอกสารของสาขาเก็บที่ DB · สาขาอื่นแตะไม่ได้ (0024)", async () => {
  const ryg = await signIn(RYG);
  const cnx = await signIn(CNX);
  const hq  = await signIn(ADMIN);
  const issuer = { company: "บจ. ทดสอบอัตโนมัติ", address: "ที่อยู่ทดสอบ", phone: "000", taxId: "0000000000000" };
  // คืนแถวตั้งค่าเดิมของ RYG ตอนจบ — เดิมลบทิ้งทั้งแถว ข้อมูลบริษัทของ RYG (ข้อมูลตั้งต้น) หายกลางรอบ
  //   แล้วชุดอื่นที่ส่ง/พิมพ์ใบของ RYG ตกตาม (ใบ 0247 · รอบตรวจรวม 27 ต.ค. 69)
  const เดิม = (await ryg.from("dealer_settings").select("*").eq("dealer_code", "RYG").maybeSingle()).data;
  try {
    // สาขาบันทึกหัวกระดาษของตัวเองได้
    const up = await ryg.from("dealer_settings")
      .upsert({ dealer_code: "RYG", issuer, document: { quotePrefix: "RYG-" } }, { onConflict: "dealer_code" }).select();
    expect(up.error, `RYG บันทึกไม่ได้: ${JSON.stringify(up.error)}`).toBeNull();

    // อ่านกลับมาได้ครบ — นี่คือสิ่งที่ทำให้ "ย้ายเครื่องแล้วหัวกระดาษไม่หาย"
    const mine = (await ryg.from("dealer_settings").select("issuer,document").eq("dealer_code", "RYG")).data?.[0];
    expect((mine?.issuer as typeof issuer)?.company).toBe(issuer.company);
    expect((mine?.document as { quotePrefix: string })?.quotePrefix).toBe("RYG-");

    // สาขาอื่นแก้ไม่ได้ และมองไม่เห็นด้วย
    const hack = await cnx.from("dealer_settings").update({ issuer: { company: "โดนแก้" } }).eq("dealer_code", "RYG").select();
    expect(wasBlocked(hack), "CNX ต้องแก้หัวกระดาษของ RYG ไม่ได้").toBe(true);
    expect(((await cnx.from("dealer_settings").select("dealer_code").eq("dealer_code", "RYG")).data ?? []).length,
      "CNX ต้องมองไม่เห็นตั้งค่าของ RYG").toBe(0);

    // HQ อ่านได้ (ดูแลทั้งเครือ) แต่แก้ไม่ได้ — เป็นข้อมูลบริษัทของสาขา
    expect(((await hq.from("dealer_settings").select("dealer_code").eq("dealer_code", "RYG")).data ?? []).length).toBe(1);
    const byHQ = await hq.from("dealer_settings").update({ issuer: { company: "HQ แก้" } }).eq("dealer_code", "RYG").select();
    expect(wasBlocked(byHQ), "HQ ต้องแก้หัวกระดาษของดีลเลอร์ไม่ได้").toBe(true);
  } finally {
    if (เดิม) await ryg.from("dealer_settings").upsert(เดิม, { onConflict: "dealer_code" });
    else await ryg.from("dealer_settings").delete().eq("dealer_code", "RYG");
  }
});

test("[profile] ผู้ใช้แก้โปรไฟล์ตัวเองได้ แต่ยกระดับสิทธิ์/ย้ายสาขาตัวเองไม่ได้ (0026)", async () => {
  const sb = await signIn(RYG);
  const { data: sess } = await sb.auth.getSession();
  const uid = sess.session?.user?.id;
  expect(uid, "ต้องมี session").toBeTruthy();

  const before = (await sb.from("profiles").select("name,role,dealer_code").eq("id", uid!).maybeSingle()).data as
    { name: string; role: string; dealer_code: string } | null;
  expect(before, "ต้องมีโปรไฟล์ของผู้ใช้นี้").toBeTruthy();

  try {
    // แก้ข้อมูลส่วนตัวได้ — นี่คือสิ่งที่ทำให้ "ชื่อ/รูปไม่หายเมื่อย้ายเครื่อง"
    const ok = await sb.from("profiles").update({ name: "ทดสอบอัตโนมัติ", phone: "000" }).eq("id", uid!).select();
    expect(ok.error, `แก้โปรไฟล์ตัวเองไม่ได้: ${JSON.stringify(ok.error)}`).toBeNull();
    expect(ok.data?.length).toBe(1);

    // ยกระดับตัวเองเป็นผู้ดูแลระบบไม่ได้ (RLS จำกัดแถวได้ แต่จำกัดคอลัมน์ไม่ได้ → ต้องมี trigger กัน)
    const esc = await sb.from("profiles").update({ role: "SUPER_ADMIN" }).eq("id", uid!).select();
    expect(wasBlocked(esc), "ต้องยกระดับสิทธิ์ตัวเองไม่ได้").toBe(true);

    // ย้ายตัวเองไปสาขาอื่นไม่ได้ (ไม่งั้นเห็นข้อมูลสาขาอื่นทันทีเพราะ RLS อิง dealer_code)
    const move = await sb.from("profiles").update({ dealer_code: "CNX" }).eq("id", uid!).select();
    expect(wasBlocked(move), "ต้องย้ายสาขาตัวเองไม่ได้").toBe(true);

    // ของจริงต้องไม่เปลี่ยน
    const after = (await sb.from("profiles").select("role,dealer_code").eq("id", uid!).maybeSingle()).data as
      { role: string; dealer_code: string };
    expect(after.role).toBe(before!.role);
    expect(after.dealer_code).toBe(before!.dealer_code);
  } finally {
    await sb.from("profiles").update({ name: before!.name, phone: "" }).eq("id", uid!);
  }
});

test("[notes] โน้ตลูกค้าเก็บที่ DB · สาขาอื่นเห็นไม่ได้ · HQ อ่านได้แต่เขียนไม่ได้ (0028)", async () => {
  const ryg = await signIn(RYG);
  const cnx = await signIn(CNX);
  const hq  = await signIn(ADMIN);
  let id: number | null = null;
  try {
    // customer_notes_customer_fk (0089) บังคับให้ customer_id ต้องมีลูกค้าอยู่จริง — ดึงลูกค้าจริงของ RYG มาใช้
    const anyCustomer = await ryg.from("customers").select("id").eq("dealer_code", "RYG").limit(1).maybeSingle();
    expect(anyCustomer.error, `หาลูกค้า RYG ไม่ได้: ${JSON.stringify(anyCustomer.error)}`).toBeNull();
    const customerId = (anyCustomer.data as { id: number } | null)?.id;
    expect(customerId, "ต้องมีลูกค้าอย่างน้อย 1 รายของ RYG ไว้ใช้ทดสอบโน้ต").toBeTruthy();

    const ins = await ryg.from("customer_notes")
      .insert({ dealer_code: "RYG", customer_id: customerId, title: "โน้ตทดสอบ", content: "เนื้อหา", author: "อัตโนมัติ" })
      .select().single();
    expect(ins.error, `สร้างโน้ตไม่ได้: ${JSON.stringify(ins.error)}`).toBeNull();
    id = (ins.data as { id: number }).id;

    // สาขาอื่นมองไม่เห็นและแก้ไม่ได้
    expect(((await cnx.from("customer_notes").select("id").eq("id", id)).data ?? []).length,
      "CNX ต้องมองไม่เห็นโน้ตของ RYG").toBe(0);
    const hack = await cnx.from("customer_notes").update({ content: "โดนแก้" }).eq("id", id).select();
    expect(wasBlocked(hack), "CNX ต้องแก้โน้ตของ RYG ไม่ได้").toBe(true);

    // HQ อ่านได้ทั้งเครือ แต่เขียนงานขายไม่ได้ (นิยามเดียวกับลูกค้าเป้าหมาย/ใบเสนอราคา)
    expect(((await hq.from("customer_notes").select("id").eq("id", id)).data ?? []).length).toBe(1);
    const byHQ = await hq.from("customer_notes").update({ content: "HQ แก้" }).eq("id", id).select();
    expect(wasBlocked(byHQ), "HQ ต้องแก้โน้ตของดีลเลอร์ไม่ได้").toBe(true);
  } finally {
    if (id !== null) await ryg.from("customer_notes").delete().eq("id", id);
  }
});

test("[hq-company] ข้อมูลบริษัท HQ อ่านได้ทุกคน · เขียนเฉพาะผู้มีสิทธิ์ข้อมูลกลาง (0028)", async () => {
  const hq = await signIn(ADMIN);
  const dealer = await signIn(RYG);
  const before = (await hq.from("hq_company").select("name").eq("id", 1)).data?.[0] as { name: string };
  expect(before, "ต้องมีแถวข้อมูลบริษัท (0028 seed ให้)").toBeTruthy();
  try {
    // ดีลเลอร์อ่านได้ (อ้างอิงชื่อบริษัทแม่) แต่แก้ไม่ได้
    expect(((await dealer.from("hq_company").select("name").eq("id", 1)).data ?? []).length).toBe(1);
    const blocked = await dealer.from("hq_company").update({ name: "ดีลเลอร์แก้" }).eq("id", 1).select();
    expect(wasBlocked(blocked), "ดีลเลอร์ต้องแก้ข้อมูลบริษัท HQ ไม่ได้").toBe(true);

    const ok = await hq.from("hq_company").update({ name: "ทดสอบอัตโนมัติ" }).eq("id", 1).select();
    expect(ok.error).toBeNull();
    expect(ok.data?.length).toBe(1);
  } finally {
    await hq.from("hq_company").update({ name: before.name }).eq("id", 1);
  }
});
