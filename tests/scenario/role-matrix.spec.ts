import { test, expect } from "@playwright/test";
import { ถือแถวกลาง } from "./sharedRowLock";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ADMIN, SUPABASE_URL, SUPABASE_ANON, skipReason } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { HQ_ORIGIN } from "./funcHelpers";

// ── ตารางสิทธิ์: บทบาทฝั่งสำนักงานใหญ่ที่ยังไม่เคยถูกทดสอบด้วยบัญชีจริง ────────────
//
// ทำไมเพิ่งมี (ผลตรวจสอบระบบ 7 ส.ค. 69 · หัวข้อ "ยังไม่ได้ตรวจ"):
//   ระบบประกาศบทบาทไว้ 6 แบบ แต่ในฐานข้อมูลจริงมีแค่ 2 (SUPER_ADMIN + DEALER_ADMIN)
//   อีก 4 บทบาทจึงไม่เคยถูกยืนยันเลยว่า "สิทธิ์ที่ประกาศไว้ในโค้ด" ตรงกับ "สิ่งที่ DB ยอมให้ทำจริง"
//   ซึ่งเป็นจุดที่เคยพลาดมาแล้ว: แอปเปิดปุ่มให้กด แต่ DB ปฏิเสธ → ผู้ใช้นึกว่าบันทึกแล้ว (C1/C3)
//
// ขอบเขตของไฟล์นี้ = 2 บทบาทที่ "มีอยู่จริงได้": HQ_MANAGEMENT · HQ_STAFF
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
  for (const role of ["HQ_MANAGEMENT", "HQ_STAFF"]) {
    const res = await fetch(`${HQ_ORIGIN}/api/admin/users`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${adminTok}` },
      body: JSON.stringify({ name: `${NS}-${role}`, email: `${NS.toLowerCase()}.${role.toLowerCase()}@benjamin-test.local`, role }),
    });
    const json = await res.json().catch(() => ({} as Record<string, string>));
    // ต้องดังถ้าเตรียมบัญชีไม่สำเร็จ ไม่งั้นเทสต์จะ "ผ่าน" ทั้งที่ไม่ได้วัดอะไรเลย
    if (!res.ok) throw new Error(`สร้างบัญชี ${role} ไม่สำเร็จ (${res.status}): ${JSON.stringify(json)}`);
    ACCOUNTS[role] = { email: String(json.email), password: String(json.password) };
  }
});

test.afterAll(async () => { await purge(); });

async function signIn(role: string): Promise<SupabaseClient> {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword(ACCOUNTS[role]);
  expect(error?.message ?? "", `บัญชี ${role} ต้องล็อกอินได้`).toBe("");
  return sb;
}
async function tokenOf(sb: SupabaseClient): Promise<string> {
  return (await sb.auth.getSession()).data.session?.access_token ?? "";
}

test("[role] HQ_MANAGEMENT — ดูงานขายทั้งเครือได้ · แก้ข้อมูลกลางได้ · แก้งานขายของดีลเลอร์ไม่ได้", async () => {
  const sb = await signIn("HQ_MANAGEMENT");

  // claim ที่ออกให้ต้องตรงกับบทบาทจริง — ถ้าไม่ตรง RLS ทั้งระบบจะตัดสินผิดหมด
  const claims = JSON.parse(Buffer.from((await tokenOf(sb)).split(".")[1], "base64").toString("utf8"));
  expect(claims.user_role, "บทบาทใน token ต้องตรงกับที่ตั้งไว้").toBe("HQ_MANAGEMENT");
  expect(String(claims.dealer_code ?? ""), "บทบาทสำนักงานใหญ่ต้องไม่ผูกสาขา").toBe("");

  // อ่านงานขายทั้งเครือ — ต้องไม่ถูกปฏิเสธ (เห็นกี่แถวขึ้นกับข้อมูลจริง จึงเช็กแค่ว่าอ่านได้)
  for (const t of ["leads", "quotations", "customers"]) {
    const r = await sb.from(t).select("id", { count: "exact", head: true });
    expect(r.error, `HQ_MANAGEMENT ต้องอ่าน ${t} ได้`).toBeNull();
  }
  const audit = await sb.from("audit_log").select("id", { count: "exact", head: true });
  expect(audit.error, "HQ_MANAGEMENT ต้องอ่านบันทึกการใช้งานได้").toBeNull();

  // แก้ข้อมูลกลางได้ (can_write_master ครอบ SUPER_ADMIN + HQ_MANAGEMENT)
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
      expect(upd.error, "HQ_MANAGEMENT ต้องแก้ข้อมูลกลางได้").toBeNull();
      expect(upd.data?.length, "ต้องแก้ได้จริง 1 แถว").toBe(1);
      await svc.from("hq_company").update({ website: seed!.website }).eq("id", 1);   // คืนค่าเดิม
    } finally { ปล่อยแถว(); } }

  // แก้งานขายของดีลเลอร์ไม่ได้ — เส้นแบ่งหลักของระบบ (HQ กำกับดูแล ไม่ใช่เจ้าของงานขาย)
  const w = await sb.from("leads").update({ company: "ห้ามแก้ได้" }).eq("dealer_code", "RYG").select();
  expect(w.error ? "ถูกปฏิเสธ" : (w.data?.length ? `⚠ แก้ได้ ${w.data.length} แถว` : "ไม่โดนแถวไหน"))
    .not.toContain("⚠");
});

test("[role] HQ_STAFF — ดูงานขายทั้งเครือได้ แต่แก้ข้อมูลกลางไม่ได้", async () => {
  const sb = await signIn("HQ_STAFF");
  const claims = JSON.parse(Buffer.from((await tokenOf(sb)).split(".")[1], "base64").toString("utf8"));
  expect(claims.user_role, "บทบาทใน token ต้องตรงกับที่ตั้งไว้").toBe("HQ_STAFF");

  for (const t of ["leads", "quotations", "customers"]) {
    const r = await sb.from(t).select("id", { count: "exact", head: true });
    expect(r.error, `HQ_STAFF ต้องอ่าน ${t} ได้`).toBeNull();
  }

  // ห้ามแก้ข้อมูลกลาง — นี่คือความต่างเดียวจาก HQ_MANAGEMENT ที่ต้องพิสูจน์ให้ได้
  //   (เดิมวัดที่แคตตาล็อกแม่แบบ — เลิกใช้แล้ว 16 ต.ค. 69 · ย้ายมาวัดที่ข้อมูลบริษัท HQ ซึ่งอยู่ใต้กติกาเดียวกัน can_write_master)
  { const ปล่อยแถว = await ถือแถวกลาง("hq_company");   // ตรวจ "ค่าไม่เปลี่ยน" — ข้ออื่นที่แก้ช่องนี้ต้องไม่แทรกกลาง
    try {
      const { data: seed } = await svc.from("hq_company").select("id,website").eq("id", 1).single();
      expect(seed, "ต้องมีข้อมูลบริษัท HQ ให้ทดสอบ").toBeTruthy();
      const upd = await sb.from("hq_company").update({ website: "ห้ามแก้ได้" }).eq("id", 1).select();
      expect(upd.error ? 0 : (upd.data?.length ?? 0), "HQ_STAFF ต้องแก้ข้อมูลกลางไม่ได้").toBe(0);
      const del = await sb.from("hq_company").delete().eq("id", 1).select();
      expect(del.error ? 0 : (del.data?.length ?? 0), "HQ_STAFF ต้องลบข้อมูลกลางไม่ได้").toBe(0);
      // ตรวจซ้ำว่าแถวจริงไม่ถูกแตะเลย (ทั้งค่าและตัวแถวเอง)
      const { data: after } = await svc.from("hq_company").select("website").eq("id", 1);
      expect(after?.[0]?.website, "ข้อมูลกลางของจริงต้องไม่ถูกแก้").toBe(seed!.website);
    } finally { ปล่อยแถว(); } }

  // ห้ามแก้ตั้งค่านโยบายของเครือ (VAT ฯลฯ)
  const pol = await sb.from("hq_policy").update({ vat: 99 }).neq("id", -1).select();
  expect(pol.error ? 0 : (pol.data?.length ?? 0), "HQ_STAFF ต้องแก้นโยบายเครือไม่ได้").toBe(0);
});

test("[role] HQ_STAFF เรียก API จัดการดีลเลอร์/ผู้ใช้ ต้องถูกปฏิเสธ (ไม่ใช่แค่ซ่อนปุ่มบนหน้าจอ)", async () => {
  const sb = await signIn("HQ_STAFF");
  const tok = await tokenOf(sb);

  const mk = await fetch(`${HQ_ORIGIN}/api/admin/dealers`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
    body: JSON.stringify({ code: "ZZRL", name: `${NS}-สาขา`, province: "นครปฐม", region: "กลาง", revenueTarget: 0, status: "active" }),
  });
  expect(mk.status, `HQ_STAFF สร้างดีลเลอร์ไม่ได้ (ได้ ${mk.status})`).toBe(403);

  const usr = await fetch(`${HQ_ORIGIN}/api/admin/users`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
    body: JSON.stringify({ name: `${NS}-x`, email: `${NS.toLowerCase()}.x@benjamin-test.local`, role: "HQ_STAFF" }),
  });
  expect(usr.status, `HQ_STAFF สร้างผู้ใช้ไม่ได้ (ได้ ${usr.status})`).toBe(403);

  const logins = await fetch(`${HQ_ORIGIN}/api/admin/dealers/logins`, { headers: { authorization: `Bearer ${tok}` } });
  expect(logins.status, `HQ_STAFF ดูอีเมลเข้าระบบของดีลเลอร์ไม่ได้ (ได้ ${logins.status})`).toBe(403);

  // ต้องไม่มีสาขาผีเกิดขึ้นจากคำขอที่ถูกปฏิเสธ
  const { data } = await svc.from("dealers").select("code").eq("code", "ZZRL");
  expect(data ?? [], "คำขอที่ถูกปฏิเสธต้องไม่สร้างสาขา").toEqual([]);
});

test("[role] HQ_MANAGEMENT ตั้งบัญชีใหม่เป็นผู้ดูแลสูงสุดไม่ได้ (กันยกระดับเทียบเท่าตัวเอง)", async () => {
  const sb = await signIn("HQ_MANAGEMENT");
  const tok = await tokenOf(sb);
  const res = await fetch(`${HQ_ORIGIN}/api/admin/users`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
    body: JSON.stringify({ name: `${NS}-super`, email: `${NS.toLowerCase()}.super@benjamin-test.local`, role: "SUPER_ADMIN" }),
  });
  expect(res.status, `ต้องถูกปฏิเสธ (ได้ ${res.status} ${await res.text()})`).toBe(403);
  const { data } = await svc.from("profiles").select("id").eq("name", `${NS}-super`);
  expect(data ?? [], "คำขอที่ถูกปฏิเสธต้องไม่สร้างบัญชี").toEqual([]);
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
