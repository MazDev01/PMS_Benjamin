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
// supabase: useHQCustomersPage/useHQCustomersFilterOptions (RPC) · local/demo: useCustomerDbLocal (client, ไม่ยิง fetch)
import { useState, useMemo, useEffect } from "react";
import { APP_NOW } from "@pms/shared/lib/appTime";
import { Search } from "lucide-react";
import { ExportMenu } from "@pms/shared/components/ui/ExportMenu";
import { customerCode, fmtISOToThai } from "@pms/shared/lib/mock";
import { useCustomerDbLocal, buildingOf, regionOf, REGIONS, type CustomerDbRow } from "@pms/shared/lib/customerDb";
import { useHQCustomersPage, useHQCustomersFilterOptions, useCustomerBuildings } from "@pms/shared/lib/useNetworkData";
import { metrics as metricsRepo } from "@pms/shared/lib/data";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";
import type { HQCustomerPageRow, HQCustomersKPI, HQCustomersCharts } from "@pms/shared/lib/data/ports";
import { CustomerKPICards } from "@pms/shared/components/hq/customers/CustomerKPICards";
import { เดือนนี้ } from "@pms/shared/lib/kpiCards";
import { CustomerAnalytics } from "@pms/shared/components/hq/customers/CustomerAnalytics";
import { CustomerTable } from "@pms/shared/components/hq/customers/CustomerTable";
import { CustomerDrawer } from "@pms/shared/components/hq/customers/CustomerDrawer";

const PAGE_SIZE = 10;

// ── ตัวกรอง "ซื้อล่าสุด" (เฉพาะหน้านี้) ─────────────────────────────────────────
// วัดจาก last_purchase_at = วันปิดการขายล่าสุดของลูกค้ารายนั้น
// "all" ต้องเป็นค่าเริ่มต้นเสมอ — ฐานข้อมูลลูกค้าต้องเห็นครบก่อน แล้วผู้ใช้ค่อยแคบเอง
const BOUGHT_OPTIONS = [
  { key: "all",     label: "ทุกช่วงเวลาที่ซื้อ" },
  { key: "m6",      label: "ซื้อล่าสุดใน 6 เดือน" },
  { key: "m12",     label: "ซื้อล่าสุดใน 12 เดือน" },
  { key: "thisYear",label: "ซื้อล่าสุดปีนี้" },
  { key: "over12",  label: "ไม่ซื้อเกิน 12 เดือนแล้ว" },
] as const;
type BoughtKey = typeof BOUGHT_OPTIONS[number]["key"];

/** แปลงตัวเลือกเป็นช่วงวันที่ (ISO) — ไม่คืนอะไรเลยแปลว่าไม่กรอง */
function boughtRange(key: BoughtKey): { from?: string; to?: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const ย้อนเดือน = (n: number) => { const d = new Date(APP_NOW); d.setMonth(d.getMonth() - n); return iso(d); };
  switch (key) {
    case "m6": return { from: ย้อนเดือน(6) };
    case "m12": return { from: ย้อนเดือน(12) };
    case "thisYear": return { from: `${new Date(APP_NOW).getFullYear()}-01-01` };
    // "ไม่ซื้อเกิน 12 เดือนแล้ว" = ซื้อครั้งสุดท้ายก่อนหน้านั้น (ลูกค้าที่ยังไม่เคยมีใบปิดการขายไม่เข้าเกณฑ์
    // เพราะไม่มีวันที่ให้เทียบ — ไม่ใช่ระบบตัดทิ้ง)
    case "over12": return { to: ย้อนเดือน(12) };
    default: return {};
  }
}

