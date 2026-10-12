"use client";

// ─── ข้อมูลเข้าระบบของดีลเลอร์ (ดูอีเมล/รหัสผ่าน · รีเซ็ตรหัสผ่าน) ─────────────────────
//
// ย้ายมาจากปุ่มรูปกุญแจในตารางหน้า "ดีลเลอร์" (บอสสั่งเอาออกจากตาราง 13 ส.ค. 69)
// ตารางนั้นมีปุ่มต่อแถวถึง 6 ปุ่มจนแน่น — งานนี้เป็นงานราย "สาขา" ไม่ใช่งานที่ต้องทำรัวจากลิสต์
// จึงย้ายมาอยู่ในหน้ารายละเอียดของสาขานั้น ๆ แทน · ความสามารถเท่าเดิมทุกอย่าง ไม่ได้ตัดอะไรทิ้ง
//
// ⚠️ รหัสผ่านต้อง "ดึงตอนกดดู" เท่านั้น ห้ามส่งมากับข้อมูลดีลเลอร์ตั้งแต่แรก
//    ครั้งก่อนรหัสถูกฝังในไฟล์ที่เบราว์เซอร์โหลดทุกหน้า ใครเปิดดูซอร์สก็อ่านได้ (Critical · 5 ส.ค. 69)
//    ฝั่งเซิร์ฟเวอร์บันทึกทุกครั้งว่าใครเปิดดูรหัสของสาขาไหน
import { useEffect, useState } from "react";
import { Eye, EyeOff, Copy, Check, Key, X } from "lucide-react";
import { ModalPortal } from "@pms/shared/components/ui/ModalPortal";
import { ModalCard } from "@pms/shared/components/ui/ModalCard";
import { viewDealerPassword, resetDealerPassword, listDealerLoginEmails, getDealerSelfQuota, resetDealerSelfQuota } from "@pms/shared/lib/adminApi";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";
import { fmtISOToThai, type DealerRow } from "@pms/shared/lib/mock";
import { useRole } from "@pms/shared/context/RoleContext";
import { ยืนยัน, แจ้งพลาด, แจ้งสำเร็จ } from "@pms/shared/components/ui/ConfirmToast";

