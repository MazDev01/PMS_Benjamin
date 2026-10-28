# Benjamin PMS — Portable Core (โมดูล · ฟังก์ชัน · ธีม)

เอกสารนี้สกัด **ตรรกะธุรกิจทั้งหมด** ของโปรเจกต์นี้ออกมาโดย **ไม่มี UI** เพื่อเอาไปสร้างโปรเจกต์ใหม่ที่ทำงานเหมือนกัน
ทุกอย่างในนี้อ่านจากซอร์สจริง (`src/lib` 17 ไฟล์ · `src/context` 3 ไฟล์ · `globals.css`) ไม่ได้เขียนจากความจำ

**Stack เดิม:** Next.js 15 + React 19 + TypeScript + Tailwind 4 · frontend-only + localStorage (ยังไม่มี backend)
**Runtime deps จริงมีแค่ 3 ตัว:** `react` · `clsx` · `lucide-react` (ไอคอน = UI ตัดออกได้)
→ **ตรรกะทั้งหมดในเอกสารนี้เป็น TypeScript ล้วน ไม่ผูกกับ React ยกเว้นชั้น hook/context**

---

## 0. สรุปสถาปัตยกรรม 1 หน้า

```
┌─────────────────────────────────────────────────────────┐
│ UI (ตัดออก)                                              │
├─────────────────────────────────────────────────────────┤
│ Context (state + business actions)                       │
│   RoleContext   — session/RBAC gate                      │
│   SalesContext  — ⭐ หัวใจ: lead/deal/customer/quote     │
│   FilterContext — ช่วงเวลา + 5 มิติ                       │
├─────────────────────────────────────────────────────────┤
│ Hooks (read-only views)                                  │
│   useNetworkData · useCustomerDb · useHQRules            │
│   useMasterCatalog · useAudit · usePersistentState       │
├─────────────────────────────────────────────────────────┤
│ Pure logic (ไม่มี React — ย้ายไป backend ได้ทันที)        │
│   leadMetrics · hqQuotations · hqAlerts · warranty        │
│   customerDb(regionOf) · permissions · format            │
├─────────────────────────────────────────────────────────┤
│ Data model + seed + loaders  → mock.ts (1,652 บรรทัด)    │
├─────────────────────────────────────────────────────────┤
│ Persistence: localStorage (23 keys) + sessionStorage (1) │
└─────────────────────────────────────────────────────────┘
```

**กฎเหล็กที่ทำให้ระบบนี้ถูกต้อง:** ทุกตัวเลขต้องมาจากข้อมูลจริง — ไม่มีข้อมูล = แสดง `—` ห้ามเดา/กุ

---

## 1. ธีม (Design Tokens)

### 1.1 CI Colors — แหล่งเดียว (`src/lib/theme.ts`)
```ts
export const PRIMARY = "#003366"; // navy — สีหลัก
export const NAVY    = "#003366";
export const STEEL   = "#2D2D2D"; // steel gray
export const SILVER  = "#C0C0C0";
export const GREEN   = "#059669";
export const AMBER   = "#d97706";
export const RED     = "#dc2626";
```
> **กฎ:** เปลี่ยนสีแบรนด์ที่นี่ที่เดียว ห้าม hardcode ซ้ำ · CI = navy/steel/silver เท่านั้น

### 1.2 CSS Custom Properties (`globals.css :root`)
```css
/* radii */
--radius: .75rem; --radius-sm: .45rem; --radius-md: .6rem; --radius-lg: 1rem; --radius-xl: 1.25rem;
--r: 16px;                                   /* การ์ด */

/* surfaces / text */
--background:#fff; --foreground:#2D2D2D; --card:#fff; --card-foreground:#2D2D2D;
--muted:#f4f6f9; --muted-foreground:#6b7280; --border:#e5e7eb; --input:#e5e7eb;

/* brand */
--primary:#003366; --primary-foreground:#fff;
--brand-500:#003366; --brand-600:#002244; --brand-700:#001a33;
--ring:rgba(0,51,102,.45); --accent:#eef3f8;

/* charts */
--chart-1:#003366; --chart-2:#ECC94B; --chart-accent:#ECC94B;

/* semantic */
--success:#059669; --warning:#f59e0b; --info:#003366; --destructive:#dc2626;

/* design system */
--pr:#003366; --pr-d:#002244; --pr-lt:#dce5f0; --pr-llt:#eef2f7;
--silver:#C0C0C0; --gold:#ECC94B; --sub:#6b7280; --text:#2D2D2D;
--success-bg:#e5faf0; --warning-bg:#fef3cd; --danger-bg:#fdeaed;

/* shadows */
--shadow-sm:0 1px 2px rgba(0,0,0,.06); --shadow:0 2px 8px rgba(0,0,0,.08);
--shadow-md:0 4px 16px rgba(0,0,0,.10); --shadow-lg:0 8px 32px rgba(0,0,0,.12);
--sh:0 1px 2px rgba(16,40,80,.04), 0 10px 24px -14px rgba(16,40,80,.12);
--sh-md:0 2px 4px rgba(16,40,80,.05), 0 18px 34px -16px rgba(16,40,80,.20);

/* spacing */
--space-card:14px; --space-section:18px; --pad-card:22px;
```

### 1.3 สีสถานะ (ต้องยกไปทั้งชุด — ผูกกับความหมาย)
**LeadStatus** — สถานะภายใน (หน้าจอแสดงเป็น 5 ขั้นผ่าน `packages/shared/lib/leadStage.ts` เท่านั้น · ตาราง "สถานะ ↔ ขั้น" ใน docs/FLOW.html)

| status | label | bg | text |
|---|---|---|---|
| `WAITING` | ติดต่อแล้ว | `#eef2f7` | `#475569` |
| `BULLET` | รวบรวมความต้องการ | `#dce5f0` | `#003366` |
| `HQ_PRICING` | รอราคา HQ | `#f3e8ff` | `#6b21a8` |
| `HQ_QUOTED` | ได้ราคา HQ | `#dcfce7` | `#166534` |
| `QUOTED` | เสนอราคา | `#e0e7ff` | `#4338ca` |
| `PAID` | ปิดการขายสำเร็จ | `#e5faf0` | `#059669` |
| `CANCELLED` | ปิดการขายไม่สำเร็จ | `#fee2e2` | `#dc2626` |

