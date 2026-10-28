> **เอกสารเก่า ไม่ใช่ข้อกำหนดปัจจุบัน — ดู docs/FLOW.html**

# Benjamin PMS — Full Module Reference (Frontend + Backend)

> อัปเดต: มิถุนายน 2026  
> Frontend: Next.js 15 · TypeScript · Tailwind v4 · lucide-react  
> Backend (Planned): Next.js API Routes · Prisma ORM · PostgreSQL · Auth.js  
> สถานะ: **Frontend เสร็จแล้ว** | **Backend ยังไม่ได้สร้าง (Design เสร็จแล้ว)**

---

## สารบัญ

### PART A — FRONTEND (ทำงานได้แล้ว)
1. [App Pages](#1-app-pages)
2. [Layout Components](#2-layout-components)
3. [UI Components](#3-ui-components)
4. [HQ Components](#4-hq-components)
5. [Context / State](#5-context--state)
6. [Lib / Utilities](#6-lib--utilities)
7. [Mock Data](#7-mock-data)
8. [Design Tokens (CSS)](#8-design-tokens)

### PART B — BACKEND (Design & Plan)
9. [Database Schema — Enums](#9-database-schema--enums)
10. [Database Schema — Models](#10-database-schema--models)
11. [API Routes (Planned)](#11-api-routes-planned)
12. [Service Layer (Planned)](#12-service-layer-planned)
13. [Auth & Middleware (Planned)](#13-auth--middleware-planned)
14. [Tenant Isolation Pattern](#14-tenant-isolation-pattern)

### PART C — Overview
15. [Routes Summary](#15-routes-summary)
16. [Dependencies](#16-dependencies)

---

# PART A — FRONTEND

---

## 1. App Pages

### `/` → redirect `/dashboard`
**File:** `src/app/page.tsx`

| Export | คำอธิบาย |
|--------|---------|
| `Home` | Server Component — redirect ไป `/dashboard` ทันที |

---

### Root Layout
**File:** `src/app/layout.tsx`

| Export | คำอธิบาย |
|--------|---------|
| `RootLayout` | ครอบทั้งแอปด้วย `<RoleProvider>` + Noto Sans Thai font + metadata |

```tsx
// โครงสร้าง
<html lang="th" className={notoThai.variable}>
  <body>
    <RoleProvider>   ← ครอบทุก route (ทำให้ login page ใช้ useRole() ได้ด้วย)
      {children}
    </RoleProvider>
  </body>
</html>
```

---

### Auth Layout
**File:** `src/app/(auth)/layout.tsx`

| Export | คำอธิบาย |
|--------|---------|
| `AuthLayout` | Layout สำหรับ login pages — centered flex, bg gray, ไม่มี Sidebar/Topbar |

---

### Dealer Login
**File:** `src/app/(auth)/login/page.tsx`

| Export | คำอธิบาย |
|--------|---------|
| `DealerLoginPage` | หน้า login สำหรับดีลเลอร์ ธีมสี Dark Blue |

**State:**
```ts
showPass: boolean      // toggle แสดง/ซ่อนรหัสผ่าน
loading: boolean       // spinner ระหว่าง mock login
email: string
password: string
```

**handleLogin(e):**
```ts
// 1. setLoading(true)
// 2. setTimeout 800ms (simulate network)
// 3. switchSession("dealer")
// 4. router.push("/dashboard")
```

**UI Elements:**
- Logo B icon (Dark Blue) + "BENJAMIN" + subtitle
- Email field (icon: Mail)
- Password field (icon: Lock, toggle Eye/EyeOff)
- "ลืมรหัสผ่าน?" button
- Submit button → spinner → redirect
- Link "เข้าสู่ระบบ HQ →" ไป `/login/hq`
- Footer copyright

---

### HQ Login
**File:** `src/app/(auth)/login/hq/page.tsx`

| Export | คำอธิบาย |
|--------|---------|
| `HQLoginPage` | หน้า login สำหรับ HQ ธีมสี Steel Gray + stripe "Restricted Access" |

**State:** (เหมือน DealerLoginPage)

**handleLogin(e):**
```ts
// 1. setLoading(true)
// 2. setTimeout 800ms
// 3. switchSession("hq")
// 4. router.push("/hq/dashboard")
```

**UI Elements เพิ่มเติมจาก Dealer:**
- Header stripe สีดำ: `🛡 HQ — สำนักงานใหญ่ · Restricted Access · Authorized Personnel Only`
- Email placeholder: `name@benjaminpebsteel.com`
- Submit button สีดำ
- Link "← กลับไปหน้าเข้าสู่ระบบดีลเลอร์" ไป `/login`

---

### App Shell Layout
**File:** `src/app/(app)/layout.tsx`

| Export | คำอธิบาย |
|--------|---------|
| `AppLayout` | Shell หลัก — Sidebar + Topbar + main content + RoleSwitcher |

```
┌──────────────────────────────────────────────┐
│ Sidebar (w-60)  │ Topbar (h-16)              │
│                 ├────────────────────────────│
│                 │ <main> (overflow-y-auto p-6)│
│                 │   {children}               │
└──────────────────────────────────────────────┘
                            RoleSwitcher (fixed)
```

---

### HQ Guard Layout
**File:** `src/app/(app)/hq/layout.tsx`

| Export | คำอธิบาย |
|--------|---------|
| `HQLayout` | Client Component — ป้องกัน `/hq/*` ทุก route ไม่ให้ dealer เข้าได้ |

**Logic:**
```ts
useEffect(() => {
  if (!isHQ) router.replace("/dashboard");  // redirect dealer ออกทันที
}, [isHQ]);

if (!isHQ) return <div>🔒 ไม่มีสิทธิ์เข้าถึง</div>;
return <>{children}</>;
```

---

### Dealer Dashboard
**File:** `src/app/(app)/dashboard/page.tsx`

| Export | คำอธิบาย |
|--------|---------|
| `DashboardPage` | หน้า Dashboard ดีลเลอร์ |

**Layout:**
```
Row 1 (grid 2/4): [KpiCard ×4]
Row 2 (grid 3cols):
  [LineChartCard]  [DonutChart + ActionItems]  [SchedulePanel]
Row 3:
  [LeadTable fullwidth]
```

**Action Items (hardcoded):**
| รายการ | จำนวน |
|--------|-------|
| ลูกค้าเป้าหมายค้างนาน | 3 |
| ใบเสนอราคารออนุมัติ | 1 |
| นัดสำรวจสัปดาห์นี้ | 2 |
| โครงการล่าช้า | 1 |
| รายงานหน้างานค้าง | 2 วัน |

---

### HQ Dashboard
**File:** `src/app/(app)/hq/dashboard/page.tsx`

| Export | คำอธิบาย |
|--------|---------|
| `HQDashboardPage` | หน้า Dashboard HQ — ภาพรวมทั้งเครือข่าย |

**Layout:**
```
Row 1 (grid 4): [KpiCard ×4] ← hqKpis
Row 2 (1fr + 340px): [LineChartCard (hqSalesByMonth)] [LeaderboardCard]
Row 3 (1fr + 400px): [LeadPoolTable] [ApprovalQueue]
```

---

## 2. Layout Components

### Sidebar
**File:** `src/components/layout/Sidebar.tsx`

| Export | ประเภท | คำอธิบาย |
|--------|--------|---------|
| `Sidebar` | Client Component | Navigation bar ซ้ายมือ |

**Types:**
```ts
type NavItem = {
  label: string;
  href: string;
  hqHref?: string;      // href เมื่อ isHQ=true (เช่น /hq/dashboard)
  dealerHref?: string;
  icon: React.ReactNode;
  badge?: number;       // orange badge จำนวน
  hqOnly?: boolean;     // ซ่อนเมื่อ isHQ=false
  dealerOnly?: boolean; // ซ่อนเมื่อ isHQ=true
};
```

**ฟังก์ชัน Logic:**
```ts
// กรองเมนูตาม role
const visible = group.items.filter(
  (item) => !(item.hqOnly && !isHQ) && !(item.dealerOnly && isHQ)
);

// resolve href ตาม role
const resolvedHref = (isHQ && item.hqHref) ? item.hqHref : item.href;

// active state
const active = pathname === resolvedHref;
```

**เมนูทั้งหมด (14 รายการ):**

| กลุ่ม | label | href | hqHref | hqOnly |
|-------|-------|------|--------|--------|
| งานหลัก | แดชบอร์ด | /dashboard | /hq/dashboard | - |
| งานหลัก | ลูกค้าเป้าหมาย (×6) | /leads | - | - |
| งานหลัก | ลูกค้า | /customers | - | - |
| งานหลัก | ใบเสนอราคา | /quotations | - | - |
| งานหลัก | โครงการ | /projects | - | - |
| งานหลัก | Lead Pool (×3) | /hq/lead-pool | - | ✓ |
| งานหลัก | รออนุมัติ (×2) | /hq/approvals | - | ✓ |
| งานหลัก | จัดการดีลเลอร์ | /hq/dealers | - | ✓ |
| รายงาน | Analytics | /reports/analytics | - | - |
| รายงาน | การเงิน | /reports/finance | - | - |
| รายงาน | ยอดขาย | /reports/sales | - | - |
| จัดการ | Master/ราคากลาง | /hq/master | - | ✓ |
| จัดการ | Help & Support | /help | - | - |
| จัดการ | ตั้งค่า | /settings | - | - |

---

### Topbar
**File:** `src/components/layout/Topbar.tsx`

| Export | ประเภท | คำอธิบาย |
|--------|--------|---------|
| `Topbar` | Client Component | Header bar ด้านบน |

**Conditional ตาม `isHQ`:**
| Element | Dealer mode | HQ mode |
|---------|-------------|---------|
| Subtitle | "ยินดีต้อนรับสู่ระบบบริหารจัดการ Benjamin" | "🏢 ยินดีต้อนรับ — สำนักงานใหญ่" |
| Search placeholder | "ค้นหาลูกค้าเป้าหมาย / ลูกค้า / โครงการ…" | "ค้นหาดีลเลอร์ / ลูกค้าเป้าหมาย / โครงการ…" |
| Avatar | `bg-[#003366]` | `bg-orange-500` |

**Elements:**
- Greeting: "สวัสดี, {session.name} 👋"
- Search input (hidden on mobile)
- MessageSquare icon button
- Bell icon button + orange dot (notification)
- Profile chip: avatar initial + name + role

---

### RoleSwitcher
**File:** `src/components/layout/RoleSwitcher.tsx`

| Export | ประเภท | คำอธิบาย |
|--------|--------|---------|
| `RoleSwitcher` | Client Component | Dev-only floating pill สลับ session |

**Position:** `fixed bottom-4 right-4 z-50`

**ปุ่ม:**
- "ดีลเลอร์" → `switchSession("dealer")` → active: white bg
- "HQ" → `switchSession("hq")` → active: brand-blue bg
- แสดง `session.name` ชื่อ user ปัจจุบัน

---

## 3. UI Components

### KpiCard
**File:** `src/components/ui/KpiCard.tsx`

| Export | ประเภท | คำอธิบาย |
|--------|--------|---------|
| `KpiCard` | Server Component | การ์ด KPI 1 ตัวเลข |

**Props:**
```ts
type KpiCardProps = {
  label: string;   // ชื่อ KPI
  value: string;   // ค่า เช่น "฿18.4M"
  delta: number;   // % เปลี่ยนแปลง (+ = green badge, - = red badge)
  icon: string;    // key สำหรับ lookup icon
};
```

**Icon Key Map:**
| key | Icon |
|-----|------|
| `target` | Target |
| `trending` | TrendingUp |
| `award` | Award |
| `building` | Building2 |
| `dollar` | DollarSign |
| `clock` | Clock |
| *(fallback)* | TrendingUp |

---

### LineChartCard
**File:** `src/components/ui/LineChart.tsx`

| Export | ประเภท | คำอธิบาย |
|--------|--------|---------|
| `LineChartCard` | Client Component | Pure SVG line chart |

**Props:**
```ts
type Props = {
  data?: { month: string; value: number }[];
  title?: string;    // default: "ยอดขายรายเดือน"
  subtitle?: string; // default: "มูลค่าใบเสนอราคาที่ชนะ (หมื่นบาท)"
};
```

**SVG Rendering (ไม่ใช้ library):**
```ts
// Constants
H=120, W=480, padX=24, padY=12

// คำนวณ coordinates
points = data.map((d, i) => ({
  x: padX + (i / (data.length - 1)) * innerW,
  y: padY + (1 - d.value / max) * innerH,
}))

// SVG elements
1. LinearGradient (blue → transparent)
2. Grid lines 5 เส้นแนวนอน
3. <path> area fill
4. <polyline> เส้นกราฟ stroke #003366
5. <circle> dot ทุก point (r=4)
6. <text> month labels แกน X
```

---

### DonutChart
**File:** `src/components/ui/DonutChart.tsx`

| Export | ประเภท | คำอธิบาย |
|--------|--------|---------|
| `DonutChart` | Server Component | Pure SVG donut chart |

**Helper Functions (internal):**
```ts
function polarToXY(cx, cy, r, deg): { x, y }
// แปลง angle → x,y (0° = 12 นาฬิกา, clockwise)

function slicePath(cx, cy, outerR, innerR, startDeg, endDeg): string
// สร้าง SVG path สำหรับ donut slice
// ใช้ Arc (A) + Line (L) commands
```

**Data:** `pipelineBreakdown` (hardcoded from mock)
```ts
[
  { label: "เสนอราคา", value: 58, color: "var(--color-brand-blue)" },
  { label: "ต่อรอง",   value: 24, color: "var(--color-silver)" },
  { label: "อื่นๆ",    value: 18, color: "var(--color-steel)" },
]
```

---

### SchedulePanel
**File:** `src/components/ui/SchedulePanel.tsx`

| Export | ประเภท | คำอธิบาย |
|--------|--------|---------|
| `SchedulePanel` | Server Component | Panel นัดหมายและ upcoming |

**Sections:**
1. **Week Strip** — วัน จ–ศ, highlight วันนี้ด้วย `bg-[#003366]`
2. **วันนี้** — items จาก `schedule[]` (title, time, place)
3. **กำหนดการ** — items จาก `upcoming[]` (title, date, who)

---

### LeadTable
**File:** `src/components/ui/LeadTable.tsx`

| Export | ประเภท | คำอธิบาย |
|--------|--------|---------|
| `LeadTable` | Client Component | ตาราง Lead พร้อม search |

**State:**
```ts
const [search, setSearch] = useState("");
```

**Filter:**
```ts
const filtered = leads.filter((l) =>
  l.name.includes(search) ||
  l.province.includes(search) ||
  l.id.includes(search)
);
```

**Columns:**
| # | Header | Data | Notes |
|---|--------|------|-------|
| 1 | - | checkbox | UI only |
| 2 | รหัส | `lead.id` | #L-XXXXX |
| 3 | ชื่อลูกค้า | `lead.name` | |
| 4 | จังหวัด | `lead.province` | |
| 5 | ประเภท | `lead.product` | color badge |
| 6 | สถานะ | `lead.status` | `<StatusBadge>` |
| 7 | มูลค่า | `lead.value` | |
| 8 | - | link icon | UI only |

---

### StatusBadge
**File:** `src/components/ui/StatusBadge.tsx`

| Export | ประเภท | คำอธิบาย |
|--------|--------|---------|
| `StatusBadge` | Server Component | Badge สีตาม LeadStatus |

**Props:** `{ status: LeadStatus }`

**Map:**
| status | label | สี |
|--------|-------|----|
| NEW | ใหม่ | blue |
| CONTACTED | ติดต่อแล้ว | purple |
| SURVEYED | สำรวจแล้ว | yellow |
| QUOTED | เสนอราคา | brand-blue |
| NEGOTIATING | ต่อรอง | orange |
| WON | ปิดการขาย | green |
| LOST | เสียดีล | red |

---

## 4. HQ Components

### LeaderboardCard
**File:** `src/components/hq/LeaderboardCard.tsx`

| Export | ประเภท | คำอธิบาย |
|--------|--------|---------|
| `LeaderboardCard` | Server Component | จัดอันดับดีลเลอร์ |

**Data:** `dealerLeaderboard` (DealerRow[])

**Per-Row Render Logic:**
```ts
// Medal color
i === 0 → gold (bg-yellow-400)
i === 1 → silver (bg-[#c0c0c0])
i === 2 → bronze (bg-orange-300)
default → gray (bg-[#f7f8fa])

// Progress bar color
targetPct >= 80 → green (#1f8a4c)
targetPct >= 50 → blue (#003366)
default         → warning (#c98a00)
```

---

### LeadPoolTable
**File:** `src/components/hq/LeadPoolTable.tsx`

| Export | ประเภท | คำอธิบาย |
|--------|--------|---------|
| `LeadPoolTable` | Client Component | Lead Pool ที่ยังไม่มีดีลเลอร์รับ |

**State:**
```ts
const [assigned, setAssigned] = useState<Set<string>>(new Set());
```

**Functions:**
```ts
handleAssign(id: string): void
// เพิ่ม id ใน Set → ปุ่ม "มอบหมาย" กลายเป็น "✓ มอบหมายแล้ว"

channelIcon(ch: string): JSX.Element
// "LINE OA" → <MessageCircle>
// else      → <Globe>

channelColor(ch: string): string
// "LINE OA" → "bg-green-50 text-green-700"
// else      → "bg-blue-50 text-blue-600"
```

---

### ApprovalQueue
**File:** `src/components/hq/ApprovalQueue.tsx`

| Export | ประเภท | คำอธิบาย |
|--------|--------|---------|
| `ApprovalQueue` | Client Component | คิวอนุมัติใบเสนอราคาส่วนลด |

**State:**
```ts
const [actions, setActions] = useState<Record<string, "approved" | "rejected">>({});
```

**Functions:**
```ts
act(id: string, action: "approved" | "rejected"): void
// บันทึก action → UI เปลี่ยนปุ่มเป็น status text

// Discount color rule
discountPct >= 15 → "bg-red-50 text-red-600"
discountPct < 15  → "bg-orange-50 text-orange-600"
```

---

## 5. Context / State

### RoleContext
**File:** `src/context/RoleContext.tsx`

| Export | ประเภท | คำอธิบาย |
|--------|--------|---------|
| `RoleProvider` | Client Component | Context Provider ครอบ root layout |
| `useRole()` | Hook | อ่านค่า context — throw หากใช้นอก Provider |

**Context Type:**
```ts
type RoleContextType = {
  session: MockSession;                          // ข้อมูล user ปัจจุบัน
  isHQ: boolean;                                 // session.scopeAll
  role: UserRole;                                // session.role
  switchSession: (key: "hq" | "dealer") => void; // สลับ session
  currentKey: "hq" | "dealer";
};
```

**State:**
```ts
const [currentKey, setCurrentKey] = useState<"hq" | "dealer">("dealer");
const session = sessions[currentKey];
```

**Error Guard:**
```ts
if (!ctx) throw new Error("useRole must be used inside RoleProvider");
```

---

## 6. Lib / Utilities

### cn
**File:** `src/lib/cn.ts`

| Export | Signature | คำอธิบาย |
|--------|-----------|---------|
| `cn` | `(...inputs: ClassValue[]) => string` | Merge Tailwind classes ปลอดภัย |

```ts
// Usage
cn("base", condition && "extra", { "toggle": bool })
// → "base extra toggle"
```

---

## 7. Mock Data

**File:** `src/lib/mock.ts`

### Types

```ts
type UserRole = "SUPER_ADMIN" | "HQ_MANAGEMENT" | "HQ_STAFF"
              | "DEALER_ADMIN" | "DEALER_SALES" | "DEALER_SITE";

type MockSession = {
  name: string;
  role: UserRole;
  dealerName: string;
  scopeAll: boolean;   // true = HQ (เห็นทุก tenant)
};

type LeadStatus = "NEW" | "CONTACTED" | "SURVEYED"
                | "QUOTED" | "NEGOTIATING" | "WON" | "LOST";

type LeadRow = {
  id: string; name: string; province: string;
  product: string; status: LeadStatus; value: string;
};

type DealerRow = {
  code: string; name: string; region: string;
  revenue: string; targetPct: number;
  winRate: number; activeProjects: number;
};

type LeadPoolRow = {
  id: string; name: string; province: string;
  channel: string; product: string;
  value: string; createdAt: string;
};

type ApprovalRow = {
  id: string; quoteNo: string; dealer: string;
  customer: string; total: string;
  discountPct: number; requestedAt: string;
};
```

### Constants

| ชื่อ | ประเภท | ข้อมูล | ใช้ใน |
|------|--------|--------|-------|
| `sessions` | `Record<"hq"\|"dealer", MockSession>` | 2 entries | RoleContext |
| `leadStatusLabel` | `Record<LeadStatus, string>` | 7 labels ภาษาไทย | StatusBadge |
| `kpis` | array (4) | target/pipeline/win/projects | Dealer Dashboard |
| `salesByMonth` | array (8) | ม.ค.–ส.ค. ค่า 640–1320 | LineChartCard |
| `pipelineBreakdown` | array (3) | เสนอราคา/ต่อรอง/อื่นๆ | DonutChart |
| `schedule` | array (2) | วันนี้ schedule | SchedulePanel |
| `upcoming` | array (2) | milestone upcoming | SchedulePanel |
| `leads` | `LeadRow[]` (6) | ลูกค้าเป้าหมายตัวอย่าง | LeadTable |
| `hqKpis` | array (4) | revenue/pipeline/projects/ontime | HQ Dashboard |
| `dealerLeaderboard` | `DealerRow[]` (5) | ระยอง/เชียงใหม่/เชียงราย/แม่สอด/นครสวรรค์ | LeaderboardCard |
| `leadPool` | `LeadPoolRow[]` (3) | อุตรดิตถ์/ลำปาง/พะเยา | LeadPoolTable |
| `pendingApprovals` | `ApprovalRow[]` (2) | Q-2026-0089, Q-2026-0091 | ApprovalQueue |
| `hqSalesByMonth` | array (8) | ม.ค.–ส.ค. ค่า 3800–8200 | LineChartCard (HQ) |

---

## 8. Design Tokens

**File:** `src/app/globals.css`

```css
@theme {
  /* Brand */
  --color-brand-blue:       #003366;  /* Primary — buttons, active states */
  --color-brand-blue-hover: #00284f;  /* Hover */
  --color-brand-blue-50:    #e6edf3;  /* Icon backgrounds */

  /* Neutral */
  --color-steel:   #2d2d2d;  /* Headings, dark text */
  --color-silver:  #c0c0c0;  /* Borders, icons, muted */
  --color-bg:      #f7f8fa;  /* Page background */
  --color-surface: #ffffff;  /* Card background */
  --color-line:    #e2e5ea;  /* Dividers, input borders */
  --color-muted:   #6b7280;  /* Placeholder, secondary text */

  /* Semantic */
  --color-success: #1f8a4c;  /* WON, ปิดการขาย, อนุมัติแล้ว */
  --color-warning: #c98a00;  /* ส่วนลด, เกือบถึงเป้า */
  --color-danger:  #c0392b;  /* LOST, ปฏิเสธ, ส่วนลดสูง */
}
```

---

---

# PART B — BACKEND

> ยังไม่ได้ implement — เป็น Design Plan สำหรับ M0 Backend Sprint

---

## 9. Database Schema — Enums

**File:** `prisma/schema.prisma`

| Enum | Values |
|------|--------|
| `DealerType` | `HQ` `DEALER` |
| `UserRole` | `SUPER_ADMIN` `HQ_MANAGEMENT` `HQ_STAFF` `DEALER_ADMIN` `DEALER_SALES` `DEALER_SITE` |
| `EntityStatus` | `ACTIVE` `INACTIVE` |
| `CustomerType` | `INDIVIDUAL` `COMPANY` |
| `LeadStatus` | `NEW` `CONTACTED` `SURVEYED` `QUOTED` `NEGOTIATING` `WON` `LOST` |
| `LeadChannel` | `WEB` `LINE` `PHONE` `WALKIN` `OTHER` |
| `ActivityType` | `CALL` `VISIT` `QUOTE` `NOTE` `SURVEY` |
| `ProductCategory` | `EASYBUILD` `RANBUILD` `PREFAB` `CUSTOM` |
| `MaterialCategory` | `STEEL` `ROOF` `INSULATION` `WALL` `SYSTEM` `OTHER` |
| `QuotationStatus` | `DRAFT` `PENDING_APPROVAL` `APPROVED` `SENT` `WON` `LOST` `EXPIRED` |
| `ApprovalStatus` | `NOT_REQUIRED` `PENDING` `APPROVED` `REJECTED` |
| `ProjectStatus` | `PLANNING` `IN_PROGRESS` `QC` `HANDOVER` `COMPLETED` `ON_HOLD` |
| `PhaseStatus` | `PENDING` `ACTIVE` `DONE` `BLOCKED` |
| `TaskStatus` | `TODO` `DOING` `DONE` |
| `MilestoneStatus` | `PENDING` `REACHED` `MISSED` |
| `DocType` | `DRAWING` `BOQ` `CONTRACT` `PERMIT` `HANDOVER` `OTHER` |
| `QCResult` | `PASS` `FAIL` `NA` |
| `PunchStatus` | `OPEN` `FIXED` `VERIFIED` |
| `WarrantyType` | `STRUCTURE` `ROOF` `OTHER` |
| `NotifChannel` | `INAPP` `EMAIL` `LINE` |
| `AuditAction` | `CREATE` `UPDATE` `DELETE` |

---

## 10. Database Schema — Models

### `Dealer` — Multi-tenant Root

```prisma
model Dealer {
  id            String       @id @default(cuid())
  code          String       @unique      // "CNX", "RYG"
  name          String                    // "สาขาเชียงใหม่ (Master House)"
  type          DealerType               // HQ | DEALER
  region        String?                  // "เหนือ", "ตะวันออก"
  provinces     String[]                 // ["เชียงใหม่", "ลำพูน"]
  address       String?
  phone         String?
  email         String?
  targetRevenue Decimal?                 // เป้ารายเดือน (บาท)
  status        EntityStatus @default(ACTIVE)
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  // Relations
  users         User[]
  customers     Customer[]
  leads         Lead[]
  quotations    Quotation[]
  projects      Project[]
}
```

---

### `User` — ผู้ใช้ระบบ

```prisma
model User {
  id           String       @id @default(cuid())
  dealerId     String                    // FK → Dealer (tenant key)
  email        String       @unique
  name         String
  phone        String?
  role         UserRole                  // กำหนดสิทธิ์
  passwordHash String
  status       EntityStatus @default(ACTIVE)
  lastLoginAt  DateTime?
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  // Relations
  dealer           Dealer         @relation(fields: [dealerId], references: [id])
  assignedLeads    Lead[]         @relation("AssignedLeads")
  activities       Activity[]
  managedProjects  Project[]      @relation("ProjectManager")
  tasks            Task[]         @relation("TaskAssignee")
  notifications    Notification[]

  @@index([dealerId])
}
```

---

### `Customer` — ลูกค้า

```prisma
model Customer {
  id          String       @id @default(cuid())
  dealerId    String                    // FK → Dealer
  name        String
  type        CustomerType             // INDIVIDUAL | COMPANY
  taxId       String?
  phone       String?
  email       String?
  address     String?
  province    String?
  createdById String?                  // FK → User
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  deletedAt   DateTime?               // Soft delete

  // Relations
  dealer     Dealer      @relation(fields: [dealerId], references: [id])
  leads      Lead[]
  quotations Quotation[]
  projects   Project[]

  @@index([dealerId])
}
```

---

### `Lead` — ลูกค้าเป้าหมาย / CRM

```prisma
model Lead {
  id              String      @id @default(cuid())
  dealerId        String?                  // null = Lead Pool (ยังไม่มอบหมาย)
  customerId      String?                  // FK → Customer
  source          String?                  // "LINE", "Web Inquiry"
  channel         LeadChannel             // WEB | LINE | PHONE | WALKIN | OTHER
  status          LeadStatus  @default(NEW)
  assignedToId    String?                  // FK → User (sales)
  productInterest String?                  // "EASYBUILD 300sqm"
  estValue        Decimal?                // ประมาณมูลค่า
  province        String?                 // จังหวัดโครงการ
  lostReason      String?
  createdById     String?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  // Relations
  dealer     Dealer?    @relation(fields: [dealerId], references: [id])
  customer   Customer?  @relation(fields: [customerId], references: [id])
  assignedTo User?      @relation("AssignedLeads", fields: [assignedToId], references: [id])
  activities Activity[]
  quotations Quotation[]

  @@index([dealerId, status])
}
```

---

### `Activity` — บันทึกกิจกรรม

```prisma
model Activity {
  id          String       @id @default(cuid())
  leadId      String?
  userId      String
  type        ActivityType // CALL | VISIT | QUOTE | NOTE | SURVEY
  note        String?
  scheduledAt DateTime?
  doneAt      DateTime?
  createdAt   DateTime     @default(now())

  lead Lead? @relation(fields: [leadId], references: [id])
  user User  @relation(fields: [userId], references: [id])

  @@index([leadId])
}
```

---

### `Product` — สินค้า (Master Catalog)

```prisma
model Product {
  id        String          @id @default(cuid())
  code      String          @unique      // "EASY-300-STD"
  category  ProductCategory             // EASYBUILD | RANBUILD | PREFAB | CUSTOM
  name      String
  unit      String                      // "sqm", "ชุด"
  basePrice Decimal
  spec      Json                        // { "span": 12, "height": 6 }
  active    Boolean         @default(true)

  items QuotationItem[]
}
```

---

### `Material` — วัสดุ (Master Catalog)

```prisma
model Material {
  id        String           @id @default(cuid())
  code      String           @unique
  name      String
  category  MaterialCategory // STEEL | ROOF | INSULATION | WALL | SYSTEM | OTHER
  unit      String
  basePrice Decimal
  active    Boolean          @default(true)

  items QuotationItem[]
}
```

---

### `Quotation` — ใบเสนอราคา / BOQ

```prisma
model Quotation {
  id             String          @id @default(cuid())
  dealerId       String
  customerId     String
  leadId         String?
  quoteNo        String          @unique     // "Q-2026-0089"
  revision       Int             @default(0) // เวอร์ชัน แก้ไข
  status         QuotationStatus @default(DRAFT)
  subtotal       Decimal
  discountPct    Decimal         @default(0)
  discountAmt    Decimal         @default(0)
  vatAmt         Decimal         @default(0)
  total          Decimal
  validUntil     DateTime?
  approvalStatus ApprovalStatus  @default(NOT_REQUIRED)
  approvedById   String?                     // FK → User (HQ approver)
  createdById    String?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  dealer   Dealer          @relation(fields: [dealerId], references: [id])
  customer Customer        @relation(fields: [customerId], references: [id])
  lead     Lead?           @relation(fields: [leadId], references: [id])
  items    QuotationItem[]
  project  Project?

  @@index([dealerId, status])
}
```

---

### `QuotationItem` — รายการใน BOQ

```prisma
model QuotationItem {
  id          String  @id @default(cuid())
  quotationId String
  productId   String?
  materialId  String?
  description String              // หรือ custom line item
  qty         Decimal
  unit        String
  unitPrice   Decimal
  amount      Decimal             // qty × unitPrice
  sortOrder   Int     @default(0)

  quotation Quotation @relation(fields: [quotationId], references: [id], onDelete: Cascade)
  product   Product?  @relation(fields: [productId], references: [id])
  material  Material? @relation(fields: [materialId], references: [id])

  @@index([quotationId])
}
```

---

### `Project` — โครงการก่อสร้าง

```prisma
model Project {
  id            String        @id @default(cuid())
  dealerId      String
  customerId    String
  quotationId   String?       @unique
  projectNo     String        @unique       // "P-2026-0041"
  name          String
  buildingType  String?                     // "โกดัง", "โรงงาน"
  province      String?
  siteAddress   String?
  gps           String?                     // "18.7904,98.9847"
  contractValue Decimal?
  startDate     DateTime?
  dueDate       DateTime?
  status        ProjectStatus @default(PLANNING)
  currentPhase  Int           @default(1)   // 1–6
  pmId          String?                     // Project Manager FK
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  deletedAt     DateTime?                   // Soft delete

  dealer     Dealer          @relation(fields: [dealerId], references: [id])
  customer   Customer        @relation(fields: [customerId], references: [id])
  quotation  Quotation?      @relation(fields: [quotationId], references: [id])
  pm         User?           @relation("ProjectManager", fields: [pmId], references: [id])
  phases     ProjectPhase[]
  tasks      Task[]
  milestones Milestone[]
  documents  Document[]
  photos     SitePhoto[]
  checklists QCChecklist[]
  punchItems PunchItem[]
  reports    DailySiteReport[]
  handover   Handover?

  @@index([dealerId, status])
}
```

---

### `ProjectPhase` — 6 Phases

```prisma
model ProjectPhase {
  id          String      @id @default(cuid())
  projectId   String
  phaseNo     Int                       // 1–6
  name        String
  status      PhaseStatus @default(PENDING)
  progressPct Int         @default(0)  // 0–100
  startDate   DateTime?
  endDate     DateTime?

  project Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  tasks   Task[]
  photos  SitePhoto[]

  @@unique([projectId, phaseNo])
}
```

**6 Phases ของโครงการ:**
| phaseNo | ชื่อ Phase | กิจกรรมหลัก |
|---------|------------|------------|
| 1 | สำรวจหน้างาน (Survey) | วัดพื้นที่, ถ่ายรูป, บันทึก GPS |
| 2 | ออกแบบ (Design) | แบบ Shop Drawing, ส่งลูกค้าอนุมัติ |
| 3 | ผลิต (Manufacturing) | ตัดเหล็ก, Roll Form, QC โรงงาน |
| 4 | ขนส่ง & ติดตั้ง (Transport/Install) | จัดส่งวัสดุ, ติดตั้งโครง, หลังคา, ผนัง |
| 5 | ตรวจสอบคุณภาพ (QC) | QC Checklist, Punch List, แก้ไขงาน |
| 6 | ส่งมอบ & รับประกัน (Handover+Warranty) | Handover Doc, ลูกค้าเซ็น, เริ่มประกัน |

---

### `Task` — งานย่อย

```prisma
model Task {
  id          String     @id @default(cuid())
  projectId   String
  phaseId     String?
  title       String
  description String?
  assigneeId  String?
  status      TaskStatus @default(TODO)
  priority    Int        @default(2)  // 1=low 2=medium 3=high
  dueDate     DateTime?
  createdAt   DateTime   @default(now())

  project  Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  phase    ProjectPhase? @relation(fields: [phaseId], references: [id])
  assignee User?         @relation("TaskAssignee", fields: [assigneeId], references: [id])

  @@index([projectId])
}
```

---

### `Milestone` — Milestone โครงการ

```prisma
model Milestone {
  id        String          @id @default(cuid())
  projectId String
  name      String
  dueDate   DateTime?
  status    MilestoneStatus @default(PENDING)

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
}
```

---

### `Document` — เอกสารโครงการ

```prisma
model Document {
  id           String  @id @default(cuid())
  projectId    String
  type         DocType // DRAWING | BOQ | CONTRACT | PERMIT | HANDOVER | OTHER
  name         String
  fileUrl      String
  version      Int     @default(1)
  uploadedById String?
  createdAt    DateTime @default(now())

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
}
```

---

### `SitePhoto` — รูปหน้างาน

```prisma
model SitePhoto {
  id           String    @id @default(cuid())
  projectId    String
  phaseId      String?
  url          String
  caption      String?
  gps          String?
  takenAt      DateTime?
  uploadedById String?
  createdAt    DateTime  @default(now())

  project Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  phase   ProjectPhase? @relation(fields: [phaseId], references: [id])
}
```

---

### `QCChecklist` + `QCItem` — การตรวจสอบคุณภาพ

```prisma
model QCChecklist {
  id            String    @id @default(cuid())
  projectId     String
  name          String
  phaseNo       Int?
  inspectedById String?
  inspectedAt   DateTime?

  project Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  items   QCItem[]
}

model QCItem {
  id          String   @id @default(cuid())
  checklistId String
  item        String   // "โครงสร้างแนวตรง"
  result      QCResult // PASS | FAIL | NA
  note        String?
  photoUrl    String?

  checklist QCChecklist @relation(fields: [checklistId], references: [id], onDelete: Cascade)
}
```

---

### `PunchItem` — งานแก้ไข / Defect

```prisma
model PunchItem {
  id          String      @id @default(cuid())
  projectId   String
  description String
  status      PunchStatus @default(OPEN) // OPEN | FIXED | VERIFIED
  assigneeId  String?
  dueDate     DateTime?

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
}
```

---

### `DailySiteReport` — รายงานหน้างานประจำวัน

```prisma
model DailySiteReport {
  id           String   @id @default(cuid())
  projectId    String
  date         DateTime
  weather      String?  // "แดดจ้า", "มีฝน"
  manpower     Int?     // จำนวนช่าง
  workDone     String?  // สิ่งที่ทำวันนี้
  issues       String?  // ปัญหาที่พบ
  reportedById String?
  createdAt    DateTime @default(now())

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
}
```

---

### `Handover` — เอกสารส่งมอบ

```prisma
model Handover {
  id               String    @id @default(cuid())
  projectId        String    @unique
  handoverDate     DateTime?
  customerSignedBy String?
  note             String?
  documentUrl      String?

  project  Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  warranty Warranty?
}
```

---

### `Warranty` — การรับประกัน

```prisma
model Warranty {
  id             String      @id @default(cuid())
  handoverId     String      @unique
  type           WarrantyType // STRUCTURE | ROOF | OTHER
  startDate      DateTime?
  endDate        DateTime?
  durationMonths Int?
  terms          String?

  handover Handover @relation(fields: [handoverId], references: [id], onDelete: Cascade)
}
```

---

### `Notification` — การแจ้งเตือน

```prisma
model Notification {
  id        String       @id @default(cuid())
  userId    String
  type      String       // "LEAD_ASSIGNED", "QUOTE_APPROVED"
  title     String
  body      String?
  channel   NotifChannel // INAPP | EMAIL | LINE
  refType   String?      // "Lead", "Quotation", "Project"
  refId     String?      // id ของ entity ที่เกี่ยวข้อง
  readAt    DateTime?
  createdAt DateTime     @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([userId, readAt])
}
```

---

### `AuditLog` — ประวัติการแก้ไข

```prisma
model AuditLog {
  id                 String      @id @default(cuid())
  dealerId           String?
  userId             String?
  actedByRole        UserRole?
  onBehalfOfDealerId String?     // HQ แก้แทน dealer → บันทึก dealer นั้น
  action             AuditAction // CREATE | UPDATE | DELETE
  entity             String      // "Lead", "Quotation", "Project"
  entityId           String
  before             Json?       // snapshot ก่อนแก้
  after              Json?       // snapshot หลังแก้
  createdAt          DateTime    @default(now())

  @@index([entity, entityId])
  @@index([dealerId])
}
```

---

## 11. API Routes (Planned)

> โครงสร้างสำหรับ `src/app/api/` — ยังไม่ได้สร้าง

### Auth
| Method | Route | คำอธิบาย |
|--------|-------|---------|
| POST | `/api/auth/[...nextauth]` | Auth.js handler (credentials provider) |
| POST | `/api/auth/signout` | Logout + clear session |

### Dealers (HQ only)
| Method | Route | คำอธิบาย |
|--------|-------|---------|
| GET | `/api/dealers` | ดึงรายชื่อดีลเลอร์ทั้งหมด |
| POST | `/api/dealers` | สร้างดีลเลอร์ใหม่ + user แรกอัตโนมัติ |
| GET | `/api/dealers/[id]` | ข้อมูลดีลเลอร์ + ยอดขาย |
| PATCH | `/api/dealers/[id]` | แก้ไขข้อมูลดีลเลอร์ |

### Leads
| Method | Route | คำอธิบาย |
|--------|-------|---------|
| GET | `/api/leads` | ดึงลูกค้าเป้าหมาย (scope by tenantWhere) |
| POST | `/api/leads` | สร้างลูกค้าเป้าหมายใหม่ |
| GET | `/api/leads/[id]` | ดึงลูกค้าเป้าหมาย + activities |
| PATCH | `/api/leads/[id]` | แก้ไขสถานะ/มอบหมาย |
| DELETE | `/api/leads/[id]` | Soft delete |
| GET | `/api/leads/pool` | Lead Pool (HQ only, dealerId=null) |
| POST | `/api/leads/[id]/assign` | มอบหมายลูกค้าเป้าหมายให้ดีลเลอร์ (HQ only) |

### Activities
| Method | Route | คำอธิบาย |
|--------|-------|---------|
| GET | `/api/leads/[id]/activities` | ดึง activity log |
| POST | `/api/leads/[id]/activities` | บันทึกกิจกรรม |

### Customers
| Method | Route | คำอธิบาย |
|--------|-------|---------|
| GET | `/api/customers` | ดึงลูกค้า |
| POST | `/api/customers` | สร้างลูกค้า |
| GET | `/api/customers/[id]` | ข้อมูลลูกค้า + leads + quotations |
| PATCH | `/api/customers/[id]` | แก้ไข |
| DELETE | `/api/customers/[id]` | Soft delete |

### Quotations
| Method | Route | คำอธิบาย |
|--------|-------|---------|
| GET | `/api/quotations` | ดึงใบเสนอราคา |
| POST | `/api/quotations` | สร้างใบเสนอราคาใหม่ (auto quoteNo) |
| GET | `/api/quotations/[id]` | ดึง + items |
| PATCH | `/api/quotations/[id]` | แก้ไข/เพิ่ม items |
| POST | `/api/quotations/[id]/submit` | ส่งขออนุมัติ |
| POST | `/api/quotations/[id]/approve` | อนุมัติ (HQ only) |
| POST | `/api/quotations/[id]/reject` | ปฏิเสธ (HQ only) |
| POST | `/api/quotations/[id]/win` | Mark as WON → สร้าง Project อัตโนมัติ |

### Projects
| Method | Route | คำอธิบาย |
|--------|-------|---------|
| GET | `/api/projects` | ดึงโครงการ |
| GET | `/api/projects/[id]` | ดึงโครงการ + phases + tasks + milestones |
| PATCH | `/api/projects/[id]` | แก้ไขข้อมูลโครงการ |
| PATCH | `/api/projects/[id]/phases/[phaseNo]` | อัปเดต phase status/progress |
| POST | `/api/projects/[id]/tasks` | สร้าง task ใหม่ |
| PATCH | `/api/projects/[id]/tasks/[taskId]` | อัปเดต task |
| POST | `/api/projects/[id]/photos` | อัปโหลดรูปหน้างาน |
| POST | `/api/projects/[id]/reports` | บันทึกรายงานประจำวัน |
| GET | `/api/projects/[id]/qc` | ดึง QC checklists |
| POST | `/api/projects/[id]/qc` | สร้าง checklist |
| PATCH | `/api/projects/[id]/qc/[checklistId]` | บันทึกผล QC |
| POST | `/api/projects/[id]/handover` | บันทึกการส่งมอบ |

### Master Data (HQ only)
| Method | Route | คำอธิบาย |
|--------|-------|---------|
| GET | `/api/products` | ดึงสินค้า |
| POST | `/api/products` | เพิ่มสินค้า |
| PATCH | `/api/products/[id]` | แก้ไขราคา/spec |
| GET | `/api/materials` | ดึงวัสดุ |
| POST | `/api/materials` | เพิ่มวัสดุ |

### Reports (HQ only)
| Method | Route | คำอธิบาย |
|--------|-------|---------|
| GET | `/api/reports/network` | KPI รวมทั้งเครือ |
| GET | `/api/reports/leaderboard` | จัดอันดับดีลเลอร์ |
| GET | `/api/reports/pipeline` | Pipeline breakdown |

---

## 12. Service Layer (Planned)

> โครงสร้างสำหรับ `src/lib/services/` — ยังไม่ได้สร้าง

### Tenant Guard

```ts
// src/lib/services/tenant.ts

type AuthContext = {
  userId: string;
  dealerId: string;
  role: UserRole;
  scopeAll: boolean;  // true = HQ
};

function tenantWhere(ctx: AuthContext): { dealerId?: string } {
  // HQ → ไม่กรอง (เห็นทุก dealer)
  if (ctx.scopeAll) return {};
  // Dealer → กรองเฉพาะของตัวเอง
  return { dealerId: ctx.dealerId };
}

function requireHQ(ctx: AuthContext): void {
  if (!ctx.scopeAll) throw new ForbiddenError("HQ only");
}

function requireRole(ctx: AuthContext, ...roles: UserRole[]): void {
  if (!roles.includes(ctx.role)) throw new ForbiddenError("Insufficient role");
}
```

---

### Lead Service

```ts
// src/lib/services/leadService.ts

async function listLeads(ctx: AuthContext, filters?: LeadFilters): Promise<Lead[]>
// ดึงลูกค้าเป้าหมายตาม tenantWhere(ctx) — HQ เห็นทุก dealer

async function createLead(ctx: AuthContext, data: CreateLeadInput): Promise<Lead>
// สร้างลูกค้าเป้าหมายใหม่ + dealerId = ctx.dealerId

async function updateLead(ctx: AuthContext, id: string, data: UpdateLeadInput): Promise<Lead>
// อัปเดต + บันทึก AuditLog (before/after)
// ถ้า HQ แก้แทน dealer → onBehalfOfDealerId = lead.dealerId

async function assignLead(ctx: AuthContext, id: string, dealerId: string): Promise<Lead>
// HQ only — มอบหมาย lead ไปให้ dealer

async function getLeadPool(ctx: AuthContext): Promise<Lead[]>
// HQ only — ดึง leads ที่ dealerId = null
```

---

### Quotation Service

```ts
// src/lib/services/quotationService.ts

async function createQuotation(ctx: AuthContext, data: CreateQuotationInput): Promise<Quotation>
// auto generate quoteNo: "Q-{year}-{sequence}"
// คำนวณ subtotal, discountAmt, vatAmt, total อัตโนมัติ

async function submitForApproval(ctx: AuthContext, id: string): Promise<Quotation>
// เปลี่ยน status → PENDING_APPROVAL
// ถ้า discountPct <= threshold → approvalStatus = NOT_REQUIRED, skip

async function approveQuotation(ctx: AuthContext, id: string): Promise<Quotation>
// HQ only — approvalStatus → APPROVED, approvedById = ctx.userId
// บันทึก AuditLog

async function rejectQuotation(ctx: AuthContext, id: string, reason: string): Promise<Quotation>
// HQ only — approvalStatus → REJECTED

async function markWon(ctx: AuthContext, id: string): Promise<{ quotation, project }>
// status → WON
// สร้าง Project อัตโนมัติ พร้อม 6 ProjectPhases
```

---

### Project Service

```ts
// src/lib/services/projectService.ts

async function createProject(ctx: AuthContext, quotationId: string): Promise<Project>
// สร้าง Project + ProjectPhases 1–6 อัตโนมัติ
// projectNo: "P-{year}-{sequence}"

async function updatePhase(ctx, projectId: string, phaseNo: number, data: UpdatePhaseInput): Promise<ProjectPhase>
// อัปเดต progressPct, status
// ถ้า status → DONE → auto activate phase ถัดไป

async function createDailyReport(ctx, projectId: string, data: ReportInput): Promise<DailySiteReport>

async function uploadPhoto(ctx, projectId: string, phaseId: string, data: PhotoInput): Promise<SitePhoto>

async function recordQCResult(ctx, checklistId: string, items: QCItemInput[]): Promise<QCChecklist>

async function createHandover(ctx, projectId: string, data: HandoverInput): Promise<Handover>
// สร้าง Handover + Warranty
// Project status → COMPLETED
```

---

### Audit Service

```ts
// src/lib/services/auditService.ts

async function log(params: {
  ctx: AuthContext;
  action: AuditAction;
  entity: string;
  entityId: string;
  before?: object;
  after?: object;
  onBehalfOfDealerId?: string;
}): Promise<void>
// บันทึก AuditLog ทุกครั้งที่มีการ CREATE/UPDATE/DELETE
```

---

## 13. Auth & Middleware (Planned)

### Auth.js Configuration

```ts
// src/lib/auth.ts (planned)

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { dealer: true },
        });
        if (!user || !await bcrypt.compare(credentials.password, user.passwordHash))
          return null;
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          dealerId: user.dealerId,
          scopeAll: user.dealer.type === "HQ",
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.dealerId = user.dealerId;
        token.scopeAll = user.scopeAll;
      }
      return token;
    },
    session({ session, token }) {
      session.user.role = token.role;
      session.user.dealerId = token.dealerId;
      session.user.scopeAll = token.scopeAll;
      return session;
    },
  },
});
```

---

### Middleware

```ts
// src/middleware.ts (planned)

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const isHQ = req.auth?.user?.scopeAll;

  // ไม่ได้ login → ไป /login
  if (!isLoggedIn && !pathname.startsWith("/login")) {
    return Response.redirect(new URL("/login", req.url));
  }

  // Dealer เข้า /hq/* → redirect dashboard
  if (!isHQ && pathname.startsWith("/hq")) {
    return Response.redirect(new URL("/dashboard", req.url));
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

---

## 14. Tenant Isolation Pattern

### กฎ Multi-tenant

```
ทุก query ผ่าน service layer ต้องใส่ tenantWhere(ctx) เสมอ

Dealer query:
  prisma.lead.findMany({ where: { dealerId: ctx.dealerId, ...filters } })

HQ query:
  prisma.lead.findMany({ where: { ...filters } })  // ไม่กรอง dealer
```

### RBAC Matrix

| Action | SUPER_ADMIN | HQ_MGMT | HQ_STAFF | DEALER_ADMIN | DEALER_SALES | DEALER_SITE |
|--------|:-----------:|:-------:|:--------:|:------------:|:------------:|:-----------:|
| สร้างดีลเลอร์ | ✓ | ✓ | - | - | - | - |
| แก้ไขดีลเลอร์ | ✓ | ✓ | - | - | - | - |
| มอบหมาย Lead Pool | ✓ | ✓ | ✓ | - | - | - |
| อนุมัติ Quotation | ✓ | ✓ | - | - | - | - |
| แก้ไขข้อมูลแทน Dealer | ✓ | ✓ | - | - | - | - |
| สร้าง Lead | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| สร้าง Quotation | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| อัปเดต Project | ✓ | ✓ | ✓ | ✓ | - | ✓ |
| รายงานหน้างาน | ✓ | ✓ | ✓ | ✓ | - | ✓ |
| อัปโหลดรูป | ✓ | ✓ | ✓ | ✓ | - | ✓ |
| ดู Report รวม | ✓ | ✓ | ✓ | - | - | - |

---

---

# PART C — Overview

---

## 15. Routes Summary

### Routes ที่มีอยู่ (ทำงานได้แล้ว)

| Route | File | Role | คำอธิบาย |
|-------|------|------|---------|
| `/` | `app/page.tsx` | ทุก role | Redirect → /dashboard |
| `/login` | `app/(auth)/login/page.tsx` | Public | Dealer login |
| `/login/hq` | `app/(auth)/login/hq/page.tsx` | Public | HQ login |
| `/dashboard` | `app/(app)/dashboard/page.tsx` | Dealer | Dealer Dashboard |
| `/hq/dashboard` | `app/(app)/hq/dashboard/page.tsx` | HQ | HQ Dashboard |

### Routes ที่วางแผนไว้ (ยังไม่ได้สร้าง)

| Route | Module | Role | Priority |
|-------|--------|------|----------|
| `/leads` | Lead List + Kanban | ทุก role | สูง |
| `/leads/new` | Create Lead | Dealer | สูง |
| `/leads/[id]` | Lead Detail + Activity | ทุก role | สูง |
| `/customers` | Customer List | ทุก role | สูง |
| `/customers/[id]` | Customer Profile | ทุก role | สูง |
| `/quotations` | Quotation List | ทุก role | สูง |
| `/quotations/new` | BOQ Builder | Dealer | สูง |
| `/quotations/[id]` | Quotation Detail | ทุก role | สูง |
| `/projects` | Project List | ทุก role | สูง |
| `/projects/[id]` | 6-Phase View | ทุก role | สูง |
| `/projects/[id]/qc` | QC Checklist | Dealer Site | กลาง |
| `/hq/lead-pool` | Lead Pool Full Page | HQ | กลาง |
| `/hq/approvals` | Approval List | HQ | กลาง |
| `/hq/dealers` | Dealer Management | HQ | กลาง |
| `/hq/dealers/new` | Create Dealer | HQ | กลาง |
| `/hq/master` | Product/Material Master | HQ | กลาง |
| `/reports/analytics` | Analytics | HQ | ต่ำ |
| `/reports/finance` | Finance | HQ | ต่ำ |
| `/settings` | Settings | ทุก role | ต่ำ |

---

## 16. Dependencies

### Production (package.json)

| Package | Version | ใช้สำหรับ |
|---------|---------|----------|
| `next` | ^15.3.0 | App Router, Server Components, API Routes |
| `react` | ^19.0.0 | UI library |
| `react-dom` | ^19.0.0 | DOM rendering |
| `clsx` | ^2.1.1 | Conditional class names (`cn()`) |
| `lucide-react` | ^0.469.0 | Icons ทั้งหมด |

### Dev Dependencies

| Package | ใช้สำหรับ |
|---------|----------|
| `tailwindcss` | ^4.0.0 | Utility CSS + design tokens |
| `@tailwindcss/postcss` | PostCSS plugin สำหรับ Tailwind v4 |
| `typescript` | Type checking |
| `@types/react` | React types |
| `@types/node` | Node.js types |

### Planned Backend Dependencies

| Package | ใช้สำหรับ |
|---------|----------|
| `prisma` | ORM + Migration |
| `@prisma/client` | Database client |
| `next-auth` | Authentication (Auth.js v5) |
| `bcryptjs` | Password hashing |
| `zod` | Input validation |
| `@types/bcryptjs` | Types |

---

## สถิติสุดท้าย

| หมวด | จำนวน |
|------|-------|
| App Pages | 7 |
| Layout Components | 3 |
| UI Components | 6 |
| HQ Components | 3 |
| Context Providers | 1 |
| Utility Functions | 2 |
| Mock Types | 8 |
| Mock Constants | 13 |
| Prisma Models | 18 |
| Prisma Enums | 21 |
| API Routes (Planned) | 40+ |
| Service Functions (Planned) | 20+ |
| **Total Exports (Frontend)** | **~70** |
| **Total Routes (All)** | **~25** |
