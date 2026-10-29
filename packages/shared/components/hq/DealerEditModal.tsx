"use client";

// ── แก้ไขข้อมูลดีลเลอร์ (ย้ายจากหน้าทะเบียนมาหน้ารายละเอียด · บอสตัดสิน 19 ต.ค. 69 · รอบ 2 ช่วง ข) ──────────────────────
//   แถวทะเบียนเหลือ "เข้าระบบแทน" + กดแถวเปิดหน้ารายละเอียด · แก้ไข/ปิดใช้งาน/สถิติ อยู่ที่หน้ารายละเอียด
//   ฟิลด์และกติกาเหมือนเดิมทุกข้อ: รหัสแก้ไม่ได้ · ภาคก่อนจังหวัด (ทุกภาค = ทุกจังหวัด) · เป้าไม่ติดลบ · จังหวัดเดิมนอกภาคยังเห็นค่าเดิม
import { ProvinceSelect } from "@pms/shared/components/ui/ProvinceSelect";
import { useState } from "react";
import { X } from "lucide-react";
import { ModalCard } from "@pms/shared/components/ui/ModalCard";
import { formatMoneyInput, parseMoneyInput } from "@pms/shared/lib/format";
import { provincesOfRegion, ALL_REGIONS, ALL_PROVINCES } from "@pms/shared/lib/provinces";
import { PACKAGE_ORDER, packageLabel } from "@pms/shared/lib/dealerProposals";
import { dealerStatusLabel, type DealerRow, type DealerStatus } from "@pms/shared/lib/mock";
import type { DealerPackage } from "@pms/shared/lib/data/types";

const REGIONS = ["เหนือ", "กลาง", "ตะวันออก", "ตะวันตก", "ใต้", "อีสาน"];
const CARD: React.CSSProperties = { background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", boxShadow: "0 2px 14px rgba(0,51,102,.07)" };
const INPUT_STYLE: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: "0.8rem", color: "#2D2D2D", outline: "none", background: "#fafafa", boxSizing: "border-box" };

function InputField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label className="form-label" style={{ textTransform: "none", letterSpacing: "normal", fontSize: "0.72rem" }}>{label}</label>
      {children}
    </div>
  );
}

export type DealerEdit = Pick<DealerRow, "name" | "province" | "region" | "revenueTarget" | "status"> & { package: DealerPackage | null };

