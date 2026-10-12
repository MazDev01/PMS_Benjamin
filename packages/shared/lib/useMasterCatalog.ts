"use client";

import { useEffect, useState } from "react";
import { logRepoRead } from "./repoLog";
import { MASTER_CATALOG_EVENT, type SolutionProduct } from "./mock";
import { catalog as catalogRepo, realtime } from "./data";

// แคตตาล็อกแม่แบบ/ราคากลาง "แหล่งเดียว" — HQ แก้ที่ /hq/master → ทุก dropdown/หน้าแม่แบบเห็นชุดเดียวกัน
// เริ่มด้วย mock (SSR-safe) แล้วโหลดจาก repository ตอน mount + ติดตามการแก้เพื่ออัปเดตตามทันที:
//   • supabase → Realtime (postgres_changes บน master_catalog) = ข้ามแอป/ข้ามเครื่องได้จริง
//   • local    → event ตอนกดบันทึก + storage event = ได้เฉพาะ origin เดียวกัน
//     ⚠️ โหมด local ดีลเลอร์(:3001) กับ HQ(:3002) คนละ origin → localStorage แยกกัน จึงไม่เห็นกัน
//        ถ้าต้องการให้ HQ แก้แล้วดีลเลอร์เปลี่ยนตาม ต้องตั้ง NEXT_PUBLIC_DATA_SOURCE=supabase
export function useMasterCatalog(): SolutionProduct[] {
  return useMasterCatalogState().catalog;
}

/** เหมือน useMasterCatalog แต่บอกด้วยว่า "โหลดเสร็จหรือยัง"
 *
 *  จำเป็นเพราะ "ว่างเพราะยังโหลดไม่เสร็จ" กับ "ว่างเพราะยังไม่มีแม่แบบจริง ๆ" ต่างกันมาก
 *  หน้าจอที่จะขึ้นข้อความว่า "สำนักงานใหญ่ยังไม่ได้ตั้งแม่แบบ" ต้องรอให้โหลดจบก่อน
 *  ไม่งั้นจะขึ้นข้อความผิดวาบหนึ่งทุกครั้งที่เปิดฟอร์ม แล้วหายไปเอง — กวนและทำให้ไม่เชื่อถือ */
export function useMasterCatalogState(): { catalog: SolutionProduct[]; ready: boolean } {
  // เริ่มว่างเสมอ — เดิมตั้งต้นด้วยชุดตัวอย่าง ทำให้เห็นแม่แบบปลอมกะพริบก่อนของจริงมา
  // และถ้า query ล้มเหลว จะค้างอยู่กับชุดตัวอย่างตลอด (ตกไปถึง dropdown "แม่แบบ" ทุกหน้า)
  const [catalog, setCatalog] = useState<SolutionProduct[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    // แสดงตามที่ repo คืนมาจริง (ถ้าแคตตาล็อกใน DB ว่าง = เห็นว่าง ไม่เอา mock มาทับให้เข้าใจผิด)
    const read = () => {
      catalogRepo.list()
        .then((rows) => { if (alive) { setCatalog(rows); setReady(true); } })
        // โหลดไม่สำเร็จ = ยังไม่รู้ว่ามีแม่แบบไหม → ไม่ตั้ง ready เพื่อไม่ให้ขึ้นข้อความ "ไม่มีแม่แบบ" ทั้งที่แค่โหลดพลาด
        .catch((e) => logRepoRead("catalog.list", e));
    };
    read();

    const unsubRealtime = realtime.subscribeCatalog(read); // supabase: ข้ามแอป · local: no-op
    window.addEventListener(MASTER_CATALOG_EVENT, read);   // local: HQ กดบันทึกในแอปเดียวกัน
    window.addEventListener("storage", read);              // local: อีกแท็บของ origin เดียวกัน
    return () => {
      alive = false;
      unsubRealtime();
      window.removeEventListener(MASTER_CATALOG_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  return { catalog, ready };
}
