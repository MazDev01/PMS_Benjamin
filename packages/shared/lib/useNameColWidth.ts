"use client";
// ── ความกว้างคอลัมน์ชื่อของตารางพอดีจอ (บอสสั่ง 6 พ.ย. 69) — วัดหลังหน้าขึ้นจอ (ฝั่งเซิร์ฟเวอร์วัดไม่ได้ · กันหน้าจอไม่ตรงกันตอนโหลด) ──
//   วัดซ้ำเมื่อแบบอักษรของหน้าโหลดเสร็จ (document.fonts.ready) และเมื่อความกว้างตารางเปลี่ยน (ResizeObserver · เพดาน 25% เป็นพิกเซล)
//   วัดทั้งบรรทัดชื่อ (ตัวหนา) และบรรทัดเล็กใต้ชื่อ (ภูมิภาค · จังหวัด) — คอลัมน์พอดีบรรทัดที่ยาวกว่า
//   ขนาดตัวอักษรต้องตรงกับ .table-wrap.fit ใน globals.css (ขนาดตัวอักษรตาราง · ขนาดบรรทัดย่อย)
//   ใช้: const ชื่อคอล = useกว้างคอลัมน์ชื่อ(ชื่อ, ตั้ง, ย่อย) · <table ref={ชื่อคอล.ref}> · <col style={{ width: ชื่อคอล.กว้าง }} />
import { useCallback, useEffect, useRef, useState } from "react";
import { กว้างคอลัมน์ชื่อ, วัดข้อความ, ขนาดตัวอักษรตาราง, ขนาดบรรทัดย่อย } from "./tableFit";

const ตัวคั่นย่อย = "\u0001";

/** ชื่อ = บรรทัดชื่อ (ตัวหนา) · ย่อย = บรรทัดเล็กใต้ชื่อ */
export function useกว้างคอลัมน์ชื่อ(ชื่อ: readonly string[], ตั้ง?: Parameters<typeof กว้างคอลัมน์ชื่อ>[3], ย่อย: readonly string[] = []):
  { กว้าง: number; ref: (el: HTMLTableElement | null) => void } {
  const คีย์ = [...ชื่อ, ตัวคั่นย่อย, ...ย่อย].join("\u001f");
  const [กว้างตาราง, setกว้างตาราง] = useState<number | null>(null);
  const [ตัววัดพร้อม, setตัววัดพร้อม] = useState(0);
  const ผู้เฝ้า = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLTableElement | null) => {
    ผู้เฝ้า.current?.disconnect();
    if (!el || typeof ResizeObserver === "undefined") return;
    ผู้เฝ้า.current = new ResizeObserver(() => setกว้างตาราง(Math.round(el.getBoundingClientRect().width)));
    ผู้เฝ้า.current.observe(el);
  }, []);
  useEffect(() => () => ผู้เฝ้า.current?.disconnect(), []);
  useEffect(() => { let alive = true; void document.fonts?.ready.then(() => { if (alive) setตัววัดพร้อม(n => n + 1); }); return () => { alive = false; }; }, []);
  const [กว้าง, setกว้าง] = useState(() => กว้างคอลัมน์ชื่อ(ชื่อ, null, null, ตั้ง));
  useEffect(() => {
    const ใหญ่ = วัดข้อความ(`600 ${ขนาดตัวอักษรตาราง}`), เล็ก = วัดข้อความ(`500 ${ขนาดบรรทัดย่อย}`);
    const ตัววัด = ใหญ่ && เล็ก ? (x: string) => (x.startsWith(ตัวคั่นย่อย) ? เล็ก(x.slice(1)) : ใหญ่(x)) : null;
    setกว้าง(กว้างคอลัมน์ชื่อ([...ชื่อ, ...ย่อย.filter(Boolean).map(x => ตัวคั่นย่อย + x)], ตัววัด, กว้างตาราง, ตั้ง));
  }, [คีย์, กว้างตาราง, ตัววัดพร้อม, ตั้ง?.ขั้นต่ำ, ตั้ง?.ช่องว่าง, ตั้ง?.เพดาน]);   // eslint-disable-line react-hooks/exhaustive-deps
  return { กว้าง, ref };
}
