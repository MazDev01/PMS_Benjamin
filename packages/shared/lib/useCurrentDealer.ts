"use client";

import { useRole } from "@pms/shared/context/RoleContext";
import { DEFAULT_DEALER_CODE } from "@pms/shared/lib/mock";
import { useDealerSettings } from "@pms/shared/lib/useDealerSettings";
import { useRepoValue } from "@pms/shared/lib/useRepoState";
import { dealers as dealersRepo } from "@pms/shared/lib/data";
import type { DealerRow } from "@pms/shared/lib/data/types";

// ดีลเลอร์ปัจจุบัน = จาก session ที่ล็อกอิน (multi-tenant)
// HQ เพิ่มสาขา → สาขานั้นล็อกอิน (signIn คืน dealerCode ของตัวเอง) แล้วเห็น/แก้ข้อมูลสาขาตัวเอง
// dealerCode ว่าง (เดโม/HQ) → default CNX เพื่อให้พฤติกรรมเดิมของสาขาที่เล่นได้ยังทำงาน
export function useCurrentDealer(): { code: string; name: string } {
  const { dealerCode, session } = useRole();
  const code = dealerCode || DEFAULT_DEALER_CODE;
  const name = dealerCode ? (session.dealerName || dealerCode) : "เชียงใหม่สตีลบิลด์";
  return { code, name };
}

/** ชื่อสาขาที่ "แสดงบนหน้าจอ" — ชื่อบริษัทที่สาขากรอกเองมาก่อนเสมอ (บอสสั่ง 14 ส.ค. 69)
 *
 *  ทำไมไม่ใช้ dealers.name อย่างเดียว: ชื่อในทะเบียนเป็นของที่สำนักงานใหญ่กรอกตอนเปิดสาขา
 *  บางสาขาจึงถูกตั้งชื่อเป็นรหัสสาขาไปเลย (เจอจริง: ทะเบียนเป็น "DSA" แต่สาขากรอกชื่อบริษัทจริงว่า
 *  "เชียงใหม่สติล") ผลคือแถบบน/เมนูซ้ายขึ้น "DSA" ขณะที่การ์ดบัญชีในหน้าตั้งค่าขึ้นชื่อบริษัทจริง
 *  — ชื่อเดียวกันแต่คนละค่าในหน้าจอเดียว
 *
 *  ลำดับ: ชื่อบริษัทที่สาขากรอก → ชื่อในทะเบียนของ HQ → รหัสสาขา (ท้ายสุด ดีกว่าไม่มีอะไรเลย)
 *  ใช้ที่เดียวกันทั้ง แถบบน · เมนูซ้าย · หัวการ์ดบัญชีดีลเลอร์ — ห้ามคิดเองซ้ำที่อื่น
 *
 *  ⚠️ ขั้นที่ 3 เพิ่ม (18 ส.ค. 69): ถ้า session คืนชื่อมาเป็น "รหัสสาขา" เฉย ๆ
 *     (เกิดจริงกับสาขาที่ HQ เพิ่งสร้างและยังไม่ได้กรอกข้อมูลบริษัทของตัวเอง — ผู้ใช้แจ้ง)
 *     ให้ไปหยิบชื่อจากทะเบียนดีลเลอร์มาเอง — ดีกว่าปล่อยให้หน้าจอขึ้นรหัส 3-4 ดีลเลอร์ชื่อบริษัท
 */
export function useDealerDisplayName(): string {
  const dealer = useCurrentDealer();
  const cfg = useDealerSettings();
  const registry = useRepoValue<DealerRow[]>(() => dealersRepo.list(), []);
  const company = cfg.loaded ? cfg.settings.issuer?.company?.trim() : "";
  // session ยังเป็นรหัสอยู่ = ยังไม่ได้ชื่อจริง → หาจากทะเบียนต่อ
  const fromRegistry = dealer.name === dealer.code
    ? registry.find(d => d.code === dealer.code)?.name?.trim()
    : "";
  return company || fromRegistry || dealer.name || dealer.code;
}
