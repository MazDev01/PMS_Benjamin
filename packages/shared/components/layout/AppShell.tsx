"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { FilterProvider } from "@pms/shared/context/FilterContext";
import { useRole } from "@pms/shared/context/RoleContext";
import { useImpersonating, clearImpersonation } from "@pms/shared/lib/useImpersonating";
import { useSales } from "@pms/shared/context/SalesContext";
import { purgeOldDealerKeys } from "@pms/shared/lib/mock";
import { REPO_SAVE_ERROR_EVENT } from "@pms/shared/lib/useRepoState";
import { REPO_READ_ERROR_EVENT } from "@pms/shared/lib/repoLog";

// แถบเตือนขึ้นค้างอยู่กี่วินาทีก่อนหายเอง — ข้อความไทยยาวสุดในระบบอ่านจบใน ~6 วิ เผื่อไว้เล็กน้อย
const ALERT_MS = 8000;

// แถบเตือน "บันทึกไม่สำเร็จ" (C1) — การเขียนเป็น optimistic
// ถ้าไม่แจ้ง ผู้ใช้จะเข้าใจว่าบันทึกแล้วทั้งที่ DB ปฏิเสธ (เช่น RLS/เน็ตหลุด)
// บอสสั่ง (14 ส.ค. 69): ให้ขึ้นแป๊บเดียวแล้วหายเอง และอยู่เฉพาะหน้าที่กด ไม่ตามไปโผล่หน้าอื่น
//   — ข้อความพวกนี้เป็นผลของ "สิ่งที่เพิ่งกดในหน้านี้" ไม่ใช่สถานะค้างของทั้งแอป
function SyncErrorBar() {
  const { syncError, clearSyncError } = useSales();
  const pathname = usePathname();
  // ข้อมูลระดับเครือ (ทะเบียนดีลเลอร์/แคตตาล็อก/ตั้งค่า) บันทึกผ่าน useRepoState คนละทางกับงานขาย
  // แต่ต้องเตือนที่เดียวกัน — ไม่งั้นลบดีลเลอร์ไม่สำเร็จแล้วผู้ใช้ไม่รู้เลย
  const [repoError, setRepoError] = useState<string | null>(null);
  useEffect(() => {
    const onErr = (e: Event) => setRepoError((e as CustomEvent<string>).detail || "บันทึกไม่สำเร็จ");
    window.addEventListener(REPO_SAVE_ERROR_EVENT, onErr);
    return () => window.removeEventListener(REPO_SAVE_ERROR_EVENT, onErr);
  }, []);

  // หายเองเมื่อครบเวลา
  useEffect(() => {
    if (!syncError) return;
    const t = setTimeout(clearSyncError, ALERT_MS);
    return () => clearTimeout(t);
  }, [syncError, clearSyncError]);
  useEffect(() => {
    if (!repoError) return;
    const t = setTimeout(() => setRepoError(null), ALERT_MS);
    return () => clearTimeout(t);
  }, [repoError]);

  // เปลี่ยนหน้า = ล้างทิ้งทันที (แถบของหน้าเดิมไม่ตามมาหน้าใหม่)
  useEffect(() => { clearSyncError(); setRepoError(null); }, [pathname, clearSyncError]);

  if (repoError && !syncError) {
    return (
      <div role="alert" style={{
        display: "flex", alignItems: "center", gap: 10, margin: "10px 16px 0",
        background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c",
        borderRadius: 10, padding: "10px 14px", fontSize: "0.8rem", fontWeight: 600,
      }}>
        <span style={{ flex: 1 }}>บันทึกไม่สำเร็จ: {repoError} · การเปลี่ยนแปลงยังไม่ถูกบันทึก กรุณาลองใหม่</span>
        <button onClick={() => setRepoError(null)} aria-label="ปิดการแจ้งเตือน"
          style={{ background: "none", border: "none", cursor: "pointer", color: "#b91c1c", fontWeight: 800 }}>✕</button>
      </div>
    );
  }
  if (!syncError) return null;
  return (
    <div role="alert" style={{
      display: "flex", alignItems: "center", gap: 10, margin: "10px 16px 0",
      background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c",
      borderRadius: 10, padding: "10px 14px", fontSize: "0.8rem", fontWeight: 600,
    }}>
      <span style={{ flex: 1 }}>{syncError} · ระบบดึงข้อมูลล่าสุดจากเซิร์ฟเวอร์มาแสดงแทนแล้ว</span>
      <button onClick={clearSyncError} aria-label="ปิดการแจ้งเตือน"
        style={{ background: "none", border: "none", cursor: "pointer", color: "#b91c1c", fontWeight: 800 }}>✕</button>
    </div>
  );
}

