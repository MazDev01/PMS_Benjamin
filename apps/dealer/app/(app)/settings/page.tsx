"use client";

import { TopbarActions } from "@pms/shared/components/layout/TopbarActions";
import { ModalCard } from "@pms/shared/components/ui/ModalCard";
import { ModalPortal } from "@pms/shared/components/ui/ModalPortal";
import { ยืนยัน, แจ้งพลาด } from "@pms/shared/components/ui/ConfirmToast";
import { useState, useRef, useEffect, createContext, useContext, useCallback, useMemo } from "react";
import {
  Building2, Plus, Pencil, Trash2, X, Check, Save, RotateCcw,
  Upload, UserCheck, FileText, ShieldCheck, Lock, ImagePlus, Bell,
  Camera, Scale,
} from "lucide-react";
import { NOTIF_META, NOTIF_PREFS_EVENT, DEFAULT_NOTIF_PREFS, defaultProfileEmail, PROFILE_UPDATED_EVENT, leadRulesOf, DEFAULT_LEAD_RULES, QUOTE_PREFIX, quoteNoPrefix, type UserProfile, type NotifPrefs, type ResponsiblePerson, type LeadRules } from "@pms/shared/lib/mock";
import { formatPhone, formatTaxId } from "@pms/shared/lib/format";
import { useHQPolicy } from "@pms/shared/lib/useHQConfig";
import { useDealerSettings } from "@pms/shared/lib/useDealerSettings";
import { useUserProfile } from "@pms/shared/lib/useUserProfile";
import { useCurrentDealer } from "@pms/shared/lib/useCurrentDealer";
import { NumberInput } from "@pms/shared/components/ui/NumberInput";
import { markupPctOf } from "@pms/shared/lib/boq";
import { useRouter } from "next/navigation";
import { DealerAccountSummary } from "@pms/shared/components/ui/DealerAccountCard";
import { settings as settingsRepo, persons as personsRepo } from "@pms/shared/lib/data";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { useOverlayClose } from "@pms/shared/lib/useOverlayClose";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { useRole } from "@pms/shared/context/RoleContext";
import { fileToResizedDataURL } from "@pms/shared/lib/imageResize";
import { useUnsavedGuard } from "@pms/shared/lib/useUnsavedGuard";

// ป้ายตำแหน่งตาม role (ใช้ในบัญชีดีลเลอร์)
const ROLE_LABEL: Record<string, string> = {
  HQ_MANAGEMENT: "ผู้บริหารสำนักงานใหญ่", DEALER_ADMIN: "ผู้จัดการดีลเลอร์", DEALER_SALES: "เซลส์", DEALER_SITE: "เซลส์ภาคสนาม",
};

type SettingTab = "company" | "documents" | "persons" | "notifications";

// ── shared save bus — แท็บที่มีฟอร์มรายงาน {dirty,save,reset} ให้ปุ่มบันทึกกลางบนหัว
// (แนวเดียวกับหน้าตั้งค่า HQ · แท็บที่บันทึกทันที เช่น ผู้รับผิดชอบ ไม่ต้องรายงาน)
// save คืน Promise ได้ — หน้าแม่จะได้ "รอให้บันทึกเสร็จจริง" ก่อนบอกผู้ใช้ว่าบันทึกแล้ว
type SectionApi = { dirty: boolean; save: () => void | Promise<void>; reset: () => void };
const SettingsBus = createContext<{ report: (a: SectionApi | null) => void; toast: (m: string) => void }>({ report: () => {}, toast: () => {} });
function useReport(api: SectionApi) {
  const { report } = useContext(SettingsBus);
  useEffect(() => { report(api); return () => report(null); }, [api, report]);
}

