"use client";

// ── โหลดการ์ด KPI ของหน้าจากฐาน (ใบ 0246 · kpi_cards) ───────────────────────────────────────────────────────
//   รุ่น = ค่าที่เปลี่ยนเมื่อข้อมูลของหน้าเปลี่ยน (เช่น จำนวน/เวลาแก้ล่าสุดของรายการ) → โหลดตัวเลขใหม่ให้ตรงกับตาราง
//   โหลดไม่สำเร็จ = {} (ทุกใบขึ้น "—" ไม่ใช่ 0) · คำขอเก่าที่ตอบช้ากว่าคำขอใหม่ถูกทิ้ง
import { useEffect, useRef, useState } from "react";
import { metrics } from "@pms/shared/lib/data";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import type { KpiCardsData, KpiPage } from "@pms/shared/lib/kpiCards";

export function useKpiCards(page: KpiPage, opts: { start?: string | null; end?: string | null; dealer?: string | null; today?: string | null; รุ่น?: unknown } = {}) {
  const [data, setData] = useState<KpiCardsData | null>(null);
  const ลำดับ = useRef(0);
  const { start = null, end = null, dealer = null, today = null, รุ่น } = opts;
  const คีย์รุ่น = JSON.stringify(รุ่น ?? null);
  useEffect(() => {
    const ครั้งนี้ = ++ลำดับ.current;
    metrics.kpiCards(page, start, end, dealer, today)
      .then(d => { if (ครั้งนี้ === ลำดับ.current) setData(d ?? {}); })
      .catch(e => { logRepoRead(`metrics.kpiCards(${page})`, e); if (ครั้งนี้ === ลำดับ.current) setData({}); });
  }, [page, start, end, dealer, today, คีย์รุ่น]);
  return data;
}