**QuotationStatus**

| status | label | bg | text |
|---|---|---|---|
| `draft` | ร่าง | `#f0f0f5` | `#6b7280` |
| `sent_to_client` | ส่งแล้ว | `#dce5f0` | `#003366` |
| `won` | ตอบรับ | `#e5faf0` | `#059669` |
| `lost` | ปฏิเสธ | `#f5f5f5` | `#9ca3af` |
| `expired` | หมดอายุ | `#f5f5f5` | `#9ca3af` |

**Tags:** VIP `#fef3cd/#b45309` · HOT `#fee2e2/#dc2626` · ด่วน `#fde8cd/#c2410c` · ภาครัฐ `#e5faf0/#065f46` · เอกชน `#dce5f0/#003366`
**Priority:** HIGH `#DC3545/#fee2e2` · MEDIUM `#FFC107/#fff8e1` · LOW `#6b7280/#f0f0f5`
**Aging buckets:** `0–7` `#059669` · `8–14` `#0891b2` · `15–30` `#d97706` · `30+` `#dc2626`
**Lost-reason ramp (โดนัท):** `["#dc2626","#ea580c","#d97706","#b45309","#9f1239","#7c2d12"]`

---

## 2. โมดูล (Modules)

ระบบมี **2 workspace** แยกสิทธิ์ขาดกัน

### Dealer (ตัวแทน — ฝ่ายขาย)
| โมดูล | route | หน้าที่ |
|---|---|---|
| แดชบอร์ด | `/dashboard` | KPI + กราฟของสาขาตัวเอง |
| ลูกค้าเป้าหมาย | `/leads` | ⭐ Command Center — ลีด/ดีล/งาน/ใบเสนอราคา จบในแผงเดียว |
| ใบเสนอราคา | `/quotations` | ออก/แก้/พิมพ์ PDF |
| ลูกค้า | `/customers` | เกิดจากปิดการขายเท่านั้น (สร้างเองไม่ได้) |
| แม่แบบ | `/products` | อ่านอย่างเดียว (HQ คุม) |
| ปฏิทิน | `/calendar` | นัดหมาย |
| ไฟล์ | `/files` | คลังไฟล์ |
| ตั้งค่า | `/settings` | โปรไฟล์/เอกสาร/ผู้รับผิดชอบ |

### HQ (สำนักงานใหญ่ — เจ้าของข้อมูล อ่านอย่างเดียว)
| โมดูล | route | หน้าที่ |
|---|---|---|
| แดชบอร์ด HQ | `/hq/dashboard` | ภาพรวมทั้งเครือ |
| ตัวแทนจำหน่าย | `/hq/dealers` `/hq/dealers/[code]` | จัดการสาขา + เจาะรายสาขา |
| ภาพรวมยอดขาย | `/hq/pipeline` | วิเคราะห์เทียบสาขา |
| ลูกค้าเป้าหมายทั้งเครือ | `/hq/leads` | ลีดทุกสาขา |
| ใบเสนอราคาทั้งเครือ | `/hq/quotations` | ใบทุกสาขา |
| ลูกค้าทั้งเครือ | `/hq/customers` | ฐานข้อมูล**หลังปิดการขาย** (มีส่งมอบ/ประกัน) |
| แคตตาล็อกแม่แบบ | `/hq/master` | ราคากลาง (แหล่งเดียว) |
| บันทึกการใช้งาน | `/hq/audit` | audit log |
| ตั้งค่า | `/hq/settings` | 7 หัวข้อ (บริษัท/ผู้ใช้/เส้นทางการขาย/ตัวแทน/เป้าหมาย/กฎธุรกิจ/แจ้งเตือน) |

> **HQ ไม่มีปุ่มสร้าง/แก้/ลบ/อนุมัติ ในหน้าวิเคราะห์** — ดู · วิเคราะห์ · ส่งออก เท่านั้น

---

## 3. RBAC (`src/lib/permissions.ts`)

```ts
export type Permission =
  | "leads:create" | "leads:read" | "leads:update" | "leads:delete"
  | "customers:create" | "customers:read" | "customers:update" | "customers:delete"
  | "quotations:create" | "quotations:read" | "quotations:update" | "quotations:delete"
  | "tasks:manage" | "catalog:edit" | "dealers:manage"
  | "reports:view" | "analytics:view" | "hq:all_data";

export type UserRole = "SUPER_ADMIN" | "HQ_MANAGEMENT" | "HQ_STAFF"
                     | "DEALER_ADMIN" | "DEALER_SALES" | "DEALER_SITE";

const DEALER_BASE: Permission[] = [
  "leads:create","leads:read","leads:update","leads:delete",
  "customers:create","customers:read","customers:update","customers:delete",
  "quotations:create","quotations:read","quotations:update","quotations:delete",
  "tasks:manage","reports:view",
];
const HQ_ONLY: Permission[] = ["catalog:edit","dealers:manage","hq:all_data","analytics:view"];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPER_ADMIN:   [...DEALER_BASE, ...HQ_ONLY],
  HQ_MANAGEMENT: [...DEALER_BASE, ...HQ_ONLY],
  HQ_STAFF:      [...DEALER_BASE, "analytics:view"],
  DEALER_ADMIN:  [...DEALER_BASE, "analytics:view"],
  DEALER_SALES:  DEALER_BASE,
  DEALER_SITE:   ["leads:read","customers:read"],
};

export const hasPermission = (role: UserRole, p: Permission) =>
  ROLE_PERMISSIONS[role]?.includes(p) ?? false;
```

⚠️ **จุดที่ต้องแก้ตอนสร้างใหม่:**
- `SUPER_ADMIN` = `HQ_MANAGEMENT` เป๊ะ · `HQ_STAFF` = `DEALER_ADMIN` เป๊ะ → **มี 6 role แต่จริงมีแค่ 4 ระดับ**
- **permission ไม่ถูกบังคับที่ data layer เลย** — SalesContext ไม่เคยเรียก `can()` เป็น UI-level guard ล้วน → **ถ้าต่อ backend ต้องบังคับซ้ำที่ server**