const TABS: { key: SettingTab; label: string; icon: React.ReactNode }[] = [
  { key: "company",   label: "บัญชีดีลเลอร์",     icon: <Building2 size={15} /> },
  { key: "documents", label: "ตั้งค่าใบเสนอราคา", icon: <FileText  size={15} /> },
  { key: "persons",   label: "ผู้รับผิดชอบ",       icon: <UserCheck size={15} /> },
  { key: "notifications", label: "การแจ้งเตือน",   icon: <Bell size={15} /> },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPANY PROFILE TAB
// ─────────────────────────────────────────────────────────────────────────────
const COMPANY_KEY   = "dealer_issuer_profile_v2"; // v2 = รีเซ็ตข้อมูลเดโมเดิม
const LOGO_KEY      = "dealer_company_logo_v2";      // โลโก้สัญลักษณ์ (ไอคอน) → แถบเมนู
type CompanyProfile = { company: string; address: string; phone: string; email: string; website: string; taxId: string };
// ⛔ ต้องว่างเสมอ ห้ามใส่ข้อมูลบริษัทของสาขาใดสาขาหนึ่ง — เหตุผลเดียวกับ DEFAULT_ISSUER ใน mock.ts
//   เดิมใส่ข้อมูลจริงของ CNX ไว้ ดีลเลอร์ที่เพิ่งสร้างใหม่จึงเปิดหน้านี้แล้วเห็นชื่อ/ที่อยู่/อีเมล/เว็บไซต์
//   ของสาขาอื่นขึ้นมาเต็มฟอร์ม เหมือนเป็นข้อมูลตัวเอง (พบ 7 ส.ค. 69)
//   ตัวอย่างการกรอกให้ใส่ที่ placeholder ของแต่ละช่องแทน — ไม่ใช่ใส่เป็นค่าจริงในฟอร์ม
const COMPANY_DEFAULT: CompanyProfile = {
  company: "", address: "", phone: "", email: "", website: "", taxId: "",
};

// บัญชีดีลเลอร์ = โปรไฟล์ผู้ใช้ (รูป/ชื่อ) + ข้อมูลบริษัท + ข้อมูลบัญชี (อีเมลล็อกอิน/รหัสผ่าน) รวมเป็นบัญชีเดียว
function CompanyTab() {
  const router = useRouter();
  const { session } = useRole();
  const [form, setForm] = useState<CompanyProfile>(COMPANY_DEFAULT);
  const [logo, setLogo] = useState<string>("");
  const [prof, setProf] = useState<UserProfile>({ name: session.name, email: defaultProfileEmail(session.dealerCode), phone: "" });
  const [baseline, setBaseline] = useState("");
  const avatarRef = useRef<HTMLInputElement>(null);
  const dealerCfg = useDealerSettings(); // ข้อมูลบริษัท/โลโก้/เอกสารของสาขา (ผ่าน repo)
  const userProfile = useUserProfile();  // โปรไฟล์ผู้ใช้ (ผ่าน repo)

  // ข้อมูลบริษัท/โลโก้ของสาขา อ่านผ่าน repo (โหมด supabase = DB) — เดิมอยู่ใน localStorage เครื่องเดียว
  useEffect(() => {
    if (!dealerCfg.loaded) return;
    const f = { ...COMPANY_DEFAULT, ...dealerCfg.settings.issuer } as CompanyProfile;
    const l = dealerCfg.settings.logo;
    const p = userProfile.loaded ? userProfile.profile : prof;
    setForm(f); setLogo(l); setProf(p);
    setBaseline(JSON.stringify({ form: f, logo: l, prof: p }));
  }, [dealerCfg.loaded, dealerCfg.settings, userProfile.loaded, userProfile.profile, session.dealerCode, session.name]);

  function set<K extends keyof CompanyProfile>(k: K, v: CompanyProfile[K]) {
    setForm(p => ({ ...p, [k]: v }));
  }
  const save = useCallback(async () => {
    const cleanProf: UserProfile = { name: prof.name.trim() || session.name, email: prof.email.trim() || defaultProfileEmail(session.dealerCode), phone: prof.phone.trim(), avatar: prof.avatar };
    // รอให้เขียนเสร็จจริงทั้งคู่ — ไม่ยิงทิ้งแบบเดิม (ผู้ใช้กดเมนูอื่นต่อแล้วคำขอถูกยกเลิกกลางทาง)
    const งานโปรไฟล์ = userProfile.save(cleanProf)
      .catch(() => แจ้งพลาด("บันทึกโปรไฟล์ไม่สำเร็จ — รูปอาจมีขนาดใหญ่เกินไป"));
    // ข้อมูลบริษัท/โลโก้ = ของสาขา เขียนผ่าน repo · ล้มเหลวต้องบอก ไม่ใช่เงียบแล้วจอขึ้นว่าบันทึกแล้ว
    const งานบริษัท = dealerCfg.save({ issuer: form, logo })
      .catch(e => แจ้งพลาด("บันทึกข้อมูลบริษัทไม่สำเร็จ: " + friendlyError(e)));
    // (สัญญาณ "bpms-company-updated" ถูกเอาออก 11 ส.ค. 69 — ไม่เคยมีใครรับฟังเลยทั้งโปรเจกต์
    //  ส่งไปก็ไม่เกิดอะไรขึ้น · PROFILE_UPDATED_EVENT ข้างล่างมีคนฟังจริง จึงเก็บไว้)
    await Promise.all([งานโปรไฟล์, งานบริษัท]);
    window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
    setBaseline(JSON.stringify({ form, logo, prof }));
  }, [form, logo, prof, session.dealerCode, session.name]);
  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // ให้เลือกไฟล์เดิมซ้ำได้หลังถูกปฏิเสธ
    if (!file) return;
    try {
      const url = await fileToResizedDataURL(file, 256);
      setProf(p => ({ ...p, avatar: url }));
    } catch (err) { แจ้งพลาด(err instanceof Error ? err.message : "ใช้ไฟล์นี้เป็นรูปโปรไฟล์ไม่ได้"); }
  }
  const dirty = baseline !== "" && JSON.stringify({ form, logo, prof }) !== baseline;
  const reset = useCallback(() => {
    if (!baseline) return;
    try { const b = JSON.parse(baseline); setForm(b.form); setLogo(b.logo); setProf(b.prof); } catch {}
  }, [baseline]);
  useReport(useMemo(() => ({ dirty, save, reset }), [dirty, save, reset]));

  const roleLabel = ROLE_LABEL[session.role] ?? "ผู้ใช้งาน";
  // ชื่อบัญชีต้องตรงกับ "ชื่อบริษัท" ที่กรอกไว้ในหน้าเดียวกันเสมอ (บอสสั่ง 13 ส.ค. 69)
  //   เดิมเอาชื่อสาขาจากระบบมาก่อน → หัวการ์ดขึ้นชื่อหนึ่ง แต่ช่องชื่อบริษัทข้างล่างเป็นอีกชื่อ
  //   ทั้งที่เป็นบริษัทเดียวกัน · ดีลเลอร์แก้ชื่อบริษัทแล้วหัวการ์ดไม่ขยับตาม เหมือนแก้ไม่ติด
  //   ยังไม่ได้กรอกชื่อบริษัท ค่อยตกไปใช้ชื่อสาขาที่สำนักงานใหญ่ตั้งไว้
  const accountName = form.company.trim() || session.dealerName || session.dealerCode;
  const initial = accountName.charAt(0).toUpperCase();
  const sec: React.CSSProperties = { display: "flex", alignItems: "center", gap: 7, fontSize: "0.72rem", fontWeight: 800, color: "#003366", letterSpacing: "0.05em", marginBottom: 14, textTransform: "uppercase" };

  return (
    <>
      <div className="card-header">
        <div>
          <div className="card-title">บัญชีดีลเลอร์</div>
          {/* คำอธิบายกำกับใต้หัวข้อถูกเอาออกทั้งระบบ (บอสสั่ง 27 ส.ค. 69) */}
        </div>
      </div>
      <div className="card-body">
        {/* ── ตัวตนบัญชี: รูป + ชื่อ + ตำแหน่ง (ชิดซ้าย) ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 22, paddingBottom: 20, borderBottom: "1px solid #f1f5f9" }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            {prof.avatar
              ? <img src={prof.avatar} alt="" style={{ width: 84, height: 84, borderRadius: "50%", objectFit: "cover", boxShadow: "0 3px 10px rgba(0,51,102,.22)" }} />
              : <div style={{ width: 84, height: 84, borderRadius: "50%", background: "linear-gradient(135deg,#003366,#0a4d8c)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.9rem", fontWeight: 900, boxShadow: "0 3px 10px rgba(0,51,102,.22)" }}>{initial}</div>}
            <button onClick={() => avatarRef.current?.click()} title="เปลี่ยนรูปถ่าย"
              style={{ position: "absolute", bottom: -1, right: -1, width: 28, height: 28, borderRadius: "50%", background: "#fff", border: "1px solid #e5e7eb", boxShadow: "0 2px 6px rgba(0,0,0,.15)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#003366" }}>
              <Camera size={14} />
            </button>
            <input ref={avatarRef} type="file" accept="image/*" aria-label="อัปโหลดรูปโปรไฟล์" onChange={uploadAvatar} style={{ display: "none" }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: "1.15rem", fontWeight: 800, color: "#2D2D2D" }}>{accountName}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.65rem", fontWeight: 700, color: "#003366", background: "#eef3f8", border: "1px solid #dce5f0", borderRadius: 999, padding: "3px 10px" }}>
                <ShieldCheck size={11} /> {roleLabel}
              </span>
            </div>
            <div style={{ fontSize: "0.72rem", color: "#8a929c", marginTop: 3 }}>ผู้ดูแลบัญชี: {prof.name || session.name}{session.dealerCode ? ` · รหัสดีลเลอร์ ${session.dealerCode}` : ""}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 10 }}>
              <button onClick={() => avatarRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#003366", fontSize: "0.74rem", fontWeight: 700, padding: 0, fontFamily: "inherit" }}>
                <RotateCcw size={13} /> เปลี่ยนรูปถ่าย
              </button>
              {prof.avatar && (
                <button onClick={() => setProf(p => ({ ...p, avatar: "" }))} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: "0.74rem", fontWeight: 700, padding: 0, fontFamily: "inherit" }}>
                  <Trash2 size={13} /> ลบรูป
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── ข้อมูลบริษัท ── */}
        <div style={sec}><Building2 size={14} /> ข้อมูลบริษัท (ออกในนามดีลเลอร์)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14, marginBottom: 14 }}>
          <div>
            <label className="form-label">ชื่อบริษัท</label>
            <input className="form-input" value={form.company} onChange={e => set("company", e.target.value)} placeholder="บริษัท ตัวอย่าง จำกัด" />
          </div>
          <div>
            <label className="form-label">เลขประจำตัวผู้เสียภาษี</label>
            {/* ⚠️ ตัวอย่างเลขต้องมี X (แก้ 10 ส.ค. 69) — เดิมเป็น "0105555000000" ซึ่งเป็นตัวเลข 13 หลัก
                ครบรูปแบบ อ่านผ่าน ๆ แล้วแยกไม่ออกว่าเป็นค่าตัวอย่างหรือเลขที่กรอกไว้แล้ว
                และต้องเขียนเหมือนฝั่งสำนักงานใหญ่ (CompanyPanel) — ช่องเดียวกันห้ามมี 2 รูปแบบ */}
            <input className="form-input" inputMode="numeric" value={form.taxId} onChange={e => set("taxId", formatTaxId(e.target.value))} placeholder="0-1055-XXXXX-XX-X" />
          </div>
          <div>
            <label className="form-label">อีเมลบริษัท</label>
            <input className="form-input" type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="info@example.co.th" />
          </div>
          <div>
            <label className="form-label">โทรศัพท์บริษัท</label>
            {/* เติมขีดให้เองระหว่างพิมพ์ — เดิมพิมพ์ 222555205 แล้วเก็บติดกันแบบนั้น
                หน้าอื่นที่แสดงเบอร์ทั้งระบบใช้รูปแบบมีขีด สองแบบปนกันแล้วอ่านยากและค้นไม่เจอ */}
            <input className="form-input" inputMode="tel" value={form.phone} onChange={e => set("phone", formatPhone(e.target.value))} placeholder="02-000-0000" />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label className="form-label">เว็บไซต์</label>
            <input className="form-input" value={form.website} onChange={e => set("website", e.target.value)} placeholder="www.example.co.th" />
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label className="form-label">ที่อยู่</label>
          <textarea className="form-textarea" value={form.address} rows={3}
            onChange={e => set("address", e.target.value)}
            placeholder="ที่อยู่เต็ม รวมจังหวัดและรหัสไปรษณีย์" style={{ resize: "vertical" }} />
        </div>

        {/* ── ข้อมูลบัญชี — ดีลเลอร์แก้อีเมล/รหัสผ่านเองได้ (บอสสั่ง 28 ส.ค. 69) ──
             เดิมล็อกไว้ให้สำนักงานใหญ่จัดการอย่างเดียว · กติกาโควตา/การขออนุมัติอยู่ใน DealerAccountCard
             และถูกบังคับจริงที่เซิร์ฟเวอร์ (ไม่ใช่แค่ซ่อนปุ่ม) */}
        {/* หน้าตั้งค่าโชว์แค่ "บัญชีที่ใช้อยู่" (อีเมลเท่านั้น) — การแก้ไปทำที่หน้าบัญชีแยก */}
        <DealerAccountSummary dealerCode={session.dealerCode} currentEmail={prof.email}
          onOpen={() => router.push("/settings/account")} />
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT SETTINGS TAB
// ─────────────────────────────────────────────────────────────────────────────
const DOCUMENT_KEY = "dealer_document_settings";
type DocumentSettings = {
  quotePrefix: string;
  autoYear: boolean;   // ออกปีในเลขที่อัตโนมัติ (Q-{ปีปัจจุบัน}-) แทนการพิมพ์เอง
  runningNumber: number;
  vatPercent: number;
  /** อัตราภาษีหัก ณ ที่จ่ายตั้งต้นของสาขา (%) — ใช้เป็นค่าเริ่มต้นตอนออกใบ
   *  ดีลเลอร์ยังเปิด/ปิดและแก้อัตรารายใบได้เสมอ (บอสสั่ง 28 ส.ค. 69) */
  whtPercent: number;
  validityDays: number;    // อายุใบเสนอราคา (วัน) → วันหมดอายุเริ่มต้น
  expiryWarnDays: number;  // เตือน "ใกล้หมดอายุ" ในกระดิ่ง เมื่อเหลือไม่เกินกี่วัน (บอสสั่ง 21 ก.ย. 69)
  termsAndConditions: string;
  header: string;
  footer: string;
  stamp: string;
  signature: string;
};
const DOC_DEFAULT: DocumentSettings = {
  quotePrefix:         "Q-", // รหัสสาขา+ปี+เลขรันต่อท้ายเสมอที่ฝั่งสร้างใบ (ไม่ใช่ค่าที่พิมพ์ตรงๆ อีกต่อไป)
  autoYear:            true,
  runningNumber:       1101,
  vatPercent:          7,
  whtPercent:          3,
  validityDays:        30,
  expiryWarnDays:      7,
  termsAndConditions:
    "ราคานี้มีผลภายใน 30 วัน นับจากวันที่ออกใบเสนอราคา\n" +
    "บริษัทขอสงวนสิทธิ์เปลี่ยนแปลงราคาโดยไม่แจ้งล่วงหน้า\n" +
    "การยืนยันการสั่งซื้อจะมีผลเมื่อได้รับเงินมัดจำเท่านั้น",
  header:    "",
  footer:    "ขอบคุณที่ไว้วางใจบริษัทของเรา",
  stamp:     "",
  signature: "",
};

