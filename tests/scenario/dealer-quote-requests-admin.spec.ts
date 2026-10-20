import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, db } from "./funcHelpers";
import { adminClient, ลบสาขาทดสอบตรง } from "./testDealers";

// ── ลบดีลเลอร์ / ย้ายข้อมูลดีลเลอร์ ต้องรู้จัก "คำขอราคา" และ "ใบ HQ" ของ Flow ใหม่ (ใบ 0189) ─────────
//
// สองคำสั่งนี้เขียนไว้ก่อนมีตารางคำขอราคา (0183) — รายชื่อตารางในตัวคำสั่งจึงไม่มีคำขอราคา
//   ลบ: สาขาที่มีคำขอราคาต้องถูกปฏิเสธด้วยเหตุผล "มีคำขอราคา" ไม่ใช่ล้มชั่วคราว
//   (รอบ 2 ช่วง ข · 19 ต.ค. 69: หน้าเว็บเลิกลบ/ย้ายดีลเลอร์แล้ว เส้นทางตอบ 410 — คำสั่งของฐานยังอยู่สำหรับงานดูแลระบบ จึงทดสอบที่คำสั่งตรง)
//   ย้าย: คำขอราคาและใบ HQ ต้องตามลูกค้าเป้าหมายไปสาขาปลายทาง และยังชี้ไปที่ลูกค้าเป้าหมายรายเดิม
//         (ยืนยันด้วยชื่อบริษัทที่ไม่ซ้ำ ไม่ใช่ด้วยเลข — เลขเป็นสิ่งที่อาจเพี้ยนได้)
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(120_000);

const DEL = "ZTQ";                    // สาขาที่มีคำขอราคาค้าง — ลองลบ
const FROM = "ZTM", TO = "ZTN";       // ย้ายข้อมูล
const admin = adminClient();
const ทุกสาขา = [DEL, FROM, TO];

async function adminToken() {
  return (await (await db(ADMIN)).auth.getSession()).data.session?.access_token ?? "";
}
async function purge() { for (const c of ทุกสาขา) await ลบสาขาทดสอบตรง(c, admin); }
test.beforeAll(purge);
test.afterAll(async () => {
  // เก็บกวาดไม่หมดต้องดัง ไม่กลืนเงียบ — ไม่งั้นรอบถัดไปตกที่ขั้นเตรียมข้อมูลโดยไม่รู้สาเหตุ
  for (const c of ทุกสาขา) expect(await ลบสาขาทดสอบตรง(c, admin), `เก็บกวาดสาขา ${c}`).toEqual([]);
});

const ต้องผ่าน = (r: { error: { message: string } | null }, อะไร: string) => {
  if (r.error) throw new Error(`${อะไร} ไม่สำเร็จ: ${r.error.message}`);
};
async function สร้างสาขา(code: string, name: string) {
  ต้องผ่าน(await admin.from("dealers").insert({ code, name, province: "ระยอง", region: "ตะวันออก", status: "active" }), `สร้างสาขา ${code}`);
}
async function สร้างลูกค้าเป้าหมาย(code: string, num: number, company: string) {
  ต้องผ่าน(await admin.from("leads").insert({
    id: `#L-${num}`, num_id: num, dealer_code: code, company, name: company, contact: "ผู้ทดสอบ",
    phone: "081-999-0101", province: "ระยอง", product: "โกดังสำเร็จรูป", status: "WAITING",
  }), `สร้างลูกค้าเป้าหมาย ${company}`);
}
async function สร้างคำขอราคา(code: string, leadNum: number, no: string, status = "new"): Promise<number> {
  const r = await admin.from("quote_requests").insert({
    request_no: no, dealer_code: code, lead_num_id: leadNum, product: "โกดังสำเร็จรูป", province: "ระยอง",
    status, due_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
  }).select("id").single();
  ต้องผ่าน(r, `สร้างคำขอราคา ${no}`);
  return (r.data as { id: number }).id;
}

