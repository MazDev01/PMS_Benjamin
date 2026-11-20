// ── ส่วน "งานขายเต็ม": ทุกลีดมีกิจกรรม/นัดหมาย/ไฟล์แนบแบบงานขายจริง ตามขั้นของงาน (บอสสั่ง 19 พ.ย. 69 "ใส่ข้อมูลให้เต็มแบบของจริง") ──
//   จำนวนตามขั้น: ขั้น 1 (เก็บข้อมูล) = 1–2 · ขั้นกลาง = 3–7 · ปิดแล้ว = 6–10 (กิจกรรม) · นัด 1–4 · ไฟล์ 1–4
//   กิจกรรมหลายชนิด (โทร · อีเมล · เข้าพบ · LINE/บันทึก · ส่งเอกสาร) เรียงตามเวลาจริงระหว่างวันเข้า → วันปิด/วันนี้
//     ข้อความตามเรื่องของงานนั้น (พื้นที่ · ความสูง · ประตู · งบ · คู่แข่ง · กำหนดเริ่มงาน · เลขคำขอราคา/ใบ/มูลค่าของงานเดียวกัน) — ไม่ซ้ำตายตัว
//   นัด: ที่ผ่านแล้ว = เสร็จแล้ว + ผู้เข้าร่วม + ผลหลังนัด · งานที่ยังเปิด = นัดข้างหน้า 1 นัด (วาระ) · สถานที่ = ที่อยู่หน้างาน
//   ไฟล์ตามขั้น: รูปหน้างาน → แปลนร่าง → เอกสารลูกค้า → สัญญา (ปิดสำเร็จ) · รูปวาดเอง (PNG) อัปโหลดถังจริง · ใบเสนอราคาที่ส่ง = แถวที่ระบบสร้างเองอยู่แล้ว
//   ของเดิมของลีด (ไทม์ไลน์ระบบ · นัด/ไฟล์ของส่วนก่อน) คงไว้และนับรวม · เติมเฉพาะส่วนที่ขาดจากเป้าตามขั้น
//   ทำท้ายสุด (หลังช่องครบ) · ลบ = นัดเลข 971_000_000+ · ไฟล์พาธ /lead-full- · กิจกรรมที่ส่วนนี้เติมลบไปพร้อมลีดของส่วนก่อน
import { png, รูปแปลน } from "./แปลนงาน.mjs";

export const ชื่อ = "งานขายเต็ม";
const ถัง = "dealer-files", ป้ายพาธ = "/lead-full-", ฐานเลขนัด = 971_000_000;

