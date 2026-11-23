"use client";

// ── รายการกลางของเครือ (ใบ 0296) — ทุกฟอร์ม/ตัวกรอง/ป้ายอ่านผ่าน hook นี้ตัวเดียว ─────────────────────────────────
//   useOptionList("lead_source").ป้าย(lead.source) · .ตัวเลือกฟอร์ม(ค่าปัจจุบัน) · .ตัวเลือกตัวกรอง(ค่าในข้อมูล)
//   ตรรกะทั้งหมดอยู่ใน optionLists.ts (ตรรกะล้วน · มีข้อทดสอบ) — ไฟล์นี้แค่โหลด + ติดตามการแก้
//   ยังโหลดไม่เสร็จ = ค่าตั้งต้น (ชุดเดียวกับที่ใบ 0296 ใส่) · โหลดไม่สำเร็จ = แจ้งในคอนโซล ใช้ค่าล่าสุดที่มี
//   HQ บันทึกในแท็บเดียวกัน → เหตุการณ์ เหตุการณ์รายการกลางเปลี่ยน → ทุก hook โหลดใหม่
import { useEffect, useMemo, useState } from "react";
import { optionLists as optionListsRepo, realtime } from "./data";
import { logRepoRead } from "./repoLog";
import { useRole } from "@pms/shared/context/RoleContext";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";
import {
  รายการตั้งต้นทั้งหมด, ของรายการ, ป้ายของ, ตัวเลือกฟอร์ม, ตัวเลือกตัวกรอง, หารหัสจากป้าย,
  type รายการกลาง, type ตัวเลือกกลาง, type ตัวเลือกช่อง,
} from "./optionLists";

export const เหตุการณ์รายการกลางเปลี่ยน = "pms:option-lists-changed";
// ที่เก็บกลางของทั้งแท็บ — ทุก hook ใช้ค่าชุดเดียว + ช่องฟังการเปลี่ยนช่องเดียว (แถวนัดในปฏิทินเรียก hook ทีละแถว
//   ถ้าแต่ละตัวเปิดช่องฟังเองจะได้ช่องเป็นร้อย) · อ่านซ้ำพร้อมกันรวมเป็นคำขอเดียวที่ชั้นข้อมูล (แคชสั้น)
/** ค่าล่าสุดที่โหลดได้ (เปิดหน้าใหม่ไม่กระพริบกลับเป็นค่าตั้งต้น) */
let ล่าสุด: ตัวเลือกกลาง[] | null = null;
const ผู้ฟัง = new Set<(v: ตัวเลือกกลาง[]) => void>();
let เลิกฟัง: (() => void) | null = null;
function อ่านใหม่() {
  optionListsRepo.list()
    .then(v => { ล่าสุด = v; ผู้ฟัง.forEach(f => f(v)); })
    .catch(e => logRepoRead("optionLists.list", e));
}
function เริ่มฟัง() {
  if (เลิกฟัง) return;
  const unsub = realtime.subscribeSettings(อ่านใหม่);
  window.addEventListener(เหตุการณ์รายการกลางเปลี่ยน, อ่านใหม่);
  เลิกฟัง = () => { unsub(); window.removeEventListener(เหตุการณ์รายการกลางเปลี่ยน, อ่านใหม่); เลิกฟัง = null; };
}
/** หน้าตั้งค่าเรียกหลังบันทึก — ทุก hook ในแท็บนี้โหลดค่าใหม่ */
export function แจ้งรายการกลางเปลี่ยน() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(เหตุการณ์รายการกลางเปลี่ยน));
}

/** ทุกรายการ (รวมที่ซ่อน) */
export function useOptionLists(): { items: ตัวเลือกกลาง[]; พร้อม: boolean } {
  const [items, setItems] = useState<ตัวเลือกกลาง[]>(() => ล่าสุด ?? รายการตั้งต้นทั้งหมด());
  const [พร้อม, setพร้อม] = useState(ล่าสุด !== null);
  const { hydrated, isLoggedIn } = useRole();
  const ready = hydrated && (!REAL_BACKEND || isLoggedIn);
  useEffect(() => {
    if (!ready) return;
    const รับ = (v: ตัวเลือกกลาง[]) => { setItems(v); setพร้อม(true); };
    ผู้ฟัง.add(รับ);
    เริ่มฟัง();
    อ่านใหม่();
    return () => { ผู้ฟัง.delete(รับ); if (!ผู้ฟัง.size) เลิกฟัง?.(); };
  }, [ready]);
  return { items, พร้อม };
}

export type ใช้รายการกลาง = {
  items: ตัวเลือกกลาง[];
  พร้อม: boolean;
  /** ป้ายของค่าที่บันทึก — ไม่ตรงรายการ = "‹ค่า› (ตามที่บันทึกไว้)" · ว่าง = ค่า ว่าง (ตั้งต้น "—") */
  ป้าย: (value: string | null | undefined, ว่าง?: string) => string;
  /** ตัวเลือกของฟอร์มกรอก (ตัวที่ไม่ซ่อน + ค่าปัจจุบัน) */
  ตัวเลือกฟอร์ม: (ค่าปัจจุบัน?: string | null) => ตัวเลือกช่อง[];
  /** ตัวเลือกของตัวกรอง (ทุกตัว + ค่านอกรายการในข้อมูล) */
  ตัวเลือกตัวกรอง: (ค่าในข้อมูล?: readonly (string | null | undefined)[]) => ตัวเลือกช่อง[];
  /** นำเข้า: ชื่อ → รหัส (ไม่เจอ = null) */
  หารหัส: (ข้อความ: string | null | undefined) => string | null;
};

/** รายการเดียว */
export function useOptionList(list: รายการกลาง): ใช้รายการกลาง {
  const { items: ทั้งหมด, พร้อม } = useOptionLists();
  return useMemo(() => {
    const items = ของรายการ(ทั้งหมด, list);
    return {
      items, พร้อม,
      ป้าย: (value, ว่าง) => ป้ายของ(items, value, ว่าง),
      ตัวเลือกฟอร์ม: (ค่าปัจจุบัน) => ตัวเลือกฟอร์ม(items, ค่าปัจจุบัน),
      ตัวเลือกตัวกรอง: (ค่าในข้อมูล) => ตัวเลือกตัวกรอง(items, ค่าในข้อมูล ?? []),
      หารหัส: (ข้อความ) => หารหัสจากป้าย(items, ข้อความ),
    };
  }, [ทั้งหมด, list, พร้อม]);
}

/** ตัวเลือกของกล่องเหตุผลกลาง (ถามเหตุผล · ตัวเลือกรหัส) จากรายการ — ตัวที่ไม่ซ่อนเท่านั้น */
export const ตัวเลือกกล่องเหตุผล = (items: readonly ตัวเลือกกลาง[]) =>
  items.filter(x => !x.hidden).map(x => ({ ค่า: x.code, ป้าย: x.label, พิมพ์เอง: x.freeText }));
