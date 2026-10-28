# เอกสารออกแบบระบบ — Benjamin PMS
### แพลตฟอร์มบริหารงานขายและตัวแทนจำหน่ายสำหรับธุรกิจอาคารเหล็กสำเร็จรูป
*(Sales and Dealer Management Platform for the Pre-Engineered Building Industry)*

> ผู้พัฒนา: นายรัฐนันท์ วังใจชิด · รหัส 68409010021
> เอกสารนี้อ้างอิงโครงสร้างข้อมูลและฟังก์ชันจากระบบที่พัฒนาจริง (เฟส Front-end + Mock Data)

---

## 1. สถาปัตยกรรมระบบ (System Architecture)

ระบบออกแบบเป็น **3-Tier Web Application** แยกการแสดงผล ตรรกะทางธุรกิจ และการจัดเก็บข้อมูลออกจากกัน

```mermaid
flowchart TB
    subgraph client["ชั้นการแสดงผล (Presentation Layer)"]
        D["Dealer Workspace<br/>ตัวแทนจำหน่าย"]
        H["HQ Workspace<br/>สำนักงานใหญ่"]
    end
    subgraph app["ชั้นตรรกะธุรกิจ (Application Layer) — Next.js"]
        UI["React Components + Tailwind CSS"]
        CTX["State Management<br/>(SalesContext / FilterContext / RoleContext)"]
        API["Next.js API Routes<br/>(REST endpoints)"]
        AUTH["Authentication<br/>(NextAuth.js)"]
    end
    subgraph data["ชั้นข้อมูล (Data Layer)"]
        ORM["Prisma ORM"]
        DB[("PostgreSQL Database")]
    end
    D --> UI
    H --> UI
    UI <--> CTX
    UI --> API
    API --> AUTH
    API --> ORM
    ORM <--> DB

    style client fill:#dce5f0,stroke:#003366
    style app fill:#eef3f8,stroke:#003366
    style data fill:#e5faf0,stroke:#059669
```

| ชั้น | เทคโนโลยี | หน้าที่ |
|------|-----------|---------|
| Presentation | React, Tailwind CSS | แสดงผล 2 workspace แยกสิทธิ์ |
| Application | Next.js (App Router), API Routes, NextAuth.js | ตรรกะธุรกิจ + สิทธิ์ผู้ใช้ + Task-driven Sales Journey |
| Data | Prisma ORM, PostgreSQL | จัดเก็บ/สอบถามข้อมูลแบบรวมศูนย์ |
| Deployment | Vercel · Git/GitHub | โฮสต์ + จัดการเวอร์ชัน |

> **หมายเหตุเฟสปัจจุบัน:** ระบบยังทำงานเป็น Front-end-only โดยจำลองชั้นข้อมูลด้วย `localStorage` (Mock Data) เฟสถัดไปคือแทนที่ด้วย API Routes + Prisma + PostgreSQL ตามสถาปัตยกรรมข้างต้น

---

## 2. แผนภาพ Use Case (Use Case Diagram)

**Actors:** พนักงานขาย/ผู้จัดการตัวแทน (Dealer) · ผู้บริหารสำนักงานใหญ่ (HQ)
*ลูกค้า (Customer) = ข้อมูลในระบบ ไม่ใช่ Actor*

```mermaid
flowchart LR
    Dealer(("👤 ตัวแทนจำหน่าย<br/>Dealer"))
    HQ(("👤 สำนักงานใหญ่<br/>HQ"))

    subgraph system["Benjamin PMS"]
        U1["บริหารลูกค้าเป้าหมาย (Lead)"]
        U2["ติดตามเส้นทางการขาย<br/>(เช็กงาน → เลื่อน Stage)"]
        U3["นัดหมายลูกค้า"]
        U4["จัดทำ/พิมพ์ใบเสนอราคา"]
        U5["ปิดการขาย (Won/Lost)"]
        U6["บริหารข้อมูลลูกค้า"]
        U7["ดู Dashboard/รายงาน"]
        U8["ตั้งค่าบริษัท/ผู้รับผิดชอบ"]

        M1["ดูผลงานตัวแทน"]
        M2["บริหารลูกค้า/ใบเสนอราคาทั้งเครือ"]
        M3["กำหนดราคากลาง + แม่แบบสินค้า"]
        M4["วิเคราะห์ยอดขาย/Conversion"]
        M5["จัดการบัญชี/สิทธิ์ตัวแทน"]
        M6["ตั้งเป้าหมาย + Export รายงาน"]
    end

    Dealer --- U1 & U2 & U3 & U4 & U5 & U6 & U7 & U8
    HQ --- M1 & M2 & M3 & M4 & M5 & M6 & U7
```

