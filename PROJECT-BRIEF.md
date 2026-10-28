# Benjamin PMS — เอกสารสรุปทั้งระบบ (Project Brief สำหรับป้อนให้ AI)

> **วิธีใช้เอกสารนี้:** ไฟล์เดียวจบ — คัดลอกทั้งหมดไปวางให้ AI ตัวไหนก็ได้ แล้วมันจะเข้าใจโครงสร้าง โมดูล ฟังก์ชัน และกระบวนการทำงานของโปรเจกต์ทั้งหมด โดยไม่ต้องเปิดซอร์สอ่านเอง
> **ที่มา:** เขียนจากการอ่านโค้ดจริงทั้ง ~90 ไฟล์ (~24,000 บรรทัด) ไม่มีการเดา — ทุกจุดอ้างอิง `ไฟล์:บรรทัด`
> **สถานะ:** ระบบเป็น **Sales CRM ล้วน (Lead → Won/Lost)** ยังไม่เชื่อม backend จริง — ข้อมูลทั้งหมดเป็น mock + persist ผ่าน `localStorage`/`sessionStorage`
> **อัปเดตล่าสุด: 17 ก.ค. 2569** — ดูสรุปสิ่งที่เปลี่ยนที่ **[ภาคผนวก B](#ภาคผนวก-b--การเปลี่ยนแปลงล่าสุด)** ท้ายไฟล์

> ⚠️ **โครงย้ายเป็น pnpm monorepo แล้ว** — เอกสารด้านล่างหลายที่ยังอ้าง path แบบเดิม (`src/…`). โค้ดจริงย้ายไปตามตารางนี้ (ตรรกะ/เนื้อหาไม่เปลี่ยน เปลี่ยนแค่ที่อยู่):
>
> | path เดิมในเอกสาร | path จริงปัจจุบัน |
> |---|---|
> | `src/lib/*` | `packages/shared/lib/*` |
> | `src/context/*` | `packages/shared/context/*` |
> | `src/components/*` | `packages/shared/components/*` |
> | `src/app/globals.css` | `packages/shared/globals.css` |
> | `src/app/(app)/hq/**` (หน้า HQ) | `apps/hq/app/(app)/hq/**` |
> | `src/app/(app)/**` (หน้า Dealer) | `apps/dealer/app/(app)/**` |
> | `src/app/(auth)/**` | `apps/{hq,dealer}/app/(auth)/**` (แยกกันแต่ละแอป) |
>
> import ในโค้ดใช้ alias **`@pms/shared`** (เช่น `import { useSales } from "@pms/shared/context/SalesContext"`) แทน `@/…` เดิม

---

## 0. ภาพรวม 60 วินาที (อ่านก่อน)

**Benjamin PMS** = ระบบบริหารงานขายอาคารสำเร็จรูป (โกดัง/โรงงาน/อาคาร) มี **2 บทบาท**:

| บทบาท | คือใคร | ทำอะไร | เส้นทาง URL |
|---|---|---|---|
| **HQ (สำนักงานใหญ่)** | เจ้าของแพลตฟอร์ม/เจ้าของข้อมูลทั้งเครือ | คุมนโยบาย ราคากลาง เป้ายอด บัญชีตัวแทน — **ดูอย่างเดียวเป็นส่วนใหญ่** | `/hq/*` |
| **Dealer (ตัวแทนจำหน่าย)** | คนขายหน้างาน | ทำงานขายจริง: ลีด → ใบเสนอราคา → ปิดการขาย | root path (`/dashboard`, `/leads`, ...) |

**หลักคิดที่ต้องรู้ก่อนแก้โค้ด (กฎเหล็ก):**
1. **Sales-only** — ทั้งระบบครอบแค่วงจร Lead→Won/Lost **ไม่มี** ก่อสร้าง/ผลิต/ติดตั้ง/SLA/funnel/ส่วนลด (ถูกลบทิ้งหมดแล้ว)
2. **"วันนี้" ตรึงไว้** = **30 มิ.ย. 2569 (2026-06-30)** ผ่านค่าคงที่ `APP_NOW`/`MOCK_TODAY`/`TODAY` — **ห้ามใช้ `new Date()`** ประทับเรคคอร์ดใหม่ (จะหลุดนอกช่วงตัวกรอง)
3. **ตัวแทนสร้างลูกค้าเองไม่ได้** — ลูกค้าเกิดจาก Lead→Won อัตโนมัติเท่านั้น (ยกเว้น "นำเข้าลูกค้าเดิม")
4. **ตัวแทนเห็นเฉพาะสมุดงานสาขาตัวเอง** — กรองด้วย `dealerCode` ทุกจุด (ลีด/ค้นหา/กระดิ่ง/ปฏิทิน)
5. **ห้ามกุข้อมูล** — ไม่มีข้อมูลจริงรองรับ = แสดง `—`/`null` ห้ามเอาฟิลด์อื่นมาสวม
6. **task-driven** — ติ๊กงาน (task) → ระบบเลื่อน stage อัตโนมัติ (ห้ามลาก slider ตั้ง % เอง)

**Mental model ของสถาปัตยกรรม:**
```
RoleProvider (ใครล็อกอิน + สิทธิ์)
 └─ SalesProvider (ข้อมูลงานขายสดกลาง: leads/customers/quotations/deals/appointments)
     └─ FilterProvider (ต่อหน้า — มุมมองที่กรองแล้ว)
         └─ หน้า + คอมโพเนนต์
```
- **1 Customer → many Deals/Quotations** · Lead มี `customerId` เชื่อมลูกค้า · `leadDealMap` เชื่อมลีด↔ดีล
- **HQ vs Dealer แยกด้วย `session.scopeAll` (isHQ)** → คนละเมนู คนละขอบเขตข้อมูล คนละกระดิ่ง
- **Persist:** localStorage (ข้อมูล/prefs ถาวร) + sessionStorage (ตัวกรองต่อหน้า) + event bus (`window.dispatchEvent`) ให้ UI sync ทันที

---

## สารบัญ

- [1. สแตกเทคโนโลยี + วิธีรัน](#1-สแตกเทคโนโลยี--วิธีรัน)
- [2. โครงสร้าง Routing](#2-โครงสร้าง-routing)
- [3. ระบบ Role + สิทธิ์](#3-ระบบ-role--สิทธิ์)
- [4. State / Data Layer (Context)](#4-state--data-layer-context)
- [5. Shell / Layout Components](#5-shell--layout-components)
- [6. โมดูลฝั่ง Dealer (9 หน้า)](#6-โมดูลฝั่ง-dealer)
- [7. โมดูลฝั่ง HQ (11 หน้า)](#7-โมดูลฝั่ง-hq)
- [8. ไลบรารีตรรกะธุรกิจ + Hooks (src/lib)](#8-ไลบรารีตรรกะธุรกิจ--hooks)
- [9. คอมโพเนนต์ UI ที่ใช้ร่วม + กราฟ + ตัวกรอง](#9-คอมโพเนนต์-ui-ที่ใช้ร่วม)
- [10. โมเดลข้อมูล (mock.ts)](#10-โมเดลข้อมูล-mockts)
- [11. กระบวนการทำงานหลัก (Workflows)](#11-กระบวนการทำงานหลัก-workflows)

---

## 1. สแตกเทคโนโลยี + วิธีรัน

| รายการ | ค่า | อ้างอิง |
|---|---|---|
| โครงสร้าง | **pnpm monorepo + Turborepo** — `apps/hq`, `apps/dealer`, `packages/shared` | `pnpm-workspace.yaml`, `turbo.json` |
| Package manager | **pnpm@11.15.1** (ไม่ใช่ npm แล้ว) | root `package.json` |
| Framework | Next.js `^15.3.0` (App Router) | `apps/*/package.json` |
| UI runtime | React `^19.0.0` | |
| ภาษา | TypeScript (base config ที่ `tsconfig.base.json`) | |
| แอนิเมชัน | `framer-motion` `^12.42.2` (เพิ่มเข้ามาตอนแยก monorepo) | `apps/*/package.json` |
| สไตล์ | **plain CSS** (`packages/shared/globals.css`) — ไม่ใช้ Tailwind | |
| กราฟ | **SVG เขียนเอง** (`packages/shared/components/ui/Charts.tsx`) — ไม่ใช้ Recharts | |
| ไอคอน | `lucide-react` `^0.469.0` | |
| ทดสอบ | `@playwright/test` (scenario harness) | `tests/` |
| โค้ดร่วม 2 แอป | ทั้ง HQ และ Dealer import ตรรกะ/คอมโพเนนต์/CSS จาก **`@pms/shared`** (`workspace:*`) | |

**2 แอปแยก port กัน:**
| แอป | โฟลเดอร์ | port dev | ขอบเขต URL |
|---|---|---|---|
| **Dealer** | `apps/dealer` | **3001** | root (`/dashboard`, `/leads`, …) |
| **HQ** | `apps/hq` | **3002** | `/hq/*` |

**สคริปต์ (รันจาก root):** `pnpm dev` (turbo dev — รันทั้งสองแอปพร้อมกัน) · `pnpm dev:hq` · `pnpm dev:dealer` · `pnpm build` · `pnpm typecheck` · `pnpm lint`

> ⚠️ **ห้ามรัน `next build` ระหว่าง dev server ทำงาน** — เขียนทับ `.next` ทำให้ทุกหน้า 500
> ℹ️ **เดิมเป็นแอปเดียว** (`src/app/(app)/…` มีทั้ง Dealer + HQ ใต้ route group เดียว) — ย้ายเป็น 2 แอปเพื่อ deploy/คุมสิทธิ์แยกกัน แต่ **แชร์ `packages/shared` ทั้งหมด** ตรรกะจึงเหมือนเดิมทุกอย่าง

---

## 2. โครงสร้าง Routing

**แต่ละแอปมี layout ของตัวเอง แต่ทรี Provider เหมือนกัน** (RoleProvider/SalesProvider/FilterProvider มาจาก `@pms/shared/context`):
```
RootLayout (apps/{hq,dealer}/app/layout.tsx) → <html lang="th"> + ฟอนต์ไทย + import @pms/shared/globals.css
 └─ RoleProvider
    └─ SalesProvider (initialLeads = leads จาก mock)
       ├─ (app)/layout.tsx  → AuthGuard → AppShell → [FilterProvider ต่อหน้า] → children
       │   └─ (เฉพาะ apps/hq) (app)/hq/layout.tsx → กัน non-HQ (redirect)
       └─ (auth)/layout.tsx → กล่องกลางจอ (หน้า login)
```

**หน้าจริงในแต่ละแอป (page.tsx):**
| แอป | หน้า |
|---|---|
| **Dealer** (`apps/dealer/app/(app)/`) | `dashboard` · `leads` (+`leads/[id]`) · `quotations` · `customers` (+`customers/[id]`) · `products` · `calendar` · `files` · `settings` · `profile` |
| **HQ** (`apps/hq/app/(app)/hq/`) | `dashboard` · `leads` · `quotations` · `customers` · `pipeline` (ภาพรวมยอดขาย) · `dealers` (+`[dealerCode]`) · `master` (แคตตาล็อกแม่แบบ) · `audit` (บันทึกการใช้งาน) · `settings` · `company` · `users` |

> หมายเหตุ: apps/hq ยังมี `(app)/dashboard` ( redirect) และหน้า `(auth)/login`, `(auth)/hq/login` ของตัวเอง · หน้า HQ ทั้งหมดอยู่ใต้ `/hq/*`
**Redirect:** `/`→`/dashboard` · ยังไม่ล็อกอิน→`/login` (AuthGuard) · Dealer หลงเข้า `/hq/*`→`/dashboard`

---

## 3. ระบบ Role + สิทธิ์

ไฟล์: `src/context/RoleContext.tsx`, `src/lib/permissions.ts`, sessions ใน `src/lib/mock.ts:19-34`

**⚠️ ไม่มีระบบ login จริง** — มี 2 session สำเร็จรูป สลับไปมาเท่านั้น:
- **`hq`**: "วิชัย ประสิทธิ์", role `HQ_MANAGEMENT`, dealerCode `""`, `scopeAll: true`
- **`dealer`**: "สมชาย เชียงใหม่", role `DEALER_ADMIN`, dealerName "เชียงใหม่สตีลบิลด์", dealerCode `"CNX"`, `scopeAll: false`

**Persist:** localStorage 2 คีย์ — `pms_session_key`, `pms_logged_in`

**`useRole()` เปิดให้ใช้:** `session`, `isLoggedIn`, `hydrated`, `isHQ` (= `session.scopeAll`), `role`, `dealerCode`, `currentKey`, `can(permission)`, `login(key)`/`switchSession(key)`, `logout()`

**ตารางสิทธิ์ (`permissions.ts` — 6 role):**
| Role | สิทธิ์ |
|---|---|
| `SUPER_ADMIN` / `HQ_MANAGEMENT` | DEALER_BASE + HQ_ONLY (ทั้งหมด) |
| `HQ_STAFF` / `DEALER_ADMIN` | DEALER_BASE + `analytics:view` |
| `DEALER_SALES` | DEALER_BASE เท่านั้น |
| `DEALER_SITE` | อ่านอย่างเดียว: `leads:read`, `customers:read` |

- `DEALER_BASE` = leads/customers/quotations ครบ CRUD + `tasks:manage` + `reports:view`
- `HQ_ONLY` = `catalog:edit`, `dealers:manage`, `hq:all_data`, `analytics:view`
- `hasPermission(role, perm) → boolean`

---

## 4. State / Data Layer (Context)

### 4.1 SalesContext — แหล่งข้อมูลงานขายกลาง (single source)
`src/context/SalesContext.tsx` — ครอบทั้งแอป · ทุก mutation persist ผ่าน `usePersistentState`

**คีย์ localStorage:** `sales_deals_v1`, `sales_leads_v2`, `sales_customers_v1`, `sales_quotations_v1`, `sales_appointments_v1`, `sales_lead_deal_map_v1`, `sales_next_deal_id_v1`, `sales_lead_checklists_v1`
> ⚠️ แก้ seed ใน mock.ts ต้องขึ้นเลขเวอร์ชันคีย์ ไม่งั้นเบราว์เซอร์เก่าอ่านของเก่าทับ

**State ที่ถือ:** `deals`, `leads`, `leadDealMap`, `nextDealId`, `leadChecklists`, `customers`, `quotations`, `appointments`

**Actions (`useSales()`):**
| กลุ่ม | Actions |
|---|---|
| Deals | `addDeal`, `updateDealTask`, `moveDealStage`, `closeDeal`, `updateDealNotes`, `addDealFile`, `logDealActivity` |
| Lead↔Deal | `openDealFromLead`, `getDealForLead`, `leadDealMap` |
| Lead checklist | `leadChecklists`, `updateLeadChecklist` |
| Leads | `updateLeadStatus`, `addLead`, `updateLead`, `deleteLead` |
| Customers | `addCustomer`, `updateCustomer`, `deleteCustomer` |
| Quotations | `addQuotation`, `updateQuotation`, `deleteQuotation`, `setQuotationStatus` |
| Appointments | `addAppointment`, `updateAppointment`, `deleteAppointment` |
| แปลงลีด | `convertLeadToCustomer(lead, removeLead?)` |

**กลไก auto สำคัญ (พฤติกรรมที่ผูกกันเอง):**
- `updateDealTask` — เลื่อน stage ตามสัดส่วน task ที่เสร็จ ผ่านลำดับ `ACTIVE_STAGES = [2,4,5,9,6]`
- `closeDeal(won)` — ปิดสำเร็จ → `convertLeadToCustomer(lead, true)` + ตั้งใบเสนอราคาที่ผูกเป็น `won`
- `openDealFromLead` — สร้างดีลจากลีด, stage เริ่ม 2, ตั้งลีดเป็น `QUOTED`
- `completeLeadQuoteTasks` — สร้าง/ส่งใบเสนอราคา → ติ๊ก task `makeQuote`/`sendQuote` อัตโนมัติ
- `updateLeadStatus`/`updateLead` — สถานะ `PAID` + ยังไม่มี customerId → สร้างลูกค้า
- `addQuotation`/`deleteQuotation` — sync ไฟล์อัตโนมัติ

### 4.2 FilterContext — ตัวกรองส่วนกลาง (แยกอิสระต่อหน้า)
`src/context/FilterContext.tsx` · FilterProvider ครอบใน AppShell ด้วย `storageKey = bpms_filters:<pathname>`

- **`APP_NOW = new Date(2026,5,30)`** (30 มิ.ย. 2026) + `APP_NOW_ISO` — "วันนี้" ของทั้งระบบ
- **Time presets (5):** `today`, `last7`, `thisMonth`, `thisYear`, `custom`
- **มิติกรอง:** `dealer`, `province`, `product`, `status`, `person` (+ time range) · ค่าพิเศษ `ALL = "all"`
- Option lists สร้างจากข้อมูลจริง (dealerLeaderboard / solutionProducts / customers+quotations / responsiblePersons)
- Default: `preset: "thisYear"` + ทุกมิติ = ALL · **Persist: sessionStorage** ต่อหน้า
- ฟังก์ชันสำคัญ: `passes(RecordFields)` (เช็กเรคคอร์ดผ่านตัวกรองครบทุกมิติ), `inRange(date)`, `activeCount`, setter รายมิติ, `reset` · `useFilters()`

### 4.3 usePersistentState + settingsBus + event bus
- **`usePersistentState<T>(key, initial)`** — เหมือน `useState` แต่ persist localStorage · `hydrated` เป็น state (commit แรกยังไม่เขียน กันค่า default ทับค่าที่โหลด) · `withDefaults()` เติมฟิลด์ที่ blob เก่าไม่มี
- **`settingsBus.tsx`** — save-bus กลางหน้าตั้งค่า: `useReportSection({dirty,save,reset})` ให้ปุ่มบันทึกกลางบนหัว · `useSettingsToast()`
- **Event bus pattern ทั้งระบบ** — เขียน localStorage แล้วยิง custom event, ผู้ฟังอัปเดตทันที: `PROFILE_UPDATED_EVENT`, `NOTIF_PREFS_EVENT`, `HQ_NOTIF_UPDATED_EVENT`, `DEALER_FILES_EVENT`, `DEALER_LEAD_RULES_EVENT`, `bpms-audit-updated`, `bpms-company-updated` (+ `"storage"` ข้ามแท็บ)

---

## 5. Shell / Layout Components

`src/components/layout/`

| Component | หน้าที่ |
|---|---|
| `AppShell` | เชลล์: `<Sidebar>` + `<Topbar>` + `.content` ครอบ `FilterProvider` (key ต่อ pathname) · ถือ `navOpen` (เมนูมือถือ) · เพิ่ม class `app-hq` เมื่อ isHQ |
| `AuthGuard` | `hydrated && !isLoggedIn` → `router.replace("/login")` · ระหว่างยังไม่ hydrate ซ่อน children |
| `Sidebar` | แถบข้าง: แบรนด์ · role switcher (dropdown dealer/hq) · เมนูตามบทบาท · การ์ดเจ้าของ + ปุ่มออกจากระบบ |
| `Topbar` | แถบบน: ชื่อหน้า · ค้นหา (overlay) · กระดิ่งแจ้งเตือน · โปรไฟล์ |
| `TopbarActions` | portal ไป `#topbar-slot` — ให้หน้าส่งปุ่ม (ตัวกรอง/Export) ไปโชว์บนแถบบน |

**เมนู (Sidebar):**
- **DEALER_NAV:** แดชบอร์ด `/dashboard` · ลูกค้าเป้าหมาย `/leads` · ใบเสนอราคา `/quotations` · ลูกค้า `/customers` · แม่แบบ `/products` · ปฏิทิน `/calendar` · ไฟล์ `/files` · ตั้งค่า `/settings`
- **HQ_NAV:** แดชบอร์ดสำนักงานใหญ่ `/hq/dashboard` · ตัวแทนจำหน่าย `/hq/dealers` · ภาพรวมยอดขาย `/hq/pipeline` · ลูกค้าเป้าหมายทั้งเครือ `/hq/leads` · ใบเสนอราคาทั้งเครือ `/hq/quotations` · ลูกค้าทั้งเครือ `/hq/customers` · แคตตาล็อกแม่แบบ `/hq/master` · บันทึกการใช้งาน `/hq/audit` · ตั้งค่า `/hq/settings`

**Topbar — กระดิ่งแจ้งเตือน:**
- **Dealer** — `buildNotifications(leads, quotations, appointments)`: 6 ประเภท (ลีดรอดำเนินการ, เตือนติดตาม, เตือนประชุม, ใบเสนอราคาใกล้หมดอายุ, ปิดการขายสำเร็จ, เสียโอกาส) จัดกลุ่ม today/yesterday/older · **เห็นเฉพาะสาขาตัวเอง**
- **HQ** — `buildHQNotifications(auditEntries)` จาก Audit Log + กลุ่ม "ต้องดูด่วน" จาก `useHQAlerts()` (6 กฎ) · เห็นทั้งเครือ
- **ค้นหา (overlay):** จัดกลุ่ม หน้า/ลีด/ลูกค้า/ใบเสนอราคา/ตัวแทน (HQ) · ยิง event `bpms:open-record`

---

## 6. โมดูลฝั่ง Dealer

> หน้า Dealer อยู่ที่ **root path** · แหล่งข้อมูล = `SalesContext` (`useSales()`) · เห็นเฉพาะสาขาตัวเอง (`dealerCode`) · หน้ารายละเอียดใช้**โมดัลกลางจอ 820px** (route `[id]` เป็นแค่ redirect ไป `?open=N`)

### 6.1 แดชบอร์ด — `/dashboard`
`dashboard/page.tsx` (re-export) → `components/dashboard/DealerDashboard.tsx`
สมุดงานของตัวแทน — KPI 4 ใบ (กดได้): เป้าหมายยอดขาย (ProgressRing YTD/เป้าทั้งปี) · โอกาสการขาย · ติดตามวันนี้ · ปิดการขายได้+อัตราปิด
- **เป้า = รายปี HQ ตั้ง เทียบ YTD เสมอ (ไม่เฉลี่ยตามช่วงตัวกรอง)** · กราฟ: ลูกค้าเป้าหมาย vs ใบเสนอราคา (`PlanVsActualBars`) · ยอดขายรายเดือน (`SalesLineChart`) · ผลงานผู้รับผิดชอบ · ยอดขายตามแม่แบบ · ขั้นตอนการขาย (Donut)
- การ์ดรายการ 4: ต้องติดตามด่วน (เกณฑ์ `followUpAlertDays`) · งานวันนี้ · ใบเสนอราคาล่าสุด · กิจกรรมล่าสุด · **ไม่มีปุ่ม Add/Create**

### 6.2 ลูกค้าเป้าหมาย (Leads) — `/leads` — หน้าใหญ่สุด (1888 บรรทัด)
`leads/page.tsx` · จัดการ pipeline ทั้งหมด: เพิ่ม/แก้/ติดตามลีด, ออกใบเสนอราคา, ปิดการขาย
- KPI 4 (การ์ด=ปุ่มกรอง): ลูกค้าเป้าหมายทั้งหมด · โอกาสการขาย · เกิน N วัน · อัตราปิดการขาย (`convRate` = won/(won+lost))
- ตัวกรอง (`FilterRow`): ค้นหา/สถานะ/ผู้รับผิดชอบ/จังหวัด/แหล่งที่มา/ช่วงมูลค่า/ค้างติดต่อ + สลับ **ตาราง/บอร์ด**
  - **KANBAN:** ลากการ์ดเปลี่ยนสถานะ (`onDrop`→`updateLeadStatus`) · PAID ไม่มีคอลัมน์ (เป็นลูกค้าแล้ว)
- โมดัลลีด (แท็บ): Overview (`OverviewEditor` แก้ในที่เดิม) · งาน (`LeadTasks`) · รายงาน (`ReportEditor`) · ใบเสนอราคา (`LeadQuotationsPanel`) · นัดหมาย · ไฟล์
- **ปุ่มปิดการขาย:** `markWon()` → ติ๊กงานทั้งหมด + PAID + สร้างลูกค้าอัตโนมัติ · `markLost(reason)` → CANCELLED + เหตุผลจาก `loadLostReasons()`
- **กฎ:** ลีด PAID หายจากหน้านี้ (redirect ไป `/customers`) · ตัวแทนสร้างลูกค้าเองไม่ได้ · เพิ่มลีดใหม่เลือกได้แค่ WAITING/BULLET

### 6.3 ลูกค้า (Customers) — `/customers` (1678 บรรทัด)
`customers/page.tsx` · ฐานข้อมูลลูกค้าที่ปิดการขายแล้ว
- ค่าต่อลูกค้าคำนวณจาก quotations/deals: `totalSalesFor` (won), `quotationCountFor`, `lastActivityFor`, `lifecycleTypeFor`
- KPI 2 · กราฟการเติบโต/สินค้าที่ซื้อ (โดนัท) · ตาราง+โมดัลรายละเอียด 820px (2 แท็บ: ข้อมูลลูกค้า / เพิ่มงานขายใหม่)
- **นำเข้าลูกค้าเดิม** (`commitImport`/`createLegacy`, CSV หรือคีย์มือ, ติดป้าย `imported=true`) — ข้อยกเว้นเดียวที่สร้างลูกค้าตรงได้
- **สร้างดีลใหม่** (`openNewDeal`/`createDeal`) — ลูกค้าเดิมซื้อโครงการใหม่ → สร้าง LeadRow ผูก `customerId` → กลับเข้า pipeline
- VAT มาจาก `loadHQPolicy().vat` · รหัสลูกค้า `customerCode(dealerCode, id)`

### 6.4 ใบเสนอราคา (Quotations) — `/quotations` (957 บรรทัด)
`quotations/page.tsx` · จัดการ+ติดตามสถานะ · **Workflow: `draft → sent_to_client → won/lost/expired`** (Dealer self-serve ไม่มีขั้นอนุมัติ HQ)
- KPI 4 · ตัวกรอง · 2 มุมมอง (list/card) · `QuotationModal` (`LineItemsEditor` BOQ จากราคากลาง HQ)
- `ownerOf(q)` — ใบไม่มีฟิลด์ผู้รับผิดชอบ → หาจาก customer.owner หรือ lead.assigned
- **กฎ:** เลขที่ใบ + VAT = HQ กำหนด (ไอคอน Lock) · **ไม่มีปุ่ม "สร้างใหม่"** (ออกจากแท็บใบเสนอราคาในลีดเท่านั้น) · ต้องตั้งชื่อบริษัทผู้ออกก่อนพิมพ์ (ไม่งั้นเด้งไป `/settings`)

### 6.5 แม่แบบสินค้า (Products) — `/products`
`products/page.tsx` · แคตตาล็อกแม่แบบ **Read-only ทั้งหน้า** (HQ กำหนด ตัวแทนแก้ไม่ได้) · โหลดจาก `loadMasterCatalog()` · ค้นหา · การ์ด grid · โมดูลรายละเอียด+แม่แบบย่อย+ประวัติราคา · `downloadSpec()`

### 6.6 ไฟล์ (Files) — `/files`
`files/page.tsx` · คลังไฟล์รวม (แหล่งเดียว `loadDealerFiles`, event `DEALER_FILES_EVENT`) — **ดึงไฟล์ที่แนบจากลูกค้า/ลีดมารวม** ไม่สร้างใหม่ · 6 หมวดโฟลเดอร์ · อัปโหลด/แก้/ลบ/พรีวิว (mock) · ไฟล์ที่มี `customerId` ลิงก์ไปลูกค้า

### 6.7 ปฏิทิน (Calendar) — `/calendar`
`calendar/page.tsx` · นัดหมาย 3 มุมมอง (เดือน/สัปดาห์/วัน) · `useSales().appointments` · KPI 4 · `AddApptModal` เลือกได้เฉพาะ**ลีดสาขาตัวเอง** · นัดที่ผูก `leadId` โผล่ทั้งในลีดและปฏิทิน

### 6.8 ตั้งค่า (Settings) — `/settings` (877 บรรทัด)
`settings/page.tsx` · แท็บแนวนอน 4 แท็บ + **ปุ่มบันทึก/รีเซ็ตกลางบน Topbar** (ผ่าน `SettingsBus`) + เตือน unsaved (`useUnsavedGuard`)
| แท็บ | เนื้อหา |
|---|---|
| บัญชีดีลเลอร์ | รูป+ชื่อ + ข้อมูลบริษัท (ออกในนามตัวแทน) · **อีเมลล็อกอิน+รหัสผ่าน = HQ จัดการ (read-only)** |
| ตั้งค่าใบเสนอราคา | คำนำหน้าเลขที่/อายุใบ/หัว-ท้าย/ตราประทับ · **VAT ล็อกจาก HQ** |
| ผู้รับผิดชอบ | CRUD พนักงานขาย (**ไม่ใช่ผู้ใช้ระบบ login ไม่ได้**) — บันทึกทันที |
| การแจ้งเตือน | สวิตช์ 6 เรื่อง + `LeadRulesCard` (กฎการดูแลลีดของสาขา — `saveDealerLeadRules`, **กระทบหน้า HQ ด้วย**) |

### 6.9 โปรไฟล์ (Profile) — `/profile`
`profile/page.tsx` · **ฝั่งตัวแทน redirect ไป `/settings` ทันที** — หน้านี้เรนเดอร์จริงเฉพาะ HQ (แก้รูป/ชื่อ/อีเมล/เบอร์/รหัสผ่าน)

---

## 7. โมดูลฝั่ง HQ

> HQ = เจ้าของข้อมูลทั้งเครือ **ดูอย่างเดียวเป็นส่วนใหญ่** · แหล่งข้อมูลกลาง = `useNetworkQuotations/Leads/Customers/DealerDetail` (`@/lib/useNetworkData`) · ทุก mutation ลง `useAuditLogger`
> **HQ แก้ได้จริงแค่ 5 หน้า:** ตัวแทน · แคตตาล็อก/ราคากลาง · ตั้งค่า · ผู้ใช้ HQ · บริษัท — ที่เหลือดูอย่างเดียว (Drawer มี footer "สำนักงานใหญ่ดูอย่างเดียว")

### 7.1 แดชบอร์ด HQ — `/hq/dashboard`
ภาพรวมทั้งเครือ **ดูอย่างเดียว** · คำนวณจากใบเสนอราคาจริง (เลิกใช้ค่าซีดตายตัว) · ตัวกรอง: เลือกตัวแทน + FilterBar เวลา
- KPI 4 (`.hq-kpi4`): เป้าหมายยอดขายทั้งเครือ (ProgressRing), ใบเสนอราคารวม, ลูกค้าทั้งเครือ, ดีลที่ปิดได้
- กราฟ: แนวโน้มยอดขาย (`SalesTrendChart`) · สัดส่วนตัวแทน (`Donut`) + ยอดรายภูมิภาค · ลีด·ใบเสนอ·ปิด รายเดือน (`GroupedBarChart`) · เป้า vs จริง (`PlanVsActualBars`) · Top 10 ตัวแทน · ยอดตามประเภทอาคาร (`CategoryRows`) · กิจกรรมล่าสุด (จาก Audit Log)
- **ตัดออกตามคำสั่งบอส:** การ์ดแจ้งเตือน, เหตุผลปิด, Forecast

### 7.2 ลูกค้าเป้าหมายทั้งเครือ — `/hq/leads` (803 บรรทัด)
ภาพรวมลีดทุกตัวแทน **ดูอย่างเดียว** (แก้ที่ตัวแทนเจ้าของ) · `useNetworkLeads` + `useLeadRulesOf` (เกณฑ์ติดตามรายสาขา) + `unassignedLeads`
- KPI 4 (กดกรอง) · การ์ดเตือนลีดไม่มีผู้รับผิดชอบ · แนวโน้มลีดรายเดือน (`GroupedBarChart` 4 ชุด) · ตามสถานะ/ประเภทอาคาร/แหล่งที่มา (`Donut`)/เหตุผลปิด (`Donut` จากลีด CANCELLED) · Top 10 ตัวแทน · ตารางลีด 12 คอลัมน์ + Drawer อ่านอย่างเดียว · `ExportMenu`

### 7.3 ตัวแทน (Dealers) — `/hq/dealers` (640) — **HQ แก้ได้จริง**
จัดการบัญชีตัวแทน (CRUD + credentials) · `usePersistentState(HQ_DEALERS_KEY)` + `useAuditLogger`
| Action | หน้าที่ |
|---|---|
| เพิ่มตัวแทน | ฟอร์ม + สร้าง credential อัตโนมัติ → โมดัลคัดลอกรหัส · audit |
| แก้ไข/ลบ/ปิด-เปิดใช้งาน | toggle status (มีแค่ `active`/`inactive` ไม่มี "ระงับ") · audit |
| เข้าระบบตัวแทน | `login("dealer")` (impersonate) |
| ดูรหัสเข้าระบบ / **รีเซ็ตรหัสผ่าน** | `genResetPassword` (deterministic) → โมดัลคัดลอก · audit (ย้ายมาจากแท็บตั้งค่าที่ยุบ) |

**7.3.1 รายละเอียดตัวแทน — `/hq/dealers/[dealerCode]`** (449) · **โหมดดูอย่างเดียว** · `useNetworkDealerDetail(code)` (CNX=สด, สาขาอื่น=seed) · แท็บ: ภาพรวม/ลูกค้าเป้าหมาย/โอกาสการขาย/ใบเสนอ/ลูกค้า/กิจกรรม · 404 ถ้าไม่พบ

### 7.4 แคตตาล็อกแม่แบบ / ราคากลาง (Master) — `/hq/master` (547) — **HQ แก้ได้จริง**
แหล่งเดียวทั้งเครือ · `usePersistentState(MASTER_CATALOG_KEY)` · HQ แก้ → ตัวแทนเห็นทันที
- เพิ่ม/แก้แม่แบบ (+รูป+แม่แบบย่อย) · **ปรับราคากลาง** (`saveReprice` ดันราคาเดิมลง `priceHistory`) · ดูประวัติราคา · ลบ · ทุกอย่าง audit · KPI 3

### 7.5 ภาพรวมยอดขายทั้งเครือ (Pipeline) — `/hq/pipeline` (645)
ศูนย์บัญชาการยอดขาย **อ่านอย่างเดียว** · ตัด Forecast/Contract ออก · Executive KPI 4 · กราฟแท่งคู่ (`DealerQuotationPerformance`: ออกใบ vs ปิดได้) + `HBars` หลายมุมมอง · ตารางผลงาน 12 คอลัมน์ + `DealerDrawer` · `ExportMenu`
- `DealerQuotationPerformance`: "ปิดไม่ได้"=lost จริง, "ยังไม่รู้ผล"=quotes−won−lost (แยกกัน)

### 7.6 ใบเสนอราคาทั้งเครือ — `/hq/quotations` (131)
**HQ เจ้าของข้อมูลแต่ไม่ออกใบเอง** → ดู/วิเคราะห์/ส่งออก · `useNetworkQuotations` + `toQuoteRows`/`aggregate` · โครง: KPI → FilterBar → Analytics → Table → Drawer
- คอมโพเนนต์ `hq/quotations/*`: KPICards · FilterBar · TrendChart (`BarLineChart`) · LeadsVsQuotations · ValueVsSales · BuildingType · LostReasons (จากลีด CANCELLED) · Aging (`Donut` 4 ช่วง) · TopDealerRanking · Table (อ่านอย่างเดียว) · Drawer

### 7.7 ฐานข้อมูลลูกค้าทั้งเครือ — `/hq/customers` (166)
ฐานข้อมูล**หลังปิดการขาย** **ดูอย่างเดียว** · `useCustomerDb()` · **ไม่มี FilterBar เวลา** (ใช้ตัวกรอง "ปีที่ส่งมอบ") · **ข้อยกเว้น sales-only: มี Delivery/อาคารที่ซื้อได้** (บอสสั่ง)
- คอมโพเนนต์ `hq/customers/*`: KPICards · Analytics (5 การ์ด) · Table 12 คอลัมน์ · Drawer 5 แท็บ (โปรไฟล์/อาคารที่ซื้อ/ประวัติซื้อ/ส่งมอบ/ไทม์ไลน์)

### 7.8 ตั้งค่า (Settings) — `/hq/settings` (615) — **HQ แก้ได้จริง**
แท็บแนวนอน 5 แท็บ + ปุ่มบันทึกกลางบน + เตือน unsaved · `usePersistentDraft` + `SettingsBus` · audit
| แท็บ | ค่าที่ตั้งได้ |
|---|---|
| บริษัท | `CompanyPanel` + `BackupCard` (ส่งออก/นำเข้า/คืนค่า ทุก SETTINGS_KEYS) |
| ผู้ใช้งานและสิทธิ์ | `UsersPanel` |
| เส้นทางการขาย | ขั้นการขาย (แสดงอย่างเดียว) + งานมาตรฐาน + **เหตุผลปิดการขายไม่สำเร็จ** (เพิ่ม/ลบ) |
| เป้าหมายยอดขาย | **ตั้งเป้าทั้งปีทั้งเครือ** (`annualTarget`) + เป้าอัตราปิด/ติดตามตรงเวลา (เกณฑ์สี) + `RollupTable` |
| การแจ้งเตือน | **กฎแจ้งเตือน 6 เรื่อง** (`HQ_ALERT_META`) + เกณฑ์ + ช่องทาง → ยิงไปกระดิ่ง HQ |

**ตัดออก:** ความปลอดภัย/SLA/แบรนด์/ธีม/AI/ส่วนลด · แท็บ "ตัวแทนจำหน่าย" ถูกยุบ (ซ้ำ /hq/dealers)

### 7.9 หน้าย่อย
- **ผู้ใช้งานและสิทธิ์** `/hq/users` (`UsersPanel`) — **HQ เท่านั้น** · เพิ่ม/แก้/รีเซ็ตรหัส/ปิด-เปิด · Permission Matrix (อ่านอย่างเดียว) · persist `hq_users_v4` + audit
- **บริษัท** `/hq/company` (`CompanyPanel`) — แก้โปรไฟล์บริษัท · โลโก้/ตารางสาขา read-only · ยิง `bpms-company-updated`
- **บันทึกการใช้งาน** `/hq/audit` — `useAuditEntries` + `hqAuditCategory` · Stat 3 · ตาราง 6 คอลัมน์ · `ExportMenu`
- คอมโพเนนต์ซ้ำ: `TopNRows` (ตัด Top N + "ดูทั้งหมด") · `LeadParts` (ProgressCell/DaysIdleCell/SevenDayAlertCard/TaskChecklist)

---

## 8. ไลบรารีตรรกะธุรกิจ + Hooks

> `src/lib/` — เลเยอร์ตรรกะล้วน · คำนวณจากข้อมูลจริงเท่านั้น (ไม่มี = `—`/`null`) · **hook อ่านกฎห้ามใช้ `usePersistentState`** (มันเขียนกลับ localStorage ทับค่าจริงตอน mount)

### hqAlerts.ts — เอนจินแจ้งเตือน HQ (6 กฎ, คำนวณล้วน)
| ฟังก์ชัน | กฎ/สูตร |
|---|---|
| `unassignedLeads(leads, rulesOf)` | ลีดไม่มีผู้รับผิดชอบ + เปิดอยู่ + เกินเกณฑ์ชั่วโมง**รายสาขา** |
| `idleLeads(leads, days)` | เปิดอยู่ + ไม่ติดต่อเกิน N วัน (ไม่มีวันติดต่อ = ไม่นับ) |
| `expiringQuotes(quotes, validityDays, withinDays)` | เฉพาะ `sent_to_client` · `0 ≤ daysLeft ≤ withinDays` |
| `idleDealers(dealers, quotes, days)` | ไม่ออกใบใหม่เกิน N วัน (**ไม่เคยออกใบ = ไม่นับ**) |
| `dealersAtTarget(dealers, pct)` | ทำยอดถึง pct% ของเป้าทั้งปี |
| `dealersHighLostRate(dealers, leads, pct, minClosed)` | อัตราปิดไม่สำเร็จสูง · **ต้อง `closed ≥ max(1, minClosed)`** (กัน "1/1 = แพ้ 100%") |
| `buildHQAlerts({...})` | รวม 6 ข้อ เฉพาะกฎที่ `on && inapp` |

### useHQAlerts.ts + useHQRules.ts — hook อ่านกฎ (ฝั่ง React)
- `useHQRules()` → `HQRules` (อ่าน `loadHQNotifRules`/`loadDealerLeadRulesMap`/`loadQuoteValidityDays`/`loadHQDealers` + ฟัง 3 event)
- `useHQAlerts()` → `HQAlert[]` (network leads/quotes + กฎ → `buildHQAlerts`)
- **กฎการดูแลลีดเป็นรายสาขา** (`useDealerLeadRulesMap`/`useLeadRulesOf`/`useLeadRules`) — เดิม HQ ตั้งค่าเดียว ตอนนี้แต่ละสาขาตั้งเอง · หน้า HQ ที่รวมหลายสาขาต้องถามด้วยรหัสสาขา

### useNetworkData.ts — แหล่งข้อมูลเครือแบบรวม (single source ของหน้า HQ)
- `CURRENT_DEALER = {code:"CNX", name:"เชียงใหม่สตีลบิลด์"}` — สาขาที่เล่นได้จริง
- `useNetworkQuotations/Leads/Customers` — live CNX (จาก SalesContext) + seed สาขาอื่น (dedup `quoteNo`/`dealerCode`, **live ทับ seed**)
- `useNetworkDealerDetail(code)` — CNX=สด, สาขาอื่น=seed · map สถานะลีด→item + % ความคืบหน้า · ยอดขายรายเดือน = Σ `totalValue` ใบ won
> ⚠️ **บั๊กที่รู้จาก /scenario:** `useNetworkDealerDetail` สาขา CNX ทำ `leads.map` โดยไม่ filter `dealerCode` → หน้า `/hq/dealers/CNX` โชว์ลีดสาขาอื่นปน (61 แทน 16)

### hqQuotations.ts — วิเคราะห์ใบเสนอราคาทั้งเครือ
- `toQuoteRows`/`aggregate`/`conversionRate`/`avgQuoteValue`/`groupBy` · `agingBucketOf`: ≤7/≤14/≤30/30+ · `conversionRate = accepted/sent·100` (ไม่นับ draft)
- **ขอบเขตจริง:** ไม่มีติดตามการเปิดอ่าน · ไม่มีวันตอบรับ (คิด "จำนวนวันปิดดีล" ไม่ได้)

### leadMetrics.ts — ตัวชี้วัดลีด (pure)
- `needsFollowUp(l, threshold=7)` · `leadPriority`: ≥3M→HIGH, ≥1M→MEDIUM · `leadProgress`: PAID→100/CANCELLED→0/อื่น→taskProgress · `leadCreatedDate` (ไม่มี = deterministic จาก numId, กันกราฟแบน)

### useAudit.ts — Audit Log
- `useAuditLogger()` → `(action, target) => void` (ใช้ชื่อ/บทบาท session ปัจจุบัน) · `useAuditEntries()` · `KEY="hq_audit_log_v1"`, MAX 300
- **`stampNow()` ใช้วัน/เดือน/ปีจาก `APP_NOW`** (ไม่ใช่นาฬิกาเครื่อง — ไม่งั้นรายการใหม่หลุดนอกช่วงตัวกรอง) · เวลา ชม.:นาที ใช้นาฬิกาจริง (เรียงในวันเดียวกัน)

### customerDb.ts — ฐานข้อมูลลูกค้า (หลังปิดการขาย)
- `useCustomerDb()` → จับใบ `status==="won"` กลุ่มด้วย `dealerCode|customer` · `isRepeat = buildings.length > 1` · ไม่มีใบ won = ทุกช่อง null (แสดง `—`)
- `deliveryDateOf` (จาก delivery.ts) = วันปิดการขาย + ระยะส่งมอบ · ไม่มีวันปิด = null

### delivery.ts — กฎการส่งมอบ
- เดิมชื่อ warranty.ts มีประกัน 10 ปี — **ตัดออกทั้งฟีเจอร์แล้ว** · `deliveryDaysOf` (ไม่ระบุ = `DEFAULT_DELIVERY_DAYS`) · `deliveryDateOf`

### quotationPrint.ts — พิมพ์/ส่งออกใบเสนอราคา (แหล่งเดียว)
- `buildQuotationHTML(q, issuer, cust?, doc?, wordmark?)` + `printQuotation(q, cust?)` · **VAT บังคับจาก `loadHQPolicy().vat` เสมอ** · `validUntil = q.expiry ?? q.date + validityDays` · หัวเอกสารใช้ชื่อบริษัทตัวแทน (ไม่มีโลโก้ Benjamin) · `esc()` กัน HTML injection

### อื่น ๆ
- `useUnsavedGuard(dirty)` — เตือน 3 ทางออก (beforeunload / click capture / `confirmDiscard()`)
- `useMasterCatalog()` — แคตตาล็อกกลาง (SSR-safe แล้ว sync persist)
- `imageResize.ts` `fileToResizedDataURL` — ย่อรูปก่อนเก็บ (กัน QuotaExceededError, PNG คงโปร่งใส)
- `format.ts` `parseBaht`/`fmtBaht`/`fmtM`/`fmtFull` · `theme.ts` สี CI (NAVY #003366)

---

## 9. คอมโพเนนต์ UI ที่ใช้ร่วม

> `src/components/ui/` · กราฟทั้งหมดเป็น **SVG เขียนเอง** · design system = plain CSS ใน `globals.css`

### Charts.tsx — กราฟทุกชนิด (13 ตัว, ~1100 บรรทัด)
| กราฟ | ใช้เมื่อ |
|---|---|
| `AreaChart` | พื้นที่ไล่เฉด + เส้นเปรียบเทียบ + เส้นเป้า |
| `PlanVsActualBars` | แท่งคู่ actual vs plan · เกินเป้า=เขียวขอบทอง · มี legend |
| `MonthlyBarsWithTarget` | แท่งรายเดือน + เส้นประเป้า (เป้าเท่ากันทุกเดือน) |
| `ProgressRing` | **วงแหวนความคืบหน้า — แหล่งเดียวทั้งระบบ** |
| `CategoryRows` | แท่ง**แนวนอน**จัดอันดับ (หนึ่งหมวด=หนึ่งแถว) |
| `SalesLineChart` | เส้น monotone + เส้นประเป้ารายเดือน |
| `Donut` | **สัดส่วนของก้อนเดียว** + ยอดรวมกลางวง |
| `LineTrendChart` | เส้นเดี่ยว (วัดความกว้างจริง) |
| `AreaGradientChart` | พื้นที่ไล่เฉดเส้นเดี่ยว |
| `MultiLineChart` | หลายเส้นแยกตัวแทน (**ต้องส่ง `vw` เมื่อการ์ดแคบ**) |
| `GroupedBarChart` | แท่งเรียงข้าง — ชุดที่**บวกกันไม่มีความหมาย** (ลีด/ใบเสนอ/ปิด) |
| `BarLineChart` | แท่ง=ยอดรวม, เส้น=สับเซตของยอดนั้น |
| `StackedBarChart` | แท่งซ้อน — ชุดที่**บวกกันได้ยอดจริง** |

**หลักเลือกชนิด:** โดนัท=สัดส่วนก้อนเดียว · Grouped=บวกไม่ได้ · Stacked=บวกได้ · BarLine=ชุดหนึ่งเป็นสับเซตของอีกชุด · monotonePath กันเส้นดิ่งต่ำกว่า 0 (ยอดขายติดลบไม่ได้)

### คอมโพเนนต์ธุรกิจ
- **`LeadQuotationsPanel`** — แผงใบเสนอราคาของลีด/ลูกค้า (list/create/edit/view) · **ลูกค้า = อ่านอย่างเดียว** · BOQ ตั้งต้นอัตโนมัติ (พื้นที่จากลีด หรือ มูลค่า÷ราคากลาง) · ไม่มีส่วนลด
- **`LineItemsEditor`** (BOQ) — ตารางรายการ · เลือกจากแคตตาล็อก→ราคากลาง HQ · **`showCatalog=false` ซ่อนปุ่มเลือกแคตตาล็อก+ปุ่มลบ** (แต่ยังแก้ได้) — LeadQuotationsPanel ส่ง false เสมอ
- **`LeadTasks`** — task-driven journey · **บังคับติ๊กตามลำดับ ห้ามข้ามขั้น** · Won→PAID/Lost→CANCELLED
- **`PersonPicker`/`PersonAvatar`/`AssigneeAvatars`** — เลือก/แสดงผู้รับผิดชอบ (จาก active persons)
- **`ReportEditor`** — แก้รายงานติดตามลีด (ผูกกับดีล ไม่ใช่ลูกค้า)

### Overlay / เมนู
- **`RightDrawer`** (+`DrawerSection`/`DrawerRow`) — แผงลอย**กลางจอ**มีแท็บ · Esc ปิด · lock scroll (reusable ทั่วระบบ)
- **`FilePreviewModal`** — พรีวิวไฟล์จำลอง (PDF/รูป/pptx/อื่น ๆ ตามนามสกุล)
- **`ExportMenu`** — export frontend-only 3 แบบ: **PDF** (print), **Excel** (.xlsx จริง ผ่าน `exportWorkbook.ts` · ยอดเงินเป็นตัวเลข ส่วนคอลัมน์รหัส/เลขที่คงเป็นข้อความ), **CSV** (BOM UTF-8) · `extraActions` (เช่นนำเข้า CSV)
- **`TableTools`/`useTableLayout`** — density + hidden columns (persist `tabletools:<key>`)

### การ์ด/สถิติ
`KpiCard` (progress bar สีตาม %) · `StatCard` (**ผูกช่วงเวลาจาก FilterBar อัตโนมัติ**) · `Badge` (6 โทน) · `CountUp` (นับเลข easeOutCubic) · `EmptyState` · `Skeleton` · `PageHeader` · `ActivityTimeline`

### กราฟ/ปุ่มช่วงระดับสูง
- **`SalesTrendChart`** — ห่อ `LineTrendChart` + ปุ่มช่วง 3/6/12 เดือน
- **`MonthRangeToggle`** — **ปุ่มช่วง 3/6/12 เดือน แหล่งเดียว** · `monthKey` ต้องมีปีเสมอ · กราฟที่ใช้ปุ่มนี้**ไม่ผูก FilterBar**
- `TemplateHero` (ภาพประกอบแม่แบบ SVG) · `TemplateSelect` (dropdown แม่แบบ optgroup หลัก→ย่อย)

### ระบบตัวกรอง (2 มาตรฐานคู่ขนาน)
- **`FilterBar.tsx`** — ผูก FilterContext · `FilterBar` (dropdown chip ตาม role) · `SelectFilter` · `TimeRangePills` · `TimeRangePicker`
- **`FilterRow.tsx`** — state ในหน้าเอง ไม่ผูก Context · `FilterRow` (ค้นหา+children+ล้าง) · `FilterSelect`

### Design System (globals.css)
- สี CI: `--primary #003366` (navy) · `--silver #C0C0C0` · `--gold #ECC94B` · `--success #059669` · `--text #2D2D2D`
- คลาสหลัก: `.card` · `.btn`(+variant) · `.badge`(+โทน) · `.kpi`/`.kpi-bar` · `.tab-bar` · `.form-input` · `.chart-s/m/l`
- **แอนิเมชันมาตรฐาน: `.bar-grow`** (scaleX 0→1) ใช้กับ progress bar ทุกอันในระบบ · เคารพ `prefers-reduced-motion`
- Responsive: breakpoint ถี่ (1440/1280/1180/1100/900/860/820/680/560/520/460)

---

## 10. โมเดลข้อมูล (mock.ts)

> `src/lib/mock.ts` (1710 บรรทัด) — type ทั้งหมด ~45 ชนิด + seed data + helper

**Type/Interface หลัก:**
| Type | ฟิลด์สำคัญ |
|---|---|
| `UserRole` | 6 role (SUPER_ADMIN/HQ_MANAGEMENT/HQ_STAFF/DEALER_ADMIN/DEALER_SALES/DEALER_SITE) |
| `MockSession` | name, role, dealerName, dealerCode, scopeAll |
| `LeadStatus` | WAITING/BULLET/HQ_PRICING/HQ_QUOTED/QUOTED/PAID/CANCELLED (แสดงเป็น 5 ขั้นผ่าน leadStage.ts) |
| `LeadRow` | id, numId, name, company, contact, phone?, province, product, status, value, assigned, dealerCode?, source?, tasks?, activities?, customerId? |
| `LeadTask` | key, label, done, doneAt?, doneBy? |
| `CustomerRow` | id, name, company, province, status, projects, owner, totalValue, contacts?, imported? |
| `SolutionProduct` | id, name, spec, price, unit, effectiveDate, priceHistory[], subtypes?, image? |
| `QuotationStatus` | draft/sent_to_client/won/lost/expired |
| `QuoteLineItem` | name, qty, unit, unitPrice (BOQ) |
| `QuotationMock` | id, customer, project, total, materialCost, buildingType, status, date, lineItems?, customerId, dealId?, issuer? |
| `DealerRow` | id, code, name, province, region, revenueActual, revenueTarget, winRate, status, credentials |
| `DealerStatus` | active/inactive |
| `AppointmentMock` | id, company, contact, leadId?, project, date, time, type, assigned, status |
| `HQCustomer` / `HQQuotation` | ลูกค้า/ใบเสนอราคาระดับเครือ (dealerCode, dealerName, ...) |
| `PipelineDealMock` | id, customerId, project, value, stageId, tasks[], outcome, activities? |
| `HQNotifRules` | alerts + leadIdleDays, quoteExpiringDays, dealerIdleDays, targetAchievedPct, lostRatePct, lostRateMinClosed |
| `HQTargets` | annualTarget, winRateTarget, onTimeTarget |
| `LeadRules` | followUpAlertDays, unassignedAlertHours (รายสาขา) |

**ค่าคงที่/นโยบายเด่น:** `DEFAULT_HQ_POLICY {requireApproval:true, vat:7, quoteValidityDays:30}` · `DEFAULT_HQ_TARGETS {annualTarget:260M, winRateTarget:40, onTimeTarget:85}` · `DEFAULT_QUOTE_NUMBERING {prefix:"Q-2026-", next:1101}` · `LEAD_TASK_TEMPLATE` (งานมาตรฐาน contact→close ผูก stage) · `DEFAULT_DELIVERY_DAYS 90` · storage keys: `HQ_DEALERS_KEY="hq_dealers_v4"`, `MASTER_CATALOG_KEY="master_catalog_v2"`, `HQ_NOTIF_RULES_KEY="hq_notif_rules_v2"`

**Label/color maps:** `leadStatusLabel`/`Color` · `quotationStatusLabel`/`Color` · `dealerStatusLabel`/`Color` · `apptTypeLabel`

**Seed data ก้อนใหญ่:**
| Seed | ปริมาณ |
|---|---|
| `sessions` | 2 (hq, dealer) |
| `responsiblePersons` | 5 คน (4 active) |
| `leads` | CNX จริง numId 1-16 + สาขาอื่นสมมติ numId 201-245 |
| `initialCustomers` | 13 ลูกค้า |
| `solutionProducts` | **6 แม่แบบหลัก** (โกดัง/โรงงาน/อาคาร/ตามแบบ/รีโนเวท/สนามกีฬา) + subtypes + priceHistory |
| `quotations` | ~36 ใบ (Q-2026-0089…0121) |
| `dealerLeaderboard` | **10 ตัวแทน** (RYG/CNX/MST/CRI/NSN/HYI/AYA/KKN/UBN/PKT) · CNX = ฿22.4M/เป้า ฿45M |
| `appointments` | 19 นัดหมาย |
| `dealerDetails` | drill-down 10 สาขา |
| `hqAllCustomers` | ~35 ราย (ไม่มี CNX — CNX มาจากสมุดสด) |
| `hqAllQuotations` | ~51 ใบ (HQ-Q01…Q51) |
| `pipelineDeals` | 13 ดีล |
| `notes` | 6 โน้ต |

**ลบไปแล้ว:** `hqSalesByMonth`, `hqDealSummary`, `hqPipelineLostReasons` (คำนวณจากจริงแทน) · ฟีเจอร์ส่วนลด + สถานะใบเสนอราคา "viewed" (บอสสั่งลบ)

---

## 11. กระบวนการทำงานหลัก (Workflows)

### W1. วงจรการขายหลัก (Dealer) — Lead → Won/Lost
```
(ลำดับจริงอยู่ docs/FLOW.html ขั้น D1–D8 · ตาราง "สถานะ ↔ ขั้น")
เพิ่มลีด → ขั้น 1 ข้อมูลลูกค้า (WAITING · ฐานตั้งเอง) [/leads]
  → ขอราคาจาก HQ → ขั้น 2 (HQ_PRICING · ฐานขยับ)
  → HQ ส่งใบ → ขั้น 3 ได้ใบ HQ (HQ_QUOTED) → ทำใบให้ลูกค้า (ร่าง) = ขั้น 4
  → ส่งให้ลูกค้า → ขั้น 5 รอลูกค้าตอบ (QUOTED) · ต่อรอง = "ทำฉบับใหม่" ที่ใบ (ไม่มีขั้นเจรจาแยก)
  → ปิดการขาย:
      • "ลูกค้าตอบรับ" ที่ใบ → PAID + สร้างลูกค้า (ทางเดียว)
      • "ลูกค้าปฏิเสธ" ที่ใบ / "ปิดไม่สำเร็จ" ที่กล่องขั้นต่อไป → CANCELLED + เหตุผล
```

### W2. ใบเสนอราคา (Quotation)
```
สร้าง (draft) → ส่งลูกค้า (sent_to_client) → won (ปิดการขาย) / lost (ปฏิเสธ) / expired (หมดอายุ)
```
- ออกได้จากแท็บใบเสนอราคาในลีดเท่านั้น (หน้า /quotations ไม่มีปุ่มสร้าง) · BOQ จากราคากลาง HQ · VAT+เลขที่ = HQ กำหนด · Dealer self-serve ไม่ต้องอนุมัติ HQ

### W3. ลูกค้าเดิมซื้อซ้ำ (Repeat)
```
/customers → เลือกลูกค้า → "เพิ่มงานขายใหม่" → createDeal()
  → สร้าง LeadRow ผูก customerId, status WAITING → กลับเข้า pipeline /leads (เหมือน W1)
```

### W4. HQ ตั้งนโยบาย → มีผลกับ Dealer ทันที
```
/hq/master ปรับราคากลาง (saveReprice) → persist MASTER_CATALOG_KEY → ตัวแทนเห็นราคาใหม่ใน /products + BOQ ทันที
/hq/settings ตั้งเป้าทั้งปี (annualTarget) → แดชบอร์ดตัวแทนคิด YTD vs เป้าใหม่
/hq/settings ตั้งกฎแจ้งเตือน 6 เรื่อง → ยิงไปกระดิ่ง HQ
/hq/dealers รีเซ็ตรหัสผ่าน/ปิดใช้งานตัวแทน → audit + credentials อัปเดต
```

### W5. Audit — ทุก mutation ฝั่ง HQ
```
HQ ทำ action สำคัญ (เพิ่ม/แก้/ลบ ตัวแทน·แม่แบบ·ผู้ใช้·ตั้งค่า) → useAuditLogger บันทึก (stampNow ใช้ APP_NOW)
  → โผล่ใน /hq/audit + กระดิ่ง HQ + กิจกรรมล่าสุดในแดชบอร์ด HQ
```

### W6. แจ้งเตือน (Notifications)
- **Dealer:** `buildNotifications` จากลีด/ใบเสนอราคา/นัดหมายสาขาตัวเอง (6 ประเภท)
- **HQ:** `buildHQNotifications` จาก Audit Log + `useHQAlerts` (6 กฎคำนวณสด จากลีด/ใบเสนอราคา/เป้าตัวแทนทั้งเครือ)

---

## ภาคผนวก — ข้อควรระวังเวลาแก้โค้ด (กับดักที่เจอจริง)

1. **`"เปิดใช้งาน".includes("ปิดใช้งาน") === true`** — ต่างกันแค่ตัว เ · เช็คสถานะต้องเทียบตรงตัว (`===`) ห้าม `.includes`
2. **ข้อความ empty state "ไม่พบผลลัพธ์สำหรับ X"** มีคำค้น X อยู่ในตัวเอง — อย่าเช็ค leak ด้วย `body.includes(X)`
3. **JSX comment ในตำแหน่ง expression** `{cond && ( {/* ... */} <div>)` — **tsc ผ่าน แต่ `next build` พัง** · วางคอมเมนต์เหนือ expression
4. **แก้ seed mock.ts** ต้องขึ้นเลขเวอร์ชัน storage key ไม่งั้น localStorage เก่าทับ
5. **hook อ่านกฎห้ามใช้ `usePersistentState`** (เขียนกลับทับค่าจริงตอน mount) — ใช้ `load*()` + ฟัง event แทน
6. **ตาราง `table-layout:fixed`** — ความกว้างแก้ที่ `<colgroup><col>` เท่านั้น (ใส่ที่ `<th>` ไม่มีผล) · เพิ่ม/ลบคอลัมน์ต้องอัปเดต col ให้จำนวนตรงกับ th/td
7. **inline `style={{gridTemplateColumns}}` ชนะ media query เสมอ** — เป็นต้นเหตุ KPI ถูกตัดที่ /hq/master, /hq/users บนมือถือ
8. **การ์ดในแถว grid `align-items:stretch` จะยืดตามเนื้อที่สูงสุด** — ถ้าอยากให้เนื้อ "เลื่อนในการ์ด" ต้องทำกล่องเนื้อเป็น `position:absolute; inset:0` ใน parent `position:relative; flex:1` ไม่งั้นการ์ดยืดจนไม่มีวันเกิดแถบเลื่อน
9. **`withDefaults()` ใน usePersistentState** merge ค่าที่บันทึกไว้กับ default แบบไล่ชั้น — เพิ่มฟิลด์ใหม่ในออบเจ็กต์ตั้งค่าได้โดยไม่ต้องขึ้นเวอร์ชันคีย์ (แต่ array ยังทับทั้งก้อน — ลบแถวต้องลบจริง)

---

## ภาคผนวก B — การเปลี่ยนแปลงล่าสุด

รายการนี้ทับเนื้อหาด้านบนตรงจุดที่ขัดกัน (ด้านบนเขียนไว้ก่อนการเปลี่ยนแปลง) — เรียงใหม่→เก่า

**โครงสร้าง**
- **แยกเป็น pnpm monorepo** — `apps/hq` (port 3002) + `apps/dealer` (port 3001) + `packages/shared` · ทั้งคู่ import จาก `@pms/shared` (ดูตาราง path map ด้านบนสุด)

**กฎธุรกิจที่ถูกลบทั้งฟีเจอร์ (อย่าใส่กลับถ้าไม่มีฟิลด์จริง)**
- **ส่วนลด (discount)** — ลบหมดทั้งระบบ (15 ก.ค.) · ราคาที่เสนอ = ราคาสุทธิ
- **การรับประกัน (warranty)** — ลบหมด (ฝั่งดีลเลอร์ไม่มี HQ ก็ไม่ต้องมี) · ไฟล์ `lib/warranty.ts` เปลี่ยนชื่อเป็น **`lib/delivery.ts`** (เหลือแค่ "การส่งมอบ" = วันปิดการขาย + ระยะส่งมอบ · ไม่มี +10 ปีแล้ว) · โดนัท/คอลัมน์/ตัวกรอง/แท็บ "ประกัน" ที่ /hq/customers และป้ายฝั่งดีลเลอร์ถูกถอดออก
- **Forecast / คาดการณ์รายได้** — ไม่มีวันคาดปิดการขายในระบบ

**หน้าตั้งค่า HQ (`/hq/settings`)** — เหลือ **5 แท็บ** (บริษัท · ผู้ใช้งานและสิทธิ์ · เส้นทางการขาย · เป้าหมายยอดขาย · การแจ้งเตือน)
- ยุบแท็บ "กฎธุรกิจ" เข้า "เส้นทางการขาย" (กฎดูแลลีด + เหตุผลปิดไม่สำเร็จ) · ลบแท็บ "ตัวแทนจำหน่าย" (จัดการที่ `/hq/dealers` ที่เดียว)
- ลบการ์ดข้อความล้วน: นโยบายราคา · ประเภทสินค้าและแม่แบบ · กฎใบเสนอราคา (VAT/อายุใบ/เลขที่ยังทำงานอยู่แต่ตรึงค่าตั้งต้น ไม่มี UI ตั้งค่าแล้ว)

**ฟีเจอร์ใหม่/แก้บั๊ก**
- **ลีดมีฟิลด์ `area` (พื้นที่ ตร.ม.)** — กรอกตอนเพิ่ม/แก้ลีด (optional · ว่าง = undefined ไม่ใช่ 0) · ส่งต่อเป็น "จำนวนตั้งต้น" ของ BOQ ตอนออกใบเสนอราคา (แม่แบบหน่วย ตร.ม.) · แก้ทับได้ · พื้นที่บนใบยึดตาม BOQ ตอนบันทึกเสมอ · มีคอลัมน์ในตารางลีด (ซ่อนได้)
- **`HQ_DEALERS_KEY` → `hq_dealers_v4`** + `purgeOldDealerKeys()` ล้าง v2/v3 ตอนเข้าแอป — แก้บั๊กตัวแทนผี 48 ราย (รหัส D101–D138) ที่ค้างใน localStorage เครื่องเก่า · ระบบมีตัวแทน **10 ราย** จริง
- **`LostReasonsChart`** นับจากเหตุผลที่ลีดบันทึกไว้จริง (ไม่กรองกับรายการเหตุผลของ HQ) — เดิมคำสั้น "ราคา" ไม่แมตช์ประโยคยาว "ราคาสูงเกินงบประมาณ" ทำให้การ์ดว่าง
- **กราฟแท่ง `GroupedBarChart`** (แท่งกลุ่ม ไม่ใช่แท่งซ้อน) — ใช้กับลีด/ใบเสนอราคา/ปิดการขายรายเดือน (เป็นขั้นของดีลเดียวกัน บวกกันไม่มีความหมาย)
- **`MonthRangeToggle`** (`components/ui/`) — ปุ่มช่วง 3/6/12 เดือน แหล่งเดียวของทั้งระบบ · ใช้กับกราฟแนวโน้มที่ **ไม่ผูกกับตัวกรองเวลาบนแถบบน** (ต้องเขียนช่วงที่ครอบใต้หัวข้อด้วย `monthRangeSubtitle`) · ถังเดือนใช้คีย์ `YYYY-MM` กันข้ามปีทับกัน
- **แดชบอร์ด HQ การ์ด "กิจกรรมล่าสุด"** ดึงจาก **บันทึกการใช้งาน** (audit log · `useAuditEntries`) แหล่งเดียวกับ `/hq/audit` — ไม่ใช่ความเคลื่อนไหวการขายแล้ว
- **ปุ่ม "ดู" ในตาราง /hq/leads · /hq/quotations** เป็นไอคอนลูกตาล้วน (คง `title`/`aria-label`)
