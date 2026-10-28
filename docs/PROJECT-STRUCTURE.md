# Benjamin PMS — โครงสร้างโปรเจกต์ (Folder Structure)

> โครงสร้างโค้ดสำหรับ Next.js (App Router) + Prisma + TypeScript — ยังไม่สร้างโค้ด เป็นพิมพ์เขียวสำหรับ scaffold เฟสถัดไป

```
pms-benjamin/
├── docs/                          # เอกสารออกแบบ (ปัจจุบัน)
│   ├── PMS-PLAN.md                # แผนภาพรวม
│   ├── ARCHITECTURE.md            # สถาปัตยกรรม
│   ├── archive/DATABASE-SCHEMA.md # เอกสารเก่า (ไม่ใช่ข้อกำหนดปัจจุบัน)
│   └── PERMISSIONS.md             # RBAC matrix
│
├── prisma/
│   ├── schema.prisma              # โครงสร้างฐานข้อมูล (สร้างแล้ว)
│   ├── migrations/                # (gen ตอน migrate)
│   └── seed.ts                    # ข้อมูลตั้งต้น: HQ, ดีลเลอร์, สินค้า, ราคากลาง
│
├── src/
│   ├── app/                       # หน้าจอ (App Router)
│   │   ├── (auth)/
│   │   │   └── login/
│   │   ├── (app)/                 # ต้องล็อกอิน (layout มี sidebar)
│   │   │   ├── dashboard/         # แดชบอร์ด (ปรับตาม role)
│   │   │   ├── leads/             # CRM: pipeline + รายละเอียด
│   │   │   ├── customers/
│   │   │   ├── quotations/        # ใบเสนอราคา + BOQ builder
│   │   │   ├── projects/
│   │   │   │   └── [id]/          # tab: เฟส | เอกสาร | รูป | QC | ส่งมอบ
│   │   │   ├── dealers/           # (HQ) ทะเบียนดีลเลอร์
│   │   │   ├── master/            # (HQ) สินค้า/ราคา/วัสดุ
│   │   │   ├── reports/
│   │   │   └── settings/
│   │   └── api/
│   │       ├── webhooks/
│   │       │   ├── web-lead/      # รับลูกค้าเป้าหมายจากฟอร์มเว็บ benjamin
│   │       │   └── line/          # LINE webhook
│   │       └── ...route handlers
│   │
│   ├── server/                    # ฝั่งเซิร์ฟเวอร์ (business logic)
│   │   ├── auth/                  # Auth.js config + session
│   │   ├── db.ts                  # Prisma client
│   │   ├── tenant.ts              # tenantWhere(ctx), withTenant()  ← หัวใจ multi-tenant
│   │   ├── policy.ts              # RBAC: can(role, action, resource)
│   │   ├── services/
│   │   │   ├── lead.service.ts    # routing, pipeline
│   │   │   ├── quotation.service.ts # BOQ calc, approval flow
│   │   │   ├── project.service.ts # สร้าง 6 เฟส, workflow
│   │   │   ├── report.service.ts  # aggregate แดชบอร์ด
│   │   │   ├── notify.service.ts  # LINE/Email
│   │   │   └── audit.service.ts   # AuditLog
│   │   └── actions/               # Server Actions (เรียกจาก UI)
│   │
│   ├── components/                # UI ใช้ซ้ำ (shadcn/ui + custom)
│   │   ├── ui/                    # shadcn primitives
│   │   ├── leads/ quotations/ projects/ dashboard/  # ตามโดเมน
│   │   └── layout/                # sidebar, topbar, role-guard
│   │
│   ├── lib/                       # utils, constants, validators (zod)
│   │   ├── validators/            # zod schema ต่อฟอร์ม
│   │   ├── boq.ts                 # สูตรคำนวณ BOQ (พื้นที่/เหล็ก)
│   │   └── i18n/                  # ไทย/อังกฤษ
│   │
│   └── types/                     # TypeScript types ร่วม
│
├── public/
├── .env.example                   # DATABASE_URL, AUTH_SECRET, LINE_*, R2_*
├── package.json
└── README.md
```

## หลักการจัดโครงสร้าง
- **UI ↔ Service แยกกัน** — หน้าจอเรียกผ่าน Server Actions → service เท่านั้น (ไม่ query Prisma ตรงจาก UI)
- **ทุก service ต้องผ่าน `tenant.ts` + `policy.ts`** ก่อนแตะข้อมูล
- **โดเมนเป็นแกน** — แต่ละ feature (lead/quotation/project) มี action + service + component ของตน
- **Validation ด้วย zod** ทั้งฝั่ง client และ server

## ลำดับ scaffold เมื่อเริ่มสร้างจริง (เฟส 0)
1. `create-next-app` + Tailwind + shadcn/ui
2. ติดตั้ง Prisma → ใช้ `schema.prisma` ที่มี → `migrate` + `seed` (HQ + ดีลเลอร์ตัวอย่าง)
3. Auth.js + session ฝัง `dealerId/role`
4. `tenant.ts` + `policy.ts` + layout มี role-guard
5. หน้า dashboard ว่าง + เมนูตาม role → พร้อมต่อเฟส 1 (CRM)
```
