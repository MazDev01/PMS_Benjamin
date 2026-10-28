> **เอกสารเก่า ไม่ใช่ข้อกำหนดปัจจุบัน — ดู docs/FLOW.html**

# Benjamin PMS — โครงสร้างฐานข้อมูล (Database Schema)

> Schema อ้างอิง Prisma/PostgreSQL — ทุกตารางธุรกรรมมี `dealerId` (tenant) + เวลา/ผู้สร้างเพื่อ audit
> ดูไฟล์ schema จริงที่ [prisma/schema.prisma](../prisma/schema.prisma)

---

## 1. กลุ่มตาราง (Domains)

| กลุ่ม | ตาราง |
|-------|-------|
| **Tenant & Auth** | Dealer, User |
| **CRM** | Customer, Lead, Activity |
| **Catalog/Master** | Product, Material, PriceList, Province |
| **Sales** | Quotation, QuotationItem |
| **Project** | Project, ProjectPhase, Task, Milestone, Document, SitePhoto, QCChecklist, QCItem, PunchItem, DailySiteReport, Handover, Warranty |
| **System** | Notification, AuditLog |

---

## 2. ความสัมพันธ์หลัก (ERD ย่อ)

```
Dealer (1)───(N) User
Dealer (1)───(N) Customer ───(N) Lead ───(N) Activity
                                 │
                                 └──(N) Quotation ──(N) QuotationItem ──► Product/Material
                                          │
Customer ───(N) Project ◄────────────────┘ (quotation ที่ชนะ)
Project (1)──(N) ProjectPhase (6 เฟส) ──(N) Task
Project (1)──(N) Milestone / Document / SitePhoto / DailySiteReport
Project (1)──(N) QCChecklist ──(N) QCItem
Project (1)──(N) PunchItem
Project (1)──(1) Handover ──(1) Warranty
```

---

## 3. ตารางสำคัญ + คอลัมน์หลัก

### Dealer (Tenant)
`id, code, name, type[HQ|DEALER], region, provinces[], address, phone, email, status, targetRevenue, createdAt`

### User
`id, dealerId→Dealer, email(unique), name, phone, role[enum], passwordHash, status, lastLoginAt`

### Customer
`id, dealerId, name, type[INDIVIDUAL|COMPANY], taxId, phone, email, address, province, createdById`

### Lead
`id, dealerId(nullable=ยังไม่จ่าย), customerId, source, channel[WEB|LINE|PHONE|WALKIN], status[NEW|CONTACTED|SURVEYED|QUOTED|NEGOTIATING|WON|LOST], assignedToId→User, productInterest, estValue, province, lostReason, createdById`

### Activity
`id, leadId, customerId, userId, type[CALL|VISIT|QUOTE|NOTE|SURVEY], note, scheduledAt, doneAt`

### Product
`id, code, category[EASYBUILD|RANBUILD|PREFAB|CUSTOM], name, unit, basePrice, spec(json), active`

### Material
`id, code, name, category[STEEL|ROOF|INSULATION|WALL|SYSTEM|OTHER], unit, basePrice, active`

### Quotation
`id, dealerId, customerId, leadId, quoteNo(unique), revision, status[DRAFT|PENDING_APPROVAL|APPROVED|SENT|WON|LOST|EXPIRED], subtotal, discountPct, discountAmt, vatAmt, total, validUntil, approvalStatus, approvedById, createdById`

### QuotationItem (BOQ line)
`id, quotationId, productId, materialId, description, qty, unit, unitPrice, amount, sortOrder`

### Project
`id, dealerId, customerId, quotationId, projectNo(unique), name, buildingType, province, siteAddress, gps, contractValue, startDate, dueDate, status[PLANNING|IN_PROGRESS|QC|HANDOVER|COMPLETED|ON_HOLD], currentPhase(1-6), pmId→User`

### ProjectPhase (สร้างอัตโนมัติ 6 แถวต่อโครงการ)
`id, projectId, phaseNo(1-6), name, status[PENDING|ACTIVE|DONE|BLOCKED], progressPct, startDate, endDate`

> 1=สำรวจ 2=ออกแบบ 3=ผลิต 4=ขนส่ง/ติดตั้ง 5=QC 6=ส่งมอบ

### Task
`id, projectId, phaseId, title, description, assigneeId, status[TODO|DOING|DONE], dueDate, priority`

### Milestone
`id, projectId, name, dueDate, status[PENDING|REACHED|MISSED]`

### Document
`id, projectId, type[DRAWING|BOQ|CONTRACT|PERMIT|HANDOVER|OTHER], name, fileUrl, version, uploadedById`

### SitePhoto
`id, projectId, phaseId, url, caption, gps, takenAt, uploadedById`

### QCChecklist / QCItem
`QCChecklist: id, projectId, name, phaseNo, status, inspectedById, inspectedAt`
`QCItem: id, checklistId, item, result[PASS|FAIL|NA], note, photoUrl`

### PunchItem (รายการแก้ไขก่อนส่งมอบ)
`id, projectId, description, status[OPEN|FIXED|VERIFIED], assigneeId, dueDate`

### DailySiteReport
`id, projectId, date, weather, manpower, workDone, issues, reportedById`

### Handover / Warranty
`Handover: id, projectId, handoverDate, customerSignedBy, note, documentUrl`
`Warranty: id, projectId, type[STRUCTURE|ROOF|OTHER], startDate, endDate, durationMonths, terms`

### Notification
`id, userId, type, title, body, channel[INAPP|EMAIL|LINE], refType, refId, readAt, createdAt`

### AuditLog
`id, dealerId, userId, action[CREATE|UPDATE|DELETE], entity, entityId, before(json), after(json), createdAt`

---

## 4. กฎ Index & Constraint
- Index ทุก `dealerId` (กรอง tenant)
- Unique: `User.email`, `Quotation.quoteNo`, `Project.projectNo`, `Dealer.code`
- Composite index: `(dealerId, status)` บน Lead / Quotation / Project (ใช้บ่อยในแดชบอร์ด)
- ทุกตารางมี `createdAt, updatedAt`; soft delete ด้วย `deletedAt` ในตารางหลัก
