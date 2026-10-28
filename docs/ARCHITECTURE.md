# Benjamin PMS — สถาปัตยกรรมระบบ (System Architecture)

> เอกสารโครงสร้างระดับสถาปัตยกรรม คู่กับ [PMS-PLAN.md](./PMS-PLAN.md), [DATABASE-SCHEMA.md](./archive/DATABASE-SCHEMA.md), [PERMISSIONS.md](./PERMISSIONS.md)

---

## 1. ภาพรวมสถาปัตยกรรม (High-level)

```
┌────────────────────────────────────────────────────────────┐
│                        CLIENTS                              │
│   เว็บ HQ/Dealer (Browser)   │   LINE OA   │  เว็บ benjamin │
└───────────────┬──────────────┴──────┬──────┴───────┬────────┘
                │ HTTPS                │ Webhook      │ Lead form
                ▼                      ▼              ▼
┌────────────────────────────────────────────────────────────┐
│                    APPLICATION (Next.js)                    │
│  ┌──────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │ UI (React)   │  │ Server Actions/ │  │ Webhook/API    │  │
│  │ shadcn/ui    │  │ API Routes      │  │ (lead, LINE)   │  │
│  └──────────────┘  └────────┬────────┘  └────────────────┘  │
│         ┌───────────────────┼───────────────────┐           │
│         ▼                   ▼                   ▼            │
│  ┌────────────┐   ┌──────────────────┐   ┌──────────────┐   │
│  │ Auth/RBAC  │   │ Service Layer    │   │ Tenant Guard │   │
│  │ (Auth.js)  │   │ (business logic) │   │ (dealer_id)  │   │
│  └────────────┘   └────────┬─────────┘   └──────────────┘   │
└────────────────────────────┼───────────────────────────────┘
                             ▼
        ┌────────────────────┴─────────────────────┐
        ▼              ▼              ▼             ▼
   ┌─────────┐   ┌──────────┐   ┌──────────┐  ┌──────────┐
   │PostgreSQL│  │ Storage  │   │ LINE API │  │ Email    │
   │ +Prisma  │  │ (R2/S3)  │   │ Messaging│  │ (Resend) │
   └─────────┘   └──────────┘   └──────────┘  └──────────┘
```

---

## 2. ชั้นของระบบ (Layers)

| ชั้น | หน้าที่ | เทคโนโลยี |
|------|--------|-----------|
| **Presentation** | UI, ฟอร์ม, แดชบอร์ด, กราฟ | Next.js (App Router), React, Tailwind, shadcn/ui, Tremor |
| **Application/API** | Server Actions, REST/route handlers, webhook | Next.js Server Actions + Route Handlers |
| **Security** | Authentication, RBAC, Tenant Isolation | Auth.js, middleware, policy guard |
| **Service (Domain)** | Business logic: lead routing, BOQ calc, approval, project workflow | TypeScript service modules |
| **Data Access** | ORM, query, transaction | Prisma |
| **Persistence** | ฐานข้อมูลหลัก + ไฟล์ | PostgreSQL + Object Storage |
| **Integration** | แจ้งเตือน, รับลูกค้าเป้าหมาย | LINE Messaging API, Email, Web lead webhook |

---

## 3. กลยุทธ์ Multi-tenant (หัวใจของระบบ)

**รูปแบบ: Shared Database + Shared Schema + `dealer_id` discriminator** (เหมาะกับ SME, ต้นทุนต่ำ, HQ รวมรายงานง่าย)

หลักการบังคับใช้ 3 ชั้น (Defense in depth):
1. **Session** — ตอนล็อกอินฝัง `dealerId` + `role` ใน JWT/session
2. **Tenant Guard (Service layer)** — ทุก query ผ่าน helper ที่ inject `where: { dealerId }` อัตโนมัติ
   - ผู้ใช้ HQ (role ขึ้นต้น `HQ_`/`SUPER`) → `scopeAll = true` ข้ามตัวกรอง
3. **Database (option เสริม)** — เปิด PostgreSQL Row-Level Security เป็นแนวกันชนสุดท้าย

> กฎทอง: **ห้าม** query ตารางธุรกรรมตรงๆ — ต้องผ่าน `withTenant(ctx)` เสมอ

```ts
// pseudo
function tenantWhere(ctx) {
  return ctx.scopeAll ? {} : { dealerId: ctx.dealerId }
}
```