---

## 4. Data Model (types หลัก)

### 4.1 Session
```ts
type MockSession = {
  name: string; role: UserRole; dealerName: string;
  dealerCode: string;  // "" = HQ · "CNX"/"RYG" = สาขา
  scopeAll: boolean;   // true = เห็นทุกสาขา
};
```

### 4.2 Lead (⭐ = Deal — ไม่มี entity "deal" แยก)
```ts
type LeadStatus = "WAITING"|"BULLET"|"HQ_PRICING"|"HQ_QUOTED"|"QUOTED"|"PAID"|"CANCELLED";

type LeadRow = {
  id: string; numId: number;
  name: string; company: string; contact: string;
  phone?: string; email?: string;
  province: string; product: string; category: string;
  status: LeadStatus; value: string;      // "฿2.2M"
  assigned: string;                        // ชื่อพนักงานขาย — ไม่ใช่ user
  dealerCode?: string;                     // ไม่ระบุ = สาขาที่ล็อกอิน
  source?: string; note?: string;
  project?: string; expectedClose?: string; createdAt?: string;
  lostReason?: string; report?: string;
  tasks?: LeadTask[];                      // ⭐ ขับเคลื่อนสถานะ + %
  activities?: LeadActivity[];
  customerId?: number;                     // มีค่า = เป็น Deal ของลูกค้าเดิม
  logo?: string;                           // base64
};
type LeadTask = { key: string; label: string; done: boolean; doneAt?: string; doneBy?: string };
type LeadActivity = { id: number; date: string; icon: string; text: string; type: string };
```

### 4.3 Customer
```ts
type CustomerRow = {
  id: number; name: string; company: string; email: string; phone: string;
  address?: string; province: string; category: string;
  status: "active"|"inactive"; projects: number;
  joinDate: string; owner: string; initials: string; color: string;
  totalValue: number; contacts?: CustomerContact[];
  logo?: string; imported?: boolean;
};
```

### 4.4 Quotation
```ts
type QuotationStatus = "draft"|"sent_to_client"|"won"|"lost"|"expired";
type QuoteLineItem = { name: string; qty: number; unit: string; unitPrice: number };

type QuotationMock = {
  id: string; customer: string; project: string;
  total: string; totalValue: number;       // ⭐ ก่อน VAT
  materialCost: number;                     // = Σ(qty×unitPrice)
  province: string; buildingType: string; area: number;
  status: QuotationStatus; date: string; items: number;
  lineItems?: QuoteLineItem[];
  customerId: number; projectId: number;
  dealId?: number;                          // → LeadRow.numId (1 Deal → หลาย Revision)
  revision?: string; expiry?: string; note?: string;
  issuer?: IssuerProfile;                   // ⭐ สแนปช็อต ณ ตอนสร้าง
};
type IssuerProfile = { company: string; address: string; phone: string; taxId: string };
```

### 4.5 Master Catalog / Dealer / HQ
```ts
type SolutionProduct = {
  id: string; name: string; spec: string;
  price: number; unit: string; effectiveDate: string;
  priceHistory: { price: number; effectiveDate: string; note?: string }[];
  subtypes?: string[]; image?: string; subtypeImages?: Record<string,string>;
};

type DealerRow = {
  id: string; code: string; name: string; province: string; region: string;
  revenueActual: number; revenueTarget: number;
  winRate: number; activeProjects: number; onTimePct: number;
  status: "active"|"inactive";
  credentials: { email: string; password: string };
};

type HQQuotation = {
  id: string; quoteNo: string; dealerCode: string; dealerName: string;
  customer: string; valueNum: number; status: QuotationStatus;
  createdAt: string; salesperson: string; productLine: string;
  deliveryTime?: string; materialCost?: number; lineItems?: QuoteLineItem[];
};

type HQCustomer = {
  id: number; localId?: number; name: string;
  dealerCode: string; dealerName: string; province: string;
  dealsWon: number; totalRevenue: number;
  status: "active"|"inactive"; lastContact: string;
  segment: "enterprise"|"sme"|"government";
};
```

### 4.6 Config types
```ts
type HQPolicy     = { requireApproval: boolean; vat: number; quoteValidityDays: number };
type HQLeadRules  = { followUpAlertDays: number; unassignedAlertHours: number };
type HQTargets    = { annualTarget: number; winRateTarget: number; onTimeTarget: number };
type HQNotifRules = {
  alerts: Record<HQAlertKey, { on: boolean; email: boolean; inapp: boolean }>;
  quoteExpiringDays: number; dealerIdleDays: number;
  targetAchievedPct: number; lostRatePct: number;
};
type HQAlertKey = "unassignedLead"|"idleLead"|"quoteExpiring"|"dealerIdle"|"targetAchieved"|"lostRate";
```

**ค่าเริ่มต้น**
```ts
DEFAULT_HQ_POLICY     = { requireApproval: true, vat: 7, quoteValidityDays: 30 };
DEFAULT_HQ_LEAD_RULES = { followUpAlertDays: 7, unassignedAlertHours: 48 };
DEFAULT_HQ_TARGETS    = { annualTarget: 260_000_000, winRateTarget: 40, onTimeTarget: 85 };
DEFAULT_HQ_NOTIF_RULES.quoteExpiringDays = 7; dealerIdleDays = 30;
DEFAULT_HQ_NOTIF_RULES.targetAchievedPct = 100; lostRatePct = 40;
DEFAULT_DELIVERY_DAYS = 90;
WARRANTY_YEARS = 10;
LOST_REASONS = ["ราคา","คู่แข่ง","งบประมาณ","ลูกค้าเลื่อน","ติดต่อไม่ได้","อื่นๆ"];
```

---

## 5. ⭐ Task-driven Sales Journey (หัวใจของระบบ)

**ความคืบหน้า % คำนวณจากงานที่ติ๊กเท่านั้น — ห้ามให้ผู้ใช้ลาก slider**

