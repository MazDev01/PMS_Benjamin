// ── ชื่อแสดงของดีลเลอร์ (ตรรกะล้วน · ตัวกลางตัวเดียว · บอสสั่ง 6 พ.ย. 69) — ชื่อซ้ำ = "ชื่อ (รหัส)" เฉพาะคู่ที่ซ้ำ · ฐานใช้กติกาเดียวกัน (_dealer_display_name ใบ 0281)
const คีย์ชื่อ = (s: string) => s.trim().toLowerCase();

/** ตัวแปลงรหัส → ชื่อแสดง จากรายชื่อดีลเลอร์ทั้งเครือ · ไม่รู้จักรหัส = ชื่อสำรองที่ส่งมา หรือรหัส (ไม่เดาชื่อ) */
export function สร้างชื่อแสดง(รายชื่อ: readonly { code: string; name: string }[]): (code: string | null | undefined, สำรอง?: string | null) => string {
  const นับ = new Map<string, number>();
  for (const d of รายชื่อ) if (d.name?.trim()) นับ.set(คีย์ชื่อ(d.name), (นับ.get(คีย์ชื่อ(d.name)) ?? 0) + 1);
  const ชื่อ = new Map(รายชื่อ.map(d => [d.code, d.name?.trim() || ""]));
  return (code, สำรอง) => {
    if (!code) return สำรอง?.trim() || "—";
    const n = ชื่อ.get(code) || สำรอง?.trim() || "";
    if (!n) return code;
    return (นับ.get(คีย์ชื่อ(n)) ?? 0) > 1 ? `${n} (${code})` : n;
  };
}

