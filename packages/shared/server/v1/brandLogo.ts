// ── /api/v1/brand-logo — โลโก้ของระบบที่ HQ เปลี่ยนได้ (บอสสั่ง 24 พ.ย. 69 · ใบ 0304) ─────────────────────
//   GET ?op=meta  sha ของโลโก้ปัจจุบัน (null = ใช้โลโก้เดิม) — ในนามผู้ใช้ (ต้องล็อกอิน)
//   GET ?v=<sha>  ตัวรูป: อ่านด้วยใบผ่านของผู้ใช้ฝั่งเซิร์ฟเวอร์ (asCaller · brand_logo_bytes ให้ผู้ล็อกอินเท่านั้น) → ส่งไบต์ให้ <img>
//                 ชนิดไฟล์ = ที่ฐานตรวจไว้ตอนอัป (png/jpeg/webp เท่านั้น · ตรวจซ้ำกับไบต์ก่อนส่ง) + nosniff · หน้าเว็บไม่ได้ base64 ผ่าน RPC โดยตรง
//                 ⚠️ ไม่ใช้กุญแจ service — แอปดีลเลอร์ไม่มี SUPABASE_SERVICE_ROLE_KEY โดยตั้งใจ (docs/VERCEL.md · คนรวมงานตัดสิน 25 พ.ย. 69)
//                    เดิมอ่านด้วยกุญแจ service → เส้นทางของดีลเลอร์ตอบ 501 เมนูดีลเลอร์ขึ้นโลโก้เดิมเสมอ (ข้อตก brand-logo-upload [ui·dealer])
//   ไม่ล็อกอิน (ไม่มีใบผ่าน) = 401 ทุกทาง (handler กลาง)
//   POST { base64 }  HQ เปลี่ยนโลโก้ — ตรวจชนิดจากไบต์ + ขนาด ก่อนส่งฐาน (ฐานตรวจซ้ำและเป็นตัวตัดสิน)
//   DELETE           HQ กลับไปใช้โลโก้ Benjamin เดิม
//   หน้าเข้าระบบไม่เรียกเส้นทางนี้ (ยังไม่ล็อกอิน = โลโก้เดิมเสมอ · ไม่เปิดให้ anon ตามใบ 0297)
import type { NextRequest } from "next/server";
import { handler, ok, dbFail, fail } from "./_ctx";
import { ตรวจไฟล์โลโก้, ชนิดจากไบต์, โลโก้ใหญ่สุด } from "@pms/shared/lib/brandLogo";

export { runtime } from "./_ctx";

export const brandLogoGET = handler("brandLogo.read", async (req: NextRequest, sb) => {
  const q = new URL(req.url).searchParams;
  if (q.get("op") === "meta") {
    const { data: sha, error } = await sb.rpc("brand_logo_meta");
    if (error) return dbFail("brandLogo.meta", error);
    return ok((sha as string | null) ?? null);
  }
  const ไม่มี = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const { data, error } = await sb.rpc("brand_logo_bytes");
  if (error) return dbFail("brandLogo.bytes", error);
  const แถว = (Array.isArray(data) ? data[0] : data) as { mime?: string; sha256?: string; data_base64?: string } | null;
  if (!แถว?.data_base64 || !แถว.mime) return ไม่มี();
  const ไบต์ = Buffer.from(แถว.data_base64, "base64");
  // ชนิดที่ส่ง = ชนิดที่ฐานเก็บ (ตรวจจากไบต์ตอนอัป) · ต้องตรงกับไบต์จริงอีกชั้น — ไม่ตรง/นอกรายการ = ไม่ส่ง
  const ชนิด = ชนิดจากไบต์(new Uint8Array(ไบต์));
  if (!ชนิด || ชนิด !== แถว.mime) { console.error("[api/v1/brandLogo.read] ชนิดไฟล์ในฐานไม่ตรงกับไบต์", แถว.mime); return ไม่มี(); }
  // ที่อยู่มี sha ตรงกับไฟล์ = เก็บในเครื่องได้ยาว (เปลี่ยนโลโก้ = sha ใหม่ = ที่อยู่ใหม่) · ไม่ตรง = ไม่เก็บ
  const ตรงรุ่น = q.get("v") === แถว.sha256;
  return new Response(new Uint8Array(ไบต์), {
    status: 200,
    headers: {
      "Content-Type": ชนิด,
      "Content-Length": String(ไบต์.length),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": ตรงรุ่น ? "private, max-age=31536000, immutable" : "private, no-cache",
    },
  });
});

export const brandLogoPOST = handler("brandLogo.write", async (req: NextRequest, sb) => {
  const b = (await req.json().catch(() => null)) as { base64?: unknown } | null;
  const b64 = typeof b?.base64 === "string" ? b.base64.replace(/\s/g, "") : "";
  // base64 ยาวเกิน 1 MB ชัดเจน = ไม่ต้องถอด
  if (b64.length > Math.ceil(โลโก้ใหญ่สุด / 3) * 4 + 4) return fail(400, "ไฟล์โลโก้ใหญ่เกิน 1 MB");
  const ไบต์ = new Uint8Array(Buffer.from(b64, "base64"));
  const ผิด = ตรวจไฟล์โลโก้(ไบต์);
  if (ผิด) return fail(400, ผิด);
  const { data, error } = await sb.rpc("brand_logo_set", { p_base64: b64 });
  if (error) return dbFail("brandLogo.set", error);
  return ok((data as string | null) ?? null);
});

export const brandLogoDELETE = handler("brandLogo.clear", async (_req: NextRequest, sb) => {
  const { error } = await sb.rpc("brand_logo_clear");
  if (error) return dbFail("brandLogo.clear", error);
  return ok(null);
});