```ts
// งานในแต่ละขั้น (FLOW D7 · ใบ 0250) — ผูกกับขั้น 1–5 ไม่ใช่สถานะลีด · auto = ระบบติ๊กเมื่อเกิดเหตุการณ์จริง
const LEAD_TASK_TEMPLATE: { key: string; label: string; step: 1|2|3|4|5; auto?: true }[] = [
  { key:"contact",        label:"ติดต่อแล้ว",       step:1 },
  { key:"collect",        label:"เก็บข้อมูลลูกค้า",  step:1 },
  { key:"requirement",    label:"สรุปความต้องการ",  step:1 },
  { key:"appointment",    label:"นัดหมาย",         step:1, auto:true },
  { key:"requestQuote",   label:"ส่งคำขอราคา",      step:2, auto:true },
  { key:"hqQuote",        label:"ได้ใบ HQ",         step:3, auto:true },
  { key:"makeQuote",      label:"จัดทำใบเสนอราคา",  step:4, auto:true },
  { key:"sendQuote",      label:"ส่งใบเสนอราคา",    step:5, auto:true },
  { key:"followCustomer", label:"ติดตามลูกค้า",     step:5 },
];
// งานไม่เลื่อนขั้น (รอบ 4 · ใบ 0232) — ขั้นของลีดฐานขยับตามคำขอราคา/ใบเสนอราคาเท่านั้น
```

| ฟังก์ชัน | สูตร / กฎ |
|---|---|
| `taskProgress(tasks)` | `round(done / total × 100)` |
| ~~`stageFromTasks(tasks)`~~ (เอาออกรอบ 4 — งานไม่เลื่อนขั้น) | ไล่ template **ข้าม `close`** → stage ของงานสุดท้ายที่ done · ฐาน `"WAITING"` |
| ~~`syncTasksToStage(tasks, status, doneBy)`~~ (เอาออกรอบ 4) | ปรับ checklist ให้ตรงสเตจเป๊ะ: ไปหน้า→ติ๊กถึงสเตจนั้น (คง doneAt เดิม) · ย้อนกลับ→**เอาติ๊กที่เกินออก** · `CANCELLED` → **ไม่แตะเลย** |
| `buildLeadTasks()` | checklist ใหม่ `done:false` ทุกงาน |

---

## 6. ⭐ SalesContext — Business Actions (หัวใจอันดับ 2)

**State (ทุกตัว persist ผ่าน `usePersistentState`)**

| ตัวแปร | key |
|---|---|
| `deals` | `sales_deals_v1` |
| `leads` | `sales_leads_v1` |
| `leadDealMap` | `sales_lead_deal_map_v1` |
| `nextDealId` | `sales_next_deal_id_v1` |
| `leadChecklists` | `sales_lead_checklists_v1` |
| `customers` | `sales_customers_v1` |
| `quotations` | `sales_quotations_v1` |
| `appointments` | `sales_appointments_v1` |

### 6.1 กฎ ลีด → ลูกค้า (สำคัญสุด)
```
convertLeadToCustomer(lead, removeLead = false): CustomerRow
```
1. **กันซ้ำ:** `lead.customerId != null` และหาลูกค้าเจอ → คืนตัวเดิม ไม่สร้างใหม่
2. `newId = max(customers.id) + 1`
3. map: `name = contact || company` · `totalValue = parseBaht(lead.value)` · `color = PALETTE[newId % 8]` · `initials = deriveInitials(company)` · พา `logo` มาด้วย
4. `removeLead=true` → ลบลีดออก · `false` → คงลีดไว้ แค่ผูก `customerId`
5. **Backfill:** ใบเสนอราคาที่ `customerId` เป็น 0/null **และ** `q.customer === lead.company` → ผูก `customerId = newId` ย้อนหลัง

**เกิดขึ้นเมื่อ (4 ทาง):**
| ทาง | ลีดหาย? |
|---|---|
| `updateLeadStatus(id,"PAID")` | ❌ คงไว้ ผูก customerId |
| `updateLead(lead)` ที่ status=PAID | ❌ คงไว้ |
| `closeDeal(dealId,"won")` | ✅ **ลบลีด** |
| เรียก `convertLeadToCustomer` ตรง | ตาม arg |

> ⚠️ **ตัวแทนสร้างลูกค้าเองไม่ได้** — ลูกค้าเกิดจากปิดการขายเท่านั้น · ลูกค้าเดิมซื้อซ้ำ = **"สร้างดีลใหม่"** (LeadRow ใหม่ + customerId เดิม) ห้ามใช้คำ "เพิ่มลูกค้า"

### 6.2 `closeDeal(dealId, outcome, lostReason?)`
1. `stageId` = 7 (won) / 8 (lost) · set `outcome`
2. **won → ติ๊กงานทุกใบเป็น done** · lost → ไม่แตะ tasks
3. หา leadId จาก `leadDealMap` (reverse lookup)
4. **won** → `convertLeadToCustomer(lead, true)` → ผูก customerId เข้าดีล → **ตั้งใบเสนอราคาทุกใบของลูกค้านั้นที่ยัง ≠ won ให้เป็น `"won"`**
5. **lost** → ลีดเป็น `CANCELLED` (ยังอยู่ในรายการ)

### 6.3 `updateLeadStatus(leadId, status)`
```ts
const lead = leadsRef.current.find(l => l.id === leadId);   // อ่านนอก updater กัน StrictMode
setLeads(prev => prev.map(l => l.id !== leadId ? l
  : { ...l, status, tasks: syncTasksToStage(l.tasks, status, l.assigned || "—") }));
if (status === "PAID" && lead && lead.customerId == null)
  setTimeout(() => convertLeadToCustomer({ ...lead, status }, false), 0);   // กัน StrictMode ซ้ำ
```

### 6.4 `openDealFromLead(lead)`
- **idempotent** — มีใน map แล้ว → คืนดีลเดิม
- ดีลใหม่: `stageId: 2`, `outcome:"active"`, `createdAt:"2026-06-30"` (ตรึง), tasks จาก `leadChecklists` หรือ `DEFAULT_TASKS` 7 ข้อ
- **side effect: ตั้งสถานะลีดเป็น `QUOTED` ทันที**