function ImageUploadBox({
  label, hint, value, onChange,
}: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // ให้เลือกไฟล์เดิมซ้ำได้หลังถูกปฏิเสธ
    if (!file) return;
    try { onChange(await fileToResizedDataURL(file, 320)); } // ย่อก่อนเก็บ กัน quota เต็ม
    catch (err) { แจ้งพลาด(err instanceof Error ? err.message : "ใช้ไฟล์นี้เป็นรูปไม่ได้"); }
  }
  return (
    <div>
      <label className="form-label">{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 80, height: 80, border: "2px dashed #e5e7eb", borderRadius: 10,
          background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden", flexShrink: 0 }}>
          {value
            ? <img src={value} alt={label} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            : <span style={{ fontSize: "0.65rem", color: "#9ca3af", textAlign: "center", lineHeight: 1.4, padding: "0 6px" }}>{hint}</span>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => ref.current?.click()}>
            <Upload size={13} /> อัปโหลด
          </button>
          {value && (
            <button className="btn btn-ghost btn-sm" onClick={() => onChange("")}>ลบ</button>
          )}
          <span style={{ fontSize: "0.65rem", color: "#9ca3af" }}>PNG, JPG · โปร่งใสได้</span>
        </div>
      </div>
      <input ref={ref} type="file" accept="image/*" aria-label="อัปโหลดรูป" style={{ display: "none" }} onChange={upload} />
    </div>
  );
}

