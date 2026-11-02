// ── เลือกไฟล์แนบคำขอราคา (ถัง quote-files · ใบ 0273) ที่ขั้น files ของ run.mjs จะลบ — เฉพาะของสาขาทดสอบเท่านั้น ─────────
// ถังนี้เป็นของจริงทั้งเครือ (ดีลเลอร์จริงแนบแบบบ้านของลูกค้าจริง) — ลบผิดไฟล์เดียว = ข้อมูลลูกค้าหาย กู้ไม่ได้
//   รับเฉพาะรหัสสาขาทดสอบ (ขึ้นต้น ZZ/ZT) · ทุกพาธต้องขึ้นต้นด้วย "<รหัส>/" ของสาขานั้น (ฐานตั้งชื่อในถังเป็น สาขา/คำขอ/ฝั่ง/ไฟล์)
//   แถวไหนพาธไม่ตรงสาขาของแถว หรือไม่ตรงรหัสที่สั่ง = หยุดทั้งชุด ไม่ลบอะไรเลย (ไม่ข้ามเงียบ ๆ)
// ข้อทดสอบ: tests/unit/prodLiveQuoteFiles.test.ts

/** @param {{ object_name: string, dealer_code: string }[]} rows แถว quote_files ที่อ่านด้วยเงื่อนไข dealer_code = รหัส
 *  @param {string[]} codes รหัสสาขาทดสอบที่สั่งล้าง
 *  @returns {string[]} ชื่อไฟล์ในถังที่ลบได้ */
export function เลือกไฟล์แนบทดสอบ(rows, codes) {
  if (!codes.length) throw new Error("ไม่ได้ระบุรหัสสาขาทดสอบ");
  for (const c of codes) {
    if (!/^(ZZ|ZT)[A-Z0-9]{0,4}$/.test(c)) throw new Error(`"${c}" ไม่ใช่รหัสสาขาทดสอบ (ต้องขึ้นต้น ZZ หรือ ZT) — ไม่ลบไฟล์`);
  }
  const ชุด = new Set(codes);
  const ผิด = rows.filter(r => !ชุด.has(r.dealer_code) || !String(r.object_name).startsWith(`${r.dealer_code}/`) || String(r.object_name).includes(".."));
  if (ผิด.length) throw new Error(`พบไฟล์ที่ไม่ใช่ของสาขาทดสอบ ${ผิด.length} ไฟล์ (เช่น ${ผิด[0].object_name}) — หยุด ไม่ลบอะไรเลย`);
  return rows.map(r => String(r.object_name));
}
