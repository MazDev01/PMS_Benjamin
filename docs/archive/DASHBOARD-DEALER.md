> **เอกสารเก่า ไม่ใช่ข้อกำหนดปัจจุบัน — ดู docs/FLOW.html**

# Benjamin PMS — สเปกหน้า Dashboard ดีลเลอร์

> หน้าแดชบอร์ดสำหรับผู้ใช้ระดับดีลเลอร์ (DEALER_ADMIN / DEALER_SALES / DEALER_SITE)
> **กฎหลัก:** ทุก query กรองด้วย `dealerId` ของผู้ใช้อัตโนมัติผ่าน `tenantWhere(ctx)` — ไม่ปนกับดีลเลอร์อื่น
> อ้างอิง schema: [prisma/schema.prisma](../prisma/schema.prisma) · สิทธิ์: [PERMISSIONS.md](./PERMISSIONS.md)

---

## 1. เป้าหมายของหน้า
ตอบคำถามเดียว: **"วันนี้ฉันต้องโฟกัสอะไร และทำได้ตามเป้าไหม"**
เน้น Action-oriented — ของที่ต้องลงมือทำต้องเด่นที่สุด

---

## 2. เลย์เอาต์
```
┌─────────────────────────────────────────────────────────────┐
│  [🎯 เป้า 68%] [💰 Pipeline 4.2M] [📈 Win 35%] [🏗️ 5 งาน]   │  ← Row 1: KPI
├──────────────────────────────────┬──────────────────────────┤
│  📌 ต้องทำวันนี้ (Action Items)    │  📊 Sales Funnel         │  ← Row 2
├──────────────────────────────────┴──────────────────────────┤
│  🏗️ โครงการกำลังทำ (Active Projects + progress 6 เฟส)        │  ← Row 3
├─────────────────────────────────────────────────────────────┤
│  🕐 กิจกรรมล่าสุด (Activity Feed)                            │  ← Row 4
└─────────────────────────────────────────────────────────────┘
```

---

## 3. รายละเอียดแต่ละการ์ด (ฟิลด์ / แหล่งข้อมูล / query)

> ทุก query สมมุติ `ctx = { dealerId, userId, role }` และใช้ `where: tenantWhere(ctx)` = `{ dealerId: ctx.dealerId }`

### 🎯 การ์ด 1.1 — เป้า vs ยอดขาย
- **แสดง:** ยอดขายที่ปิดได้เดือนนี้ / เป้าเดือน → % + แถบ progress
- **แหล่งข้อมูล:** `Quotation(status=WON)` รวม `total` ในเดือน, เทียบ `Dealer.targetRevenue`
```ts
const won = await db.quotation.aggregate({
  _sum: { total: true },
  where: { ...tenantWhere(ctx), status: 'WON', updatedAt: { gte: monthStart } },
})
// pct = won._sum.total / (dealer.targetRevenue / 12)
```

### 💰 การ์ด 1.2 — มูลค่า Pipeline
- **แสดง:** ผลรวมมูลค่าลูกค้าเป้าหมายที่ยังไม่ปิด (estValue)
- **แหล่งข้อมูล:** `Lead(status ∈ NEW..NEGOTIATING)`
```ts
db.lead.aggregate({ _sum: { estValue: true },
  where: { ...tenantWhere(ctx), status: { in: ['NEW','CONTACTED','SURVEYED','QUOTED','NEGOTIATING'] } } })
```

### 📈 การ์ด 1.3 — Win Rate
- **แสดง:** WON / (WON + LOST) เป็น %
```ts
const won = await db.lead.count({ where: { ...tenantWhere(ctx), status: 'WON' } })
const lost = await db.lead.count({ where: { ...tenantWhere(ctx), status: 'LOST' } })
// winRate = won / (won + lost)
```

### 🏗️ การ์ด 1.4 — โครงการกำลังทำ
- **แสดง:** จำนวน `Project(status=IN_PROGRESS|QC|HANDOVER)`
```ts
db.project.count({ where: { ...tenantWhere(ctx), status: { in: ['IN_PROGRESS','QC','HANDOVER'] } } })
```

---

### 📌 การ์ด 2.1 — ต้องทำวันนี้ (Action Items) ★ สำคัญสุด
รายการรวมจากหลายแหล่ง แต่ละบรรทัดคลิกไปหน้าที่เกี่ยว:

