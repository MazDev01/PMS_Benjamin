"use client";

// ── แถบข้าง (UI รอบใหม่ 14 ก.ย. 69 · บอสสั่ง "รี ui ให้ออกแบบตามเว็บตัวอย่าง ยกเว้นสี เอาสีเดิม") ──
//   กว้าง 256px พื้นเทาอ่อน · แดชบอร์ดเดี่ยวบนสุด · หัวกลุ่มเป็นป้ายตัวเล็ก เมนูแสดงครบตลอด
//   ⛔ ห้ามทำหัวกลุ่มเป็นปุ่มพับ/กาง — เคยทำแล้ว บอสสั่งเอาออก ("ไม่เอาดรอปดาวน์แบบนี้ กลับไปเป็นแบบเดิม" 14 ก.ย. 69)
//   ท้ายแถบเป็นการ์ดผู้ใช้ + ปุ่มออกจากระบบ (หรือ "กลับสู่ HQ" ตอนสวมสิทธิ์)
//   รายการเมนู/ลำดับอยู่ที่ navConfig.tsx ที่เดียว
import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, ArrowLeft } from "lucide-react";
import { useRole } from "@pms/shared/context/RoleContext";
import { roleLabelOf } from "@pms/shared/lib/mock";
import { useUserProfile } from "@pms/shared/lib/useUserProfile";
import { useImpersonating, clearImpersonation } from "@pms/shared/lib/useImpersonating";
import { useDealerDisplayName } from "@pms/shared/lib/useCurrentDealer";
import { useAuthReady } from "@pms/shared/lib/useAuthReady";
import { HQ_NAV, DEALER_NAV, isActiveHref } from "./navConfig";

export function Sidebar({ mobileOpen = false, onNavigate }: { mobileOpen?: boolean; onNavigate?: () => void } = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isHQ, session, logout } = useRole();
  // แท็บนี้เปิดมาจากปุ่ม "เข้าระบบแทนดีลเลอร์" ของสำนักงานใหญ่หรือเปล่า
  const สวมสิทธิ์อยู่ = useImpersonating();
  // โปรไฟล์ผ่าน repo — ชื่อ/รูปในการ์ดท้ายแถบอัปเดตทันทีเมื่อบันทึก (แหล่งเดียวกับ Topbar)
  const { profile } = useUserProfile();
  const dealerDisplayName = useDealerDisplayName(); // ชื่อบริษัทที่สาขากรอก → ทะเบียน HQ → รหัสสาขา

  // ── เมนูต้องรอจนรู้ว่าใครล็อกอินอยู่ก่อนเสมอ ────────────────────────────────
  // ⚠️ isHQ มาจาก session ซึ่งค่าเริ่มต้นคือ "สาขาเดโม" — ก่อนรู้ตัวตนจริง แอปสำนักงานใหญ่
  //    จะเรนเดอร์เมนูของ *ดีลเลอร์* ชั่วขณะ แล้ว Next.js ไปดึงหน้าเหล่านั้นล่วงหน้า → 404 เจ็ดครั้งทุกครั้งที่เปิดหน้า
  // ⚠️ เดาจาก URL แทนไม่ได้ — แอปสำนักงานใหญ่มี /dashboard และ /profile ของตัวเองที่ไม่ได้ขึ้นต้นด้วย /hq
  const ready = useAuthReady();

  // prefetch เฉพาะเส้นทางของแอปนี้ — เส้นทางของอีกแอปไม่มีจริง ยิง 404 ซ้ำ ๆ
  useEffect(() => {
    if (!ready) return;
    router.prefetch(isHQ ? "/hq/dashboard" : "/dashboard");
  }, [ready, router, isHQ]);

  const nav = ready ? (isHQ ? HQ_NAV : DEALER_NAV) : [];
  // ชื่อในการ์ดท้ายแถบ = ชื่อเดียวทั้งแอป · ดีลเลอร์ใช้ชื่อบริษัทของสาขา · HQ ใช้ชื่อผู้ใช้
  const displayName = isHQ ? (profile?.name || session.name) : dealerDisplayName;

  return (
    <aside className={`erp-sidebar${mobileOpen ? " open" : ""}`}>
      {/* Brand — แบรนด์ Benjamin เท่านั้นทุกบทบาท (ดีลเลอร์เปลี่ยนโลโก้/แบรนด์เองไม่ได้)
          ไม่มีคำบรรยายใต้ชื่อแบรนด์ (บอสสั่ง 1 ก.ย. 69) · ชื่อหน้าจริง (h1) อยู่ที่หัวหน้าเพจ */}
      <div className="sidebar-brand">
        <div className="brand-mark">
          { }
          <img src="/benjamin-logo-white.png" alt="Benjamin" style={{ width: 26, height: 26, objectFit: "contain", filter: "brightness(0) invert(1)" }} />
        </div>
        <div className="brand-text">
          <div className="brand-name">BENJAMIN</div>
        </div>
      </div>

      <nav aria-label="เมนูหลัก">
        {nav.map(g => {
          if (g.flat) {
            return (
              <div key={g.key} className="nav-section">
                {g.items.map(item => {
                  const active = isActiveHref(pathname, item.href);
                  return (
                    <Link key={item.href} href={item.href} onClick={onNavigate} className={`nav-item nav-flat${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
                      {item.icon}
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {item.badge ? <span className="badge-mini">{item.badge}</span> : null}
                    </Link>
                  );
                })}
              </div>
            );
          }
          return (
            <div key={g.key} className="nav-section">
              <div className="nav-label">{g.group}</div>
              {g.items.map(item => {
                const active = isActiveHref(pathname, item.href);
                return (
                  <Link key={item.href} href={item.href} onClick={onNavigate} className={`nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
                    {item.icon}
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {item.badge ? <span className="badge-mini">{item.badge}</span> : null}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* ท้ายแถบ — การ์ดผู้ใช้ + ปุ่มออก (HQ=ผู้ใช้ · ดีลเลอร์=บัญชีดีลเลอร์)
          สวมสิทธิ์จากสำนักงานใหญ่ = ปุ่มเป็น "กลับสู่ HQ" (บอสสั่ง 20 ส.ค. 69) — ล้างใบผ่านของดีลเลอร์ในแท็บนี้ให้ด้วย */}
      <div className="sidebar-footer" style={{ padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 8px 10px 10px", borderRadius: 12, background: "rgba(0,51,102,.05)", border: "1px solid rgba(0,51,102,.08)" }}>
          {profile?.avatar
            ? <img src={profile.avatar} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
            : <span style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, background: "var(--primary)", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.85rem", fontWeight: 800 }}>
                {(displayName || "?").trim().charAt(0)}
              </span>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={displayName}>{displayName}</div>
            <div style={{ fontSize: "0.68rem", color: "var(--muted-foreground)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{roleLabelOf(session.role, isHQ)}</div>
          </div>
          {สวมสิทธิ์อยู่ ? (
            <button type="button" onClick={() => clearImpersonation(logout)} aria-label="กลับสู่ HQ" title="กลับสู่ HQ"
              style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 9, border: "1px solid #bfdbfe", background: "#fff", color: "#1d4ed8", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <ArrowLeft size={15} />
            </button>
          ) : (
            <button type="button" onClick={logout} aria-label="ออกจากระบบ" title="ออกจากระบบ"
              style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 9, border: "1px solid var(--border)", background: "#fff", color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <LogOut size={15} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
