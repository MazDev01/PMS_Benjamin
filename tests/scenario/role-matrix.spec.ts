import { test, expect } from "@playwright/test";
import { ถือแถวกลาง } from "./sharedRowLock";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ADMIN, SUPABASE_URL, SUPABASE_ANON, skipReason } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { HQ_ORIGIN } from "./funcHelpers";
import { สร้างสาขาของข้อ } from "./ownDealer";

// ── ตารางสิทธิ์: บทบาทฝั่งสำนักงานใหญ่ที่ยังไม่เคยถูกทดสอบด้วยบัญชีจริง ────────────
//
// ทำไมเพิ่งมี (ผลตรวจสอบระบบ 7 ส.ค. 69 · หัวข้อ "ยังไม่ได้ตรวจ"):
//   ระบบประกาศบทบาทไว้ 6 แบบ แต่ในฐานข้อมูลจริงมีแค่ 2 (SUPER_ADMIN + DEALER_ADMIN)
//   อีก 4 บทบาทจึงไม่เคยถูกยืนยันเลยว่า "สิทธิ์ที่ประกาศไว้ในโค้ด" ตรงกับ "สิ่งที่ DB ยอมให้ทำจริง"
//   ซึ่งเป็นจุดที่เคยพลาดมาแล้ว: แอปเปิดปุ่มให้กด แต่ DB ปฏิเสธ → ผู้ใช้นึกว่าบันทึกแล้ว (C1/C3)
//
// HQ บทบาทเดียว "สำนักงานใหญ่" (บอสสั่ง 5 พ.ย. 69 · ใบ 0282) — ทับขอบเขตเดิม (HQ_MANAGEMENT · HQ_STAFF ทดสอบแยกสิทธิ์)
//   ตอนนี้: บทบาทเดิมสร้าง/ตั้งไม่ได้ทุกทาง (API · ฐาน) · ผู้ใช้สำนักงานใหญ่ใหม่ทำได้ทุกอย่างของ HQ (ข้อเดิมของผู้บริหาร + API ที่เจ้าหน้าที่เคยถูกปฏิเสธ)
//   อดีตเจ้าหน้าที่ที่ถูกแปลงด้วยใบจริง: tests/tools/hq-single-role-migrate.test.mjs
//   ⚠️ DEALER_SALES และ DEALER_SITE ไม่ทดสอบ เพราะ "ตั้งใจให้ไม่มีบัญชีจริง" (ตัดสิน 7 ส.ค. 69)
//      ระบบบังคับหนึ่งสาขาหนึ่งบัญชีที่ฐานข้อมูล (0105) — สองบทบาทนี้เก็บไว้เป็นบันทึกเท่านั้น
//      พนักงานขายรายคนถูกบันทึกเป็น "ผู้รับผิดชอบ" ซึ่งเป็นชื่อไว้มอบหมายงาน ไม่ใช่บัญชีที่ล็อกอินได้
//      เทสต์ข้อสุดท้ายของไฟล์นี้ล็อกกฎนั้นไว้ — ถ้าวันหนึ่งถูกเปลี่ยน จะรู้ทันทีว่าหลุดจากที่ตกลงกัน
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const svc = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const NS = "ZZROLE";
const ACCOUNTS: Record<string, { email: string; password: string }> = {};
let adminTok = "";

async function hqToken(): Promise<string> {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword(ADMIN);
  if (error) throw new Error(`ล็อกอินผู้ดูแล HQ ไม่ผ่าน: ${error.message}`);
  return (await sb.auth.getSession()).data.session?.access_token ?? "";
}

/** ลบบัญชีทดสอบทิ้งให้เกลี้ยง — ทั้งโปรไฟล์และบัญชีเข้าระบบ */
async function purge() {
  const { data: profs } = await svc.from("profiles").select("id").like("name", `${NS}%`);
  for (const p of profs ?? []) {
    await svc.auth.admin.deleteUser(String(p.id)).catch(() => {});
    await svc.from("profiles").delete().eq("id", p.id);
  }
}

