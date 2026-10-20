"use client";

// ── บัญชีเข้าระบบของดีลเลอร์ — สรุปในหน้าตั้งค่า + ฟอร์มแก้ในหน้าแยก ───────────────
//
// กติกา (บังคับจริงที่เซิร์ฟเวอร์ ไม่ใช่แค่ซ่อนปุ่ม):
//   • แก้อีเมล/รหัสผ่านเองได้ 2 ครั้งตลอดอายุบัญชี
//   • ครั้งที่ 3 เป็นต้นไป กดบันทึกแล้วกลายเป็น "คำขอ" ที่ยังไม่มีผล จนกว่าสำนักงานใหญ่จะอนุมัติ
//   • ทุกครั้งที่เปลี่ยน สำนักงานใหญ่เห็นในบันทึกการใช้งาน
//
// • ดีลเลอร์ดูรหัสผ่านของตัวเองได้ เมื่อกรอกเลขยืนยันที่ส่งไปทางอีเมล (บอสสั่ง 1 ก.ย. 69 — ทับกติกา 28 ส.ค. ที่ห้ามดู)
// • คำขอที่ถูกปฏิเสธต้องแสดงให้ดีลเลอร์เห็น (state.lastRejected) — ไม่ใช่คำขอหายเงียบ
// ⚠️ การแก้ไม่อยู่ในหน้าตั้งค่ารวม — ต้องกดเข้าหน้าบัญชีแยก ให้เป็นการตั้งใจ ไม่ใช่เผลอแก้
//    ระหว่างแก้ข้อมูลบริษัท และหน้าจอที่เปิดค้างไว้จะไม่มีช่องรหัสผ่านทิ้งไว้ให้ใครมากรอก

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Mail, Lock, ShieldCheck, Clock, ChevronRight } from "lucide-react";
import { account } from "@pms/shared/lib/data";
import type { AccountState } from "@pms/shared/lib/data/ports";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";
import { sbSignOutLocal } from "@pms/shared/lib/supabaseAuth";
import { fmtISOToThai } from "@pms/shared/lib/mock";

const กล่อง: React.CSSProperties = {
  background: "#F8FAFC", border: "1px solid #E7EDF4", borderRadius: 12, padding: "12px 14px",
};

/** โหลดสถานะบัญชีของสาขา — ใช้ทั้งหน้าสรุปและหน้าแก้ */
function useAccountState(dealerCode: string, currentEmail: string) {
  const [state, setState] = useState<AccountState | null>(null);
  const [โหลดพลาด, setโหลดพลาด] = useState("");
  const โหลด = useCallback(() => {
    account.state(dealerCode)
      .then(s => { setState(s); setโหลดพลาด(""); })
      // อ่านสถานะไม่ได้ = ยังบอกไม่ได้ว่าเหลือสิทธิ์กี่ครั้ง → บอกเหตุผลตรงนั้น ไม่ใช่ค้างที่ "กำลังอ่าน…"
      .catch(e => setโหลดพลาด(friendlyError(e)));
  }, [dealerCode]);
  useEffect(โหลด, [โหลด]);
  return { state, โหลดพลาด, โหลด, email: state?.email || currentEmail };
}

/* ── 1) หน้าตั้งค่า: สรุปบัญชี + ทางเข้าไปจัดการ (หน้าตาตามตัวอย่างที่บอสส่งมา 28 ส.ค. 69) ──
   ⚠️ ใส่เฉพาะเรื่องที่ระบบทำได้จริง — ในตัวอย่างมีการ์ด "ยืนยันตัวตนสองขั้นตอน (2FA)" ·
      "อุปกรณ์ที่เชื่อมต่อ" · "ประวัติการเข้าสู่ระบบ" ซึ่งระบบนี้ยังไม่มีของจริงรองรับ
      ถ้าวางไว้ให้ครบตามภาพจะได้ปุ่มที่กดแล้วไม่มีอะไรเกิดขึ้น (หรือแย่กว่า: ผู้ใช้เชื่อว่าเปิด 2FA แล้ว
      ทั้งที่ไม่มี) จึงใส่เท่าที่มีจริงไว้ก่อน แล้วค่อยเติมเมื่อทำของจริงเสร็จ */
