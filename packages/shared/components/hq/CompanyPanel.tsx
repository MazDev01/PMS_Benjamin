"use client";
import { formatPhone, formatTaxId } from "@pms/shared/lib/format";

import { useState, useEffect, useCallback, useMemo } from "react";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { hqCompany as hqCompanyRepo } from "@pms/shared/lib/data";
import { Building2, Check, Save, Image as ImageIcon } from "lucide-react";
import { useReportSection } from "@pms/shared/lib/settingsBus";
import { แจ้งพลาด } from "@pms/shared/components/ui/ConfirmToast";

// โลโก้ Benjamin เป็นแบรนด์มาตรฐานเดียว (ไฟล์ static) — ไม่มีคีย์เก็บโลโก้ที่อัปโหลดอีกแล้ว
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

  function set<K extends keyof CompanyProfile>(k: K, v: CompanyProfile[K]) {
    setForm(p => ({ ...p, [k]: v }));
    setSaved(false);
  }
  const save = useCallback(() => {
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
  }, [form, embedded]);
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

          {/* โลโก้ Benjamin — มาตรฐานเดียว ดูอย่างเดียว
              ห้ามอัปโหลด / ห้ามหลายรูปแบบ (vertical/icon/landscape) / ห้ามเปลี่ยนแบรนด์
              หมายเหตุ: ปุ่มอัปโหลดเดิมไม่มีผลอยู่แล้ว — แถบเมนูใช้ /benjamin-logo-white.png ตายตัวเสมอ */}
          <div style={{ marginBottom: 24 }}>
            <label className="form-label">โลโก้ Benjamin</label>
            <div style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", marginBottom: 8 }}>แบรนด์มาตรฐานเดียวของทั้งระบบ</div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{
                width: 80, height: 80, borderRadius: 12, flexShrink: 0, background: "#003366",
                border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                { }
                <img src="/benjamin-logo-white.png" alt="Benjamin" style={{ width: 44, height: 44, objectFit: "contain", filter: "brightness(0) invert(1)" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f5f7fa", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", fontSize: "0.76rem", color: "#6b7280" }}>
                <ImageIcon size={14} color="#003366" style={{ flexShrink: 0 }} />
                ใช้โลโก้ Benjamin มาตรฐานเดียวทั้งระบบ — เปลี่ยน/อัปโหลดโลโก้อื่นไม่ได้
              </div>
            </div>
          </div>

          {/* Fields */}
          <div className="form-grid" style={{ marginBottom: 28 }}>
            <div className="form-section">ข้อมูลบริษัท</div>
            <div className="col-full">
              <label className="form-label">ชื่อบริษัท</label>
              <input className="form-input" value={form.name} onChange={e => set("name", e.target.value)} />
            </div>
            <div className="col-full">
              <label className="form-label">เลขประจำตัวผู้เสียภาษี</label>
              <input className="form-input" inputMode="numeric" value={form.taxId} onChange={e => set("taxId", formatTaxId(e.target.value))} placeholder="0-1055-XXXXX-XX-X" />
            </div>

            <div className="form-section">ช่องทางติดต่อ</div>
            <div>
              <label className="form-label">โทรศัพท์</label>
              <input className="form-input" inputMode="tel" value={form.phone} onChange={e => set("phone", formatPhone(e.target.value))} placeholder="02-000-0000" />
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
              <label className="form-label">ที่อยู่</label>
              <textarea className="form-textarea" value={form.address} rows={3}
                onChange={e => set("address", e.target.value)}
                placeholder="ที่อยู่เต็ม รวมจังหวัดและรหัสไปรษณีย์"
                style={{ resize: "vertical" }} />
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
