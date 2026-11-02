// ── /api/v1/quote-files — ไฟล์แนบของคำขอราคา 2 ทาง ดีลเลอร์ ↔ HQ (บอสสั่ง 2 พ.ย. 69 · ใบ 0273) ─────────────────────
//
// ทำงานในนามผู้ใช้ที่เรียกมา (ใบผ่านของผู้ใช้) — ฐาน/ถังตรวจสิทธิ์ ล็อก ชนิด ขนาด จำนวน เอง เส้นทางนี้ไม่ตัดสินแทน
//   ⚠️ ตัวไฟล์ไม่ผ่านเส้นทางนี้ (Vercel รับ body ≤ 4.5 MB แต่ไฟล์ได้ถึง 20 MB):
//      POST op=reserve → ฐานจองที่ (quote_file_reserve) → ออกลิงก์อัปโหลดที่เซ็นแล้ว → หน้าเว็บส่งไฟล์ตรงเข้าถัง quote-files
//   GET ?request=  รายการไฟล์ทั้งสายของคำขอ · ?view=url&path= ลิงก์ดาวน์โหลดอายุ 5 นาที · ?view=usage พื้นที่เก็บไฟล์ (HQ)
//   POST op=counts ป้ายจำนวนไฟล์ · op=quota ตั้งโควตา (ผู้ดูแล/ผู้บริหาร HQ)
//   DELETE ?path=  ลบจากถัง — กฎของถังกัน (ส่งใบแล้ว/ไม่ใช่ฝั่งตัวเอง = ลบไม่ได้ · ถังไม่ฟ้องผิด แต่คืนรายการว่าง)
import type { NextRequest } from "next/server";
import { handler, ok, dbFail, fail } from "./_ctx";

const BUCKET = "quote-files";
export { runtime } from "./_ctx";

export const quoteFilesGET = handler("quoteFiles.read", async (req: NextRequest, sb) => {
  const q = new URL(req.url).searchParams;
  const view = q.get("view");
  if (view === "url") {
    const path = q.get("path") ?? "";
    if (!path) return fail(400, "ไม่ได้ระบุไฟล์");
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 300);
    if (error) return dbFail("quoteFiles.url", error as { message: string; code?: string });
    return ok(data?.signedUrl ?? null);
  }
  if (view === "usage") {
    const { data, error } = await sb.rpc("storage_usage");
    if (error) return dbFail("quoteFiles.usage", error);
    return ok(data);
  }
  const request = Number(q.get("request"));
  if (!Number.isInteger(request) || request <= 0) return fail(400, "ระบุคำขอ");
  const { data, error } = await sb.rpc("quote_files_list", { p_request_id: request });
  if (error) return dbFail("quoteFiles.list", error);
  return ok(data ?? []);
});

export const quoteFilesPOST = handler("quoteFiles.write", async (req: NextRequest, sb) => {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return fail(400, "ข้อมูลไม่ถูกต้อง");
  switch (b.op) {
    case "reserve": {
      const { data, error } = await sb.rpc("quote_file_reserve", {
        p_request_id: Number(b.requestId), p_side: String(b.side ?? ""), p_name: String(b.name ?? ""), p_size: Number(b.size),
      });
      if (error) return dbFail("quoteFiles.reserve", error);
      const path = String((data as { path?: string } | null)?.path ?? "");
      // ออกลิงก์ในนามผู้ใช้ — กฎเขียนของถังตรวจว่าผู้นี้จองที่นี้ไว้จริง
      const { data: s, error: e2 } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
      if (e2 || !s) return dbFail("quoteFiles.sign", (e2 ?? { message: "ออกลิงก์อัปโหลดไม่สำเร็จ" }) as { message: string; code?: string });
      return ok({ path, token: s.token });
    }
    case "counts": {
      const ids = Array.isArray(b.ids) ? b.ids.map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 1000) : [];
      if (!ids.length) return ok([]);
      const { data, error } = await sb.rpc("quote_file_counts", { p_request_ids: ids });
      if (error) return dbFail("quoteFiles.counts", error);
      return ok(data ?? []);
    }
    case "quota": {
      const gb = b.gb == null || b.gb === "" ? null : Number(b.gb);
      if (gb != null && !Number.isFinite(gb)) return fail(400, "โควตาไม่ถูกต้อง");
      const { error } = await sb.rpc("storage_quota_set", { p_gb: gb });
      if (error) return dbFail("quoteFiles.quota", error);
      return ok({ ok: true });
    }
    default: return fail(400, "คำสั่งไม่ถูกต้อง");
  }
});

export const quoteFilesDELETE = handler("quoteFiles.remove", async (req: NextRequest, sb) => {
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!path) return fail(400, "ไม่ได้ระบุไฟล์");
  const { data, error } = await sb.storage.from(BUCKET).remove([path]);
  if (error) return dbFail("quoteFiles.remove", error as { message: string; code?: string });
  if (!data?.length) return fail(409, "ลบไฟล์ไม่ได้ — ส่งใบ HQ แล้ว หรือไม่ใช่ไฟล์ฝั่งของคุณ");
  return ok({ ok: true });
});
