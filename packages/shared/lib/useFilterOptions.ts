"use client";
import { ไม่ใช่แถวHQ } from "@pms/shared/lib/hqDealerRow";

// ตัวเลือกของแถบตัวกรอง — ต้องมาจากข้อมูลจริงเสมอ
//
// เดิมเป็นค่าคงที่ระดับโมดูลใน FilterContext ที่คำนวณจากชุด seed ตอน import
// โหมด supabase จึงเห็น "ดีลเลอร์/จังหวัด/ผู้รับผิดชอบ" ที่ไม่มีอยู่จริงในระบบ (กติกา: ห้ามกุข้อมูล)
// ย้ายมาเป็น hook อ่านผ่าน repository → โหมด supabase ได้ของจริงจาก DB
// ส่วนโหมด local ยังได้ชุดเดิม เพราะ LocalAdapter อ่านจาก seed อยู่แล้ว (พฤติกรรมไม่เปลี่ยน)
import { useMemo } from "react";
import { useSales } from "@pms/shared/context/SalesContext";
import { useRepoValue } from "./useRepoState";
import { dealers as dealersRepo, persons as personsRepo } from "./data";
import type { DealerRow, ResponsiblePerson } from "./data/types";

export type Option = { value: string; label: string };

const byThai = (a: string, b: string) => a.localeCompare(b, "th");

/** ดีลเลอร์ทั้งเครือ — จากทะเบียนดีลเลอร์จริง */
export function useDealerOptions(): Option[] {
  const dealers = useRepoValue<DealerRow[]>(() => dealersRepo.list(), []);
  return useMemo(() => dealers.filter(ไม่ใช่แถวHQ).map(d => ({ value: d.code, label: d.name })), [dealers]);   // แถว HQ ไม่ใช่ดีลเลอร์ — ไม่นับ/ไม่แสดง (บอสตัดสิน 19 ต.ค. 69 · lib/hqDealerRow.ts)
}

/** จังหวัด — เก็บจากจังหวัดที่ "มีอยู่จริง" ในลูกค้า/ใบเสนอราคา/ลูกค้าเป้าหมาย ไม่ใช่รายชื่อจังหวัดทั้งประเทศ */
export function useProvinceOptions(): Option[] {
  const { customers, quotations, leads } = useSales();
  return useMemo(() => {
    const set = new Set<string>();
    customers.forEach(c => c.province && set.add(c.province));
    quotations.forEach(q => q.province && set.add(q.province));
    leads.forEach(l => l.province && set.add(l.province));
    return [...set].sort(byThai).map(p => ({ value: p, label: p }));
  }, [customers, quotations, leads]);
}

/** ผู้รับผิดชอบที่ยังทำงานอยู่ — จากทะเบียนพนักงานของสาขา */
export function usePersonOptions(): Option[] {
  const persons = useRepoValue<ResponsiblePerson[]>(() => personsRepo.list(), []);
  return useMemo(
    () => persons.filter(p => p.active).map(p => ({ value: p.name, label: p.name })),
    [persons],
  );
}
