// ── /api/v1/proposals — ใบค่าแฟรนไชส์ (ของสำนักงานใหญ่) ─────────────────────────
//
// ทำงาน "ในนามผู้ใช้ที่เรียกมา" เหมือนเส้นทางอื่นในระยะ 1 — RLS ของ 0172 เป็นด่านสิทธิ์จริง
//   สถานะเดินหน้าทางเดียว / ใบที่ส่งแล้วแก้-ลบไม่ได้ บังคับที่ตัวดักของฐานข้อมูล (ทุกเส้นทางโดนเหมือนกัน)
// ⚠️ จัดข้อมูลและตรวจความถูกต้องซ้ำที่นี่เสมอ (เตรียมบันทึกใบ / ตรวจใบเสนอ) — ห้ามเชื่อหน้าจอ
import type { NextRequest } from "next/server";
import { handler, ok, dbFail, fail } from "./_ctx";
import { toCamel, toCamelList, toSnake } from "@pms/shared/lib/data/supabase/mappers";
import type { DealerPackageProposal } from "@pms/shared/lib/data/types";
import { เตรียมบันทึกใบ, ตรวจใบเสนอ, เป็นสถานะใบ } from "@pms/shared/lib/dealerProposals";

type Row = Record<string, unknown>;
const PAGE = 1000;

export { runtime } from "./_ctx";

export const proposalsGET = handler("proposals.list", async (req: NextRequest, sb) => {
  const sp = new URL(req.url).searchParams;
  // บันทึกการชำระของใบ (0208) — กฎรายตาราง: HQ อ่านได้เท่านั้น
  if (sp.get("view") === "payments") {
    const proposal = Number(sp.get("proposal"));
    if (!Number.isInteger(proposal) || proposal <= 0) return fail(400, "ไม่ได้ระบุใบค่าแฟรนไชส์");
    const { data, error } = await sb.from("dealer_proposal_payments").select("*").eq("proposal_id", proposal).order("id");
    if (error) return dbFail("proposals.payments", error);
    return ok(((data ?? []) as Row[]).map(r => ({ ...toCamel<Row>(r), amount: Number(r.amount) })));
  }
  // พร้อมแปลงเป็นดีลเลอร์ไหม (ฐานข้อมูลตอบ · คำสั่งตรวจว่าเป็น HQ เอง)
  if (sp.get("view") === "ready") {
    const prospect = Number(sp.get("prospect"));
    if (!Number.isInteger(prospect) || prospect <= 0) return fail(400, "รหัสลูกค้าเป้าหมายไม่ถูกต้อง");
    const { data, error } = await sb.rpc("dealer_conversion_ready", { p_prospect: prospect });
    if (error) return dbFail("proposals.ready", error);
    return ok({ reason: (data as string | null) ?? null });
  }
  const raw = sp.get("prospect");
  const prospect = raw == null ? null : Number(raw);
  if (prospect !== null && (!Number.isInteger(prospect) || prospect <= 0)) return fail(400, "รหัสลูกค้าเป้าหมายไม่ถูกต้อง");
  // ⚠️ ไล่ทีละหน้าเสมอ — ฐานข้อมูลคืนสูงสุด 1,000 แถว/คำขอ
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb.from("dealer_package_proposals").select("*");
    if (prospect !== null) q = q.eq("prospect_id", prospect);
    const { data, error } = await q.order("id", { ascending: false }).range(from, from + PAGE - 1);
    if (error) return dbFail("proposals.list", error);
    const got = (data ?? []) as Row[];
    rows.push(...got);
    if (got.length < PAGE) break;
  }
  return ok(toCamelList<DealerPackageProposal>(rows));
});

