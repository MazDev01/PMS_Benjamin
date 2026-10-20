// ─── ตารางสิทธิ์ตามบทบาท (ฝั่งสำนักงานใหญ่) — ข้อมูลล้วน ไม่มีหน้าจอปน ────────────
// แยกออกมาจากหน้าจอเพื่อให้เขียนเทสต์ตรงได้ว่า "หัวข้อในตารางตรงกับเมนูจริงไหม"
import type { Permission } from "@pms/shared/lib/permissions";

// โมดูลในตารางสิทธิ์ = "เมนูที่มีอยู่จริงในระบบ" เท่านั้น — ต้องตรงกับ Sidebar ฝั่งสำนักงานใหญ่
//
// ⚠️ เดิมมีแถว "รายงาน" ซึ่งไม่มีหน้านั้นอยู่ในระบบเลย (ตกค้างจากสเปกตั้งต้น · บอสทักท้วง 3 ก.ย. 69)
//    และขาดสามเมนูที่มีจริง: ภาพรวมยอดขาย · แคตตาล็อกแม่แบบ · บันทึกการใช้งาน
//    ตารางสิทธิ์ที่ไม่ตรงกับเมนูจริง = ผู้ดูแลอ่านแล้วเข้าใจสิทธิ์ของทีมตัวเองผิด
// รอบ 2 ช่วง ง (20 ต.ค. 69): เติม 3 เมนูที่เพิ่มทีหลังแล้วตารางขาด — ลูกค้าเป้าหมาย (HQ) · ใบค่าแฟรนไชส์ · คำขอใบเสนอราคา
//   เรียงตามเมนูข้าง (navConfig.tsx)
export const MODULE_LIST = [
  "แดชบอร์ด", "ลูกค้าเป้าหมาย (HQ)", "ใบค่าแฟรนไชส์", "ดีลเลอร์", "ภาพรวมยอดขาย", "คำขอใบเสนอราคา",
  "ลูกค้าเป้าหมายทั้งเครือ", "ใบเสนอราคาทั้งเครือ", "ลูกค้าทั้งเครือ", "บันทึกการใช้งาน", "ตั้งค่า",
];
// ตารางสิทธิ์คำนวณจาก ROLE_PERMISSIONS ซึ่งเป็นชุดเดียวกับที่ RLS ที่ DB บังคับ
//
// เดิมตารางนี้เขียนไว้ตายตัวและ "ขัดกับของจริง" — บอกว่าผู้จัดการฝ่ายขายจัดการลูกค้าเป้าหมาย/ลูกค้า/
// ใบเสนอราคาได้ ทั้งที่ทุกบทบาทฝั่งสำนักงานใหญ่เขียนงานขายไม่ได้เลย (ดู C3)
// ใครอ่านตารางนี้แล้วเชื่อ จะเข้าใจสิทธิ์ของทีมตัวเองผิดทั้งหมด
// สิทธิ์ "ดู" ของแต่ละเมนู = เงื่อนไขเดียวกับที่หน้านั้นใช้กันจริง (AdminGate ในแต่ละหน้า)
// เช่น /hq/dealers กั้นด้วย dealers:manage · /hq/settings กั้นด้วย hq:all_data (เมนูแคตตาล็อกแม่แบบลบแล้ว 16 ต.ค. 69)
export const MODULE_PERMS: Record<string, { read: Permission; create?: Permission; update?: Permission; del?: Permission }> = {
  "แดชบอร์ด":              { read: "reports:view" },
  // ลูกค้าเป้าหมาย (HQ) / ใบค่าแฟรนไชส์ — หน้าเปิดได้ทุกบทบาท HQ แต่ปุ่มเพิ่ม/แก้/ลบ กั้นด้วย dealers:manage (prospects · proposals page.tsx)
  "ลูกค้าเป้าหมาย (HQ)":   { read: "reports:view", create: "dealers:manage", update: "dealers:manage", del: "dealers:manage" },
  "ใบค่าแฟรนไชส์":         { read: "reports:view", create: "dealers:manage", update: "dealers:manage", del: "dealers:manage" },
  // คำขอใบเสนอราคา — ทุกบทบาท HQ ดูกล่องงานได้ · การทำ/ส่งใบ HQ ขึ้นกับรายชื่อบทบาทที่ตั้งไว้ในฐาน (quote_pricing_roles)
  //   ตารางนี้แสดงเฉพาะสิทธิ์ดู (สิทธิ์ทำราคาตั้งที่ ตั้งค่า ไม่ใช่ที่บทบาท)
  "คำขอใบเสนอราคา":        { read: "reports:view" },
  "ดีลเลอร์":         { read: "dealers:manage", create: "dealers:manage", update: "dealers:manage", del: "dealers:manage" },
  "ภาพรวมยอดขาย":         { read: "analytics:view" },
  "ลูกค้าเป้าหมายทั้งเครือ": { read: "leads:read", create: "leads:create", update: "leads:update", del: "leads:delete" },
  "ใบเสนอราคาทั้งเครือ":    { read: "quotations:read", create: "quotations:create", update: "quotations:update", del: "quotations:delete" },
  "ลูกค้าทั้งเครือ":        { read: "customers:read", create: "customers:create", update: "customers:update", del: "customers:delete" },
  // ล้างบันทึกได้เฉพาะผู้ดูแลระบบ (audit/page.tsx) — ผูกกับ hq:all_data ซึ่งมีเฉพาะบทบาทนั้นกับผู้บริหาร
  "บันทึกการใช้งาน":        { read: "reports:view", del: "hq:all_data" },
  "ตั้งค่า":               { read: "hq:all_data", create: "settings:edit", update: "settings:edit", del: "settings:edit" },
};
