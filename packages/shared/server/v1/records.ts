// ── /api/v1/{notes,users,files} — เรคคอร์ดทั่วไป CRUD ตรงไปตรงมา ─────────────────
// ระยะ 1 กลุ่มที่ 9–11 · คัดพฤติกรรมมาจาก SupabaseAdapter ตรง ๆ
import type { NextRequest } from "next/server";
import { handler, ok, dbFail, fail } from "./_ctx";
import { toCamel, toCamelList, toSnake } from "@pms/shared/lib/data/supabase/mappers";
import type { CustomerNote, DealerFile, SystemUser } from "@pms/shared/lib/data/types";

type Row = Record<string, unknown>;
export { runtime } from "./_ctx";

/** ดีลเลอร์เห็นเฉพาะสาขาตัวเอง · HQ เห็นทั้งเครือ — ตรงกับ selectScoped ของ SupabaseAdapter
 *  (RLS บังคับอยู่แล้วอีกชั้น อันนี้แค่ไม่ดึงเกินความจำเป็น) */
function scopeOf(req: NextRequest) {
  const u = new URL(req.url);
  return { dealer: u.searchParams.get("dealer") ?? "", isHQ: u.searchParams.get("hq") === "1" };
}

// ── โน้ตลูกค้า ──
export const notesGET = handler("notes.list", async (req: NextRequest, sb) => {
  const { dealer, isHQ } = scopeOf(req);
  let q = sb.from("customer_notes").select("*").order("id", { ascending: true });
  if (!isHQ && dealer) q = q.eq("dealer_code", dealer);
  const { data, error } = await q;
  if (error) return dbFail("notes.list", error);
  return ok(toCamelList<CustomerNote>((data ?? []) as Row[]));
});

export const notesPOST = handler("notes.create", async (req: NextRequest, sb) => {
  const n = (await req.json().catch(() => null)) as Omit<CustomerNote, "id"> | null;
  if (!n) return fail(400, "ข้อมูลโน้ตไม่ถูกต้อง");
  const { data, error } = await sb.from("customer_notes").insert(toSnake(n as unknown as Row)).select().single();
  if (error) return dbFail("notes.create", error);
  return ok(toCamel<CustomerNote>(data as Row));
});

export const notesPUT = handler("notes.update", async (req: NextRequest, sb) => {
  const n = (await req.json().catch(() => null)) as CustomerNote | null;
  if (!n?.id) return fail(400, "ไม่ได้ระบุโน้ตที่จะแก้");
  const { data, error } = await sb.from("customer_notes").update(toSnake(n as unknown as Row)).eq("id", n.id).select().single();
  if (error) return dbFail("notes.update", error);
  return ok(toCamel<CustomerNote>(data as Row));
});

export const notesDELETE = handler("notes.remove", async (req: NextRequest, sb) => {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isFinite(id)) return fail(400, "ไม่ได้ระบุโน้ตที่จะลบ");
  const { error } = await sb.from("customer_notes").delete().eq("id", id);
  if (error) return dbFail("notes.remove", error);
  return ok({ ok: true });
});

// ── ผู้ใช้ในระบบ (หน้า /hq/users) ──
// ⚠️ "email" ที่คืนคือ contact_email (อีเมลติดต่อ) ไม่ใช่อีเมลล็อกอิน — อันนั้นอยู่ใน auth.users
export const usersGET = handler("users.list", async (_req: NextRequest, sb) => {
  const { data, error } = await sb.from("profiles").select("*")
    .order("created_at", { ascending: true }).order("id", { ascending: true });
  if (error) return dbFail("users.list", error);
  const rows = ((data ?? []) as Row[]).map(r => ({
    id: String(r.id),
    name: (r.name as string) || "",
    email: (r.contact_email as string) || "",
    phone: (r.phone as string) || "",
    role: (r.role as string) || "",
    department: (r.department as string) || "",
    dealerCode: (r.dealer_code as string) || "",
    status: ((r.status as string) === "inactive" ? "inactive" : "active") as SystemUser["status"],
    createdAt: (r.created_at as string) || "",
    avatar: (r.avatar as string) || undefined,
  }));
  return ok(rows);
});

export const usersPUT = handler("users.update", async (req: NextRequest, sb) => {
  const u = (await req.json().catch(() => null)) as (Partial<SystemUser> & { id?: string }) | null;
  if (!u?.id) return fail(400, "ไม่ได้ระบุผู้ใช้");
  // เขียนเฉพาะฟิลด์ที่อนุญาต — dealer_code/created_at ไม่อยู่ในรายการโดยตั้งใจ
  const row: Row = { name: u.name, role: u.role, department: u.department, status: u.status };
  if ("avatar" in u) row.avatar = u.avatar ?? null;
  if (u.phone !== undefined) row.phone = u.phone;
  if (u.email !== undefined) row.contact_email = u.email;
  const { error } = await sb.from("profiles").update(row).eq("id", u.id);
  if (error) return dbFail("users.update", error);
  return ok({ ok: true });
});

// ── ไฟล์ (metadata) ──
export const filesGET = handler("files.list", async (req: NextRequest, sb) => {
  const { dealer, isHQ } = scopeOf(req);
  let q = sb.from("files").select("*").order("id", { ascending: true });
  if (!isHQ && dealer) q = q.eq("dealer_code", dealer);
  const { data, error } = await q;
  if (error) return dbFail("files.list", error);
  return ok(toCamelList<DealerFile>((data ?? []) as Row[]));
});

export const filesPOST = handler("files.add", async (req: NextRequest, sb) => {
  const f = (await req.json().catch(() => null)) as Omit<DealerFile, "id"> | null;
  if (!f) return fail(400, "ข้อมูลไฟล์ไม่ถูกต้อง");
  const { data, error } = await sb.from("files").insert(toSnake(f as unknown as Row)).select().single();
  if (error) return dbFail("files.add", error);
  return ok(toCamel<DealerFile>(data as Row));
});

export const filesPUT = handler("files.update", async (req: NextRequest, sb) => {
  const f = (await req.json().catch(() => null)) as DealerFile | null;
  if (!f?.id) return fail(400, "ไม่ได้ระบุไฟล์ที่จะแก้");
  const { error } = await sb.from("files").update(toSnake(f as unknown as Row)).eq("id", f.id);
  if (error) return dbFail("files.update", error);
  return ok({ ok: true });
});

export const filesDELETE = handler("files.remove", async (req: NextRequest, sb) => {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isFinite(id)) return fail(400, "ไม่ได้ระบุไฟล์ที่จะลบ");
  const { error } = await sb.from("files").delete().eq("id", id);
  if (error) return dbFail("files.remove", error);
  return ok({ ok: true });
});