test.beforeAll(async () => {
  adminTok = await hqToken();
  await purge();
  // ผู้ใช้สำนักงานใหญ่ใหม่ — ไม่ส่งบทบาท (ฟอร์มไม่มีช่องเลือกบทบาทแล้ว · ใบ 0282)
  const res = await fetch(`${HQ_ORIGIN}/api/admin/users`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${adminTok}` },
    body: JSON.stringify({ name: `${NS}-HQ`, email: `${NS.toLowerCase()}.hq@benjamin-test.local`, department: "ฝ่ายขาย" }),
  });
  const json = await res.json().catch(() => ({} as Record<string, string>));
  // ต้องดังถ้าเตรียมบัญชีไม่สำเร็จ ไม่งั้นเทสต์จะ "ผ่าน" ทั้งที่ไม่ได้วัดอะไรเลย
  if (!res.ok) throw new Error(`สร้างบัญชีสำนักงานใหญ่ไม่สำเร็จ (${res.status}): ${JSON.stringify(json)}`);
  ACCOUNTS.HQ = { email: String(json.email), password: String(json.password) };
});

test.afterAll(async () => { await purge(); });

test("[role] บทบาทเดิม HQ_MANAGEMENT / HQ_STAFF สร้างหรือตั้งไม่ได้ทุกทาง (API · ฐาน) — เหลือบทบาทเดียว", async () => {
  // เดิม (ก่อนใบ 0282): สร้างได้ทั้งสองบทบาท แล้วทดสอบสิทธิ์แยก — ตอนนี้ต้องถูกปฏิเสธ
  for (const role of ["HQ_MANAGEMENT", "HQ_STAFF"]) {
    const res = await fetch(`${HQ_ORIGIN}/api/admin/users`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${adminTok}` },
      body: JSON.stringify({ name: `${NS}-${role}`, email: `${NS.toLowerCase()}.${role.toLowerCase()}@benjamin-test.local`, role }),
    });
    expect(res.status, `API: สร้างบัญชีบทบาท ${role} ต้องถูกปฏิเสธ (ได้ ${res.status})`).toBe(400);
  }
  const { data: ผี } = await svc.from("profiles").select("id").in("name", [`${NS}-HQ_MANAGEMENT`, `${NS}-HQ_STAFF`]);
  expect(ผี ?? [], "คำขอที่ถูกปฏิเสธต้องไม่สร้างบัญชี").toEqual([]);
  // ฐาน: แม้กุญแจฝั่งเซิร์ฟเวอร์ก็ตั้งบทบาทเดิมให้บัญชีไม่ได้ (ข้อจำกัด profiles_hq_single_role)
  const { data: hq } = await svc.from("profiles").select("id").eq("name", `${NS}-HQ`).single();
  //   ในนามสำนักงานใหญ่ (ผ่านตัวดักสิทธิ์ guard_profile_privilege) — ข้อจำกัด profiles_hq_single_role ต้องปฏิเสธเอง
  const ผู้ดูแล = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
  await ผู้ดูแล.auth.signInWithPassword(ADMIN);
  const แก้ = await ผู้ดูแล.from("profiles").update({ role: "HQ_STAFF" }).eq("id", hq!.id).select();
  expect(แก้.error?.message ?? "", "ฐาน: แก้เป็น HQ_STAFF ต้องถูกปฏิเสธ").toContain("profiles_hq_single_role");
  const แก้ตรง = await svc.from("profiles").update({ role: "HQ_MANAGEMENT" }).eq("id", hq!.id).select();
  expect(แก้ตรง.error?.message ?? "", "ฐาน: กุญแจฝั่งเซิร์ฟเวอร์แก้เป็น HQ_MANAGEMENT ก็ถูกปฏิเสธ").not.toBe("");
  const { data: หลัง } = await svc.from("profiles").select("role").eq("id", hq!.id).single();
  expect(หลัง?.role, "บทบาทยังเป็นสำนักงานใหญ่").toBe("SUPER_ADMIN");
});