### 6.5 `updateDealTask` — auto-stage
```ts
const ACTIVE_STAGES = [2, 4, 5, 9, 6];   // ติดต่อ→รวบรวม→เสนอราคา→ติดตาม→เจรจา
const idx = Math.min(ACTIVE_STAGES.length - 1,
  Math.floor((doneCount / tasks.length) * ACTIVE_STAGES.length));
```
เฉพาะ `outcome === "active"` · **ไม่มี auto-ปิดการขาย** (100% ก็ได้แค่ stage 6)

### 6.6 ใบเสนอราคา → ติ๊กงานลีดอัตโนมัติ
```ts
completeLeadQuoteTasks(quotation, keys: string[])
// (เดิมเลื่อนสถานะลีดตามงาน — เอาออกรอบ 4 · ตอนนี้ฐานติ๊กงานของระบบและเลื่อนขั้นเอง ใบ 0210/0219/0248/0250)
```
- จับคู่ลีด: `(q.customerId > 0 && l.customerId === q.customerId) || l.company === q.customer`
- **ข้ามลีด `PAID` / `CANCELLED`** (terminal)
- **เลื่อนสถานะขึ้นเท่านั้น** — `RANK[stageFromTasks(tasks)] > RANK[l.status] ? next : l.status`

| action | keys ที่ติ๊ก |
|---|---|
| `addQuotation` (draft) | `["makeQuote"]` |
| `addQuotation` (≠draft) | `["makeQuote","sendQuote"]` |
| `updateQuotation` (≠draft) | `["makeQuote","sendQuote"]` |
| `setQuotationStatus` (≠draft) | `["makeQuote","sendQuote"]` |

- `addQuotation` → ประทับ `issuer` (ถ้ายังไม่มี) + `syncAddQuotationFile` (auto-link ไฟล์, กันซ้ำ)
- `deleteQuotation` → `syncRemoveQuotationFile` → **ลบเฉพาะไฟล์ที่ระบบสร้าง ไม่แตะไฟล์ผู้ใช้**

---

## 7. ตัวชี้วัด (สูตรทั้งหมด)

### 7.1 Lead (`leadMetrics.ts`)
```ts
MOCK_TODAY = new Date(2026, 5, 30);      // 30 มิ.ย. 2026

isLeadOpen(l)      = l.status !== "PAID" && l.status !== "CANCELLED"
daysSinceContact(l)= floor((MOCK_TODAY − (leadLatestDate ?? parseThaiDate(createdAt))) / 86_400_000)  // ไม่มีวัน → null
needsFollowUp(l,t=7)= isLeadOpen(l) && daysSinceContact(l) > t                 // ⭐ กฎธุรกิจเดียว — ไม่มี SLA
leadPriority(l)    = value ≥ ฿3,000,000 → HIGH · ≥ ฿1,000,000 → MEDIUM · else LOW
leadProgress(l)    = PAID → 100 · CANCELLED → 0 · else taskProgress(tasks)
leadCreatedDate(l) = parseThaiDate(createdAt) ?? MOCK_TODAY − ((numId × 17) % 150) วัน   // deterministic
```

### 7.2 Quotation (`hqQuotations.ts`)
```ts
isSent(q)    = q.status !== "draft"              // ส่งแล้ว = ทุกอย่างที่ไม่ใช่ร่าง
isPending(q) = q.status === "sent_to_client"     // ค้างอยู่ = รอลูกค้าตอบ (ใช้คิด aging)

agingDays  = max(0, round((APP_NOW − createdDate) / 86_400_000))
validUntil = createdDate + validityDays          // นโยบาย HQ
agingBucketOf(d) = d≤7 →"0-7" · d≤14 →"8-14" · d≤30 →"15-30" · else "30+"

aggregate(rows) = {
  count: rows.length,
  value: Σ valueNum,                    // ทุกใบ
  sent: นับ isSent,
  accepted: นับ status==="won",
  rejected: นับ status==="lost",
  wonValue: Σ valueNum เฉพาะ won,       // = "ยอดขายจริง"
}
conversionRate(a) = round(a.accepted / a.sent × 100)    // ⭐ ตอบรับ ÷ ใบที่ส่งแล้ว (ไม่นับร่าง) · sent=0 → 0
avgQuoteValue(a)  = round(a.value / a.count)            // count=0 → 0

region ของใบ   = ภาคของ "ตัวแทนที่ออกใบ"      // ใบไม่มีฟิลด์ภาคของตัวเอง
dealerProvince = จังหวัดของ "ตัวแทนที่ออกใบ"   // ⚠️ ไม่ใช่จังหวัดลูกค้า — ต้องกำกับป้ายให้ชัดทุกจุด
```

⚠️ **ขอบเขตข้อมูล — อย่าเดาเกินนี้:**
- **ไม่มีการติดตามการเปิดอ่าน** → คิด Open Rate ไม่ได้ (ลบทั้งฟีเจอร์แล้ว)
- **ไม่มีวันที่ลูกค้าตอบรับ/ปฏิเสธ** → คิด "จำนวนวันที่ใช้ปิดดีล" ไม่ได้
- ใบของสาขาอื่น (seed) ไม่มี `lineItems` → แสดง `—`

### 7.3 Warranty (`warranty.ts`) — แหล่งเดียวของกฎส่งมอบ/ประกัน
```ts
TODAY = new Date(2026, 5, 30);
WARRANTY_YEARS = 10;

วันส่งมอบ  = วันปิดการขาย(won) + deliveryDaysOf(q.deliveryTime ?? DEFAULT_DELIVERY_DAYS=90)
วันหมดประกัน = วันส่งมอบ + 10 ปี
status     = exp > TODAY ? "active" : "expired"

// ⭐ ไม่มีวันปิดการขาย = ยังไม่ส่งมอบ = ไม่มีประกัน → คืน null (ห้ามเดา)

remainingLabel:
  months = (exp.ปี − TODAY.ปี)×12 + (exp.เดือน − TODAY.เดือน)
  ถ้า exp.วัน < TODAY.วัน → months--          // ปัดลงกันนับเกิน
  y = floor(months/12), m = months % 12
  y>0 && m>0 → "เหลือ Y ปี M เดือน" · y>0 → "เหลือ Y ปี" · else "เหลือ max(1,m) เดือน"   // ไม่โชว์ "0 เดือน"
```

