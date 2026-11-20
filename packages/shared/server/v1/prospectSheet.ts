// ── /api/v1/prospect-sheet — ดึงชีต Google Sheets (ลีด Facebook) มาเข้าหน้าตัวอย่างนำเข้าเดิม (บอสสั่ง 20 พ.ย. 69) ────────────
//   POST { url } → { fileName, sheets: [[ชื่อชีต, ตาราง]] } · หน้าเว็บส่งตารางเข้า เตรียมแถวเฟซบุ๊ก ตัวเดียวกับไฟล์ .xlsx (ไม่มีทางที่สอง)
//   ความปลอดภัย (ดึงของภายนอกจากเซิร์ฟเวอร์):
//     · รับเฉพาะ https://docs.google.com/spreadsheets/d/<รหัส>/… — ดึงรหัสด้วย regex เข้ม แล้ว "ประกอบ" ลิงก์ส่งออกเอง (…/export?format=xlsx)
//       ไม่เคยดึงลิงก์ที่ผู้ใช้ส่งมาตรง ๆ · ตามการเปลี่ยนทางเองทีละขั้น (≤ 5) เฉพาะ https บน docs.google.com / *.googleusercontent.com
//       เปลี่ยนทางไป accounts.google.com = ชีตไม่เปิดแชร์ · โดเมนอื่น = ปฏิเสธ
//     · เพดานขนาด 10 MB (เช็กทั้ง content-length และระหว่างอ่าน) · หมดเวลา 20 วินาที · เพดานคำขอเหมือนทางอื่น (handler)
//     · สิทธิ์เดียวกับนำเข้า (can_write_master) — ตรวจก่อนดึง · ไม่เก็บไฟล์ · ไม่ลงบันทึกเนื้อหา/ลิงก์
import type { NextRequest } from "next/server";
import { handler, ok, fail } from "./_ctx";
import { แยกสมุดงานจากXlsx } from "../../lib/importSheet";

export { runtime } from "./_ctx";

export const ขนาดสูงสุดชีต = 10 * 1024 * 1024;
const หมดเวลา = 20_000;
const เปลี่ยนทางได้สูงสุด = 5;
export const ข้อความไม่เปิดแชร์ = "ชีตยังไม่เปิดให้ทุกคนที่มีลิงก์ดูได้ — ตั้งแชร์แล้วลองใหม่";

