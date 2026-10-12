"use client";

// ตั้งค่าของสาขาที่ล็อกอินอยู่ — หัวกระดาษ/เอกสาร/โลโก้/แจ้งเตือน
//
// เดิมทุกอย่างอยู่ใน localStorage ของเบราว์เซอร์เครื่องที่ใช้:
//   ล้างเบราว์เซอร์ · เปลี่ยนเครื่อง · เปิดคนละเบราว์เซอร์ = หายหมด
//   ใบเสนอราคาที่ส่งลูกค้าจะไม่มีชื่อบริษัท ไม่มีตราประทับ ไม่มีลายเซ็น
// ตอนนี้อ่าน/เขียนผ่าน repository → โหมด supabase เก็บที่ DB ผูกกับรหัสสาขา
import { useCallback, useEffect, useState } from "react";
import { logRepoRead } from "./repoLog";
import { dealerSettings as repo, realtime } from "./data";
import { useCurrentDealer } from "./useCurrentDealer";
import { DEFAULT_ISSUER, DEFAULT_NOTIF_PREFS, NOTIF_PREFS_EVENT } from "./mock";
import { DEFAULT_DOC } from "./quotationPrint";
import type { DealerSettings } from "./data/types";
import { useAuthReady } from "./useAuthReady";

export const EMPTY_DEALER_SETTINGS: DealerSettings = {
  issuer: DEFAULT_ISSUER,
  document: DEFAULT_DOC,
  logo: "",
  notifPrefs: DEFAULT_NOTIF_PREFS,
  pricing: {},
};

/** แจ้งหน้าอื่นใน origin เดียวกันว่าตั้งค่าสาขาเปลี่ยน (โหมด local ไม่มี Realtime) */
export const DEALER_SETTINGS_EVENT = "pms:dealer-settings";

export type UseDealerSettings = {
  settings: DealerSettings;
  /** โหลดเสร็จหรือยัง — ฟอร์มควรรอก่อนแสดง ไม่งั้นผู้ใช้เห็นค่ากลางแล้วเผลอกดบันทึกทับ */
  loaded: boolean;
  save: (patch: Partial<DealerSettings>) => Promise<void>;
};

export function useDealerSettings(): UseDealerSettings {
  const ready = useAuthReady();   // ยังไม่ล็อกอิน = ห้ามยิงคำขอ (ดู useAuthReady.ts)
  const dealer = useCurrentDealer();
  const [settings, setSettings] = useState<DealerSettings>(EMPTY_DEALER_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const read = () => {
      repo.get(dealer.code)
        .then(v => { if (alive) { setSettings(v); setLoaded(true); } })
        .catch(e => { if (alive) logRepoRead("dealerSettings.get", e); });
    };
    read();
    const onEvt = () => read();
    window.addEventListener(DEALER_SETTINGS_EVENT, onEvt);
    // หน้าตั้งค่ายิง event นี้ตอนกดบันทึกการแจ้งเตือน (กระดิ่งบน Topbar ต้องอัปเดตทันที)
    window.addEventListener(NOTIF_PREFS_EVENT, onEvt);
    window.addEventListener("storage", onEvt);
    // ข้ามเครื่อง/ข้ามแท็บจริง (M4) — supabase: Realtime · local: no-op (ใช้ window event ข้างบนพอ)
    const unsub = realtime.subscribeDealerSettings(() => read());
    return () => {
      alive = false;
      window.removeEventListener(DEALER_SETTINGS_EVENT, onEvt);
      window.removeEventListener(NOTIF_PREFS_EVENT, onEvt);
      window.removeEventListener("storage", onEvt);
      unsub();
    };
  }, [ready, dealer.code]);

  const save = useCallback(async (patch: Partial<DealerSettings>) => {
    // แสดงผลทันที แล้วค่อยเขียนลงที่เก็บ (เขียนไม่ผ่านจะ throw ให้ผู้เรียกจัดการ)
    setSettings(prev => ({ ...prev, ...patch }));
    await repo.save(dealer.code, patch);
    try { window.dispatchEvent(new Event(DEALER_SETTINGS_EVENT)); } catch {}
  }, [dealer.code]);

  return { settings, loaded, save };
}

/** % VAT ที่สาขาตั้งไว้เอง (ตั้งค่า › ใบเสนอราคา) — ใช้ตอนออกใบใหม่ และเป็นค่าสำรองของใบเก่าที่ไม่มีสแนปช็อต
 *
 *  เดิมค่านี้ล็อกไว้ที่สำนักงานใหญ่ทั้งเครือ · บอสสั่งเปิดให้ดีลเลอร์ตั้งเอง (7 ส.ค. 69)
 *  ใบที่ออกไปแล้วไม่กระทบ — ทุกใบตรึง q.vatPercent ไว้ตั้งแต่ตอนสร้าง เปลี่ยนค่านี้ทีหลังไม่ย้อนไปแก้ใบเก่า
 */
export function useDealerVat(): number {
  const { settings } = useDealerSettings();
  const v = settings.document?.vatPercent;
  return typeof v === "number" && v >= 0 ? v : DEFAULT_DOC.vatPercent;
}

/** เตือน "ใบเสนอราคาใกล้หมดอายุ" เมื่อเหลือไม่เกินกี่วัน — สาขาตั้งเองที่ ตั้งค่า › ใบเสนอราคา (บอสสั่ง 21 ก.ย. 69)
 *  เก็บใน document (jsonb) ข้างอายุใบ · ไม่ได้ตั้ง/ค่าเพี้ยน = 7 วัน */
export const DEFAULT_QUOTE_EXPIRY_WARN_DAYS = 7;
export function useQuoteExpiryWarnDays(): number {
  const { settings } = useDealerSettings();
  const v = Number((settings.document as { expiryWarnDays?: unknown } | undefined)?.expiryWarnDays);
  return Number.isFinite(v) && v >= 1 ? Math.round(v) : DEFAULT_QUOTE_EXPIRY_WARN_DAYS;
}

/** อัตราภาษีหัก ณ ที่จ่ายตั้งต้นของสาขา (%) — ตั้งที่ ตั้งค่า › ใบเสนอราคา (บอสสั่ง 28 ส.ค. 69)
 *  ใช้เป็น "ค่าเริ่มต้น" ตอนเปิดฟอร์มออกใบเท่านั้น — ตอนออกใบยังติ๊กเปิด/ปิดและแก้อัตราได้
 *  ⚠️ ใบที่ออกไปแล้วไม่กระทบ เพราะทุกใบตรึงอัตราไว้กับตัวเองตั้งแต่วันที่ออก */
export function useDealerWht(): number {
  const { settings } = useDealerSettings();
  const v = (settings.document as { whtPercent?: number } | undefined)?.whtPercent;
  return typeof v === "number" && v >= 0 ? v : 3;
}