// ── สุ่มคงที่ตามกุญแจ ─────────────────────────────────────────────────────────────────────────────────
const เลขกุญแจ = (k) => { let h = 2166136261; for (const ch of String(k)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0; return h; };
const เลือก = (ชุด, k) => ชุด[เลขกุญแจ(k) % ชุด.length];
const ช่วง = (ต่ำ, สูง, k) => ต่ำ + (เลขกุญแจ(k) % (สูง - ต่ำ + 1));

// ── เวลาไทย ───────────────────────────────────────────────────────────────────────────────────────────
const เดือนย่อ = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const เดือนเต็ม = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const ไทย = (ms) => new Date(ms + 7 * 3600_000);
const ป้ายเวลา = (ms) => { const d = ไทย(ms); return `${d.getUTCDate()} ${เดือนย่อ[d.getUTCMonth()]} ${d.getUTCFullYear() + 543} · ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
const วันISO = (ms) => ไทย(ms).toISOString().slice(0, 10);
const เดือนข้างหน้า = (ms, n) => { const d = ไทย(ms); d.setUTCMonth(d.getUTCMonth() + n); return `${เดือนเต็ม[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`; };
/** ป้ายวันที่ในไทม์ไลน์เดิม ("14 พ.ย. 2569 · 05:55" หรือ "2026-04-25") → ms · อ่านไม่ได้ = null */
function อ่านป้าย(a) {
  if (a?.at && !Number.isNaN(Date.parse(a.at))) return Date.parse(a.at);
  const s = String(a?.date ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return Date.parse(`${s}T12:00:00+07:00`);
  const m = /^(\d{1,2})\s+(\S+)\s+(\d{4})(?:\s*·\s*(\d{1,2}):(\d{2}))?/.exec(s);
  if (!m || !เดือนย่อ.includes(m[2])) return null;
  return Date.parse(`${+m[3] - 543}-${String(เดือนย่อ.indexOf(m[2]) + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}T${(m[4] ?? "12").padStart(2, "0")}:${m[5] ?? "00"}:00+07:00`);
}
/** เวลาทำงาน 08:30–17:30 ของวันนั้น (ไทย) ตามกุญแจ */
const ในเวลางาน = (ms, k) => { const d = ไทย(ms); d.setUTCHours(8 + ช่วง(0, 9, k), ช่วง(0, 5, k + "m") * 10, 0, 0); return d.getTime() - 7 * 3600_000; };

// ── ขั้นของงาน → เป้า ─────────────────────────────────────────────────────────────────────────────────
const ระดับ = { WAITING: 1, BULLET: 2, HQ_PRICING: 3, HQ_QUOTED: 4, QUOTED: 5, PAID: 6, CANCELLED: 6 };
const เป้ากิจกรรม = (ร, k) => ร <= 1 ? ช่วง(1, 2, k) : ร === 2 ? ช่วง(3, 4, k) : ร <= 4 ? ช่วง(4, 6, k) : ร === 5 ? ช่วง(5, 7, k) : ช่วง(6, 10, k);
const เป้านัด = (ร, k) => ร <= 1 ? 1 : ร === 2 ? 2 : ร <= 5 ? ช่วง(2, 3, k) : ช่วง(2, 4, k);
const ชนิดติดต่อ = new Set(["call", "email", "meeting", "note"]);

// ── ข้อความกิจกรรม (เติมข้อเท็จจริงของงาน) ──────────────────────────────────────────────────────────────
/** ชนิดอาคารและการใช้งาน ตามงานของลีด (ศัพท์ในข้อความให้ตรงงาน · 19 พ.ย. 69 คนรวมงานพบ "ส่งผลงานโกดัง" กับงานห้องเย็น) */
// ชนิดอาคารพูดถึงโครงเหล็กเสมอ (บอสสั่ง 20 พ.ย. 69 "ข้อมูลตัวอย่างเน้นโครงเหล็ก")
function ชนิดงาน(l) {
  const ง = String(l.project ?? "");
  if (/ห้องเย็น/.test(ง)) return { ชนิด: "ห้องเย็นโครงเหล็ก", ใช้: `เก็บ${เลือก(["ผลไม้ส่งออก", "ผักสด", "อาหารทะเลแช่แข็ง", "ผลผลิตเกษตร"], l.id + "g")}` };
  if (/โรงงาน/.test(ง)) return { ชนิด: "โรงงานโครงเหล็ก", ใช้: `ผลิต${เลือก(["ชิ้นส่วนรถยนต์", "บรรจุภัณฑ์", "เฟอร์นิเจอร์", "อาหารแปรรูป"], l.id + "g")}` };
  if (/โรงจอด/.test(ง)) return { ชนิด: "โรงจอดรถโครงเหล็ก", ใช้: `จอดรถบรรทุก ${ช่วง(4, 12, l.id + "g")} คัน` };
  if (/สำนักงาน/.test(ง)) return { ชนิด: "อาคารสำนักงานโครงเหล็ก", ใช้: `เป็นสำนักงานพนักงาน ${ช่วง(15, 60, l.id + "g")} คน` };
  return { ชนิด: "โกดังโครงเหล็ก", ใช้: `เก็บ${เลือก(["ข้าวสาร", "ปุ๋ย", "อะไหล่รถยนต์", "วัสดุก่อสร้าง", "สินค้าเกษตร", "บรรจุภัณฑ์", "เฟอร์นิเจอร์"], l.id + "g")}` };
}
function ข้อเท็จจริง(l) {
  const A = Number(String(l.area ?? "").replace(/,/g, "")) || ช่วง(400, 1800, l.id);
  const กว้าง = Math.max(12, Math.round(Math.sqrt(A / 2))), ยาว = Math.round(A / กว้าง);
  const งบ = Math.round(A * ช่วง(2300, 2900, l.id + "b") / 100_000) / 10;
  return { A, กว้าง, ยาว, งบ, สูง: เลือก([6, 7, 8, 9, 10], l.id + "h"), ประตู: ช่วง(1, 4, l.id + "d"), คู่แข่ง: ช่วง(1, 3, l.id + "c"),
    เริ่มงาน: เดือนข้างหน้า(l.created, ช่วง(2, 5, l.id + "s")), ...ชนิดงาน(l) };
}
const ชุดข้อความ = {
  แรก: [
    (l, f) => ["call", `ติดต่อครั้งแรก (โทร) · ลูกค้าโทรเข้ามาสอบถาม${f.ชนิด}ประมาณ ${f.A.toLocaleString()} ตร.ม. ที่${l.province} ไว้${f.ใช้}`],
    (l, f) => ["call", `ติดต่อครั้งแรก (โทร) · โทรกลับ${l.contact || "ลูกค้า"} ที่กรอกแบบฟอร์ม ต้องการอาคารราว ${f.A.toLocaleString()} ตร.ม. เริ่มงานช่วง${f.เริ่มงาน}`],
    (l, f) => ["note", `ติดต่อครั้งแรก (LINE) · ลูกค้าทักทาง LINE ส่งรูปที่ดินมา ขนาดประมาณ ${f.กว้าง}×${f.ยาว} ม. อยากได้${f.ชนิด}ไว้${f.ใช้}`],
  ],
  สำรวจ: [
    (l, f) => ["meeting", `เข้าพบลูกค้า (พบลูกค้า) · ดูที่ดิน ${f.กว้าง}×${f.ยาว} ม. ${เลือก(["พื้นที่ราบ", "ต้องถมดินด้านหลัง", "ติดถนนสองด้าน", "มีอาคารเดิมต้องรื้อบางส่วน"], l.id + "lt")} · ${เลือก(["รถพ่วงเข้าออกได้", "ถนนหน้างานกว้าง " + ช่วง(6, 12, l.id + "rw") + " ม.", "ต้องขออนุญาตใช้ถนนตอนขนเหล็ก"], l.id + "ac")} · คุยความสูงชายคา ${f.สูง} ม. ประตูม้วน ${f.ประตู} บาน`],
    (l, f) => ["call", `ติดตามลูกค้า (โทร) · ลูกค้าแจ้งงบประมาณราว ${f.งบ} ล้านบาท ขอให้ช่วยดูสเปกที่คุ้มที่สุด`],
    (l, f) => ["note", `ติดตามลูกค้า (LINE) · ลูกค้าส่งผังที่ดินและรูปถนนหน้างาน ยืนยันขนาด ${f.กว้าง}×${f.ยาว} ม.`],
    (l, f) => ["email", `ส่งข้อมูล (อีเมล) · ส่งผลงาน${f.ชนิด} ${ช่วง(2, 5, l.id + "w")} แห่งที่สร้างแล้วในจ.${l.province} ให้${l.contact || "ลูกค้า"} พร้อมสเปกหลังคาเมทัลชีท${เลือก(["กันความร้อน", "หนา 0.47 มม.", "มีฉนวน PU"], l.id + "rf")} สำหรับ${f.ใช้} ${f.A.toLocaleString()} ตร.ม.`],
    (l, f) => ["call", `ติดตามลูกค้า (โทร) · ${l.contact || "ลูกค้า"} ต้องการเริ่มก่อสร้างภายใน${f.เริ่มงาน} ถามระยะเวลาผลิตและติดตั้งงาน ${f.A.toLocaleString()} ตร.ม. ตอบว่าราว ${ช่วง(35, 70, l.id + "pt")} วัน`],
  ],
  ขอราคา: [
    (l, f, r) => ["note", `ส่งคำขอราคา ${r.request_no} ให้สำนักงานใหญ่ · พื้นที่ ${f.A.toLocaleString()} ตร.ม. สูง ${f.สูง} ม. ประตู ${f.ประตู} บาน`],
    (l, f, r) => ["call", `แจ้งลูกค้า (โทร) · กำลังให้สำนักงานใหญ่ตีราคาตามคำขอ ${r.request_no} คาดได้ราคาภายในสัปดาห์นี้`],
  ],
  เสนอราคา: [
    (l, f, q) => ["email", `ส่งใบเสนอราคา (อีเมล) · ส่ง ${q.id} มูลค่า ${Number(q.total_value).toLocaleString()} บาท ให้${l.contact || "ลูกค้า"} พร้อมรายละเอียดวัสดุ`],
    (l, f, q) => ["call", `ติดตามผลใบเสนอราคา ${q.id} (โทร) · ลูกค้ากำลังเทียบราคากับผู้รับเหมาอีก ${f.คู่แข่ง} ราย ราคาเราสูงกว่ารายต่ำสุดราว ${ช่วง(2, 9, l.id + "p")}% ขอข้อมูลรับประกันโครงสร้างเพิ่ม`],
    (l, f, q) => ["meeting", `เข้าพบลูกค้า (พบลูกค้า) · อธิบายรายการใน ${q.id} ลูกค้าขอแบ่งชำระเป็นงวดตามความคืบหน้า`],
    (l, f) => ["note", `ติดตามลูกค้า (LINE) · ลูกค้าถามเรื่องงานฐานรากสำหรับพื้นที่ ${f.A.toLocaleString()} ตร.ม. ที่ไม่รวมในราคา แนะนำผู้รับเหมางานดินใน${l.province}ให้`],
  ],
  ปิดสำเร็จ: [
    (l, f, q) => ["call", `ปิดการขาย (โทร) · ${l.contact || "ลูกค้า"} ยืนยันสั่งซื้อตาม ${q?.id ?? "ใบเสนอราคา"} นัดเซ็นสัญญา มัดจำ 30% ราว ${Math.round(Number(q?.total_value ?? f.งบ * 1e6) * 0.3).toLocaleString()} บาท`],
    (l, f) => ["note", `หลังปิดการขาย (LINE) · ส่งกำหนดการผลิตโครงเหล็ก ${f.กว้าง}×${f.ยาว} ม. และวันเข้าหน้างานให้ลูกค้า เริ่มงาน${f.เริ่มงาน}`],
  ],
  ปิดไม่สำเร็จ: [
    (l, f) => ["call", `ติดตามผลครั้งสุดท้าย (โทร) · ลูกค้าเลือกผู้รับเหมาใน${l.province}ที่เสนอต่ำกว่าเราราว ${ช่วง(5, 15, l.id + "z")}% บันทึกไว้เสนองานต่อเติมภายหลัง`],
    (l, f) => ["call", `ติดตามผลครั้งสุดท้าย (โทร) · ลูกค้าเลื่อนโครงการ${f.ชนิด} ${f.A.toLocaleString()} ตร.ม. งบ ${f.งบ} ล้านบาทยังไม่อนุมัติ ขอให้ติดต่อใหม่${เดือนข้างหน้า(l.created, ช่วง(6, 10, l.id + "y"))}`],
    (l, f) => ["note", `ติดตามผลครั้งสุดท้าย (LINE) · ลูกค้าเปลี่ยนไปเช่า${f.ชนิด}ขนาด ${Math.round(f.A * 0.8).toLocaleString()} ตร.ม. แทนการสร้างเอง`],
  ],
};
/** รายการกิจกรรมของงาน (ชนิด · ข้อความ) ตามขั้น — ลำดับตามเรื่องจริง */
function เรื่องของงาน(l, f) {
  const ร = ระดับ[l.status] ?? 1, k = l.id;
  const ลำดับ = [เลือก(ชุดข้อความ.แรก, k + "1")(l, f)];
  const สำรวจ = [...ชุดข้อความ.สำรวจ].sort((a, b) => เลขกุญแจ(k + a.toString().length) - เลขกุญแจ(k + b.toString().length));
  // ขั้น 1 (เพิ่งเข้า) = คุยทางโทร/LINE/อีเมล ยังไม่เข้าพบหน้างาน
  for (const t of สำรวจ.filter(t => ร > 1 || t(l, f)[0] !== "meeting").slice(0, ร <= 1 ? 1 : ร === 2 ? 3 : 2)) ลำดับ.push(t(l, f));
  const r = l.requests[0];
  if (r && ร >= 3) for (const t of ชุดข้อความ.ขอราคา) ลำดับ.push(t(l, f, r));
  const q = l.quotes.find(x => x.status !== "draft") ?? l.quotes[0];
  if (q && ร >= 5) for (const t of ชุดข้อความ.เสนอราคา.slice(0, ช่วง(2, 4, k + "q"))) ลำดับ.push(t(l, f, q));
  if (l.status === "PAID") for (const t of ชุดข้อความ.ปิดสำเร็จ) ลำดับ.push(t(l, f, q));
  if (l.status === "CANCELLED") ลำดับ.push(เลือก(ชุดข้อความ.ปิดไม่สำเร็จ, k + "x")(l, f));
  return ลำดับ;
}

// ── รูปวาดเอง: รูปหน้างาน · เอกสาร ──────────────────────────────────────────────────────────────────
function รูปหน้างาน(k) {
  const W = 800, H = 525, px = new Uint8Array(W * H * 3);
  const ฟ้า = [170 + ช่วง(0, 40, k), 205, 235], ดิน = [150 + ช่วง(0, 30, k + "g"), 135, 100];
  const ขอบฟ้า = 200 + ช่วง(0, 60, k + "h");
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 3; const c = y < ขอบฟ้า ? ฟ้า : ดิน; px[i] = c[0]; px[i + 1] = c[1] - (y > ขอบฟ้า ? Math.floor((y - ขอบฟ้า) / 8) : 0); px[i + 2] = c[2]; }
  const ต้นไม้ = ช่วง(3, 7, k + "t");
  for (let t = 0; t < ต้นไม้; t++) {
    const cx = ช่วง(20, W - 20, k + "x" + t), r = ช่วง(14, 30, k + "r" + t);
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) { const px_ = cx + x, py = ขอบฟ้า - r + y; if (px_ >= 0 && px_ < W && py >= 0 && py < H) { const i = (py * W + px_) * 3; px[i] = 60; px[i + 1] = 120; px[i + 2] = 60; } }
  }
  for (let x = 0; x < W; x++) for (let y = H - 40; y < H - 30; y++) { const i = (y * W + x) * 3; px[i] = 90; px[i + 1] = 90; px[i + 2] = 95; }   // ถนนหน้างาน
  // เม็ดภาพแบบรูปถ่ายจริง (ขนาดไฟล์สมจริงหลายร้อย kB · บอสสั่ง 19 พ.ย. 69 "ขนาดสมจริง") — สุ่มคงที่ตามกุญแจ
  let x = เลขกุญแจ(k + "noise") || 1;
  for (let i = 0; i < px.length; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; const v = px[i] + ((x >>> 0) % 25) - 12; px[i] = v < 0 ? 0 : v > 255 ? 255 : v; }
  return png(W, H, px);
}
function รูปเอกสาร(k, บรรทัด = 14) {
  const W = 420, H = 594, px = new Uint8Array(W * H * 3).fill(250);
  const กล่อง = (x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 3; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; } };
  กล่อง(40, 40, 220, 58, [0, 51, 102]);
  for (let n = 0; n < บรรทัด; n++) กล่อง(40, 90 + n * 30, 40 + ช่วง(180, 340, k + n), 98 + n * 30, [180, 186, 196]);
  กล่อง(260, 520, 380, 522, [120, 120, 130]);
  return png(W, H, px);
}

export async function มีแล้ว(ctx) {
  return Number(ctx.sql(`select count(*) from public.appointments where id between ${ฐานเลขนัด} and ${ฐานเลขนัด + 999_999};`).trim()) > 0;
}

export async function สร้าง(ctx) {
  const ดิบ = ctx.sql(`select coalesce(json_agg(json_build_object(
      'dealer', l.dealer_code, 'num', l.num_id, 'id', l.id, 'status', l.status, 'created', l.created_at, 'area', l.area, 'company', l.company,
      'contact', l.contact, 'province', l.province, 'address', l.address, 'assigned', coalesce(nullif(l.assigned, ''), 'พนักงานขาย'), 'project', l.project,
      'activities', coalesce(l.activities, '[]'::jsonb),
      'requests', (select coalesce(json_agg(json_build_object('request_no', r.request_no, 'submitted', r.submitted_at) order by r.submitted_at), '[]') from public.quote_requests r where r.dealer_code = l.dealer_code and r.lead_num_id = l.num_id),
      'quotes', (select coalesce(json_agg(json_build_object('id', q.id, 'status', q.status, 'total_value', q.total_value, 'created', q.created_at, 'won', q.won_at) order by q.created_at), '[]') from public.quotations q where q.dealer_code = l.dealer_code and q.deal_id = l.num_id),
      'appts', (select count(*) from public.appointments a where a.dealer_code = l.dealer_code and a.lead_id = l.num_id),
      'files', (select coalesce(json_agg(f.category), '[]') from public.files f where f.dealer_code = l.dealer_code and f.source = 'lead' and f.record_id = l.num_id))), '[]')
    from public.leads l where l.dealer_code <> 'HQ';`);
  const ลีดทั้งหมด = JSON.parse(ดิบ.slice(ดิบ.indexOf("["), ดิบ.lastIndexOf("]") + 1));
  const ตอนนี้ = Date.now();
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
  const คำสั่ง = [], นัด = [];
  let เลขนัด = ฐานเลขนัด, กิจกรรมเติม = 0, ไฟล์เติม = 0;

  for (const raw of ลีดทั้งหมด) {
    const l = { ...raw, created: Date.parse(raw.created) };
    const f = ข้อเท็จจริง(l), ร = ระดับ[l.status] ?? 1;
    // วันจบของเรื่อง: ปิดแล้ว = หลังใบล่าสุด/วันตอบรับ (ไม่เกินวันนี้) · ยังเปิด = ตอนนี้
    const หลักฐาน = [...l.quotes.map(x => Date.parse(x.won ?? x.created)), ...l.requests.map(x => Date.parse(x.submitted))].filter(Number.isFinite);
    const จบ = ร >= 6 ? Math.min(ตอนนี้ - 3600_000, Math.max(l.created + 3 * 86_400_000, ...หลักฐาน) + 86_400_000) : ตอนนี้;
    const ช่วงเวลา = Math.max(3600_000, จบ - l.created);

    // ── กิจกรรม ──
    const เดิม = (l.activities ?? []).map(a => ({ a, t: อ่านป้าย(a) }));
    const ติดต่อเดิม = เดิม.filter(x => ชนิดติดต่อ.has(x.a.type)).length;
    const เป้า = เป้ากิจกรรม(ร, l.id);
    const เรื่อง = เรื่องของงาน(l, f);
    const ต้องเติม = Math.max(0, Math.min(เป้า, เรื่อง.length) - ติดต่อเดิม);
    if (ต้องเติม > 0) {
      const ใหม่ = เรื่อง.slice(0, ต้องเติม).map(([type, text], i) => {
        const t = i === 0 ? Math.min(l.created + 30 * 60_000, ตอนนี้ - 60_000)
          : Math.min(ในเวลางาน(l.created + ช่วงเวลา * (i / ต้องเติม), `${l.id}:${i}`), จบ - 60_000);
        return { a: { type, icon: type === "call" ? "phone" : type, text, src: "sample-full" }, t: Math.max(t, l.created) };
      });
      const รวม = [...เดิม, ...ใหม่].sort((x, y) => (x.t ?? 0) - (y.t ?? 0))
        .map((x, i) => ({ ...x.a, id: i + 1, ...(x.a.date ? {} : { date: ป้ายเวลา(x.t) }) }));
      const ล่าสุด = Math.max(...รวม.map(a => อ่านป้าย(a) ?? 0));
      คำสั่ง.push(`update public.leads set activities = ${q(JSON.stringify(รวม))}::jsonb, last_contact_at = '${วันISO(ล่าสุด)}' where dealer_code = ${q(l.dealer)} and num_id = ${l.num};`);
      กิจกรรมเติม += ใหม่.length;
    }

    // ── นัดหมาย ──
    const เป้าน = Math.max(0, เป้านัด(ร, l.id) - Number(l.appts));
    const ชนิดลำดับ = ["visit", "design_meet", "presentation", "follow_up", ...(l.status === "PAID" ? ["contract_sign"] : ["close"])];
    for (let i = 0; i < เป้าน; i++) {
      const อนาคต = ร < 6 && i === เป้าน - 1;   // งานที่ยังเปิด: นัดสุดท้ายอยู่ข้างหน้า
      const t = อนาคต ? ตอนนี้ + ช่วง(1, 10, `${l.id}:na${i}`) * 86_400_000 : Math.min(ในเวลางาน(l.created + ช่วงเวลา * ((i + 0.6) / (เป้าน + 0.4)), `${l.id}:n${i}`), จบ - 3600_000);
      const ชนิด = ชนิดลำดับ[Math.min(ชนิดลำดับ.length - 1, Math.floor(i * ชนิดลำดับ.length / Math.max(1, เป้าน)) + (ร >= 5 ? 1 : 0))];
      const ผู้เข้า = `ผู้เข้าร่วม: ${l.contact || "ลูกค้า"} (ลูกค้า) · ${l.assigned}${ช่วง(0, 2, l.id + i) === 0 ? " · ช่างสำรวจของสาขา" : ""}`;
      const ผล = อนาคต ? `วาระ: ${เลือก([`สรุปขนาดอาคาร ${f.กว้าง}×${f.ยาว} ม.`, "นำเสนอแบบและสเปกหลังคา", "ทบทวนราคาและเงื่อนไขชำระ", "ดูหน้างานกับผู้ตัดสินใจ"], l.id + i)}`
        : `ผล: ${เลือก([`ลูกค้าตกลงขนาด ${f.A.toLocaleString()} ตร.ม. ขอเพิ่มกันสาดด้านหน้า`, `วัดหน้างานแล้ว ระดับดินต่างกัน ${ช่วง(20, 60, l.id + i)} ซม. ต้องถมเพิ่ม`, "ลูกค้าพอใจแบบ ขอปรับประตูม้วนเป็นแบบไฟฟ้า", `ผู้ตัดสินใจขอเทียบราคากับอีก ${f.คู่แข่ง} ราย`, "ลูกค้าขอส่งแบบให้ฝ่ายบัญชีพิจารณางบ"], `${l.id}:ผล${i}`)}`;
      นัด.push(`(${เลขนัด++}, ${q(l.dealer)}, ${l.num}, ${q(l.company)}, ${q(l.contact ?? "")}, ${q(l.project || "นัดหมายลูกค้า")}, ${q(l.province ?? "")}, ${q(l.area ?? "")}, '${วันISO(t)}', '${String(ไทย(t).getUTCHours()).padStart(2, "0")}:${String(ไทย(t).getUTCMinutes()).padStart(2, "0")}', '${ชนิด}', '${อนาคต ? "upcoming" : "done"}', ${q(`${ผู้เข้า} — ${ผล}`)}, ${q(l.address || `หน้างาน จ.${l.province}`)}, ${q(l.assigned)})`);
    }

    // ── ไฟล์แนบตามขั้น ──
    const มีหมวด = new Set(l.files);
    const ต้องมี = [["รูปภาพ", "รูปหน้างาน", 1], ["แบบแปลน", "แปลนร่าง", 2], ["อื่นๆ", "เอกสารลูกค้า", 3], ["สัญญา", "สัญญาซื้อขาย", 6]]
      .filter(([หมวด, , ขั้น]) => ร >= ขั้น && (หมวด !== "สัญญา" || l.status === "PAID") && !มีหมวด.has(หมวด));
    for (const [หมวด, ชื่อไฟล์, ขั้น] of ต้องมี) {
      const bytes = หมวด === "รูปภาพ" ? รูปหน้างาน(l.id) : หมวด === "แบบแปลน" ? รูปแปลน(f.A, f.ประตู) : รูปเอกสาร(`${l.id}:${หมวด}`, หมวด === "สัญญา" ? 16 : 10);
      const path = `${l.dealer}${ป้ายพาธ}${l.num}-${ขั้น}.png`;
      const วันแนบ = Math.min(l.created + ช่วงเวลา * Math.min(0.9, (ขั้น - 0.5) / 6), ตอนนี้);
      ctx.ต้อง(await ctx.svc.storage.from(ถัง).upload(path, bytes, { upsert: true, contentType: "image/png" }), `อัปโหลด${ชื่อไฟล์} ${l.num}`);
      ctx.ต้อง(await ctx.svc.from("files").insert({ name: `${ชื่อไฟล์}-${l.num}.png`, size: `${Math.max(1, Math.round(bytes.length / 1024))} KB`, ext: "png",
        category: หมวด, project: l.company ?? "", uploaded_by: l.assigned, uploaded_at: วันISO(วันแนบ), source: "lead", record_id: Number(l.num),
        dealer_code: l.dealer, storage_path: path }), `แถว${ชื่อไฟล์} ${l.num}`);
      ไฟล์เติม++;
    }
  }

  // ── ไฟล์แนบคำขอราคา (ดีลเลอร์แนบถึง HQ): แปลนที่ดิน + รูปหน้างาน ต่อคำขอ · ถัง quote-files · ตัวดักถังรับเฉพาะคำขอที่ยังเปิด
  //    → ฐาน dev ปิดตัวดักตรวจถังชั่วคราวเฉพาะช่วงลงไฟล์ตัวอย่าง (คำขอส่วนใหญ่ตีราคา/ปิดไปแล้ว) แล้วเปิดคืนทันที
  const ดิบคำขอ = ctx.sql(`select coalesce(json_agg(json_build_object('id', r.id, 'no', r.request_no, 'dealer', r.dealer_code, 'area', r.area, 'at', r.submitted_at,
      'by', coalesce(nullif(l.assigned, ''), 'พนักงานขาย'))), '[]')
    from public.quote_requests r join public.leads l on l.dealer_code = r.dealer_code and l.num_id = r.lead_num_id
   where r.dealer_code <> 'HQ' and not exists (select 1 from public.quote_files f where f.request_id = r.id and f.side = 'dealer');`);
  const คำขอ = JSON.parse(ดิบคำขอ.slice(ดิบคำขอ.indexOf("["), ดิบคำขอ.lastIndexOf("]") + 1));
  let ไฟล์คำขอ = 0;
  if (คำขอ.length) {
    ctx.sql("alter table storage.objects disable trigger trg_quote_files_guard;", "supabase_admin");
    try {
      for (const r of คำขอ) {
        const ชุด = [["แปลนที่ดิน", รูปแปลน(Number(r.area) || 600, 1 + (r.id % 3))], ...(r.id % 2 ? [["รูปหน้างาน", รูปหน้างาน(`rq${r.id}`)]] : [])];
        for (const [i, [ชื่อ, bytes]] of ชุด.entries()) {
          const path = `${r.dealer}/${r.id}/d/sample${r.id}x${i}.png`;
          ctx.sql(`insert into public.quote_files (request_id, dealer_code, side, object_name, display_name, declared_size, status, uploaded_by_name, created_at)
            values (${r.id}, '${r.dealer}', 'dealer', '${path}', '${ชื่อ}-${r.no}.png', ${bytes.length}, 'ready', '${String(r.by).replace(/'/g, "''")}', '${r.at}') on conflict (object_name) do nothing;`);
          ctx.ต้อง(await ctx.svc.storage.from("quote-files").upload(path, bytes, { upsert: true, contentType: "image/png" }), `อัปโหลดไฟล์คำขอ ${r.no}`);
          ไฟล์คำขอ++;
        }
      }
    } finally { ctx.sql("alter table storage.objects enable trigger trg_quote_files_guard;", "supabase_admin"); }
  }

  // กิจกรรม + นัด ลงทีเดียว (โหมด replica: เติมไทม์ไลน์ที่ฐานปกติให้เขียนผ่าน lead_apply เท่านั้น · ไม่เปลี่ยนขั้น/สถานะ)
  if (คำสั่ง.length || นัด.length) ctx.sql(`begin; set local session_replication_role = replica;
    ${คำสั่ง.join("\n")}
    ${นัด.length ? `insert into public.appointments (id, dealer_code, lead_id, company, contact, project, province, area, date, time, type, status, note, location, assigned) overriding system value values\n${นัด.join(",\n")};` : ""}
    -- หัวข้อนัด (ช่อง "หัวข้อ" ของฟอร์มนัด = appointments.project) = เรื่องของนัดจริงตามประเภท (19 พ.ย. 69 · เดิมทุกนัดหัวข้อ = ชื่องาน ซ้ำกัน)
    --   นัดของทุกส่วนที่หัวข้อยังเป็นชื่องานของลีด/ว่าง → หัวข้อตามประเภท + รายละเอียดของงาน (พื้นที่/ขนาด) · หลายนัดชนิดเดียวกันได้คำต่างกันตามเลขนัด
    update public.appointments a set project = case a.type
        when 'visit'         then (array['นัดพบลูกค้า · คุยความต้องการ', 'นัดพบเจ้าของกิจการ · ดูที่ดิน', 'นัดพบลูกค้า · สรุปงบประมาณ'])[1 + a.id % 3]
        when 'site_visit'    then (array['นัดดูหน้างาน · วัดพื้นที่', 'นัดดูหน้างาน · สำรวจระดับดิน', 'นัดดูหน้างาน · ดูทางเข้าออกรถ'])[1 + a.id % 3]
        when 'design_meet'   then (array['นำเสนอแบบและสเปกหลังคา', 'นำเสนอแบบ ' || coalesce(nullif(l.area, ''), '') || ' ตร.ม.', 'นำเสนอวัสดุผนังและประตู'])[1 + a.id % 3]
        when 'presentation'  then (array['นำเสนอราคา · อธิบายรายการวัสดุ', 'นำเสนอราคาฉบับปรับปรุง', 'นำเสนอราคาต่อผู้ตัดสินใจ'])[1 + a.id % 3]
        when 'follow_up'     then (array['ติดตามผลใบเสนอราคา', 'ติดตามการตัดสินใจของลูกค้า', 'ติดตามเงื่อนไขการชำระ'])[1 + a.id % 3]
        when 'call'          then (array['โทรติดตามผล', 'โทรนัดวันดูหน้างาน', 'โทรยืนยันกำหนดการ'])[1 + a.id % 3]
        when 'meeting'       then (array['ประชุมสรุปขอบเขตงาน', 'ประชุมกับฝ่ายจัดซื้อ', 'ประชุมทบทวนแบบ'])[1 + a.id % 3]
        when 'contract_sign' then 'เซ็นสัญญาซื้อขาย · รับมัดจำ'
        when 'close'         then 'สรุปปิดการขาย'
        else 'นัดหมายลูกค้า' end
      from public.leads l
     where l.dealer_code = a.dealer_code and l.num_id = a.lead_id and a.dealer_code <> 'HQ'
       and (coalesce(a.project, '') = '' or a.project = l.project or a.project = 'นัดหมายลูกค้า' or a.project like 'ZZ%' or a.project = l.company);
    -- งาน "นัดหมาย" ของลีดที่มีนัดแล้ว = ทำแล้ว (แอปติ๊กให้เองตอนบันทึกนัด · ที่นี่ลงนัดตรงจึงติ๊กตาม) · วันที่ = นัดแรก · ผู้ทำ = ผู้รับผิดชอบ
    update public.leads l set tasks = (select jsonb_agg(case when t->>'key' = 'appointment' and coalesce((t->>'done')::boolean, false) = false
          then t || jsonb_build_object('done', true, 'doneBy', coalesce(nullif(l.assigned, ''), 'พนักงานขาย'),
               'doneAt', (select extract(day from d)::int || ' ' || (array['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'])[extract(month from d)::int] || ' ' || (extract(year from d)::int + 543)
                          from (select min(a.date)::date d from public.appointments a where a.dealer_code = l.dealer_code and a.lead_id = l.num_id and a.date ~ '^[0-9]{4}-') m))
          else t end order by o) from jsonb_array_elements(l.tasks) with ordinality x(t, o))
     where l.dealer_code <> 'HQ' and jsonb_typeof(l.tasks) = 'array'
       and exists (select 1 from jsonb_array_elements(l.tasks) t where t->>'key' = 'appointment' and coalesce((t->>'done')::boolean, false) = false)
       and exists (select 1 from public.appointments a where a.dealer_code = l.dealer_code and a.lead_id = l.num_id and a.date ~ '^[0-9]{4}-');
    commit;`);
  const นับ = (s) => Number(ctx.sql(s).trim());
  const ลีด = "from public.leads l where l.dealer_code <> 'HQ'";
  console.log(`✓ งานขายเต็ม: เติมกิจกรรม ${กิจกรรมเติม} · นัด ${นัด.length} · ไฟล์ ${ไฟล์เติม} · ไฟล์แนบคำขอ ${ไฟล์คำขอ}`
    + ` · ลีดไม่มีกิจกรรม ${นับ(`select count(*) ${ลีด} and coalesce(jsonb_array_length(l.activities), 0) = 0`)}`
    + ` · ไม่มีนัด ${นับ(`select count(*) ${ลีด} and not exists (select 1 from public.appointments a where a.dealer_code = l.dealer_code and a.lead_id = l.num_id)`)}`
    + ` · ไม่มีไฟล์ ${นับ(`select count(*) ${ลีด} and not exists (select 1 from public.files f where f.dealer_code = l.dealer_code and f.source = 'lead' and f.record_id = l.num_id)`)}`);
}

