import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON, RYG, CNX, skipReason, type Account } from "./supabaseEnv";

// ── Flow ใหม่ ระยะ 2 · กฎของลูกค้าเป้าหมายต้องบังคับที่ฐานข้อมูล (ใบ 0186) ─────────────────────
//
// เล่นบท "ดีลเลอร์ที่ล็อกอินได้ แล้วสั่งงานเข้าฐานข้อมูลตรง ๆ" ด้วยใบผ่านจริงของสาขา (ไม่ผ่านหน้าจอ)
// ถ้ากฎอยู่แค่ในฟอร์ม คำสั่งพวกนี้จะสำเร็จหมด — ต้องถูกฐานข้อมูลปฏิเสธเอง
//
//   · รายใหม่ไม่มีเบอร์โทร / ไม่มีจังหวัด → ปฏิเสธ
//   · ชื่อ + เบอร์ซ้ำกับรายที่เปิดอยู่ของสาขาเดียวกัน → ปฏิเสธ
//   · ข้อยกเว้น "งานขายของลูกค้าเดิม" ใช้ได้เฉพาะ customer_id ที่เป็นลูกค้าจริงของสาขาเดียวกัน
//     (ใส่เลขมั่ว หรือเลขลูกค้าของสาขาอื่น เพื่อเลี่ยงการบังคับเบอร์โทร ต้องไม่ผ่าน)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");

const TAG = "ZZTEST-FLOWLEAD";
let ryg: SupabaseClient;

async function signIn(who: Account): Promise<SupabaseClient> {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.signInWithPassword(who);
  if (error) throw new Error(`ล็อกอิน ${who.email} ไม่ผ่าน: ${error.message}`);
  return sb;
}

let ลำดับ = 0;
/** แถวลูกค้าเป้าหมายครบช่อง — แต่ละข้อทับเฉพาะช่องที่ต้องการทดสอบ */
function ราย(ทับ: Record<string, unknown> = {}) {
  const n = 870_000_000 + Math.floor(Math.random() * 9_000_000) + ++ลำดับ;
  return {
    id: `${TAG}-${n}`, num_id: n, dealer_code: "RYG", name: `${TAG}-${n}`, company: `${TAG}-${n}`,
    contact: "ผู้ทดสอบ", phone: "081-555-0199", province: "ระยอง", status: "WAITING", ...ทับ,
  };
}

test.beforeAll(async () => { ryg = await signIn(RYG); });
test.afterAll(async () => {
  await ryg.from("leads").delete().like("company", `${TAG}%`);
  await ryg.auth.signOut({ scope: "local" });
});

test("[กฎที่ DB] ลูกค้าเป้าหมายใหม่ไม่มีเบอร์โทร → ถูกปฏิเสธ", async () => {
  for (const phone of ["", "   ", "-", "ไม่มี"]) {
    const { error } = await ryg.from("leads").insert(ราย({ phone }));
    expect(error?.message ?? "", `เบอร์ "${phone}" ต้องถูกปฏิเสธ`).toContain("lead_phone_required");
  }
});

test("[กฎที่ DB] ลูกค้าเป้าหมายใหม่ไม่มีจังหวัด → ถูกปฏิเสธ", async () => {
  for (const province of ["", "  "]) {
    const { error } = await ryg.from("leads").insert(ราย({ province }));
    expect(error?.message ?? "", `จังหวัด "${province}" ต้องถูกปฏิเสธ`).toContain("lead_province_required");
  }
});

test("[กฎที่ DB] ข้อมูลครบ → สร้างได้ · ชื่อ + เบอร์ซ้ำกับรายที่เปิดอยู่ → ถูกปฏิเสธ", async () => {
  const แรก = ราย();
  expect((await ryg.from("leads").insert(แรก)).error, "รายแรกข้อมูลครบต้องสร้างได้").toBeNull();
  // ต่างกันแค่ช่องว่างในชื่อและขีดในเบอร์ = รายเดียวกัน
  const ซ้ำ = ราย({ company: `  ${แรก.company} `, phone: "0815550199" });
  expect((await ryg.from("leads").insert(ซ้ำ)).error?.message ?? "", "รายซ้ำต้องถูกปฏิเสธ").toContain("lead_duplicate");
  // เบอร์ต่าง = คนละราย
  expect((await ryg.from("leads").insert(ราย({ company: แรก.company, phone: "081-555-0200" }))).error,
    "ชื่อเดียวกันแต่เบอร์ต่างต้องสร้างได้").toBeNull();
});

test("[กฎที่ DB] อ้าง customer_id ที่ไม่มีอยู่ เพื่อเลี่ยงการบังคับเบอร์โทร → ถูกปฏิเสธ", async () => {
  const { error } = await ryg.from("leads").insert(ราย({ phone: "", province: "", customer_id: 2_000_000_001 }));
  expect(error, "ต้องถูกปฏิเสธ").not.toBeNull();
  expect(error!.message, "ต้องถูกปฏิเสธเพราะไม่ใช่ลูกค้าจริงของสาขา").toContain("leads_customer_fk");
});

test("[กฎที่ DB] อ้าง customer_id ของดีลเลอร์อื่น เพื่อเลี่ยงการบังคับเบอร์โทร → ถูกปฏิเสธ", async () => {
  const cnx = await signIn(CNX);
  try {
    // หาลูกค้าของ CNX ที่เลขไม่ตรงกับลูกค้าคนไหนของ RYG (เลขลูกค้านับแยกรายสาขา จึงซ้ำกันข้ามสาขาได้)
    const { data: ของCNX } = await cnx.from("customers").select("id").order("id", { ascending: false }).limit(50);
    const { data: ของRYG } = await ryg.from("customers").select("id");
    const เลขRYG = new Set((ของRYG ?? []).map(c => c.id));
    const เป้า = (ของCNX ?? []).find(c => !เลขRYG.has(c.id));
    test.skip(!เป้า, "ฐานทดสอบไม่มีลูกค้าของ CNX ที่เลขไม่ชนกับ RYG");
    const { error } = await ryg.from("leads").insert(ราย({ phone: "", province: "", customer_id: เป้า!.id }));
    expect(error, "ต้องถูกปฏิเสธ").not.toBeNull();
    expect(error!.message, "ลูกค้าของสาขาอื่นใช้เป็นข้อยกเว้นไม่ได้").toContain("leads_customer_fk");
  } finally {
    await cnx.auth.signOut({ scope: "local" });
  }
});

test("[กฎที่ DB] งานขายใหม่ของลูกค้าจริงของสาขาเดียวกัน ที่ไม่มีเบอร์โทรในระบบ → สร้างได้", async () => {
  const { data: ลูกค้า } = await ryg.from("customers").select("id").limit(1);
  test.skip(!ลูกค้า?.length, "ฐานทดสอบไม่มีลูกค้าของ RYG");
  const { error } = await ryg.from("leads").insert(ราย({ phone: "", province: "", customer_id: ลูกค้า![0].id }));
  expect(error, `ลูกค้าเดิมของสาขาเองต้องเพิ่มงานขายได้ (${error?.message ?? ""})`).toBeNull();
});
