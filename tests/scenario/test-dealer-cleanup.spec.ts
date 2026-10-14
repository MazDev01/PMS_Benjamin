import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db, HQ_ORIGIN, ลูกค้าเป้าหมายรองรับสาขา } from "./funcHelpers";
import { adminClient, ลบสาขาทดสอบตรง, เป็นรหัสสาขาทดสอบ } from "./testDealers";

// ── ตัวเก็บกวาดสาขาทดสอบต้องไม่พึ่งคำสั่งลบดีลเลอร์ของระบบ ─────────────────────────────────
//
// บั๊กที่กัน (13 ต.ค. 69): เส้นทางลบดีลเลอร์พัง (503) → ข้อทดสอบที่เก็บกวาดผ่านเส้นทางนั้นทิ้งสาขาค้าง 3 ราย
//   → ข้อทดสอบอื่นตกตามอีก 4 ข้อ ทั้งที่ไม่เกี่ยวกับการลบเลย
// ข้อนี้จงใจทำให้ "คำสั่งลบของระบบ" ล้ม (สาขายังมีข้อมูลงานขาย ระบบจึงปฏิเสธ) แล้วพิสูจน์ว่าตัวเก็บกวาดยังลบได้หมด
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");

const CODE = "ZZCU";   // รหัสเฉพาะไฟล์นี้
const admin = adminClient();

test.beforeAll(async () => { await ลบสาขาทดสอบตรง(CODE, admin); });
test.afterAll(async () => { await ลบสาขาทดสอบตรง(CODE, admin); });

test("[cleanup] คำสั่งลบของระบบล้ม — ตัวเก็บกวาดยังลบสาขาทดสอบได้หมด ไม่มีอะไรค้าง", async ({ request }) => {
  const token = (await (await db(ADMIN)).auth.getSession()).data.session?.access_token ?? "";
  const สร้าง = await request.post(`${HQ_ORIGIN}/api/admin/dealers`, {
    headers: { authorization: `Bearer ${token}` }, timeout: 60_000,
    data: { code: CODE, name: "ZZTEST-สาขาทดสอบตัวเก็บกวาด", province: "ทดสอบ", region: "กลาง", revenueTarget: 1_000_000, prospectId: await ลูกค้าเป้าหมายรองรับสาขา(CODE) },
  });
  expect(สร้าง.status(), `สร้างสาขาต้องผ่าน (ได้ ${สร้าง.status()} · ${await สร้าง.text()})`).toBe(200);
  const { email } = await สร้าง.json() as { email: string };

  // ทำให้คำสั่งลบของระบบล้ม: ใส่ลูกค้าเป้าหมายให้สาขานี้หนึ่งราย — ระบบไม่ยอมลบสาขาที่ยังมีข้อมูลงานขาย
  const leadId = `ZZTEST-CLEANUP-${CODE}`;
  const ใส่ = await admin.from("leads").insert({ id: leadId, dealer_code: CODE, company: "ZZTEST-ลูกค้าของสาขาที่ลบไม่ได้", status: "WAITING", phone: "081-999-0101", province: "ระยอง" });
  expect(ใส่.error, `ใส่ลูกค้าเป้าหมายของสาขาทดสอบต้องผ่าน (${ใส่.error?.message})`).toBeNull();

  const ลบผ่านระบบ = await request.delete(`${HQ_ORIGIN}/api/admin/dealers?code=${CODE}`, { headers: { authorization: `Bearer ${token}` } });
  expect(ลบผ่านระบบ.status(), "คำสั่งลบของระบบต้องล้ม (สาขายังมีข้อมูล) — ถ้าผ่าน ข้อนี้ไม่ได้พิสูจน์อะไร").toBe(409);
  const ยังอยู่ = await admin.from("dealers").select("code").eq("code", CODE);
  expect(ยังอยู่.data?.length, "หลังคำสั่งลบของระบบล้ม สาขาต้องยังอยู่ (สภาพเดียวกับตอนเกิดบั๊ก)").toBe(1);

  // ตัวเก็บกวาด: ต้องลบได้หมดโดยไม่เรียกคำสั่งลบของระบบ
  expect(await ลบสาขาทดสอบตรง(CODE, admin), "ตัวเก็บกวาดต้องไม่มีรายการที่ลบไม่สำเร็จ").toEqual([]);

  const นับ = async (table: string, col: string, val: string) => {
    const { count, error } = await admin.from(table).select("*", { count: "exact", head: true }).eq(col, val);
    expect(error, `นับ ${table} ต้องผ่าน (${error?.message})`).toBeNull();
    return count;
  };
  expect(await นับ("dealers", "code", CODE), "แถวสาขา").toBe(0);
  expect(await นับ("leads", "dealer_code", CODE), "ลูกค้าเป้าหมายของสาขา").toBe(0);
  expect(await นับ("profiles", "dealer_code", CODE), "โปรไฟล์ของสาขา").toBe(0);
  expect(await นับ("dealer_login_secrets", "dealer_code", CODE), "สำเนารหัสผ่านของสาขา").toBe(0);
  expect(await นับ("dealer_prospects", "name", `ZZTEST-ผู้สนใจ-${CODE}`), "ลูกค้าเป้าหมาย (HQ) ต้นทางของสาขา").toBe(0);
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  expect((users?.users ?? []).filter(u => u.email === email).length, "บัญชีเข้าระบบของสาขา").toBe(0);

  // รันซ้ำบนสาขาที่ไม่มีแล้วต้องไม่พัง (ตัวเก็บกวาดถูกเรียกทั้งก่อนและหลังทุกรอบ)
  expect(await ลบสาขาทดสอบตรง(CODE, admin)).toEqual([]);
});

test("[cleanup] ตัวเก็บกวาดไม่แตะสาขาที่ไม่ใช่ของข้อทดสอบ", async () => {
  for (const code of ["RYG", "CNX", "BKK", "Z", "ZA", "ZZ", "ZZTOOLONG", "zzq", ""]) {
    expect(เป็นรหัสสาขาทดสอบ(code), `"${code}" ต้องไม่ถูกนับเป็นรหัสสาขาทดสอบ`).toBe(false);
    await expect(ลบสาขาทดสอบตรง(code, admin), `"${code}" ต้องถูกปฏิเสธ ไม่ลบ`).rejects.toThrow(/ไม่ใช่รหัสสาขาทดสอบ/);
  }
  for (const code of ["ZZQA", "ZZP", "ZTG", "ZZEDG", "ZZLA"]) expect(เป็นรหัสสาขาทดสอบ(code)).toBe(true);
  const { count } = await admin.from("dealers").select("*", { count: "exact", head: true }).eq("code", "RYG");
  expect(count, "สาขา RYG ต้องยังอยู่").toBe(1);
});
