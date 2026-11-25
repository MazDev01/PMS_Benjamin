"use client";
// ── โลโก้ของระบบในเมนู (บอสสั่ง 24 พ.ย. 69 · ใบ 0304) ─────────────────────────────────────
//   ถาม sha จาก /api/v1/brand-logo?op=meta หลังรู้ตัวตนแล้วเท่านั้น (หน้าเข้าระบบ/ยังไม่ล็อกอิน = โลโก้เดิมเสมอ)
//   เฉพาะโหมด api (ใบผ่านอยู่ในคุกกี้ — <img> ส่งคุกกี้ไปเอง) · โหมดอื่น/ถามไม่ได้ = โลโก้เดิม
//   HQ เปลี่ยน/ล้างในแท็บนี้ → เหตุการณ์ pms:brand-logo-changed → ถามใหม่ทันที · แท็บอื่นเห็นเมื่อเปิดหน้าใหม่
import { useCallback, useEffect, useState } from "react";
import { DATA_SOURCE } from "@pms/shared/lib/data/config";
import { apiFetch } from "@pms/shared/lib/data/http/HttpAdapter";
import { ที่อยู่โลโก้, เหตุการณ์โลโก้เปลี่ยน } from "@pms/shared/lib/brandLogo";

export function useBrandLogo(พร้อม: boolean): { sha: string | null; src: string; โหลดใหม่: () => void } {
  const [sha, setSha] = useState<string | null>(null);
  const โหลดใหม่ = useCallback(() => {
    if (!พร้อม || DATA_SOURCE !== "api") { setSha(null); return; }
    apiFetch<string | null>("/brand-logo?op=meta")
      .then(v => setSha(typeof v === "string" && v ? v : null))
      .catch(() => setSha(null));   // ถามไม่ได้ = โลโก้เดิม (ไม่ขวางเมนู)
  }, [พร้อม]);
  useEffect(() => {
    โหลดใหม่();
    if (typeof window === "undefined") return;
    window.addEventListener(เหตุการณ์โลโก้เปลี่ยน, โหลดใหม่);
    return () => window.removeEventListener(เหตุการณ์โลโก้เปลี่ยน, โหลดใหม่);
  }, [โหลดใหม่]);
  return { sha, src: ที่อยู่โลโก้(sha), โหลดใหม่ };
}
