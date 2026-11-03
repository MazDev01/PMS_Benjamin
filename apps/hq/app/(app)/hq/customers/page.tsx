"use client";
import { วันที่ขายของใบ } from "@pms/shared/lib/salesDate";
import { TopbarActions } from "@pms/shared/components/layout/TopbarActions";

// ─── HQ · ฐานข้อมูลลูกค้าทั้งเครือ ───────────────────────────────────────────────
// ฐานข้อมูลลูกค้าหลังปิดการขาย — HQ ดูอย่างเดียว (ไม่มี เพิ่ม/แก้ไข/ลบ)
// Data Ownership เป็นของ Benjamin → เจาะดูได้ทุกดีลเลอร์
//
// ตัวกรอง "ประเภทธุรกิจ (Industry)" และคอลัมน์ "บุคคล/บริษัท" ไม่มีในหน้านี้
// เพราะระบบไม่เก็บข้อมูลสองอย่างนั้น (ตัดออกตามที่ตัดสินไว้ — อย่าใส่กลับโดยไม่มีฟิลด์จริง)
//
// ไม่ใช้ตัวกรองช่วงเวลาส่วนกลาง (FilterBar) บนหน้านี้ — นี่คือ "ฐานข้อมูล" ไม่ใช่รายงานรายงวด
// ถ้าผูกกับ FilterBar ลูกค้าที่ซื้อครั้งสุดท้ายก่อนช่วงนั้นจะหายไปทั้งราย ตั้งแต่เปิดหน้ามา
// (ตัวเลือกกว้างสุดของ FilterBar คือ "ปีนี้" → ลูกค้าที่ซื้อปี 2568 ลงไปจะไม่มีวันแสดง)
// ⚠️ บอสสั่งเพิ่มตัวกรองเวลา 24 ส.ค. 69 → เพิ่มเป็นตัวกรอง "ซื้อล่าสุด" ของหน้านี้เอง
//    ค่าเริ่มต้น "ทุกช่วงเวลา" (ไม่กรอง) เพื่อไม่ให้เปิดหน้ามาแล้วลูกค้าเก่าหายเงียบ ๆ ตามเหตุผลข้างบน
//    กรองด้วย last_purchase_at (วันปิดการขายล่าสุด) — ค่าที่มีอยู่แล้ว ไม่ได้เพิ่มข้อมูลใหม่ (ใบ 0159)
// ⚠️ เคยมีตัวกรอง "ปีที่ส่งมอบ" ตรงนี้ — ลบทั้งฟีเจอร์แล้ว (บอสสั่ง 20 ส.ค. 69)
//    ไม่มีที่กรอกวันส่งมอบจริงทั้งสองแอป ตัวเลขที่เคยโชว์คือ "วันปิดการขาย + 90 วัน" ที่ระบบคิดเอง
//
// ── M9 Phase 6: filter + pagination + KPI/กราฟ ย้ายไปคำนวณที่ DB (migration 0080) ──
// เดิมดึงลูกค้าทั้งเครือมาไว้ในเครื่องทั้งก้อนแล้วทำทุกอย่างฝั่ง client — ที่สเกลจริง (พันรายขึ้นไป) ไม่ไหว
// supabase: useHQCustomersPage (RPC) · local/demo: useCustomerDbLocal (client, ไม่ยิง fetch)
import { useState, useMemo, useEffect } from "react";
import { useFilters, APP_NOW } from "@pms/shared/context/FilterContext";
import { FilterBar } from "@pms/shared/components/filters/FilterBar";
import { Search } from "lucide-react";
import { ExportMenu } from "@pms/shared/components/ui/ExportMenu";
import { customerCode, fmtISOToThai } from "@pms/shared/lib/mock";
import { useCustomerDbLocal, buildingOf, regionOf, type CustomerDbRow } from "@pms/shared/lib/customerDb";
import { useHQCustomersPage, useCustomerBuildings } from "@pms/shared/lib/useNetworkData";
import { metrics as metricsRepo } from "@pms/shared/lib/data";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";
import type { HQCustomerPageRow } from "@pms/shared/lib/data/ports";
import { หัวเจาะลึก, useเจาะลึก, ในขอบเขต, ขอบเขตทั้งเครือ, type ขอบเขต, ป้ายระดับของขอบ } from "../_drill/DrillEngine";
import { คำอธิบายหัวข้อ } from "@pms/shared/lib/drillTitles";
import { ตั้งค่าเจาะลึกทั้งหมด } from "@pms/shared/lib/hqDrillConfig";
import { CustomerTable } from "@pms/shared/components/hq/customers/CustomerTable";
import { CustomerDrawer } from "@pms/shared/components/hq/customers/CustomerDrawer";
import { ชื่อภาค } from "@pms/shared/lib/provinces";
const isoDateOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const PAGE_SIZE = 10;

