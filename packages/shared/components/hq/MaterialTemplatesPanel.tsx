"use client";

// ── ตั้งค่า › แม่แบบวัสดุ (HQ · บอสสั่ง 26 ต.ค. 69 · ใบ 0244) ─────────────────────────────────────────────────────────
//
// หมวด (พิมพ์เอง มีหมวดเดิมให้เลือก) · ชื่อวัสดุ · หน่วย · ราคาต่อหน่วย (ราคาส่งดีลเลอร์ ก่อน VAT) · เปิด/ปิดใช้ · วันที่อัปเดตราคา
//   บันทึกด้วยปุ่มบันทึกกลางของหน้าตั้งค่า (settingsBus) — ฐานบันทึกทั้งชุดในคำสั่งเดียว + ลงบันทึกการใช้งานเอง
//   วันที่อัปเดตราคา ฐานประทับเองเมื่อราคาเปลี่ยน (หน้าเว็บแก้ไม่ได้) · ดีลเลอร์เห็นเฉพาะที่เปิดใช้
//   บนหัว: ค่าเฉลี่ย % ราคาประเมินคลาดจากใบ HQ (คำขอที่ HQ ส่งใบแล้ว) · ยังไม่มี = "—"
import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Plus, Search, Trash2, CheckCircle2, Target, Tags } from "lucide-react";
import { materialTemplates as repo } from "@pms/shared/lib/data";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { useReportSection, useSettingsToast } from "@pms/shared/lib/settingsBus";
import { แจ้งพลาด } from "@pms/shared/components/ui/ConfirmToast";
import { NumberInput } from "@pms/shared/components/ui/NumberInput";
import { KpiRow, KpiCard } from "@pms/shared/components/ui/KpiCard";
import { TablePagination, pageSlice, pageCountOf } from "@pms/shared/components/ui/TablePagination";
import { SectionCard } from "@pms/shared/components/ui/SectionCard";
import { หน่วยBOQ, วันไทยสั้น } from "@pms/shared/lib/quoteRequests";
import {
  type MaterialTemplate, type EstimateAccuracy, หมวดที่มี, ค้นแม่แบบ, ป้ายเปอร์เซ็นต์คลาด,
} from "@pms/shared/lib/materialTemplates";