---

## 4. Flow การยืนยันตัวตน & สิทธิ์ (Auth Flow)

```
Login → Auth.js ตรวจรหัส → สร้าง session { userId, dealerId, role, scopeAll }
      → ทุก request: middleware เช็ก session + เส้นทางที่อนุญาตตาม role
      → Server Action: policy.can(role, action, resource) ก่อนทำงาน
      → Data: tenantWhere(ctx) กรองข้อมูล
```

ดูเมทริกซ์สิทธิ์เต็มใน [PERMISSIONS.md](./PERMISSIONS.md)

---

## 5. การไหลของข้อมูลหลัก (Key Data Flows)

**A. ลูกค้าเป้าหมายเข้าระบบ → ปิดการขาย → เปิดโครงการ**

> **ช่องทางหลัก = ดีลเลอร์กรอกลูกค้า/ลูกค้าเป้าหมายเอง** — เมื่อดีลเลอร์กรอก ระบบผูก `dealerId` = ดีลเลอร์ตนทันที (ข้ามขั้นมอบหมาย)

```
[A1] ช่องทางหลัก: Dealer Sales กรอก Customer + Lead เอง
       → dealerId = ดีลเลอร์ตน อัตโนมัติ (เป็นเจ้าของลูกค้าเป้าหมายทันที)
       → ทำ Activity/สำรวจ → สร้าง Quotation (BOQ)
       → อนุมัติ (เกินวงเงิน → HQ) → ส่งลูกค้า → ชนะ
       → แปลง Quotation → Project (สร้าง 6 ProjectPhase อัตโนมัติ)

[A2] ช่องทางเสริม: ฟอร์มเว็บ/LINE → Webhook → Lead (dealerId=null, เข้า pool กลาง)
       → HQ/auto-routing ตามจังหวัด → มอบหมายดีลเลอร์ → เข้าสู่ flow เดียวกับ A1
```

**หมายเหตุ multi-tenant:** ลูกค้าถูกกรอกแยกตามดีลเลอร์ — ลูกค้ารายเดียวกันอาจมีหลาย record คนละ `dealerId` ได้ (ถูกต้องตามหลัก isolation) HQ เห็นภาพรวมและตรวจ duplicate ข้ามดีลเลอร์ได้ในรายงาน

**B. โครงการ 6 เฟส → ส่งมอบ**
```
Project → Phase 1..6 (อัปเดต progress, task, รูป, QC)
  → Handover + สร้าง Warranty → ปิดงาน → เข้าสู่รายงาน
```

**C. รายงานผู้บริหาร**
```
ทุก event เขียน metric → Dashboard query รวม (HQ เห็นทุก dealer / Dealer เห็นของตน)
```

---

## 6. การตั้งค่าเริ่มต้น (Default Decisions — ปรับได้)

| ประเด็น | ค่าเริ่มต้นที่เลือก |
|---------|---------------------|
| คำนวณ BOQ | กึ่งอัตโนมัติ — มีสูตรพื้นที่/ปริมาณเหล็กช่วย แต่แก้มือทับได้ |
| วงเงินอนุมัติ HQ | ส่วนลด > 10% หรือราคาต่ำกว่าราคาพื้น → ต้องให้ HQ อนุมัติ (ตั้งค่าได้) |
| มอบหมายลูกค้าเป้าหมาย | อัตโนมัติตามจังหวัด + HQ override ได้ |
| Customer Portal | เลื่อนไปเฟส 5 (ไม่อยู่ใน MVP) |
| ราคา | HQ ตั้งราคากลาง, ดีลเลอร์ปรับได้ในกรอบ margin ที่กำหนด |

---

## 7. Non-functional Requirements
- **ความปลอดภัย**: tenant isolation, audit log ทุก write, เข้ารหัสรหัสผ่าน (bcrypt/argon2), HTTPS
- **i18n**: ไทยเป็นค่าหลัก, รองรับอังกฤษ
- **Audit**: ทุกการสร้าง/แก้ไข/ลบ ของตารางธุรกรรม → AuditLog
- **Performance**: index `dealer_id`, pagination, แดชบอร์ดใช้ aggregate/materialized view เมื่อข้อมูลโต
- **Backup**: สำรองฐานข้อมูลรายวัน
- **Deployment**: Vercel (app) + Managed Postgres (Neon/Supabase) + R2 (ไฟล์)