// แถบเตือน "โหลดข้อมูลบางส่วนไม่สำเร็จ" — ต้องเห็นทุกหน้า เพราะหลาย hook (useNetworkCustomersForDealer ฯลฯ)
// เดิม catch แล้ว log เงียบๆ ตอนโหลดพัง หน้าจอจึงโชว์ "0 รายการ" เหมือนข้อมูลว่างจริง แยกไม่ออกจาก
// ของจริงที่ยังไม่มีข้อมูล — ผู้ใช้อาจเข้าใจผิดว่าข้อมูลหาย (Critical, พบจากผลตรวจสอบระบบ 30 ก.ค. 69)
// ไม่มี retry ต่อ hook ให้เรียก (มีหลายสิบจุด) — รีเฟรชทั้งหน้าคือทางที่ตรงและเชื่อถือได้สุด
// แถบนี้ไม่หายเอง (ต่างจากแถบแดง) เพราะมันบอกว่า "ตัวเลขที่เห็นอยู่ตรงหน้าอาจไม่ครบ"
//   ซึ่งยังเป็นจริงตราบที่ยังไม่รีเฟรช — แต่ล้างทิ้งเมื่อเปลี่ยนหน้า เพราะหน้าใหม่โหลดข้อมูลชุดใหม่
function ReadErrorBar() {
  const [readError, setReadError] = useState<string | null>(null);
  const pathname = usePathname();
  useEffect(() => {
    const onErr = (e: Event) => setReadError((e as CustomEvent<string>).detail || "โหลดข้อมูลไม่สำเร็จ");
    window.addEventListener(REPO_READ_ERROR_EVENT, onErr);
    return () => window.removeEventListener(REPO_READ_ERROR_EVENT, onErr);
  }, []);
  useEffect(() => { setReadError(null); }, [pathname]);
  if (!readError) return null;
  return (
    <div role="alert" style={{
      display: "flex", alignItems: "center", gap: 10, margin: "10px 16px 0",
      background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e",
      borderRadius: 10, padding: "10px 14px", fontSize: "0.8rem", fontWeight: 600,
    }}>
      <span style={{ flex: 1 }}>โหลดข้อมูลบางส่วนไม่สำเร็จ — ตัวเลขหรือรายการที่เห็นอาจไม่ครบถ้วน</span>
      <button onClick={() => window.location.reload()}
        style={{ background: "none", border: "1px solid #92400e", borderRadius: 6, cursor: "pointer", color: "#92400e", fontWeight: 700, padding: "3px 10px", fontSize: "0.75rem" }}>
        รีเฟรช
      </button>
      <button onClick={() => setReadError(null)} aria-label="ปิดการแจ้งเตือน"
        style={{ background: "none", border: "none", cursor: "pointer", color: "#92400e", fontWeight: 800 }}>✕</button>
    </div>
  );
}

// แถบเตือน "กำลังเข้าระบบแทนโดย HQ" — HQ เปิดแท็บนี้ผ่านลิงก์เข้าระบบแทน (magic-link, ดู
// /api/admin/dealers/impersonate) ต้องมีทางกลับที่ชัดเจน ไม่ใช่ให้ HQ งงว่าจะออกจากบัญชีดีลเลอร์ยังไง
// เก็บสถานะไว้ที่ sessionStorage ของแท็บนี้เท่านั้น — ตั้งใจให้แยกต่อแท็บ
// (ต่างจากใบผ่านเข้าระบบซึ่งอยู่ที่ localStorage ใช้ร่วมกันทุกแท็บ) เพราะการสวมสิทธิ์ดูแทนดีลเลอร์
// เป็นเรื่องของหน้าต่างที่กำลังดูอยู่ ไม่ควรลามไปแท็บอื่นที่เปิดค้างไว้
// เพื่อให้แถบยังอยู่ต่อแม้เปลี่ยนหน้าในแอปดีลเลอร์ ไม่ใช่แค่หน้าแรกที่ query param ?impersonated=1 มาถึง
function ImpersonationBanner() {
  const active = useImpersonating();
  const { logout } = useRole();

  if (!active) return null;

  const backToHQ = () => clearImpersonation(logout);

  return (
    <div role="status" style={{
      display: "flex", alignItems: "center", gap: 10, margin: "10px 16px 0",
      background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8",
      borderRadius: 10, padding: "10px 14px", fontSize: "0.8rem", fontWeight: 600,
    }}>
      <span style={{ flex: 1 }}>กำลังเข้าระบบแทนดีลเลอร์โดยสำนักงานใหญ่ (HQ)</span>
      <button onClick={backToHQ}
        style={{ background: "#1d4ed8", border: "none", borderRadius: 6, cursor: "pointer", color: "#fff", fontWeight: 700, padding: "5px 12px", fontSize: "0.78rem" }}>
        กลับสู่ HQ
      </button>
    </div>
  );
}

// เชลล์ของเวิร์กสเปซ — ถือสถานะเปิด/ปิดเมนูมือถือ (hamburger drawer)
export function AppShell({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();
  // ล้างรายชื่อดีลเลอร์รุ่นเก่าที่ค้างในเครื่อง (ดู HQ_DEALERS_KEY ใน mock.ts) — ทำครั้งเดียวตอนเข้าแอป
  useEffect(() => { purgeOldDealerKeys(); }, []);
  const { isHQ } = useRole(); // เมนู HQ ชื่อยาวกว่า (แดชบอร์ดสำนักงานใหญ่ / ใบเสนอราคาทั้งเครือ) → ขยายแถบข้าง
  return (
    <div className={`app${isHQ ? " app-hq" : ""}`}>
      <Sidebar mobileOpen={navOpen} onNavigate={() => setNavOpen(false)} />
      {navOpen && <div className="nav-overlay" onClick={() => setNavOpen(false)} />}
      <div className="main">
        <Topbar onMenu={() => setNavOpen(o => !o)} />
        <ImpersonationBanner />
        <SyncErrorBar />
        <ReadErrorBar />
        {/* ตัวกรองแยกอิสระต่อหน้า — key+storageKey ต่อ pathname (เปลี่ยนหน้า A ไม่กระทบหน้า B) */}
        <div className="content">
          <FilterProvider key={pathname} storageKey={`bpms_filters:${pathname}`}>
            {children}
          </FilterProvider>
        </div>
      </div>
    </div>
  );
}