function DocumentsTab() {
  const [doc, setDoc] = useState<DocumentSettings>(DOC_DEFAULT);
  // % บวกตั้งต้นของสาขา (ย้ายมาจากหน้าแม่แบบ — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69)
  //   อ่านผ่าน markupPctOf → ค่าเดิมที่เคยตั้งรายแม่แบบไม่หาย · บันทึกเป็น pricing.defaultPct (byTemplate เดิมคงไว้ในฐาน)
  const [pct, setPct] = useState(0);
  const [baseline, setBaseline] = useState(""); // สแนปช็อตค่าที่บันทึกล่าสุด → ใช้เทียบ dirty
  const dealerCfg = useDealerSettings(); // ตั้งค่าเอกสารของสาขา รวม % VAT (ผ่าน repo)
  const currentDealer = useCurrentDealer(); // รหัสสาขาที่ล็อกอิน — ใช้ประกอบคำนำหน้าเลขที่

  // ตั้งค่าเอกสารของสาขา อ่านผ่าน repo — เดิมอยู่ใน localStorage เครื่องเดียว
  useEffect(() => {
    if (!dealerCfg.loaded) return;
    // quotePrefix บังคับกลับเป็นค่าคงที่ของระบบเสมอ — ช่องนี้ล็อกแล้ว ค่าที่เคยพิมพ์ทับไว้ใน DB
    // (เช่น "Q-CNX-2026-") ต้องไม่ถูกอ่านกลับมาใช้ ไม่งั้นบันทึกครั้งถัดไปจะพาค่าเสียกลับลงไปอีก
    const d = { ...DOC_DEFAULT, ...dealerCfg.settings.document, quotePrefix: QUOTE_PREFIX } as DocumentSettings;
    const p = markupPctOf(dealerCfg.settings.pricing);
    setDoc(d);
    setPct(p);
    setBaseline(JSON.stringify({ d, p }));
  }, [dealerCfg.loaded, dealerCfg.settings]);

  function set<K extends keyof DocumentSettings>(k: K, v: DocumentSettings[K]) {
    setDoc(p => ({ ...p, [k]: v }));
  }

  const pricingเดิม = dealerCfg.settings.pricing;
  const save = useCallback(() => {
    void dealerCfg.save({ document: doc, pricing: { ...pricingเดิม, defaultPct: pct } })
      .catch(e => แจ้งพลาด("บันทึกตั้งค่าเอกสารไม่สำเร็จ: " + friendlyError(e)));
    setBaseline(JSON.stringify({ d: doc, p: pct }));
    // dep ต้องเป็น dealerCfg.save (useCallback ที่เสถียร) ไม่ใช่ dealerCfg ทั้งก้อน
    // เพราะ hook คืน object ใหม่ทุกเรนเดอร์ → save ใหม่ทุกเรนเดอร์ → useMemo/useReport ยิงซ้ำ = เรนเดอร์วนไม่จบ
  }, [doc, pct, pricingเดิม, dealerCfg.save]);
  const dirty = baseline !== "" && JSON.stringify({ d: doc, p: pct }) !== baseline;
  const reset = useCallback(() => {
    if (!baseline) return;
    try { const b = JSON.parse(baseline) as { d: DocumentSettings; p: number }; setDoc(b.d); setPct(b.p); } catch {}
  }, [baseline]);
  useReport(useMemo(() => ({ dirty, save, reset }), [dirty, save, reset]));

  // คำนำหน้าที่ระบบล็อกไว้ = Q-{รหัสสาขา}-{ปีปัจจุบัน}- (แหล่งเดียวกับตอนออกเลขจริงที่ RPC/LocalAdapter)
  // ตัวอย่างเลขที่ = คำนำหน้าล็อก + เลขรัน 4 หลัก — ต้องหน้าตาเหมือนใบที่ออกจริงเป๊ะ
  // เดิมโชว์ doc.quotePrefix + เลขรันเฉย ๆ → สาขาที่พิมพ์คำนำหน้าเองเห็นตัวอย่างไม่ตรงกับเลขที่ได้จริง
  const lockedPrefix = quoteNoPrefix(currentDealer.code);
  const previewNo = `${lockedPrefix}${String(doc.runningNumber).padStart(4, "0")}`;

  return (
    <>
      <div className="card-header">
        <div>
          <div className="card-title">ตั้งค่าใบเสนอราคา</div>
          {/* คำอธิบายกำกับใต้หัวข้อถูกเอาออกทั้งระบบ (บอสสั่ง 27 ส.ค. 69) */}
        </div>
      </div>
      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 22 }}>

        {/* Quote number format — ดีลเลอร์ตั้งเลขลำดับ/อายุใบ/VAT เองได้ · ล็อกเฉพาะคำนำหน้าเลขที่ (ระบบออกให้) */}
        <div>
          <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#003366", letterSpacing: "0.05em", marginBottom: 10, textTransform: "uppercase" }}>
            เลขที่ใบเสนอราคา
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(150px, 180px) minmax(110px, 150px) minmax(84px, 104px) minmax(84px, 104px) minmax(0, 1fr)", gap: 12, alignItems: "end" }}>
            <div>
              <label className="form-label" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                คำนำหน้าเลขที่ <Lock size={11} style={{ color: "#9ca3af" }} />
              </label>
              <div className="form-input" data-testid="quote-prefix" style={{ fontFamily: "monospace", background: "#f8fafc", color: "#6b7280",
                display: "flex", alignItems: "center", cursor: "not-allowed", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                title="รูปแบบเลขที่กำหนดโดยระบบ — แก้ไม่ได้">
                {lockedPrefix}
              </div>
            </div>
            <div>
              <label className="form-label">เลขลำดับถัดไป</label>
              <NumberInput min={1} value={doc.runningNumber} onChange={n => set("runningNumber", n)}
                ariaLabel="เลขลำดับถัดไป" style={{ fontFamily: "monospace" }} />
            </div>
            <div>
              {/* เดิมล็อกไว้ให้สำนักงานใหญ่กำหนดทั้งเครือ · บอสสั่งเปิดให้ดีลเลอร์ตั้งเอง (7 ส.ค. 69)
                  ใบที่ออกไปแล้วไม่กระทบ — ทุกใบตรึง % VAT ไว้ตั้งแต่ตอนสร้าง */}
              <label className="form-label">ภาษีมูลค่าเพิ่ม %</label>
              {/* ผูกชื่อช่องไว้ด้วย — โปรแกรมอ่านหน้าจอต้องบอกได้ว่าช่องตัวเลขนี้คืออะไร
                  (ป้ายข้างบนไม่ได้ผูกกับช่องด้วย htmlFor จึงต้องระบุที่ตัวช่องเอง) */}
              <NumberInput ariaLabel="ภาษีมูลค่าเพิ่ม %" min={0} max={100} step="0.01"
                value={doc.vatPercent} onChange={n => set("vatPercent", n)}
                style={{ fontFamily: "monospace" }} />
            </div>
            <div>
              {/* ภาษีหัก ณ ที่จ่าย — ค่าตั้งต้นของสาขาเท่านั้น (บอสสั่ง 28 ส.ค. 69)
                  ตอนออกใบยังติ๊กเปิด/ปิดและแก้อัตรารายใบได้ · ใบที่ออกไปแล้วไม่กระทบ
                  เพราะทุกใบตรึงอัตราไว้กับตัวเองตั้งแต่วันที่ออก */}
              <label className="form-label">ภาษีหัก ณ ที่จ่าย %</label>
              <NumberInput ariaLabel="ภาษีหัก ณ ที่จ่าย %" min={0} max={100} step={0.5}
                value={doc.whtPercent} onChange={n => set("whtPercent", n)}
                style={{ fontFamily: "monospace" }} />
            </div>
            <div>
              {/* % บวกตั้งต้น — ใช้ตั้งต้น % ของทุกบรรทัดตอนทำใบให้ลูกค้าจากใบ HQ (แก้รายบรรทัดได้)
                  ตั้งได้อิสระ ไม่มีเพดาน ไม่มีขั้นต่ำ (ห้ามใส่ตัวตรวจเทียบต้นทุน) */}
              <label className="form-label">% บวกตั้งต้น</label>
              <NumberInput ariaLabel="% บวกตั้งต้น" step={0.5}
                value={pct} onChange={n => setPct(n)}
                style={{ fontFamily: "monospace" }} />
            </div>
            <div style={{ padding: "10px 14px", background: "#f0f4fa", borderRadius: 10, border: "1px solid #dce5f0" }}>
              <div style={{ fontSize: "0.65rem", color: "#9ca3af", marginBottom: 3 }}>ตัวอย่างเลขที่ถัดไป</div>
              <div style={{ fontFamily: "monospace", fontWeight: 800, color: "#003366", fontSize: "1rem" }}>{previewNo}</div>
            </div>
          </div>
          {/* ค่าเริ่มต้น: อายุใบเสนอราคา (ดีลเลอร์ตั้งได้เอง) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 200px))", gap: 12, marginTop: 14 }}>
            <div>
              <label className="form-label">อายุใบเสนอราคา (วัน)</label>
              <NumberInput ariaLabel="อายุใบเสนอราคา (วัน)" min={1} value={doc.validityDays}
                onChange={n => set("validityDays", n)}
                style={{ fontFamily: "monospace" }} />
            </div>
            {/* ใบเก่าที่บันทึกก่อนมีช่องนี้ไม่มีค่า → ขึ้นค่าเริ่มต้น 7 (ตรงกับที่กระดิ่งใช้) */}
            <div>
              <label className="form-label">เตือนก่อนหมดอายุ (วัน)</label>
              <NumberInput ariaLabel="เตือนก่อนหมดอายุ (วัน)" min={1} value={doc.expiryWarnDays ?? 7}
                onChange={n => set("expiryWarnDays", n)}
                style={{ fontFamily: "monospace" }} />
            </div>
          </div>
        </div>

        <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 18 }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#003366", letterSpacing: "0.05em", marginBottom: 12,
            textTransform: "uppercase" }}>
            หัว / ท้าย เอกสาร
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label className="form-label">หัวเอกสาร</label>
              <textarea className="form-textarea" value={doc.header} rows={2}
                onChange={e => set("header", e.target.value)}
                placeholder="ข้อความหัวเอกสาร (ถ้ามี)" style={{ resize: "vertical" }} />
            </div>
            <div>
              <label className="form-label">ท้ายเอกสาร</label>
              <textarea className="form-textarea" value={doc.footer} rows={2}
                onChange={e => set("footer", e.target.value)}
                placeholder="ข้อความท้ายเอกสาร" style={{ resize: "vertical" }} />
            </div>
          </div>
        </div>

        <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 18 }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#003366", letterSpacing: "0.05em", marginBottom: 12,
            textTransform: "uppercase" }}>
            เงื่อนไขและข้อกำหนด
          </div>
          <textarea className="form-textarea" value={doc.termsAndConditions} rows={5}
            onChange={e => set("termsAndConditions", e.target.value)}
            placeholder="เงื่อนไขการชำระเงิน อายุใบเสนอราคา ข้อกำหนดอื่นๆ"
            style={{ resize: "vertical" }} />
        </div>

        <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 18 }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#003366", letterSpacing: "0.05em", marginBottom: 12,
            textTransform: "uppercase" }}>
            ตราประทับ & ลายเซ็นดิจิทัล
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 20 }}>
            <ImageUploadBox
              label="ตราประทับบริษัท"
              hint="อัปโหลดตราประทับ"
              value={doc.stamp}
              onChange={v => set("stamp", v)}
            />
            <ImageUploadBox
              label="ลายเซ็นดิจิทัล"
              hint="อัปโหลดลายเซ็น"
              value={doc.signature}
              onChange={v => set("signature", v)}
            />
          </div>
        </div>

      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSIBLE PERSONS TAB