export async function ลบ(ctx) {
  // กิจกรรมที่ส่วนนี้เติม (src = sample-full) — ลีดของส่วนก่อนอาจยังอยู่ (ลบเฉพาะส่วนนี้)
  //   + ของที่ค้างในลีดข้อมูลตั้งต้น (ลีดตั้งต้นไม่ถูกลบตอน --reset): ข้อความตัวสร้างรุ่นก่อนที่ยังไม่มีป้าย src (19 พ.ย. 69 รอบแรก)
  //     และประโยคตายตัวชุดเดิมของส่วนช่องครบ — ไม่งั้นลงซ้ำทุกรอบ (ติดต่อครั้งแรกซ้อน 2 รายการ)
  const ตายตัวเดิม = ["โทรแนะนำบริษัทและสอบถามขนาดพื้นที่ที่ต้องการ", "ส่งผลงานโกดังที่สร้างแล้วให้ลูกค้าทางไลน์", "ลูกค้าโทรกลับมาถามระยะเวลาก่อสร้าง",
    "นัดดูหน้างานกับลูกค้า วัดพื้นที่จริง", "โทรติดตามความคืบหน้าการตัดสินใจ", "ส่งรายละเอียดสเปกหลังคาและผนังทางอีเมล"].map(t => `'${t}'`).join(", ");
  ctx.sql(`begin; set local session_replication_role = replica;
    update public.leads l set activities = (select coalesce(jsonb_agg(x order by o), '[]'::jsonb) from jsonb_array_elements(l.activities) with ordinality t(x, o)
       where coalesce(x->>'src', '') <> 'sample-full'
         and not (x->>'text' in (${ตายตัวเดิม}))
         and not (x->>'src' is null and x->>'text' ~ '^(ติดต่อครั้งแรก|ติดตามลูกค้า|เข้าพบลูกค้า|ส่งข้อมูล|ส่งใบเสนอราคา|ติดตามผลใบเสนอราคา[^(]*|ปิดการขาย|หลังปิดการขาย|ติดตามผลครั้งสุดท้าย|แจ้งลูกค้า) [(]'))
     where l.activities::text like '%sample-full%' or l.num_id < 996000000; commit;`);
  ctx.sql(`delete from public.appointments where id between ${ฐานเลขนัด} and ${ฐานเลขนัด + 999_999};`);
  const { data } = await ctx.svc.from("files").select("id, storage_path").like("storage_path", `%${ป้ายพาธ}%`);
  const พาธ = (data ?? []).map(f => f.storage_path).filter(Boolean);
  for (let i = 0; i < พาธ.length; i += 100) ctx.ต้อง(await ctx.svc.storage.from(ถัง).remove(พาธ.slice(i, i + 100)), "ลบไฟล์งานขายเต็มในถัง");
  if (data?.length) ctx.ต้อง(await ctx.svc.from("files").delete().like("storage_path", `%${ป้ายพาธ}%`), "ลบแถวไฟล์งานขายเต็ม");
  const ดิบ = ctx.sql(`select coalesce(json_agg(object_name), '[]') from public.quote_files where object_name like '%/d/sample%';`);
  const คำขอ = JSON.parse(ดิบ.slice(ดิบ.indexOf("["), ดิบ.lastIndexOf("]") + 1));
  for (let i = 0; i < คำขอ.length; i += 100) ctx.ต้อง(await ctx.svc.storage.from("quote-files").remove(คำขอ.slice(i, i + 100)), "ลบไฟล์คำขอตัวอย่างในถัง");
  ctx.sql(`delete from public.quote_files where object_name like '%/d/sample%';`);
}
