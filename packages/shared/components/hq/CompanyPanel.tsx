"use client";
import { formatPhone, formatTaxId } from "@pms/shared/lib/format";

import { useState, useEffect, useCallback, useMemo } from "react";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { hqCompany as hqCompanyRepo } from "@pms/shared/lib/data";
import { Building2, Check, Save, Image as ImageIcon, Upload, RotateCcw } from "lucide-react";
import { useReportSection } from "@pms/shared/lib/settingsBus";
import { แจ้งพลาด } from "@pms/shared/components/ui/ConfirmToast";
import { FieldLabel, FieldError, useRequiredFields, กรอบผิด } from "@pms/shared/components/ui/FieldLabel";
import { ข้อความช่องขีด, type ช่องบังคับ } from "@pms/shared/lib/requiredFields";
import { ยืนยัน, แจ้งสำเร็จ } from "@pms/shared/components/ui/ConfirmToast";
import { useBrandLogo } from "@pms/shared/lib/useBrandLogo";
import { ตรวจไฟล์โลโก้, ป้ายชนิดโลโก้, เหตุการณ์โลโก้เปลี่ยน } from "@pms/shared/lib/brandLogo";
import { apiFetch } from "@pms/shared/lib/data/http/HttpAdapter";
import { DATA_SOURCE } from "@pms/shared/lib/data/config";

// โลโก้ของระบบ: HQ เปลี่ยนได้ (บอสสั่ง 24 พ.ย. 69 · ใบ 0304) — กล่อง BrandLogoBox ท้ายไฟล์ · เปลี่ยนทันทีที่อัป (ไม่ผ่านปุ่มบันทึกกลาง)
// ตัดทิ้งตามสเปก Enterprise: การ์ด "สินทรัพย์แบรนด์" (โลโก้ดาวน์โหลด / สี CI / ฟอนต์)
//   — เป็นการตั้งค่าธีม/สี/ฟอนต์ ซึ่งสเปกสั่งเอาออกทั้งหมด
// (PROFILE_KEY ถูกลบ — ข้อมูลบริษัทย้ายไปตาราง hq_company แล้ว อ่าน/เขียนผ่าน repo)

type CompanyProfile = {
  name: string; address: string; taxId: string;
  phone: string; email: string; website: string;
};

// ── ⛔ ห้ามใส่ค่าตัวอย่างไว้ตรงนี้เด็ดขาด (แก้ 10 ส.ค. 69) ────────────────────────────
//
// เดิมมีข้อมูลบริษัทปลอมฝังไว้ทั้งชุด — ชื่อบริษัท ที่อยู่ เบอร์โทร อีเมล เว็บไซต์
// และ **เลขประจำตัวผู้เสียภาษี "0105XXXXXXXXX"** ซึ่งไม่มีอยู่จริง
// เมื่อฐานข้อมูลยังว่าง (ยังไม่เคยกรอก) ค่าพวกนี้จะถูกยัดใส่ช่องกรอกให้ดูเหมือนเป็นข้อมูลจริง
//
// อันตรายจริงจัง 2 ทาง:
//   1) กดบันทึกครั้งเดียวโดยไม่ได้แก้ ของปลอมทั้งชุดลงฐานข้อมูลจริงทันที
//   2) ข้อมูลบริษัทถูกใช้อ้างอิงในเอกสาร — เลขผู้เสียภาษีปลอมมีสิทธิ์ไปโผล่บนใบเสนอราคาที่ส่งลูกค้า
//
// กติกา: ไม่มีข้อมูลจริง = ปล่อยว่าง แล้วให้ผู้ใช้กรอกเอง (ตัวอย่างรูปแบบใส่เป็น placeholder ได้
// เพราะเป็นข้อความจาง ๆ ที่ไม่ถูกบันทึก)
const PROFILE_DEFAULT: CompanyProfile = {
  name: "", address: "", taxId: "", phone: "", email: "", website: "",
};