async function signIn(role: string): Promise<SupabaseClient> {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword(ACCOUNTS[role]);
  expect(error?.message ?? "", `บัญชี ${role} ต้องล็อกอินได้`).toBe("");
  return sb;
}
async function tokenOf(sb: SupabaseClient): Promise<string> {
  return (await sb.auth.getSession()).data.session?.access_token ?? "";
}

test("[role] ผู้ใช้สำนักงานใหญ่ที่เพิ่มใหม่ (ไม่เลือกบทบาท) — ดูงานขายทั้งเครือ · แก้ข้อมูลกลางได้ · แก้งานขายของดีลเลอร์ไม่ได้", async () => {
  const sb = await signIn("HQ");

  // claim ที่ออกให้ต้องตรงกับบทบาทจริง — ถ้าไม่ตรง RLS ทั้งระบบจะตัดสินผิดหมด
  const claims = JSON.parse(Buffer.from((await tokenOf(sb)).split(".")[1], "base64").toString("utf8"));
  expect(claims.user_role, "บทบาทใน token ต้องตรงกับที่ตั้งไว้").toBe("SUPER_ADMIN");   // บทบาทเดียว (ใบ 0282)
  expect(String(claims.dealer_code ?? ""), "บทบาทสำนักงานใหญ่ต้องไม่ผูกสาขา").toBe("");

  // อ่านงานขายทั้งเครือ — ต้องไม่ถูกปฏิเสธ (เห็นกี่แถวขึ้นกับข้อมูลจริง จึงเช็กแค่ว่าอ่านได้)
  for (const t of ["leads", "quotations", "customers"]) {
    const r = await sb.from(t).select("id", { count: "exact", head: true });
    expect(r.error, `สำนักงานใหญ่ต้องอ่าน ${t} ได้`).toBeNull();
  }
  const audit = await sb.from("audit_log").select("id", { count: "exact", head: true });
  expect(audit.error, "สำนักงานใหญ่ต้องอ่านบันทึกการใช้งานได้").toBeNull();

  // แก้ข้อมูลกลางได้ (can_write_master = is_hq() · ใบ 0282)
  // ใช้แถวที่มีอยู่จริงแล้วคืนค่า — ตารางนี้ไม่ได้ออกเลขให้อัตโนมัติ การ insert เองจึงพังและ
  // ไม่ใช่สิ่งที่ต้องการวัดด้วย (ที่วัดคือ "แก้ได้ไหม" ไม่ใช่ "เพิ่มได้ไหม")
  //   (เดิมวัดที่แคตตาล็อกแม่แบบ — เลิกใช้แล้ว 16 ต.ค. 69 · ย้ายมาวัดที่ข้อมูลบริษัท HQ ซึ่งอยู่ใต้กติกาเดียวกัน can_write_master · ใบ 0099)
  //   แก้ช่อง website (ไม่ใช่ชื่อบริษัท ซึ่งไปขึ้นหัวเอกสารของสเปกอื่นที่รันขนานกัน) แล้วคืนค่า
  //   ต่อคิวแถวข้อมูลบริษัท HQ กับข้ออื่นที่แก้/ตรวจช่องเดียวกัน (supabase-rls [hq-company]) — 29 ต.ค. 69
  { const ปล่อยแถว = await ถือแถวกลาง("hq_company");
    try {
      const { data: seed } = await svc.from("hq_company").select("id,website").eq("id", 1).single();
      expect(seed, "ต้องมีข้อมูลบริษัท HQ ให้ทดสอบ").toBeTruthy();
      const upd = await sb.from("hq_company").update({ website: `${NS}-แก้แล้ว` }).eq("id", 1).select();
      expect(upd.error, "สำนักงานใหญ่ต้องแก้ข้อมูลกลางได้").toBeNull();
      expect(upd.data?.length, "ต้องแก้ได้จริง 1 แถว").toBe(1);
      await svc.from("hq_company").update({ website: seed!.website }).eq("id", 1);   // คืนค่าเดิม
    } finally { ปล่อยแถว(); } }

  // แก้งานขายของดีลเลอร์ไม่ได้ — เส้นแบ่งหลักของระบบ (HQ กำกับดูแล ไม่ใช่เจ้าของงานขาย)
  //   ใช้ลีดของสาขาของข้อเอง (ไม่พึ่งข้อมูลตั้งต้นร่วม · check-shared-baseline-asserts)
  const สาขา = await สร้างสาขาของข้อ();
  try {
    const เลข = 970_000_000 + (Date.now() % 9_000_000);
    expect((await svc.from("leads").insert({ id: `#L-${เลข}`, num_id: เลข, dealer_code: สาขา.รหัส, company: `${NS}-ลีด`, name: `${NS}-ลีด`, status: "WAITING" })).error).toBeNull();
    const w = await sb.from("leads").update({ company: "ห้ามแก้ได้" }).eq("dealer_code", สาขา.รหัส).select();
    expect(w.error ? "ถูกปฏิเสธ" : (w.data?.length ? `⚠ แก้ได้ ${w.data.length} แถว` : "ไม่โดนแถวไหน"))
      .not.toContain("⚠");
    const { data: หลัง } = await svc.from("leads").select("company").eq("num_id", เลข).eq("dealer_code", สาขา.รหัส).single();
    expect(หลัง?.company, "ลีดของดีลเลอร์ไม่ถูกแก้").toBe(`${NS}-ลีด`);
  } finally { await สาขา.ลบ(); }
});