/** ช่องคัดลอกค่า (ปิดบังได้) — ใช้ทั้งที่นี่และตอนสร้างดีลเลอร์ใหม่ */
export function CopyField({ label, value, secret = false, defaultShown = false }: {
  label: string; value: string; secret?: boolean; defaultShown?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  // defaultShown = ผู้ใช้กด "ดูรหัสผ่าน" มาแล้ว ไม่ต้องให้กดปุ่มรูปตาซ้ำอีกชั้น (แก้ 10 ส.ค. 69)
  const [shown, setShown] = useState(defaultShown);
  const masked = secret && !shown;
  function doCopy() {
    navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: "0.72rem", color: "#6b7280", marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f0f4f8", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 11px" }}>
        <span style={{ flex: 1, fontFamily: "monospace", fontSize: "0.86rem", fontWeight: 700, color: "#2D2D2D", letterSpacing: "0.03em", overflow: "hidden", textOverflow: "ellipsis" }}>
          {masked ? "••••••••••••" : value}
        </span>
        {secret && (
          <button type="button" onClick={() => setShown(v => !v)} aria-label={shown ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"} title={shown ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", padding: 0, display: "flex" }}>
            {shown ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
        <button type="button" onClick={doCopy} aria-label={`คัดลอก${label}`} title={`คัดลอก${label}`}
          style={{ background: "none", border: "none", cursor: "pointer", color: copied ? "#059669" : "#6b7280", padding: 0, display: "flex" }}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}

/** ช่องรหัสผ่าน — ยังไม่ดึงจนกว่าจะกดดู (ดูหมายเหตุด้านบนไฟล์) */
export function DealerPasswordField({ code, fallback }: { code: string; fallback?: string }) {
  const [pw, setPw] = useState<string | null>(fallback ?? null);
  const [meta, setMeta] = useState<{ at: string; by: string } | null>(null);
  // กด "ดูรหัสผ่าน" แล้วต้องเห็นทันที ไม่ต้องกดปุ่มรูปตาซ้ำอีกชั้น (บั๊กจริง · 10 ส.ค. 69)
  const [revealed, setRevealed] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function reveal() {
    if (loading || pw) return;
    setLoading(true); setErr("");
    const res = await viewDealerPassword(code);
    setLoading(false);
    if (!res.ok) { setErr(res.error); return; }
    setPw(res.password);
    setRevealed(true);
    setMeta({ at: res.updatedAt, by: res.updatedBy });
  }

  if (pw) return (
    <>
      <CopyField label="รหัสผ่าน" value={pw} secret defaultShown={revealed} />
      {meta?.at && (
        <div style={{ fontSize: "0.68rem", color: "#6b7280", marginTop: -6, marginBottom: 10 }}>
          ตั้งเมื่อ {fmtISOToThai(meta.at.slice(0, 10))}{meta.by ? ` โดย ${meta.by}` : ""}
        </div>
      )}
    </>
  );

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: "0.72rem", color: "#6b7280", marginBottom: 4, fontWeight: 600 }}>รหัสผ่าน</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f0f4f8", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px" }}>
        <span style={{ flex: 1, fontFamily: "monospace", fontSize: "0.86rem", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.03em" }}>
          ••••••••••••
        </span>
        <button type="button" onClick={reveal} disabled={loading}
          title="ดูรหัสผ่าน (ระบบจะบันทึกว่าใครเปิดดู)"
          style={{ background: "none", border: "none", cursor: loading ? "wait" : "pointer", color: "#003366", padding: 0, display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit", fontSize: "0.74rem", fontWeight: 700 }}>
          <Eye size={14} /> {loading ? "กำลังดึง…" : "ดูรหัสผ่าน"}
        </button>
      </div>
      {err && <div style={{ fontSize: "0.7rem", color: "#dc2626", marginTop: 5 }}>{err}</div>}
    </div>
  );
}

const ช่องกรอก: React.CSSProperties = {
  width: "100%", marginTop: 5, padding: "9px 12px", borderRadius: 10, border: "1px solid #e5e7eb",
  fontSize: "0.8rem", color: "#2D2D2D", outline: "none", background: "#fafafa", boxSizing: "border-box",
  fontFamily: "inherit", fontWeight: 600,
};

export function DealerCredentialsCard({ dealer }: { dealer: DealerRow }) {
  const { can } = useRole();
  // อีเมลเข้าระบบจริง — ห้ามคำนวณจากรหัสสาขา (สูตรนั้นใช้ได้เฉพาะบัญชีที่สร้างผ่านหน้าจอนี้
  //   สาขาที่มีอยู่จริงใช้อีเมลธุรกิจของตัวเอง) · ไม่รู้ = "—" ไม่เดาให้ผู้ใช้เข้าใจผิด
  const [email, setEmail] = useState("—");
  const [resetting, setResetting] = useState(false);
  const [newCreds, setNewCreds] = useState<{ email: string; password: string } | null>(null);
  // แก้อีเมล/ตั้งรหัสผ่านเอง (บอสสั่ง 20 ส.ค. 69) — เว้นช่องไหนไว้ = ไม่แตะของเดิมช่องนั้น
  const [แก้บัญชี, setแก้บัญชี] = useState<{ email: string; password: string } | null>(null);
  // ผู้ใช้พิมพ์ในช่องอีเมลเองแล้วหรือยัง — กันไม่ให้ค่าที่เพิ่งโหลดมาทับสิ่งที่กำลังพิมพ์
  const [พิมพ์อีเมลเอง, setพิมพ์อีเมลเอง] = useState(false);
  const [ผิดพลาด, setผิดพลาด] = useState("");

  useEffect(() => {
    let alive = true;
    listDealerLoginEmails().then(m => { if (alive) setEmail(m[dealer.code] ?? "—"); }).catch(() => {});
    return () => { alive = false; };
  }, [dealer.code]);

  // สิทธิ์แก้อีเมล/รหัสผ่านเอง (2 ครั้ง) — HQ เห็นว่าใช้ไปเท่าไร และคืนสิทธิ์ได้ (บอสสั่ง 15 ก.ย. 69)
  const [สิทธิ์, setสิทธิ์] = useState<{ used: number; limit: number } | null>(null);
  const [กำลังคืน, setกำลังคืน] = useState(false);
  const จัดการได้ = can("dealers:manage");
  useEffect(() => {
    if (!จัดการได้) return;
    let alive = true;
    getDealerSelfQuota(dealer.code).then(r => { if (alive && r.ok) setสิทธิ์({ used: r.used, limit: r.limit }); }).catch(() => {});
    return () => { alive = false; };
  }, [dealer.code, จัดการได้]);

  async function คืนสิทธิ์() {
    if (!สิทธิ์ || สิทธิ์.used === 0) return;
    const ตกลง = await ยืนยัน({
      หัวข้อ: `คืนสิทธิ์แก้อีเมล/รหัสผ่านเองให้ "${dealer.name}"?`,
      รายละเอียด: `ประวัติการเปลี่ยนเดิมยังอยู่ แค่เริ่มนับใหม่ — ดีลเลอร์แก้เองได้อีก ${สิทธิ์.limit} ครั้ง`,
      ปุ่มตกลง: "คืนสิทธิ์",
    });
    if (!ตกลง) return;
    setกำลังคืน(true);
    const r = await resetDealerSelfQuota(dealer.code);
    setกำลังคืน(false);
    if (!r.ok) { แจ้งพลาด(r.error); return; }
    setสิทธิ์(s => s && { ...s, used: 0 });
    แจ้งสำเร็จ(`คืนสิทธิ์แก้เองให้ "${dealer.name}" แล้ว — แก้เองได้อีก ${สิทธิ์.limit} ครั้ง`);
  }

  // ⚠️ อีเมลของสาขาโหลดมาทีหลัง (ต้องถามเซิร์ฟเวอร์ ห้ามเดาจากรหัสสาขา)
  //    ถ้าผู้ใช้กดปุ่มแก้ "ก่อน" อีเมลมาถึง ช่องจะว่างเปล่าค้างอยู่แบบนั้นตลอด
  //    (บอสเจอจริง 20 ส.ค. 69 — การ์ดโชว์อีเมลอยู่ แต่ในโมดัลกลับว่าง)
  //    จึงเติมให้เมื่ออีเมลมาถึง ตราบใดที่ผู้ใช้ยังไม่ได้พิมพ์เอง
  useEffect(() => {
    if (!แก้บัญชี || พิมพ์อีเมลเอง || email === "—") return;
    setแก้บัญชี(v => (v && !v.email ? { ...v, email } : v));
  }, [email, แก้บัญชี, พิมพ์อีเมลเอง]);

  // จัดการบัญชีดีลเลอร์ได้เฉพาะผู้มีสิทธิ์ — ผู้ใช้ HQ ระดับปฏิบัติงานไม่ควรเห็นรหัสของสาขา
  if (!can("dealers:manage")) return null;


  async function บันทึกบัญชี() {
    if (!แก้บัญชี) return;
    const อีเมล = แก้บัญชี.email.trim();
    const รหัส = แก้บัญชี.password;
    if (!อีเมล && !รหัส) { setผิดพลาด("กรอกอีเมลใหม่หรือรหัสผ่านใหม่อย่างน้อยหนึ่งอย่าง"); return; }
    if (อีเมล && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(อีเมล)) { setผิดพลาด("รูปแบบอีเมลไม่ถูกต้อง"); return; }
    if (รหัส && รหัส.length < 8) { setผิดพลาด("รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร"); return; }
    if (!REAL_BACKEND) { setผิดพลาด("โหมดทดลองใช้งานไม่รองรับการแก้บัญชีเข้าระบบ"); return; }
    setResetting(true);
    setผิดพลาด("");
    const res = await resetDealerPassword(dealer.code, { email: อีเมล || undefined, password: รหัส || undefined });
    setResetting(false);
    if (!res.ok) { setผิดพลาด(res.error); return; }
    setEmail(res.email || อีเมล || email);
    setแก้บัญชี(null);
    // รหัสผ่านจะโชว์ให้คัดลอกเฉพาะตอนที่ "มีรหัสใหม่จริง" — แก้อีเมลอย่างเดียวไม่ต้องโชว์
    if (res.password) setNewCreds({ email: res.email, password: res.password });
    else แจ้งสำเร็จ(`เปลี่ยนอีเมลเข้าระบบของ "${dealer.name}" เป็น ${res.email} แล้ว — รหัสผ่านเดิมยังใช้ได้`);
  }

  return (
    <div className="card" style={{ padding: "18px 20px", gridColumn: "1 / -1" }}>
      <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "#6b7280", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em",
        display: "flex", alignItems: "center", gap: 7 }}>
        <Key size={13} color="#003366" /> ข้อมูลเข้าระบบของดีลเลอร์
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 18px" }}>
        <CopyField label="อีเมลเข้าสู่ระบบ" value={email} />
        <DealerPasswordField code={dealer.code} fallback={dealer.credentials?.password} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
        <div style={{ fontSize: "0.72rem", color: "#6b7280" }}>
          ดีลเลอร์ใช้อีเมลนี้เข้าสู่ระบบที่หน้าเข้าสู่ระบบของดีลเลอร์
        </div>
        {/* เหลือปุ่มเดียว (บอสสั่ง 20 ส.ค. 69) — ปุ่ม "รีเซ็ตรหัสผ่าน" ถูกถอดออก
            เพราะซ้ำกับปุ่มนี้: อยากได้รหัสใหม่ก็พิมพ์รหัสที่ต้องการลงไปตรง ๆ ได้เลย
            และแบบนั้นผู้ดูแลรู้ว่ารหัสคืออะไรทันที ไม่ต้องรอระบบสุ่มมาแล้วค่อยคัดลอก */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => { setผิดพลาด(""); setพิมพ์อีเมลเอง(false); setแก้บัญชี({ email: email === "—" ? "" : email, password: "" }); }} disabled={resetting}
          style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid #d5dbe4", background: "#fff", color: "#003366",
            fontSize: "0.76rem", fontWeight: 700, cursor: resetting ? "not-allowed" : "pointer", opacity: resetting ? 0.6 : 1,
            display: "flex", alignItems: "center", gap: 7, fontFamily: "inherit" }}>
          <Key size={13} /> แก้อีเมล/รหัสผ่าน
        </button>
        </div>
      </div>
      {สิทธิ์ && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 12, paddingTop: 12, borderTop: "1px solid #eef1f5" }}>
          <div style={{ fontSize: "0.74rem", color: "#374151" }} data-testid="self-quota">
            ดีลเลอร์แก้อีเมล/รหัสผ่านเองไปแล้ว <b>{สิทธิ์.used} / {สิทธิ์.limit}</b> ครั้ง
            {สิทธิ์.used >= สิทธิ์.limit && <span style={{ color: "#b45309", fontWeight: 700 }}> · ครบแล้ว ครั้งต่อไปต้องขออนุมัติ</span>}
          </div>
          <button onClick={() => void คืนสิทธิ์()} disabled={กำลังคืน || สิทธิ์.used === 0}
            style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid #d5dbe4", background: "#fff", color: "#003366",
              fontSize: "0.76rem", fontWeight: 700, fontFamily: "inherit",
              cursor: กำลังคืน || สิทธิ์.used === 0 ? "not-allowed" : "pointer", opacity: กำลังคืน || สิทธิ์.used === 0 ? 0.6 : 1 }}>
            {กำลังคืน ? "กำลังคืนสิทธิ์…" : "คืนสิทธิ์แก้เอง"}
          </button>
        </div>
      )}

      {/* แก้บัญชีเข้าระบบเอง — เว้นช่องไหนไว้ = ไม่แตะของเดิมช่องนั้น
          (แก้อีเมลอย่างเดียวต้องไม่ไปเปลี่ยนรหัสผ่านทิ้ง ไม่งั้นสาขาหลุดจากระบบทันทีโดยไม่มีใครตั้งใจ) */}
      {/* ⚠️ ต้องแขวนที่ <body> ผ่าน ModalPortal เสมอ (บอสเจอ 20 ส.ค. 69: ปุ่มบันทึกถูกการ์ดถัดไปทับ)
          โมดัลนี้อยู่ในกล่อง .card ซึ่งมี transform (อนิเมชันตอนการ์ดโผล่ + ยกตัวตอนชี้เมาส์)
          กล่องแม่ที่มี transform จะ "ดึง" position: fixed มายึดกับตัวเอง แล้ว z-index ของโมดัล
          ก็ถูกขังอยู่ในลำดับชั้นของการ์ดใบนั้น → การ์ดที่อยู่หลังกว่าในหน้าเลยวาดทับได้ */}
      {แก้บัญชี && (
        <ModalPortal>
        <div onClick={() => setแก้บัญชี(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.42)", zIndex: 1060, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <ModalCard onClose={() => setแก้บัญชี(null)} label="แก้บัญชีเข้าระบบของดีลเลอร์"
            style={{ background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", boxShadow: "0 2px 14px rgba(0,51,102,.07)", width: 400, maxWidth: "100%" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "0.92rem", fontWeight: 800, color: "#2D2D2D" }}>แก้บัญชีเข้าระบบ</h3>
                <div style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: 2 }}>{dealer.name}</div>
              </div>
              <button onClick={() => setแก้บัญชี(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", display: "flex" }}><X size={16} /></button>
            </div>
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "#6b7280" }}>
                อีเมลเข้าสู่ระบบ
                <input type="email" aria-label="อีเมลเข้าสู่ระบบใหม่" value={แก้บัญชี.email}
                  onChange={e => { setพิมพ์อีเมลเอง(true); setแก้บัญชี(v => v && ({ ...v, email: e.target.value })); }}
                  placeholder="เว้นไว้ = ใช้อีเมลเดิม" style={ช่องกรอก} />
                {/* บอกของเดิมไว้เสมอ — ผู้ใช้จะได้รู้ว่ากำลังจะเปลี่ยนจากอะไรเป็นอะไร ไม่ต้องเดาจากช่องว่าง */}
                <span style={{ display: "block", fontWeight: 600, color: "#8a929c", marginTop: 4 }}>
                  อีเมลปัจจุบัน: {email}
                </span>
              </label>
              <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "#6b7280" }}>
                รหัสผ่านใหม่
                {/* ห้ามมีเว้นวรรคในรหัสผ่าน (บอสสั่ง 25 ส.ค. 69) — หน้าเข้าสู่ระบบตัดช่องว่างทิ้ง
                    ถ้าตั้งรหัสที่มีเว้นวรรคไว้ เจ้าของบัญชีจะพิมพ์รหัสตัวเองไม่ได้เลย */}
                <input type="text" aria-label="รหัสผ่านใหม่" value={แก้บัญชี.password}
                  onChange={e => setแก้บัญชี(v => v && ({ ...v, password: e.target.value.replace(/\s/g, "") }))}
                  placeholder="เว้นไว้ = ใช้รหัสเดิม (อย่างน้อย 8 ตัว)" style={ช่องกรอก} />
                <span style={{ display: "block", fontWeight: 600, color: "#8a929c", marginTop: 4 }}>
                  ไม่ต้องการเปลี่ยนรหัส ปล่อยว่างไว้ได้ — รหัสเดิมของสาขาจะยังใช้ได้ตามปกติ
                </span>
              </label>
              {ผิดพลาด && (
                <div role="alert" style={{ fontSize: "0.74rem", color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 11px" }}>{ผิดพลาด}</div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => setแก้บัญชี(null)} style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid #d5dbe4", background: "#fff", color: "#374151", fontSize: "0.76rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>ยกเลิก</button>
                <button onClick={บันทึกบัญชี} disabled={resetting}
                  style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: "#003366", color: "#fff", fontSize: "0.76rem", fontWeight: 700, cursor: resetting ? "not-allowed" : "pointer", opacity: resetting ? 0.6 : 1, fontFamily: "inherit" }}>
                  {resetting ? "กำลังบันทึก…" : "บันทึก"}
                </button>
              </div>
            </div>
          </ModalCard>
        </div>
        </ModalPortal>
      )}

      {/* รหัสใหม่หลังรีเซ็ต — ต้องคัดลอกไปแจ้งดีลเลอร์ทันที ปิดแล้วดูซ้ำได้ที่ปุ่ม "ดูรหัสผ่าน" ด้านบน */}
      {newCreds && (
        <ModalPortal>
        <div onClick={() => setNewCreds(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.42)", zIndex: 1060, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <ModalCard onClose={() => setNewCreds(null)} label="รหัสผ่านใหม่ของดีลเลอร์"
            style={{ background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", boxShadow: "0 2px 14px rgba(0,51,102,.07)", width: 380, maxWidth: "100%" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "0.92rem", fontWeight: 800, color: "#2D2D2D" }}>รหัสผ่านใหม่</h3>
                <div style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: 2 }}>{dealer.name}</div>
              </div>
              <button onClick={() => setNewCreds(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", display: "flex" }}><X size={16} /></button>
            </div>
            <div style={{ padding: "16px 20px" }}>
              <CopyField label="อีเมล" value={newCreds.email} />
              <CopyField label="รหัสผ่านใหม่" value={newCreds.password} secret defaultShown />
              <div style={{ fontSize: "0.72rem", color: "#7a5b12", background: "#fff8e6", border: "1px solid #f5d78e", borderRadius: 8, padding: "9px 12px", marginTop: 6 }}>
                รหัสเดิมใช้ไม่ได้แล้ว — ต้องแจ้งรหัสใหม่นี้ให้ดีลเลอร์ทราบ
              </div>
            </div>
          </ModalCard>
        </div>
        </ModalPortal>
      )}
    </div>
  );
}