function ไทล์({ ไอคอน: Ico, หัวข้อ, รอง, onClick }: {
  ไอคอน: React.ComponentType<{ size?: number; color?: string }>;
  หัวข้อ: string; รอง: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
        background: "#fff", border: "1px solid #E7EDF4", borderRadius: 12, padding: "13px 14px",
        cursor: "pointer", fontFamily: "inherit" }}>
      <span style={{ width: 34, height: 34, borderRadius: 10, background: "#EEF4FB", display: "flex",
        alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Ico size={15} color="#003366" />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#1F2937" }}>{หัวข้อ}</span>
        <span style={{ display: "block", fontSize: "0.68rem", color: "#64748B", marginTop: 2 }}>{รอง}</span>
      </span>
      <ChevronRight size={15} color="#94A3B8" />
    </button>
  );
}

export function DealerAccountSummary({ dealerCode, currentEmail, onOpen }: {
  dealerCode: string; currentEmail: string; onOpen: () => void;
}) {
  const { state, โหลดพลาด, email } = useAccountState(dealerCode, currentEmail);
  const เหลือ = state ? Math.max(0, state.selfChangesLimit - state.selfChangesUsed) : null;
  const เตือน = !!โหลดพลาด || !!state?.pending;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, borderTop: "1px solid #f1f5f9", paddingTop: 18, marginBottom: 12 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: "#003366", display: "flex",
          alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <ShieldCheck size={16} color="#fff" />
        </span>
        <span>
          <span style={{ display: "block", fontSize: "0.88rem", fontWeight: 800, color: "#1F2937" }}>ข้อมูลบัญชี</span>
          <span style={{ display: "block", fontSize: "0.68rem", color: "#64748B", marginTop: 1 }}>จัดการข้อมูลบัญชีและการเข้าสู่ระบบของคุณ</span>
        </span>
      </div>

      {/* บัญชีที่ใช้งานอยู่ — อีเมลอย่างเดียว (รหัสผ่านดูไม่ได้) + ทางเข้าไปเปลี่ยน */}
      <div style={{ ...กล่อง, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid #E7EDF4" }}>
          <Lock size={14} color="#64748B" />
          <span>
            <span style={{ display: "block", fontSize: "0.8rem", fontWeight: 800, color: "#1F2937" }}>บัญชีที่ใช้งานอยู่ตอนนี้</span>
            <span style={{ display: "block", fontSize: "0.66rem", color: "#64748B", marginTop: 1 }}>ตรวจสอบบัญชีและจัดการการเข้าสู่ระบบ</span>
          </span>
        </div>
        {/* อีเมลกับปุ่มอยู่บรรทัดเดียวกัน (บอสสั่ง 28 ส.ค. 69) — จอแคบค่อยตกลงมาซ้อนกันเอง */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 12, alignItems: "center", padding: 14, background: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: "#EEF4FB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Mail size={15} color="#003366" />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: "0.66rem", color: "#64748B" }}>อีเมลเข้าสู่ระบบ</span>
              <span style={{ display: "block", fontSize: "0.84rem", fontWeight: 800, color: email ? "#1F2937" : "#94A3B8",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email || "—"}</span>
            </span>
          </div>
          {/* ปุ่มเดียว — ทางเข้าอยู่ติดกับสิ่งที่จะไปแก้ (แยกสองปุ่มไม่ช่วย เพราะกดแล้วไปหน้าเดียวกัน) */}
          <div>
        <ไทล์ ไอคอน={KeyRound} หัวข้อ="เปลี่ยนอีเมล / รหัสผ่าน"
          รอง={เหลือ === 0 ? "ใช้สิทธิ์แก้เองครบแล้ว — ครั้งต่อไปต้องขออนุมัติจากสำนักงานใหญ่"
            : เหลือ == null ? "อัปเดตบัญชีเข้าสู่ระบบเพื่อความปลอดภัย"
            : `อัปเดตบัญชีเข้าสู่ระบบ · แก้เองได้อีก ${เหลือ} ครั้ง`}
          onClick={onOpen} />
          </div>
        </div>
      </div>

      {/* แถบสถานะบัญชี — เขียวเมื่อปกติ · เหลืองเมื่อมีคำขอค้างหรือตรวจสอบสถานะไม่ได้ */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 12, borderRadius: 12, padding: "11px 13px",
        background: เตือน ? "#FFFBEB" : "#ECFDF5", border: `1px solid ${เตือน ? "#FDE68A" : "#A7F3D0"}` }}>
        <ShieldCheck size={15} color={เตือน ? "#B45309" : "#059669"} style={{ marginTop: 1, flexShrink: 0 }} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: "0.76rem", fontWeight: 800, color: เตือน ? "#92400E" : "#047857" }}>
            {โหลดพลาด ? "ตรวจสอบสถานะบัญชีไม่ได้"
              : state?.pending ? "มีคำขอเปลี่ยนบัญชีรอสำนักงานใหญ่อนุมัติ"
              : "บัญชีของคุณปลอดภัย"}
          </span>
          <span style={{ display: "block", fontSize: "0.68rem", color: "#475569", marginTop: 2 }}>
            {โหลดพลาด ? โหลดพลาด
              : state?.pending ? "การเปลี่ยนจะมีผลเมื่อได้รับอนุมัติ — ระหว่างนี้ใช้อีเมล/รหัสเดิมเข้าระบบได้ตามปกติ"
              : "อย่าเปิดเผยรหัสผ่านให้ผู้อื่น และเปลี่ยนรหัสผ่านสม่ำเสมอ"}
          </span>
        </span>
      </div>
    </>
  );
}