export function CompanyPanel({ embedded }: { embedded?: boolean } = {}) {
  const [form,  setForm]  = useState<CompanyProfile>(PROFILE_DEFAULT);
  const [saved, setSaved] = useState(false);
  const [baseline, setBaseline] = useState(""); // สแนปช็อตค่าที่บันทึกล่าสุด → ใช้เทียบ dirty (โหมดฝัง)

  // อ่านผ่าน repo — เดิมอยู่ใน localStorage ของ :3002 เท่านั้น
  // ล้างเบราว์เซอร์แล้วหาย และดีลเลอร์ (:3001) ไม่มีทางเห็นชื่อบริษัทแม่
  useEffect(() => {
    let alive = true;
    hqCompanyRepo.get()
      .then(c => {
        if (!alive) return;
        // แถวว่าง (ยังไม่เคยกรอก) = ปล่อยช่องว่างไว้ ห้ามเติมค่าตัวอย่างให้ดูเหมือนมีข้อมูลแล้ว
        const f = { ...PROFILE_DEFAULT, ...c };
        setForm(f);
        setBaseline(JSON.stringify({ form: f }));
      })
      .catch(e => logRepoRead("hqCompany.get", e));
    return () => { alive = false; };
  }, []);

  // ช่องบังคับ (บอสสั่ง 4 พ.ย. 69 · หัวใบค่าแฟรนไชส์/เอกสารที่ออกจาก HQ ใช้ข้อมูลชุดนี้)
  //   ชื่อบริษัท · ที่อยู่ · โทรศัพท์ · เลขผู้เสียภาษี (ไม่มีเลข = ใส่ "-") — ขาด = ไม่บันทึก · ฐานกันอีกชั้น (ใบ 0276)
  const บังคับ = useRequiredFields();
  const ชุดบังคับ = (f: CompanyProfile): ช่องบังคับ[] => [
    { key: "name", label: "ชื่อบริษัท", value: f.name },
    { key: "taxId", label: "เลขประจำตัวผู้เสียภาษี", value: f.taxId, ข้อความ: ข้อความช่องขีด("เลขประจำตัวผู้เสียภาษี") },
    { key: "phone", label: "โทรศัพท์", value: f.phone },
    { key: "address", label: "ที่อยู่", value: f.address },
  ];
  function set<K extends keyof CompanyProfile>(k: K, v: CompanyProfile[K]) {
    setForm(p => ({ ...p, [k]: v }));
    บังคับ.ล้าง(k);
    setSaved(false);
  }
  const save = useCallback(() => {
    if (!บังคับ.ตรวจ(ชุดบังคับ(form))) return false;
    void hqCompanyRepo.save(form)
      .catch(e => แจ้งพลาด("บันทึกข้อมูลบริษัทไม่สำเร็จ: " + friendlyError(e)));
    // ⚠️ ต้องบันทึกไว้ในประวัติการใช้งานด้วย (แก้ 10 ส.ค. 69)
    //   เดิมแก้ข้อมูลบริษัทจากหน้า /hq/company แล้ว "ไม่มีร่องรอยเลยสักแถว"
    //   ทั้งที่ทำแบบเดียวกันผ่านหน้าตั้งค่า → แท็บบริษัท มีบันทึกปกติ
    //   (โหมดฝังในหน้าตั้งค่าใช้ปุ่มบันทึกกลางซึ่งบันทึกให้อยู่แล้ว — จดที่นี่ซ้ำจะได้ 2 แถว)
    // ⛔ เคยส่งสัญญาณ "bpms-company-updated" ตรงนี้ พร้อมคำอธิบายว่า "ให้แถบเมนูอัปเดตชื่อทันที"
    //    ซึ่งไม่จริงเลย — ไม่มีใครรับฟังสัญญาณนี้ทั้งโปรเจกต์ และแถบเมนูใช้คำว่า BENJAMIN
    //    เป็นแบรนด์ตายตัวอยู่แล้ว ไม่ได้ดึงจากช่องชื่อบริษัท (ตรวจแล้ว 11 ส.ค. 69)
    //    เอาออกทั้งบรรทัด — โค้ดที่ไม่ทำงานพร้อมคำอธิบายที่ผิด อันตรายกว่าไม่มีอะไรเลย
    setBaseline(JSON.stringify({ form }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    return true;
  }, [form, embedded, บังคับ.ตรวจ]);
  // โหมดฝังในหน้าตั้งค่า → รายงาน {dirty,save,reset} ให้ปุ่มบันทึกกลาง (ไม่มีปุ่มของตัวเอง = ไม่ซ้ำ)
  const dirty = baseline !== "" && JSON.stringify({ form }) !== baseline;
  const reset = useCallback(() => {
    if (!baseline) return;
    try { const b = JSON.parse(baseline); setForm(b.form); } catch {}
  }, [baseline]);
  // standalone (/hq/company) ไม่มี Provider → report เป็น no-op โดยปริยาย ปลอดภัย
  useReportSection(useMemo(() => ({ dirty, save, reset }), [dirty, save, reset]));

  return (
    <div className="erp">
      {!embedded && (
        <div className="page-head">
          <div>
            <p>ข้อมูลบริษัทเบนจามินและสินทรัพย์แบรนด์</p>
          </div>
        </div>
      )}

      {/* ── ข้อมูลบริษัท ─────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div>
            <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Building2 size={16} style={{ color: "var(--primary)" }} /> ข้อมูลบริษัท
            </div>
            {/* คำอธิบายกำกับใต้หัวข้อถูกเอาออกทั้งระบบ (บอสสั่ง 27 ส.ค. 69) */}
          </div>
        </div>
        <div className="card-body">

          {/* โลโก้ของระบบ — HQ เปลี่ยนได้ (บอสสั่ง 24 พ.ย. 69 · ใบ 0304 · ทับคำตัดสินเดิม "มาตรฐานเดียว เปลี่ยนไม่ได้") */}
          <BrandLogoBox />


          {/* Fields */}
          <div className="form-grid" style={{ marginBottom: 28 }}>
            <div className="form-section">ข้อมูลบริษัท</div>
            <div className="col-full">
              <FieldLabel htmlFor="co-name" required>ชื่อบริษัท</FieldLabel>
              <input id="co-name" className="form-input" value={form.name} onChange={e => set("name", e.target.value)} {...บังคับ.ผูก("name")} />
              <FieldError>{บังคับ.ผิด.name}</FieldError>
            </div>
            <div className="col-full">
              <FieldLabel htmlFor="co-tax" required>เลขประจำตัวผู้เสียภาษี</FieldLabel>
              {/* ไม่มีเลข = ใส่ "-" (formatTaxId คืน "-" ให้ · 4 พ.ย. 69) */}
              <input id="co-tax" className="form-input" inputMode="numeric" value={form.taxId} onChange={e => set("taxId", formatTaxId(e.target.value))} placeholder='0-1055-XXXXX-XX-X · ไม่มีเลขใส่ "-"' {...บังคับ.ผูก("taxId")} />
              <FieldError>{บังคับ.ผิด.taxId}</FieldError>
            </div>

            <div className="form-section">ช่องทางติดต่อ</div>
            <div>
              <FieldLabel htmlFor="co-phone" required>โทรศัพท์</FieldLabel>
              <input id="co-phone" className="form-input" inputMode="tel" value={form.phone} onChange={e => set("phone", formatPhone(e.target.value))} placeholder="0x-xxx-xxxx" {...บังคับ.ผูก("phone")} />
              <FieldError>{บังคับ.ผิด.phone}</FieldError>
            </div>
            <div>
              <label className="form-label">อีเมล</label>
              <input className="form-input" value={form.email} onChange={e => set("email", e.target.value)} placeholder="info@example.co.th" />
            </div>
            <div className="col-full">
              <label className="form-label">เว็บไซต์</label>
              <input className="form-input" value={form.website} onChange={e => set("website", e.target.value)} placeholder="www.example.co.th" />
            </div>
            <div className="col-full">
              <FieldLabel htmlFor="co-address" required>ที่อยู่</FieldLabel>
              <textarea id="co-address" className="form-textarea" value={form.address} rows={3}
                onChange={e => set("address", e.target.value)}
                placeholder="ที่อยู่เต็ม รวมจังหวัดและรหัสไปรษณีย์"
                {...บังคับ.ผูก("address")} style={{ resize: "vertical", ...(บังคับ.ผิด.address ? กรอบผิด : null) }} />
              <FieldError>{บังคับ.ผิด.address}</FieldError>
            </div>
          </div>

          {/* โหมดฝัง → ใช้ปุ่มบันทึกกลางบนหัวหน้าตั้งค่า (ไม่มีปุ่มของตัวเอง = ไม่ซ้ำ) */}
          {!embedded && (
            <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid var(--border)", paddingTop: 16 }}>
              <button className="btn btn-primary btn-md" onClick={save}>
                {saved ? <><Check size={14} /> บันทึกแล้ว</> : <><Save size={14} /> บันทึก</>}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── ⛔ ตาราง "สาขา (Branches)" ถูกลบทิ้งเมื่อ 10 ส.ค. 69 ────────────────────────
          เดิมมีรายชื่อสาขา 6 แห่งฝังไว้ในโค้ด — เชียงใหม่ ขอนแก่น ชลบุรี สุราษฎร์ธานี นครราชสีมา
          พร้อมที่อยู่และสถานะ "เปิดทำการ" ทั้งหมดถูกกุขึ้นมา ไม่มีอยู่ในฐานข้อมูลเลยแม้แต่แถวเดียว
          แต่แสดงบนหน้าจอเหมือนเป็นเครือข่ายสาขาจริงของบริษัท

          ⚠️ และห้ามเอาตาราง "ดีลเลอร์" มาแสดงแทน — คนละเรื่องกัน
             ดีลเลอร์คือคู่ค้า ไม่ใช่สาขาของบริษัท การเอามาสวมรอยกันคือการกุข้อมูลอีกแบบ

          ถ้าวันหลังต้องมีทะเบียนสาขาจริง ต้องมีตารางของมันเองในฐานข้อมูลก่อน */}
    </div>
  );
}

// ── โลโก้ของระบบ (บอสสั่ง 24 พ.ย. 69 · ใบ 0304) ─────────────────────────────────────
//   อัปแล้วเปลี่ยนทันที (เมนูมุมซ้ายบนทั้ง HQ และดีลเลอร์) · PNG / JPG / WebP ≤ 1 MB — ตรวจไบต์จริงที่หน้าเว็บ เส้นทาง และฐาน
//   ไม่เก็บ/ไม่แสดงชื่อไฟล์ที่อัป · ปุ่ม "กลับไปใช้โลโก้ Benjamin เดิม" · หน้าเข้าระบบใช้โลโก้เดิมเสมอ
function BrandLogoBox() {
  const โลโก้ = useBrandLogo(true);
  const [busy, setBusy] = useState(false);
  const [ผิด, setผิด] = useState("");
  const ใช้ได้ = DATA_SOURCE === "api";

  const อัป = async (file: File | undefined) => {
    if (!file || busy) return;
    setผิด("");
    const ไบต์ = new Uint8Array(await file.arrayBuffer());
    const เตือน = ตรวจไฟล์โลโก้(ไบต์);
    if (เตือน) { setผิด(เตือน); return; }
    setBusy(true);
    try {
      let s = ""; for (let i = 0; i < ไบต์.length; i += 0x8000) s += String.fromCharCode(...ไบต์.subarray(i, i + 0x8000));
      await apiFetch<string>("/brand-logo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ base64: btoa(s) }) });
      window.dispatchEvent(new Event(เหตุการณ์โลโก้เปลี่ยน));
      แจ้งสำเร็จ("เปลี่ยนโลโก้แล้ว — เมนูของ HQ และดีลเลอร์ใช้โลโก้นี้");
    } catch (e) { setผิด(friendlyError(e)); }
    finally { setBusy(false); }
  };
  const กลับโลโก้เดิม = () => ยืนยัน({
    หัวข้อ: "กลับไปใช้โลโก้ Benjamin เดิม?",
    รายละเอียด: "เมนูของ HQ และดีลเลอร์ทุกรายกลับเป็นโลโก้ Benjamin เดิม · อัปโลโก้ใหม่ได้อีกภายหลัง",
    ปุ่มตกลง: "กลับไปใช้โลโก้เดิม", ปุ่มกำลังทำ: "กำลังเปลี่ยน…",
    ทำ: async () => {
      await apiFetch<null>("/brand-logo", { method: "DELETE" });
      window.dispatchEvent(new Event(เหตุการณ์โลโก้เปลี่ยน));
      แจ้งสำเร็จ("กลับไปใช้โลโก้ Benjamin เดิมแล้ว");
    },
  });

  return (
    <div style={{ marginBottom: 24 }} data-panel="brand-logo">
      <label className="form-label">โลโก้ของระบบ</label>
      <div style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", marginBottom: 8 }}>แสดงที่มุมซ้ายบนของเมนู ทั้ง HQ และดีลเลอร์ · ดีลเลอร์เปลี่ยนเองไม่ได้</div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div data-brand-logo-preview={โลโก้.sha ? "custom" : "default"} style={{
          width: 80, height: 80, borderRadius: 12, flexShrink: 0, background: โลโก้.sha ? "#fff" : "#003366",
          border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          { }
          <img src={โลโก้.src} alt={โลโก้.sha ? "โลโก้ที่ตั้งไว้" : "โลโก้ Benjamin เดิม"} style={{ width: 56, height: 56, objectFit: "contain", ...(โลโก้.sha ? {} : { filter: "brightness(0) invert(1)" }) }} />
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {ใช้ได้ ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label className="btn btn-secondary btn-sm" style={{ cursor: busy ? "wait" : "pointer" }} aria-disabled={busy}>
                <Upload size={13} /> {busy ? "กำลังแนบไฟล์…" : "แนบไฟล์โลโก้"}
                <input type="file" aria-label="เลือกไฟล์โลโก้" accept="image/png,image/jpeg,image/webp" disabled={busy} style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; void อัป(f); }} />
              </label>
              {โลโก้.sha && (
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void กลับโลโก้เดิม()}>
                  <RotateCcw size={13} /> กลับไปใช้โลโก้ Benjamin เดิม
                </button>
              )}
            </div>
          ) : null}
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.72rem", color: "#6b7280" }}>
            <ImageIcon size={13} color="#003366" style={{ flexShrink: 0 }} />
            {ใช้ได้ ? `รับเฉพาะ ${ป้ายชนิดโลโก้} · ไม่เกิน 1 MB` : "เปลี่ยนโลโก้ได้เมื่อเชื่อมระบบจริง — ตอนนี้ใช้โลโก้ Benjamin เดิม"}
          </div>
          {ผิด && <div role="alert" data-brand-logo-error style={{ fontSize: "0.74rem", fontWeight: 600, color: "#b91c1c" }}>{ผิด}</div>}
        </div>
      </div>
    </div>
  );
}
