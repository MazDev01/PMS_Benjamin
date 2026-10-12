// ── ชุดตรวจรับระบบ (Final Acceptance Check) ─────────────────────────────────────
//
// ต่างจากชุดเทสต์ Playwright ตรงที่ "ไม่สร้างข้อมูลจำลอง" — ตรวจข้อมูลจริงที่อยู่ในระบบ ณ ตอนนี้
// เทสต์ตอบว่า "โค้ดทำงานถูกไหม" · ตัวนี้ตอบว่า "ข้อมูลที่ลูกค้าใช้งานอยู่ตอนนี้ถูกต้องไหม"
// ทั้งสองอย่างจำเป็นก่อนเซ็นรับ — ระบบที่โค้ดถูกแต่ข้อมูลเพี้ยนอยู่แล้ว ก็ยังใช้ตัดสินใจไม่ได้
//
// รัน: node scripts/acceptance-check.mjs
// อ่านคีย์ service_role — ต้องรันบนเครื่องผู้ดูแลเท่านั้น
//
// ⚠️ ตรวจรับระบบต้องตรวจ "ฐานจริง" — apps/hq/.env.local ชี้ฐานทดสอบตั้งแต่แยกฐานข้อมูล (11 ส.ค. 69)
//    (จะตรวจฐานทดสอบก็ได้ถ้าตั้งใจ — ใส่ --test)
import { createClient } from "@supabase/supabase-js";
import { loadTarget } from "./lib/targetEnv.mjs";

