"use client";

// ── อายุใบเสนอราคา (วัน) — ของสาขาต้องมาก่อนของสำนักงานใหญ่ (บอสสั่ง 20 ส.ค. 69) ────
//
// มีสองที่ที่ตั้งค่านี้ได้ และเดิมหน้าจอฝั่งดีลเลอร์อ่านผิดที่:
//   • สำนักงานใหญ่: /hq/settings → นโยบายของทั้งเครือ (ค่าตั้งต้นให้สาขาที่ยังไม่ตั้งเอง)
//   • ดีลเลอร์: /settings → ตั้งค่าใบเสนอราคา → "อายุใบเสนอราคา (วัน)"
// สาขาตั้งไว้ 38 วัน แต่ใบที่ออกกลับหมดอายุใน 30 วันตามของสำนักงานใหญ่ = ค่าที่สาขากรอกไม่มีผลจริง
//
// กติกา: สาขาตั้งไว้เท่าไรใช้ค่านั้น · ไม่ได้ตั้ง (หรือค่าเพี้ยน) ค่อยใช้ของสำนักงานใหญ่
// ⚠️ ห้ามอ่าน hq policy ตรง ๆ ที่หน้าจอฝั่งดีลเลอร์อีก — ใช้ตัวนี้ที่เดียว ไม่งั้นจะเพี้ยนคนละหน้า
import { useQuoteValidityDays } from "./useHQConfig";
import { useDealerSettings } from "./useDealerSettings";

export function useQuoteValidity(): number {
  const ของสำนักงานใหญ่ = useQuoteValidityDays();
  const { settings } = useDealerSettings();
  const ของสาขา = Number((settings.document as { validityDays?: unknown } | undefined)?.validityDays);
  return Number.isFinite(ของสาขา) && ของสาขา > 0 ? Math.round(ของสาขา) : ของสำนักงานใหญ่;
}
