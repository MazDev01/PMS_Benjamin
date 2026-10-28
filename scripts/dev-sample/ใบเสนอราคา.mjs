// ── ส่วน "ใบเสนอราคา": ใบลูกค้า V1/V2 ทุกสถานะ + ใบ HQ ร่าง/ส่งแล้ว/สั่งผลิต + HQ ย้อนการตอบรับ (บอสสั่ง 28 ต.ค. 69) ─────────
// เลขลีด 996_300_xxx (RYG) · 996_310_xxx (CNX) · 996_330_xxx (SKN) · ชื่อ "บริษัท ใบตัวอย่าง <สาขา>-<ลำดับ> จำกัด"
// ทุกใบเดินทางเดียวกับหน้าเว็บ (งานขาย.mjs) — ฉบับใหม่ = quotation_new_version · สั่งผลิต = ลูกค้าตอบรับ (FLOW D8: คำขอ + ใบ HQ → สั่งผลิต)
//   หมดอายุ = ใบ HQ เลยวันยืนราคา → งานตามเวลาของฐาน (expire_hq_linked_quotations) เปลี่ยนใบลูกค้าที่ผูกอยู่ (ย้อนเวลางานนี้ 40 วัน)
//   ใกล้หมดอายุ = วันยืนราคาในใบเหลือ 2 วัน (การ์ด "ใกล้หมดอายุ" 0–3 วัน · ใบ 0246)
//   SKN ข้อมูลบริษัทไม่ครบ → ทำใบร่างได้ ส่งไม่ได้ (ฐานกัน ใบ 0247 · ตรวจว่าฐานปฏิเสธจริง)
import { งานขายของสาขา, เข้าHQ, บัญชีสาขา, ตัวย้อนเวลา, sqlลบงานขาย, มีลีดในช่วง } from "./งานขาย.mjs";

export const ชื่อ = "ใบเสนอราคา";
const ช่วง = [996_300_000, 996_399_999];
const สาขา = [
  { code: "RYG", province: "ระยอง", base: 996_300_000 },
  { code: "CNX", province: "เชียงใหม่", base: 996_310_000 },
];
const เหตุการณ์ = [
  "ใบร่าง V1", "ส่งแล้ว V1 รอลูกค้าตอบ", "V1 ส่งแล้ว → ทำฉบับใหม่ V2 (ร่าง)", "V2 ส่งแล้ว (V1 ถูกแทนที่)",
  "V2 ลูกค้าตอบรับ · ใบ HQ สั่งผลิต", "V1 ลูกค้าตอบรับ · ใบ HQ สั่งผลิต", "ลูกค้าปฏิเสธ", "หมดอายุ (ใบ HQ เลยวันยืนราคา)",
  "ใกล้หมดอายุ (เหลือ 2 วัน)", "ใบ HQ ร่าง (HQ กำลังตีราคา)", "ใบ HQ ส่งแล้ว ยังไม่ทำใบลูกค้า", "HQ ย้อนการตอบรับ → ส่งแล้ว",
];

export const มีแล้ว = (ctx) => มีลีดในช่วง(ctx, ช่วง);
export function ลบ(ctx) { ctx.sql(sqlลบงานขาย([ช่วง], ["บริษัท ใบตัวอย่าง %"])); }

