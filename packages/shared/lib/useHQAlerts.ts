// ─── การแจ้งเตือน HQ (hook) ────────────────────────────────────────────────────
// แหล่งเดียวของ "กฎแจ้งเตือน" ฝั่ง React — คำนวณจริงใน @pms/shared/lib/hqAlerts
// ขอบเขต = งานของสำนักงานใหญ่เอง (ลูกค้าเป้าหมาย HQ · ใบค่าแฟรนไชส์ · แคตตาล็อก) — ไม่ดึงงานขายของดีลเลอร์อีกแล้ว
// (ห้าม usePersistentState: มันเขียนกลับ → ค่า seed จะทับของจริงทุกครั้งที่ mount)
"use client";

import { useEffect, useMemo, useState } from "react";
import { HQ_NOTIF_UPDATED_EVENT, type HQNotifRules, type SolutionProduct } from "@pms/shared/lib/mock";
import {
  settings as settingsRepo, catalog as catalogRepo,
  prospects as prospectsRepo, proposals as proposalsRepo,
} from "@pms/shared/lib/data";
import type { DealerProspect, DealerPackageProposal } from "@pms/shared/lib/data/types";
import { APP_NOW_ISO } from "@pms/shared/context/FilterContext";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { buildHQAlerts, type HQAlert } from "@pms/shared/lib/hqAlerts";
import { useAuthReady } from "./useAuthReady";

type ข้อมูลแจ้งเตือน = {
  rules: HQNotifRules;
  prospects?: DealerProspect[];
  proposals?: DealerPackageProposal[];
  catalog?: SolutionProduct[];
};

/** การแจ้งเตือนของสำนักงานใหญ่ ตามกฎที่เปิดไว้ที่ /hq/settings → การแจ้งเตือน
 *  enabled = เฉพาะบัญชี HQ (ดีลเลอร์อ่านตารางลูกค้าเป้าหมาย HQ ไม่ได้ตาม RLS — ห้ามยิงคำขอเปล่า ๆ)
 *  refreshKey = เปลี่ยนเมื่อไหร่ดึงใหม่ (Topbar ส่ง "เปิดกระดิ่ง" มา → เปิดทีไรเห็นของล่าสุด) */
export function useHQAlerts(enabled = true, refreshKey: unknown = 0): HQAlert[] {
  const ready = useAuthReady();   // ยังไม่ล็อกอิน = ห้ามยิงคำขอ (ดู useAuthReady.ts)
  const [data, setData] = useState<ข้อมูลแจ้งเตือน | null>(null);
  const [รอบ, setรอบ] = useState(0);

  // บันทึกหน้าตั้งค่า / กลับมาที่แท็บ → ดึงใหม่
  useEffect(() => {
    if (!enabled) return;
    const ดึงใหม่ = () => setรอบ(n => n + 1);
    window.addEventListener(HQ_NOTIF_UPDATED_EVENT, ดึงใหม่);
    window.addEventListener("focus", ดึงใหม่);
    return () => {
      window.removeEventListener(HQ_NOTIF_UPDATED_EVENT, ดึงใหม่);
      window.removeEventListener("focus", ดึงใหม่);
    };
  }, [enabled]);

  useEffect(() => {
    if (!ready || !enabled) return;
    let alive = true;
    // แยกกันโหลด — เรื่องไหนพลาดก็แค่เรื่องนั้นไม่ขึ้น (undefined) ไม่ทำให้เรื่องอื่นหายไปด้วย
    const อ่าน = <T,>(ชื่อ: string, p: Promise<T>) => p.catch(e => { logRepoRead(ชื่อ, e); return undefined; });
    Promise.all([
      settingsRepo.getNotifRules(),
      อ่าน("prospects.list(alerts)", prospectsRepo.list()),
      อ่าน("proposals.list(alerts)", proposalsRepo.list()),
      อ่าน("catalog.list(alerts)", catalogRepo.list()),
    ]).then(([rules, prospects, proposals, catalog]) => {
      if (alive) setData({ rules, prospects, proposals, catalog });
    }).catch(e => logRepoRead("settings.getNotifRules(alerts)", e));
    return () => { alive = false; };
  }, [ready, enabled, refreshKey, รอบ]);

  return useMemo(
    () => (enabled && data ? buildHQAlerts({ ...data, วันนี้ISO: APP_NOW_ISO }) : []),
    [enabled, data],
  );
}