### 7.4 Customer DB (`customerDb.ts`) — ฐานข้อมูลหลังปิดการขาย
```ts
REGIONS = ["เหนือ","ตะวันออกเฉียงเหนือ","กลาง","ตะวันออก","ตะวันตก","ใต้"];   // 6 ภาค (78 จังหวัด map ไว้)
regionOf(province) → Region | null

useCustomerDb():
  1. กรองเฉพาะ q.status === "won"
  2. group ด้วยคีย์ `${q.dealerCode}|${q.customer}`      // ⭐ ต้องตรงทั้งคู่ — กันชื่อซ้ำข้ามสาขา
  3. buildings เรียงตาม wonAt เก่า→ใหม่
  4. deliveredAt/warranty = ของ "อาคารที่ส่งมอบทีหลังสุด"
  5. isRepeat = buildings.length > 1
  6. จับคู่ไม่ได้ → buildings: [] → ทุกช่อง null → แสดง "—"   // ⭐ ห้ามเดาแทน

isWarrantyExpiringSoon(w) = w.status === "active" && expiry <= TODAY + 1 ปี
// ⚠️ กับดัก: "ใกล้หมดประกัน" เป็น "สับเซตของ active" → ถ้าทำโดนัทต้องหักออก:
//    อยู่ในประกัน = active − expiringSoon   ไม่งั้นนับซ้ำ
```

### 7.5 HQ Alerts (`hqAlerts.ts`) — 6 กฎ
| # | key | เงื่อนไข |
|---|---|---|
| 1 | `unassignedLead` | `!assigned` **และ** ลีดเปิด **และ** อายุ > `unassignedAlertHours` (48 ชม.) |
| 2 | `idleLead` | ลีดเปิด **และ** `daysSinceContact > followUpAlertDays` (7 วัน) · `null` = ไม่เดาว่าค้าง |
| 3 | `quoteExpiring` | `status === "sent_to_client"` **เท่านั้น** · `0 ≤ daysLeft ≤ quoteExpiringDays` |
| 4 | `dealerIdle` | `idleDays > dealerIdleDays` · **ไม่เคยออกใบเลย = ไม่นับ** |
| 5 | `targetAchieved` | `achieved% = revenueActual/revenueTarget×100 ≥ targetAchievedPct` |
| 6 | `lostRate` | `lost/(lost+won) × 100 ≥ lostRatePct` · **ยังไม่มีลีดปิด = คิดไม่ได้ → ข้าม** |

**เกต:** `rules.alerts[k].on && rules.alerts[k].inapp` ต้องเปิดทั้งคู่

### 7.6 Money (`format.ts`)
```ts
parseBaht(v)  // "฿1.2M"→1200000 · B×1e9, M×1e6, K×1e3 (ไม่รองรับ T)
fmtBaht(v)    // ≤0→"฿0" · ≥1e12→T · ≥1e9→B · ≥1e6→M(1 ตำแหน่ง) · ≥1e3→K(ปัดเต็ม) · else toLocaleString
fmtM(v)       // ฿12.3M
fmtFull(v)    // ฿1,200,000
```

### 7.7 VAT (`quotationPrint.ts`)
```ts
subtotal = q.totalValue                      // ⭐ ก่อน VAT เสมอ
vat      = round(subtotal × vatPct / 100)
grand    = subtotal + vat
// ⭐ vatPct บังคับจาก loadHQPolicy().vat เสมอ — ตัวแทนแก้ไม่ได้
```

---

## 8. FilterContext — ช่วงเวลา + 5 มิติ

```ts
APP_NOW = new Date(2026, 5, 30);   // ⭐ "วันนี้" ตรึงไว้ที่ยุคของข้อมูล ไม่ใช่ new Date()
export const ALL = "all";
type TimePreset = "today" | "last7" | "thisMonth" | "thisYear" | "custom";
type FilterDim  = "dealer" | "province" | "product" | "status" | "person";
```

| preset | start | end | factor |
|---|---|---|---|
| `today` | `now` | `now` | 0.05 |
| `last7` | `now − 6d` | `now` | 0.23 |
| `thisMonth` | วันที่ 1 ของเดือน | `now` (**MTD**) | 1.0 |
| `thisYear` | 1 ม.ค. | `now` (**YTD**) | 5.24 |
| `custom` | `parseDate(cs)` | `parseDate(ce)` (**auto-swap ถ้ากลับด้าน**) | `max(0.05, round(days/30×100)/100)` |

> **ตัดออกแล้ว: `last30` · `quarter`** — อย่าใส่กลับโดยไม่ถาม
> **default = `thisYear`** — seed กระจายทั้งปี เปิดหน้าต้องเห็นข้อมูลครบ

```ts
parseDate(s)  // ลอง ISO "YYYY-MM-DD" ก่อน → ลองไทย "1 มิ.ย. 2569" (ปี−543) → null
inRange(d)    // ไม่มีวัน / parse ไม่ได้ → true (permissive — ไม่ตัดทิ้ง) · inclusive ทั้งสองด้าน

passes(f):    // ทุกมิติ skip ถ้า f.<dim> == null
  product → เทียบทั้งแม่แบบหลัก (mainTemplateOf) และย่อย · case-insensitive
  person  → รองรับหลายคนคั่น "," → "มีชื่อนี้อยู่ในรายการ"
reset()       // ⭐ ล้างแค่ 5 มิติ · คงช่วงเวลาไว้
activeCount   // นับมิติที่ ≠ ALL (0–5) · ไม่นับช่วงเวลา
```

---

## 9. Persistence — 23 localStorage keys + 1 sessionStorage

