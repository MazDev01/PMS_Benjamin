"use client";

// ─── ค่าคุมระดับเครือที่ HQ เป็นเจ้าของ — ฝั่งดีลเลอร์ "อ่านอย่างเดียว" ──────────────
// VAT / อายุใบเสนอราคา / เป้ายอดขาย ตั้งที่ /hq/settings แล้วมีผลกับทุกสาขา
//
// ทำไมต้องเป็น hook (ห้ามเรียก loadHQPolicy() ตรง ๆ ตอน render อีก):
//   loadHQPolicy/loadHQTargets อ่าน localStorage ของ origin ตัวเอง → โหมด supabase
//   จะได้ "ค่า default" เสมอ ไม่ใช่ค่าที่ HQ ตั้งไว้จริงใน DB → VAT/วันหมดอายุคลาดเคลื่อน (คิดเงินผิด)
//   hook นี้อ่านผ่าน repository + ติดตามการแก้ (Realtime ฝั่ง supabase · event ฝั่ง local)
import { useEffect, useState } from "react";
import {
  DEFAULT_HQ_POLICY, DEFAULT_HQ_TARGETS, HQ_SETTINGS_EVENT, LOST_REASONS, LEAD_TASK_TEMPLATE,
  type HQPolicy, type HQTargets, type LeadTaskDef,
} from "./mock";
import { settings as settingsRepo, realtime } from "./data";
import { DEFAULT_RECRUIT_SETTINGS, type HQRecruitSettings } from "./recruitSettings";
import { logRepoRead } from "./repoLog";
import { useRole } from "@pms/shared/context/RoleContext";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";

// โครงร่วม: โหลดค่าผ่าน repo แล้วโหลดซ้ำเมื่อ HQ แก้
//
// tag: ชื่อที่ใช้แจ้งเมื่อโหลดไม่สำเร็จ — ต้องแจ้งเสมอ ห้ามกลืนเงียบ
//   เดิม .catch(() => {}) ทิ้ง error ทั้งดุ้น → พอโหลดนโยบายพลาด ระบบจะ fallback เป็นค่า default
//   ในโค้ดเงียบ ๆ โดยผู้ใช้ไม่รู้ตัว · ค่าพวกนี้คือ VAT กับอายุใบเสนอราคา = ออกใบด้วยเลขผิดได้จริง
//   (พบจากผลตรวจสอบระบบ 5 ส.ค. 69 · แพตเทิร์นเดียวกับที่เคยแก้ไปแล้วใน SalesContext/useNetworkData)
function useHQValue<T>(tag: string, load: () => Promise<T>, initial: T): T {
  const [value, setValue] = useState<T>(initial);
  // ⚠️ ห้ามอ่านก่อนล็อกอิน — ค่าพวกนี้ต้องมีสิทธิ์ถึงจะอ่านได้
  //    เดิมยิงตั้งแต่ mount ทำให้หน้าเข้าสู่ระบบยิง settings ออกไปแล้วถูกปฏิเสธทุกครั้ง
  //    โหมด supabase ปฏิเสธเงียบ ๆ (ค่าตกไปใช้ default) แต่โหมด api ตอบ 401 ให้เห็นชัด
  //    ทั้งสองแบบผิดเหมือนกัน — ต้องรอจนรู้ตัวตนก่อนแล้วค่อยอ่าน
  const { hydrated, isLoggedIn } = useRole();
  const ready = hydrated && (!REAL_BACKEND || isLoggedIn);
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const read = () => { load().then(v => { if (alive) setValue(v); }).catch(e => logRepoRead(tag, e)); };
    read();
    const unsub = realtime.subscribeSettings(read); // supabase: ข้ามแอป/ข้ามเครื่อง · local: no-op
    window.addEventListener(HQ_SETTINGS_EVENT, read); // local: HQ กดบันทึกใน origin เดียวกัน
    window.addEventListener("storage", read);
    return () => {
      alive = false;
      unsub();
      window.removeEventListener(HQ_SETTINGS_EVENT, read);
      window.removeEventListener("storage", read);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  return value;
}

/** นโยบายการขายของ HQ (VAT ฯลฯ) — ดีลเลอร์ตั้งเองไม่ได้ */
export function useHQPolicy(): HQPolicy {
  return useHQValue<HQPolicy>("settings.getPolicy", () => settingsRepo.getPolicy(), DEFAULT_HQ_POLICY);
}

/** เป้ายอดขายของเครือ — แดชบอร์ดดีลเลอร์ใช้เทียบความคืบหน้า */
export function useHQTargets(): HQTargets {
  return useHQValue<HQTargets>("settings.getTargets", () => settingsRepo.getTargets(), DEFAULT_HQ_TARGETS);
}

/** อายุใบเสนอราคา (วัน) — ใช้คำนวณวันหมดอายุของใบ */
export function useQuoteValidityDays(): number {
  return useHQValue<number>("settings.getQuoteValidityDays",
    () => settingsRepo.getQuoteValidityDays(), DEFAULT_HQ_POLICY.quoteValidityDays);
}

/** เหตุผล "ปิดการขายไม่สำเร็จ" ที่ HQ กำหนด — ดีลเลอร์เลือกจากรายการนี้เท่านั้น
 *  เดิมอ่าน localStorage ตรง ๆ ซึ่งเป็นคนละ origin กับที่ HQ เขียน → ค่าที่ตั้งไม่เคยไปถึงดีลเลอร์ */
export function useLostReasons(): string[] {
  return useHQValue<string[]>("settings.getLostReasons", () => settingsRepo.getLostReasons(), [...LOST_REASONS]);
}

/** งานมาตรฐานของแต่ละขั้น ที่ HQ ตั้งไว้ — ดีลเลอร์เช็กงานชุดนี้ และเป็นตัวเลื่อนขั้นให้ลูกค้าเป้าหมาย
 *  ห้ามใช้ LEAD_TASK_TEMPLATE ตรง ๆ ในหน้าจอ: นั่นเป็นแค่ค่าเริ่มต้น ไม่ใช่ของที่ HQ ตั้งไว้จริง */
/** ค่าตั้งงานหาดีลเลอร์ของ HQ (ช่องทาง/ประเภทธุรกิจ/เหตุผล/ชื่องาน/ค่าตั้งต้นใบค่าแฟรนไชส์)
 *  ใช้ในหน้าฝั่ง HQ เท่านั้น — ดีลเลอร์อ่านตารางนี้ไม่ได้ (RLS) */
export function useRecruitSettings(): HQRecruitSettings {
  return useHQValue<HQRecruitSettings>("settings.getRecruitSettings", () => settingsRepo.getRecruitSettings(), DEFAULT_RECRUIT_SETTINGS);
}

export function useLeadTaskTemplate(): LeadTaskDef[] {
  return useHQValue<LeadTaskDef[]>("settings.getLeadTasks", () => settingsRepo.getLeadTasks(), [...LEAD_TASK_TEMPLATE]);
}
