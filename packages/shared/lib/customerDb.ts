"use client";

// ─── ฐานข้อมูลลูกค้าทั้งเครือ (Customer Database — หลังปิดการขาย) ──────────────────
// หน้า /hq/customers เป็น "ฐานข้อมูลลูกค้าหลังปิดการขาย" ไม่ใช่ pipeline
// → ข้อมูลอาคาร/วันส่งมอบ ทั้งหมด derive จาก "ใบเสนอราคาที่ปิดการขายได้" เท่านั้น
//
// แหล่งข้อมูล (ไม่มี seed ใหม่ ไม่มีการกุค่า):
//   ลูกค้า        = useNetworkCustomers()   (live CNX + seed สาขาอื่น)
//   ใบเสนอราคา    = useNetworkQuotations()  (live CNX + seed สาขาอื่น)
//   จับคู่ด้วย     ชื่อลูกค้า + รหัสดีลเลอร์  (ต้องตรงทั้งคู่ กันข้ามสาขาชื่อซ้ำ)
//   วันส่งมอบ     = delivery.ts (วันปิดการขาย + ระยะส่งมอบ)
//
// ลูกค้าที่ไม่มีใบปิดการขายจับคู่ได้ → ไม่มีอาคาร/ส่งมอบ = null → หน้าแสดง "—"
// (ห้ามเดาแทน — ลูกค้า seed หลายรายมี dealsWon แต่ไม่มีใบในระบบ ถือว่าไม่มีข้อมูล)
import { useMemo } from "react";
import { type HQCustomer, fmtISOToThai } from "@pms/shared/lib/mock";
import { useNetworkCustomers, useNetworkQuotations } from "@pms/shared/lib/useNetworkData";
import { parseThaiDate } from "@pms/shared/lib/thaiDate";

// ─── ภาค — ย้ายไปอยู่ที่ lib/provinces.ts แล้ว (ใช้ร่วมกับ /hq/dealers ที่ต้องเลือกจังหวัดตามภาค)
// re-export ไว้ที่เดิมด้วย เพื่อไม่ให้หน้าที่ import จากไฟล์นี้อยู่แล้วต้องแก้ตาม
export { REGIONS, regionOf, provincesOfRegion, type Region } from "@pms/shared/lib/provinces";
import { regionOf } from "@pms/shared/lib/provinces";
import type { Region } from "@pms/shared/lib/provinces";

// ─── อาคารที่ลูกค้าซื้อไปแล้ว (1 ใบที่ปิดการขายได้ = 1 อาคาร) ────────────────────
export type PurchasedBuilding = {
  quoteNo: string;
  product: string;          // ข้อความประเภทอาคารดิบบนใบ (ไม่ยุบเป็นแม่แบบแล้ว)
  // (ช่อง buildingType/template ที่ยุบเป็นแม่แบบ ลบแล้ว — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69)
  value: number;
  wonDate: string;          // วันปิดการขาย (ไทย)
  wonAt: Date | null;
  // ⚠️ เคยมี deliveredAt (วันส่งมอบ) ตรงนี้ — ลบทั้งฟีเจอร์แล้ว (บอสสั่ง 20 ส.ค. 69)
  //    ไม่มีที่กรอกวันส่งมอบจริงทั้งฝั่งดีลเลอร์และสำนักงานใหญ่ · ค่าที่เคยโชว์คือ
  //    "วันปิดการขาย + 90 วัน" ที่ระบบคิดขึ้นเอง = ตัวเลขที่ไม่มีอยู่จริงในงาน
};

export type CustomerDbRow = HQCustomer & {
  region: Region | null;
  buildings: PurchasedBuilding[];
  lastPurchase: string | null;  // วันปิดการขายล่าสุด (ไทย)
  lastPurchaseAt: Date | null;
  isRepeat: boolean;            // ซื้อซ้ำ = มีอาคารที่ซื้อแล้วมากกว่า 1
};

// ข้อมูลขั้นต่ำที่ใช้สร้าง 1 อาคาร — HQQuotation ก็เข้าได้ (fallback) · rollup จาก DB map มาให้ (M9 Phase 2)
export type BuildingSrc = { quoteNo: string; productLine: string; valueNum: number; createdAt: string; salesDate?: string | null };
export const buildingOf = (q: BuildingSrc): PurchasedBuilding => {
  const product = q.productLine ?? "";
  return {
    quoteNo: q.quoteNo,
    product,
    value: q.valueNum,
    // วันที่ซื้อ = วันที่ลูกค้าตอบรับ (บอสตัดสิน 29 ต.ค. 69 · ใบ 0260) · ไม่มี = วันออกใบ (กติกาเดียวกับฐาน)
    wonDate: q.salesDate ? fmtISOToThai(q.salesDate) : q.createdAt,
    wonAt: q.salesDate ? new Date(Number(q.salesDate.slice(0, 4)), Number(q.salesDate.slice(5, 7)) - 1, Number(q.salesDate.slice(8, 10))) : parseThaiDate(q.createdAt),
  };
};

/**
 * ลูกค้าทั้งเครือ + ข้อมูลหลังปิดการขายที่ derive จากใบเสนอราคาจริง — คำนวณจาก quotations ในเครื่องตรง ๆ เสมอ
 * ไม่ยิง fetch ทั้งเครือเอง (ไม่มี RPC ของตัวเอง) — ใช้เป็น fallback เฉย ๆ ตอนหน้ามี RPC เฉพาะทางอยู่แล้ว
 * (เช่น /hq/customers → hq_customers_page, M9 Phase 6)
 *
 * local/demo mode: ได้ค่าจริงปกติ (SalesContext โหลดไว้ในเครื่องอยู่แล้ว ไม่ต้องดึงเพิ่ม)
 * HQ+supabase mode: ว่างเปล่าเสมอ (SalesContext gate ไม่โหลด array ทั้งเครือให้ฝั่ง HQ — ตั้งใจ) — ใช้เป็น
 *   fallback ที่ "ไม่ทำอะไรเลย" ตอนหน้ามี RPC ของตัวเองอยู่แล้ว (pageResult ไม่ null) เหมือน useNetworkQuotations()
 *   ที่ /hq/quotations ใช้เป็น fallback ของ useHQQuotationsSummary/useQuotationsPage
 */
export function useCustomerDbLocal(): CustomerDbRow[] {
  const customers = useNetworkCustomers();
  const quotations = useNetworkQuotations();
  return useMemo(() => {
    const srcByCustomer = new Map<string, BuildingSrc[]>();
    quotations.forEach(q => {
      if (q.status !== "won") return;
      const key = `${q.dealerCode}|${q.customer}`;
      const b: BuildingSrc = { quoteNo: q.quoteNo, productLine: q.productLine ?? "", valueNum: q.valueNum, createdAt: q.createdAt };
      const list = srcByCustomer.get(key);
      if (list) list.push(b); else srcByCustomer.set(key, [b]);
    });

    return customers.map((c): CustomerDbRow => {
      const won = srcByCustomer.get(`${c.dealerCode}|${c.name}`) ?? [];
      const buildings = won
        .map(buildingOf)
        .sort((a, b) => (a.wonAt?.getTime() ?? 0) - (b.wonAt?.getTime() ?? 0));
      const lastBuy = [...buildings].filter(b => b.wonAt).pop() ?? null;

      return {
        ...c,
        region: regionOf(c.province),
        buildings,
        lastPurchase: lastBuy?.wonDate ?? null,
        lastPurchaseAt: lastBuy?.wonAt ?? null,
        isRepeat: buildings.length > 1,
      };
    });
  }, [customers, quotations]);
}