const target = loadTarget({ allowTest: true });
const URL_ = target.url, SRV = target.serviceKey, ANON = target.anonKey;
if (!ANON) { console.error("ไม่พบ NEXT_PUBLIC_SUPABASE_ANON_KEY ของฐานที่เลือก"); process.exit(2); }
const db = createClient(URL_, SRV, { auth: { persistSession: false } });

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} · ${name}${detail ? " — " + detail : ""}`); };

// ข้อมูลทดสอบที่ค้างอยู่ต้องไม่ถูกนับเป็นข้อมูลจริง (ป้าย ZZTEST/ZZLOAD)
const isTestName = (s) => /ZZTEST|ZZLOAD/i.test(String(s ?? ""));

console.log("\n=== 1. ข้อมูลข้ามสาขา ===");
{
  const { data: quotes } = await db.from("quotations").select("id, dealer_code, customer_id");
  const { data: custs } = await db.from("customers").select("id, dealer_code, company, total_value");
  const custKey = new Set((custs ?? []).map(c => `${c.dealer_code}|${c.id}`));
  const orphan = (quotes ?? []).filter(q => q.customer_id && !custKey.has(`${q.dealer_code}|${q.customer_id}`));
  check("ใบเสนอราคาทุกใบผูกกับลูกค้าของ 'สาขาตัวเอง' เท่านั้น",
    orphan.length === 0, orphan.length ? `พบ ${orphan.length} ใบที่ชี้ไปลูกค้าที่ไม่ใช่ของสาขานั้น: ${orphan.slice(0,3).map(o=>o.id).join(", ")}` : `ตรวจ ${quotes?.length ?? 0} ใบ`);

  const { data: leads } = await db.from("leads").select("id, dealer_code, customer_id");
  const leadOrphan = (leads ?? []).filter(l => l.customer_id && !custKey.has(`${l.dealer_code}|${l.customer_id}`));
  check("ลูกค้าเป้าหมายทุกรายผูกกับลูกค้าของสาขาตัวเองเท่านั้น",
    leadOrphan.length === 0, leadOrphan.length ? `พบ ${leadOrphan.length} รายการ` : `ตรวจ ${leads?.length ?? 0} รายการ`);
}

console.log("\n=== 2. ตัวเลขเงิน ===");
{
  const { data: custs } = await db.from("customers").select("id, dealer_code, company, total_value");
  const { data: quotes } = await db.from("quotations").select("dealer_code, customer_id, total_value, status");
  const wonByCust = new Map();
  for (const q of quotes ?? []) {
    if (q.status !== "won" || !q.customer_id) continue;
    const k = `${q.dealer_code}|${q.customer_id}`;
    wonByCust.set(k, (wonByCust.get(k) ?? 0) + Number(q.total_value ?? 0));
  }
  const mismatch = (custs ?? []).filter(c => {
    const expected = wonByCust.get(`${c.dealer_code}|${c.id}`) ?? 0;
    return Math.round(Number(c.total_value ?? 0)) !== Math.round(expected);
  });
  check("ยอดสะสมของลูกค้า = ผลรวมใบเสนอราคาที่ปิดสำเร็จ",
    mismatch.length === 0,
    mismatch.length
      ? `ไม่ตรง ${mismatch.length} ราย เช่น ${mismatch.slice(0,3).map(c => `${c.dealer_code}/${c.company}: จอ=${c.total_value} ควรเป็น=${wonByCust.get(`${c.dealer_code}|${c.id}`) ?? 0}`).join(" · ")}`
      : `ตรวจ ${custs?.length ?? 0} ราย`);

  const negC = (custs ?? []).filter(c => Number(c.total_value ?? 0) < 0);
  const negQ = (quotes ?? []).filter(q => Number(q.total_value ?? 0) < 0);
  check("ไม่มียอดเงินติดลบในระบบ", negC.length === 0 && negQ.length === 0,
    `ลูกค้า ${negC.length} ราย · ใบเสนอราคา ${negQ.length} ใบ`);

  const { data: dealers } = await db.from("dealers").select("code, name, revenue_target");
  const negT = (dealers ?? []).filter(d => Number(d.revenue_target ?? 0) < 0);
  check("ไม่มีเป้ายอดขายติดลบ", negT.length === 0,
    negT.length ? negT.map(d => `${d.code}=${d.revenue_target}`).join(", ") : `ตรวจ ${dealers?.length ?? 0} สาขา`);

  const zeroQ = (quotes ?? []).filter(q => Number(q.total_value ?? 0) === 0);
  check("ไม่มีใบเสนอราคายอด ฿0 ค้างในระบบ", zeroQ.length === 0,
    zeroQ.length ? `พบ ${zeroQ.length} ใบ (ออกไว้ก่อนเพิ่มการกัน)` : "");
}

console.log("\n=== 3. บัญชีและสิทธิ์ ===");
{
  const { data: dealers } = await db.from("dealers").select("code, name");
  const { data: profs } = await db.from("profiles").select("id, dealer_code, role, status");
  const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
  const profById = new Map((profs ?? []).map(p => [p.id, p]));

  const orphanAuth = users.users.filter(u => !profById.has(u.id));
  check("ไม่มีบัญชีเข้าระบบที่ไม่ผูกกับใครเลย", orphanAuth.length === 0,
    orphanAuth.length ? orphanAuth.map(u => u.email).join(", ") : `ตรวจ ${users.users.length} บัญชี`);

  const bad = [];
  for (const d of dealers ?? []) {
    const n = (profs ?? []).filter(p => p.dealer_code === d.code).length;
    if (n !== 1) bad.push(`${d.code} มี ${n} บัญชี`);
  }
  check("ทุกสาขามีบัญชีเข้าระบบ 1 บัญชีพอดี", bad.length === 0, bad.join(" · ") || `ตรวจ ${dealers?.length ?? 0} สาขา`);

  const inactive = (profs ?? []).filter(p => p.status !== "active");
  check("ไม่มีบัญชีที่สถานะค้างผิดปกติ", inactive.length === 0,
    inactive.length ? inactive.map(p => `${p.dealer_code || p.role}=${p.status}`).join(", ") : "");
}

console.log("\n=== 4. ความปลอดภัย: คนนอกที่ยังไม่ล็อกอิน ===");
{
  const tables = ["dealers", "customers", "leads", "quotations", "profiles", "dealer_login_secrets", "audit_log", "files"];
  const leaked = [];
  for (const t of tables) {
    const r = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: ANON } });
    if (r.ok) {
      const rows = await r.json().catch(() => []);
      if (Array.isArray(rows) && rows.length > 0) leaked.push(t);
    }
  }
  check("คนไม่ล็อกอินอ่านข้อมูลจากตารางหลักไม่ได้เลย", leaked.length === 0,
    leaked.length ? `รั่ว: ${leaked.join(", ")}` : `ตรวจ ${tables.length} ตาราง`);

  const v = await fetch(`${URL_}/rest/v1/dealers_directory?select=*&limit=1`, { headers: { apikey: ANON } });
  const vRows = v.ok ? await v.json().catch(() => []) : [];
  check("ทะเบียนดีลเลอร์ไม่เปิดให้คนนอกดึงดู", !(Array.isArray(vRows) && vRows.length > 0),
    v.ok && vRows.length ? "ยังดึงได้" : `ตอบกลับ ${v.status}`);
}

console.log("\n=== 5. ข้อมูลทดสอบที่ค้างในระบบจริง ===");
{
  const { data: custs } = await db.from("customers").select("company");
  const { data: leads } = await db.from("leads").select("company");
  const { data: quotes } = await db.from("quotations").select("customer");
  const { data: dealers } = await db.from("dealers").select("code, name");
  const n = (arr, k) => (arr ?? []).filter(x => isTestName(x[k])).length;
  const total = n(custs, "company") + n(leads, "company") + n(quotes, "customer") + n(dealers, "name");
  check("ไม่มีข้อมูลทดสอบค้างปนกับข้อมูลจริง", total === 0,
    total ? `ลูกค้า ${n(custs,"company")} · ลีด ${n(leads,"company")} · ใบเสนอราคา ${n(quotes,"customer")} · สาขา ${n(dealers,"name")}` : "");
}

const failed = results.filter(r => !r.ok);
console.log(`\n════ สรุป: ผ่าน ${results.length - failed.length}/${results.length} ข้อ ════`);
if (failed.length) { console.log("ข้อที่ไม่ผ่าน:"); for (const f of failed) console.log(`  • ${f.name} — ${f.detail}`); }
process.exit(failed.length ? 1 : 0);