/* ── 2) หน้าจัดการบัญชี — แยกเป็น "เปลี่ยนรหัสผ่าน" กับ "เปลี่ยนอีเมล" คนละก้อน ──────
   บอสสั่ง 28 ส.ค. 69: แยกสองเรื่องออกจากกัน และให้รหัสผ่านมาก่อนอีเมล
   เหตุผลเชิงใช้งาน: ฟอร์มเดียวที่มีทั้งสองอย่างทำให้ต้องอ่านก่อนว่าช่องไหนบังคับ
   และเผลอส่งอีเมลใหม่ไปพร้อมกับรหัสโดยไม่ตั้งใจได้ · แยกแล้วแต่ละปุ่มทำเรื่องเดียวชัด ๆ */

/** กล่องหัวข้อของแต่ละเรื่อง (รหัสผ่าน / อีเมล) */
function ก้อน({ ไอคอน: Ico, หัวข้อ, รอง, children, เน้น }: {
  ไอคอน: React.ComponentType<{ size?: number; color?: string }>;
  หัวข้อ: string; รอง: string; children: React.ReactNode; เน้น?: boolean;
}) {
  return (
    <section style={{ border: `1px solid ${เน้น ? "#BFD4EA" : "#E7EDF4"}`, borderRadius: 14, overflow: "hidden",
      marginBottom: 14, boxShadow: เน้น ? "0 0 0 3px rgba(0,51,102,.06)" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "#F8FAFC", borderBottom: "1px solid #E7EDF4" }}>
        <span style={{ width: 32, height: 32, borderRadius: 10, background: "#EEF4FB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Ico size={15} color="#003366" />
        </span>
        <span>
          <span style={{ display: "block", fontSize: "0.82rem", fontWeight: 800, color: "#1F2937" }}>{หัวข้อ}</span>
          <span style={{ display: "block", fontSize: "0.67rem", color: "#64748B", marginTop: 1 }}>{รอง}</span>
        </span>
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </section>
  );
}

export function DealerAccountForm({ dealerCode, currentEmail, focus }: {
  dealerCode: string; currentEmail: string;
  /** มาจากปุ่มไหนในหน้าตั้งค่า — ใช้เน้นก้อนที่ผู้ใช้ตั้งใจจะแก้ */
  focus?: "password" | "email";
}) {
  const { state, โหลดพลาด, โหลด, email: อีเมลปัจจุบัน } = useAccountState(dealerCode, currentEmail);

  // แต่ละก้อนถือรหัสผ่านปัจจุบันของตัวเอง — กรอกที่ก้อนไหนใช้กับก้อนนั้น ไม่ข้ามกัน
  const [pwCurrent, setPwCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [emailCurrent, setEmailCurrent] = useState("");
  // ช่อง "อีเมลใหม่" ต้องว่างเสมอ (บอสสั่ง 28 ส.ค. 69) — อีเมลปัจจุบันแสดงอยู่ในกล่องด้านบนแล้ว
  // เติมค่าเดิมมาให้ = ผู้ใช้ต้องมาลบทิ้งก่อนพิมพ์ และดูไม่ออกว่านี่คือ "ของใหม่" หรือ "ของเดิม"
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<"" | "password" | "email">("");
  const [msgPw, setMsgPw] = useState<{ ok: boolean; text: string } | null>(null);
  const [msgEmail, setMsgEmail] = useState<{ ok: boolean; text: string } | null>(null);

  // ปุ่ม "ดูรหัสผ่าน" (ขอเลขยืนยันทางอีเมลล็อกอิน) เอาออกแล้ว — ระบบอีเมลล็อกอินปิด (ใบ 0213) · บอสตัดสิน 20 ต.ค. 69
  //   ลืมรหัสผ่าน = ติดต่อสำนักงานใหญ่ · HQ ดูรหัสให้ได้ที่หน้ารายละเอียดดีลเลอร์ (DealerCredentialsCard)

  const เหลือ = state ? Math.max(0, state.selfChangesLimit - state.selfChangesUsed) : null;
  const ต้องขออนุมัติ = เหลือ === 0;
  const มีคำขอค้าง = !!state?.pending;
  const ล็อก = !!busy || มีคำขอค้าง || !!โหลดพลาด;
  const ปุ่ม = ต้องขออนุมัติ ? "ส่งคำขอ" : "บันทึก";

  async function เปลี่ยนรหัสผ่าน() {
    setMsgPw(null);
    if (!pw) { setMsgPw({ ok: false, text: "ยังไม่ได้กรอกรหัสผ่านใหม่" }); return; }
    if (pw !== pw2) { setMsgPw({ ok: false, text: "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน" }); return; }
    if (!pwCurrent) { setMsgPw({ ok: false, text: "ต้องกรอกรหัสผ่านปัจจุบันเพื่อยืนยันตัวตน" }); return; }
    setBusy("password");
    try {
      const r = await account.change({ dealerCode, currentPassword: pwCurrent, password: pw });
      setPw(""); setPw2(""); setPwCurrent("");
      // ── เปลี่ยนรหัสผ่านสำเร็จ = ใบผ่านเดิมถูกยกเลิกทันที (ระบบยืนยันตัวตนทำให้เอง) ──
      //
      // ถ้าอยู่หน้าเดิมต่อ จะกลายเป็น "ล็อกอินค้างแบบผี": หน้าจอยังเหมือนเข้าระบบอยู่
      //   เดินไปหน้าอื่นได้ แต่ทุกคำขอข้อมูลถูกปฏิเสธ 401 เงียบ ๆ ตารางจึงว่างโดยไม่มีคำอธิบาย
      //   (พิสูจน์ด้วยเบราว์เซอร์จริง 1 ก.ย. 69 — กดบันทึกแล้วหน้าขึ้น 401 ทันทีในคอนโซล)
      // จึงต้องพาไปเข้าสู่ระบบใหม่ด้วยรหัสใหม่ · เฉพาะตอนที่ "มีผลแล้วจริง"
      //   ถ้าเป็นแค่คำขอรออนุมัติ (ครั้งที่ 3 เป็นต้นไป) รหัสยังไม่เปลี่ยน ใบผ่านเดิมยังใช้ได้ตามปกติ
      // (โหมดข้อมูลตัวอย่างไม่มีระบบยืนยันตัวตนจริง จึงไม่ต้องเด้งออก)
      if (r.applied && REAL_BACKEND) {
        setMsgPw({ ok: true, text: `${r.message} — กำลังพาไปเข้าสู่ระบบใหม่ด้วยรหัสผ่านใหม่` });
        setTimeout(() => {
          // ต้องเป็น "ล้างในเครื่อง" — ใบผ่านถูกยกเลิกไปแล้ว สั่งออกที่เซิร์ฟเวอร์จะได้ 403
          //   แล้วของในเครื่องไม่ถูกล้าง ผู้ใช้กดย้อนกลับเข้าหน้าเดิมได้ทั้งที่ใช้งานจริงไม่ได้
          // แล้วลบใบผ่านที่ค้างในเครื่องด้วยมืออีกชั้น: วัดจริงแล้วพบว่าหลังเปลี่ยนรหัส
          //   ตัวต่ออายุใบผ่านอัตโนมัติของไลบรารียังทำงานอยู่และเขียนคีย์กลับลงมาใหม่
          //   ถ้าเหลือคีย์ไว้ หน้าถัดไปจะเข้าใจว่ายังล็อกอินอยู่ แล้วกลายเป็นล็อกอินค้างแบบผีเหมือนเดิม
          void sbSignOutLocal().finally(() => {
            try {
              Object.keys(localStorage)
                .filter(k => k.startsWith("sb-") && k.endsWith("-auth-token"))
                .forEach(k => localStorage.removeItem(k));
            } catch { /* เบราว์เซอร์ปิด storage — ยังไงก็ต้องพาไปหน้าเข้าสู่ระบบ */ }
            window.location.href = "/login";
          });
        }, 1800);
        return;
      }
      setMsgPw({ ok: true, text: r.message });
      โหลด();
    } catch (e) { setMsgPw({ ok: false, text: friendlyError(e) }); }
    finally { setBusy(""); }
  }

  async function เปลี่ยนอีเมล() {
    setMsgEmail(null);
    const ใหม่ = email.trim();
    if (!ใหม่ || ใหม่.toLowerCase() === อีเมลปัจจุบัน.toLowerCase()) {
      setMsgEmail({ ok: false, text: ใหม่ ? "อีเมลนี้เป็นอีเมลเดิมอยู่แล้ว" : "ยังไม่ได้กรอกอีเมลใหม่" }); return;
    }
    if (!emailCurrent) { setMsgEmail({ ok: false, text: "ต้องกรอกรหัสผ่านปัจจุบันเพื่อยืนยันตัวตน" }); return; }
    setBusy("email");
    try {
      const r = await account.change({ dealerCode, currentPassword: emailCurrent, email: ใหม่ });
      setMsgEmail({ ok: true, text: r.message });
      setEmail(""); setEmailCurrent("");
      โหลด();
      // อีเมลเข้าระบบเปลี่ยนแล้ว = ชื่อบัญชีที่โชว์อยู่ทั้งหน้า (หัวจอ/เมนู) ยังเป็นของเก่า
      // บอสสั่ง 1 ก.ย. 69: ให้รีหน้าตัวเองอัตโนมัติหนึ่งครั้งหลังเปลี่ยนอะไรก็ตาม
      // (เปลี่ยนรหัสผ่านไม่ต้องรีที่นี่ — ทางนั้นพาไปหน้าเข้าสู่ระบบใหม่อยู่แล้ว)
      if (r.applied) setTimeout(() => { try { window.location.reload(); } catch { /* SSR */ } }, 1400);
    } catch (e) { setMsgEmail({ ok: false, text: friendlyError(e) }); }
    finally { setBusy(""); }
  }

  return (
    <>
      {/* บัญชีที่ใช้อยู่ — อีเมล + รหัสผ่าน (ซ่อน) */}
      <div style={{ ...กล่อง, marginBottom: 14 }}>
        <div style={{ fontSize: "0.62rem", fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
          บัญชีที่ใช้อยู่ตอนนี้
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: "0.78rem" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748B" }}><Mail size={14} color="#94A3B8" /> อีเมลเข้าสู่ระบบ</span>
          <span style={{ fontWeight: 700, color: อีเมลปัจจุบัน ? "#1F2937" : "#94A3B8" }}>{อีเมลปัจจุบัน || "—"}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, fontSize: "0.78rem", borderTop: "1px solid #F1F5F9", marginTop: 8, paddingTop: 10 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748B" }}><Lock size={14} color="#94A3B8" /> รหัสผ่าน</span>
          {/* ปุ่ม "ดูรหัสผ่าน" (ส่งเลขยืนยันทางอีเมลล็อกอิน) เอาออก — ระบบอีเมลล็อกอินปิดแล้ว (ใบ 0213) · บอสตัดสิน 20 ต.ค. 69
              ลืมรหัสผ่าน = ติดต่อสำนักงานใหญ่ (HQ ดูรหัสให้ได้ที่หน้ารายละเอียดดีลเลอร์) */}
          <span style={{ fontWeight: 700, color: "#94A3B8", letterSpacing: "0.12em" }}>••••••••</span>
        </div>
        <div style={{ fontSize: "0.7rem", color: "#64748B", marginTop: 8 }}>
          ลืมรหัสผ่าน ติดต่อสำนักงานใหญ่
        </div>
      </div>

      {/* สิทธิ์ที่เหลือ — ใช้ร่วมกันทั้งสองก้อน (โควตานับรวมกัน) */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.7rem", marginBottom: 14,
        color: โหลดพลาด || ต้องขออนุมัติ ? "#b45309" : "#64748B" }}>
        {โหลดพลาด || ต้องขออนุมัติ ? <ShieldCheck size={12} /> : <Lock size={12} />}
        {โหลดพลาด ? โหลดพลาด
          : state == null ? "กำลังอ่านสถานะบัญชี…"
          : ต้องขออนุมัติ
            ? "ใช้สิทธิ์แก้เองครบแล้ว — การเปลี่ยนครั้งต่อไปต้องรอสำนักงานใหญ่อนุมัติก่อนจึงมีผล"
            : `แก้อีเมล/รหัสผ่านเองได้อีก ${เหลือ} ครั้ง (นับรวมกันทั้งสองอย่าง) · ทุกครั้งที่เปลี่ยน สำนักงานใหญ่จะเห็น`}
      </div>

      {มีคำขอค้าง && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#FFFBEB", border: "1px solid #FDE68A",
          borderRadius: 10, padding: "10px 12px", fontSize: "0.72rem", color: "#92400E", marginBottom: 14 }}>
          <Clock size={13} />
          <span>
            ส่งคำขอเปลี่ยนบัญชีให้สำนักงานใหญ่แล้ว ({fmtISOToThai(String(state?.pending?.requestedAt ?? "").slice(0, 10))})
            — รอผลอนุมัติ ยังใช้อีเมล/รหัสเดิมเข้าระบบได้ตามปกติ
          </span>
        </div>
      )}

      {/* คำขอล่าสุดถูกปฏิเสธ — ดีลเลอร์ต้องรู้ผล ไม่ใช่คำขอหายไปเฉย ๆ (หน้าอนุมัติฝั่ง HQ บอกไว้ว่าดีลเลอร์จะเห็น) */}
      {!มีคำขอค้าง && state?.lastRejected && (
        <div role="status" style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "#FEF2F2", border: "1px solid #FECACA",
          borderRadius: 10, padding: "10px 12px", fontSize: "0.72rem", color: "#991B1B", marginBottom: 14 }}>
          <ShieldCheck size={13} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>
            คำขอเปลี่ยน{state.lastRejected.kind === "email" ? "อีเมลเข้าระบบ" : state.lastRejected.kind === "password" ? "รหัสผ่าน" : "อีเมลและรหัสผ่าน"}
            {" "}ที่ส่งเมื่อ {fmtISOToThai(String(state.lastRejected.requestedAt).slice(0, 10))} ถูกสำนักงานใหญ่ปฏิเสธ
            {state.lastRejected.reason ? ` — เหตุผล: ${state.lastRejected.reason}` : ""}
            {" "}· บัญชียังเป็นแบบเดิม ส่งคำขอใหม่ได้
          </span>
        </div>
      )}

      {/* อีเมลอยู่บน แล้วค่อยรหัสผ่าน (บอสสั่ง 28 ส.ค. 69) */}
      <ก้อน ไอคอน={Mail} หัวข้อ="เปลี่ยนอีเมลเข้าสู่ระบบ" รอง="อีเมลนี้ใช้เข้าระบบและรับการติดต่อจากสำนักงานใหญ่" เน้น={focus === "email"}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <div>
            <label className="form-label">อีเมลเข้าสู่ระบบใหม่</label>
            <input className="form-input" value={email} disabled={ล็อก}
              onChange={e => setEmail(e.target.value.replace(/\s/g, ""))}
              aria-label="อีเมลเข้าสู่ระบบ" placeholder={อีเมลปัจจุบัน ? `เช่น ${อีเมลปัจจุบัน}` : "name@company.co.th"} />
          </div>
          <div>
            <label className="form-label">รหัสผ่านปัจจุบัน *</label>
            <input className="form-input" type="password" value={emailCurrent} disabled={ล็อก}
              onChange={e => setEmailCurrent(e.target.value.replace(/\s/g, ""))} aria-label="รหัสผ่านปัจจุบัน (ยืนยันการเปลี่ยนอีเมล)"
              placeholder="ยืนยันตัวตนก่อนเปลี่ยน" autoComplete="current-password" />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary btn-md" disabled={ล็อก} onClick={เปลี่ยนอีเมล}>
            <Mail size={13} /> {ปุ่ม}อีเมลใหม่
          </button>
          {msgEmail && <span style={{ fontSize: "0.74rem", fontWeight: 600, color: msgEmail.ok ? "#059669" : "#dc2626" }}>{msgEmail.text}</span>}
        </div>
      </ก้อน>
      <ก้อน ไอคอน={KeyRound} หัวข้อ="เปลี่ยนรหัสผ่าน" รอง="ตั้งรหัสผ่านใหม่ — ต้องยืนยันด้วยรหัสผ่านปัจจุบัน" เน้น={focus === "password"}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <div>
            <label className="form-label">รหัสผ่านปัจจุบัน *</label>
            <input className="form-input" type="password" value={pwCurrent} disabled={ล็อก}
              onChange={e => setPwCurrent(e.target.value.replace(/\s/g, ""))} aria-label="รหัสผ่านปัจจุบัน"
              placeholder="ยืนยันตัวตนก่อนเปลี่ยน" autoComplete="current-password" />
          </div>
          <div>
            <label className="form-label">รหัสผ่านใหม่</label>
            <input className="form-input" type="password" value={pw} disabled={ล็อก}
              onChange={e => setPw(e.target.value.replace(/\s/g, ""))} aria-label="รหัสผ่านใหม่"
              placeholder="อย่างน้อย 8 ตัวอักษร" autoComplete="new-password" />
          </div>
          <div>
            <label className="form-label">ยืนยันรหัสผ่านใหม่</label>
            <input className="form-input" type="password" value={pw2} disabled={ล็อก}
              onChange={e => setPw2(e.target.value.replace(/\s/g, ""))} aria-label="ยืนยันรหัสผ่านใหม่"
              placeholder="พิมพ์รหัสใหม่อีกครั้ง" autoComplete="new-password" />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary btn-md" disabled={ล็อก} onClick={เปลี่ยนรหัสผ่าน}>
            <KeyRound size={13} /> {ปุ่ม}รหัสผ่านใหม่
          </button>
          {msgPw && <span style={{ fontSize: "0.74rem", fontWeight: 600, color: msgPw.ok ? "#059669" : "#dc2626" }}>{msgPw.text}</span>}
        </div>
      </ก้อน>

    </>
  );
}
