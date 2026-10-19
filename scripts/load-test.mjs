// ── ทดสอบโหลด: ผู้ใช้จำนวนมากทำงานพร้อมกันจริง ─────────────────────────────────────
//
// ที่มา (ผลตรวจสอบระบบ 7 ส.ค. 69 · หัวข้อ "ยังไม่ได้ตรวจ"):
//   ชุดทดสอบเดิมจำลองได้สูงสุด 10 ดีลเลอร์ และวัดผ่านเบราว์เซอร์จริง 10 หน้าต่าง
//   ซึ่งชนเพดานของ "เครื่องที่ใช้ทดสอบ" ก่อนจะชนเพดานของระบบ → วัดผิดตัว
//
// ตัวนี้ยิงตรงเข้าฐานข้อมูลแทนการเปิดเบราว์เซอร์ จึงดันได้ถึง 50 คนพร้อมกันจริง
//   สิ่งที่ต้องการวัดคือ "ระบบหลังบ้านทนไหม" — เลขที่เอกสารซ้ำไหม ยอดเงินหายไหม คำสั่งล้มไหม
//   ไม่ใช่ "เบราว์เซอร์เปิดกี่หน้าต่างไหว" ซึ่งเป็นคนละเรื่องและไม่ใช่ข้อจำกัดของระบบจริง
//
// ⚠️ จงใจให้ผู้ใช้ทุกคนกระจุกอยู่แค่ 2 สาขา ไม่ใช่กระจาย 50 สาขา
//    เพราะจุดที่แตกหักจริงคือ "การแย่งกันออกเลขที่เอกสารของสาขาเดียวกัน" และ "การรวมยอดลูกค้า"
//    ถ้าแยกคนละสาขาจะไม่มีการแย่งกันเลย = ทดสอบแล้วผ่านโดยไม่ได้พิสูจน์อะไร
//
// รัน: node scripts/load-test.mjs [จำนวนคน]     (ค่าเริ่มต้น 50)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { ห้ามฐานจริง } from "./lib/targetEnv.mjs";

const N = Number(process.argv[2] ?? 50);
const TAG = "ZZLOADTEST";

