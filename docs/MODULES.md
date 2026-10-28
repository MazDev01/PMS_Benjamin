# Benjamin PMS — โมดูลและฟังก์ชันทั้งหมด

สรุป **ทุกโมดูล** และ **ฟังก์ชัน / สิ่งที่ export** ในแต่ละโมดูลของโปรเจคนี้ (Benjamin-HQ-main)
สแตก: Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 · ข้อมูล mock (frontend-only) · UI ภาษาไทย
สองพื้นที่ทำงานแยกขาด: **Dealer** (งานขายรายวัน) · **HQ** (กำกับเครือข่าย ดูข้อมูลทุกสาขา)
CI: Dark Blue `#003366` · Steel Gray `#2D2D2D` · Silver `#C0C0C0`

```
src/
├── app/         # หน้า (routes) = โมดูลระดับฟีเจอร์
├── components/  # UI ใช้ซ้ำ (layout / ui / filters / hq)
├── context/     # state ส่วนกลาง
└── lib/         # ข้อมูล + ฟังก์ชัน util
```

---

## 1) Data Layer — `lib/`

### `lib/mock.ts` — แหล่งข้อมูลกลาง (150 exports)
| ฟังก์ชัน | หน้าที่ |
|---|---|
| `regionOfProvince(province): string` | แปลงจังหวัด → ภาค |

**ชุดข้อมูล**
- **Dealer:** `leads` · `customers` · `quotations` · `pipelineDeals` · `pipelineStages` · `appointments` · `team` · `salesByMonth` · `kpis` · `schedule` · `upcoming` · `projects` · `tasks` · `notes` · `salesTemplates`
- **HQ:** `hqKpis` · `hqSalesByMonth` · `dealerLeaderboard` · `dealerDetails` · `hqDealSummary` · `hqPipelineStages` · `hqPipelineLostReasons` · `hqPipelineByProduct` · `hqAllCustomers` · `hqAllQuotations` · `hqProjects` · `hqSalesTargets` · `hqServiceLineRevenue` · `hqRecentActivity` · `hqProjectSummary` · `hqAnnouncements` · `hqFinanceSummary` · `hqFinanceByMonth` · `hqInvoiceAging` · `leadPool` · `provinceToRegion`
- **Finance:** `contracts` · `invoices` · `payments` · `expenses` · `milestones` · `commissions`
- **Label/Color maps:** `leadStatusLabel/Color` · `quotationStatusLabel/Color` · `taskStatusLabel/Badge` · `taskPriorityLabel/Color` · `projectStatusLabel/Color` · `apptTypeLabel/Color` · `apptStatusLabel/Color` · `PIPELINE_STATUSES` · `PIPELINE_STAGE_PROGRESS` · `DEAL_PAYMENT_LABEL/COLOR` ฯลฯ
- **Types หลัก:** `UserRole` · `MockSession` · `LeadRow` · `LeadStatus` · `CustomerMock` · `QuotationMock` · `PipelineDealMock` · `DealStage` · `DealerRow` · `DealerDetail` · `HQProject` · `HQCustomer` · `HQQuotation` ฯลฯ

### `lib/permissions.ts` — RBAC
`hasPermission(role, permission): boolean` · `ROLE_PERMISSIONS` · type `Permission`

### `lib/format.ts`
`fmtBaht(v)` → `฿1.2M/฿480K` · `fmtM(v)` → `฿18.4M` · `fmtFull(v)` → เลขเต็มมีคอมมา

### `lib/cn.ts`
`cn(...inputs)` — รวม className มีเงื่อนไข (clsx)

### `lib/tokens.ts` — ค่าคงที่ดีไซน์ CI (28 exports)
สี `PRIMARY/PRIMARY_D/PRIMARY_LT/…` · `STEEL` · `SILVER` · semantic `SUCCESS/WARNING/DANGER(_BG)` · เงา `SHADOW_CARD/MD/LG` · สไตล์สำเร็จรูป `TEXT/CARD/INPUT/FORM_LABEL/BTN/BADGE/BRAND_PALETTE`

---

## 2) Context — `context/`

### `RoleContext.tsx` — เซสชัน & บทบาท
`RoleProvider` · `useRole()` → `login(key)` · `logout()` · `switchSession(key)` · `can(permission)` · ค่า: `session/isLoggedIn/hydrated/isHQ/role/dealerCode/currentKey`

### `FilterContext.tsx` — ตัวกรอง & ช่วงเวลา (per-page)
`FilterProvider` · `useFilters()` · util `parseDate(s)`
- ฟังก์ชันใน hook: `setPreset` · `setCustomRange` · `setDealer/Province/Product/Status` · `setDim` · `reset` · `passes(fields)` · `inRange(date)` · `activeCount` · `timeRange`
- ค่าคงที่: `TIME_PRESETS` · `DEALER_OPTIONS` · `PRODUCT_OPTIONS` · `PROVINCE_OPTIONS` · `ALL`

### `SalesContext.tsx` — สถานะงานขายร่วม (Lead ↔ Pipeline sync)
`SalesProvider` · `useSales()`
- **ดีล:** `addDeal · updateDealTask · moveDealStage · closeDeal · updateDealNotes · addDealFile · logDealActivity`
- **ลูกค้าเป้าหมาย:** `addLead · updateLead · deleteLead · updateLeadStatus · updateLeadChecklist`
- **เชื่อม Lead→Deal:** `openDealFromLead(lead) · getDealForLead(leadId)`
- types: `DealSource` · `ChecklistItem` · `SalesContextType`