---

## 3. แผนภาพกระแสข้อมูล (Data Flow Diagram)

### 3.1 Context Diagram (Level 0)

```mermaid
flowchart LR
    Dealer["ตัวแทนจำหน่าย"]
    HQ["สำนักงานใหญ่"]
    P(("0<br/>Benjamin PMS"))

    Dealer -->|"ข้อมูลลูกค้าเป้าหมาย/ใบเสนอราคา/นัดหมาย"| P
    P -->|"รายการงาน/เอกสาร/แจ้งเตือน"| Dealer
    HQ -->|"ราคากลาง/แม่แบบ/เป้าหมาย/บัญชีตัวแทน"| P
    P -->|"รายงานภาพรวม/ผลงานตัวแทน"| HQ
```

### 3.2 DFD Level 1

```mermaid
flowchart TB
    Dealer["ตัวแทน"]; HQ["สำนักงานใหญ่"]
    P1(("1.0<br/>บริหารลูกค้าเป้าหมาย &<br/>เส้นทางการขาย"))
    P2(("2.0<br/>จัดทำ<br/>ใบเสนอราคา"))
    P3(("3.0<br/>บริหารลูกค้า"))
    P4(("4.0<br/>แม่แบบ &<br/>ราคากลาง"))
    P5(("5.0<br/>Dashboard &<br/>รายงาน"))

    D1[("D1 Lead / Task / Activity")]
    D2[("D2 Quotation")]
    D3[("D3 Customer")]
    D4[("D4 ProductTemplate / Price")]
    D5[("D5 Appointment")]

    Dealer --> P1 --> D1
    P1 --> D5
    P1 -->|"WON → แปลงเป็นลูกค้า"| P3 --> D3
    Dealer --> P2 --> D2
    P2 -->|"อ้างอิงราคา"| D4
    HQ --> P4 --> D4
    D1 & D2 & D3 --> P5 --> HQ
    P5 --> Dealer
```

---

## 4. แผนภาพความสัมพันธ์ข้อมูล (ER Diagram)

