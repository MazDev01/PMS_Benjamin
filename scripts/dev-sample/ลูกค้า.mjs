// ── ส่วน "ลูกค้า": ลูกค้าจากการปิดการขาย · ลูกค้าซื้อซ้ำ 2 งาน · นำเข้าลูกค้าเดิม · ไฟล์แนบ (บอสสั่ง 28 ต.ค. 69) ─────────────────
// เลขลีด 996_600_xxx (RYG) · ลูกค้าจากการขาย "บริษัท ลูกค้าตัวอย่าง <สาขา>-<ลำดับ> จำกัด" · ลูกค้าเดิม "บริษัท ลูกค้าเดิมตัวอย่าง …"
//   ปิดการขาย = close_won_quotation (ฐานสร้าง/ผูกลูกค้า) · ซื้อซ้ำ = "สร้างดีลใหม่" จากลูกค้าเดิม (ลีดผูก customer_id) แล้วตอบรับอีกงาน
//   นำเข้าลูกค้าเดิม = ทางเดียวกับปุ่ม "นำเข้าลูกค้าเดิม" (เลขจาก next_entity_id แล้วเพิ่มแถว imported = true · วันที่เป็นลูกค้าจากไฟล์)
//   ไฟล์แนบ = ทางเดียวกับแท็บไฟล์ของลูกค้า: อัปโหลดเข้าถัง dealer-files (พาธขึ้นต้นรหัสสาขา) แล้วเพิ่มแถว files (source customer)
//   ไฟล์ตัวอย่างสร้างในสคริปต์ (PDF/PNG ขนาดไม่กี่ร้อยไบต์ · ไม่มีข้อมูลจริง)
import { งานขายของสาขา, เข้าHQ, บัญชีสาขา, ตัวย้อนเวลา, sqlลบงานขาย, มีลีดในช่วง } from "./งานขาย.mjs";

export const ชื่อ = "ลูกค้า";
const ช่วง = [996_600_000, 996_699_999];
const ชื่อลูกค้า = ["บริษัท ลูกค้าตัวอย่าง %", "บริษัท ลูกค้าเดิมตัวอย่าง %"];
const ถัง = "dealer-files";

export async function มีแล้ว(ctx) {
  if (await มีลีดในช่วง(ctx, ช่วง)) return true;
  const { count } = await ctx.svc.from("customers").select("id", { count: "exact", head: true }).like("company", ชื่อลูกค้า[1]);
  return (count ?? 0) > 0;
}

export async function ลบ(ctx) {
  // ไฟล์ในถังของลูกค้าชุดนี้ก่อน (แถว files ลบด้วย SQL ด้านล่าง)
  const { data: ลูกค้า } = await ctx.svc.from("customers").select("id").or(ชื่อลูกค้า.map(p => `company.like.${p.replace(/ /g, "\\ ")}`).join(","));
  const ids = (ลูกค้า ?? []).map(c => c.id);
  if (ids.length) {
    const { data: ไฟล์ } = await ctx.svc.from("files").select("storage_path").in("customer_id", ids).not("storage_path", "is", null);
    const พาธ = (ไฟล์ ?? []).map(f => f.storage_path).filter(Boolean);
    if (พาธ.length) ctx.ต้อง(await ctx.svc.storage.from(ถัง).remove(พาธ), "ลบไฟล์ในถัง");
  }
  ctx.sql(sqlลบงานขาย([ช่วง], ชื่อลูกค้า));
}

