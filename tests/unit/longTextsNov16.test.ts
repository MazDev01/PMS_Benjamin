// ── ประโยคยาวเกิน 120 ตัว 21 ที่ (บอสตัดสิน 16 พ.ย. 69 · ui-terms-audit/longtexts-proposal.md) ──
//   ตรวจว่าคำเดิมหายจากโค้ด · คำใหม่อยู่ที่เดิม · สูตร/ข้อความรองย้ายไปไอคอน ⓘ (InfoTip) · "ลืมรหัสผ่าน ติดต่อสำนักงานใหญ่" ห้ามซ่อน
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ราก = path.resolve(__dirname, "../..");
const อ่าน = (f: string) => readFileSync(path.join(ราก, f), "utf8");

// [ไฟล์, คำเดิม (ต้องไม่มี), คำใหม่ (ต้องมี)]
const ชุด: [string, string, string][] = [
  // Drill: 23 พ.ย. 69 เป้ารายเดือนคิดตามวันแบบเดียวกับการ์ด (ผู้ตรวจ · รวมแถว = การ์ด) → "จึงต่างเล็กน้อย" ไม่จริงแล้ว · โครงคงตามคำตัดสิน (สั้นบนจอ สูตรใน ⓘ)
  ["apps/hq/app/(app)/hq/pipeline/Drill.tsx", "จึงต่างจากผลรวมรายเดือนเล็กน้อย)</div>", "ตัวเลขรวมดูที่การ์ดด้านบน (รวมทุกเดือน = การ์ด)"],
  ["apps/hq/app/(app)/hq/prospects/page.tsx", "เปิดรายนี้อีกครั้ง แล้วเลือก", "แต่ผูกกับผู้สนใจรายนี้ไม่สำเร็จ — เปิดรายนี้แล้วเลือก “ผูกกับดีลเลอร์ที่มีอยู่แล้ว”`"],
  ["apps/hq/app/(app)/hq/prospects/page.tsx", "ต้องตกลง + ชำระ", "ต้องตอบรับใบค่าแฟรนไชส์และชำระครบตามใบก่อน · เป็นดีลเลอร์อยู่แล้ว = เลือก “ผูกกับดีลเลอร์ที่มีอยู่แล้ว”"],
  ["apps/hq/app/(app)/hq/settings/page.tsx", "ผลรวมเป้ารายดีลเลอร์ด้านล่างอัตโนมัติ", "= ผลรวมเป้าของดีลเลอร์ทุกรายด้านล่าง (ระบบรวมให้) · ใช้ในการ์ดยอดขายเทียบเป้า"],
  ["apps/hq/app/api/admin/dealers/secret/route.ts", "ดีลเลอร์อาจตั้งรหัสใหม่เอง", "ใช้ไม่ได้แล้ว (ดีลเลอร์อาจเปลี่ยนเอง) — กด \"แก้อีเมล/รหัสผ่าน\" เพื่อตั้งใหม่"],
  ["apps/dealer/app/(app)/customers/page.tsx", "บอกจังหวัด/ผู้รับผิดชอบที่ระบบมีจริง", "ต้องมี ที่เหลือเว้นว่างได้ · จังหวัด/ผู้รับผิดชอบดูในแผ่น \"ค่าที่เลือกได้\""],
  ["packages/shared/components/hq/MaterialAddModal.tsx", "บันทึกครั้งเดียวทั้งชุด", "กรอกได้หลายแถว · วางจาก Excel ที่ช่องแรกได้เลย (หมวด · ชื่อวัสดุ · หน่วย · ราคา · เปิดใช้งาน)"],
  ["packages/shared/components/hq/MaterialImportModal.tsx", "ไม่ลบวัสดุที่มีอยู่", "จะไม่นำเข้า · ไม่ลบวัสดุเดิม · ยกเลิกทั้งชุดภายหลังได้"],
  ["packages/shared/components/hq/ProspectImportModal.tsx", "ระบบถอยเป็นปีก่อนให้เอง", "· วันติดตามต้องอยู่ระหว่างวันเริ่มกับวันนี้"],
  ["packages/shared/components/hq/UsersPanel.tsx", "ใช้รหัสนี้เข้าระบบครั้งแรก", "รหัสเข้าระบบครั้งแรก · อย่างน้อย 8 ตัว ห้ามเว้นวรรค · เว้นว่าง = ระบบสุ่มให้<InfoTip"],
  ["packages/shared/components/hq/UsersPanel.tsx", "ถูกจัดการโดยระบบยืนยันตัวตน", "เพิ่มผู้ใช้จากหน้านี้ไม่ได้ — ต้องสร้างบัญชีเข้าระบบก่อน แล้วชื่อจะขึ้นในหน้านี้เอง"],
  ["packages/shared/components/profile/ProfilePage.tsx", "ไปที่ ตั้งค่า › บัญชีเข้าสู่ระบบ", "แก้ที่ ตั้งค่า › บัญชีเข้าระบบ · แก้เองได้ 2 ครั้ง ครั้งต่อไปให้สำนักงานใหญ่อนุมัติ · ลืมรหัสผ่าน ติดต่อสำนักงานใหญ่"],
  ["packages/shared/lib/leadIntent.ts", "ขั้นอื่นระบบเลื่อนให้เองตามคำขอใบเสนอราคาและใบเสนอราคา", "เปลี่ยนเองได้เฉพาะ \"ปิดการขายไม่สำเร็จ\" ที่กล่องขั้นต่อไป — ขั้นอื่นระบบเลื่อนให้ตามคำขอและใบเสนอราคา"],
  ["packages/shared/server/contactEmail.ts", "ใช้งานระบบต่อได้ตามปกติ", "ส่งเลขยืนยันไม่สำเร็จ (ระบบอีเมลขัดข้อง) — กด “ส่งเลขยืนยันใหม่” ภายหลัง หรือให้สำนักงานใหญ่ยืนยันแทน"],
  ["packages/shared/server/contactEmail.ts", "อีเมลนี้ส่งจากปุ่ม", "อีเมลทดสอบจากปุ่ม “ส่งอีเมลทดสอบ” (ตั้งค่า › การแจ้งเตือน)"],
  ["packages/shared/lib/mock.ts", "Action items", "สิ่งที่ต้องทำ:"],
];

