// ── /api/v1/{persons,dealers,profile,hq-company,dealer-settings} ────────────────
//
// ระยะ 1 กลุ่มที่ 3–6 — ข้อมูลอ้างอิง/ตั้งค่า ที่อ่านบ่อยแต่เขียนน้อย
// รวมไว้ไฟล์เดียวเพราะทุกตัวสั้น (2 เมธอด) และเป็นเรื่องเดียวกัน — แยก 5 ไฟล์จะรกกว่าโดยไม่ได้อะไร
//
// พฤติกรรมทุกตัวคัดมาจาก SupabaseAdapter ตรง ๆ รวมทั้งกับดักที่เขียนกำกับไว้:
//   dealers  : อ่านผ่าน view dealers_directory (ตาราง dealers ถูกตัด SELECT ออกตั้งแต่ 0090/0091)
//              เขียนผ่าน RPC save_dealers · เติม id = code ให้ (ตารางใช้ code เป็น PK ไม่มีคอลัมน์ id)
//   persons  : reindex id เป็น 1..n · เขียนผ่าน RPC replace_responsible_persons (atomic)
//   profile  : อ่าน/เขียนของ "ตัวเอง" เท่านั้น — id มาจากใบผ่าน ไม่ใช่จากผู้เรียก
import type { NextRequest } from "next/server";
import { handler, ok, dbFail, fail } from "./_ctx";
import { toCamelList, toSnake } from "@pms/shared/lib/data/supabase/mappers";
import type { DealerRow, ResponsiblePerson, UserProfile, HQCompany, DealerSettings } from "@pms/shared/lib/data/types";

type Row = Record<string, unknown>;
export { runtime } from "./_ctx";

// ── ผู้รับผิดชอบ (พนักงานขายของสาขา) ──
export const personsGET = handler("persons.list", async (req: NextRequest, sb) => {
  const dealer = new URL(req.url).searchParams.get("dealer") ?? "";
  let q = sb.from("responsible_persons").select("*").order("id", { ascending: true });
  if (dealer) q = q.eq("dealer_code", dealer);
  const { data, error } = await q;
  if (error) return dbFail("persons.list", error);
  // id ในแอปเป็นแค่ลำดับท้องถิ่น (ใช้เป็น React key) — ต้อง reindex ให้ตรงกับของเดิม
  const rows = toCamelList<ResponsiblePerson>((data ?? []) as Row[]).map((p, i) => ({ ...p, id: i + 1 }));
  return ok(rows);
});

export const personsPUT = handler("persons.save", async (req: NextRequest, sb) => {
  const body = (await req.json().catch(() => null)) as { dealerCode?: string; rows?: ResponsiblePerson[] } | null;
  const dealer = (body?.dealerCode ?? "").trim();
  if (!dealer || !Array.isArray(body?.rows)) return fail(400, "ต้องระบุรหัสสาขาและรายชื่อ");
  // ส่งเฉพาะฟิลด์ที่ RPC ใช้ — id/dealerCode ให้ RPC จัดการเอง
  const rows = body.rows.map(({ id: _id, dealerCode: _dc, ...rest }) => rest);
  const { error } = await sb.rpc("replace_responsible_persons", { p_dealer: dealer, p_rows: rows });
  if (error) return dbFail("persons.save", error);
  return ok({ ok: true });
});

// ── ทะเบียนดีลเลอร์ ──
export const dealersGET = handler("dealers.list", async (_req: NextRequest, sb) => {
  const { data, error } = await sb.from("dealers_directory").select("*").order("code", { ascending: true });
  if (error) return dbFail("dealers.list", error);
  const rows = toCamelList<DealerRow>((data ?? []) as Row[]).map(d => ({ ...d, id: d.id ?? d.code }));
  return ok(rows);
});

export const dealersPUT = handler("dealers.save", async (req: NextRequest, sb) => {
  const body = (await req.json().catch(() => null)) as DealerRow[] | null;
  if (!Array.isArray(body)) return fail(400, "ต้องส่งรายการดีลเลอร์มาเป็น array");
  const rows = body.map(d => {
    const r = toSnake(d as unknown as Row);
    delete r.id; delete r.credentials; delete r.created_at;   // ไม่มีคอลัมน์เหล่านี้ / DB เป็นเจ้าของ
    return r;
  });
  const { error } = await sb.rpc("save_dealers", { p_rows: rows });
  if (error) return dbFail("dealers.save", error);
  return ok({ ok: true });
});

export const dealersDELETE = handler("dealers.remove", async (req: NextRequest, sb) => {
  const code = (new URL(req.url).searchParams.get("code") ?? "").trim();
  if (!code) return fail(400, "ไม่ได้ระบุดีลเลอร์ที่จะลบ");
  const { error } = await sb.from("dealers").delete().eq("code", code);
  if (error) return dbFail("dealers.remove", error);
  return ok({ ok: true });
});

// ── โปรไฟล์ของตัวเอง ──
// id มาจากใบผ่านเสมอ ไม่รับจากผู้เรียก — ไม่งั้นแก้โปรไฟล์คนอื่นได้
async function callerId(sb: Parameters<Parameters<typeof handler>[1]>[1]) {
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? "";
}

