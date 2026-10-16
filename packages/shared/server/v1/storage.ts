// ── /api/v1/storage — ไฟล์จริง (bytes) ใน Supabase Storage ─────────────────────
//
// ระยะ 1 กลุ่มที่ 17 · bucket dealer-files/{รหัสสาขา}/... — Storage RLS คุมด้วย foldername[1]
// จึงต้องขึ้นต้นพาธด้วยรหัสสาขาเสมอ ห้ามแตะกติกานี้
//
// ⚠️ ชื่อไฟล์ที่เป็น key ต้องเป็น ASCII ล้วน — ไทย/ช่องว่างทำให้ Storage ตอบ "Invalid key"
//    ชื่อจริงที่ผู้ใช้เห็นเก็บแยกอยู่ใน files.name อยู่แล้ว
//
// ⚠️ อัปโหลดเป็น multipart ไม่ใช่ JSON — เส้นทางนี้จึงไม่ผ่าน apiFetch ปกติของฝั่งแอป
import type { NextRequest } from "next/server";
import { handler, ok, dbFail, fail } from "./_ctx";

const BUCKET = "dealer-files";
// ถังแบบแปลนของแม่แบบเลิกใช้แล้ว (เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69) — เส้นทางนี้ใช้ถังของดีลเลอร์ถังเดียว
//   ผู้เรียกที่ยังส่ง bucket อะไรมาก็ตกที่ถังของดีลเลอร์ (สิทธิ์คุมที่ Storage RLS ตามสาขาเหมือนเดิม)
const bucketOf = (_v: unknown) => BUCKET;
export { runtime } from "./_ctx";

/** พาธของไฟล์ในถัง — ใช้ร่วมกันทั้งอัปโหลดผ่านเซิร์ฟเวอร์และออกลิงก์อัปโหลดตรง */
function pathOf(bucket: string, dealer: string, stamp: number, name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_") || "file";
  void bucket;
  return `${dealer}/${stamp}-${safe}`;
}

export const POST = handler("storage.upload", async (req: NextRequest, sb) => {
  // ── ออกลิงก์อัปโหลดตรงเข้าที่เก็บไฟล์ (16 ก.ย. 69) ────────────────────────────────
  //   บั๊กจริงบนเว็บจริง: อัปโหลดแบบส่งไฟล์ผ่านเส้นทางนี้ติดเพดานคำขอของ Vercel ~4.5 MB
  //   (ยิงจริง 6 MB ได้ 413 FUNCTION_PAYLOAD_TOO_LARGE) ทั้งที่หน้าจอบอกรับ 25 MB
  //   ตอนนี้เซิร์ฟเวอร์แค่ออก "ใบอนุญาตอัปโหลด" (คำขอเล็ก) แล้วหน้าเว็บส่งไฟล์ตรงไปที่เก็บไฟล์
  //   ⚠️ ออกด้วยสิทธิ์ของผู้ใช้คนนั้น — กฎของที่เก็บไฟล์ (แยกสาขา / เขียนแบบแปลนได้เฉพาะ HQ) ยังคุมเหมือนเดิม
  //      และเพดานขนาดไฟล์ของถังบังคับตอนอัปโหลดจริง
  if (new URL(req.url).searchParams.get("op") === "sign") {
    const b = (await req.json().catch(() => null)) as { bucket?: string; dealerCode?: string; name?: string; stamp?: number } | null;
    const bucket = bucketOf(b?.bucket);
    const dealer = typeof b?.dealerCode === "string" ? b.dealerCode.trim() : "";
    const name = String(b?.name ?? "").trim();
    if (!name) return fail(400, "ต้องระบุไฟล์");
    if (bucket === BUCKET && !dealer) return fail(400, "ต้องระบุสาขาและไฟล์");
    const path = pathOf(bucket, dealer, Number(b?.stamp) || Date.now(), name);
    const { data, error } = await sb.storage.from(bucket).createSignedUploadUrl(path);
    if (error || !data) return dbFail("storage.sign", (error ?? { message: "ออกลิงก์อัปโหลดไม่สำเร็จ" }) as { message: string; code?: string });
    return ok({ path, token: data.token });
  }
  const form = await req.formData().catch(() => null);
  const bucket = bucketOf(form?.get("bucket"));
  const dealer = String(form?.get("dealerCode") ?? "").trim();
  const file = form?.get("file");
  // ถังของแคตตาล็อกไม่ได้แยกตามสาขา — ไม่ต้องมีรหัสสาขา (และบัญชี HQ ก็ไม่มีให้ส่ง)
  if (!(file instanceof File)) return fail(400, "ต้องระบุไฟล์");
  if (bucket === BUCKET && !dealer) return fail(400, "ต้องระบุสาขาและไฟล์");
  const stamp = Number(form?.get("stamp")) || Date.now();
  const path = pathOf(bucket, dealer, stamp, file.name);
  const { error } = await sb.storage.from(bucket).upload(path, file, { upsert: false });
  if (error) return dbFail("storage.upload", error as { message: string; code?: string });
  return ok(path);
});

export const GET = handler("storage.signedUrl", async (req: NextRequest, sb) => {
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!path) return fail(400, "ไม่ได้ระบุไฟล์");
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) return dbFail("storage.signedUrl", error as { message: string; code?: string });
  return ok(data?.signedUrl ?? null);
});

export const DELETE = handler("storage.remove", async (req: NextRequest, sb) => {
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!path) return fail(400, "ไม่ได้ระบุไฟล์");
  // ⚠️ ที่เก็บไฟล์ "ไม่ฟ้อง error" เมื่อกฎความปลอดภัยกันไว้ — คืนรายการที่ลบได้จริงเป็นอาร์เรย์ว่างแทน
  //    เดิมตอบ {ok:true} ทุกครั้ง → สาขาอื่นสั่งลบไฟล์ของเราแล้วหน้าจอขึ้นว่า "ลบแล้ว" ทั้งที่ไฟล์ยังอยู่
  //    (ยิงจริงยืนยัน 27 ส.ค. 69: CNX สั่งลบไฟล์ของ RYG ได้ 200 แต่ไฟล์ยังดาวน์โหลดได้อยู่)
  const { data, error } = await sb.storage.from(bucketOf(new URL(req.url).searchParams.get("bucket"))).remove([path]);
  if (error) return dbFail("storage.remove", error as { message: string; code?: string });
  if (!data?.length) return fail(404, "ลบไฟล์ไม่สำเร็จ — ไม่พบไฟล์นี้ หรือไม่มีสิทธิ์ลบ");
  return ok({ ok: true });
});
