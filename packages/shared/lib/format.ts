// ── number / currency helpers ──
// แปลงสตริงมูลค่า ("฿1.2M" / "฿480K" / "1,200,000" / "2.8B") → ตัวเลขบาท (รองรับหน่วย B/M/K)
export function parseBaht(v: string | number): number {
  if (typeof v === "number") return v;
  const s = (v ?? "").toString().replace(/[฿,\s]/g, "");
  const n = parseFloat(s) || 0;
  if (/B/i.test(s)) return n * 1e9;
  if (/M/i.test(s)) return n * 1e6;
  if (/K/i.test(s)) return n * 1e3;
  return n;
}


// ── มูลค่าที่เซลส์ประเมินไว้กับลูกค้าเป้าหมาย — แสดงผลที่เดียวทั้งระบบ ──────────
// ช่องนี้เก็บ "ตามที่ผู้ใช้พิมพ์" (1400000 · 1.4M · ฿1,400,000) เพื่อไม่ให้เงินหายตอนบันทึก
// เวลาเอาไปโชว์จึงต้องจัดรูปแบบทุกครั้ง ไม่งั้นหน้าจอขึ้นเลขติดกันอ่านไม่ออก เช่น 5270000
// ไม่มีค่า/อ่านไม่ออก = "—" (ยังไม่รู้มูลค่า) ห้ามโชว์ ฿0 เพราะ 0 แปลว่า "ไม่มีมูลค่า" ซึ่งไม่จริง
export function fmtLeadValue(v: string | number | null | undefined): string {
  const n = parseBaht(typeof v === "number" ? v : String(v ?? ""));
  return n > 0 ? `฿${Math.round(n).toLocaleString("th-TH")}` : "—";
}


// ── เลขประจำตัวผู้เสียภาษี 13 หลัก — ใส่ขีดให้ตามรูปแบบราชการ X-XXXX-XXXXX-XX-X ──
// เติมให้ระหว่างพิมพ์เหมือนช่องเบอร์โทร (บอสสั่ง 25 ส.ค. 69) — เอกสารที่ออกให้ลูกค้าจะได้อ่านง่าย
// รับเฉพาะตัวเลข ตัดอย่างอื่นทิ้ง และตัดที่ 13 หลัก (ยาวกว่านั้นคือพิมพ์เกิน)
// "-" ล้วน = ตั้งใจไม่มีเลข (บุคคลธรรมดา/ยังไม่จด) — ช่องบังคับรับ "-" (บอสสั่ง 4 พ.ย. 69) · เดิมกลืนขีดทิ้งเหลือว่าง
export function formatTaxId(v: string): string {
  if (String(v ?? "").trim() === "-") return "-";
  const เลข = String(v ?? "").replace(/\D/g, "").slice(0, 13);
  if (!เลข) return "";
  const ท่อน = [เลข.slice(0, 1), เลข.slice(1, 5), เลข.slice(5, 10), เลข.slice(10, 12), เลข.slice(12, 13)];
  return ท่อน.filter(Boolean).join("-");
}


// ── ช่องกรอกจำนวนเงิน — ใส่ลูกน้ำให้เห็นระหว่างพิมพ์ (บอสสั่ง 26 ส.ค. 69) ──────────
// ⚠️ ช่อง <input type="number"> ใส่ลูกน้ำไม่ได้ (เบราว์เซอร์ถือว่าไม่ใช่ตัวเลข) จึงต้องเป็น text
//    แล้วเก็บค่าจริงเป็นตัวเลขด้วย เลขล้วนอ่านยากมากตอนหลักล้าน: 42000000 vs 42,000,000
export function formatMoneyInput(v: string): string {
  const raw = String(v ?? "").replace(/[^\d.]/g, "");
  if (!raw) return "";
  const [i, ...rest] = raw.split(".");
  const หัว = (i || "0").replace(/^0+(?=\d)/, "");
  const ท้าย = rest.length ? "." + rest.join("").slice(0, 2) : "";
  return Number(หัว).toLocaleString("en-US") + ท้าย;
}
/** อ่านค่าจริงจากช่องที่ใส่ลูกน้ำแล้ว — ว่าง/อ่านไม่ออก = 0 */
export function parseMoneyInput(v: string): number {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return isFinite(n) && n > 0 ? n : 0;
}

