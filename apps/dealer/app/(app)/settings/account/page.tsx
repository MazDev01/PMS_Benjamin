"use client";

// ── หน้าจัดการบัญชีเข้าระบบของดีลเลอร์ (แยกจากหน้าตั้งค่ารวม) ──────────────────────
//
// ทำไมต้องแยกหน้า (บอสสั่ง 28 ส.ค. 69):
//   การเปลี่ยนอีเมล/รหัสผ่านคือการแตะ "กุญแจเข้าระบบ" ไม่ใช่ข้อมูลบริษัททั่วไป
//   วางปนอยู่ในหน้าตั้งค่ารวมทำให้ช่องรหัสผ่านเปิดค้างอยู่ทุกครั้งที่เข้ามาแก้เรื่องอื่น
//   ที่นี่ต้องกดเข้ามาโดยตั้งใจ และหน้าจอบอกกติกา/ผลของการเปลี่ยนไว้ครบก่อนกรอก

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ShieldCheck, Lock, Eye } from "lucide-react";
import { useRole } from "@pms/shared/context/RoleContext";
import { DealerAccountForm } from "@pms/shared/components/ui/DealerAccountCard";
import { profile as profileRepo } from "@pms/shared/lib/data";
import { logRepoRead } from "@pms/shared/lib/repoLog";

const กติกา = [
  { ไอคอน: ShieldCheck, ข้อความ: "แก้อีเมล/รหัสผ่านเองได้ 2 ครั้ง — ครั้งที่ 3 เป็นต้นไปต้องให้สำนักงานใหญ่อนุมัติก่อนจึงมีผล" },
  { ไอคอน: Lock, ข้อความ: "ต้องกรอกรหัสผ่านปัจจุบันทุกครั้ง เพื่อยืนยันว่าเป็นเจ้าของบัญชีจริง" },
  // เดิมเขียนว่า "ดูรหัสผ่านของตัวเองไม่ได้" แต่หน้านี้มีปุ่มดูรหัส (บอสสั่งเพิ่ม 1 ก.ย. 69) — ข้อความขัดกับของจริง
  { ไอคอน: Eye, ข้อความ: "ดูรหัสผ่านของตัวเองได้ โดยกรอกเลขยืนยันที่ส่งไปทางอีเมลเข้าระบบ · รหัสต้องยาวอย่างน้อย 8 ตัว ห้ามมีช่องว่าง" },
];

export default function DealerAccountPage() {
  const router = useRouter();
  // มาจากปุ่มไหนในหน้าตั้งค่า (?focus=password|email) — ใช้เน้นก้อนที่ผู้ใช้ตั้งใจจะแก้
  // อ่านจาก window.location แทน useSearchParams เพื่อไม่ต้องครอบ <Suspense> ทั้งหน้า (แพทเทิร์นเดียวกับหน้าอื่น)
  const [focus, setFocus] = useState<"password" | "email" | undefined>();
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("focus");
    if (f === "password" || f === "email") setFocus(f);
  }, []);
  const { session } = useRole();
  // เริ่มว่างไว้ก่อน แล้วเติมจากบัญชีจริง — ห้ามเดาอีเมลตั้งต้นมาโชว์ (เคยโชว์ ryg@dealer.com ทั้งที่บัญชีจริงคนละอัน)
  const [email, setEmail] = useState("");

  // อีเมลที่แสดง = อีเมลของบัญชีจริง (โปรไฟล์ผู้ใช้) — ไม่ใช่อีเมลบริษัทในหน้าตั้งค่า
  useEffect(() => {
    profileRepo.get()
      .then(p => { if (p?.email) setEmail(p.email); })
      .catch(e => logRepoRead("profile.get", e));
  }, []);

  return (
    <div className="erp">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button onClick={() => router.push("/settings")} className="btn btn-secondary btn-sm">
          <ArrowLeft size={13} /> กลับไปหน้าตั้งค่า
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden", maxWidth: 860 }}>
        {/* หัวการ์ดสีเข้ม — บอกให้รู้ว่ากำลังอยู่ในส่วนที่แตะกุญแจเข้าระบบ */}
        <div style={{ background: "linear-gradient(135deg,#003366 0%,#00284F 60%,#001B36 100%)", padding: "18px 20px",
          display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,.14)",
            border: "1px solid rgba(255,255,255,.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <ShieldCheck size={18} color="#fff" />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#fff" }}>บัญชีเข้าสู่ระบบ</div>
            <div style={{ fontSize: "0.68rem", color: "rgba(255,255,255,.72)", marginTop: 3 }}>
              {session.dealerName ?? ""} · รหัสดีลเลอร์ {session.dealerCode}
            </div>
          </div>
        </div>

        <div style={{ padding: 20 }}>
          {/* กติกาอยู่ก่อนช่องกรอกเสมอ — ผู้ใช้ต้องรู้ผลก่อนเปลี่ยน ไม่ใช่ไปเจอตอนกดบันทึก */}
          <div style={{ background: "#F8FAFC", border: "1px solid #E7EDF4", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
            {กติกา.map(({ ไอคอน: Ico, ข้อความ }, i) => (
              <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "5px 0", fontSize: "0.72rem", color: "#475569" }}>
                <Ico size={13} color="#94A3B8" style={{ marginTop: 2, flexShrink: 0 }} />
                <span>{ข้อความ}</span>
              </div>
            ))}
          </div>

          <DealerAccountForm dealerCode={session.dealerCode} currentEmail={email} focus={focus} />
        </div>
      </div>
    </div>
  );
}
