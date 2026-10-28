// แผงซ้าย (แบรนด์) — พื้นสีเทาอ่อนเรียบ ๆ ไม่มีรูปพื้นหลัง
// Tailwind ล้วน + inline SVG (ไม่พึ่ง icon library) · เป็น server component (ไม่มี state)
// ⛔ ไม่มีรูปโกดังพื้นหลังแล้ว (บอสสั่ง 15 ก.ย. 69 "อ่านตัวหนังสือไม่ออก เลยเอาภาพออก" → พื้นสีเทา)
//   เดิมใช้รูปถ่ายโกดังเต็มแผง + ม่านขาวบางทับ รูปดูซีดเป็นสีเทา และตัวหนังสือบนหลังคาสีน้ำเงินอ่านยาก
//   ห้ามใส่รูปกลับโดยไม่ถามบอส
// variant: "dealer" (ค่าเริ่มต้น — พอร์ทัลดีลเลอร์) · "hq" (พอร์ทัลสำนักงานใหญ่ · เนื้อหาบริหารทั้งเครือ)

// ไอคอน 4 ตัว (ใช้ร่วมทั้งสอง variant) — dashboard / people / document / line-chart
const FEATURE_SVGS = [
  (
    <>
      <path d="M12 3v9l6.5 3.8" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  (
    <>
      <path d="M17 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
      <circle cx="9.5" cy="7" r="3.5" />
      <path d="M22 20v-1a4 4 0 0 0-3-3.87M16.5 3.6a3.5 3.5 0 0 1 0 6.8" />
    </>
  ),
  (
    <>
      <path d="M14 2v6h6" />
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M8 13h8M8 17h8M8 9h2" />
    </>
  ),
  (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 15l4-5 3 3 5-7" />
    </>
  ),
];

const CONTENT = {
  dealer: {
    // ข้อความที่ผู้ใช้เห็นเป็นไทยทั้งหมด (FLOW D1 · บอสสั่ง 28 ต.ค. 69) — คงชื่อแบรนด์ Benjamin / PEB Steel และคำ HQ/KPI
    badge: "แพลตฟอร์มบริหารงานขายและดีลเลอร์",
    h1a: "ระบบบริหารงานขายและ",
    h1b: "ดีลเลอร์ครบวงจร",
    intro:
      "แพลตฟอร์มที่ช่วยให้คุณบริหารลูกค้า ติดตามงานขาย และวิเคราะห์ผลประกอบการได้อย่างมีประสิทธิภาพ",
    features: [
      { title: "แดชบอร์ดเรียลไทม์", desc: "ติดตามยอดขายและ KPI แบบเรียลไทม์" },
      { title: "ระบบงานขาย", desc: "บริหารลูกค้าและโอกาสทางการขาย" },
      { title: "จัดการใบเสนอราคา", desc: "สร้างและจัดการใบเสนอราคา" },
      { title: "วิเคราะห์และรายงาน", desc: "วิเคราะห์ข้อมูลเชิงลึก ช่วยตัดสินใจได้แม่นยำ" },
    ],
  },
  hq: {
    badge: "สำนักงานใหญ่ · บริหารเครือข่ายดีลเลอร์",
    h1a: "ศูนย์บริหารเครือข่าย",
    h1b: "ดีลเลอร์ทั่วประเทศ",
    intro:
      "ศูนย์กลางบริหารเครือข่ายดีลเลอร์ ควบคุมราคากลาง นโยบาย และติดตามผลประกอบการทั้งเครือได้จากที่เดียว",
    features: [
      { title: "ภาพรวมทั้งเครือ", desc: "ยอดขายและ KPI ของทุกดีลเลอร์แบบเรียลไทม์" },
      { title: "บริหารดีลเลอร์", desc: "จัดการเป้าหมาย สิทธิ์ และผลงานดีลเลอร์ทั่วประเทศ" },
      { title: "ราคาจาก HQ & นโยบาย", desc: "ทำราคาให้ดีลเลอร์ตามคำขอ และกำหนดกฎธุรกิจส่วนกลาง" },
      { title: "วิเคราะห์เชิงลึก", desc: "รายงานผลประกอบการทั้งเครือ ช่วยตัดสินใจแม่นยำ" },
    ],
  },
};

export default function HeroSection({ variant = "dealer" }: { variant?: "dealer" | "hq" }) {
  const c = CONTENT[variant];
  const features = c.features.map((f, i) => ({ ...f, svg: FEATURE_SVGS[i] }));

  return (
    <div className="relative flex min-h-[600px] flex-col overflow-hidden">
      {/* พื้นสีเทาอ่อนเรียบ ๆ (บอสสั่ง 15 ก.ย. 69) — ตัวหนังสือสีน้ำเงินเข้มอ่านชัดทุกจุด ไม่ต้องมีม่านทับ */}
      <div className="absolute inset-0 bg-[#eceff3]" />

      {/* เนื้อหา — flex-1 + justify-between: กลุ่มแบรนด์ชิดบน · ฟีเจอร์ดันลงล่าง (เต็มแผง ไม่เหลือที่ว่าง)
          ⚠️ ขอบเรืองขาวรอบตัวอักษร (text-shadow) เอาออกแล้วตามที่บอสสั่ง 2 ก.ย. 69 — ห้ามใส่กลับ */}
      <div className="relative z-10 flex flex-1 flex-col justify-between gap-8 px-11 py-9">
        {/* กลุ่มแบรนด์ (บน) */}
        <div className="flex flex-col gap-7">
          {/* Logo — โลโก้จริงของ Benjamin (B mark + wordmark + tagline) · ต้นฉบับ 801×276 คมชัด */}
          { }
          <img src="/benjamin-logo.png" alt="Benjamin — Pre-Engineered Building" width={801} height={276} className="h-16 w-auto self-start select-none" />

          {/* Badge */}
          <div>
            <span className="inline-flex rounded-full bg-[#dbe8f8] px-4 py-2 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-[#1d4ed8]">
              {c.badge}
            </span>
          </div>

          {/* Heading */}
          <div>
            <h1 className="text-[2.1rem] font-extrabold leading-[1.2] tracking-tight text-[#0e2a5c]">
              {c.h1a}
              <br />
              {c.h1b}
            </h1>
            <p className="mt-4 max-w-[28rem] text-[15px] font-medium leading-relaxed text-slate-700">
              {c.intro}
            </p>
          </div>
        </div>

        {/* Features (ล่าง) — ดันชิดล่างด้วย justify-between */}
        <ul className="flex flex-col gap-5">
          {features.map((f) => (
            <li key={f.title} className="flex items-start gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#dbe8f8]">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {f.svg}
                </svg>
              </span>
              <span className="min-w-0 pt-0.5">
                <span className="block text-sm font-bold text-[#0e2a5c]">{f.title}</span>
                <span className="block text-[0.82rem] font-semibold leading-snug text-[#0e2a5c]">{f.desc}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
