// ── ดีลเลอร์ทดสอบรหัสยาว 5 ตัวอักษร (ตัวกว้างสุด W) พร้อมลูกค้า + ใบที่ตอบรับแล้ว — ใช้ตรวจ "รหัสโดนตัด" (รอบ 2 ช่วง ข) ──────
//   รหัสดีลเลอร์ยาวได้ถึง 5 ตัว (link-prospect ^[A-Z]{2,5}$) · W กว้างที่สุดในฟอนต์ไทย/อังกฤษที่ใช้ = กรณีแย่สุด
//   ต้องมีข้อมูลครบทุกหน้า: ทะเบียนดีลเลอร์ · ลูกค้าทั้งเครือ · ใบเสนอราคาทั้งเครือ · ภาพรวมยอดขาย
import { adminClient } from "./testDealers";
import { วางใบเดิมที่ฐาน, ลบใบทดสอบที่ฐาน } from "./legacyQuotes";

export const รหัสยาว = "ZZWWW";
const ชื่อสาขา = "ZZTEST สาขารหัสยาว (ลบทิ้ง)";
const เลขลูกค้า = 979_100_001;

export async function สร้างดีลเลอร์รหัสยาว(): Promise<{ code: string; customer: string; quoteId: string }> {
  const admin = adminClient();
  await ล้างดีลเลอร์รหัสยาว();
  const d = await admin.from("dealers").insert({ code: รหัสยาว, name: ชื่อสาขา, status: "active", province: "ระยอง", region: "ตะวันออก" });
  if (d.error) throw new Error(`สร้างดีลเลอร์รหัสยาวไม่สำเร็จ: ${d.error.message}`);
  const customer = `ZZTEST-ลูกค้ารหัสยาว`;
  const c = await admin.from("customers").insert({ id: เลขลูกค้า, dealer_code: รหัสยาว, name: customer, company: customer, province: "ระยอง", total_value: 123_456 });
  if (c.error) throw new Error(`สร้างลูกค้าของดีลเลอร์รหัสยาวไม่สำเร็จ: ${c.error.message}`);
  const quoteId = `Q-${รหัสยาว}-0001`;
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  วางใบเดิมที่ฐาน([{ id: quoteId, dealer_code: รหัสยาว, customer, customer_id: เลขลูกค้า, status: "won", total_value: 123_456, date: today, province: "ระยอง" }]);
  return { code: รหัสยาว, customer, quoteId };
}

export async function ล้างดีลเลอร์รหัสยาว(): Promise<void> {
  const admin = adminClient();
  ลบใบทดสอบที่ฐาน(`dealer_code = '${รหัสยาว}'`);
  // แถวไฟล์ของใบเกิดเองจากตัวคุมของฐาน (ใบ 0210) ต้องลบก่อนดีลเลอร์
  // เก็บกวาดไม่สำเร็จต้องดัง — เคยกลืนเงียบแล้วรอบลองซ้ำตกที่ "รหัสซ้ำ" โดยไม่รู้สาเหตุ (20 ต.ค. 69)
  for (const [ตาราง, คอลัมน์] of [["files", "dealer_code"], ["customers", "dealer_code"], ["dealers", "code"]] as const) {
    const r = await admin.from(ตาราง).delete().eq(คอลัมน์, รหัสยาว);
    if (r.error) throw new Error(`ล้าง ${ตาราง} ของดีลเลอร์รหัสยาวไม่สำเร็จ: ${r.error.message}`);
  }
}
