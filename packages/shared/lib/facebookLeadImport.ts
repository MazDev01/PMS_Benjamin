// ── นำเข้าไฟล์ลีดจาก Facebook Lead Ads ตรง ๆ (หน้าผู้สนใจเป็นดีลเลอร์ · บอสสั่ง 20 พ.ย. 69 · ใบ 0292) ─────────────────────────────
//   ไฟล์: .xlsx หลายชีต (1 ชีตต่อเดือน เช่น 10.26 · 11.26) → อ่านทุกชีต
//   หัวตาราง: created_time | ad_name | จังหวัดที่คุณต้องการเป็นตัวแทนจำหน่าย | email | full_name | phone_number (คอลัมน์หลังจากนั้นว่าง = ข้าม)
//   เบอร์ "p:+66xxxxxxxxx" → 0xxxxxxxxx · ไม่ครบ 10 หลัก = ป้าย "เบอร์ไม่ครบ" ยังนำเข้าได้ (ฐานรับ 0 + 5–10 หลัก)
//   จังหวัดลูกค้าพิมพ์เอง (อังกฤษ · ย่อ · มี "ครับ" · อักษรล่องหน · หลายจังหวัด · ไม่ใช่จังหวัด) → จับคู่ 77 · หลายจังหวัดใช้จังหวัดแรก · ไม่ได้ = ว่าง
//   ข้อความจังหวัดเดิม + ad_name + created_time เก็บในหมายเหตุทุกราย · created_time = วันที่ลูกค้าทิ้งเบอร์ (entered_at) · แหล่งที่มา Facebook
//   บังคับแค่ full_name + เบอร์ · ทุกราย "รอติดต่อ" + นัดติดตามวันนี้ (ขึ้นการ์ดถึงกำหนดติดตาม) · เบอร์ซ้ำ (ในไฟล์/ที่มีอยู่) ไม่สร้างซ้ำ (ฐานตรวจซ้ำอีกชั้น)
//   ⚠️ ไฟล์จริงมีชื่อ/เบอร์คนจริง — ห้ามเก็บในโปรเจกต์ · ข้อทดสอบใช้ไฟล์ปลอม (p:+66000000xxx · @example.test)
import { จับคู่จังหวัด, จังหวัดทั้งหมด } from "./prospectImport";

/** หัวตารางของไฟล์ Facebook (ใช้เป็นแบบฟอร์มตัวอย่างด้วย · บอสสั่ง 20 พ.ย. 69) */
export const หัวไฟล์เฟซบุ๊ก = ["created_time", "ad_name", "จังหวัดที่คุณต้องการเป็นตัวแทนจำหน่าย", "email", "full_name", "phone_number"] as const;
const คีย์ = (s: unknown) => String(s ?? "").replace(/[\u200B-\u200F\u2060\uFEFF]/g, "").trim().toLowerCase();

/** ตำแหน่งคอลัมน์ของไฟล์ Facebook ในแถวหัว · ไม่ใช่ไฟล์ Facebook (ไม่มี full_name หรือ phone_number) = null */
export function คอลัมน์เฟซบุ๊ก(หัว: string[]): { created: number; ad: number; province: number; email: number; name: number; phone: number } | null {
  const หา = (ชื่อ: string) => หัว.findIndex(h => คีย์(h) === ชื่อ);
  const name = หา("full_name"), phone = หา("phone_number");
  if (name < 0 || phone < 0) return null;
  // คอลัมน์จังหวัด: ชื่อเต็มตามไฟล์ หรือหัวที่มีคำว่า "จังหวัด"/province (ฟอร์มแต่ละแคมเปญตั้งคำถามต่างกันเล็กน้อย)
  let province = หา(หัวไฟล์เฟซบุ๊ก[2]);
  if (province < 0) province = หัว.findIndex(h => /จังหวัด|province/i.test(String(h ?? "")));
  return { created: หา("created_time"), ad: หา("ad_name"), province, email: หา("email"), name, phone };
}
/** หาแถวหัวของไฟล์ Facebook ใน 5 แถวแรกของชีต · ไม่เจอ = -1 */
export function หาแถวหัวเฟซบุ๊ก(ตาราง: string[][]): number {
  for (let i = 0; i < Math.min(ตาราง.length, 5); i++) if (คอลัมน์เฟซบุ๊ก(ตาราง[i] ?? [])) return i;
  return -1;
}
/** สมุดงานนี้เป็นไฟล์ Facebook ไหม (มีชีตใดชีตหนึ่งที่มีหัว full_name + phone_number) */
export const เป็นไฟล์เฟซบุ๊ก = (เล่ม: Map<string, string[][]>) => [...เล่ม.values()].some(t => หาแถวหัวเฟซบุ๊ก(t) >= 0);

