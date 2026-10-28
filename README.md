# Benjamin PMS

ระบบบริหารจัดการ (Project Management System) แบบ **Multi-tenant** สำหรับ Benjamin (อาคารโครงสร้างเหล็กสำเร็จรูป PEB) และเครือข่ายดีลเลอร์ทั่วประเทศ

- **HQ (สำนักงานใหญ่)** เห็น/คุมทุกดีลเลอร์
- **Dealer (ดีลเลอร์)** เห็นเฉพาะข้อมูลของตน

## โมดูลหลัก
1. **CRM** — ลีด, pipeline, ลูกค้า, ทะเบียนดีลเลอร์
2. **ใบเสนอราคา / BOQ** — catalog EASYBUILD/RANBUILD/PREFAB, ราคากลาง, อนุมัติ
3. **บริหารโครงการ** — ตาม 6 เฟสของ Benjamin (สำรวจ→ออกแบบ→ผลิต→ติดตั้ง→QC→ส่งมอบ)
4. **รายงาน & แดชบอร์ดผู้บริหาร**

## เอกสารออกแบบ
| ไฟล์ | เนื้อหา |
|------|---------|
| [docs/PMS-PLAN.md](docs/PMS-PLAN.md) | แผนภาพรวม, roles, roadmap |
| [docs/BUILD-PLAN.md](docs/BUILD-PLAN.md) | **แผนการสร้าง HQ + ดีลเลอร์ (milestone/DoD)** |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | สถาปัตยกรรม, multi-tenant, data flow |
| [docs/archive/DATABASE-SCHEMA.md](docs/archive/DATABASE-SCHEMA.md) | คำอธิบายโครงสร้างฐานข้อมูล |
| [docs/PERMISSIONS.md](docs/PERMISSIONS.md) | RBAC permission matrix |
| [docs/archive/DASHBOARD-DEALER.md](docs/archive/DASHBOARD-DEALER.md) | สเปกหน้าแดชบอร์ดดีลเลอร์ (ฟิลด์/query) |
| [docs/DASHBOARD-HQ.md](docs/DASHBOARD-HQ.md) | สเปกหน้าแดชบอร์ด HQ |
| [docs/DEALER-MANAGEMENT.md](docs/DEALER-MANAGEMENT.md) | เพิ่ม/แก้/ปิดดีลเลอร์ + สร้าง Admin อัตโนมัติ |
| [docs/PROJECT-STRUCTURE.md](docs/PROJECT-STRUCTURE.md) | โครงสร้างโฟลเดอร์โค้ด |
| [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) | สีแบรนด์ CI + design tokens (Tailwind/shadcn) |
| [docs/UI-LAYOUT.md](docs/UI-LAYOUT.md) | เลย์เอาต์ UI (sidebar/KPI/กราฟ/ตาราง) + component inventory |
| [prisma/schema.prisma](prisma/schema.prisma) | Schema ฐานข้อมูล (Prisma) |

## Tech Stack
Next.js (App Router) · TypeScript · Tailwind + shadcn/ui · PostgreSQL + Prisma · Auth.js · LINE Messaging API · Object Storage (R2/S3)

## สถานะ
🟡 ออกแบบโครงสร้างเสร็จ — ยังไม่เริ่มเขียนโค้ด (รอ scaffold เฟส 0)
