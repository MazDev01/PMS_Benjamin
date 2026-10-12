// ── ทางผ่านของแอปดีลเลอร์ไปยัง API บัญชีของสำนักงานใหญ่ (โหมด api) ─────────────────
//
// ปัญหาที่แก้ (เจอบนเว็บใช้งานจริง 1 ก.ย. 69 — บอสกดแล้วเปลี่ยนไม่ได้):
//   โหมด api เก็บใบผ่านไว้ใน cookie แบบ httpOnly ที่โดเมนของแอปดีลเลอร์เอง
//   หน้าเว็บจึง "หยิบใบผ่านมาแนบเอง" ไม่ได้ (นั่นคือเจตนาของระยะ 4)
//   แต่ API บัญชีอยู่คนละโดเมน (แอปสำนักงานใหญ่) และรับเฉพาะ Bearer
//   → หน้าบัญชีของดีลเลอร์อ่านสถานะไม่ได้เลย ขึ้น "เกิดข้อผิดพลาด — ลองใหม่อีกครั้ง"
//     และช่องกรอกทุกช่องถูกล็อกไว้ ทั้งที่ระบบหลังบ้านทำงานปกติ
//
// ทางแก้: ให้ "เซิร์ฟเวอร์ของแอปดีลเลอร์" เป็นคนส่งต่อ — มันอ่าน cookie ของโดเมนตัวเองได้
//   แล้วแนบใบผ่านนั้นเป็น Bearer ยิงไปที่สำนักงานใหญ่แทนหน้าเว็บ
//
// ⚠️ ส่งต่อ "ใบผ่านของผู้ใช้คนที่กำลังใช้งาน" เท่านั้น — ไม่มีการใช้กุญแจระดับผู้ดูแลที่นี่
//    สำนักงานใหญ่ยังตรวจเองทุกครั้งว่าใบผ่านนี้เป็นของสาขาไหน (ดู /api/account)
//    ที่นี่จึงไม่ใช่ "ประตูลัด" — แค่ย้ายที่แนบใบผ่านจากเบราว์เซอร์มาไว้ที่เซิร์ฟเวอร์
import { NextResponse, type NextRequest } from "next/server";
import { callerToken } from "./_cookie";

export const runtime = "nodejs";

function hqOrigin(): string {
  return (process.env.NEXT_PUBLIC_HQ_ORIGIN ?? "").replace(/\/$/, "");
}

async function ส่งต่อ(req: NextRequest, method: "GET" | "POST", ปลายทาง = "/api/account"): Promise<NextResponse> {
  const origin = hqOrigin();
  if (!origin) {
    return NextResponse.json(
      { error: "ยังไม่ได้ตั้งค่า NEXT_PUBLIC_HQ_ORIGIN ที่เซิร์ฟเวอร์ — เปลี่ยนบัญชีเข้าระบบยังไม่ได้" },
      { status: 501 },
    );
  }
  const token = callerToken(req);
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const body = method === "POST" ? await req.text() : undefined;
  try {
    const res = await fetch(`${origin}${ปลายทาง}${url.search}`, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body,
      cache: "no-store",
    });
    // ส่งคำตอบกลับไปตามเดิมทั้งเนื้อความและรหัสสถานะ — หน้าเว็บจะได้เห็นเหตุผลจริง
    // (เช่น "อีเมลนี้ถูกใช้ไปแล้ว" / "ใช้สิทธิ์ครบแล้ว") ไม่ใช่ข้อความกลาง ๆ ที่แก้อะไรไม่ได้
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (e) {
    console.error("[account-proxy] ส่งต่อไปสำนักงานใหญ่ไม่สำเร็จ", e);
    return NextResponse.json({ error: "ติดต่อสำนักงานใหญ่ไม่สำเร็จ — ลองใหม่อีกครั้ง" }, { status: 502 });
  }
}

export const GET = (req: NextRequest) => ส่งต่อ(req, "GET");
export const POST = (req: NextRequest) => ส่งต่อ(req, "POST");

/** ทางผ่านของเส้นทางย่อย เช่น /api/account/reveal (ขอเลขยืนยัน + ดูรหัสผ่านของตัวเอง) */
export const revealPOST = (req: NextRequest) => ส่งต่อ(req, "POST", "/api/account/reveal");