export const proposalsPOST = handler("proposals.create", async (req: NextRequest, sb) => {
  // ทำเวอร์ชันใหม่ (0207) — ฐานข้อมูลตรวจสิทธิ์/สถานะ/ใบล่าสุดของสายเอง
  const op = new URL(req.url).searchParams.get("op");
  // ตกลง + ชำระ (0208) — ฐานข้อมูลตรวจสิทธิ์ (HQ) · ใบต้องตอบรับ · ยอด > 0 · เลขอ้างอิง · ยกเลิกต้องมีเหตุผล
  if (op === "payment") {
    const b = (await req.json().catch(() => null)) as { proposalId?: unknown; paidOn?: unknown; amount?: unknown; reference?: unknown } | null;
    const proposalId = Number(b?.proposalId), amount = Number(b?.amount);
    const paidOn = String(b?.paidOn ?? ""), reference = String(b?.reference ?? "").trim().slice(0, 200);
    if (!Number.isInteger(proposalId) || proposalId <= 0) return fail(400, "ไม่ได้ระบุใบค่าแฟรนไชส์");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return fail(400, "วันที่ชำระไม่ถูกต้อง");
    if (!Number.isFinite(amount) || amount <= 0) return fail(400, "ยอดชำระต้องมากกว่า 0");
    if (!reference) return fail(400, "ต้องระบุเลขอ้างอิงการชำระ");
    const { data, error } = await sb.from("dealer_proposal_payments")
      .insert({ proposal_id: proposalId, paid_on: paidOn, amount, reference }).select().single();
    if (error) return dbFail("proposals.addPayment", error);
    return ok({ ...toCamel<Row>(data as Row), amount: Number((data as Row).amount) });
  }
  if (op === "cancel-payment") {
    const b = (await req.json().catch(() => null)) as { id?: unknown; reason?: unknown } | null;
    const id = Number(b?.id), reason = String(b?.reason ?? "").trim().slice(0, 500);
    if (!Number.isInteger(id) || id <= 0) return fail(400, "ไม่ได้ระบุบันทึกการชำระ");
    if (!reason) return fail(400, "ยกเลิกบันทึกการชำระต้องระบุเหตุผล");
    const { data, error } = await sb.from("dealer_proposal_payments").update({ cancel_reason: reason }).eq("id", id).select().single();
    if (error) return dbFail("proposals.cancelPayment", error);
    return ok({ ...toCamel<Row>(data as Row), amount: Number((data as Row).amount) });
  }
  if (op === "payment-due") {
    // วันครบกำหนดชำระ (ใบ 0231) — แก้ช่องเดียว · ว่าง = ล้าง
    const b = (await req.json().catch(() => null)) as { id?: unknown; date?: unknown } | null;
    const id = Number(b?.id), date = b?.date == null || b.date === "" ? null : String(b.date);
    if (!Number.isInteger(id) || id <= 0) return fail(400, "ไม่ได้ระบุใบค่าแฟรนไชส์");
    if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(400, "วันครบกำหนดชำระไม่ถูกต้อง");
    const { data, error } = await sb.from("dealer_package_proposals").update({ payment_due_on: date }).eq("id", id).select().single();
    if (error) return dbFail("proposals.setPaymentDue", error);
    return ok(toCamel<Row>(data as Row));
  }
  if (op === "new-version") {
    const b = (await req.json().catch(() => null)) as { id?: number } | null;
    const id = Number(b?.id);
    if (!Number.isInteger(id) || id <= 0) return fail(400, "ไม่ได้ระบุใบค่าแฟรนไชส์");
    const { data, error } = await sb.rpc("dealer_proposal_new_version", { p_id: id });
    if (error) return dbFail("proposals.newVersion", error);
    return ok(toCamel<DealerPackageProposal>(data as Row));
  }
  const body = (await req.json().catch(() => null)) as Partial<DealerPackageProposal> | null;
  if (!body || typeof body !== "object") return fail(400, "ข้อมูลใบค่าแฟรนไชส์ไม่ถูกต้อง");
  const row = เตรียมบันทึกใบ(body);
  const ผิด = ตรวจใบเสนอ(row);
  if (ผิด) return fail(400, ผิด);
  const { data, error } = await sb.from("dealer_package_proposals").insert(toSnake(row as unknown as Row)).select().single();
  if (error) return dbFail("proposals.create", error);
  return ok(toCamel<DealerPackageProposal>(data as Row));
});

export const proposalsPUT = handler("proposals.update", async (req: NextRequest, sb) => {
  const body = (await req.json().catch(() => null)) as Partial<DealerPackageProposal> | null;
  const id = Number(body?.id);
  if (!body || !Number.isInteger(id) || id <= 0) return fail(400, "ไม่ได้ระบุใบค่าแฟรนไชส์ที่จะแก้");
  const row = เตรียมบันทึกใบ(body);
  const ผิด = ตรวจใบเสนอ(row);
  if (ผิด) return fail(400, ผิด);
  const { data, error } = await sb.from("dealer_package_proposals").update(toSnake(row as unknown as Row)).eq("id", id).select().single();
  if (error) return dbFail("proposals.update", error);
  return ok(toCamel<DealerPackageProposal>(data as Row));
});

// เปลี่ยนสถานะอย่างเดียว — แยกจาก PUT เพราะใบที่ส่งแล้วถูกล็อกเนื้อหา ส่งทั้งแถวกลับไปอาจชนตัวดักโดยไม่ได้ตั้งใจ
export const proposalsPATCH = handler("proposals.status", async (req: NextRequest, sb) => {
  const body = (await req.json().catch(() => null)) as { id?: number; status?: string; reason?: unknown } | null;
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return fail(400, "ไม่ได้ระบุใบค่าแฟรนไชส์");
  if (!เป็นสถานะใบ(body?.status)) return fail(400, "สถานะใบค่าแฟรนไชส์ไม่ถูกต้อง");
  // เหตุผลที่ปิด (ปฏิเสธต้องมี — ฐานข้อมูลบังคับ 0207) · ยาวสุด 500 ตัวอักษร
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  const { data, error } = await sb.from("dealer_package_proposals")
    .update(reason ? { status: body!.status, close_reason: reason } : { status: body!.status }).eq("id", id).select().single();
  if (error) return dbFail("proposals.status", error);
  return ok(toCamel<DealerPackageProposal>(data as Row));
});

export const proposalsDELETE = handler("proposals.remove", async (req: NextRequest, sb) => {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return fail(400, "ไม่ได้ระบุใบค่าแฟรนไชส์ที่จะลบ");
  const { error } = await sb.from("dealer_package_proposals").delete().eq("id", id);
  if (error) return dbFail("proposals.remove", error);
  return ok({ ok: true });
});