// อ่านจาก apps/hq/.env.local = "ฐานทดสอบ" ตั้งแต่แยกฐานข้อมูล (11 ส.ค. 69) — ถูกต้องแล้ว
// ⛔ ห้ามเปลี่ยนไปชี้ฐานจริง: ตัวนี้สร้างดีลเลอร์ 10 ราย + ผู้ใช้ 50 คน แล้วเขียนข้อมูลรัว ๆ
//    และขยับตัวนับเลขใบเสนอราคา (quote_counters) — ตัวกันอยู่หลังอ่านค่าเชื่อมต่อ (19 ต.ค. 69)
const env = {};
for (const f of ["apps/hq/.env.local", "tests/.env.test"]) {
  try {
    for (const l of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch { /* ไม่มีไฟล์ */ }
}
ห้ามฐานจริง(env.NEXT_PUBLIC_SUPABASE_URL ?? "", "load-test.mjs");
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ล็อกอินครั้งเดียวต่อบัญชี แล้วให้ทุก "คน" ใช้สิทธิ์ร่วมกัน
// (ล็อกอิน 50 ครั้งพร้อมกันจะชนเพดานของระบบยืนยันตัวตนก่อน แล้วเราจะวัดผิดตัวอีก
//  — เจอมาแล้วตอนแก้ชุดทดสอบ 7 ส.ค. 69)
async function signIn(email, password) {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`ล็อกอิน ${email} ไม่ผ่าน: ${error.message}`);
  return sb;
}

function pct(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}

async function cleanup() {
  for (const t of ["customer_notes", "quotations", "leads", "customers"]) {
    await svc.from(t).delete().like(t === "quotations" ? "customer" : "company", `%${TAG}%`);
  }
  await svc.from("quotations").delete().like("id", `%${TAG}%`);
}

console.log(`── ทดสอบโหลด ${N} คนพร้อมกัน (กระจุกใน 2 สาขาเพื่อบังคับให้แย่งกันจริง) ──`);
await cleanup();

const dealers = [
  { code: "RYG", sb: await signIn(env.TEST_RYG_EMAIL, env.TEST_RYG_PASSWORD) },
  { code: "CNX", sb: await signIn(env.TEST_CNX_EMAIL, env.TEST_CNX_PASSWORD) },
];

// ── ขยับตัวนับเลขที่ใบให้พ้นใบที่มีอยู่แล้วก่อนเริ่ม (16 ก.ย. 69) ─────────────────
// ฐานทดสอบมีใบที่ใส่ตรง ๆ ตอนเตรียมข้อมูล โดยไม่ผ่าน create_quotation ตัวนับจึงตามหลังเลขจริง
//   → ยิงพร้อมกันแล้วได้ "duplicate key quotations_pkey" 23/50 ครั้ง ซึ่งเป็นสภาพของข้อมูลทดสอบ
//     ไม่ใช่การแย่งเลขกันของระบบ (ตัวนับใช้ UPDATE ... RETURNING แถวเดียว กันการแย่งกันอยู่แล้ว)
// ⚠️ ห้ามข้ามขั้นนี้ ไม่งั้นผลทดสอบจะฟ้องบั๊กที่ไม่มีจริง แล้วบังตาบั๊กที่มีจริง
async function ขยับตัวนับใบ(code) {
  const { data } = await svc.from("quotations").select("id").eq("dealer_code", code);
  const เลขสูงสุด = (data ?? []).reduce((m, q) => {
    const n = Number(String(q.id).match(/(\d+)$/)?.[1] ?? 0);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  const { data: cur } = await svc.from("quote_counters").select("next_no").eq("dealer_code", code).maybeSingle();
  if (Number(cur?.next_no ?? 0) > เลขสูงสุด) return;
  await svc.from("quote_counters").upsert({ dealer_code: code, next_no: เลขสูงสุด + 1 }, { onConflict: "dealer_code" });
  console.log(`  ปรับตัวนับใบของ ${code} เป็น ${เลขสูงสุด + 1} (มีใบถึงเลข ${เลขสูงสุด} อยู่แล้ว)`);
}
for (const d of dealers) await ขยับตัวนับใบ(d.code);

const lat = { lead: [], quote: [], won: [] };
const fails = [];

/** หนึ่ง "คน" = สร้างลีด → ออกใบเสนอราคา → ปิดการขาย (วงจรจริงที่ใช้กันทุกวัน) */
async function oneUser(i) {
  const d = dealers[i % dealers.length];
  const company = `${TAG}-${i}`;
  try {
    // สร้างลีด = ขอเลขที่ถัดไปของสาขา แล้ว insert — เส้นทางเดียวกับที่แอปใช้จริง
    // จุดที่แย่งกันคือ "การออกเลขที่" ซึ่งเป็นตัวนับต่อสาขา (50 คนใน 2 สาขา = แย่งกันจริง)
    let t = Date.now();
    const numId = await d.sb.rpc("next_entity_id", { p_dealer: d.code, p_entity: "leads" })
      .then(r => (r.error ? Promise.reject(new Error(`ออกเลขลีด: ${r.error.message}`)) : Number(r.data)));
    const leadId = `${d.code}-${TAG}-${numId}`;
    const insLead = await d.sb.from("leads").insert({
      id: leadId, dealer_code: d.code, num_id: numId, company, contact: "โหลดเทสต์",
      province: "ทดสอบ", status: "WAITING",
    });
    if (insLead.error) throw new Error(`สร้างลีด: ${insLead.error.message}`);
    lat.lead.push(Date.now() - t);
    const lead = leadId;

    t = Date.now();
    const q = await d.sb.rpc("create_quotation", {
      p_dealer: d.code, p_prefix: "Q-",
      p_payload: { customer: company, date: "2026-06-01", line_items: [{ name: "งานทดสอบ", qty: 1, unit: "งาน", unitPrice: 100000 }], total_value: 100000 },
    }).then(r => (r.error ? Promise.reject(new Error(`ออกใบ: ${r.error.message}`)) : r.data));
    lat.quote.push(Date.now() - t);
    const quote = Array.isArray(q) ? q[0] : q;

    // ปิดการขาย = แปลงลีดเป็นลูกค้าก่อน แล้วผูกใบเข้ากับลูกค้า แล้วค่อยเปลี่ยนสถานะ
    // (ฐานข้อมูลบังคับไว้ว่าใบที่ชนะต้องมีลูกค้าผูกอยู่เสมอ — quotations_won_requires_customer)
    // นี่คือจุดที่แย่งกันหนักที่สุด: สร้างลูกค้าพร้อมกัน + รวมยอดลูกค้าพร้อมกัน
    t = Date.now();
    const cust = await d.sb.rpc("upsert_customer_for_company", {
      p_dealer: d.code,
      p_payload: { name: company, company, province: "ทดสอบ", category: "โกดังสำเร็จรูป", status: "active", owner: "โหลดเทสต์", initials: "ZZ", color: "#003366" },
    }).then(r => (r.error ? Promise.reject(new Error(`สร้างลูกค้า: ${r.error.message}`)) : r.data));
    const custRow = Array.isArray(cust) ? cust[0] : cust;
    const link = await d.sb.from("quotations").update({ customer_id: custRow.id }).eq("id", quote.id).eq("dealer_code", d.code);
    if (link.error) throw new Error(`ผูกลูกค้ากับใบ: ${link.error.message}`);
    const r = await d.sb.rpc("set_quotation_status_reconciled", { p_quote_id: quote.id, p_status: "won" });
    if (r.error) throw new Error(`ปิดการขาย: ${r.error.message}`);
    lat.won.push(Date.now() - t);
    return { ok: true, dealer: d.code, quoteId: quote.id, leadId: lead };
  } catch (e) {
    fails.push(`คนที่ ${i} (${d.code}): ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false };
  }
}

const started = Date.now();
const results = await Promise.all(Array.from({ length: N }, (_, i) => oneUser(i)));
const elapsed = (Date.now() - started) / 1000;

const ok = results.filter(r => r.ok);
console.log(`\nเสร็จภายใน ${elapsed.toFixed(1)} วินาที · สำเร็จ ${ok.length}/${N} · ล้มเหลว ${fails.length}`);
console.log(`เวลาต่อคำสั่ง (มิลลิวินาที)  กลาง / ช้าสุด 5%`);
for (const [k, label] of [["lead", "สร้างลีด      "], ["quote", "ออกใบเสนอราคา"], ["won", "ปิดการขาย    "]]) {
  console.log(`  ${label}  ${String(pct(lat[k], 0.5)).padStart(5)} / ${String(pct(lat[k], 0.95)).padStart(5)}`);
}
if (fails.length) { console.log("\nรายการที่ล้มเหลว (สูงสุด 5):"); fails.slice(0, 5).forEach(f => console.log("  •", f)); }

// ── ตรวจความถูกต้องของข้อมูลหลังโหลด — สำคัญกว่าความเร็ว ──
console.log("\n── ตรวจความถูกต้องของข้อมูล ──");
let bad = 0;
for (const d of dealers) {
  const { data: qs } = await svc.from("quotations").select("id,customer,total_value,status").eq("dealer_code", d.code).like("customer", `${TAG}%`);
  const ids = (qs ?? []).map(q => q.id);
  const dup = ids.length - new Set(ids).size;
  console.log(`  ${d.code}: ใบเสนอราคา ${ids.length} ใบ · เลขที่ซ้ำ ${dup} ใบ`);
  if (dup > 0) bad++;

  // ยอดลูกค้าต้องเท่ากับผลรวมของใบที่ชนะ ไม่ขาดไม่เกิน (จุดที่ lost update เคยทำพัง)
  const { data: cs } = await svc.from("customers").select("id,company,total_value").eq("dealer_code", d.code).like("company", `${TAG}%`);
  let mismatch = 0;
  for (const c of cs ?? []) {
    const sum = (qs ?? []).filter(q => q.customer === c.company && q.status === "won").reduce((s, q) => s + Number(q.total_value || 0), 0);
    if (Number(c.total_value) !== sum) { mismatch++; if (mismatch <= 2) console.log(`     ⚠ ${c.company}: ยอดลูกค้า ${c.total_value} แต่ผลรวมใบที่ชนะ ${sum}`); }
  }
  console.log(`  ${d.code}: ลูกค้า ${cs?.length ?? 0} ราย · ยอดไม่ตรง ${mismatch} ราย`);
  if (mismatch > 0) bad++;
}

await cleanup();
console.log(`\n${bad === 0 && fails.length === 0 ? "✅ ผ่าน — ไม่มีเลขซ้ำ ไม่มียอดหาย ไม่มีคำสั่งล้ม" : "❌ ไม่ผ่าน — ดูรายละเอียดด้านบน"}`);
process.exit(bad === 0 && fails.length === 0 ? 0 : 1);