// ── ไฟล์ตัวอย่าง (สร้างเอง) ──
const pdf = (ข้อความ) => {
  const เนื้อ = `BT /F1 14 Tf 40 760 Td (${ข้อความ}) Tj ET`;
  const ชิ้น = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${เนื้อ.length} >>\nstream\n${เนื้อ}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let s = "%PDF-1.4\n"; const ที่ = [];
  ชิ้น.forEach((c, i) => { ที่.push(s.length); s += `${i + 1} 0 obj\n${c}\nendobj\n`; });
  const xref = s.length;
  s += `xref\n0 ${ชิ้น.length + 1}\n0000000000 65535 f \n${ที่.map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  s += `trailer\n<< /Size ${ชิ้น.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(s, "latin1");
};
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const ขนาดไฟล์ = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024).toFixed(0)} KB`);   // humanFileSize (uploadLimits.ts)
const ชนิดไฟล์ = (name) => (name.endsWith(".png") ? "png" : "pdf");

/** แนบไฟล์ให้ลูกค้า — ขั้นเดียวกับหน้าลูกค้า (storage.upload + files.add · SupabaseAdapter) */
async function แนบไฟล์(ctx, sb, code, ลูกค้า, { name, category, bytes, ผู้อัปโหลด }) {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_") || "file";
  const path = `${code}/${Date.now()}-${safe}`;
  ctx.ต้อง(await sb.storage.from(ถัง).upload(path, bytes, { upsert: false, contentType: name.endsWith(".png") ? "image/png" : "application/pdf" }), `อัปโหลด ${name}`);
  ctx.ต้อง(await sb.from("files").insert({ name, size: ขนาดไฟล์(bytes.length), ext: ชนิดไฟล์(name), category, project: ลูกค้า.company,
    uploaded_by: ผู้อัปโหลด || "คุณ", uploaded_at: ctx.วัน(), source: "customer", record_id: ลูกค้า.id, customer_id: ลูกค้า.id,
    dealer_code: code, storage_path: path }), `แถวไฟล์ ${name}`);
}

/** นำเข้าลูกค้าเดิม 1 ราย — ขั้นเดียวกับ commitImport (addCustomer: next_entity_id → insert) */
async function นำเข้า(ctx, sb, code, r) {
  const id = Number(ctx.ต้อง(await sb.rpc("next_entity_id", { p_dealer: code, p_entity: "customers" }), "เลขลูกค้า"));
  const สี = ["#2563EB", "#059669", "#D97706", "#7C3AED", "#DC2626"];
  return ctx.ต้อง(await sb.from("customers").insert({ id, dealer_code: code, name: r.name, company: r.company, email: r.email, phone: r.phone,
    address: r.address, province: r.province, category: "", status: "active", projects: 0, join_date: r.joinDate, owner: r.owner ?? "",
    initials: r.company.replace(/^บริษัท /, "").slice(0, 2), color: สี[id % สี.length], total_value: 0, imported: true }).select("id, company").single(), `นำเข้า ${r.company}`);
}

export async function สร้าง(ctx) {
  const hq = await เข้าHQ(ctx);
  const ย้อน = await ตัวย้อนเวลา(ctx);
  const นับ = { ปิดการขาย: 0, ซื้อซ้ำ: 0, นำเข้า: 0, ไฟล์: 0 };

  // ── RYG: ลูกค้าจากการปิดการขาย + ซื้อซ้ำ + ไฟล์ ──
  const b = บัญชีสาขา(ctx, "RYG");
  const sb = await ctx.เข้า(b.email, b.password);
  const ง = await งานขายของสาขา(ctx, { code: "RYG", province: "ระยอง", sb, hq, ป้ายส่วน: "ลูกค้าตัวอย่าง" });
  const ปิด = async (n, ปิดเมื่อ, { company, customerId, ขนาด = 1.5 } = {}) => {
    const จด = ย้อน.งาน("RYG", n, [ปิดเมื่อ + 9, ปิดเมื่อ + 8, ปิดเมื่อ + 6, ปิดเมื่อ + 4, ปิดเมื่อ], n % 4);
    await จด(0);
    const ลีด = await ง.ลีด(n, { ย้อนวัน: ปิดเมื่อ + 9, เรื่อง: customerId ? "งานที่ 2 ของลูกค้าเดิม (ซื้อซ้ำ)" : "ลูกค้าปิดการขาย", company, customerId, ขนาด });
    const { qid } = await ง.ถึงส่งใบ(n, ลีด.company, { ขนาด, จด });
    await จด(4);
    const ผล = await ง.ตอบรับ(n, ลีด.company, qid, { customerId });
    return { ...ลีด, customerId: Number(ผล.customer.id) };
  };
  const ก = await ปิด(996_600_000, 60, { ขนาด: 2.5 });                       // ลูกค้า ก: งานแรก 2 เดือนก่อน
  await ปิด(996_600_001, 8, { company: ก.company, customerId: ก.customerId, ขนาด: 1.2 });   // ลูกค้า ก: ซื้อซ้ำงานที่ 2
  const ข = await ปิด(996_600_002, 25, { ขนาด: 3 });                         // ลูกค้า ข
  await ปิด(996_600_003, 40, { ขนาด: 1 });                                   // ลูกค้า ค
  ย้อน.พัก(); ย้อน.สั่ง();
  นับ.ปิดการขาย = 3; นับ.ซื้อซ้ำ = 1;
  { const { count } = await ctx.svc.from("quotations").select("id", { count: "exact", head: true })
      .eq("dealer_code", "RYG").eq("customer_id", ก.customerId).eq("status", "won");
    if (count !== 2) console.warn(`⚠️ ลูกค้า ${ก.company} มีใบตอบรับ ${count} ใบ (คาด 2 งาน)`); }

  for (const f of [
    { ลูกค้า: ก, name: "แบบแปลนโกดัง-ตัวอย่าง.pdf", category: "แบบแปลน", bytes: pdf("Sample plan (dev sample data)") },
    { ลูกค้า: ก, name: "รูปหน้างาน-ตัวอย่าง.png", category: "รูปภาพ", bytes: png },
    { ลูกค้า: ข, name: "สัญญาซื้อขาย-ตัวอย่าง.pdf", category: "สัญญา", bytes: pdf("Sample contract (dev sample data)") },
  ]) { await แนบไฟล์(ctx, sb, "RYG", { id: f.ลูกค้า.customerId, company: f.ลูกค้า.company }, { ...f, ผู้อัปโหลด: ง.ผู้รับผิดชอบ }); นับ.ไฟล์++; }

  // ── นำเข้าลูกค้าเดิม (RYG 3 · CNX 2) ──
  for (const [code, province, จำนวน] of [["RYG", "ระยอง", 3], ["CNX", "เชียงใหม่", 2]]) {
    const bb = บัญชีสาขา(ctx, code);
    const s2 = code === "RYG" ? sb : await ctx.เข้า(bb.email, bb.password);
    for (let i = 1; i <= จำนวน; i++) {
      const company = `บริษัท ลูกค้าเดิมตัวอย่าง ${code}-${String(i).padStart(2, "0")} จำกัด`;
      const c = await นำเข้า(ctx, s2, code, { company, name: `ผู้ติดต่อลูกค้าเดิม ${code}-${i}`, email: `legacy-${code.toLowerCase()}-${i}@example.test`,
        phone: ctx.เบอร์(6000 + i), address: `ที่อยู่ลูกค้าเดิมตัวอย่าง ${i} ${province}`, province, joinDate: `${2023 + i}-0${i + 2}-15` });
      นับ.นำเข้า++;
      if (i === 1) { await แนบไฟล์(ctx, s2, code, c, { name: "ใบส่งมอบงานเดิม-ตัวอย่าง.pdf", category: "อื่นๆ",
        bytes: pdf("Sample handover (dev sample data)"), ผู้อัปโหลด: "" }); นับ.ไฟล์++; }
    }
  }
  console.log(`✓ ลูกค้าจากการปิดการขาย ${นับ.ปิดการขาย} ราย (ซื้อซ้ำ 2 งาน ${นับ.ซื้อซ้ำ} ราย) · นำเข้าลูกค้าเดิม ${นับ.นำเข้า} ราย · ไฟล์แนบ ${นับ.ไฟล์} ไฟล์`);
}
