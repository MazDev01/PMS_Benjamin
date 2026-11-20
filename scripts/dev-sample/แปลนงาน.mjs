// ── ส่วน "แปลนงาน": รูปแปลนอาคารปลอม (วาดเองในสคริปต์) ให้ทุกงานที่ลูกค้าตอบรับ (บอสสั่ง 18 พ.ย. 69 · ประวัติการซื้อ) ─────────────
// รูป = ผังพื้นโกดังแบบง่าย: กรอบอาคารตามสัดส่วนพื้นที่ (กว้าง:ยาว ≈ 1:2) · เสาทุกช่วง 6 ม. · ประตูม้วนตามจำนวนในรายการ · เส้นบอกขนาด
//   ไม่ใช้รูปจากที่อื่น (สร้างจากพื้นที่ของงานเท่านั้น · PNG เข้ารหัสเองด้วย zlib ของ node)
// แนบที่ลูกค้าเป้าหมายของงาน (ไฟล์ของสาขา source "lead" · record_id = เลขลีด) — ตัวกลางประวัติการซื้อแสดงในหน้าต่างรายละเอียดงาน
// ป้าย (ลบ/มีแล้ว): storage_path มี "/plan-sample-" · ถัง dealer-files/<สาขา>/plan-sample-<เลขใบ>.png
import { deflateSync } from "node:zlib";
const พื้นที่จากข้อความ = (v) => Number(String(v ?? "").replace(/,/g, "")) || 0;   // พื้นที่ลีด "1,050" → 1050

export const ชื่อ = "แปลนงาน";
const ถัง = "dealer-files";
const ป้ายพาธ = "/plan-sample-";

// ── PNG ──
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const ก้อน = (ชนิด, ข้อมูล) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(ข้อมูล.length);
  const td = Buffer.concat([Buffer.from(ชนิด, "ascii"), ข้อมูล]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
export function png(w, h, px) {   // px = Uint8Array RGB
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; Buffer.from(px.buffer, y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ก้อน("IHDR", ihdr), ก้อน("IDAT", deflateSync(raw)), ก้อน("IEND", Buffer.alloc(0))]);
}

/** ผังพื้นโกดังพื้นที่ A ตร.ม. ประตู d บาน → PNG 640×420 */
export function รูปแปลน(A, ประตู = 1) {
  const W = 640, H = 420, px = new Uint8Array(W * H * 3).fill(255);
  const จุด = (x, y, [r, g, b]) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 3; px[i] = r; px[i + 1] = g; px[i + 2] = b; };
  const เส้น = (x0, y0, x1, y1, สี, หนา = 1) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) { const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n);
      for (let t = 0; t < หนา; t++) { จุด(x + (y0 === y1 ? 0 : t), y + (y0 === y1 ? t : 0), สี); } }
  };
  const กล่อง = (x0, y0, x1, y1, สี) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) จุด(x, y, สี); };
  // ตาราง (กระดาษแบบ)
  for (let x = 0; x < W; x += 20) เส้น(x, 0, x, H - 1, [236, 241, 247]);
  for (let y = 0; y < H; y += 20) เส้น(0, y, W - 1, y, [236, 241, 247]);
  // ขนาดจริง: กว้าง = √(A/2) · ยาว = 2 × กว้าง (ม.) → ย่อให้พอดีกรอบ
  const กว้างม = Math.sqrt(Math.max(A, 100) / 2), ยาวม = 2 * กว้างม;
  const สเกล = Math.min((W - 140) / ยาวม, (H - 140) / กว้างม);
  const ยาว = Math.round(ยาวม * สเกล), กว้าง = Math.round(กว้างม * สเกล);
  const x0 = Math.round((W - ยาว) / 2), y0 = Math.round((H - กว้าง) / 2), x1 = x0 + ยาว, y1 = y0 + กว้าง;
  const น้ำเงิน = [0, 51, 102], เทา = [148, 163, 184], ส้ม = [217, 119, 6];
  กล่อง(x0, y0, x1, y1, [244, 247, 251]);
  เส้น(x0, y0, x1, y0, น้ำเงิน, 3); เส้น(x0, y1, x1, y1, น้ำเงิน, 3); เส้น(x0, y0, x0, y1, น้ำเงิน, 3); เส้น(x1, y0, x1, y1, น้ำเงิน, 3);
  // เสาทุกช่วง 6 ม. ตามแนวยาว (สองฝั่ง) + เส้นแนวเสา
  const ช่วง = Math.max(2, Math.round(ยาวม / 6));
  for (let i = 0; i <= ช่วง; i++) {
    const x = Math.round(x0 + ยาว * i / ช่วง);
    เส้น(x, y0, x, y1, เทา);
    กล่อง(x - 3, y0 - 3, x + 3, y0 + 3, น้ำเงิน); กล่อง(x - 3, y1 - 3, x + 3, y1 + 3, น้ำเงิน);
  }
  // ประตูม้วน (ช่องเปิดฝั่งล่าง สีส้ม)
  for (let d = 0; d < ประตู; d++) {
    const cx = Math.round(x0 + ยาว * (d + 1) / (ประตู + 1)), กว้างประตู = Math.max(12, Math.round(5 * สเกล));
    กล่อง(cx - กว้างประตู / 2, y1 - 2, cx + กว้างประตู / 2, y1 + 6, ส้ม);
  }
  // เส้นบอกขนาด (บน/ซ้าย)
  เส้น(x0, y0 - 24, x1, y0 - 24, เทา); เส้น(x0, y0 - 30, x0, y0 - 18, เทา); เส้น(x1, y0 - 30, x1, y0 - 18, เทา);
  เส้น(x0 - 24, y0, x0 - 24, y1, เทา); เส้น(x0 - 30, y0, x0 - 18, y0, เทา); เส้น(x0 - 30, y1, x0 - 18, y1, เทา);
  // ลูกศรทิศเหนือ (มุมขวาบน)
  เส้น(W - 40, 60, W - 40, 24, น้ำเงิน, 2); เส้น(W - 40, 24, W - 48, 36, น้ำเงิน, 2); เส้น(W - 40, 24, W - 32, 36, น้ำเงิน, 2);
  return png(W, H, px);
}