---

## 3) Components — `components/`

### Layout
`layout/Sidebar.tsx` → `Sidebar` · `layout/Topbar.tsx` → `Topbar` · `layout/AuthGuard.tsx` → `AuthGuard`

### UI
| ไฟล์ | export |
|---|---|
| `ui/Charts.tsx` | `AreaChart` · `PlanVsActualBars` · `Donut` (+ types `AreaPoint/BarPoint/DonutSeg`) |
| `ui/LineChart.tsx` | `LineChartCard` |
| `ui/KpiCard.tsx` | `KpiCard` |
| `ui/StatusBadge.tsx` | `StatusBadge` |

### Filters
`filters/FilterBar.tsx` → `FilterBar` (+ `FilterBarProps`)

### HQ widgets (แดชบอร์ด/หน้า HQ)
`ActivityFeed` · `AlertBanner` · `DealSummaryStrip` · `LeaderboardCard` · `LeadPoolWidget` · `LeadPoolTable` · `ProjectHealthWidget` · `ServiceLineWidget`

### อื่นๆ
`TemplatesEditor.tsx` → `TemplatesEditor`

---

## 4) Pages / Routes — `app/` (โมดูลระดับฟีเจอร์)
แต่ละหน้า export `default` component หนึ่งตัว

### Shell / Auth
`app/layout.tsx` (root + providers) · `app/(app)/layout.tsx` · `app/(app)/hq/layout.tsx` · `app/(auth)/layout.tsx` · `app/page.tsx` (redirect → /dashboard) · `login` · `login/hq`

### Dealer Workspace (19)
| Route | โมดูล |
|---|---|
| `/dashboard` | แผงควบคุม — KPI 3 การ์ด + แถบสถิติ 5 + กราฟยอดขาย + เป้า/จริง + โดนัทดีล |
| `/leads` · `/leads/[id]` | ลูกค้าเป้าหมาย: รายการ + รายละเอียด |
| `/customers` · `/customers/[id]` | ลูกค้า: รายการ + รายละเอียด |
| `/pipeline` | เส้นทางการขาย (kanban + ดีล) |
| `/quotations` | ใบเสนอราคา |
| `/products` | สินค้า/แคตตาล็อก |
| `/calendar` | ปฏิทินนัดหมาย |
| `/activity` | ไทม์ไลน์กิจกรรม |
| `/tasks` | งาน |
| `/reminders` | เตือนความจำ |
| `/templates` | เทมเพลตงานขาย |
| `/files` · `/notes` | เอกสาร · โน้ต |
| `/team` | ทีมขาย |
| `/company-profile` | โปรไฟล์บริษัท |
| `/reports` (+`/sales` `/finance` `/analytics`) | รายงาน |
| `/settings` | ตั้งค่า |

### HQ Workspace (12)
| Route | โมดูล |
|---|---|
| `/hq/dashboard` | แดชบอร์ดรวมทั้งเครือ (AlertBanner + DealSummaryStrip + KPI + LineChart + widgets) |
| `/hq/dealers` · `/hq/dealers/[dealerCode]` | ตัวแทนจำหน่าย: รายการ + รายละเอียด |
| `/hq/customers` | ลูกค้าทุกสาขา |
| `/hq/pipeline` | มอนิเตอร์โอกาสการขายทุกสาขา |
| `/hq/quotations` | ใบเสนอราคาทุกสาขา |
| `/hq/lead-pool` | พูลลูกค้าเป้าหมายกลาง (มอบหมายสาขา) |
| `/hq/master` | สินค้า/มาสเตอร์ดาต้า |
| `/hq/company` | ข้อมูลบริษัท |
| `/hq/users` | ผู้ใช้งาน & สิทธิ์ |
| `/hq/announcements` · `/hq/notifications` | ประกาศ · การแจ้งเตือน |
| `/hq/settings` | ตั้งค่า HQ |

### `_archive/` (ปิดใช้งาน — เก็บไว้ ไม่ลบ) 13 หน้า
appointments · commission · expenses · invoices · payments · hq/{finance, projects, targets, persons, master-data, sales-settings, dealer-settings, system-settings}

---

## Data Flow
```
ลูกค้าติดต่อ → Lead → Opportunity (Pipeline) → กิจกรรม/นัดหมาย
            → ใบเสนอราคา → เจรจา → Won/Lost
ทุกขั้นบันทึกที่ฐานข้อมูลกลาง — HQ เห็นทุกสาขาแบบ real-time
```
> ขอบเขต Sales-only: จบที่ Won/Lost — ไม่มี construction/production/installation

> เอกสารเพิ่มเติมในโฟลเดอร์นี้: `ARCHITECTURE.md` · `archive/MODULE-REFERENCE-FULL.md` (เอกสารเก่า) · `DASHBOARD-DEALER.md` · `DASHBOARD-HQ.md` · `DEALER-MANAGEMENT.md` · `PERMISSIONS.md` · `DESIGN-SYSTEM.md` · `DATABASE-SCHEMA.md`
