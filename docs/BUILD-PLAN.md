# Benjamin PMS — แผนการสร้าง (Build Plan) ทั้ง HQ และ ดีลเลอร์

> แผนลงมือสร้างจริง รวมทั้ง 2 ฝั่ง — ดูคู่กับ [PMS-PLAN.md](./PMS-PLAN.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [PERMISSIONS.md](./PERMISSIONS.md)
> **หลักการลำดับ:** สร้าง "ฝั่งผลิตข้อมูล (ดีลเลอร์)" ก่อน "ฝั่งใช้ข้อมูล (HQ)" — โดยมีรากฐานร่วมและ HQ บางๆ เป็นจุดตั้งต้น

---

## 1. ภาพรวม 2 ฝั่ง

| | ฝั่งดีลเลอร์ (ต้นน้ำ) | ฝั่ง HQ (ปลายน้ำ) |
|---|----------------------|-------------------|
| บทบาท | กรอก/ทำงานจริง | ดูภาพรวม/อนุมัติ/คุมเครือ |
| ข้อมูล | สร้างข้อมูล (lead→project) | รวม/เปรียบเทียบข้อมูล |
| ขอบเขต | เฉพาะ `dealerId` ตน | ทุกดีลเลอร์ (scopeAll) |
| สร้างเมื่อ | **ก่อน** | **หลัง** (ต้องมีข้อมูลก่อน) |

---

## 2. รากฐานร่วม (Shared Foundation) — สร้างก่อนทั้งคู่

| ส่วน | รายละเอียด | ไฟล์/ที่อยู่ |
|------|-----------|-------------|
| Project setup | Next.js (App Router) + TS + Tailwind + shadcn/ui | `src/` |
| Database | Prisma migrate จาก schema ที่มี | `prisma/schema.prisma` |
| Seed | HQ 1 + ดีลเลอร์ตัวอย่าง 2-3 + สินค้า/ราคากลาง + ผู้ใช้ทุก role | `prisma/seed.ts` |
| Auth | Auth.js + session ฝัง `{userId, dealerId, role, scopeAll}` | `src/server/auth/` |
| **Tenant guard** | `tenantWhere(ctx)` / `withTenant()` — หัวใจ multi-tenant | `src/server/tenant.ts` |
| **Policy (RBAC)** | `policy.can(role, action, resource)` | `src/server/policy.ts` |
| Audit | `audit()` เขียนทุก write (+ act-on-behalf) | `src/server/services/audit.service.ts` |
| Layout | sidebar/topbar + role-guard (เมนูปรับตาม role) | `src/components/layout/` |

> **กฎทอง:** ทุก service แตะข้อมูลต้องผ่าน `tenant.ts` + `policy.ts` เสมอ

---

## 3. งานฝั่งดีลเลอร์ (Dealer Build)

### 3.1 หน้าจอ (Routes)
```
/dashboard        แดชบอร์ดดีลเลอร์ (archive/DASHBOARD-DEALER.md · เอกสารเก่า)
/leads            pipeline (Kanban) + list
/leads/[id]       รายละเอียดลูกค้าเป้าหมาย + activity
/customers        ลูกค้า + ปุ่ม "เพิ่มลูกค้า" (กรอกเอง)
/customers/[id]   Customer 360
/quotations       ใบเสนอราคา list + สถานะ
/quotations/new   BOQ builder
/quotations/[id]  รายละเอียด + ออก PDF
/projects         โครงการ list (filter เฟส)
/projects/[id]    tab: ภาพรวม|6เฟส|เอกสาร|รูป|QC|ส่งมอบ
```

### 3.2 ลำดับสร้าง (โดเมน → action → service → component)
| # | โมดูล | สิ่งที่ทำ |
|---|-------|-----------|
| D1 | **CRM** | กรอกลูกค้าเอง (dealerId อัตโนมัติ), สร้าง/แก้ลูกค้าเป้าหมาย, activity, pipeline ลากย้ายสถานะ |
| D2 | **Quotation/BOQ** | catalog→BOQ builder→คำนวณ→ใบเสนอราคา, ส่งขออนุมัติเมื่อเกินวงเงิน, PDF |
| D3 | **Project** | แปลงใบเสนอราคาชนะ→โครงการ (gen 6 เฟส), task, อัปโหลดเอกสาร/รูป, QC, ส่งมอบ+รับประกัน |
| D4 | **Dashboard ดีลเลอร์** | KPI + Action items + funnel + active projects |

### 3.3 บทบาทย่อยที่ต้องรองรับ
- DEALER_ADMIN (เต็มในเขต + อนุมัติในวงเงิน + จัดการผู้ใช้ทีม)
- DEALER_SALES (ลูกค้าเป้าหมาย/ใบเสนอราคาที่ดูแล)
- DEALER_SITE (เฉพาะงานหน้างาน: รูป/QC/รายงานประจำวัน)

---

## 4. งานฝั่ง HQ (HQ Build)

### 4.1 หน้าจอ (Routes)
```
/dashboard        แดชบอร์ด HQ (DASHBOARD-HQ.md) — KPI รวม/Leaderboard/รออนุมัติ
/dealers          จัดการดีลเลอร์ (DEALER-MANAGEMENT.md)
/dealers/[id]     ข้อมูล|ผู้ใช้|ผลงาน|audit
/leads            + Lead pool กลาง (dealerId=null) + ปุ่มมอบหมาย
/approvals        คิวอนุมัติใบเสนอราคาเกินวงเงิน / โอนข้ามดีลเลอร์
/master           สินค้า/ราคา/วัสดุ (คุมราคากลาง)
/reports          รายงานรวม + export
```
> HQ ใช้ route ร่วมกับดีลเลอร์ได้ (เช่น /leads, /projects) แต่ `scopeAll=true` เห็นทุกดีลเลอร์ + มีส่วนเสริม (pool, อนุมัติ)

### 4.2 ลำดับสร้าง
| # | โมดูล | สิ่งที่ทำ |
|---|-------|-----------|
| H0 | **HQ บางๆ (จุดตั้งต้น)** | หน้าเพิ่มดีลเลอร์ + สร้าง Dealer Admin อัตโนมัติ (ช่วงแรกใช้ seed แทนได้) |
| H1 | **จัดการดีลเลอร์เต็ม** | list/แก้/ปิด (soft) + หน้าผลงานรายดีลเลอร์ |
| H2 | **Lead pool + มอบหมาย** | รับลูกค้าเป้าหมาย pool กลาง, auto-routing ตามจังหวัด, มอบหมาย |
| H3 | **อนุมัติ** | คิวใบเสนอราคาเกินวงเงิน + โอนข้ามดีลเลอร์ |
| H4 | **Master/ราคากลาง** | จัดการสินค้า/ราคา/margin |
| H5 | **แดชบอร์ด HQ + รายงาน** | KPI รวม, Leaderboard, ยอดรายภาค, trend, export |
| H6 | **Act-on-behalf** | HQ กรอก/แก้แทนดีลเลอร์ + banner เตือน + audit |

---

## 5. ลำดับรวม (Combined Timeline) + เกณฑ์เสร็จ (Definition of Done)

| Milestone | งาน | เสร็จเมื่อ |
|-----------|-----|-----------|
| **M0 Foundation** | Shared Foundation (ข้อ 2) + H0 (seed ดีลเลอร์) | ล็อกอินแยก HQ/ดีลเลอร์ได้, tenant กรองถูก, audit ทำงาน |
| **M1 CRM ดีลเลอร์** | D1 | ดีลเลอร์กรอกลูกค้า/ลูกค้าเป้าหมายเอง + เลื่อน pipeline ได้ (เห็นเฉพาะของตน) |
| **M2 BOQ** | D2 | ออกใบเสนอราคา + เกินวงเงินเด้งขออนุมัติ |
| **M3 Project** | D3 | แปลงใบเสนอราคา→โครงการ 6 เฟส + อัปเดตงาน/QC/ส่งมอบ |
| **M4 HQ Oversight** | H1+H2+H3 | HQ จัดการดีลเลอร์, มอบหมายลูกค้าเป้าหมาย pool, อนุมัติเกินวงเงินได้ |
| **M5 Dashboard** | D4 + H4 + H5 | แดชบอร์ด 2 ฝั่งมีข้อมูลจริง, Leaderboard/รายงานรวมถูกต้อง |
| **M6 ครบวงจร** | H6 + แจ้งเตือน LINE/Email | Act-on-behalf + แจ้งเตือนทำงาน, พร้อมใช้งานจริง |

```
M0 ──► M1 ──► M2 ──► M3 ──┐
        (ดีลเลอร์ต้นน้ำ)    ├──► M4 ──► M5 ──► M6
                            ┘   (HQ ปลายน้ำ)
```

---

## 6. เกณฑ์ตัดสินทุก Milestone (ใช้ซ้ำ)
- ☑️ Tenant isolation: ดีลเลอร์ A เห็นข้อมูล B ไม่ได้ (มี test)
- ☑️ Policy: action ที่ห้าม ถูกปฏิเสธจริง
- ☑️ Audit: ทุก write มี log (+ onBehalfOf เมื่อ HQ ทำแทน)
- ☑️ ไทยเป็นภาษาหลัก, ฟอร์มมี validation (zod)

---

## 7. เริ่มที่ไหน
**M0 (Foundation + seed)** — เป็นฐานของทั้ง HQ และดีลเลอร์ หลังจากนั้นเดินสายดีลเลอร์ (M1→M3) แล้วค่อยเปิดสาย HQ (M4→M6)