### 9.1 SalesContext (8)
`sales_deals_v1` · `sales_leads_v1` · `sales_lead_deal_map_v1` · `sales_next_deal_id_v1` · `sales_lead_checklists_v1` · `sales_customers_v1` · `sales_quotations_v1` · `sales_appointments_v1`

### 9.2 HQ config (10)
| key | shape |
|---|---|
| `hq_sales_policy` | `HQPolicy` |
| `hq_lead_rules` | `HQLeadRules` |
| `hq_targets` | `HQTargets` |
| `hq_notif_rules_v2` | `HQNotifRules` |
| `hq_notifications_v2` | `Record<string,{email,inapp}>` |
| `hq_sales_journey` | `{ lost: string[] \| {label}[] }` |
| `hq_system` | `{ runningPrefix, runningNext }` |
| `hq_dealers_v3` | `DealerRow[]` |
| `hq_users_v4` | ผู้ใช้ HQ |
| `hq_audit_log_v1` | `AuditEntry[]` (สูงสุด 300) |
| `hq_company_profile` · `hq_dealer_settings` | โปรไฟล์/ตั้งค่า |

### 9.3 Dealer (6)
`dealer_document_settings` · `dealer_issuer_profile_v2` · `dealer_files_v1` · `dealer_notif_prefs` · `dealer_company_logo_v2` · `dealer_company_wordmark_v2`

### 9.4 อื่น
`master_catalog_v2` · `bpms_profile_{code|hq}` · `bpms_responsible_persons` · `pms_session_key` · `pms_logged_in`
**sessionStorage:** `bpms_global_filters` (หรือ `bpms_filters:<pathname>` แยกต่อหน้า)

### 9.5 ⭐ `usePersistentState` — บั๊กจริงที่ต้องรู้
```ts
const [state, setState] = useState<T>(initial);
const [hydrated, setHydrated] = useState(false);   // ⭐ state ไม่ใช่ ref — จงใจ!

useEffect(() => { try { const s = localStorage.getItem(key); if (s) setState(JSON.parse(s)); } catch {}
                  setHydrated(true); }, [key]);
useEffect(() => { if (!hydrated) return;           // ⭐ ห้ามเขียนก่อนโหลดเสร็จ
                  try { localStorage.setItem(key, JSON.stringify(state)); } catch {} }, [key, state, hydrated]);
```
> **ถ้าใช้ `useRef` แทน `useState`** → effect เขียนใน commit เดียวกันเห็น state เป็นค่าเริ่มต้น (closure เก่า) → เขียนทับค่าที่เพิ่งโหลด → **ค่าที่ผู้ใช้บันทึกหายถาวรใน StrictMode**
> (เจอจริง: ตั้งกฎ 1000 วัน → เปิดหน้าใหม่ → เด้งกลับ 7)

> ⚠️ **ห้ามใช้ `usePersistentState` ในหน้าที่แค่อ่าน** — มันเขียนกลับ → ค่า default จะทับค่าที่ HQ ตั้งไว้ตอน mount
> → หน้าอ่านอย่างเดียวให้ใช้ `useHQRules` pattern (อ่าน + ฟัง event, ไม่เขียน)

> ⚠️ **ไม่มี schema validation** — JSON ที่ parse ได้แต่ shape ผิดจะถูก cast ตรง ๆ → **แก้ shape เมื่อไรต้องขึ้นเวอร์ชันคีย์** (`_v1` → `_v2`)

### 9.6 Events (5)
| event | dispatch | listen |
|---|---|---|
| `bpms-files-updated` (`DEALER_FILES_EVENT`) | `saveDealerFiles()` | หน้าไฟล์ |
| `bpms-audit-updated` | `appendAudit()` | `useAuditEntries` |
| `bpms-hq-lead-rules-updated` | HQ กดบันทึก | `useHQRules` |
| `bpms-hq-notif-updated` | HQ กดบันทึก | Topbar |
| `bpms-profile-updated` | แก้โปรไฟล์ | Topbar |
| `storage` (native) | — | `useAudit`, `useHQRules` (sync ข้ามแท็บ) |

> ⚠️ **3 context หลักไม่ฟัง `storage`** → ไม่ sync ข้ามแท็บ

---

## 10. กฎธุรกิจ (Constitution) — ห้ามละเมิด

### ขอบเขต
- **Sales CRM + Dealer Management เท่านั้น** — วงจรเริ่มที่ Lead จบที่ Won/Lost
- **ไม่มีเด็ดขาด:** ก่อสร้าง · ผลิต · ติดตั้ง/หน้างาน · วิศวกรรม · บัญชี/ERP (ใบแจ้งหนี้/ใบเสร็จ/เอกสารภาษี) · ซ่อมบำรุง · SLA · กราฟกรวย (funnel) · จัดกลุ่มลูกค้าตามขนาด
- **ห้ามใช้คำว่า "Project"** ใน entity/route/label → ใช้ **"ดีล (Deal)" / "งานขาย"**

### ข้อมูล/สิทธิ์
- **HQ เป็นเจ้าของข้อมูลทั้งหมด** (กันข้อมูลหายเมื่อตัวแทนออก)
- **Responsible Person ≠ User** — เป็นแค่ชื่อพนักงานขายไว้มอบหมาย **ล็อกอินไม่ได้ ไม่มีสิทธิ์**
- **ตัวแทน = 1 บัญชี** · HQ สร้างบัญชี/ตั้ง Region + เป้ารายปี · **ตัวแทนแก้อีเมล/รหัสผ่านตัวเองไม่ได้**
- HQ คุม: **VAT · อายุใบเสนอราคา · เลขที่ใบ · ราคากลาง · แม่แบบ**

### ราคา
- HQ ขายให้ตัวแทนที่ **ราคากลาง (ราคาทุน)** — ตัวแทนบวกกำไรเอง
- **ส่วนลด = ลบทั้งฟีเจอร์แล้ว** (15 ก.ค. 69) — ไม่มี `discountPct` · ราคาที่เสนอ = ราคาสุทธิ (Σ BOQ)