// ─────────────────────────────────────────────────────────────────────────────
// รับ persons จาก localStorage แล้ว "จัด id ใหม่ให้ไม่ซ้ำ" (index+1) — กัน key ซ้ำจากข้อมูลเก่าที่เคยบันทึกผิด
// RP id ใช้เป็น React key/แก้-ลบภายในหน้านี้เท่านั้น (ลูกค้าเป้าหมาย/ลูกค้าอ้างด้วย "ชื่อ" ไม่ใช่ id) จึง reindex ได้ปลอดภัย
function reindexPersons(arr: unknown): ResponsiblePerson[] {
  if (!Array.isArray(arr)) return []; // ไม่มีข้อมูล = ว่าง (เดิมคืนพนักงานตัวอย่าง 5 คน)
  return arr.map((p: ResponsiblePerson, i) => ({ ...p, id: i + 1 }));
}

function PersonsTab() {
  const currentDealer = useCurrentDealer(); // พนักงานขายเป็นของสาขานี้ (multi-tenant)
  // เริ่มว่างเสมอ — เดิมตั้งต้นด้วยพนักงานตัวอย่าง 5 คน ถ้าโหลดพลาดแล้วผู้ใช้กดแก้/เพิ่ม
  // save() จะเขียนคนปลอมทั้ง 5 ลง DB จริง
  const [persons, setPersons] = useState<ResponsiblePerson[]>([]);
  const [editId,    setEditId]    = useState<number | null>(null);
  const [editName,  setEditName]  = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAvatar, setEditAvatar] = useState<string | undefined>(undefined);
  const [adding,    setAdding]    = useState(false);
  const [newName,   setNewName]   = useState("");
  const [newTitle,  setNewTitle]  = useState("");
  const [newPhone,  setNewPhone]  = useState("");
  const [newEmail,  setNewEmail]  = useState("");
  const [newAvatar, setNewAvatar] = useState<string | undefined>(undefined);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // อ่านไฟล์รูป → ย่อขนาด (มาตรฐานกลาง imageResize) กัน localStorage เต็ม
  async function readAvatar(file: File | undefined, cb: (url: string) => void) {
    if (!file) return;
    try { cb(await fileToResizedDataURL(file, 128)); }
    catch (err) { แจ้งพลาด(err instanceof Error ? err.message : "ใช้ไฟล์นี้เป็นรูปไม่ได้"); }
  }

  useEffect(() => {
    // พนักงานขายของสาขานี้ — อ่านผ่าน repository (local: localStorage · supabase: DB · RLS สาขาตัวเอง)
    let alive = true;
    personsRepo.list({ dealerCode: currentDealer.code, isHQ: false })
      .then(list => { if (alive) setPersons(reindexPersons(list)); }).catch(e => logRepoRead("persons.list", e));
    return () => { alive = false; };
  }, [currentDealer.code]);

  function save(updated: ResponsiblePerson[]) {
    setPersons(updated);
    void personsRepo.save(updated, currentDealer.code); // แทนที่ทั้งชุดของสาขานี้
  }
  function startEdit(p: ResponsiblePerson) {
    setEditId(p.id); setEditName(p.name ?? ""); setEditTitle(p.title ?? "");
    setEditPhone(p.phone ?? ""); setEditEmail(p.email ?? ""); setEditAvatar(p.avatar);
  }
  function saveEdit() {
    save(persons.map(p => p.id === editId
      ? { ...p, name: editName, title: editTitle, phone: editPhone, email: editEmail, avatar: editAvatar }
      : p));
    setEditId(null);
  }
  function toggleActive(id: number) { save(persons.map(p => p.id === id ? { ...p, active: !p.active } : p)); }
  function deletePerson(id: number) { save(persons.filter(p => p.id !== id)); setDeleteConfirmId(null); }
  function addPerson() {
    if (!newName.trim()) return;
    const p: ResponsiblePerson = {
      id: Math.max(0, ...persons.map(x => x.id)) + 1, name: newName.trim(), title: newTitle.trim() || "เจ้าหน้าที่ขาย",
      phone: newPhone.trim(), email: newEmail.trim(), active: true, avatar: newAvatar,
    };
    save([p, ...persons]); // คนที่เพิ่มล่าสุดขึ้นบนสุด (บอสสั่ง 21 ก.ย. 69) — ลำดับที่บันทึก = ลำดับที่โหลดกลับมา
    setNewName(""); setNewTitle(""); setNewPhone(""); setNewEmail(""); setNewAvatar(undefined); setAdding(false);
  }

  // ปิดฟอร์ม (ทั้งโหมดเพิ่มและโหมดแก้ไข) — ต้องอยู่ระดับนี้เพื่อให้ตัวคุมการคลิกฉากหลังใช้ได้
  const closeForm = useCallback(() => {
    if (editId !== null) { setEditId(null); return; }
    setAdding(false); setNewName(""); setNewTitle(""); setNewPhone(""); setNewEmail(""); setNewAvatar(undefined);
  }, [editId]);
  // คลิกฉากหลังเพื่อปิด — แต่กันคลิกที่สองของดับเบิลคลิก และกันการลากข้อความออกนอกกล่อง
  const overlayProps = useOverlayClose(closeForm, adding || editId !== null);

  return (
    <>
      <div className="card-header">
        <div>
          <div className="card-title">ผู้รับผิดชอบ</div>
          {/* คำอธิบายกำกับใต้หัวข้อถูกเอาออกทั้งระบบ (บอสสั่ง 27 ส.ค. 69) */}
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}><Plus size={14} /> เพิ่ม</button>
      </div>
      <div className="card-body" style={{ paddingTop: 0 }}>
        {/* ── ป๊อปอัพเพิ่ม/แก้ไขผู้รับผิดชอบ (ใช้ modal เดียวกัน) ── */}
        {(adding || editId !== null) && (() => {
          const isEdit = editId !== null;
          // coerce เป็นสตริงเสมอ — กัน input controlled/uncontrolled สลับกัน
          const name = (isEdit ? editName : newName) ?? "";
          const title = (isEdit ? editTitle : newTitle) ?? "";
          const phone = (isEdit ? editPhone : newPhone) ?? "";
          const email = (isEdit ? editEmail : newEmail) ?? "";
          const avatar = isEdit ? editAvatar : newAvatar;
          const setName = isEdit ? setEditName : setNewName;
          const setTitle = isEdit ? setEditTitle : setNewTitle;
          const setPhone = isEdit ? setEditPhone : setNewPhone;
          const setEmail = isEdit ? setEditEmail : setNewEmail;
          const setAvatar = isEdit ? setEditAvatar : setNewAvatar;
          const submit = isEdit ? saveEdit : addPerson;
          const close = closeForm;
          const onEnter = (e: React.KeyboardEvent) => { if (e.key === "Enter" && name.trim()) submit(); };
          return (
            // แขวนที่ระดับหน้าเว็บ ไม่ฝังในการ์ด — ไม่งั้นอนิเมชันของการ์ดจะดึงตำแหน่งป๊อปอัพไปด้วย
            <ModalPortal>
            <div {...overlayProps} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(45,45,45,.45)",
              display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
              <ModalCard onClose={close} label="ฟอร์มผู้รับผิดชอบ" className="modal-fit-auto" style={{ width: "100%", maxWidth: 460, background: "#fff", borderRadius: 18,
                overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,.28)" }}>
                {/* header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 22px", background: "#003366" }}>
                  <div style={{ fontSize: "1rem", fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
                    {isEdit ? <><Pencil size={16} strokeWidth={2.5} /> แก้ไขผู้รับผิดชอบ</> : <><Plus size={17} strokeWidth={2.5} /> เพิ่มผู้รับผิดชอบ</>}
                  </div>
                  <button onClick={close} style={{ width: 32, height: 32, borderRadius: 9, border: "1px solid rgba(255,255,255,.2)",
                    background: "rgba(255,255,255,.1)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={15} /></button>
                </div>
                {/* body */}
                <div style={{ padding: "24px 22px" }}>
                  {/* avatar upload — กลาง · แบบเดียวกับกล่อง "เพิ่มผู้ใช้งาน HQ" (UsersPanel > UserDialog)
                      วงกลมทึบตัวอักษรแรกของชื่อ (ยังไม่พิมพ์ชื่อ = ไอคอนเพิ่มรูป) ไม่ใช่วงเส้นประ — เส้นประวงกลมเรนเดอร์เป็นจุด ๆ
                      ที่สั่นไหวตามระดับซูม/สเกลจอ ดูเหมือนภาพกระพริบ */}
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                    <label title="เพิ่ม/เปลี่ยนรูปโปรไฟล์" style={{ cursor: "pointer", position: "relative", display: "inline-block" }}>
                      <input type="file" accept="image/*" style={{ display: "none" }}
                        onChange={e => { readAvatar(e.target.files?.[0], url => setAvatar(url)); e.target.value = ""; }} />
                      {avatar
                        ? <img src={avatar} alt="" style={{ width: 84, height: 84, borderRadius: "50%", objectFit: "cover", border: "3px solid #003366" }} />
                        : name.trim()
                        ? <span style={{ width: 84, height: 84, borderRadius: "50%", background: "#003366", color: "#fff",
                            display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "2rem" }}>
                            {name.trim().charAt(0)}
                          </span>
                        // ยังไม่ได้พิมพ์ชื่อ = ยังไม่มีตัวอักษรให้แสดง — ใช้ไอคอน "เพิ่มรูป" ไม่ใช่ "?"
                        //   เดิมแสดงเครื่องหมายคำถามตัวโต ๆ บนวงกลมทึบ ซึ่งอ่านได้ว่า "รูปเสีย/โหลดไม่ขึ้น"
                        //   ทั้งที่เป็นแค่ฟอร์มเปล่า (ผู้ใช้แจ้ง 7 ส.ค. 69 · เห็นทั้งบนเครื่องและบนเว็บจริง)
                        : <span style={{ width: 84, height: 84, borderRadius: "50%", background: "#eef3f8", border: "2px solid #dce5f0",
                            display: "flex", alignItems: "center", justifyContent: "center", color: "#003366" }}>
                            <ImagePlus size={30} strokeWidth={1.8} />
                          </span>}
                      <span style={{ position: "absolute", right: 0, bottom: 2, width: 26, height: 26, borderRadius: "50%", background: "#003366",
                        border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}><ImagePlus size={13} /></span>
                      {avatar && (
                        <button type="button" title="ลบรูป" aria-label="ลบรูป"
                          onClick={e => { e.preventDefault(); setAvatar(undefined); }}
                          style={{ position: "absolute", left: 0, bottom: 2, width: 24, height: 24, borderRadius: "50%", background: "#fff",
                            border: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", color: "#dc2626", cursor: "pointer" }}>
                          <X size={12} />
                        </button>
                      )}
                    </label>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div style={{ gridColumn: "1/-1" }}>
                      <label className="form-label">ชื่อ-นามสกุล *</label>
                      <input className="form-input" value={name} autoFocus onChange={e => setName(e.target.value)}
                        placeholder="เช่น สมชาย เชียงใหม่" onKeyDown={onEnter} />
                    </div>
                    <div>
                      <label className="form-label">ตำแหน่ง</label>
                      <input className="form-input" value={title} onChange={e => setTitle(e.target.value)}
                        placeholder="เจ้าหน้าที่ขาย" onKeyDown={onEnter} />
                    </div>
                    <div>
                      <label className="form-label">โทรศัพท์</label>
                      <input className="form-input" inputMode="tel" value={phone} onChange={e => setPhone(formatPhone(e.target.value))}
                        placeholder="08x-xxx-xxxx" onKeyDown={onEnter} />
                    </div>
                    <div style={{ gridColumn: "1/-1" }}>
                      <label className="form-label">อีเมล</label>
                      <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)}
                        placeholder="name@dealer.co.th" onKeyDown={onEnter} />
                    </div>
                  </div>
                </div>
                {/* footer */}
                <div style={{ padding: "14px 22px", borderTop: "1px solid #e5e7eb", background: "#fafafa",
                  display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button className="btn btn-secondary btn-md" onClick={close}>ยกเลิก</button>
                  <button className="btn btn-primary btn-md" disabled={!name.trim()}
                    style={!name.trim() ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                    onClick={submit}><Check size={14} strokeWidth={2.5} /> บันทึก</button>
                </div>
              </ModalCard>
            </div>
            </ModalPortal>
          );
        })()}

        <div className="table-wrap" style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
          <table>
            <colgroup>
              <col style={{ width: "24%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "16%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>ชื่อ-นามสกุล</th>
                <th>ตำแหน่ง</th>
                <th>โทรศัพท์</th>
                <th>อีเมล</th>
                <th style={{ width: 110 }}>สถานะ</th>
                <th className="num" style={{ width: 160 }}>การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {persons.map(p => (
                <tr key={p.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {p.avatar
                        ? <img src={p.avatar} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flexShrink: 0, opacity: p.active ? 1 : 0.5 }} />
                        : <div style={{ width: 34, height: 34, borderRadius: "50%", background: p.active ? "#003366" : "#9ca3af",
                            flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ color: "#fff", fontSize: "0.72rem", fontWeight: 800 }}>{p.name.charAt(0)}</span>
                          </div>}
                      <span style={{ fontWeight: 600, color: p.active ? "#2D2D2D" : "#9ca3af" }}>{p.name}</span>
                    </div>
                  </td>
                  <td><span style={{ fontSize: "0.8rem", color: "#6b7280" }}>{p.title}</span></td>
                  <td><span style={{ fontSize: "0.8rem", color: "#6b7280" }}>{p.phone || "—"}</span></td>
                  <td><span style={{ fontSize: "0.8rem", color: "#6b7280" }}>{p.email || "—"}</span></td>
                  <td>
                    <button onClick={() => toggleActive(p.id)} className="badge"
                      style={{ border: "none", cursor: "pointer", fontFamily: "inherit",
                        background: p.active ? "#e5faf0" : "#f0f0f5",
                        color: p.active ? "#059669" : "#9ca3af" }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block",
                        background: p.active ? "#059669" : "#C0C0C0" }} />
                      {p.active ? "ใช้งาน" : "ไม่ใช้งาน"}
                    </button>
                  </td>
                  <td className="num">
                    {deleteConfirmId === p.id ? (
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", alignItems: "center" }}>
                        <span style={{ fontSize: "0.65rem", color: "#dc2626", fontWeight: 600 }}>ยืนยันลบ?</span>
                        <button className="btn btn-danger btn-sm" onClick={() => deletePerson(p.id)}>ลบ</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setDeleteConfirmId(null)}><X size={13} /></button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => startEdit(p)}><Pencil size={13} /> แก้ไข</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirmId(p.id)}><Trash2 size={13} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {persons.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: "28px", textAlign: "center", color: "#9ca3af", fontSize: "0.8rem" }}>
                    ยังไม่มีผู้รับผิดชอบ — กด &quot;+ เพิ่ม&quot; เพื่อเริ่มต้น
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: "0.72rem", color: "#9ca3af", marginTop: 10 }}>
          ผู้รับผิดชอบ <strong>ไม่ใช่ผู้ใช้ระบบ · Login ไม่ได้</strong> — ใช้สำหรับเลือกตอนสร้างลูกค้าเป้าหมายเท่านั้น
        </p>
      </div>
    </>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS TAB — เปิด/ปิดการแจ้งเตือนแต่ละชนิด (มีผลกับกระดิ่งบน Topbar)
// เลย์เอาต์เดียวกับ /hq/settings → การแจ้งเตือน: หัวข้อมีไอคอน · ตารางแถวมีขอบ ·
// คอลัมน์ "เปิด" ชิดขวา · แถบบอกว่าค่านี้ถูกใช้ที่ไหน · บันทึกด้วยปุ่มกลางบนหัว (ไม่ auto-save)
// ดีลเลอร์มีช่องทางเดียวคือกระดิ่งในระบบ — ไม่มีคอลัมน์ "อีเมล" แบบ HQ เพราะไม่มีระบบส่งอีเมลให้ดีลเลอร์
// ─────────────────────────────────────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onChange}
      style={{ width: 42, height: 24, borderRadius: 99, border: "none", cursor: "pointer", flexShrink: 0,
        background: on ? "#003366" : "#d1d5db", position: "relative", transition: "background .15s" }}>
      <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)", transition: "left .15s" }} />
    </button>
  );
}

// แท็บนี้มี 2 การ์ด (สวิตช์แจ้งเตือน + กฎการดูแลลูกค้าเป้าหมาย) แต่ bus รับ api ได้ทีละตัว
// จึงต้องถือ state ทั้งสองก้อนที่นี่แล้วรายงานรวมเป็นตัวเดียว — ถ้าแยกกัน useReport
// ตัวหลังจะทับตัวแรก แล้วปุ่มบันทึกกลางจะเซฟได้แค่การ์ดเดียว (อีกการ์ดกดบันทึกแล้วค่าหาย)
function NotificationsTab() {
  const [savedPrefs, setSavedPrefs] = useState<NotifPrefs>(DEFAULT_NOTIF_PREFS);
  const [draft, setDraft] = useState<NotifPrefs>(DEFAULT_NOTIF_PREFS);
  const [savedRules, setSavedRules] = useState<LeadRules>(DEFAULT_LEAD_RULES);
  const [rulesDraft, setRulesDraft] = useState<LeadRules>(DEFAULT_LEAD_RULES);
  const editedRef = useRef(false);
  const draftRef = useRef(draft); draftRef.current = draft;
  const savedRef = useRef(savedPrefs); savedRef.current = savedPrefs;
  const rulesDraftRef = useRef(rulesDraft); rulesDraftRef.current = rulesDraft;
  const savedRulesRef = useRef(savedRules); savedRulesRef.current = savedRules;
  const currentDealer = useCurrentDealer(); // สาขาที่ล็อกอิน — กฎแจ้งเตือนเป็นของสาขานี้
  const notifCfg = useDealerSettings();
  // โหลดค่าที่บันทึกไว้หลัง mount — ถ้าผู้ใช้เริ่มแก้แล้ว อย่าทับ draft
  useEffect(() => {
    // การแจ้งเตือนของสาขา — ผ่าน repo เช่นกัน (เดิม localStorage เครื่องเดียว)
    if (notifCfg.loaded) {
      const p = notifCfg.settings.notifPrefs;
      setSavedPrefs(p);
      if (!editedRef.current) setDraft(p);
    }
    // กฎดูแลลูกค้าเป้าหมาย — อ่านผ่าน repository (local: localStorage · supabase: DB)
    settingsRepo.getLeadRulesMap().then(map => {
      const r = leadRulesOf(map, currentDealer.code);
      setSavedRules(r);
      if (!editedRef.current) setRulesDraft(r);
    }).catch(e => logRepoRead("settings.getLeadRulesMap", e));
  }, [currentDealer.code, notifCfg.loaded, notifCfg.settings]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(savedPrefs)
    || JSON.stringify(rulesDraft) !== JSON.stringify(savedRules);
  const save = useCallback(() => {
    const next = draftRef.current;
    void notifCfg.save({ notifPrefs: next })
      .catch(e => แจ้งพลาด("บันทึกการแจ้งเตือนไม่สำเร็จ: " + friendlyError(e)));
    window.dispatchEvent(new Event(NOTIF_PREFS_EVENT)); // ให้กระดิ่งบน Topbar อัปเดตทันที
    const nextRules = rulesDraftRef.current;
    void settingsRepo.saveLeadRules(currentDealer.code, nextRules); // local: ยิง event ให้หน้าอื่นอัปเดตทันที · supabase: RLS dealer-own
    editedRef.current = false;
    setSavedPrefs(next);
    setSavedRules(nextRules);
  }, [currentDealer.code]);
  const reset = useCallback(() => {
    editedRef.current = false;
    setDraft(savedRef.current);
    setRulesDraft(savedRulesRef.current);
  }, []);
  useReport(useMemo(() => ({ dirty, save, reset }), [dirty, save, reset]));

  function toggle(k: keyof NotifPrefs) {
    editedRef.current = true;
    setDraft(p => ({ ...p, [k]: !p[k] }));
  }
  const setRule = useCallback((k: keyof LeadRules, n: number) => {
    editedRef.current = true;
    setRulesDraft(p => ({ ...p, [k]: n }));
  }, []);

  return (
    <>
      <div className="card-header">
        <div>
          <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--primary)", display: "flex" }}><Bell size={19} /></span>การแจ้งเตือนของดีลเลอร์
          </div>
          {/* คำอธิบายกำกับใต้หัวข้อถูกเอาออกทั้งระบบ (บอสสั่ง 27 ส.ค. 69) */}
        </div>
      </div>
      <div className="card-body">
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 4px 8px", fontSize: "0.68rem", fontWeight: 700, color: "#9ca3af" }}>
          <span style={{ width: 42, textAlign: "center" }}>เปิด</span>
        </div>
        <div style={{ border: "1px solid var(--border,#e5e7eb)", borderRadius: 12, overflow: "hidden" }}>
          {NOTIF_META.map((n, i) => (
            <div key={n.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderTop: i ? "1px solid #f1f5f9" : "none" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.84rem", fontWeight: 700, color: "#2D2D2D" }}>{n.label}</div>
                <div style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: 2 }}>{n.desc}</div>
              </div>
              <div style={{ width: 42, display: "flex", justifyContent: "center" }}>
                <Toggle on={draft[n.key]} onChange={() => toggle(n.key)} />
              </div>
            </div>
          ))}
        </div>
        {/* แถบบอกว่าค่านี้ถูกใช้ที่ไหน — แนวเดียวกับ UsedAt ของหน้าตั้งค่า HQ */}
      </div>
      <LeadRulesCard draft={rulesDraft} set={setRule} />
    </>
  );
}