export function DealerEditModal({ dealer, onClose, onSave }: {
  dealer: DealerRow;
  onClose: () => void;
  /** บันทึก — โยน error = แสดงในหน้าต่าง ไม่ปิด */
  onSave: (edit: DealerEdit) => Promise<void>;
}) {
  // ช่องที่ฐานเก็บเป็นค่าว่าง (null) ต้องเป็น "" ในฟอร์ม — เดิมกดบันทึกแล้วหน้าเว็บพัง (null.trim) แทนที่จะบอกว่าต้องเลือกภาค
  //   (ทดลองใช้เว็บแทนบอส 21 ต.ค. 69 · สาขาที่ไม่มีภาค · ข้อทดสอบ dealer-edit-null-fields.spec.ts)
  const [form, setForm] = useState({
    name: dealer.name ?? "", province: dealer.province ?? "", region: dealer.region ?? "", revenueTarget: dealer.revenueTarget,
    package: (dealer.package ?? "") as DealerPackage | "", status: dealer.status as DealerStatus,
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // เปลี่ยนภาค: จังหวัดที่ไม่อยู่ในภาคใหม่ถูกล้าง (กันข้อมูลขัดกันเอง) · ทุกภาค = ทุกจังหวัด
  function changeRegion(region: string) {
    // "ทุกจังหวัด" ใช้กับแถวสำนักงานใหญ่เท่านั้น — ดีลเลอร์ต้องดูแล 1 จังหวัดจริง (บอสสั่ง 29 ต.ค. 69)
    setForm(f => ({ ...f, region, province: region === ALL_REGIONS && dealer.code === "HQ" ? ALL_PROVINCES : provincesOfRegion(region).includes(f.province) ? f.province : "" }));
  }

  async function save() {
    if (!form.name.trim()) { setErr("ต้องระบุชื่อดีลเลอร์"); return; }
    if (!form.region.trim()) { setErr("ต้องเลือกภาคก่อน — รายการจังหวัดขึ้นกับภาคที่เลือก"); return; }
    if (!form.province.trim()) { setErr("ต้องระบุจังหวัด"); return; }
    setBusy(true); setErr("");
    try {
      await onSave({ name: form.name.trim(), province: form.province.trim(), region: form.region, revenueTarget: form.revenueTarget,
        package: form.package || null, status: form.status });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.42)", zIndex: 1050, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <ModalCard onClose={onClose} label="ฟอร์มข้อมูลดีลเลอร์" className="modal-fit" style={{ ...CARD, width: 460, maxWidth: "100%" }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "#2D2D2D" }}>แก้ไขข้อมูลดีลเลอร์</h2>
          <button onClick={onClose} aria-label="ปิด" style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", display: "flex" }}><X size={18} /></button>
        </div>
        <div className="modal-fit-body" style={{ padding: "18px 20px" }}>
          {err && <div role="alert" style={{ background: "#fee2e2", border: "1px solid #dc262630", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: "0.8rem", color: "#dc2626", fontWeight: 600 }}>{err}</div>}
          <div className="form-grid" style={{ gridTemplateColumns: "1fr 2fr" }}>
            <div className="form-section">ข้อมูลดีลเลอร์</div>
            <InputField label="รหัสดีลเลอร์ *">
              <input value={dealer.code} disabled aria-label="รหัสดีลเลอร์"
                style={{ ...INPUT_STYLE, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em", opacity: 0.6 }} />
              <div style={{ fontSize: "0.65rem", color: "#6b7280", marginTop: 3 }}>แก้ไขรหัสไม่ได้</div>
            </InputField>
            <InputField label="ชื่อดีลเลอร์ *">
              <input aria-label="ชื่อดีลเลอร์" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={INPUT_STYLE} />
            </InputField>
          </div>
          <div className="form-grid">
            <div className="form-section">พื้นที่รับผิดชอบ</div>
            <InputField label="ภาค *">
              <select aria-label="ภูมิภาค" value={form.region} onChange={e => changeRegion(e.target.value)} style={{ ...INPUT_STYLE, cursor: "pointer" }}>
                <option value="">— ยังไม่ระบุ —</option>
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                <option value={ALL_REGIONS}>{ALL_REGIONS} (ทั่วประเทศ)</option>
              </select>
            </InputField>
            <InputField label="จังหวัดที่ตั้ง *">
              {/* ดีลเลอร์ดูแล 1 จังหวัดพอดี = จังหวัดที่ตั้ง (บอสสั่ง 29 ต.ค. 69 · ฐานกัน ใบ 0259) — ไม่มี "ทุกจังหวัด" */}
              <ProvinceSelect label="จังหวัดที่ตั้ง" value={form.province} onChange={v => setForm(f => ({ ...f, province: v }))} style={{ ...INPUT_STYLE, cursor: "pointer" }}
                options={provincesOfRegion(form.region)} ว่าง={form.region ? "— ยังไม่ระบุ —" : "— เลือกภาคก่อน —"}
                ก่อน={dealer.code === "HQ" && form.region === ALL_REGIONS && <option value={ALL_PROVINCES}>{ALL_PROVINCES}</option>}
                หลัง={form.province && form.province !== ALL_PROVINCES && !provincesOfRegion(form.region).includes(form.province) && (
                  <option value={form.province}>{form.province} (นอกภาค {form.region})</option>
                )} />
            </InputField>
            <div className="form-section">เป้าหมายและสถานะ</div>
            <InputField label="แพ็กเกจ">
              <select aria-label="แพ็กเกจดีลเลอร์" value={form.package} onChange={e => setForm(f => ({ ...f, package: e.target.value as DealerPackage | "" }))} style={{ ...INPUT_STYLE, cursor: "pointer" }}>
                <option value="">— ยังไม่ระบุ —</option>
                {PACKAGE_ORDER.map(k => <option key={k} value={k}>{packageLabel[k]}</option>)}
              </select>
            </InputField>
            <InputField label="เป้ายอดขาย (บาท/ปี)">
              {/* เป้าเป็นของดีลเลอร์รายนี้ (ใบ 0206) · ช่องเงินใส่ลูกน้ำเอง · ติดลบไม่ได้ */}
              <input type="text" inputMode="numeric" aria-label="เป้ายอดขายทั้งปี"
                value={form.revenueTarget ? formatMoneyInput(String(form.revenueTarget)) : ""}
                onChange={e => setForm(f => ({ ...f, revenueTarget: parseMoneyInput(e.target.value) }))} placeholder="0" style={INPUT_STYLE} />
            </InputField>
            <InputField label="สถานะ">
              {/* ต้องมีค่าเสมอ — ดีลเลอร์ต้องเป็นเปิดหรือปิดใช้งานอย่างใดอย่างหนึ่ง ว่างไม่ได้ */}
              <select aria-label="สถานะดีลเลอร์" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as DealerStatus }))} style={{ ...INPUT_STYLE, cursor: "pointer" }}>
                <option value="active">{dealerStatusLabel.active}</option>
                <option value="inactive">{dealerStatusLabel.inactive}</option>
              </select>
            </InputField>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button onClick={onClose} className="btn btn-secondary btn-md">ยกเลิก</button>
            <button onClick={() => void save()} disabled={busy} className="btn btn-primary btn-md">{busy ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}</button>
          </div>
        </div>
      </ModalCard>
    </div>
  );
}