// ── เบอร์ ─────────────────────────────────────────────────────────────────────────────────────────────
/** "p:+66000000101" → { ตัวเลข: "0000000101", ครบ: true } · ไม่มีตัวเลขเลย = ตัวเลข "" */
export function เบอร์เฟซบุ๊ก(ค่า: unknown): { ตัวเลข: string; ครบ: boolean; แสดง: string } {
  let d = String(ค่า ?? "").replace(/^\s*p:/i, "").replace(/\D/g, "");
  if (d.startsWith("66")) d = "0" + d.slice(2);
  else if (d && !d.startsWith("0")) d = "0" + d;   // Excel ตัดเลข 0 หน้าทิ้ง (เบอร์ 9 หลักไม่มี 0 นำ)
  const ครบ = /^0\d{9}$/.test(d);
  const แสดง = ครบ ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d.length === 9 ? `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}` : d;
  return { ตัวเลข: d, ครบ, แสดง };
}
/** เบอร์ที่ฐานรับเมื่อบอกว่าไม่ครบ (ใบ 0292): 0 + 5–10 หลัก */
const ฐานรับ = (d: string) => /^0\d{5,10}$/.test(d);

// ── จังหวัด ───────────────────────────────────────────────────────────────────────────────────────────
/** ชื่อจังหวัดภาษาอังกฤษ (ตัวเล็ก ตัดทุกอย่างที่ไม่ใช่ a–z) → ชื่อมาตรฐาน · รวมสะกดที่พบบ่อย */
const อังกฤษ: Record<string, string> = {
  bangkok: "กรุงเทพมหานคร", bkk: "กรุงเทพมหานคร", krungthep: "กรุงเทพมหานคร", krabi: "กระบี่", kanchanaburi: "กาญจนบุรี", kalasin: "กาฬสินธุ์",
  kamphaengphet: "กำแพงเพชร", khonkaen: "ขอนแก่น", chanthaburi: "จันทบุรี", chachoengsao: "ฉะเชิงเทรา", chonburi: "ชลบุรี", cholburi: "ชลบุรี",
  chainat: "ชัยนาท", chaiyaphum: "ชัยภูมิ", chumphon: "ชุมพร", chiangrai: "เชียงราย", chiangmai: "เชียงใหม่", trang: "ตรัง", trat: "ตราด", tak: "ตาก",
  nakhonnayok: "นครนายก", nakhonpathom: "นครปฐม", nakhonphanom: "นครพนม", nakhonratchasima: "นครราชสีมา", korat: "นครราชสีมา", khorat: "นครราชสีมา",
  nakhonsithammarat: "นครศรีธรรมราช", nakhonsrithammarat: "นครศรีธรรมราช", nakhonsawan: "นครสวรรค์", nonthaburi: "นนทบุรี", narathiwat: "นราธิวาส",
  nan: "น่าน", buengkan: "บึงกาฬ", buriram: "บุรีรัมย์", pathumthani: "ปทุมธานี", prachuapkhirikhan: "ประจวบคีรีขันธ์", prachinburi: "ปราจีนบุรี",
  pattani: "ปัตตานี", ayutthaya: "พระนครศรีอยุธยา", phranakhonsiayutthaya: "พระนครศรีอยุธยา", phayao: "พะเยา", phangnga: "พังงา", phatthalung: "พัทลุง",
  phichit: "พิจิตร", phitsanulok: "พิษณุโลก", phetchaburi: "เพชรบุรี", phetchabun: "เพชรบูรณ์", phrae: "แพร่", phuket: "ภูเก็ต", mahasarakham: "มหาสารคาม",
  mukdahan: "มุกดาหาร", maehongson: "แม่ฮ่องสอน", yasothon: "ยโสธร", yala: "ยะลา", roiet: "ร้อยเอ็ด", ranong: "ระนอง", rayong: "ระยอง", ratchaburi: "ราชบุรี",
  lopburi: "ลพบุรี", lampang: "ลำปาง", lamphun: "ลำพูน", loei: "เลย", sisaket: "ศรีสะเกษ", srisaket: "ศรีสะเกษ", sakonnakhon: "สกลนคร", songkhla: "สงขลา",
  hatyai: "สงขลา", satun: "สตูล", samutprakan: "สมุทรปราการ", samutprakarn: "สมุทรปราการ", samutsongkhram: "สมุทรสงคราม", samutsakhon: "สมุทรสาคร",
  sakaeo: "สระแก้ว", saraburi: "สระบุรี", singburi: "สิงห์บุรี", sukhothai: "สุโขทัย", suphanburi: "สุพรรณบุรี", suratthani: "สุราษฎร์ธานี", surin: "สุรินทร์",
  nongkhai: "หนองคาย", nongbualamphu: "หนองบัวลำภู", angthong: "อ่างทอง", amnatcharoen: "อำนาจเจริญ", udonthani: "อุดรธานี", udon: "อุดรธานี",
  uttaradit: "อุตรดิตถ์", uthaithani: "อุทัยธานี", ubonratchathani: "อุบลราชธานี", ubon: "อุบลราชธานี", pattaya: "ชลบุรี",
};
/** ข้อความจังหวัดที่ลูกค้าพิมพ์เอง → จังหวัดแรกที่จับคู่ได้ (77) · ไม่ได้ = null */
export function จังหวัดเฟซบุ๊ก(ค่า: unknown): string | null {
  const สะอาด = String(ค่า ?? "")
    .replace(/[\u200B-\u200F\u2060\uFEFF\u00A0]/g, " ")             // อักษรล่องหน/ช่องว่างแปลก
    .replace(/(ครับผม|ครับ|ค่ะ|คะ|คับ|นะคะ|นะครับ|จ้า|จ้ะ)/g, " ")
    .trim();
  if (!สะอาด) return null;
  // อังกฤษ: ลองทั้งข้อความ แล้วทีละส่วน (คั่นด้วย , / และ เว้นวรรค)
  const ส่วน = สะอาด.split(/[,/、|;]+|\s+(?:and|or|และ|หรือ)\s+/i).map(s => s.trim()).filter(Boolean);
  for (const s of ส่วน) {
    const en = s.toLowerCase().replace(/[^a-z]/g, "");
    if (en && อังกฤษ[en]) return อังกฤษ[en];
    const คำอังกฤษ = s.toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z]/g, "")).filter(Boolean);
    for (const w of คำอังกฤษ) if (อังกฤษ[w]) return อังกฤษ[w];
    const th = จับคู่จังหวัด(s).จังหวัด;
    if (th) return th;
  }
  const ทั้งหมด = จับคู่จังหวัด(สะอาด).จังหวัด;
  return ทั้งหมด && จังหวัดทั้งหมด.includes(ทั้งหมด) ? ทั้งหมด : null;
}

