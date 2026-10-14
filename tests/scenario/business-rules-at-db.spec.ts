import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON, RYG, skipReason, type Account } from "./supabaseEnv";
import { วางใบเดิมที่ฐาน } from "./legacyQuotes";

// ── ระยะ 2 · กฎธุรกิจต้องบังคับที่ฐานข้อมูล ไม่ใช่แค่ที่หน้าจอ ─────────────────────
//
// ชุดนี้เล่นบท "คนที่ล็อกอินได้ แล้วเปิด Console สั่งงานเข้าฐานข้อมูลตรง ๆ" — ข้ามหน้าเว็บทั้งหมด
// ถ้ากฎอยู่แค่ในหน้าเว็บ คำสั่งพวกนี้จะสำเร็จหมด ซึ่งคือสิ่งที่ระยะ 2 ต้องปิด
//
// ⚠️ ต้องทดสอบแบบนี้เท่านั้น — กดผ่านหน้าจอพิสูจน์ได้แค่ "ปุ่มไม่โผล่/ขึ้นข้อความเตือน"
//    ซึ่งไม่ได้แปลว่าฐานข้อมูลกันจริง (เคยเป็นแบบนั้นมาก่อน: หน้าจอกัน แต่ยิงตรงผ่านฉลุย)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");

const TAG = "ZZTEST-RULES";
let ryg: SupabaseClient;

async function signIn(who: Account): Promise<SupabaseClient> {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.signInWithPassword(who);
  if (error) throw new Error(`ล็อกอิน ${who.email} ไม่ผ่าน: ${error.message}`);
  return sb;
}

/** เก็บกวาดของที่ชุดนี้สร้าง — ต้องลบตามลำดับ FK (ใบ → ดีล → ลูกค้า) */
async function purge() {
  await ryg.from("quotations").delete().like("customer", `%${TAG}%`);
  await ryg.from("leads").delete().like("company", `%${TAG}%`);
  await ryg.from("customers").delete().like("company", `%${TAG}%`);
}

test.beforeAll(async () => { ryg = await signIn(RYG); await purge(); });
test.afterAll(async () => { await purge(); });

/** ลูกค้า + ดีล (+ ใบ ถ้าขอ) หนึ่งชุดสำหรับเทสต์หนึ่งข้อ */
async function makeSet(label: string, leadStatus: string, withQuote: boolean) {
  const company = `${TAG} ${label}`;
  const cid = Number((await ryg.rpc("next_entity_id", { p_dealer: "RYG", p_entity: "customers" })).data);
  const ins = await ryg.from("customers").insert({ id: cid, dealer_code: "RYG", company, name: company }).select();
  expect(ins.error, `สร้างลูกค้าทดสอบไม่ได้: ${JSON.stringify(ins.error)}`).toBeNull();

  const numId = Number((await ryg.rpc("next_entity_id", { p_dealer: "RYG", p_entity: "leads" })).data);
  const leadId = `${TAG}-L-${numId}`;
  const insLead = await ryg.from("leads").insert({ phone: "081-999-0101", province: "ระยอง",
    id: leadId, dealer_code: "RYG", num_id: numId, company, status: leadStatus, customer_id: cid,
  }).select();
  expect(insLead.error, `สร้างดีลทดสอบไม่ได้: ${JSON.stringify(insLead.error)}`).toBeNull();

  let quoteId: string | null = null;
  if (withQuote) {
    quoteId = `${TAG}-Q-${numId}`;
    // ใบที่ไม่มีใบ HQ สร้างใหม่ไม่ได้แล้ว (ด่าน 3 · 0201) — กฎที่วัดที่นี่เป็นกฎการลบ จึงวางใบเดิมที่ฐานตรง ๆ
    วางใบเดิมที่ฐาน([{ id: quoteId, dealer_code: "RYG", customer: company, customer_id: cid, deal_id: numId,
      status: "draft", total_value: 1000 }]);
  }
  return { cid, numId, leadId, quoteId, company };
}

// ── กฎที่ 1: ยังมีดีลที่ขายอยู่ = ลบลูกค้าไม่ได้ ─────────────────────────────────
test("[กฎที่ DB] ยังมีดีลที่ขายอยู่ → ลบลูกค้าไม่ได้ แม้สั่งตรงเข้าฐานข้อมูล", async () => {
  const { cid } = await makeSet("ดีลยังขายอยู่", "QUOTED", false);

  const viaRpc = await ryg.rpc("delete_customer_cascade", { p_customer_id: cid });
  expect(viaRpc.error, "ต้องถูกปฏิเสธ ไม่ใช่ลบสำเร็จ").not.toBeNull();
  expect(String(viaRpc.error?.message), "ข้อความต้องบอกเหตุผลให้คนอ่านรู้เรื่อง").toContain("ดีลที่ขายอยู่");

  // ยิงลบตรงข้ามหน้าเว็บก็ต้องไม่ผ่าน (FK restrict) — ไม่ใช่ผ่านแล้วเหลือดีลกำพร้า
  const direct = await ryg.from("customers").delete().eq("id", cid).eq("dealer_code", "RYG").select();
  expect(direct.error ?? (direct.data?.length ? new Error("ลบผ่าน") : null),
    "ลบตรงต้องถูกฐานข้อมูลปฏิเสธ").not.toBeNull();

  const still = await ryg.from("customers").select("id").eq("id", cid).eq("dealer_code", "RYG");
  expect(still.data?.length, "ลูกค้าต้องยังอยู่ครบ").toBe(1);
});

