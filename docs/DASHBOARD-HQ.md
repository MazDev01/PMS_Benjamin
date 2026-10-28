# Benjamin PMS — สเปกหน้า Dashboard สำนักงานใหญ่ (HQ)

> หน้าแดชบอร์ดสำหรับ SUPER_ADMIN / HQ_MANAGEMENT / HQ_STAFF
> **กฎหลัก:** HQ มี `scopeAll = true` → เห็นข้อมูล **ทุกดีลเลอร์** (ไม่กรอง `dealerId`) + เปรียบเทียบรายดีลเลอร์/ภาคได้
> เทียบคู่กับ [DASHBOARD-DEALER.md](./archive/DASHBOARD-DEALER.md)

---

## 1. เป้าหมายของหน้า
ตอบ: **"ทั้งเครือเป็นยังไง ดีลเลอร์ไหนเด่น/ตก งานไหนเสี่ยง และต้องอนุมัติอะไร"**
มุมมองผู้บริหาร — เน้นภาพรวม + เปรียบเทียบ + รายการที่ต้องตัดสินใจ

---

## 2. เลย์เอาต์
```
┌─────────────────────────────────────────────────────────────┐
│ [💰 ยอดขายรวม] [📊 Pipeline รวม] [🏗️ โครงการ active] [⏱️ On-time%] │ ← KPI รวมทั้งเครือ
├──────────────────────────────────┬──────────────────────────┤
│  🏆 จัดอันดับดีลเลอร์             │  🗺️ ยอดขายรายภาค         │ ← เปรียบเทียบ
│  (ยอด/เป้า/win rate)             │  (เหนือ/กลาง/ตอ./ตต.)     │
├──────────────────────────────────┴──────────────────────────┤
│  ✅ รออนุมัติ (ใบเสนอราคาเกินวงเงิน / โอนลูกค้าเป้าหมายข้ามดีลเลอร์)     │ ← Action ของ HQ
├──────────────────────────────────┬──────────────────────────┤
│  📈 แนวโน้มยอดขาย (รายเดือน)      │  ⚠️ โครงการเสี่ยง/ล่าช้า  │
├─────────────────────────────────────────────────────────────┤
│  📥 Lead pool กลาง (รอมอบหมายดีลเลอร์)                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. รายละเอียดแต่ละการ์ด (ฟิลด์ / แหล่งข้อมูล / query)

> HQ: `ctx.scopeAll = true` → `tenantWhere(ctx)` คืน `{}` (ไม่กรอง dealer)

### 💰 KPI แถวบน (รวมทั้งเครือ)
| การ์ด | คำนวณจาก |
|-------|----------|
| ยอดขายรวมเดือนนี้ | `Quotation(WON)` รวม `total` ทุกดีลเลอร์ |
| Pipeline รวม | `Lead(ยังไม่ปิด)` รวม `estValue` |
| โครงการ active | `Project(IN_PROGRESS|QC|HANDOVER)` count |
| On-time % | โครงการ COMPLETED ที่ `handoverDate ≤ dueDate` / ทั้งหมด |
```ts
db.quotation.aggregate({ _sum: { total: true },
  where: { status: 'WON', updatedAt: { gte: monthStart } } }) // ไม่มี dealer filter
```

### 🏆 จัดอันดับดีลเลอร์ (Leaderboard)
- **แสดงต่อแถว:** ชื่อดีลเลอร์, ยอดขาย, % ของเป้า, win rate, จำนวนโครงการ active
- **แหล่งข้อมูล:** group by `dealerId`
```ts
db.quotation.groupBy({ by: ['dealerId'], _sum: { total: true },
  where: { status: 'WON', updatedAt: { gte: monthStart } },
  orderBy: { _sum: { total: 'desc' } } })
// join Dealer.name + Dealer.targetRevenue เพื่อคำนวณ % เป้า
```

### 🗺️ ยอดขายรายภาค
- group ตาม `Dealer.region` (เหนือ/กลาง/ตะวันออก/ตะวันตก) → แผนที่หรือ bar chart
```ts
// รวม WON total แล้ว map dealerId → region
```

### ✅ รออนุมัติ (Action ของ HQ) ★
| รายการ | แหล่งข้อมูล |
|--------|-------------|
| ใบเสนอราคาเกินวงเงิน | `Quotation(approvalStatus=PENDING)` ทุกดีลเลอร์ |
| คำขอโอนลูกค้าเป้าหมาย/โครงการข้ามดีลเลอร์ | คำขอที่ดีลเลอร์ส่งมา |
```ts
db.quotation.findMany({ where: { approvalStatus: 'PENDING' },
  include: { dealer: true, customer: true }, orderBy: { createdAt: 'asc' } })
```

### 📈 แนวโน้มยอดขาย (Trend)
- กราฟเส้นยอดขายรายเดือน (ทั้งเครือ + แยกดีลเลอร์ได้)
- **แหล่งข้อมูล:** `Quotation(WON)` group by เดือน

### ⚠️ โครงการเสี่ยง/ล่าช้า
- โครงการที่ `ProjectPhase(ACTIVE, endDate<today)` หรือ progress ต่ำกว่าแผน — **ทุกดีลเลอร์**
```ts
db.project.findMany({ where: { status: { in: ['IN_PROGRESS','QC'] },
  phases: { some: { status: 'ACTIVE', endDate: { lt: today } } } },
  include: { dealer: true, phases: true } })
```

### 📥 Lead Pool กลาง (รอมอบหมาย)
- ลูกค้าเป้าหมายจากเว็บ/LINE ที่ `dealerId = null` → ปุ่มมอบหมายดีลเลอร์ (ตามจังหวัด)
```ts
db.lead.findMany({ where: { dealerId: null },
  orderBy: { createdAt: 'desc' } }) // เฉพาะ HQ เห็น pool นี้
```

---

## 4. ความต่างจาก Dashboard ดีลเลอร์

| มิติ | Dashboard ดีลเลอร์ | Dashboard HQ |
|------|---------------------|--------------|
| ขอบเขตข้อมูล | เฉพาะ `dealerId` ตน | ทุกดีลเลอร์ (scopeAll) |
| มุมมอง | "ฉันต้องทำอะไร" | "ทั้งเครือเป็นยังไง" |
| การ์ดเด่น | Action items ของตน | Leaderboard + รออนุมัติ + Lead pool |
| เปรียบเทียบ | ไม่มี | รายดีลเลอร์ / รายภาค |
| ตัดสินใจ | งานขาย/หน้างาน | อนุมัติวงเงิน, มอบหมายลูกค้าเป้าหมาย, จัดการเครือ |

---

## 5. สิทธิ์ภายใน HQ
- **SUPER_ADMIN / HQ_MANAGEMENT** — เห็นครบ + อนุมัติได้
- **HQ_STAFF** — เห็นภาพรวม + ช่วยปฏิบัติงาน แต่อนุมัติได้เฉพาะในวงเงินที่กำหนด