export const profileGET = handler("profile.get", async (_req: NextRequest, sb) => {
  const { data: u } = await sb.auth.getUser();
  const id = u.user?.id;
  if (!id) return ok(null);
  const { data, error } = await sb.from("profiles").select("name,phone,contact_email,avatar").eq("id", id).maybeSingle();
  if (error) return dbFail("profile.get", error);
  if (!data) return ok(null);
  const r = data as Row;
  return ok({
    name: (r.name as string) ?? "",
    email: ((r.contact_email as string) || u.user?.email) ?? "",
    phone: (r.phone as string) ?? "",
    avatar: (r.avatar as string) || undefined,
  } as UserProfile);
});

export const profilePUT = handler("profile.save", async (req: NextRequest, sb) => {
  const id = await callerId(sb);
  if (!id) return fail(401, "ยังไม่ได้เข้าสู่ระบบ");
  const p = (await req.json().catch(() => null)) as UserProfile | null;
  if (!p) return fail(400, "ข้อมูลโปรไฟล์ไม่ถูกต้อง");
  // เขียนเฉพาะฟิลด์ส่วนตัว — role/dealer_code ไม่ส่งไป (trigger ที่ DB กันไว้อีกชั้น)
  const { error } = await sb.from("profiles")
    .update({ name: p.name, phone: p.phone, contact_email: p.email, avatar: p.avatar ?? null }).eq("id", id);
  if (error) return dbFail("profile.save", error);
  return ok({ ok: true });
});

// ── ข้อมูลบริษัทของสำนักงานใหญ่ (singleton id=1) ──
export const companyGET = handler("hqCompany.get", async (_req: NextRequest, sb) => {
  const { data, error } = await sb.from("hq_company").select("*").limit(1).maybeSingle();
  if (error) return dbFail("hqCompany.get", error);
  return ok(data ? toCamelList<HQCompany>([data as Row])[0] : null);
});

export const companyPUT = handler("hqCompany.save", async (req: NextRequest, sb) => {
  const c = (await req.json().catch(() => null)) as HQCompany | null;
  if (!c) return fail(400, "ข้อมูลบริษัทไม่ถูกต้อง");
  const { error } = await sb.from("hq_company").upsert({ id: 1, ...toSnake(c as unknown as Row) });
  if (error) return dbFail("hqCompany.save", error);
  return ok({ ok: true });
});

// ── ตั้งค่าของสาขา (หัวกระดาษ/เอกสาร/โลโก้/แจ้งเตือน) ──
// คืน "ดิบ" ให้ฝั่งแอปเติมค่ากลางเอง — ค่ากลาง (DEFAULT_ISSUER ฯลฯ) อยู่ใน mock.ts ฝั่ง client
// ถ้าเติมที่นี่ต้องดึง mock.ts เข้ามาที่เซิร์ฟเวอร์ด้วย ซึ่งพาไฟล์ข้อมูลตัวอย่างทั้งก้อนตามมา
export const dsGET = handler("dealerSettings.get", async (req: NextRequest, sb) => {
  // ?logos=1 → โลโก้ของทุกสาขาที่ตั้งไว้ (รหัสสาขา → รูป) สำหรับการ์ดหน้าดีลเลอร์ของ HQ
  //   RLS ตัดให้เองว่าใครเห็นของสาขาไหน · ไล่ทีละหน้าเสมอ (เพดาน 1,000 แถว)
  if (new URL(req.url).searchParams.get("logos") === "1") {
    const map: Record<string, string> = {};
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("dealer_settings").select("dealer_code,logo").not("logo", "is", null)
        .order("dealer_code", { ascending: true }).range(from, from + 999);
      if (error) return dbFail("dealerSettings.logos", error);
      const got = (data ?? []) as Row[];
      for (const r of got) if (typeof r.logo === "string" && r.logo) map[String(r.dealer_code)] = r.logo;
      if (got.length < 1000) break;
    }
    return ok(map);
  }
  const dealer = (new URL(req.url).searchParams.get("dealer") ?? "").trim();
  if (!dealer) return fail(400, "ไม่ได้ระบุสาขา");
  const { data, error } = await sb.from("dealer_settings")
    .select("issuer,document,logo,notif_prefs,pricing").eq("dealer_code", dealer).maybeSingle();
  if (error) return dbFail("dealerSettings.get", error);
  return ok(data ?? {});
});

export const dsPUT = handler("dealerSettings.save", async (req: NextRequest, sb) => {
  const body = (await req.json().catch(() => null)) as { dealerCode?: string; patch?: Partial<DealerSettings> } | null;
  const dealer = (body?.dealerCode ?? "").trim();
  const patch = body?.patch;
  if (!dealer || !patch) return fail(400, "ต้องระบุรหัสสาขาและค่าที่จะบันทึก");
  const row: Row = { dealer_code: dealer, updated_at: new Date().toISOString() };
  if (patch.issuer) row.issuer = patch.issuer;
  if (patch.document) row.document = patch.document;
  if (patch.logo !== undefined) row.logo = patch.logo;
  if (patch.notifPrefs) row.notif_prefs = patch.notifPrefs;
  // ⚠️ ส่วนบวกเพิ่มจากราคากลางของสาขา — ลืมส่งต่อตั้งแต่แรก (แก้ 27 ส.ค. 69)
  //    ผลคือดีลเลอร์ตั้ง % แล้วหน้าจอขึ้นว่าบันทึกแล้ว แต่ปิดหน้าไปค่าหายทุกครั้ง (เฉพาะโหมดที่เว็บจริงใช้)
  if (patch.pricing) row.pricing = patch.pricing;
  const { error } = await sb.from("dealer_settings").upsert(row);
  if (error) return dbFail("dealerSettings.save", error);
  return ok({ ok: true });
});
