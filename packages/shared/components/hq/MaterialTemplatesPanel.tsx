"use client";

// ── ตั้งค่า › รายการวัสดุ (HQ · บอสสั่ง 26 ต.ค. 69 · ใบ 0244) ─────────────────────────────────────────────────────────
//
// หมวด (พิมพ์เอง มีหมวดเดิมให้เลือก) · ชื่อวัสดุ · หน่วย · ราคาต่อหน่วย (ราคาส่งดีลเลอร์ ก่อน VAT) · เปิด/ปิดใช้ · วันที่อัปเดตราคา
//   บันทึกด้วยปุ่มบันทึกกลางของหน้าตั้งค่า (settingsBus) — ฐานบันทึกทั้งชุดในคำสั่งเดียว + ลงบันทึกการใช้งานเอง
//   วันที่อัปเดตราคา ฐานประทับเองเมื่อราคาเปลี่ยน (หน้าเว็บแก้ไม่ได้) · ดีลเลอร์เห็นเฉพาะที่เปิดใช้
//   บนหัว: ค่าเฉลี่ย % ราคาประเมินคลาดจากใบ HQ (คำขอที่ HQ ส่งใบแล้ว) · ยังไม่มี = "—"
//   ลบได้เฉพาะวัสดุที่ยังไม่เคยใช้ในคำขอ/ใบ HQ (บอสสั่ง 2 พ.ย. 69 · ใบ 0271) — เคยใช้แล้ว = ไม่มีปุ่มลบ ให้ปิดใช้แทน · ฐานกันเอง
//   เพิ่ม 2 ทาง (บอสสั่ง 5 พ.ย. 69): "เพิ่มวัสดุ" = ตารางกรอกหลายแถว บันทึกครั้งเดียว (MaterialAddModal)
//     · "นำเข้าจากไฟล์" = เมนูนำเข้าตัวกลาง Excel/CSV/แบบฟอร์มตัวอย่าง/ชุดที่นำเข้าล่าสุด (MaterialImportModal · ใบ 0279)
//     ตารางมีการแก้ที่ยังไม่บันทึก = ต้องบันทึก/ยกเลิกก่อน (บันทึกจาก 2 ทางนี้โหลดรายการใหม่ทับตาราง)
import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Plus, Search, Trash2, CheckCircle2, Target, Tags, History } from "lucide-react";
import { ImportMenu } from "@pms/shared/components/ui/ImportMenu";
import { MaterialImportModal } from "@pms/shared/components/hq/MaterialImportModal";
import { MaterialAddModal } from "@pms/shared/components/hq/MaterialAddModal";
import { สร้างไฟล์Xlsx, ดาวน์โหลดไฟล์ } from "@pms/shared/lib/exportWorkbook";
import { หัวแบบฟอร์มวัสดุ, ลำดับช่องวัสดุ } from "@pms/shared/lib/materialImport";
import { materialTemplates as repo } from "@pms/shared/lib/data";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { useReportSection, useSettingsToast } from "@pms/shared/lib/settingsBus";
import { แจ้งพลาด } from "@pms/shared/components/ui/ConfirmToast";
import { NumberInput } from "@pms/shared/components/ui/NumberInput";
import { KpiRow, KpiCard } from "@pms/shared/components/ui/KpiCard";
import { TablePagination, pageSlice, pageCountOf, ROWS_PER_PAGE } from "@pms/shared/components/ui/TablePagination";
import { ดาวบังคับ, กรอบผิด, useช่องบังคับ } from "@pms/shared/components/ui/FieldLabel";
import type { ช่องบังคับ } from "@pms/shared/lib/requiredFields";
import { SectionCard } from "@pms/shared/components/ui/SectionCard";
import { วันไทยสั้น } from "@pms/shared/lib/quoteRequests";
import { UnitSelect, useรายการหน่วย, ล้างหน่วยจากวัสดุ } from "@pms/shared/components/ui/UnitSelect";
import { ตารางรายการ } from "@pms/shared/components/ui/LineItemsTable";
import {
  type MaterialTemplate, type EstimateAccuracy, หมวดที่มี, ค้นแม่แบบ, ป้ายเปอร์เซ็นต์คลาด,
} from "@pms/shared/lib/materialTemplates";