// ─── กฎการดูแลลูกค้าเป้าหมายของสาขานี้ ────────────────────────────────────────
// ย้ายมาจาก /hq/settings ตามคำสั่ง — เดิม HQ ตั้งค่าเดียวบังคับทุกสาขา ("ดีลเลอร์แก้เองไม่ได้")
// ตอนนี้ดีลเลอร์แต่ละสาขาตั้งเอง เก็บแยกด้วยรหัสสาขา (key: dealer_lead_rules)
// ⚠️ ค่านี้กระทบหน้า HQ ด้วย — HQ อ่านเกณฑ์ของแต่ละสาขามาคิดทีละใบ (useLeadRulesOf)
function LeadRulesCard({ draft, set }: { draft: LeadRules; set: (k: keyof LeadRules, n: number) => void }) {
  const currentDealer = useCurrentDealer(); // ชื่อ/รหัสสาขาที่ล็อกอิน (แสดงบนหัวการ์ด)
  const num = (value: number, on: (n: number) => void, unit: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <NumberInput min={1} ariaLabel="จำนวนวัน" style={{ textAlign: "right", fontWeight: 700 }}
        value={value} onChange={on} />
      <span style={{ fontSize: "0.72rem", color: "#6b7280", whiteSpace: "nowrap" }}>{unit}</span>
    </div>
  );
  const row = (label: string, desc: string, node: React.ReactNode) => (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", padding: "13px 0", borderTop: "1px solid var(--border,#f1f5f9)" }}>
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div style={{ fontSize: "0.84rem", fontWeight: 700, color: "#2D2D2D" }}>{label}</div>
        <div style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: 2 }}>{desc}</div>
      </div>
      <div style={{ flex: "0 0 340px", maxWidth: "100%" }}>{node}</div>
    </div>
  );

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header">
        <div>
          <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--primary)", display: "flex" }}><Scale size={19} /></span>กฎการดูแลลูกค้าเป้าหมาย
          </div>
          {/* คำอธิบายกำกับใต้หัวข้อถูกเอาออกทั้งระบบ (บอสสั่ง 27 ส.ค. 69) */}
        </div>
      </div>
      <div className="card-body">
        {row("ต้องมีผู้รับผิดชอบภายใน", "ลูกค้าเป้าหมายใหม่ที่ยังไม่มีผู้รับผิดชอบเกินกำหนด → ขึ้นการ์ดเตือน",
          num(draft.unassignedAlertHours, n => set("unassignedAlertHours", n), "ชั่วโมง"))}
        {row("เตือนเมื่อลูกค้าเป้าหมายไม่มีการติดต่อเกิน", "รายการที่ยังไม่ปิดและเงียบเกินกำหนด → ขึ้นป้าย “ต้องติดตามด่วน”",
          num(draft.followUpAlertDays, n => set("followUpAlertDays", n), "วัน"))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingTab>("company");
  const [api, setApi] = useState<SectionApi | null>(null);
  const [toast, setToastMsg] = useState<string | null>(null);
  const report = useCallback((a: SectionApi | null) => setApi(a), []);
  const showToast = useCallback((m: string) => { setToastMsg(m); setTimeout(() => setToastMsg(null), 2400); }, []);
  const dirty = !!api?.dirty;
  // เตือนตอนออกจากหน้า/ปิดแท็บด้วย — เดิมเตือนแค่ตอนสลับแท็บ กดเมนู sidebar ออกไปงานหายเงียบ
  useUnsavedGuard(dirty);

  // เตือนก่อนออกจากแท็บถ้ายังไม่บันทึก (แนวเดียวกับหน้าตั้งค่า HQ)
  async function switchTab(next: SettingTab) {
    if (next === activeTab) return;
    if (dirty && !(await ยืนยัน({
      หัวข้อ: "ส่วนนี้ยังไม่บันทึก",
      รายละเอียด: "เปลี่ยนหัวข้อแล้วสิ่งที่แก้ไว้จะหาย",
      ปุ่มตกลง: "ทิ้งที่แก้ไว้", ปุ่มยกเลิก: "อยู่หัวข้อเดิม", อันตราย: true,
    }))) return;
    setActiveTab(next);
  }
  // ── ต้องรอให้บันทึกเสร็จจริงก่อนบอกว่า "บันทึกแล้ว" (แก้ 27 ส.ค. 69) ──────────────
  // เดิมสั่งบันทึกแบบไม่รอผล แล้วขึ้นข้อความสำเร็จทันที — ผู้ใช้กดบันทึกเสร็จแล้วกดเมนูอื่นต่อ
  // ทันที คำขอที่ยังไม่จบจะถูกยกเลิกกลางทาง (ยืนยันจากการยิงจริง: net::ERR_ABORTED)
  // ผลคือ "ข้อมูลบริษัทที่เพิ่งตั้งหายไปเงียบ ๆ" แล้วไปโผล่ตอนพิมพ์ใบเสนอราคาไม่ได้
  const [กำลังบันทึก, setกำลังบันทึก] = useState(false);
  async function saveAll() {
    if (!dirty || !api || กำลังบันทึก) return;
    setกำลังบันทึก(true);
    try {
      await api.save();
      showToast("บันทึกการตั้งค่าแล้ว");
    } catch (e) {
      showToast("บันทึกไม่สำเร็จ: " + friendlyError(e));
    } finally {
      setกำลังบันทึก(false);
    }
  }
  function resetAll() { if (dirty && api) api.reset(); }

  return (
    <SettingsBus.Provider value={{ report, toast: showToast }}>
      <div className="erp">
        {/* หัวหน้า/ปุ่มบันทึก → ไปอยู่บนแถบบน (ชื่อหน้ามาจาก Topbar) */}
        <TopbarActions>
          {dirty && <span style={{ fontSize: "0.72rem", color: "#d97706", fontWeight: 600 }}>ยังไม่บันทึก</span>}
          <button className="btn btn-secondary btn-sm" onClick={resetAll} disabled={!dirty} style={!dirty ? { opacity: .5, cursor: "not-allowed" } : undefined}><RotateCcw size={14} /> รีเซ็ต</button>
          <button className="btn btn-primary btn-sm" onClick={() => void saveAll()} disabled={!dirty || กำลังบันทึก}
            style={!dirty || กำลังบันทึก ? { opacity: .5, cursor: กำลังบันทึก ? "wait" : "not-allowed" } : undefined}>
            <Save size={14} /> {กำลังบันทึก ? "กำลังบันทึก…" : "บันทึก"}</button>
        </TopbarActions>
        {/* คำโปรยใต้ชื่อหน้าถูกเอาออกทุกหน้า (บอสสั่ง 14 ส.ค. 69) */}

        {/* Tab bar */}
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="tab-bar" style={{ overflowX: "auto" }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => switchTab(t.key)}
                className={`tab-item${activeTab === t.key ? " active" : ""}`}
                style={{ display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}>
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="card">
          {activeTab === "company"   && <CompanyTab />}
          {activeTab === "documents" && <DocumentsTab />}
          {activeTab === "persons"   && <PersonsTab />}
          {activeTab === "notifications" && <NotificationsTab />}
        </div>

        {/* Toast */}
        {toast && (
          <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, background: "#111827", color: "#fff", padding: "12px 18px", borderRadius: 12, fontSize: "0.82rem", fontWeight: 600, boxShadow: "0 12px 32px rgba(0,0,0,.28)", display: "flex", alignItems: "center", gap: 9 }}>
            <Check size={15} color="#7ee2b8" /> {toast}
          </div>
        )}
      </div>
    </SettingsBus.Provider>
  );
}