export async function สร้าง(ctx) {
  const hq = await เข้าHQ(ctx);
  const นับ = {};
  for (const s of สาขา) {
    const b = บัญชีสาขา(ctx, s.code);
    const ง = await งานขายของสาขา(ctx, { ...s, sb: await ctx.เข้า(b.email, b.password), hq, ป้ายส่วน: "ใบตัวอย่าง" });
    const ลีด = (i) => ง.ลีด(s.base + i, { ย้อนวัน: 12 - i, เรื่อง: เหตุการณ์[i], ขนาด: 1 + (i % 4) * 0.5 });
    const ขนาด = (i) => 1 + (i % 4) * 0.5;

    { const { n, company } = await ลีด(0);
      const rid = await ง.ขอราคา(n, ขนาด(0)); await ง.HQรับเรื่อง(rid); await ง.ทำใบ(n, company, await ง.HQส่งใบ(rid, { ขนาด: ขนาด(0) })); }
    { const { n, company } = await ลีด(1); await ง.ถึงส่งใบ(n, company, { ขนาด: ขนาด(1) }); }
    { const { n, company } = await ลีด(2); const { qid } = await ง.ถึงส่งใบ(n, company, { ขนาด: ขนาด(2) }); await ง.ฉบับใหม่(qid, 12); }
    { const { n, company } = await ลีด(3); const { qid } = await ง.ถึงส่งใบ(n, company, { ขนาด: ขนาด(3) }); await ง.ส่งใบ(await ง.ฉบับใหม่(qid, 10)); }
    { const { n, company } = await ลีด(4); const { qid } = await ง.ถึงส่งใบ(n, company, { ขนาด: ขนาด(4) });
      const v2 = await ง.ฉบับใหม่(qid, 13); await ง.ส่งใบ(v2); await ง.ตอบรับ(n, company, v2); }
    { const { n, company } = await ลีด(5); const { qid } = await ง.ถึงส่งใบ(n, company, { ขนาด: ขนาด(5) }); await ง.ตอบรับ(n, company, qid); }
    { const { n, company } = await ลีด(6); const { qid } = await ง.ถึงส่งใบ(n, company, { ขนาด: ขนาด(6) }); await ง.ปฏิเสธ(qid, "ลูกค้าเลือกผู้รับเหมารายอื่น"); }
    // 7 หมดอายุ: งานนี้เกิดเมื่อ 40 วันก่อน (ใบ HQ ยืนราคา 30 วัน → หมดไปแล้ว) แล้วให้งานตามเวลาของฐานทำงาน
    { const ย้อน = await ตัวย้อนเวลา(ctx); const จด = ย้อน.งาน(s.code, s.base + 7, [40, 39, 38, 36, 36], 1);
      await จด(0); const { n, company } = await ง.ลีด(s.base + 7, { ย้อนวัน: 40, เรื่อง: เหตุการณ์[7] });
      await ง.ถึงส่งใบ(n, company, { ขนาด: ขนาด(7), จด }); ย้อน.พัก(); ย้อน.สั่ง();
      ctx.ต้อง(await ctx.svc.rpc("expire_hq_linked_quotations"), "งานตามเวลา: ใบ HQ หมดอายุ"); }
    { const { n, company } = await ลีด(8); await ง.ถึงส่งใบ(n, company, { ขนาด: ขนาด(8), วันยืนราคา: 2 }); }
    { const { n } = await ลีด(9); const rid = await ง.ขอราคา(n, ขนาด(9)); await ง.HQรับเรื่อง(rid); await ง.HQบันทึกใบ(rid, { ขนาด: ขนาด(9) }); }
    { const { n } = await ลีด(10); const rid = await ง.ขอราคา(n, ขนาด(10)); await ง.HQรับเรื่อง(rid); await ง.HQส่งใบ(rid, { ขนาด: ขนาด(10) }); }
    { const { n, company } = await ลีด(11); const { qid } = await ง.ถึงส่งใบ(n, company, { ขนาด: ขนาด(11) }); await ง.ตอบรับ(n, company, qid);
      ctx.ต้อง(await hq.rpc("quotation_revert_won", { p_dealer: s.code, p_id: qid, p_reason: "ลูกค้าขอเลื่อนชำระมัดจำ (ตัวอย่าง)", p_to: "sent_to_client" }), "HQ ย้อนการตอบรับ"); }

    const { data } = await ctx.svc.from("quotations").select("status").eq("dealer_code", s.code).gte("deal_id", s.base).lte("deal_id", s.base + 999);
    นับ[s.code] = (data ?? []).reduce((m, q) => ({ ...m, [q.status]: (m[q.status] ?? 0) + 1 }), {});
  }

  // SKN: ข้อมูลบริษัทไม่ครบ — ทำใบร่างได้ แต่ฐานต้องปฏิเสธการส่ง
  {
    const b = บัญชีสาขา(ctx, "SKN");
    const ง = await งานขายของสาขา(ctx, { code: "SKN", province: "สกลนคร", sb: await ctx.เข้า(b.email, b.password), hq, ป้ายส่วน: "ใบตัวอย่าง" });
    const { n, company } = await ง.ลีด(996_330_000, { ย้อนวัน: 3, เรื่อง: "ใบร่าง ส่งไม่ได้จนกว่ากรอกข้อมูลบริษัทครบ" });
    const rid = await ง.ขอราคา(n); await ง.HQรับเรื่อง(rid);
    const qid = await ง.ทำใบ(n, company, await ง.HQส่งใบ(rid));
    const { error } = await ง.sb.rpc("quotation_send", { p_dealer: "SKN", p_id: qid });
    if (!error) throw new Error("ฐานยอมให้ SKN ส่งใบทั้งที่ข้อมูลบริษัทไม่ครบ — ผิดกติกาใบ 0247");
    console.log(`✓ SKN ใบร่าง ${qid} · ส่งไม่ได้ตามกติกา (${error.message.split(":")[0]})`);
  }
  const { data: hqs } = await ctx.svc.from("hq_quotes").select("status, quote_requests!inner(lead_num_id)").gte("quote_requests.lead_num_id", ช่วง[0]).lte("quote_requests.lead_num_id", ช่วง[1]);
  const นับHQ = (hqs ?? []).reduce((m, h) => ({ ...m, [h.status]: (m[h.status] ?? 0) + 1 }), {});
  console.log(`✓ ใบลูกค้า ${JSON.stringify(นับ)} · ใบ HQ ${JSON.stringify(นับHQ)}`);
}