// ── เจาะลึกแบบเดียวกับภาพรวมยอดขาย (บอสสั่ง 2 พ.ย. 69 · ใบ 0271) — การ์ด/คอลัมน์จากตั้งค่ากลาง (แหล่งเดียวกับข้อทดสอบ) ──
const ตั้งค่าลูกค้า = ตั้งค่าเจาะลึกทั้งหมด.customers;

export default function HQCustomersPage() {
  // ตัวกรองเฉพาะหน้านี้ (ไม่จำข้ามหน้า) — ช่วงเวลาใช้ FilterBar ส่วนกลาง
  const [search, setSearch] = useState("");
  const [ขอบ, setขอบ] = useState<ขอบเขต>(ขอบเขตทั้งเครือ);
  const [page, setPage] = useState(0);
  const [viewId, setViewId] = useState<number | null>(null);
  // ช่วงวันที่มุมขวาบนแบบเดียวกับหน้า HQ อื่น (บอสสั่ง 30 ต.ค. 69 · แทนตัวกรอง "ทุกช่วงเวลาที่ซื้อ")
  //   ใช้กับการ์ด "ลูกค้าใหม่ในช่วงนี้" เท่านั้น — ตาราง/กราฟ/การ์ดลูกค้าทั้งหมด = ฐานข้อมูลทั้งชุด (ลูกค้าเก่าไม่หาย)
  const { timeRange } = useFilters();
  const ช่วง = useMemo(() => ({ start: isoDateOf(timeRange.start), end: isoDateOf(timeRange.end) }), [timeRange.start, timeRange.end]);
  const เจาะลึก = useเจาะลึก("customers", ช่วง.start, ช่วง.end, isoDateOf(APP_NOW));
  // รายชื่อด้านล่าง = ดีลเลอร์ในระดับที่เลือก (ทั้งเครือ = ไม่กรอง)
  const ชุดดีลเลอร์ = useMemo(() => ขอบ.ภาค || ขอบ.จังหวัด || ขอบ.ดีลเลอร์ ? ในขอบเขต(เจาะลึก?.dealers ?? [], ขอบ).map(r => r.code) : undefined, [เจาะลึก, ขอบ]);

  // เปลี่ยนตัวกรอง (ไม่ใช่หน้า) → กลับไปหน้า 1 เสมอ
  useEffect(() => { setPage(0); }, [search, ชุดดีลเลอร์]);

  // ── fallback ฝั่ง local/demo (ยังไม่กลับ) — ไม่ยิง fetch เลยในโหมด HQ+supabase (ดูคอมเมนต์ที่ hook) ──
  const localSource = useCustomerDbLocal();

  const pageOpts = useMemo(() => ({
    search: search.trim() || undefined,
    dealerCodes: ชุดดีลเลอร์,
    // ไม่ส่ง buildingType แล้ว — ตัวกรองประเภทอาคาร (แม่แบบ) ถอดออก: เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
    limit: PAGE_SIZE, offset: page * PAGE_SIZE,
  }), [search, ชุดดีลเลอร์, page]);

  const pageResult = useHQCustomersPage(pageOpts);
  // ── fallback ฝั่ง client (local/demo) — ตรรกะกรอง/เรียงเดิมเป๊ะ ──
  const localFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return localSource
      .filter(c => {
        if (q && !c.name.toLowerCase().includes(q) && !c.province.toLowerCase().includes(q)) return false;
        if (ชุดดีลเลอร์ && !ชุดดีลเลอร์.includes(c.dealerCode)) return false;
        return true;
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [localSource, search, ชุดดีลเลอร์]);

  const tableRows: HQCustomerPageRow[] = pageResult
    ? pageResult.rows
    : localFiltered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE).map(c => ({
        id: c.id, name: c.name, dealerCode: c.dealerCode, dealerName: c.dealerName, province: c.province,
        totalValue: c.totalRevenue, buildingTypes: [], templates: [], // แม่แบบ — ไม่ใช้แล้ว (ช่องยังอยู่ใน type ของ ports)
        lastPurchaseAt: c.lastPurchaseAt ? c.lastPurchaseAt.toISOString().slice(0, 10) : null,
        contact: c.contact ?? "", phone: c.phone ?? "", email: c.email ?? "", address: c.address ?? "",
      }));
  const totalCount = pageResult ? pageResult.total : localFiltered.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pagination = totalCount > 0 ? { page, pageCount, total: totalCount, onPage: setPage } : undefined;
  // supabase: RPC หน้าแรกยังไม่กลับ (pageResult ยัง null) — ต้องแยกจาก "กรองแล้วไม่เจอจริง ๆ" (Critical เดิม 30 ก.ค. 69)
  const isLoading = REAL_BACKEND && pageResult === null;

  // ── แผงรายละเอียด — local: ได้ CustomerDbRow เต็มจาก localFiltered ตรง ๆ (มี buildings อยู่แล้ว)
  //    supabase: ต้องเฟตช์ใบ won ของลูกค้ารายนั้นแยก (ไม่ได้มากับแถวสรุปที่แบ่งหน้า) ──
  const localDetail = useMemo(() => viewId != null ? localSource.find(c => c.id === viewId) ?? null : null, [viewId, localSource]);
  const remoteRowMeta = pageResult?.rows.find(r => r.id === viewId) ?? null;
  const needsRemoteDetail = !!pageResult && viewId != null && !localDetail;
  // ต้องส่งรหัสสาขาไปด้วย — เลขที่ลูกค้าซ้ำกันได้ข้ามสาขา ถ้าไม่ระบุ HQ จะดึงใบของ
  // ลูกค้าเลขเดียวกันจากสาขาอื่นมาปนในแผงนี้ (ผลตรวจรอบ 2 · ระดับสูง)
  const remoteBuildQuotes = useCustomerBuildings(needsRemoteDetail ? viewId : null, remoteRowMeta?.dealerCode ?? null);
  const viewDetail: CustomerDbRow | null = useMemo(() => {
    if (viewId == null) return null;
    if (localDetail) return localDetail;
    if (!remoteRowMeta) return null; // แถวที่คลิกมาจาก pageResult.rows อยู่แล้วเสมอ ไม่ควรเกิด แต่กันไว้
    // buildings ยังไม่มา (กำลังโหลดใบ won แยก) → เปิดแผงไปก่อนด้วย [] ชั่วคราว (โปรไฟล์/ยอดรวมมีอยู่แล้วจาก
    // แถวตารางที่เพิ่งคลิก ไม่ต้องรอ) ไม่งั้นแผงค้างไม่เปิดจนกว่า fetch ที่สองจะเสร็จ — ผู้ใช้กดแล้วไม่มีอะไรเกิดขึ้น
    const buildings = (remoteBuildQuotes ?? [])
      .map(q => buildingOf({ quoteNo: q.id, productLine: q.project || "", valueNum: q.totalValue, createdAt: fmtISOToThai(q.date), salesDate: วันที่ขายของใบ(q) }))   // วันซื้อ = วันตอบรับ (ใบ 0260)
      .sort((a, b) => (a.wonAt?.getTime() ?? 0) - (b.wonAt?.getTime() ?? 0));
    const lastBuy = [...buildings].filter(b => b.wonAt).pop() ?? null;
    return {
      id: remoteRowMeta.id, localId: remoteRowMeta.id, name: remoteRowMeta.name,
      dealerCode: remoteRowMeta.dealerCode, dealerName: remoteRowMeta.dealerName, province: remoteRowMeta.province,
      dealsWon: 0, totalRevenue: remoteRowMeta.totalValue, status: "active", lastContact: "—", segment: "sme",
      // ยอดซื้อรวมจากฐาน = ผลรวมใบที่ตอบรับ กติกาเดียวกับแท็บประวัติ (ใบ 0254) · ข้อมูลติดต่อมากับแถวเดียวกัน
      contact: remoteRowMeta.contact, phone: remoteRowMeta.phone, email: remoteRowMeta.email, address: remoteRowMeta.address,
      region: regionOf(remoteRowMeta.province), buildings,
      lastPurchase: lastBuy?.wonDate ?? null, lastPurchaseAt: lastBuy?.wonAt ?? null,
      isRepeat: buildings.length > 1,
    };
  }, [viewId, localDetail, remoteRowMeta, remoteBuildQuotes]);

  // Export — หนึ่งแถวต่อลูกค้า · supabase: ดึงทั้งชุดที่กรองจาก DB ตอนกด (limit=total) · local: จาก localFiltered ทั้งชุดอยู่แล้ว
  const rowToCells = (c: HQCustomerPageRow) => [
    customerCode(c.dealerCode, c.id), c.name, c.dealerCode, c.dealerName, c.province, ชื่อภาค(regionOf(c.province)) || "—",
    c.totalValue, c.lastPurchaseAt ? fmtISOToThai(c.lastPurchaseAt) : "—",
  ];
  const localExportRows = localFiltered.map(c => [
    customerCode(c.dealerCode, c.localId ?? c.id), c.name, c.dealerCode, c.dealerName, c.province, ชื่อภาค(c.region) || "—",
    c.totalRevenue, c.lastPurchase ?? "—",
  ]);

  return (
    <div className="erp">
      {/* ปุ่ม/ตัวกรองของหน้าอยู่ขวาหัวหน้าเพจ (UI รอบใหม่ 14 ก.ย. 69) — ชื่อหน้า/ป้ายกลุ่มมาจากแถบบนแล้ว */}
      <TopbarActions>
          {/* ช่วงเวลาอยู่ที่หัวหน้า — ที่เดียวกับทุกหน้า HQ */}
          <FilterBar dims={[]} />
          <ExportMenu
            filename="hq-customers"
            title="ลูกค้าทั้งเครือ"
            headers={["รหัสลูกค้า", "ลูกค้า", "รหัส", "ชื่อดีลเลอร์", "จังหวัด", "ภาค", "ยอดซื้อรวม", "ซื้อล่าสุด"]}
            rows={pageResult ? tableRows.map(rowToCells) : localExportRows}
            getRows={pageResult
              ? async () => {
                  const all = await metricsRepo.hqCustomersPage({ ...pageOpts, limit: Math.max(1, totalCount), offset: 0 });
                  return all.rows.map(rowToCells);
                }
              : undefined}
          />
      </TopbarActions>

      {/* ── เจาะลึก: ทั้งเครือ › ภูมิภาค › จังหวัด › ดีลเลอร์ › เดือน (บอสสั่ง 2 พ.ย. 69) · ทุกส่วนคิดตามระดับที่เลือก · แถวรวม = การ์ด ── */}
      <หัวเจาะลึก ตั้งค่า={ตั้งค่าลูกค้า} ข้อมูล={เจาะลึก} ขอบ={ขอบ} ตั้งขอบ={setขอบ} ช่วง={ช่วง} ชื่อแถวการ์ด="สรุปลูกค้าทั้งเครือ" />

      {/* รายชื่อลูกค้า — ดีลเลอร์ในระดับที่เลือก + คำค้น */}
      <div className="card hq-sticky-filter" style={{ display: "flex", gap: 10, margin: "16px 0", alignItems: "center", flexWrap: "nowrap", padding: "10px 14px" }}>
        <div data-box-title style={{ flex: 1, minWidth: 0 }}>
          <div className="card-title" data-title>ตารางรายชื่อลูกค้า · {ป้ายระดับของขอบ(ขอบ, เจาะลึก?.dealers ?? [])}</div>
          <div data-subtitle style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: 2 }}>{คำอธิบายหัวข้อ(null, "ลูกค้าทั้งหมดของดีลเลอร์ในระดับที่เลือก", "กดแถวเพื่อเปิด")}</div>
        </div>
        {/* ขนาดช่องค้นหาต้องเท่ากันทุกหน้า (บอสสั่ง 20 ส.ค. 69) — ใช้ .search-bar ตัวมาตรฐาน */}
        <div className="search-bar">
          <Search size={14} color="#9ca3af" strokeWidth={2} />
          <input
            type="text"
            placeholder="ค้นหาชื่อลูกค้า หรือจังหวัด..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ตารางเต็มอยู่ท้ายหน้าตามเดิม (ตามที่บอสสั่ง — ไม่แยกแท็บ) */}
      <div className="card">
        <CustomerTable rows={tableRows} onView={r => setViewId(r.id)} pagination={pagination} loading={isLoading} />
      </div>

      <CustomerDrawer row={viewDetail} onClose={() => setViewId(null)} />
    </div>
  );
}
