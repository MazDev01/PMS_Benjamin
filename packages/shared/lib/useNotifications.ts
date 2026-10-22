"use client";
// ── แจ้งเตือนของผู้ใช้ที่ล็อกอิน (ใบ 0231 · บอสสั่ง 21 ต.ค. 69 รอบ 4) ──────────────────────────────────
//
// แหล่งเดียว = ตาราง notifications ที่ฐานสร้างจากตารางกลาง notification_kinds (_notify)
//   เดิมกระดิ่งประกอบเองจากหลายแหล่ง (ลีด · ใบเสนอราคา · นัดหมาย · บันทึกการใช้งาน · กฎแจ้งเตือน HQ) จนรกและไม่ตรงกับอีเมล
//   ห้ามเติมแหล่งอื่นกลับ — ตัวตรวจ scripts/check-notification-catalog.mjs จับได้
// ดึงใหม่: ตอนเปิดหน้า · ตอนเปิดกระดิ่ง · ตอนกลับมาที่แท็บ · ทุก 1 นาที
import { useCallback, useEffect, useState } from "react";
import { notifications as notificationsRepo } from "@pms/shared/lib/data";
import type { AppNotification } from "@pms/shared/lib/data/types";
import { logRepoRead } from "@pms/shared/lib/repoLog";

const ทุกกี่มิลลิวินาที = 60_000;

export function useNotifications(enabled: boolean, open: boolean): AppNotification[] {
  const [items, setItems] = useState<AppNotification[]>([]);
  const load = useCallback(() => {
    if (!enabled) { setItems([]); return; }
    notificationsRepo.list(100).then(setItems).catch(e => logRepoRead("notifications.list", e));
  }, [enabled]);

  useEffect(() => {
    load();
    const t = setInterval(load, ทุกกี่มิลลิวินาที);
    window.addEventListener("focus", load);
    return () => { clearInterval(t); window.removeEventListener("focus", load); };
  }, [load]);
  useEffect(() => { if (open) load(); }, [open, load]);
  return items;
}