/** รหัสชีตจากลิงก์ Google Sheets · ไม่ใช่ลิงก์ชีต = null (regex เข้ม: https · docs.google.com · /spreadsheets/d/<รหัส>) */
export function รหัสชีต(ลิงก์: unknown): string | null {
  const s = String(ลิงก์ ?? "").trim();
  if (s.length > 2_000) return null;
  const m = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,128})(?:[/?#][^\s]*)?$/.exec(s);
  return m ? m[1] : null;
}
/** ลิงก์ส่งออกที่ประกอบเอง (ไม่ใช้ลิงก์ของผู้ใช้) */
export const ลิงก์ส่งออก = (รหัส: string) => `https://docs.google.com/spreadsheets/d/${encodeURIComponent(รหัส)}/export?format=xlsx`;

/** ปลายทางการเปลี่ยนทางที่ตามได้ */
function ตามได้(u: URL): boolean {
  if (u.protocol !== "https:") return false;
  return u.hostname === "docs.google.com" || u.hostname.endsWith(".googleusercontent.com");
}

export class ดึงชีตไม่ได้ extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** ดึงไฟล์ .xlsx ของชีต · fetcher ส่งเข้ามาได้ (ข้อทดสอบใช้ตัวดึงจำลอง) */
export async function ดึงไฟล์ชีต(รหัส: string, fetcher: typeof fetch = fetch): Promise<ArrayBuffer> {
  let ที่ = new URL(ลิงก์ส่งออก(รหัส));
  const สัญญาณ = AbortSignal.timeout(หมดเวลา);
  for (let ครั้ง = 0; ครั้ง <= เปลี่ยนทางได้สูงสุด; ครั้ง++) {
    let res: Response;
    try {
      res = await fetcher(ที่.toString(), { redirect: "manual", signal: สัญญาณ, headers: { accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
    } catch (e) {
      if ((e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError") throw new ดึงชีตไม่ได้("ดึงชีตนานเกินไป — ลองใหม่อีกครั้ง หรือดาวน์โหลดเป็น .xlsx แล้วนำเข้าจากไฟล์", 504);
      throw new ดึงชีตไม่ได้("ติดต่อ Google Sheets ไม่ได้ — ลองใหม่อีกครั้ง", 502);
    }
    if (res.status >= 300 && res.status < 400) {
      const ไป = res.headers.get("location");
      if (!ไป) throw new ดึงชีตไม่ได้("Google Sheets ตอบกลับผิดปกติ — ลองใหม่อีกครั้ง", 502);
      const ต่อ = new URL(ไป, ที่);
      if (ต่อ.hostname === "accounts.google.com" || ต่อ.hostname.endsWith(".accounts.google.com")) throw new ดึงชีตไม่ได้(ข้อความไม่เปิดแชร์, 403);
      if (!ตามได้(ต่อ)) throw new ดึงชีตไม่ได้("ลิงก์ชีตพาไปที่อื่นที่ไม่ใช่ Google Sheets — ไม่ดึงให้", 400);
      ที่ = ต่อ;
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new ดึงชีตไม่ได้(ข้อความไม่เปิดแชร์, 403);
    if (res.status === 404) throw new ดึงชีตไม่ได้("ไม่พบชีตนี้ — ตรวจลิงก์อีกครั้ง", 404);
    if (!res.ok) throw new ดึงชีตไม่ได้(`Google Sheets ตอบกลับผิดปกติ (รหัส ${res.status}) — ลองใหม่อีกครั้ง`, 502);
    const ชนิด = (res.headers.get("content-type") ?? "").toLowerCase();
    if (ชนิด.includes("text/html")) throw new ดึงชีตไม่ได้(ข้อความไม่เปิดแชร์, 403);   // หน้าเข้าระบบ/หน้าขอสิทธิ์
    const ยาว = Number(res.headers.get("content-length") ?? "0");
    if (ยาว > ขนาดสูงสุดชีต) throw new ดึงชีตไม่ได้("ชีตใหญ่เกิน 10 MB — แบ่งชีตหรือลบแถวเก่าก่อน", 413);
    return อ่านไม่เกิน(res, ขนาดสูงสุดชีต);
  }
  throw new ดึงชีตไม่ได้("Google Sheets เปลี่ยนทางหลายครั้งเกินไป — ลองใหม่อีกครั้ง", 502);
}

async function อ่านไม่เกิน(res: Response, สูงสุด: number): Promise<ArrayBuffer> {
  if (!res.body) return new ArrayBuffer(0);
  const ตัวอ่าน = res.body.getReader();
  const ชิ้น: Uint8Array[] = [];
  let รวม = 0;
  for (;;) {
    const { done, value } = await ตัวอ่าน.read();
    if (done) break;
    รวม += value.byteLength;
    if (รวม > สูงสุด) { await ตัวอ่าน.cancel().then(() => undefined, () => undefined); throw new ดึงชีตไม่ได้("ชีตใหญ่เกิน 10 MB — แบ่งชีตหรือลบแถวเก่าก่อน", 413); }
    ชิ้น.push(value);
  }
  const ผล = new Uint8Array(รวม);
  let ตำแหน่ง = 0;
  for (const c of ชิ้น) { ผล.set(c, ตำแหน่ง); ตำแหน่ง += c.byteLength; }
  return ผล.buffer;
}

/** ดึง + แปลงเป็นตาราง (ตัวอ่าน .xlsx ตัวเดียวกับหน้าเว็บ) — ไม่ใช่ไฟล์ xlsx = ข้อความไม่เปิดแชร์ (Google ส่งหน้าอื่นมาแทน) */
export async function ตารางจากชีต(รหัส: string, fetcher: typeof fetch = fetch): Promise<[string, string[][]][]> {
  const ไฟล์ = await ดึงไฟล์ชีต(รหัส, fetcher);
  const หัว = new Uint8Array(ไฟล์.slice(0, 2));
  if (หัว[0] !== 0x50 || หัว[1] !== 0x4b) throw new ดึงชีตไม่ได้(ข้อความไม่เปิดแชร์, 403);   // ไม่ใช่ zip ("PK")
  try { return [...(await แยกสมุดงานจากXlsx(ไฟล์)).entries()]; }
  catch { throw new ดึงชีตไม่ได้("อ่านชีตไม่ได้ — ดาวน์โหลดเป็น .xlsx แล้วนำเข้าจากไฟล์แทน", 422); }
}

export const prospectSheetPOST = handler("prospectSheet.fetch", async (req: NextRequest, sb) => {
  const b = (await req.json().catch(() => null)) as { url?: unknown } | null;
  const รหัส = รหัสชีต(b?.url);
  if (!รหัส) return fail(400, "ลิงก์ต้องเป็นลิงก์ Google Sheets (https://docs.google.com/spreadsheets/d/…)");
  // สิทธิ์เดียวกับนำเข้า (hq_prospects_import ตรวจ can_write_master) — ตรวจก่อนออกไปดึงของภายนอก
  const { data: ได้สิทธิ์, error } = await sb.rpc("can_write_master");
  if (error || ได้สิทธิ์ !== true) return fail(403, "นำเข้าผู้สนใจได้เฉพาะผู้ดูแลระบบ/ผู้บริหารสำนักงานใหญ่");
  try {
    const sheets = await ตารางจากชีต(รหัส);
    return ok({ fileName: `Google Sheets ${รหัส.slice(0, 6)}…`, sheets });
  } catch (e) {
    if (e instanceof ดึงชีตไม่ได้) return fail(e.status, e.message);
    console.error("[api/v1/prospectSheet] ดึงชีตไม่สำเร็จ", (e as Error)?.name);   // ไม่ลงลิงก์/เนื้อหา
    return fail(502, "ดึงชีตไม่สำเร็จ — ลองใหม่อีกครั้ง");
  }
});