test("[role] ผู้ใช้สำนักงานใหญ่ใหม่เรียก API จัดการดีลเลอร์/ผู้ใช้ได้ (เดิมเจ้าหน้าที่ถูกปฏิเสธ 403 · บทบาทเดียวแล้ว)", async () => {
  const sb = await signIn("HQ");
  const tok = await tokenOf(sb);
  const logins = await fetch(`${HQ_ORIGIN}/api/admin/dealers/logins`, { headers: { authorization: `Bearer ${tok}` } });
  expect(logins.status, `ดูอีเมลเข้าระบบของดีลเลอร์ได้ (ได้ ${logins.status})`).toBe(200);
  // ตั้งค่านโยบายของเครือได้ (เดิมเจ้าหน้าที่แก้ไม่ได้) — แก้ค่าเดิมกลับเป็นค่าเดิม (ไม่เปลี่ยนข้อมูล)
  const { data: pol } = await svc.from("hq_policy").select("id, vat").limit(1).single();
  const upd = await sb.from("hq_policy").update({ vat: pol!.vat }).eq("id", pol!.id).select();
  expect(upd.error, "สำนักงานใหญ่แก้นโยบายเครือได้").toBeNull();
  expect(upd.data?.length, "แก้ได้จริง 1 แถว").toBe(1);
});

test("[role] หนึ่งสาขาต้องมีบัญชีเข้าระบบได้บัญชีเดียวเท่านั้น (กฎที่ตกลงกันไว้)", async () => {
  // ยืนยันกฎที่ผู้บริหารตัดสินไว้ 7 ส.ค. 69 — ไม่ใช่ข้อจำกัดชั่วคราวที่รอแก้
  // ถ้าวันหนึ่งเทสต์นี้ล้ม แปลว่ามีคนผ่อนกฎโดยไม่ได้รับคำสั่ง ต้องกลับไปถามก่อนเสมอ
  const dup = await svc.from("profiles").insert({
    id: "00000000-0000-4000-8000-00000000r001".replace("r", "b"),
    role: "DEALER_SALES", dealer_code: "RYG", name: `${NS}-ขายRYG`, status: "active",
  });
  expect(dup.error?.message ?? "", "เพิ่มบัญชีที่สองให้สาขาเดิมต้องถูกปฏิเสธ").toContain("dealer_code");
});