test("[admin] สาขาที่มีคำขอราคาค้าง ลบไม่ได้ และต้องบอกว่าค้างที่คำขอราคา · เส้นทางลบปิดแล้ว (410)", async ({ request }) => {
  await สร้างสาขา(DEL, "ZZTEST-สาขามีคำขอราคา");
  await สร้างลูกค้าเป้าหมาย(DEL, 1, "ZZTEST-ลูกค้าขอราคา-ลบสาขา");
  await สร้างคำขอราคา(DEL, 1, "ZZTEST-RQ-DEL-1");

  const ลบ = await request.delete(`${HQ_ORIGIN}/api/admin/dealers?code=${DEL}`, { headers: { authorization: `Bearer ${await adminToken()}` } });
  expect(ลบ.status(), `เส้นทางลบดีลเลอร์ปิดแล้ว (ได้ ${ลบ.status()} · ${await ลบ.text()})`).toBe(410);

  // ต้องบอกว่าสิ่งที่ค้างคือ "คำขอราคา" — ตัวคำสั่งนับคำขอราคาเป็นข้อมูลของสาขาเอง ไม่ใช่รอดเพราะตารางลูกค้าเป้าหมายกันให้
  const ตรง = await admin.rpc("delete_dealer_atomic", { p_code: DEL });
  expect(ตรง.error?.message ?? "", "ตัวคำสั่งต้องปฏิเสธด้วยเหตุผลว่ามีคำขอราคา").toContain("dealer_has_data:quote_requests:1");
  const { data } = await admin.from("quote_requests").select("id").eq("dealer_code", DEL);
  expect(data?.length, "คำขอราคาต้องยังอยู่ครบ").toBe(1);
});