### ใบเสนอราคา
- ออกใน **ชื่อบริษัทของตัวแทน** — **ห้ามมี "Benjamin" ในเอกสาร**
- ตัวแทนอัปโหลดโลโก้เองไม่ได้ → หัวเอกสารใช้ชื่อบริษัทเป็นข้อความ
- `issuer` = **สแนปช็อต ณ ตอนสร้าง** — ใบเก่าคงชื่อเดิมแม้เปลี่ยนโปรไฟล์
- ไทม์ไลน์ **สร้างอัตโนมัติ + แก้/ลบไม่ได้**

### กฎเดียวของลีด
- **ไม่ติดต่อเกิน 7 วัน → เตือน + กรองได้** · ลีดตายต้องลบได้ · **ไม่มี SLA**

---

## 11. แผนย้ายไปโปรเจกต์ใหม่

### 11.1 ยกมาได้ทันที (pure TS — ไม่ผูก React/UI)
`format.ts` · `theme.ts` · `permissions.ts` · `warranty.ts` · `leadMetrics.ts` · `hqQuotations.ts` · `hqAlerts.ts` · `customerDb.ts (regionOf/REGIONS)` · types + constants ทั้งหมดใน `mock.ts`
→ **ย้ายไป backend/service layer ได้เลย** ไม่ต้องแก้

### 11.2 ต้องเขียนใหม่ตาม storage ที่เลือก
`usePersistentState` · 3 context · `useNetworkData` · `useHQRules` · `useMasterCatalog` · `useAudit`
→ ถ้าใช้ DB จริง: **ตรรกะใน action ยกมาได้ 100%** เปลี่ยนแค่ชั้น persist

### 11.3 ตัดทิ้งได้
`cn.ts` · `imageResize.ts` · `quotationPrint.ts` (HTML) · `settingsBus.tsx` · seed rows ทั้งหมด

### 11.4 ⚠️ หนี้ที่ต้องแก้ตอนสร้างใหม่ (เจอจากการอ่านโค้ดจริง)

| # | ปัญหา | ควรทำ |
|---|---|---|
| 1 | **มีระบบ stage 4 ชุดที่ไม่ตรงกัน** — `LeadStatus` (7, UPPER) · `pipelineStages` (id 2,4,5,9,6,7,8 ไม่เรียง) · `DealerLeadItem.status` (4, lower) · `hqPipelineStages` (5, lower) | **รวมเหลือชุดเดียว** = `LeadStatus` |
| 2 | **"วันนี้" ประกาศซ้ำ 3 ที่** — `warranty.TODAY` · `leadMetrics.MOCK_TODAY` · `FilterContext.APP_NOW` (ค่าเดียวกัน) + ยังมี literal `"2026-06-30"` / `"30 มิ.ย. 2569"` hardcode ใน SalesContext | **แหล่งเดียว** `APP_NOW` แล้ว inject |
| 3 | `parseThaiDate` **มี 2 implementation ต่างกัน** — `warranty` ลบ 543 เสมอ · `leadMetrics` ลบเฉพาะ `> 2500` | รวมเป็นตัวเดียว |
| 4 | `parseBaht` ไม่รองรับ `T` แต่ `parseValue` รองรับ (สูตรซ้ำ) | รวมเป็นตัวเดียว |
| 5 | `loadQuoteNumbering` **ขัดกับคอมเมนต์ตัวเอง** — คอมเมนต์ว่า "HQ คุม ห้ามแก้" แต่โค้ดให้ `dealer_document_settings` ชนะ | **ตัดสินใจใหม่** |
| 6 | `quotationPrint` ยัง hardcode **"ยืนราคา 30 วัน"** ในหัวเอกสาร ทั้งที่ terms แก้เป็น dynamic แล้ว → **เอกสารโกหกถ้าตั้ง validityDays ≠ 30** | ใช้ `doc.validityDays` |
| 7 | `wordmark`/`WORDMARK_KEY` เป็น **dead code** (กฎห้ามโลโก้ตัวแทน) | ลบ |
| 8 | **permission ไม่บังคับที่ data layer** | บังคับที่ server |
| 9 | `RoleContext` **ไม่มี try/catch ไม่มี validate** — ยัดค่าเสียลง `pms_session_key` → **throw ตอน render** | validate เหมือน FilterContext |
| 10 | `useMasterCatalog` ไม่ฟัง event → แก้ catalog แล้วแท็บอื่นไม่อัปเดต | ฟัง event เหมือน `useHQRules` |
| 11 | `SUPER_ADMIN` = `HQ_MANAGEMENT` · `HQ_STAFF` = `DEALER_ADMIN` (สิทธิ์เท่ากันเป๊ะ) | ยุบเหลือ 4 role |
| 12 | `setQuotationStatus` ยิง side effect **จากใน updater** (impure) | ย้ายออกนอก |

---

## 12. Checklist สร้างโปรเจกต์ใหม่

1. **ธีม** → คัด §1 ทั้งหมด (tokens + สีสถานะ)
2. **Data model** → คัด §4 types (ตัดฟิลด์ที่ไม่ใช้)
3. **RBAC** → §3 (ยุบเหลือ 4 role)
4. **Sales Journey** → §5 (`LEAD_TASK_TEMPLATE` + 4 ฟังก์ชัน) ⭐ ทำก่อน
5. **Business actions** → §6 (`convertLeadToCustomer` + `closeDeal` สำคัญสุด)
6. **สูตรตัวชี้วัด** → §7 ยกมาทั้งหมด (pure)
7. **Filter** → §8
8. **Persistence** → §9 (แก้หนี้ #2 ก่อน)
9. **กฎธุรกิจ** → §10 พิมพ์แปะไว้ ห้ามละเมิด
10. **แก้หนี้** → §11.4 โดยเฉพาะ #1 (stage 4 ชุด) และ #2 (วันนี้ 3 ที่)

---

_สกัดจากซอร์สจริง 16 ก.ค. 2569 · `src/lib` 17 ไฟล์ · `src/context` 3 ไฟล์ · `globals.css` · ตรวจสอบทุกฟังก์ชัน/ทุก type/ทุก key แล้ว_