const NAVY = "#003366";
const ช่องกรอก: React.CSSProperties = { width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 8px", fontSize: "0.84rem", boxSizing: "border-box" };

/** แถวบนจอ — key ใช้แทน id ของแถวใหม่ที่ยังไม่บันทึก */
type แถว = Omit<MaterialTemplate, "id" | "priceUpdatedAt"> & { key: string; id?: number; priceUpdatedAt?: string };
const จากฐาน = (t: MaterialTemplate): แถว => ({ ...t, unitPrice: Number(t.unitPrice), key: `id-${t.id}` });
const ภาพ = (rows: แถว[]) => JSON.stringify(rows.map(r => [r.id ?? null, r.category.trim(), r.name.trim(), r.unit.trim(), Number(r.unitPrice), r.active]));

export function MaterialTemplatesPanel() {
  const [บันทึกแล้ว, setบันทึกแล้ว] = useState<แถว[] | null>(null);
  const [rows, setRows] = useState<แถว[]>([]);
  const [ค้น, setค้น] = useState("");
  const [หน้า, setหน้า] = useState(0);
  const [ความแม่น, setความแม่น] = useState<EstimateAccuracy | null>(null);
  // ยังไม่รู้ว่าเคยใช้หรือไม่ (กำลังโหลด) = ซ่อนปุ่มลบไว้ก่อน — ไม่ให้กดลบวัสดุที่อาจเคยใช้แล้ว
  const [เคยใช้, setเคยใช้] = useState<Set<number> | null>(null);
  const [เปิดเพิ่ม, setเปิดเพิ่ม] = useState(false);
  // รายการจากฐาน (ทุกแถวมี id) — ใช้ตรวจซ้ำของ 2 ทางเพิ่ม
  const [นำเข้า, setนำเข้า] = useState<{ ไฟล์: File | null } | null>(null);
  const toast = useSettingsToast();
  // ช่องบังคับ (บอสสั่ง 4 พ.ย. 69 · ตัวกลาง): ชื่อวัสดุ · หน่วย ทุกแถว (* ที่หัวคอลัมน์)
  //   ราคาต่อหน่วยเป็นช่องตัวเลข ว่างไม่ได้จริง (เว้นว่าง = 0) จึงไม่มี * — เดิมใส่ * แล้วหัว "ราคาต่อหน่วย (ก่อน VAT)" ตัดบรรทัด
  //   หัวไม่ตรงแนวข้อมูล (รอบตรวจ deploy16 · qty-unit-columns.spec)
  //   ขาด = ไม่บันทึก · กรอบแดงช่องที่ขาด · พาไปหน้าของแถวแรกที่ขาดแล้วเลื่อนไปช่องนั้น
  const บังคับ = useช่องบังคับ();
  const ช่องของแถว = (rs: แถว[]): ช่องบังคับ[] => rs.flatMap(r => [
    { key: `name:${r.key}`, label: "ชื่อวัสดุ", value: r.name },
    { key: `unit:${r.key}`, label: "หน่วย", value: r.unit },
  ]);
  // ช่องหน่วยแบบดรอปดาวน์ (บอสสั่ง 3 พ.ย. 69) — หน่วยมาตรฐาน + หน่วยที่รายการวัสดุใช้อยู่ (รวมแถวที่เพิ่งพิมพ์)
  const หน่วย = useรายการหน่วย(rows.map(r => r.unit));

  const โหลด = useCallback(() => {
    repo.list().then(ls => { const r = ls.map(จากฐาน); setบันทึกแล้ว(r); setRows(r); }).catch(e => logRepoRead("materialTemplates.list", e));
    repo.accuracy().then(setความแม่น).catch(e => logRepoRead("materialTemplates.accuracy", e));
    repo.used().then(ids => setเคยใช้(new Set(ids))).catch(e => logRepoRead("materialTemplates.used", e));
  }, []);
  useEffect(โหลด, [โหลด]);

  const ของเดิม = useMemo(() => (บันทึกแล้ว ?? []) as MaterialTemplate[], [บันทึกแล้ว]);
  const dirty = บันทึกแล้ว !== null && ภาพ(rows) !== ภาพ(บันทึกแล้ว);
  const save = useCallback(() => {
    const ช่อง = ช่องของแถว(rows);
    const แถวแรกที่ขาด = rows.findIndex(r => !r.name.trim() || !r.unit.trim());
    if (แถวแรกที่ขาด >= 0) {
      // แถวที่ขาดอาจอยู่หน้าอื่น/ถูกค้นซ่อน → ล้างคำค้น ไปหน้าของแถวนั้น แล้วค่อยตรวจ (ช่องต้องอยู่บนจอก่อนถึงเลื่อนไปได้)
      setค้น(""); setหน้า(Math.floor(แถวแรกที่ขาด / ROWS_PER_PAGE));
      requestAnimationFrame(() => บังคับ.ตรวจ(ช่อง));
      แจ้งพลาด(!rows[แถวแรกที่ขาด].name.trim()
        ? "ทุกรายการต้องมีชื่อวัสดุ — ลบแถวที่ไม่ใช้ หรือพิมพ์ชื่อก่อนบันทึก"
        : "ทุกรายการต้องมีหน่วย — เลือกหน่วยก่อนบันทึก");
      return false;
    }
    const ยังอยู่ = new Set(rows.map(r => r.id).filter((x): x is number => x != null));
    const ลบ = (บันทึกแล้ว ?? []).map(r => r.id!).filter(id => !ยังอยู่.has(id));
    const ส่ง = rows.map(r => ({ id: r.id, category: r.category.trim(), name: r.name.trim(), unit: r.unit.trim(), unitPrice: Number(r.unitPrice), active: r.active }));
    repo.save(ส่ง, ลบ)
      .then(ls => { const r = ls.map(จากฐาน); setบันทึกแล้ว(r); setRows(r); ล้างหน่วยจากวัสดุ(); toast("บันทึกรายการวัสดุแล้ว"); })
      .catch(e => แจ้งพลาด("บันทึกรายการวัสดุไม่สำเร็จ: " + friendlyError(e)));
  }, [rows, บันทึกแล้ว, toast, บังคับ.ตรวจ]);
  const reset = useCallback(() => { if (บันทึกแล้ว) setRows(บันทึกแล้ว); }, [บันทึกแล้ว]);
  useReportSection(useMemo(() => ({ dirty, save, reset }), [dirty, save, reset]));

  const หมวด = useMemo(() => หมวดที่มี(rows), [rows]);
  const แสดง = useMemo(() => ค้นแม่แบบ(rows, ค้น), [rows, ค้น]);
  const แก้ = (key: string, patch: Partial<แถว>) => {
    setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r));
    for (const k of Object.keys(patch)) บังคับ.ล้าง(`${k}:${key}`);
  };
  // 2 ทางเพิ่ม (บอสสั่ง 5 พ.ย. 69) — บันทึกแล้วรายการจากฐานมาแทนตาราง จึงต้องไม่มีการแก้ค้างในตาราง
  const ก่อนเพิ่ม = () => {
    if (dirty) { แจ้งพลาด("มีการแก้ในตารางที่ยังไม่บันทึก — กดบันทึกหรือยกเลิกการแก้ก่อน"); return false; }
    return true;
  };
  const เมื่อบันทึกจากหน้าต่าง = (ls: MaterialTemplate[]) => {
    const r = ls.map(จากฐาน); setบันทึกแล้ว(r); setRows(r); ล้างหน่วยจากวัสดุ(); setค้น(""); setหน้า(0);
    repo.used().then(ids => setเคยใช้(new Set(ids))).catch(e => logRepoRead("materialTemplates.used", e));
  };
  const แบบฟอร์ม = () => ดาวน์โหลดไฟล์(สร้างไฟล์Xlsx([{ ชื่อ: "รายการวัสดุ", หัวตาราง: ลำดับช่องวัสดุ.map(k => หัวแบบฟอร์มวัสดุ[k]), แถว: [] }]), "แบบฟอร์มนำเข้ารายการวัสดุ.xlsx");
  const เปิดใช้ = rows.filter(r => r.active).length;

  const หน้าจริง = Math.min(หน้า, pageCountOf(แสดง.length) - 1);
  const ในหน้า = pageSlice(แสดง, หน้าจริง);

  // เลย์เอาต์ประกอบจากตัวกลางทั้งหมด ไม่เขียนระยะห่างเอง (บอสสั่ง 27 ต.ค. 69): แถวการ์ด KPI (KpiRow) 
  //   → กรอบหัวข้อเดียวกับแท็บอื่น (SectionCard: .card-header/.card-body) + ตารางกลาง (.table-wrap · colgroup) + แถบเปลี่ยนหน้า (TablePagination)
  return (
    <div data-panel="material-templates">
      <KpiRow label="สรุปรายการวัสดุ">
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
      <SectionCard icon={<Boxes size={19} />} title="รายการวัสดุ" action={
        <div className="card-header-actions">
          <div className="search-bar">
            <Search size={14} color="#9ca3af" />
            <input aria-label="ค้นรายการวัสดุ" placeholder="ค้นชื่อ / หมวด / หน่วย" value={ค้น} onChange={e => { setค้น(e.target.value); setหน้า(0); }} />
          </div>
          <span className="note">เปิดใช้ {เปิดใช้} จาก {rows.length} รายการ</span>
          {/* ปิดไว้จนรายการโหลดเสร็จ — เดิมกดเพิ่มก่อนโหลดเสร็จ รายการจากฐานมาทับ แถวที่เพิ่มหายเงียบ ๆ (เจอจากรอบตรวจ 27 ต.ค. 69) */}
          <ImportMenu label="นำเข้าจากไฟล์" onFile={f => { if (ก่อนเพิ่ม()) setนำเข้า({ ไฟล์: f }); }} onTemplate={แบบฟอร์ม}
            extraActions={[{ label: "ชุดที่นำเข้าล่าสุด", desc: "ดู/ยกเลิกทั้งชุด", icon: <History size={15} />, onClick: () => setนำเข้า({ ไฟล์: null }) }]} />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => { if (ก่อนเพิ่ม()) setเปิดเพิ่ม(true); }} disabled={บันทึกแล้ว === null}><Plus size={14} /> เพิ่มวัสดุ</button>
        </div>
      }>
        <datalist id="mt-categories">{หมวด.map(h => <option key={h} value={h} />)}</datalist>

        {/* ตารางรายการกลาง: หน่วยชิดซ้าย · ราคาต่อหน่วยชิดขวา หัวตรงแนวข้อมูล (บอสสั่ง 30 ต.ค. 69) */}
        <ตารางรายการ ป้าย="รายการวัสดุ" ลำดับ={false} กว้างขั้นต่ำ={860} แถว={บันทึกแล้ว === null ? [] : ในหน้า}
          ว่าง={บันทึกแล้ว === null ? "กำลังโหลด…" : rows.length ? "ไม่พบวัสดุที่ค้น" : "ยังไม่มีรายการวัสดุ — กด “เพิ่มวัสดุ” เพื่อเริ่ม"}
          คุณสมบัติแถว={r => ({ "data-mt-row": String(r.id ?? "new"), style: r.active ? undefined : { opacity: 0.6 } })} คอลัมน์={[
            { key: "cat", หัว: "หมวด", ชนิด: "ข้อความ", กว้าง: "13%", แสดงเกิน: true, ค่า: (r, i) => <input list="mt-categories" aria-label={`หมวด ${i + 1}`} style={ช่องกรอก} value={r.category} maxLength={80} placeholder="เช่น ผนัง" onChange={e => แก้(r.key, { category: e.target.value })} /> },
            { key: "name", หัว: <>ชื่อวัสดุ<ดาวบังคับ /></>, ชนิด: "ข้อความ", กว้าง: "21%", แสดงเกิน: true, ค่า: (r, i) => <input aria-label={`ชื่อวัสดุ ${i + 1}`} value={r.name} maxLength={200} placeholder="เช่น ผนังเมทัลชีท 0.35 มม." onChange={e => แก้(r.key, { name: e.target.value })}
                {...บังคับ.ผูก(`name:${r.key}`)} style={{ ...ช่องกรอก, ...บังคับ.ผูก(`name:${r.key}`).style }} /> },
            { key: "unit", หัว: <>หน่วย<ดาวบังคับ /></>, ชนิด: "หน่วย", กว้าง: "12%", แสดงเกิน: true, ค่า: (r, i) => (
                <span ref={บังคับ.ผูก(`unit:${r.key}`).ref} data-field={`unit:${r.key}`} data-invalid={บังคับ.ผิด[`unit:${r.key}`] ? "1" : undefined} style={{ display: "block" }}>
                  <UnitSelect ariaLabel={`หน่วย ${i + 1}`} value={r.unit} หน่วย={หน่วย} onChange={u => แก้(r.key, { unit: u })} style={บังคับ.ผิด[`unit:${r.key}`] ? กรอบผิด : undefined} />
                </span>) },
            { key: "price", หัว: "ราคาต่อหน่วย (ก่อน VAT)", ชนิด: "เงิน", กว้าง: "17%", แสดงเกิน: true, ค่า: (r, i) => <NumberInput ariaLabel={`ราคาต่อหน่วย ${i + 1}`} value={Number(r.unitPrice)} min={0} onChange={n => แก้(r.key, { unitPrice: n })} style={{ ...ช่องกรอก, textAlign: "right" }} /> },
            { key: "active", หัว: "เปิดใช้", ชนิด: "ข้อความ", กว้าง: "9%", ค่า: (r, i) => <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.8rem", cursor: "pointer" }}>
                <input type="checkbox" aria-label={`เปิดใช้ ${i + 1}`} checked={r.active} onChange={e => แก้(r.key, { active: e.target.checked })} />{r.active ? "เปิด" : "ปิด"}
              </label> },
            { key: "updated", หัว: "อัปเดตราคา", ชนิด: "ข้อความ", กว้าง: "11%", สไตล์: () => ({ fontSize: "0.78rem", color: "var(--muted-foreground)" }),
              ค่า: r => <span data-testid="price-updated">{r.priceUpdatedAt ? วันไทยสั้น(r.priceUpdatedAt) : "ยังไม่บันทึก"}</span> },
            // % คลาดเฉลี่ยรายวัสดุ (FLOW · บอสสั่ง 30 ต.ค. 69 · ใบ 0268): ฐานคิดจากคำขอที่เลือกวัสดุนี้และ HQ ส่งใบแล้ว · ยังไม่มีคำขอ/ฐานยังไม่ถึงใบนั้น = "—"
            { key: "dev", หัว: "% คลาดเฉลี่ย", ชนิด: "เงิน", กว้าง: "12%", ค่า: r => {
                const ค = r.id != null ? ความแม่น?.byTemplate?.find(t => t.id === r.id) : undefined;
                return <span data-testid="template-deviation" data-value={ค?.avgPct ?? ""} title={ค ? `จาก ${ค.n} คำขอ` : "ยังไม่มีคำขอที่ HQ ส่งใบแล้ว"}
                  style={{ fontWeight: 700, color: ค?.avgPct != null && Math.abs(ค.avgPct) > 5 ? "#dc2626" : "#374151" }}>{ป้ายเปอร์เซ็นต์คลาด(ค?.avgPct)}</span>;
              } },
            { key: "del", หัว: "", ชนิด: "ปุ่ม", กว้าง: "5%", ค่า: (r, i) => r.id != null && (เคยใช้ === null || เคยใช้.has(r.id))
                ? <span data-mt-used={เคยใช้ ? "1" : ""} title={เคยใช้ ? "เคยใช้ในคำขอใบเสนอราคา/ใบ HQ แล้ว — ลบไม่ได้ ใช้ “ปิดใช้” แทน" : "กำลังตรวจว่าเคยใช้หรือไม่"}
                    style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{เคยใช้ ? "ใช้แล้ว" : "…"}</span>
                : <button type="button" aria-label={`ลบ ${r.name || `แถว ${i + 1}`}`} onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))}
                style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", display: "inline-flex", padding: 4 }}><Trash2 size={15} /></button> },
          ]} />
        <TablePagination page={หน้าจริง} total={แสดง.length} onPage={setหน้า} />
      </SectionCard>
      <MaterialAddModal open={เปิดเพิ่ม} onClose={() => setเปิดเพิ่ม(false)} ที่มี={ของเดิม} หน่วย={หน่วย}
        onSaved={ls => { setเปิดเพิ่ม(false); เมื่อบันทึกจากหน้าต่าง(ls); }} />
      <MaterialImportModal open={!!นำเข้า} ไฟล์เริ่ม={นำเข้า?.ไฟล์} onClose={() => setนำเข้า(null)} ที่มี={ของเดิม} หน่วย={หน่วย}
        onImported={() => { repo.list().then(เมื่อบันทึกจากหน้าต่าง).catch(e => logRepoRead("materialTemplates.list", e)); }} />
    </div>
  );
}