// ── วันที่ ───────────────────────────────────────────────────────────────────────────────────────────
/** created_time → YYYY-MM-DD (เวลาไทย) · รับ ISO มีเขตเวลา ("2026-10-05T14:22:10+0700") · "2026-10-05 14:22" · เลขวันของ Excel · อ่านไม่ออก = null */
export function วันเฟซบุ๊ก(ค่า: unknown): string | null {
  const s = String(ค่า ?? "").trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {                                          // เลขวันของ Excel (เปิดแล้วบันทึกใน Excel)
    const n = Number(s);
    if (n < 20000 || n > 80000) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86_400_000).toISOString().slice(0, 10);
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/.exec(s);
  if (!m) return null;
  if (!m[7]) return `${m[1]}-${m[2]}-${m[3]}`;                            // ไม่มีเขตเวลา = วันตามที่เขียน
  const t = Date.parse(s.replace(" ", "T").replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  if (Number.isNaN(t)) return null;
  return new Date(t + 7 * 3_600_000).toISOString().slice(0, 10);          // วันตามเวลาไทย
}

// ── แถว ───────────────────────────────────────────────────────────────────────────────────────────────
export type แถวเฟซบุ๊ก = {
  /** ชีต:แถว (เช่น "10.26:5") — บอกตำแหน่งในไฟล์ · ฐานคืนเหตุผลที่ข้ามตามค่านี้ */
  row: string;
  name: string; email: string;
  /** เบอร์ที่แสดง/ส่งฐาน · ตัวเลขล้วนใช้เทียบซ้ำ */
  phone: string; ตัวเลข: string; เบอร์ไม่ครบ: boolean;
  province: string | null; จังหวัดเดิม: string;
  enteredAt: string | null; adName: string; createdRaw: string;
  /** ข้าม = ไม่ส่งฐาน (ไม่มีชื่อ · ไม่มีเบอร์ · เบอร์ซ้ำ) */
  ข้าม: string | null;
};
const ค่า = (r: string[], i: number) => (i < 0 ? "" : String(r[i] ?? "").replace(/[\u200B-\u200F\u2060\uFEFF]/g, "").trim());
/** อ่านทุกชีตของไฟล์ Facebook → แถวพร้อมแสดงหน้าตัวอย่าง · วันนี้ ISO ใช้ตัดวันอนาคต (ฐานไม่รับ) */
export function เตรียมแถวเฟซบุ๊ก(เล่ม: Map<string, string[][]>, เบอร์ที่มีอยู่: string[], วันนี้: string): แถวเฟซบุ๊ก[] {
  const มีอยู่ = new Set(เบอร์ที่มีอยู่.map(p => เบอร์เฟซบุ๊ก(p).ตัวเลข).filter(Boolean));
  const เห็น = new Map<string, string>();
  const ผล: แถวเฟซบุ๊ก[] = [];
  for (const [ชีต, ตาราง] of เล่ม) {
    const h = หาแถวหัวเฟซบุ๊ก(ตาราง);
    if (h < 0) continue;
    const c = คอลัมน์เฟซบุ๊ก(ตาราง[h])!;
    for (let i = h + 1; i < ตาราง.length; i++) {
      const r = ตาราง[i] ?? [];
      if (!r.some(v => String(v ?? "").trim())) continue;                // แถวว่าง
      const name = ค่า(r, c.name), เบอร์ = เบอร์เฟซบุ๊ก(ค่า(r, c.phone)), จังหวัดเดิม = ค่า(r, c.province);
      const createdRaw = ค่า(r, c.created), วัน = วันเฟซบุ๊ก(createdRaw);
      const row = `${ชีต}:${i + 1}`;
      let ข้าม: string | null = null;
      if (!name) ข้าม = "ไม่มีชื่อ (full_name)";
      else if (!เบอร์.ตัวเลข || !ฐานรับ(เบอร์.ตัวเลข)) ข้าม = "ไม่มีเบอร์โทรที่ใช้ได้";
      else if (เห็น.has(เบอร์.ตัวเลข)) ข้าม = `เบอร์ซ้ำกับแถว ${เห็น.get(เบอร์.ตัวเลข)}`;
      else if (มีอยู่.has(เบอร์.ตัวเลข)) ข้าม = "เบอร์นี้มีผู้สนใจอยู่แล้ว";
      if (!ข้าม) เห็น.set(เบอร์.ตัวเลข, row);
      ผล.push({
        row, name, email: ค่า(r, c.email), phone: เบอร์.แสดง, ตัวเลข: เบอร์.ตัวเลข, เบอร์ไม่ครบ: !!เบอร์.ตัวเลข && !เบอร์.ครบ,
        province: จังหวัดเฟซบุ๊ก(จังหวัดเดิม), จังหวัดเดิม,
        enteredAt: วัน && วัน <= วันนี้ ? วัน : null, adName: ค่า(r, c.ad), createdRaw, ข้าม,
      });
    }
  }
  return ผล;
}
/** สรุปหน้าตัวอย่าง (บอสสั่ง): จำนวนที่จะนำเข้า / ซ้ำ / เบอร์ไม่ครบ / จังหวัดจับคู่ไม่ได้ */
export function สรุปเฟซบุ๊ก(แถว: แถวเฟซบุ๊ก[]) {
  const นำเข้า = แถว.filter(r => !r.ข้าม);
  return {
    นำเข้า: นำเข้า.length,
    ซ้ำ: แถว.filter(r => r.ข้าม?.startsWith("เบอร์ซ้ำ") || r.ข้าม === "เบอร์นี้มีผู้สนใจอยู่แล้ว").length,
    เบอร์ไม่ครบ: นำเข้า.filter(r => r.เบอร์ไม่ครบ).length,
    จังหวัดไม่ได้: นำเข้า.filter(r => !r.province).length,
    ข้ามอื่น: แถว.filter(r => r.ข้าม && !r.ข้าม.startsWith("เบอร์ซ้ำ") && r.ข้าม !== "เบอร์นี้มีผู้สนใจอยู่แล้ว").length,
  };
}
const อีเมลใช้ได้ = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
/** แถวที่ส่งฐาน (hq_prospects_import · ใบ 0292) — หมายเหตุเก็บข้อความเดิมทุกราย */
export function แถวเฟซบุ๊กส่งฐาน(r: แถวเฟซบุ๊ก) {
  const note = [
    r.จังหวัดเดิม && `จังหวัดที่ลูกค้าพิมพ์: ${r.จังหวัดเดิม}`,
    r.adName && `โฆษณา: ${r.adName}`,
    r.createdRaw && `ทิ้งเบอร์เมื่อ: ${r.createdRaw}`,
    r.เบอร์ไม่ครบ && "เบอร์ไม่ครบ",
    r.email && !อีเมลใช้ได้(r.email) && `อีเมลที่กรอก: ${r.email}`,
  ].filter(Boolean).join(" · ");
  return {
    row: r.row, name: r.name, phone: r.ตัวเลข, email: อีเมลใช้ได้(r.email) ? r.email : "",
    province: r.province, channel: "Facebook", status: "new", note,
    follow_up_today: true, ...(r.เบอร์ไม่ครบ ? { phone_incomplete: true } : {}), ...(r.enteredAt ? { entered_at: r.enteredAt } : {}),
  };
}