// ── กฎที่ 2: ดีลที่จบแล้ว = ประวัติของลูกค้า ลบไปพร้อมกันในคำสั่งเดียว ──────────────
test("[กฎที่ DB] ดีลที่ปิดการขายแล้ว → ลบลูกค้าได้ และประวัติหายไปพร้อมกันทั้งก้อน", async () => {
  const { cid, leadId, quoteId } = await makeSet("ดีลจบแล้ว", "PAID", true);

  const res = await ryg.rpc("delete_customer_cascade", { p_customer_id: cid });
  expect(res.error, `ต้องลบได้: ${JSON.stringify(res.error)}`).toBeNull();
  expect(Number((res.data as { quotations: number })?.quotations), "ต้องรายงานว่าลบใบไป 1 ใบ").toBe(1);
  expect(Number((res.data as { leads: number })?.leads), "ต้องรายงานว่าลบดีลไป 1 ดีล").toBe(1);

  // ต้องไม่เหลืออะไรกำพร้าเลยสักอย่าง
  expect((await ryg.from("customers").select("id").eq("id", cid).eq("dealer_code", "RYG")).data?.length, "ลูกค้าต้องหาย").toBe(0);
  expect((await ryg.from("leads").select("id").eq("id", leadId)).data?.length, "ดีลที่จบแล้วต้องหายตาม").toBe(0);
  expect((await ryg.from("quotations").select("id").eq("id", quoteId!)).data?.length, "ใบของดีลนั้นต้องหายตาม").toBe(0);
});

// ── กฎที่ 4: ยอดในใบ ต้องตรงกับรายการ BOQ ─────────────────────────────────────
// ยอดนี้ไหลต่อไปเป็นยอดขายของสาขาและยอดสะสมของลูกค้า · รายการ BOQ คือสิ่งที่ลูกค้าเห็นบนเอกสาร
// สองอย่างไม่ตรงกัน = เอกสารบอกราคาหนึ่ง ระบบรายงานอีกราคาหนึ่ง โดยไม่มีอะไรฟ้อง
test("[กฎที่ DB] แก้ยอดใบให้ต่างจากรายการ BOQ → ต้องถูกปฏิเสธ", async () => {
  const id = `${TAG}-Q-BOQ`;
  const items = [{ name: "ทดสอบ", qty: 2, unit: "งาน", unitPrice: 500 }];   // Σ = 1,000

  // ยอดพิมพ์เองได้เฉพาะใบเดิม (ใบจากใบ HQ ฐานคิดยอดเอง) — วางใบเดิมที่ฐานตรง ๆ แล้ววัดกฎตอนแก้
  วางใบเดิมที่ฐาน([{ id, dealer_code: "RYG", customer: `${TAG} ยอดตรง BOQ`, status: "draft", line_items: items, total_value: 1000 }]);

  // ปั่นยอดขึ้นโดยไม่แตะรายการ = สิ่งที่ต้องกัน
  const bump = await ryg.from("quotations").update({ total_value: 9_000_000 }).eq("id", id).eq("dealer_code", "RYG").select();
  expect(bump.error, "แก้ยอดให้ต่างจาก BOQ ต้องถูกปฏิเสธ").not.toBeNull();
  expect(String(bump.error?.message)).toContain("BOQ");

  const after = await ryg.from("quotations").select("total_value").eq("id", id).maybeSingle();
  expect(Number((after.data as { total_value: number } | null)?.total_value), "ยอดต้องยังเป็นของเดิม").toBe(1000);

  // แก้รายการแล้วยอดตามให้ตรง = ทำได้ตามปกติ (กฎต้องไม่เข้มจนใช้งานจริงไม่ได้)
  const okEdit = await ryg.from("quotations")
    .update({ line_items: [{ name: "ทดสอบ", qty: 3, unit: "งาน", unitPrice: 500 }], total_value: 1500 })
    .eq("id", id).eq("dealer_code", "RYG").select();
  expect(okEdit.error, `แก้ทั้งรายการและยอดพร้อมกันต้องผ่าน: ${JSON.stringify(okEdit.error)}`).toBeNull();

  await ryg.from("quotations").delete().eq("id", id).eq("dealer_code", "RYG");
});

// ── กฎที่ 3: ลบดีลที่ยังมีใบผูกอยู่ ต้องถูกปฏิเสธ ไม่ใช่ตัดสายใบเงียบ ๆ ──────────────
// เดิม FK เป็น on delete set null → สั่งลบตรง "สำเร็จ" แล้วใบกลายเป็นใบที่ไม่รู้ว่ามาจากดีลไหน
// ใบยังอยู่ในระบบ แต่สายสัมพันธ์ขาด = ข้อมูลเสียหายโดยไม่มีอะไรฟ้อง
test("[กฎที่ DB] ลบดีลที่ยังมีใบเสนอราคาผูกอยู่ → ต้องถูกปฏิเสธ ไม่ใช่ตัดสายใบทิ้ง", async () => {
  const { leadId, quoteId, numId } = await makeSet("ดีลมีใบผูก", "QUOTED", true);

  const del = await ryg.from("leads").delete().eq("id", leadId).eq("dealer_code", "RYG").select();
  expect(del.error ?? (del.data?.length ? new Error("ลบผ่าน") : null),
    "ลบดีลที่ยังมีใบผูกอยู่ ต้องถูกฐานข้อมูลปฏิเสธ").not.toBeNull();

  const q = await ryg.from("quotations").select("deal_id").eq("id", quoteId!).maybeSingle();
  expect(Number((q.data as { deal_id: number } | null)?.deal_id),
    "ใบต้องยังผูกกับดีลเดิม ไม่ถูกตัดสายเงียบ ๆ").toBe(numId);
});
