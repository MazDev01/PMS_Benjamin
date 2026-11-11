"use client";
// ── ลิงก์กลางไปข้อมูลอื่น (บอสสั่ง 11 พ.ย. 69) ─────────────────────────────────────────────────────────────────────
//   ทุกชื่อ/เลขที่ที่อ้างถึงข้อมูลอื่น (ตาราง · แผง · หน้าต่าง · การ์ด) ใช้ตัวนี้ตัวเดียว — หน้าตาเหมือนกันทุกที่ (.rec-link:
//   สีน้ำเงิน ขีดเส้นใต้ตอนชี้ เมาส์รูปมือ) · กดลิงก์ในแถว = เปิดตัวที่ลิงก์ ไม่เปิดแผงของแถวซ้อน (หยุดการกดไม่ให้ถึงแถว)
//   ปลายทาง:
//     HQ      ดีลเลอร์ → แผงดีลเลอร์ · ลูกค้า → แผงลูกค้า · ลูกค้าเป้าหมาย → แผงลีด HQ · ผู้สนใจ → แผงผู้สนใจ
//             ใบเสนอราคา → หน้าต่างใบ · ใบ HQ/คำขอ → หน้าต่างคำขอ · ใบค่าแฟรนไชส์ → แผงใบ
//     ดีลเลอร์  ลูกค้า → แผงลูกค้า · ลูกค้าเป้าหมาย → แผงลูกค้าเป้าหมาย · ใบเสนอราคา → หน้าต่างใบ
//             คำขอ/ใบ HQ → แผงลูกค้าเป้าหมายรายนั้นแท็บใบเสนอราคา (บอสตอบ 11 พ.ย. 69)
//             ดีลเลอร์ · ผู้สนใจ · ใบค่าแฟรนไชส์ · ข้อมูลของสาขาอื่น = ข้อความธรรมดา (ไม่มีสิทธิ์)
//   แผงอยู่ในที่อยู่หน้าเว็บ (lib/panelUrl.ts) → ปุ่มย้อนกลับของเบราว์เซอร์ถอยทีละชั้น
import type { CSSProperties, ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentDealer } from "../../lib/useCurrentDealer";
import { ไปเรื่องในหน้าเดียวกัน } from "../../lib/panelUrl";
import { ที่อยู่เรื่อง, type เป้าลิงก์ } from "../../lib/recordLinks";
export { ที่อยู่เรื่อง, เป้าลูกค้าของใบ, type เป้าลิงก์, type ชนิดข้อมูล } from "../../lib/recordLinks";

/** ลิงก์กลาง — ไม่มีที่ให้ไป = ข้อความธรรมดา (ลูกที่ส่งมา) */
/** พื้นเข้ม = หัวหน้าต่าง/หัวแผงพื้นน้ำเงินเข้ม → ลิงก์สีขาวขีดเส้นใต้ (.rec-link-dark · บอสสั่ง 11 พ.ย. 69) */
export function ลิงก์ข้อมูล({ เป้า, children, title, style, testId, พื้นเข้ม }: { เป้า: เป้าลิงก์ | null; children: ReactNode; title?: string; style?: CSSProperties; testId?: string; พื้นเข้ม?: boolean }) {
  const router = useRouter();
  const ฝั่ง = (usePathname() ?? "").startsWith("/hq") ? "hq" : "dealer";
  const สาขาฉัน = useCurrentDealer().code;
  const href = เป้า ? ที่อยู่เรื่อง(เป้า, ฝั่ง, ฝั่ง === "dealer" ? สาขาฉัน : null) : null;
  if (!href || !เป้า) return <span data-rec-plain={เป้า?.ชนิด ?? ""} style={style}>{children}</span>;
  return (
    <a href={href} className={พื้นเข้ม ? "rec-link rec-link-dark" : "rec-link"} data-rec={เป้า.ชนิด} data-rec-id={String(เป้า.รหัส)} data-testid={testId} title={title} style={style}
      onClick={e => {
        e.stopPropagation();   // ไม่ให้ถึงแถว/การ์ดที่ครอบอยู่ (ไม่เปิดแผงแถวซ้อน)
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;   // เปิดแท็บใหม่ได้ตามปกติ
        e.preventDefault();
        if (!ไปเรื่องในหน้าเดียวกัน(href)) router.push(href);
      }}
      onKeyDown={e => e.stopPropagation()}>
      {children}
    </a>
  );
}