```mermaid
erDiagram
    DEALER   ||--o{ USER            : "มีบัญชี"
    DEALER   ||--o{ SALESPERSON     : "มีพนักงานขาย"
    DEALER   ||--o{ LEAD            : "รับผิดชอบ"
    DEALER   ||--o{ CUSTOMER        : "ดูแล"
    DEALER   ||--o{ QUOTATION       : "ออกเอกสาร"

    PRODUCT_TEMPLATE ||--o{ PRODUCT_SUBTYPE : "มีแม่แบบย่อย"
    PRODUCT_TEMPLATE ||--o{ PRICE_HISTORY   : "มีประวัติราคา"
    PRODUCT_TEMPLATE ||--o{ LEAD            : "เลือกใช้"

    LEAD ||--o{ LEAD_TASK      : "มีเช็กลิสต์"
    LEAD ||--o{ LEAD_ACTIVITY  : "มีไทม์ไลน์"
    LEAD ||--o{ APPOINTMENT    : "มีนัดหมาย"
    LEAD ||--o{ QUOTATION      : "เสนอราคา"
    LEAD |o--o| CUSTOMER       : "แปลงเมื่อปิดการขาย"

    CUSTOMER ||--o{ QUOTATION   : "รับใบเสนอราคา"
    CUSTOMER ||--o{ NOTE        : "มีบันทึก"

    SALESPERSON ||--o{ LEAD_ASSIGNEE : "ถูกมอบหมาย"
    LEAD        ||--o{ LEAD_ASSIGNEE : "มีผู้รับผิดชอบ"

    DEALER {
        int    id PK
        string code
        string name
        string region
        string tax_id
        string logo
        string status
        bigint revenue_target
    }
    USER {
        int    id PK
        int    dealer_id FK
        string email
        string password_hash
        string name
        string role
        bool   scope_all
    }
    SALESPERSON {
        int    id PK
        int    dealer_id FK
        string name
        string title
        string phone
        string email
        bool   active
    }
    LEAD {
        int    id PK
        int    dealer_id FK
        int    template_id FK
        int    customer_id FK
        string company
        string contact
        string phone
        string province
        string status
        bigint value
        string source
        string lost_reason
        date   created_at
    }
    LEAD_TASK {
        int    id PK
        int    lead_id FK
        string task_key
        string stage
        bool   done
        datetime done_at
        string done_by
    }
    LEAD_ACTIVITY {
        int    id PK
        int    lead_id FK
        string type
        string text
        datetime created_at
    }
    LEAD_ASSIGNEE {
        int lead_id FK
        int salesperson_id FK
    }
    CUSTOMER {
        int    id PK
        int    dealer_id FK
        int    lead_id FK
        string company
        string type
        string phone
        string province
        string category
        string status
        bigint total_value
        date   join_date
    }
    QUOTATION {
        int    id PK
        string quote_no
        int    dealer_id FK
        int    lead_id FK
        int    customer_id FK
        string project
        string building_type
        int    area
        bigint subtotal
        int    discount_pct
        int    vat_pct
        string status
        date   issue_date
        date   expiry_date
    }
    APPOINTMENT {
        int    id PK
        int    dealer_id FK
        int    lead_id FK
        string type
        date   appt_date
        string appt_time
        string status
        string note
    }
    PRODUCT_TEMPLATE {
        int    id PK
        string name
        string spec
        bigint price
        string unit
        date   effective_date
    }
    PRODUCT_SUBTYPE {
        int    id PK
        int    template_id FK
        string name
    }
    PRICE_HISTORY {
        int    id PK
        int    template_id FK
        bigint price
        date   effective_date
        string note
    }
    NOTE {
        int    id PK
        int    customer_id FK
        string category
        string text
        datetime created_at
    }
```

---

## 5. การออกแบบฐานข้อมูล (Database Design)

### 5.1 พจนานุกรมข้อมูล (Data Dictionary — ตารางหลัก)

**ตาราง `dealer` — ตัวแทนจำหน่าย**
| ฟิลด์ | ชนิด | คำอธิบาย |
|-------|------|----------|
| id | SERIAL PK | รหัสตัวแทน |
| code | VARCHAR(8) UNIQUE | รหัสย่อ เช่น CNX, RYG |
| name | VARCHAR | ชื่อบริษัทตัวแทน |
| region | VARCHAR | ภูมิภาค |
| tax_id, phone, email, address | VARCHAR | ข้อมูลบริษัท (ออกใบเสนอราคาในนามนี้) |
| logo, wordmark | TEXT | โลโก้สัญลักษณ์ / โลโก้พร้อมชื่อ |
| revenue_target | BIGINT | เป้ายอดขาย |
| status | VARCHAR | active / inactive |

**ตาราง `user` — ผู้ใช้ระบบ**
| ฟิลด์ | ชนิด | คำอธิบาย |
|-------|------|----------|
| id | SERIAL PK | |
| dealer_id | INT FK → dealer(id) | NULL = ผู้ใช้ HQ |
| email | VARCHAR UNIQUE | ใช้ล็อกอิน |
| password_hash | VARCHAR | รหัสผ่าน (เข้ารหัส) |
| name | VARCHAR | ชื่อผู้ใช้ |
| role | ENUM | HQ_MANAGEMENT / DEALER_ADMIN / DEALER_SALES / DEALER_SITE |
| scope_all | BOOLEAN | true = เห็นทุกตัวแทน (HQ) |

**ตาราง `salesperson` — ผู้รับผิดชอบ/พนักงานขาย** *(ไม่ใช่ผู้ใช้ระบบ — ใช้กำกับลูกค้าเป้าหมาย/ลูกค้า)*
| ฟิลด์ | ชนิด | คำอธิบาย |
|-------|------|----------|
| id | SERIAL PK | |
| dealer_id | INT FK | สังกัดตัวแทน |
| name, title, phone, email | VARCHAR | ข้อมูลพนักงาน |
| active | BOOLEAN | สถานะใช้งาน |