test("[admin] ย้ายข้อมูลสาขา (คำสั่งของฐาน) — คำขอราคาและใบ HQ ย้ายตาม และยังชี้ไปที่ลูกค้าเป้าหมายรายเดิม", async ({ request }) => {
  await สร้างสาขา(FROM, "ZZTEST-สาขาต้นทางมีคำขอราคา");
  await สร้างสาขา(TO, "ZZTEST-สาขาปลายทางรับคำขอราคา");
  // ลูกค้าเป้าหมาย 3 ราย เลขไม่เรียงกัน · 2 รายมีคำขอราคา (รายหนึ่งมีใบ HQ) · 1 รายไม่มี
  const ก = "ZZTEST-ย้ายสาขา-ลูกค้า-ก", ข = "ZZTEST-ย้ายสาขา-ลูกค้า-ข", ค = "ZZTEST-ย้ายสาขา-ลูกค้า-ค";
  await สร้างลูกค้าเป้าหมาย(FROM, 7, ก);
  await สร้างลูกค้าเป้าหมาย(FROM, 3, ข);
  await สร้างลูกค้าเป้าหมาย(FROM, 5, ค);
  const คำขอก = await สร้างคำขอราคา(FROM, 7, "ZZTEST-RQ-MOVE-A", "quoted");
  const คำขอข = await สร้างคำขอราคา(FROM, 3, "ZZTEST-RQ-MOVE-B", "new");
  ต้องผ่าน(await admin.from("hq_quotes").insert({ request_id: คำขอก, version: 1, quote_no: "ZZTEST-HQ-MOVE-A", status: "draft", total_cost: 250000 }), "สร้างใบ HQ");
  // ใบ HQ เป็นฉบับร่าง: ใบที่ส่งแล้วลบไม่ได้แม้ด้วยสิทธิ์เซิร์ฟเวอร์ (ตัวล็อกของฐาน) ข้อทดสอบจะเก็บกวาดตัวเองไม่ได้

  /** คำขอราคา/ใบ HQ แต่ละใบ เป็นของลูกค้าเป้าหมาย "ชื่ออะไร" ที่สาขาไหน — ไล่จากความสัมพันธ์จริงในฐาน */
  const ใครเป็นเจ้าของ = async () => {
    const { data: reqs, error } = await admin.from("quote_requests").select("id, request_no, dealer_code, lead_num_id, status").in("id", [คำขอก, คำขอข]);
    if (error) throw new Error(error.message);
    const out: Record<string, string> = {};
    for (const r of reqs ?? []) {
      const { data: lead } = await admin.from("leads").select("company").eq("dealer_code", r.dealer_code).eq("num_id", r.lead_num_id).maybeSingle();
      out[String(r.request_no)] = `${r.dealer_code} · ${lead?.company ?? "(ไม่พบลูกค้าเป้าหมาย)"} · ${r.status}`;
    }
    const { data: hq } = await admin.from("hq_quotes").select("quote_no, request_id, status, total_cost").eq("quote_no", "ZZTEST-HQ-MOVE-A").single();
    const req = (reqs ?? []).find(r => r.id === hq?.request_id);
    const { data: lead } = req ? await admin.from("leads").select("company").eq("dealer_code", req.dealer_code).eq("num_id", req.lead_num_id).maybeSingle() : { data: null };
    out["ใบ HQ ZZTEST-HQ-MOVE-A"] = `${req?.dealer_code} · ${lead?.company ?? "(ไม่พบลูกค้าเป้าหมาย)"} · ${hq?.status} · ${hq?.total_cost}`;
    return out;
  };
  const ประวัติ = async () => (await admin.from("quote_request_events").select("id", { count: "exact", head: true }).in("request_id", [คำขอก, คำขอข])).count;

  expect(await ใครเป็นเจ้าของ(), "ก่อนย้าย").toEqual({
    "ZZTEST-RQ-MOVE-A": `${FROM} · ${ก} · quoted`,
    "ZZTEST-RQ-MOVE-B": `${FROM} · ${ข} · new`,
    "ใบ HQ ZZTEST-HQ-MOVE-A": `${FROM} · ${ก} · draft · 250000`,
  });
  const ประวัติก่อน = await ประวัติ();
  expect(ประวัติก่อน, "ต้องมีประวัติของคำขอราคาให้ตรวจว่าไม่หาย").toBeGreaterThan(0);

  const ทางเว็บ = await request.post(`${HQ_ORIGIN}/api/admin/dealers/move`, { headers: { authorization: `Bearer ${await adminToken()}` }, data: { from: FROM, to: TO } });
  expect(ทางเว็บ.status(), "เส้นทางย้ายข้อมูลปิดแล้ว").toBe(410);
  expect((await ใครเป็นเจ้าของ())["ZZTEST-RQ-MOVE-A"], "เส้นทางที่ปิดแล้วต้องไม่ย้ายอะไร").toBe(`${FROM} · ${ก} · quoted`);
  const ย้าย = await admin.rpc("move_dealer_data_atomic", { p_from: FROM, p_to: TO });
  ต้องผ่าน(ย้าย, "ย้ายข้อมูล");

  // 1) ทุกใบไปอยู่สาขาปลายทาง และยังเป็นของลูกค้าเป้าหมายรายเดิม สถานะและราคาไม่เปลี่ยน
  expect(await ใครเป็นเจ้าของ(), "หลังย้าย").toEqual({
    "ZZTEST-RQ-MOVE-A": `${TO} · ${ก} · quoted`,
    "ZZTEST-RQ-MOVE-B": `${TO} · ${ข} · new`,
    "ใบ HQ ZZTEST-HQ-MOVE-A": `${TO} · ${ก} · draft · 250000`,
  });
  // 2) ไม่มีอะไรค้างที่ต้นทาง · ประวัติไม่หายและไม่งอก (การย้ายไม่ใช่การเปลี่ยนสถานะ)
  for (const t of ["quote_requests", "leads"]) {
    const { count } = await admin.from(t).select("*", { count: "exact", head: true }).eq("dealer_code", FROM);
    expect(count, `${t}: ต้องไม่เหลือที่สาขาต้นทาง`).toBe(0);
  }
  expect(await ประวัติ(), "ประวัติคำขอราคาต้องเท่าเดิม").toBe(ประวัติก่อน);
  // 3) ลูกค้าเป้าหมายที่ไม่มีคำขอราคา ต้องไม่ได้คำขอของรายอื่นมาแทน
  const { data: leadค } = await admin.from("leads").select("num_id").eq("dealer_code", TO).eq("company", ค).single();
  const { count: ของค } = await admin.from("quote_requests").select("*", { count: "exact", head: true }).eq("dealer_code", TO).eq("lead_num_id", leadค!.num_id);
  expect(ของค, "ลูกค้าเป้าหมายที่ไม่เคยขอราคา ต้องไม่มีคำขอราคาหลังย้าย").toBe(0);
  // 4) ผลที่ระบบรายงานกลับ (และลงบันทึกการใช้งาน) ต้องนับคำขอราคาและใบ HQ ที่ย้ายด้วย
  const moved = (ย้าย.data ?? []) as { entity: string; moved: number }[];
  const จำนวน = (e: string) => Number(moved.find(m => m.entity === e)?.moved ?? -1);
  expect(จำนวน("quote_requests"), "รายงานจำนวนคำขอราคาที่ย้าย").toBe(2);
  expect(จำนวน("hq_quotes"), "รายงานจำนวนใบ HQ ที่ย้าย").toBe(1);

  // 5) ย้ายออกหมดแล้ว ลบสาขาต้นทางได้
  ต้องผ่าน(await admin.rpc("delete_dealer_atomic", { p_code: FROM }), "ย้ายออกหมดแล้วต้องลบสาขาต้นทางได้");
});
