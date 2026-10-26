"use client";

// ── หน้าต่าง "เลือกจากแม่แบบวัสดุ" ของใบ HQ (H8 · บอสสั่ง 26 ต.ค. 69 · ใบ 0244) ──────────────────────────────────────
//
// แหล่งรายการหนึ่งของตาราง BOQ กลาง (BoqTable แหล่ง) — ค้นได้ · กดเพิ่มทีละรายการ (จำนวน 1 · ต้นทุน = ราคาแม่แบบ ณ ตอนนี้ แก้ต่อในตาราง)
//   รายการที่เลือกเข้าตารางทาง แทรก() ทางเดียว (ตารางไม่ต้องรู้ว่ามาจากไหน) · แสดงเฉพาะแม่แบบที่เปิดใช้
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { materialTemplates as repo } from "@pms/shared/lib/data";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { ModalCard } from "@pms/shared/components/ui/ModalCard";
import type { แถววาง } from "@pms/shared/lib/quoteRequests";
import { type MaterialTemplate, ค้นแม่แบบ, แม่แบบเป็นแถวHQ } from "@pms/shared/lib/materialTemplates";

const NAVY = "#003366";
const บาท = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function MaterialTemplatePicker({ onAdd, onClose }: { onAdd: (rows: แถววาง[]) => void; onClose: () => void }) {
  const [แม่แบบ, setแม่แบบ] = useState<MaterialTemplate[] | null>(null);
  const [ค้น, setค้น] = useState("");
  const [เพิ่มแล้ว, setเพิ่มแล้ว] = useState(0);
  useEffect(() => {
    let alive = true;
    repo.list().then(ls => alive && setแม่แบบ(ls.filter(t => t.active))).catch(e => { logRepoRead("materialTemplates.list(hq-quote)", e); if (alive) setแม่แบบ([]); });
    return () => { alive = false; };
  }, []);
  const แสดง = useMemo(() => ค้นแม่แบบ(แม่แบบ ?? [], ค้น).slice(0, 200), [แม่แบบ, ค้น]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.42)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <ModalCard onClose={onClose} label="เลือกจากแม่แบบวัสดุ"
        style={{ width: 640, maxWidth: "100%", maxHeight: "86vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 16, boxShadow: "0 24px 80px rgba(0,0,0,.28)", overflow: "hidden" }}>
        <div style={{ background: NAVY, color: "#fff", padding: "12px 18px", display: "flex", alignItems: "center", gap: 10 }}>
          <strong style={{ flex: 1, fontSize: "0.95rem" }}>เลือกจากแม่แบบวัสดุ</strong>
          <button type="button" onClick={onClose} aria-label="ปิด" style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", display: "flex" }}><X size={18} /></button>
        </div>
        <div style={{ padding: "12px 18px", display: "grid", gap: 10, overflowY: "auto" }}>
          <div className="search-bar">
            <Search size={14} />
            <input aria-label="ค้นแม่แบบวัสดุ" placeholder="ค้นชื่อ / หมวด / หน่วย" value={ค้น} onChange={e => setค้น(e.target.value)} autoFocus />
          </div>
          {แม่แบบ === null && <div style={{ color: "#9ca3af", fontSize: "0.84rem" }}>กำลังโหลด…</div>}
          {แม่แบบ !== null && แสดง.length === 0 && (
            <div style={{ color: "#6b7280", fontSize: "0.84rem" }}>{แม่แบบ.length ? "ไม่พบวัสดุที่ค้น" : "ยังไม่มีแม่แบบวัสดุที่เปิดใช้ — ตั้งได้ที่ ตั้งค่า › แม่แบบวัสดุ"}</div>
          )}
          {แสดง.map(t => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #f1f5f9", paddingBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.84rem", fontWeight: 700, color: "#1f2937", overflowWrap: "anywhere" }}>{t.name}</div>
                <div style={{ fontSize: "0.74rem", color: "#6b7280" }}>{t.category || "ไม่มีหมวด"} · {บาท(Number(t.unitPrice))} บาท/{t.unit || "หน่วย"}</div>
              </div>
              <button type="button" className="btn btn-outline btn-sm" aria-label={`เพิ่ม ${t.name}`}
                onClick={() => { onAdd([แม่แบบเป็นแถวHQ(t)]); setเพิ่มแล้ว(n => n + 1); }}><Plus size={13} /> เพิ่ม</button>
            </div>
          ))}
        </div>
        <div style={{ padding: "10px 18px", borderTop: "1px solid #eef1f5", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ flex: 1, fontSize: "0.76rem", color: "#6b7280" }}>{เพิ่มแล้ว ? `เพิ่มเข้าตารางแล้ว ${เพิ่มแล้ว} รายการ — แก้จำนวน/ต้นทุนต่อในตาราง` : "กดเพิ่มได้หลายรายการ"}</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>เสร็จ</button>
        </div>
      </ModalCard>
    </div>
  );
}