const NAVY = "#003366";
const ช่องกรอก: React.CSSProperties = { width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 8px", fontSize: "0.84rem", boxSizing: "border-box" };

/** แถวบนจอ — key ใช้แทน id ของแถวใหม่ที่ยังไม่บันทึก */
type แถว = Omit<MaterialTemplate, "id" | "priceUpdatedAt"> & { key: string; id?: number; priceUpdatedAt?: string };
const จากฐาน = (t: MaterialTemplate): แถว => ({ ...t, unitPrice: Number(t.unitPrice), key: `id-${t.id}` });
const ภาพ = (rows: แถว[]) => JSON.stringify(rows.map(r => [r.id ?? null, r.category.trim(), r.name.trim(), r.unit.trim(), Number(r.unitPrice), r.active]));
let ลำดับใหม่ = 0;

export function MaterialTemplatesPanel() {
  const [บันทึกแล้ว, setบันทึกแล้ว] = useState<แถว[] | null>(null);
  const [rows, setRows] = useState<แถว[]>([]);
  const [ค้น, setค้น] = useState("");
  const [หน้า, setหน้า] = useState(0);
  const [ความแม่น, setความแม่น] = useState<EstimateAccuracy | null>(null);
  const toast = useSettingsToast();

  const โหลด = useCallback(() => {
    repo.list().then(ls => { const r = ls.map(จากฐาน); setบันทึกแล้ว(r); setRows(r); }).catch(e => logRepoRead("materialTemplates.list", e));
    repo.accuracy().then(setความแม่น).catch(e => logRepoRead("materialTemplates.accuracy", e));
  }, []);
  useEffect(โหลด, [โหลด]);

  const dirty = บันทึกแล้ว !== null && ภาพ(rows) !== ภาพ(บันทึกแล้ว);
  const save = useCallback(() => {
    const ว่าง = rows.find(r => !r.name.trim());
    if (ว่าง) { แจ้งพลาด("ทุกรายการต้องมีชื่อวัสดุ — ลบแถวที่ไม่ใช้ หรือพิมพ์ชื่อก่อนบันทึก"); return; }
    const ยังอยู่ = new Set(rows.map(r => r.id).filter((x): x is number => x != null));
    const ลบ = (บันทึกแล้ว ?? []).map(r => r.id!).filter(id => !ยังอยู่.has(id));
    const ส่ง = rows.map(r => ({ id: r.id, category: r.category.trim(), name: r.name.trim(), unit: r.unit.trim(), unitPrice: Number(r.unitPrice), active: r.active }));
    repo.save(ส่ง, ลบ)
      .then(ls => { const r = ls.map(จากฐาน); setบันทึกแล้ว(r); setRows(r); toast("บันทึกแม่แบบวัสดุแล้ว"); })
      .catch(e => แจ้งพลาด("บันทึกแม่แบบวัสดุไม่สำเร็จ: " + friendlyError(e)));
  }, [rows, บันทึกแล้ว, toast]);
  const reset = useCallback(() => { if (บันทึกแล้ว) setRows(บันทึกแล้ว); }, [บันทึกแล้ว]);
  useReportSection(useMemo(() => ({ dirty, save, reset }), [dirty, save, reset]));

  const หมวด = useMemo(() => หมวดที่มี(rows), [rows]);
  const แสดง = useMemo(() => ค้นแม่แบบ(rows, ค้น), [rows, ค้น]);
  const แก้ = (key: string, patch: Partial<แถว>) => setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r));
  // เพิ่มแถวใหม่ไว้บนสุด (ตารางเรียงใหม่สุดก่อน · ความจำ newest-first-tables) แล้วกลับหน้าแรกให้เห็นแถวที่เพิ่ม
  const เพิ่ม = () => { setค้น(""); setหน้า(0); setRows(rs => [{ key: `new-${++ลำดับใหม่}`, category: "", name: "", unit: "", unitPrice: 0, active: true }, ...rs]); };
  const เปิดใช้ = rows.filter(r => r.active).length;

  const หน้าจริง = Math.min(หน้า, pageCountOf(แสดง.length) - 1);
  const ในหน้า = pageSlice(แสดง, หน้าจริง);

  // เลย์เอาต์ประกอบจากตัวกลางทั้งหมด ไม่เขียนระยะห่างเอง (บอสสั่ง 27 ต.ค. 69): แถวการ์ด KPI (KpiRow) 
  //   → กรอบหัวข้อเดียวกับแท็บอื่น (SectionCard: .card-header/.card-body) + ตารางกลาง (.table-wrap · colgroup) + แถบเปลี่ยนหน้า (TablePagination)
  return (
    <div data-panel="material-templates">
      <KpiRow label="สรุปแม่แบบวัสดุ">
        <KpiCard kpi="mt-total" icon={Boxes} label="วัสดุทั้งหมด" value={บันทึกแล้ว ? String(บันทึกแล้ว.length) : null} rawValue={บันทึกแล้ว?.length ?? null} unit="รายการ" empty="กำลังโหลด…" />
        <KpiCard kpi="mt-active" icon={CheckCircle2} color="#16A34A" bg="#E6F7EE" label="เปิดใช้ (ดีลเลอร์เห็น)" value={บันทึกแล้ว ? String(บันทึกแล้ว.filter(r => r.active).length) : null}
          rawValue={บันทึกแล้ว?.filter(r => r.active).length ?? null} unit="รายการ" empty="กำลังโหลด…" />
        <KpiCard kpi="mt-accuracy" icon={Target} color="#7C3AED" bg="#F3E8FF" testId="estimate-accuracy" label="ราคาประเมินคลาดจากใบ HQ (เฉลี่ย)"
          value={ความแม่น && ความแม่น.n > 0 && ความแม่น.avgAbsPct != null ? `${Number(ความแม่น.avgAbsPct).toFixed(1)}%` : null}
          rawValue={ความแม่น?.avgAbsPct ?? null} empty="ยังไม่มีคำขอที่มีราคาประเมินและ HQ ส่งใบแล้ว"
          sub={ความแม่น && ความแม่น.n > 0 ? `จาก ${ความแม่น.n} คำขอ · ตามทิศ ${ป้ายเปอร์เซ็นต์คลาด(ความแม่น.avgPct)}` : undefined} />
        <KpiCard kpi="mt-categories" icon={Tags} color="#EA580C" bg="#FEF0E6" label="หมวด" value={บันทึกแล้ว ? String(หมวดที่มี(บันทึกแล้ว).length) : null}
          rawValue={บันทึกแล้ว ? หมวดที่มี(บันทึกแล้ว).length : null} unit="หมวด" empty="กำลังโหลด…" />
      </KpiRow>

      {/* ค้นหา · จำนวน · ปุ่มเพิ่ม อยู่ในส่วนหัวของกรอบหัวข้อกลาง (.card-header-actions) */}
      <SectionCard icon={<Boxes size={19} />} title="แม่แบบวัสดุ" action={
        <div className="card-header-actions">
          <div className="search-bar">
            <Search size={14} color="#9ca3af" />
            <input aria-label="ค้นแม่แบบวัสดุ" placeholder="ค้นชื่อ / หมวด / หน่วย" value={ค้น} onChange={e => { setค้น(e.target.value); setหน้า(0); }} />
          </div>
          <span className="note">เปิดใช้ {เปิดใช้} จาก {rows.length} รายการ</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={เพิ่ม}><Plus size={14} /> เพิ่มวัสดุ</button>
        </div>
      }>
        <datalist id="mt-categories">{หมวด.map(h => <option key={h} value={h} />)}</datalist>
        <datalist id="mt-units">{หน่วยBOQ.map(u => <option key={u} value={u} />)}</datalist>

        <div className="table-wrap">
          <table aria-label="แม่แบบวัสดุ" style={{ minWidth: 860 }}>
            <colgroup>
              <col style={{ width: "17%" }} /><col style={{ width: "30%" }} /><col style={{ width: "11%" }} />
              <col style={{ width: "15%" }} /><col style={{ width: "10%" }} /><col style={{ width: "12%" }} /><col style={{ width: "5%" }} />
            </colgroup>
            <thead>
              <tr><th>หมวด</th><th>ชื่อวัสดุ</th><th>หน่วย</th><th className="num">ราคาต่อหน่วย (ก่อน VAT)</th><th>เปิดใช้</th><th>อัปเดตราคา</th><th aria-label="ลบ" /></tr>
            </thead>
            <tbody>
              {บันทึกแล้ว === null && <tr><td colSpan={7} className="empty-row">กำลังโหลด…</td></tr>}
              {บันทึกแล้ว !== null && แสดง.length === 0 && (
                <tr><td colSpan={7} className="empty-row">{rows.length ? "ไม่พบวัสดุที่ค้น" : "ยังไม่มีแม่แบบวัสดุ — กด “เพิ่มวัสดุ” เพื่อเริ่ม"}</td></tr>
              )}
              {ในหน้า.map((r, i) => (
                <tr key={r.key} data-mt-row={r.id ?? "new"} style={r.active ? undefined : { opacity: 0.6 }}>
                  <td><input list="mt-categories" aria-label={`หมวด ${i + 1}`} style={ช่องกรอก} value={r.category} maxLength={80} placeholder="เช่น ผนัง" onChange={e => แก้(r.key, { category: e.target.value })} /></td>
                  <td><input aria-label={`ชื่อวัสดุ ${i + 1}`} style={ช่องกรอก} value={r.name} maxLength={200} placeholder="เช่น ผนังเมทัลชีท 0.35 มม." onChange={e => แก้(r.key, { name: e.target.value })} /></td>
                  <td><input list="mt-units" aria-label={`หน่วย ${i + 1}`} style={ช่องกรอก} value={r.unit} maxLength={40} onChange={e => แก้(r.key, { unit: e.target.value })} /></td>
                  <td className="num"><NumberInput ariaLabel={`ราคาต่อหน่วย ${i + 1}`} value={Number(r.unitPrice)} min={0} onChange={n => แก้(r.key, { unitPrice: n })} style={{ ...ช่องกรอก, textAlign: "right" }} /></td>
                  <td><label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.8rem", cursor: "pointer" }}>
                    <input type="checkbox" aria-label={`เปิดใช้ ${i + 1}`} checked={r.active} onChange={e => แก้(r.key, { active: e.target.checked })} />{r.active ? "เปิด" : "ปิด"}
                  </label></td>
                  <td style={{ fontSize: "0.78rem", color: "var(--muted-foreground)" }} data-testid="price-updated">{r.priceUpdatedAt ? วันไทยสั้น(r.priceUpdatedAt) : "ยังไม่บันทึก"}</td>
                  <td><button type="button" aria-label={`ลบ ${r.name || `แถว ${i + 1}`}`} onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))}
                    style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", display: "flex", padding: 4 }}><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination page={หน้าจริง} total={แสดง.length} onPage={setหน้า} />
      </SectionCard>
    </div>
  );
}