**ตาราง `lead` — ลูกค้าเป้าหมาย**
| ฟิลด์ | ชนิด | คำอธิบาย |
|-------|------|----------|
| id | SERIAL PK | |
| dealer_id | INT FK | |
| template_id | INT FK → product_template | แม่แบบ/แม่แบบย่อยที่สนใจ |
| customer_id | INT FK → customer | NULL จนกว่าปิดการขาย (WON) |
| company, contact, phone, email, province | VARCHAR | ข้อมูลผู้สนใจ |
| status | ENUM | WAITING / BULLET / HQ_PRICING / HQ_QUOTED / QUOTED / PAID / CANCELLED (enum ในฐานยังมีค่าเดิม 2 ค่าที่เลิกใช้ — ข้อบังคับ leads_status_retired ไม่ให้แถวไหนใช้ · ใบ 0257) |
| value | BIGINT | มูลค่าคาดการณ์ |
| source | VARCHAR | ช่องทางที่มา |
| lost_reason | VARCHAR | เหตุผล (เมื่อ CANCELLED) |
| created_at | DATE | |

**ตาราง `lead_task` — เช็กลิสต์งาน (Task-driven Sales Journey)**
| ฟิลด์ | ชนิด | คำอธิบาย |
|-------|------|----------|
| id | SERIAL PK | |
| lead_id | INT FK | |
| task_key | VARCHAR | contact / requirement / makeQuote / … |
| stage | ENUM | Stage ที่งานนี้พาไปถึง |
| done | BOOLEAN | เช็กแล้ว → คำนวณ % + เลื่อน Stage อัตโนมัติ |
| done_at, done_by | TIMESTAMP / VARCHAR | เวลา + ผู้ทำ |

**ตาราง `quotation` — ใบเสนอราคา**
| ฟิลด์ | ชนิด | คำอธิบาย |
|-------|------|----------|
| id | SERIAL PK | |
| quote_no | VARCHAR UNIQUE | เลขที่เอกสาร เช่น Q-2026-1001 |
| dealer_id, lead_id, customer_id | INT FK | |
| project, building_type | VARCHAR | โครงการ + แม่แบบ |
| area | INT | พื้นที่ (ตร.ม.) |
| subtotal, discount_pct, vat_pct | NUMBER | คำนวณยอดสุทธิ |
| status | ENUM | draft / sent_to_client / viewed / won / lost / expired |
| issue_date, expiry_date | DATE | |

**ตาราง `appointment` — นัดหมาย** · **`customer`** · **`product_template` / `product_subtype` / `price_history`** · **`note`** · **`sales_target`** — โครงสร้างตาม ER Diagram ข้อ 4

### 5.2 กฎความสัมพันธ์สำคัญ (Business Rules)
1. **1 Dealer = 1 บัญชีหลัก** แต่มี `salesperson` ได้หลายคน (ผู้รับผิดชอบ ≠ ผู้ใช้ระบบ)
2. **Lead → Customer** เกิดขึ้นอัตโนมัติเมื่อ `lead.status = PAID` (ปิดการขายสำเร็จ)
3. **ผู้รับผิดชอบต่อลูกค้าเป้าหมายเป็นแบบหลายคน** → ตาราง junction `lead_assignee` (Many-to-Many)
4. **ราคากลาง (`product_template.price`) กำหนดโดย HQ เท่านั้น** — ทุกตัวแทนอ่านชุดเดียวกัน + เก็บ `price_history` ทุกครั้งที่ปรับ
5. **ใบเสนอราคาออกในนาม Dealer** (ใช้ `dealer.name/logo/tax_id`) ไม่ใช่สำนักงานใหญ่
6. **แม่แบบย่อย roll-up สู่แม่แบบหลัก** ตอนจัดกลุ่ม/รายงาน

---

## 6. ขอบเขตระบบ (ยืนยันจากการออกแบบ)
**อยู่ในระบบ:** Login+สิทธิ์ · Lead · Customer · Sales Pipeline · Quotation · Product/ราคากลาง · Dashboard · Report · Search/Filter · Export CSV/PDF
**ไม่อยู่ในระบบ (Sales-only):** บัญชี · คลังสินค้า · จัดซื้อ · การผลิต · ก่อสร้าง · ติดตั้ง · ซ่อมบำรุง · Mobile App