export async function มีแล้ว(ctx) {
  const { count } = await ctx.svc.from("files").select("id", { count: "exact", head: true }).like("storage_path", `%${ป้ายพาธ}%`);
  return (count ?? 0) > 0;
}

export async function ลบ(ctx) {
  const { data } = await ctx.svc.from("files").select("id, storage_path").like("storage_path", `%${ป้ายพาธ}%`);
  const พาธ = (data ?? []).map(f => f.storage_path).filter(Boolean);
  for (let i = 0; i < พาธ.length; i += 100) ctx.ต้อง(await ctx.svc.storage.from(ถัง).remove(พาธ.slice(i, i + 100)), "ลบรูปแปลนในถัง");
  if (data?.length) ctx.ต้อง(await ctx.svc.from("files").delete().like("storage_path", `%${ป้ายพาธ}%`), "ลบแถวรูปแปลน");
}

export async function สร้าง(ctx) {
  // งานที่ลูกค้าตอบรับ (ไม่นับ HQ) ที่ผูกลีด + พื้นที่ของลีด + จำนวนประตูในรายการ + วันตอบรับ
  //   ใบที่ไม่ผูกลีด (ใบตั้งต้นที่ตอบรับ 32 ใบ) = แนบที่ลูกค้าของใบ (source "customer") ชื่อไฟล์มีเลขใบ · พื้นที่ = จำนวน "แป/โครงหลังคา" ในรายการ
  const ดิบ = ctx.sql(`select coalesce(json_agg(json_build_object('dealer', q.dealer_code, 'id', q.id, 'deal', q.deal_id, 'customer', q.customer_id,
      'area', coalesce(l.area, (select max((x ->> 'qty')::numeric)::text from jsonb_array_elements(coalesce(q.line_items, '[]'::jsonb)) x where x ->> 'name' like 'แป/โครงหลังคา%')),
      'company', q.customer, 'won', to_char(coalesce(q.won_at, q.created_at) at time zone 'Asia/Bangkok', 'YYYY-MM-DD'),
      'doors', (select coalesce(max((x ->> 'qty')::numeric), 1) from jsonb_array_elements(coalesce(q.line_items, '[]'::jsonb)) x where x ->> 'name' like 'ประตูม้วน%'))), '[]')
    from public.quotations q left join public.leads l on l.dealer_code = q.dealer_code and l.num_id = q.deal_id
    where q.status = 'won' and q.dealer_code <> 'HQ' and (l.num_id is not null or q.customer_id is not null);`);
  const งาน = JSON.parse(ดิบ.slice(ดิบ.indexOf("["), ดิบ.lastIndexOf("]") + 1));
  let ทำ = 0;
  for (const g of งาน) {
    const A = พื้นที่จากข้อความ(g.area) || 600;
    const bytes = รูปแปลน(A, Math.min(4, Math.max(1, Math.round(Number(g.doors) || 1))));
    const path = `${g.dealer}${ป้ายพาธ}${g.id}.png`;
    ctx.ต้อง(await ctx.svc.storage.from(ถัง).upload(path, bytes, { upsert: true, contentType: "image/png" }), `อัปโหลดแปลน ${g.id}`);
    ctx.ต้อง(await ctx.svc.from("files").insert({ name: `แปลนอาคาร-${g.id}.png`, size: `${Math.max(1, Math.round(bytes.length / 1024))} KB`, ext: "png",
      category: "แบบแปลน", project: g.company ?? "", uploaded_by: "ฝ่ายออกแบบ", uploaded_at: g.won, ...(g.deal != null ? { source: "lead", record_id: Number(g.deal) } : { source: "customer", record_id: Number(g.customer), customer_id: Number(g.customer) }),
      dealer_code: g.dealer, storage_path: path }), `แถวแปลน ${g.id}`);
    ทำ++;
  }
  console.log(`✓ รูปแปลนอาคาร ${ทำ} งาน (ทุกงานที่ลูกค้าตอบรับ · แนบที่ลูกค้าเป้าหมายของงาน · ใบไม่ผูกลีด = แนบที่ลูกค้า)`);
}
