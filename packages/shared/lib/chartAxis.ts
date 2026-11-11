// ── ตัวคำนวณแกนของกราฟกลาง (components/ui/Charts.tsx) — ฟังก์ชันล้วน ไม่มี JSX (ข้อทดสอบหน่วย tests/unit/chartAxis.test.ts) ──
//   แกนตั้งเลขกลม (บอสสั่ง 11 พ.ย. 69): ขีดเป็นผลคูณของ 1 · 2 · 5 × 10ⁿ (0 · 10 · 20 … หรือ 0 · 5 · 10 …) ไม่ใช่ 13 · 25 · 38
//   ป้ายแกนนอนครบทุกช่อง: เลือกแบบเดียวทั้งกราฟ (บรรทัดเดียว / แยก 2 บรรทัด / เอียง)
/** ขั้นกลมที่เล็กที่สุดที่ ≥ v (1 · 2 · 5 × 10ⁿ) */
export function ขั้นกลม(v: number): number {
  if (!isFinite(v) || v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}
export function axisTicks(ceiling: number): number[] {
  if (ceiling <= 4) {
    const top = Math.max(1, Math.floor(ceiling));
    return Array.from({ length: top + 1 }, (_, i) => i);
  }
  if (ceiling <= 8) return [0, 2, 4, 6, 8].filter(v => v <= ceiling);
  const ขั้น = ขั้นกลม(ceiling / 4);
  return Array.from({ length: Math.floor(ceiling / ขั้น + 1e-9) + 1 }, (_, i) => Math.round(i * ขั้น * 1e6) / 1e6);
}

export function niceCeil(v: number): number {
  if (!isFinite(v) || v <= 0) return 1;
  if (v <= 8) {
    // ช่วงเล็กคงแบบเดิม (ขีดจำนวนเต็ม/คู่ ใน axisTicks) — ปัดขึ้นเป็นค่าที่ขีดลงตัว
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / pow;
    return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(s => n <= s) ?? 10) * pow;
  }
  const ขั้น = ขั้นกลม(v / 4);
  return ขั้น * Math.ceil(v / ขั้น - 1e-9);
}


/** ความกว้างโดยประมาณของคำ — สระบน/ล่าง วรรณยุกต์ ไม่กินความกว้าง */
export const กว้างคำ = (t: string, fs: number) => t.replace(/[ัิ-ฺ็-๎]/g, "").length * fs * 0.68;   // สระบน/ล่าง วรรณยุกต์ ไม่กินความกว้าง · 0.68 เท่าฟอนต์ต่อตัว (ตัวไทยกว้างกว่าตัวเลข — 0.55 เดิมประมาณต่ำ ป้ายบรรทัดเดียวทับกัน 11 พ.ย. 69)
/** แบบป้าย + ขนาดตัวอักษร: บรรทัดเดียว → แยก 2 บรรทัด → แยก 2 บรรทัดย่อตัวอักษร (ไม่ต่ำกว่า 10px) → เอียงเป็นทางสุดท้าย
 *  ⚠️ 11 พ.ย. 69: เอียงแล้วกรอบป้ายซ้อนป้ายข้าง ๆ เสมอ (chart-label-overlap ตก) → ย่อตัวอักษรก่อนเอียง */
export function ขนาดป้ายแกน(ทั้งหมด: string[], ช่อง: number, fs: number): { แบบ: "เดียว" | "สอง" | "เอียง"; fs: number } {
  if (Math.max(1, ...ทั้งหมด.map(p => กว้างคำ(String(p), fs))) + 6 <= ช่อง) return { แบบ: "เดียว", fs };
  const ยาวสุด = Math.max(1, ...ทั้งหมด.flatMap(p => String(p).split(" ").map(t => กว้างคำ(t, 1))));   // ความกว้างต่อ 1px ของฟอนต์
  if (ยาวสุด * fs + 4 <= ช่อง) return { แบบ: "สอง", fs };
  const ย่อ = Math.floor(((ช่อง - 4) / ยาวสุด) * 10) / 10;
  if (ย่อ >= 10) return { แบบ: "สอง", fs: ย่อ };
  return { แบบ: "เอียง", fs };
}
export const แบบป้ายแกน = (ทั้งหมด: string[], ช่อง: number, fs: number) => ขนาดป้ายแกน(ทั้งหมด, ช่อง, fs).แบบ;