describe("ประโยคยาว 21 ที่ ใช้คำใหม่ตามที่บอสตัดสิน 16 พ.ย. 69", () => {
  it.each(ชุด)("%s: ไม่มีคำเดิม \"%s\" · มีคำใหม่", (ไฟล์, เดิม, ใหม่) => {
    const s = อ่าน(ไฟล์);
    expect(s.includes(เดิม), `คำเดิมยังอยู่ใน ${ไฟล์}`).toBe(false);
    expect(s.includes(ใหม่), `ไม่เจอคำใหม่ใน ${ไฟล์}`).toBe(true);
  });

  it("สูตร × จำนวนวัน ÷ 365 และ 'เปลี่ยนเองได้ที่หน้าข้อมูลส่วนตัว' อยู่ในไอคอน ⓘ ตัวกลาง ไม่อยู่บนจอ", () => {
    const ใน = (f: string, ข้อความ: string) => new RegExp(`<InfoTip[^>]*>[^<]*${ข้อความ}[^<]*</InfoTip>`).test(อ่าน(f));
    expect(ใน("apps/hq/app/(app)/hq/pipeline/Drill.tsx", "เป้าทั้งปี × จำนวนวัน ÷ 365"), "ข้อ 1").toBe(true);
    expect(ใน("apps/hq/app/(app)/hq/settings/page.tsx", "เป้าทั้งปี × จำนวนวัน ÷ 365"), "ข้อ 4").toBe(true);
    expect(ใน("packages/shared/components/hq/UsersPanel.tsx", "ผู้ใช้เปลี่ยนเองได้ที่หน้าข้อมูลส่วนตัว"), "ข้อ 10").toBe(true);
    for (const f of ["apps/hq/app/(app)/hq/pipeline/Drill.tsx", "apps/hq/app/(app)/hq/settings/page.tsx", "packages/shared/components/hq/UsersPanel.tsx"])
      expect(อ่าน(f), `${f} ใช้ตัวกลาง InfoTip`).toContain('import { InfoTip } from "@pms/shared/components/ui/InfoTip";');
  });

  it("ข้อ 12: 'ลืมรหัสผ่าน ติดต่อสำนักงานใหญ่' คงอยู่บนจอ ห้ามย้ายเข้า ⓘ (คนลืมรหัสต้องเห็นทันที)", () => {
    const s = อ่าน("packages/shared/components/profile/ProfilePage.tsx");
    expect(s).toContain("ลืมรหัสผ่าน ติดต่อสำนักงานใหญ่");
    expect(/<InfoTip[^>]*>[^<]*ลืมรหัสผ่าน/.test(s)).toBe(false);
  });
});