export default function HQCustomersPage() {
  // ตัวกรองเฉพาะหน้านี้ (ไม่จำข้ามหน้า) — ช่วงเวลาใช้ FilterBar ส่วนกลาง
  const [search, setSearch] = useState("");
  const [dealerSel, setDealerSel] = useState("all");
  const [regionSel, setRegionSel] = useState("all");
  const [provinceSel, setProvinceSel] = useState("all");
  const [boughtSel, setBoughtSel] = useState<BoughtKey>("all");
  const [page, setPage] = useState(0);
  const [viewId, setViewId] = useState<number | null>(null);
  // การ์ด KPI (ใบ 0246): หน้านี้ไม่มีตัวกรองช่วงเวลา → การ์ด "ในช่วงนี้" = เดือนนี้ (บอสตัดสิน 27 ต.ค. 69)
  const ช่วงเดือนนี้ = useMemo(() => เดือนนี้(APP_NOW.getTime()), []);

  // เปลี่ยนตัวกรอง (ไม่ใช่หน้า) → กลับไปหน้า 1 เสมอ
  useEffect(() => { setPage(0); }, [search, dealerSel, regionSel, provinceSel, boughtSel]);

  // ── fallback ฝั่ง local/demo (ยังไม่กลับ) — ไม่ยิง fetch เลยในโหมด HQ+supabase (ดูคอมเมนต์ที่ hook) ──
  const localSource = useCustomerDbLocal();

  // ── ตัวเลือกตัวกรอง — supabase: RPC ครั้งเดียว ไม่อิงตัวกรองปัจจุบัน · local: จาก localSource ทั้งก้อน ──
  const remoteOptions = useHQCustomersFilterOptions();
  const dealerOptions = useMemo<[string, string][]>(() => {
    if (remoteOptions) return remoteOptions.dealers.map(d => [d.code, d.name]);
    const m = new Map<string, string>();
    localSource.forEach(c => m.set(c.dealerCode, c.dealerName));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [remoteOptions, localSource]);

  const allProvinces = useMemo<string[]>(() => {
    if (remoteOptions) return remoteOptions.provinces;
    return [...new Set(localSource.map(c => c.province).filter((p): p is string => !!p))];
  }, [remoteOptions, localSource]);
  const provinceOptions = useMemo(
    () => allProvinces.filter(p => regionSel === "all" || regionOf(p) === regionSel).sort((a, b) => a.localeCompare(b, "th")),
    [allProvinces, regionSel],
  );

  // region → provinces[] (resolve ให้ RPC ก่อนส่ง — ตารางไม่มีคอลัมน์ region เก็บตรง ๆ)
  const resolvedProvinces = useMemo<string[] | undefined>(() => {
    if (provinceSel !== "all") return [provinceSel];
    if (regionSel !== "all") return allProvinces.filter(p => regionOf(p) === regionSel);
    return undefined;
  }, [provinceSel, regionSel, allProvinces]);

  const pageOpts = useMemo(() => ({
    search: search.trim() || undefined,
    dealerCode: dealerSel === "all" ? undefined : dealerSel,
    provinces: resolvedProvinces,
    // ไม่ส่ง buildingType แล้ว — ตัวกรองประเภทอาคาร (แม่แบบ) ถอดออก: เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
    boughtFrom: boughtRange(boughtSel).from,
    boughtTo: boughtRange(boughtSel).to,
    limit: PAGE_SIZE, offset: page * PAGE_SIZE,
  }), [search, dealerSel, resolvedProvinces, boughtSel, page]);

  const pageResult = useHQCustomersPage(pageOpts);
  // การ์ด KPI เดินตามตัวกรองของตาราง (บอสตัดสิน 27 ต.ค. 69) — ชุดเดียวกับที่ส่งให้ hq_customers_page
  const ตัวกรองการ์ด = useMemo(() => {
    const f = { dealerCodes: dealerSel === "all" ? undefined : [dealerSel], provinces: resolvedProvinces, search: search.trim() || undefined,
                boughtFrom: boughtRange(boughtSel).from, boughtTo: boughtRange(boughtSel).to };
    return Object.values(f).some(v => v != null) ? f : null;
  }, [dealerSel, resolvedProvinces, search, boughtSel]);

  // ── fallback ฝั่ง client (local/demo) — ตรรกะกรอง/เรียงเดิมเป๊ะ ──
  const localFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return localSource
      .filter(c => {
        if (q && !c.name.toLowerCase().includes(q) && !c.province.toLowerCase().includes(q)) return false;
        if (dealerSel !== "all" && c.dealerCode !== dealerSel) return false;
        if (regionSel !== "all" && c.region !== regionSel) return false;
        if (provinceSel !== "all" && c.province !== provinceSel) return false;
        // กติกาเดียวกับฐานข้อมูล (ใบ 0159): ไม่มีวันซื้อ = ไม่เข้าเกณฑ์เมื่อเปิดตัวกรองนี้
        const ช่วง = boughtRange(boughtSel);
        if (ช่วง.from || ช่วง.to) {
          const ซื้อล่าสุด = c.lastPurchaseAt ? c.lastPurchaseAt.toISOString().slice(0, 10) : null;
          if (!ซื้อล่าสุด) return false;
          if (ช่วง.from && ซื้อล่าสุด < ช่วง.from) return false;
          if (ช่วง.to && ซื้อล่าสุด > ช่วง.to) return false;
        }
        return true;
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [localSource, search, dealerSel, regionSel, provinceSel, boughtSel]);

  const ปีที่แล้ว = useMemo(() => { const d = new Date(APP_NOW); d.setFullYear(d.getFullYear() - 1); return d.getTime(); }, []);
  // kpi/charts/rows — supabase: ตรงจาก RPC · local: derive จาก localFiltered ให้ shape เดียวกัน
  const kpi: HQCustomersKPI = pageResult ? pageResult.kpi : {
    total: localFiltered.length,
    // "ยังซื้ออยู่" = ซื้อภายใน 12 เดือนล่าสุด — กติกาเดียวกับฐานข้อมูล (ใบ 0158)
    active: localFiltered.filter(r => r.lastPurchaseAt && r.lastPurchaseAt.getTime() >= ปีที่แล้ว).length,
    revenue: localFiltered.reduce((s, r) => s + r.totalRevenue, 0),
    repeat: localFiltered.filter(r => r.isRepeat).length,
  };
  const charts: HQCustomersCharts = pageResult ? pageResult.charts : (() => {
    const countBy = (keysOf: (r: CustomerDbRow) => string[]) => {
      const m = new Map<string, number>();
      localFiltered.forEach(r => keysOf(r).forEach(k => m.set(k, (m.get(k) ?? 0) + 1)));
      return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    };
    const byDealerMap = new Map<string, { name: string; value: number }>();
    const revByDealerMap = new Map<string, number>();
    localFiltered.forEach(c => {
      const bd = byDealerMap.get(c.dealerCode) ?? { name: c.dealerName, value: 0 }; bd.value++; byDealerMap.set(c.dealerCode, bd);
      revByDealerMap.set(c.dealerCode, (revByDealerMap.get(c.dealerCode) ?? 0) + c.totalRevenue);
    });
    // byType/bySubtype (แม่แบบ) ไม่คำนวณแล้ว — ส่งว่างให้ครบ shape ของ HQCustomersCharts (เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69)
    return {
      byType: [],
      bySubtype: [],
      byProvince: countBy(r => r.province ? [r.province] : []).slice(0, 10),
      byDealer: [...byDealerMap.entries()].map(([code, x]) => ({ code, name: x.name, value: x.value })).sort((a, b) => b.value - a.value),
      revenueByDealer: [...revByDealerMap.entries()].map(([code, revenue]) => ({ code, revenue })).sort((a, b) => b.revenue - a.revenue),
    };
  })();
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

  // ตัวกรอง 4 ช่อง + ช่องค้นหา ต้องอยู่บรรทัดเดียว (แถวนี้ตั้ง flex-wrap: nowrap)
  //   maxWidth — select ที่ width:auto จะกว้างตามตัวเลือกที่ยาวที่สุด (เช่น "RYG – ดีลเลอร์ระยอง สตีล") ต้องคุมเพดาน
  //   minWidth: 0 + flexShrink — ให้ยุบตัวลงได้เมื่อจอแคบ แทนที่จะตกบรรทัด (nowrap ทำให้ยุบก่อน ไม่ใช่ wrap)
  // ขนาดตัวอักษร/ระยะขอบ ใช้สเกลเดียวกับแถบกรองหน้า /hq/pipeline
  const selectStyle = { width: "auto", flex: "0 1 auto", minWidth: 0, maxWidth: 146, padding: "7px 10px", fontSize: "0.74rem", fontWeight: 600, cursor: "pointer" } as const;

  // Export — หนึ่งแถวต่อลูกค้า · supabase: ดึงทั้งชุดที่กรองจาก DB ตอนกด (limit=total) · local: จาก localFiltered ทั้งชุดอยู่แล้ว
  const rowToCells = (c: HQCustomerPageRow) => [
    customerCode(c.dealerCode, c.id), c.name, c.dealerCode, c.dealerName, c.province, regionOf(c.province) ?? "—",
    c.totalValue, c.lastPurchaseAt ? fmtISOToThai(c.lastPurchaseAt) : "—",
  ];
  const localExportRows = localFiltered.map(c => [
    customerCode(c.dealerCode, c.localId ?? c.id), c.name, c.dealerCode, c.dealerName, c.province, c.region ?? "—",
    c.totalRevenue, c.lastPurchase ?? "—",
  ]);

  return (
    <div className="erp">
      {/* ปุ่ม/ตัวกรองของหน้าอยู่ขวาหัวหน้าเพจ (UI รอบใหม่ 14 ก.ย. 69) — ชื่อหน้า/ป้ายกลุ่มมาจากแถบบนแล้ว */}
      <TopbarActions>
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

      <CustomerKPICards ช่วง={ช่วงเดือนนี้} today={ช่วงเดือนนี้.end} ตัวกรอง={ตัวกรองการ์ด} รุ่น={tableRows.length} onOpen={id => setViewId(id)}
        onClear={() => { setSearch(""); setDealerSel("all"); setRegionSel("all"); setProvinceSel("all"); setBoughtSel("all"); setPage(0); }} />

      {/* ตัวกรอง — ค้นหา + ดีลเลอร์/ภาค/จังหวัด/ช่วงเวลาที่ซื้อ (ประเภทอาคาร/แม่แบบ ถอดออก 16 ต.ค. 69) */}
      <div className="card hq-sticky-filter" style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "nowrap", padding: "10px 14px" }}>
        {/* ขนาดช่องค้นหาต้องเท่ากันทุกหน้า (บอสสั่ง 20 ส.ค. 69) — ใช้ .search-bar ตัวมาตรฐาน
            เดิมหน้านี้สั่งให้ยืดกินที่ว่าง จึงกว้างกว่าหน้าอื่นเกือบสามเท่าเวลาจอกว้าง
            ตัวกรองถูกดันไปชิดขวาด้วย spacer แทน — วางตำแหน่งเหมือนหน้าใบเสนอราคาทั้งเครือ */}
        <div className="search-bar">
          <Search size={14} color="#9ca3af" strokeWidth={2} />
          <input
            type="text"
            placeholder="ค้นหาชื่อลูกค้า หรือจังหวัด..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div style={{ flex: 1 }} />

        <select aria-label="กรองตามดีลเลอร์" value={dealerSel} onChange={e => setDealerSel(e.target.value)} className="form-select" style={selectStyle}>
          <option value="all">ทุกดีลเลอร์</option>
          {dealerOptions.map(([code, name]) => <option key={code} value={code}>{code} – {name}</option>)}
        </select>

        <select
          aria-label="กรองตามภูมิภาค"
          value={regionSel}
          onChange={e => { setRegionSel(e.target.value); setProvinceSel("all"); }}
          className="form-select" style={selectStyle}
        >
          <option value="all">ทุกภาค</option>
          {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <select aria-label="กรองตามจังหวัด" value={provinceSel} onChange={e => setProvinceSel(e.target.value)} className="form-select" style={selectStyle}>
          <option value="all">ทุกจังหวัด</option>
          {provinceOptions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        {/* ตัวเลือกแรกคือทั้งหมด — BOUGHT_OPTIONS ตัวแรกคือ "ทุกช่วงเวลาที่ซื้อ" */}
        <select aria-label="กรองตามช่วงเวลาที่ซื้อล่าสุด" value={boughtSel} onChange={e => setBoughtSel(e.target.value as BoughtKey)} className="form-select" style={selectStyle}>
          {BOUGHT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>

      </div>

      <CustomerAnalytics charts={charts} />

      {/* ตารางเต็มอยู่ท้ายหน้าตามเดิม (ตามที่บอสสั่ง — ไม่แยกแท็บ) */}
      <div className="card">
        <CustomerTable rows={tableRows} onView={r => setViewId(r.id)} pagination={pagination} loading={isLoading} />
      </div>

      <CustomerDrawer row={viewDetail} onClose={() => setViewId(null)} />
    </div>
  );
}