export function fmtBaht(v: number): string {
  if (!isFinite(v) || v <= 0) return "฿0";
  if (v >= 1_000_000_000_000) return `฿${(v / 1_000_000_000_000).toFixed(1)}T`;
  if (v >= 1_000_000_000) return `฿${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `฿${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `฿${Math.round(v / 1_000)}K`;
  return `฿${v.toLocaleString()}`;
}

export function fmtFull(v: number | null | undefined): string {
  return `฿${(v ?? 0).toLocaleString()}`;
}

// เท่ากับ fmtFull แต่ปัดเศษก่อนแสดง (ค่าที่มีจุดทศนิยม เช่นผลรวมที่คำนวณจากหลายรายการ)
export function fmtFullRounded(v: number | null | undefined): string {
  return fmtFull(Math.round(v ?? 0));
}

// ย่อเฉพาะหลักล้านขึ้นไป (฿1.5M) ต่ำกว่านั้นแสดงเต็ม (฿480,000) — ต่างจาก fmtBaht ที่ย่อตั้งแต่หลักพัน
export function fmtBahtM(v: number | null | undefined): string {
  const n = v ?? 0;
  return n >= 1e6 ? `฿${(n / 1e6).toFixed(1)}M` : fmtFull(n);
}

// ── อัตราส่วนที่ "ยังตัดสินไม่ได้" ต้องขึ้น "—" ไม่ใช่ 0% ────────────────────────────
//
// บั๊กจริง (เอเจนต์สวมบทผู้บริหารเจอเอง 10 ส.ค. 69):
//   หน้าที่ยังไม่มีข้อมูลขึ้น "อัตราแปลงเป็นลูกค้า 0%" และ "อัตราปิดการขาย 0% · 0/0 ใบ"
//   ซึ่งสื่อว่า "มีโอกาสแล้วทำไม่ได้เลย" ทั้งที่ความจริงคือ "ยังไม่มีโอกาสให้วัด"
//   ผู้บริหารอ่านแล้วสรุปผิดว่าทีมทำงานล้มเหลว
//   ยิ่งสับสนเพราะบางหน้าทำถูกอยู่แล้ว (ขึ้น "—") = ตัวเลขเดียวกันแสดงคนละแบบในระบบเดียว
//
// กติกา: ตัวหารเป็น 0 = ยังตัดสินไม่ได้ → "—" เสมอ ทุกหน้า
export function pctOrNull(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}
/** ข้อความเปอร์เซ็นต์พร้อมหน่วย — ตัวหารเป็น 0 คืน "—" */
export function pctText(part: number, whole: number): string {
  const p = pctOrNull(part, whole);
  return p === null ? "—" : `${p}%`;
}

// ── เบอร์โทรศัพท์: รับเฉพาะตัวเลข แล้วใส่ขีดให้เอง (บอสสั่ง 21 ส.ค. 69) ─────────────
//
// เดิมเป็นช่องข้อความอิสระ — พิมพ์ตัวอักษร/เว้นวรรค/วงเล็บลงไปก็ได้ และแต่ละคนใส่ขีดคนละแบบ
// (0812345678 · 081-234-5678 · 081 234 5678) เบอร์เดียวกันจึงค้นหาไม่เจอกัน
//
// รูปแบบ: มือถือ/เบอร์ 10 หลัก = 3-3-4 (081-234-5678)
//         เบอร์บ้านกรุงเทพ 9 หลัก ขึ้นต้น 02 = 2-3-4 (02-123-4567)
// ⚠️ ตัดที่ 10 หลัก — เบอร์ไทยยาวสุด 10 หลัก พิมพ์เกินคือพิมพ์ผิด ไม่ใช่เบอร์ต่างประเทศ
//    (ถ้าวันหลังต้องรับเบอร์ต่างประเทศ ต้องออกแบบใหม่ทั้งช่อง ไม่ใช่ขยายเพดานตรงนี้)
export function formatPhone(v: string): string {
  const เลข = String(v ?? "").replace(/\D/g, "").slice(0, 10);
  if (!เลข) return "";
  if (เลข.startsWith("02")) {
    if (เลข.length <= 2) return เลข;
    if (เลข.length <= 5) return `${เลข.slice(0, 2)}-${เลข.slice(2)}`;
    return `${เลข.slice(0, 2)}-${เลข.slice(2, 5)}-${เลข.slice(5, 9)}`;
  }
  if (เลข.length <= 3) return เลข;
  if (เลข.length <= 6) return `${เลข.slice(0, 3)}-${เลข.slice(3)}`;
  return `${เลข.slice(0, 3)}-${เลข.slice(3, 6)}-${เลข.slice(6, 10)}`;
}

/** ขนาดไฟล์แบบที่คนอ่านรู้เรื่อง — ต่ำกว่า 1 MB บอกเป็น KB (ปัดขึ้นอย่างน้อย 1 KB ไม่ให้ขึ้น "0 KB") */
export function ขนาดไฟล์อ่านง่าย(bytes: number): string {
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
