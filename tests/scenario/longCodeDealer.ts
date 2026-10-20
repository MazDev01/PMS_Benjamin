// ── ดีลเลอร์ทดสอบรหัสยาว 5 ตัวอักษร (ตัวกว้างสุด W) พร้อมลูกค้า + ใบที่ตอบรับแล้ว — ใช้ตรวจ "รหัสโดนตัด" (รอบ 2 ช่วง ข) ──────
//   รหัสดีลเลอร์ยาวได้ถึง 5 ตัว (link-prospect ^[A-Z]{2,5}$) · W กว้างที่สุดในฟอนต์ไทย/อังกฤษที่ใช้ = กรณีแย่สุด
//   ต้องมีข้อมูลครบทุกหน้า: ทะเบียนดีลเลอร์ · ลูกค้าทั้งเครือ · ใบเสนอราคาทั้งเครือ · ภาพรวมยอดขาย
//   ดีลเลอร์นี้ไม่มีเป้า (revenue_target ตั้งต้น 0) แต่มียอดขาย — ช่วง ค ใช้ตรวจการ์ด "—" ด้วย
import { adminClient } from "./testDealers";
import { วางใบเดิมที่ฐาน, ลบใบทดสอบที่ฐาน } from "./legacyQuotes";

export const รหัสยาว = "ZZWWW";
const ชื่อสาขา = "ZZTEST สาขารหัสยาว (ลบทิ้ง)";
const เลขลูกค้า = 979_100_001;

/** code = รหัสของดีลเลอร์ทดสอบ — ไฟล์ข้อทดสอบที่รันขนานกันต้องใช้คนละรหัส
 *  (เจอจริง 20 ต.ค. 69: flow-b ลบ ZZWWW ทิ้งตอนจบ ขณะ flow-c ยังใช้อยู่ → อีกไฟล์ตกแบบไม่นิ่ง) */
export async function สร้างดีลเลอร์รหัสยาว(code: string = รหัสยาว): Promise<{ code: string; customer: string; quoteId: string }> {
  const admin = adminClient();
  await ล้างดีลเลอร์รหัสยาว(code);
  const ชื่อ = code === รหัสยาว ? ชื่อสาขา : `ZZTEST สาขา ${code} (ลบทิ้ง)`;
  const d = await admin.from("dealers").insert({ code, name: ชื่อ, status: "active", province: "ระยอง", region: "ตะวันออก" });
  if (d.error) throw new Error(`สร้างดีลเลอร์รหัสยาวไม่สำเร็จ: ${d.error.message}`);
  const customer = code === รหัสยาว ? "ZZTEST-ลูกค้ารหัสยาว" : `ZZTEST-ลูกค้า-${code}`;
  const c = await admin.from("customers").insert({ id: เลขลูกค้า, dealer_code: code, name: customer, company: customer, province: "ระยอง", total_value: 123_456 });
  if (c.error) throw new Error(`สร้างลูกค้าของดีลเลอร์รหัสยาวไม่สำเร็จ: ${c.error.message}`);
  const quoteId = `Q-${code}-0001`;
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  วางใบเดิมที่ฐาน([{ id: quoteId, dealer_code: code, customer, customer_id: เลขลูกค้า, status: "won", total_value: 123_456, date: today, province: "ระยอง" }]);
  return { code, customer, quoteId };
}

export async function ล้างดีลเลอร์รหัสยาว(code: string = รหัสยาว): Promise<void> {
  if (!/^Z[ZT][A-Z]{1,3}$/.test(code)) throw new Error(`ล้างได้เฉพาะรหัสทดสอบ (${code})`);
  const admin = adminClient();
  ลบใบทดสอบที่ฐาน(`dealer_code = '${code}'`);
  // แถวไฟล์ของใบเกิดเองจากตัวคุมของฐาน (ใบ 0210) ต้องลบก่อนดีลเลอร์
  // เก็บกวาดไม่สำเร็จต้องดัง — เคยกลืนเงียบแล้วรอบลองซ้ำตกที่ "รหัสซ้ำ" โดยไม่รู้สาเหตุ (20 ต.ค. 69)
  for (const [ตาราง, คอลัมน์] of [["files", "dealer_code"], ["customers", "dealer_code"], ["dealers", "code"]] as const) {
    const r = await admin.from(ตาราง).delete().eq(คอลัมน์, code);
    if (r.error) throw new Error(`ล้าง ${ตาราง} ของดีลเลอร์รหัสยาวไม่สำเร็จ: ${r.error.message}`);
  }
}