| รายการ | เงื่อนไข / แหล่งข้อมูล |
|--------|------------------------|
| ลูกค้าเป้าหมายใหม่/ค้าง | `Lead(status=NEW)` หรือ `updatedAt` ค้าง > 3 วัน |
| ใบเสนอราคารออนุมัติ | `Quotation(approvalStatus=PENDING)` หรือ `status=APPROVED` (ยังไม่ส่ง) |
| นัดหมายวันนี้ | `Activity(scheduledAt = today, doneAt=null)` |
| โครงการล่าช้า | `ProjectPhase(status=ACTIVE, endDate < today)` หรือ `Task(dueDate<today, status≠DONE)` |
| งานหน้างานวันนี้ | `Project` ที่ยังไม่มี `DailySiteReport(date=today)` (เฉพาะที่ตนรับผิดชอบ) |

```ts
// ตัวอย่าง: ลูกค้าเป้าหมายค้าง
db.lead.findMany({ where: { ...tenantWhere(ctx), status: 'NEW',
  updatedAt: { lt: threeDaysAgo } }, take: 5, orderBy: { updatedAt: 'asc' } })
```

### 📊 การ์ด 2.2 — Sales Funnel
- **แสดง:** จำนวน + มูลค่าลูกค้าเป้าหมายในแต่ละ stage (NEW→...→WON)
- **แหล่งข้อมูล:** `Lead` group by `status`
```ts
db.lead.groupBy({ by: ['status'], _count: { _all: true }, _sum: { estValue: true },
  where: tenantWhere(ctx) })
```

---

### 🏗️ การ์ด 3 — โครงการกำลังทำ (Active Projects)
- **แสดงต่อแถว:** ชื่อโครงการ, เฟสปัจจุบัน (1-6) + ชื่อเฟส, แถบ progress รวม, วันส่งมอบ (dueDate), ป้ายเตือนถ้าล่าช้า
- **แหล่งข้อมูล:** `Project` + `ProjectPhase`
```ts
db.project.findMany({
  where: { ...tenantWhere(ctx), status: { in: ['IN_PROGRESS','QC','HANDOVER'] } },
  include: { phases: { orderBy: { phaseNo: 'asc' } }, customer: true },
  orderBy: { dueDate: 'asc' }, take: 8,
})
// progress รวม = avg(phases.progressPct) หรือ weighted
```

---

### 🕐 การ์ด 4 — กิจกรรมล่าสุด (Activity Feed)
- **แสดง:** ความเคลื่อนไหวล่าสุดในดีลเลอร์ (ลูกค้าเป้าหมายใหม่, ใบเสนอราคาออก, QC ผ่าน, รูปใหม่)
- **แหล่งข้อมูล:** `AuditLog` (กรอง dealerId) หรือรวมจาก `Activity` + log
```ts
db.auditLog.findMany({ where: { dealerId: ctx.dealerId },
  orderBy: { createdAt: 'desc' }, take: 15 })
```

---

## 4. ความต่างตามบทบาทย่อย (Role variants)

| การ์ด | DEALER_ADMIN | DEALER_SALES | DEALER_SITE |
|-------|:---:|:---:|:---:|
| KPI (เป้า/Pipeline/Win/งาน) | ✓ ทั้งดีลเลอร์ | ◐ เฉพาะของตน | ✗ |
| Action Items | ✓ ครบ + รออนุมัติในวงเงิน | ◐ ลูกค้าเป้าหมาย/ใบเสนอราคาตน | ◐ งานหน้างานตน |
| Sales Funnel | ✓ | ✓ (ของตน) | ✗ |
| Active Projects | ✓ ทุกโครงการ | ◐ ที่ดูแล | ◐ ที่รับผิดชอบ |
| Activity Feed | ✓ ทั้งทีม | ◐ ที่เกี่ยวข้อง | ◐ โครงการตน |
| การ์ดเสริม | "ผลงานทีม/รายคน" | "นัดหมายของฉัน" | "QC/รายงานวันนี้" |

> **DEALER_SITE** ตัด Pipeline/KPI การขายออก เน้น "งานหน้างานวันนี้ + QC + รายงานประจำวัน"

---

## 5. หมายเหตุ Performance
- query KPI หลายตัว → รวมเป็น endpoint เดียว / parallel `Promise.all`
- ใช้ index `(dealerId, status)` ที่มีอยู่บน Lead/Quotation/Project
- เมื่อข้อมูลโต พิจารณา cache ตัวเลข KPI (revalidate ราย 5-15 นาที)
