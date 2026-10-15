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
  const raw = new URL(req.url).searchParams.get("prospect");
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
  if (new URL(req.url).searchParams.get("op") === "new-version") {
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
