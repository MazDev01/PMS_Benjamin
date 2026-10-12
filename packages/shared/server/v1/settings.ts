// ── /api/v1/settings — นโยบาย/เป้า/กฎแจ้งเตือน/เส้นทางการขาย ของสำนักงานใหญ่ ──────
//
// ระยะ 1 กลุ่มที่ 8 · เป็นกลุ่มที่เมธอดเยอะสุด (14 ตัว) แต่เกือบทั้งหมดเป็น singleton id=1
//
// ⚠️ ค่ากลาง (DEFAULT_HQ_POLICY ฯลฯ) อยู่ใน mock.ts ซึ่งเป็นของฝั่งแอป
//    เซิร์ฟเวอร์จึงคืน "ดิบ" (null ถ้ายังไม่เคยตั้ง) แล้วให้ HttpAdapter เติมค่ากลางเอง
//    เหตุผลเดียวกับ dealerSettings — ไม่ลาก mock.ts ทั้งก้อนเข้าเซิร์ฟเวอร์
//
// เส้นทางเดียวรับหลายเรื่อง แยกด้วย ?k= เพราะทุกอันคือ "ตั้งค่าของ HQ" เรื่องเดียวกัน
// และแยกเป็น 10 ไฟล์ route จะรกโดยไม่ได้อะไร
import type { NextRequest } from "next/server";
import { handler, ok, dbFail, fail } from "./_ctx";
import { toCamel, toCamelList, toSnake } from "@pms/shared/lib/data/supabase/mappers";
import { รวมค่าตั้งหาดีลเลอร์ } from "@pms/shared/lib/recruitSettings";

type Row = Record<string, unknown>;
export { runtime } from "./_ctx";

/** ตารางค่าตั้งแบบ singleton (แถวเดียว id=1) → ชื่อตารางจริง */
const ONE: Record<string, string> = {
  policy: "hq_policy",
  targets: "hq_targets",
  notifRules: "hq_notif_rules",
  journey: "hq_sales_journey",   // เก็บทั้ง lost reasons และ lead tasks
  recruit: "hq_recruit_settings", // ค่าตั้งหาดีลเลอร์ (0176) — body = { config } · RLS: อ่าน HQ เขียนผู้ดูแลข้อมูลกลาง
};

export const GET = handler("settings.get", async (req: NextRequest, sb) => {
  const k = new URL(req.url).searchParams.get("k") ?? "";

  // กฎการดูแลลูกค้าเป้าหมาย — รายสาขา ไม่ใช่ singleton
  if (k === "leadRules") {
    const { data, error } = await sb.from("dealer_lead_rules").select("*").order("dealer_code", { ascending: true });
    if (error) return dbFail("settings.leadRules", error);
    return ok(toCamelList<Record<string, unknown>>((data ?? []) as Row[]));
  }

  const table = ONE[k];
  if (!table) return fail(400, `ไม่รู้จักค่าตั้ง "${k}"`);
  const { data, error } = await sb.from(table).select("*").limit(1).maybeSingle();
  if (error) return dbFail(`settings.${k}`, error);
  return ok(data ? toCamel<Record<string, unknown>>(data as Row) : null);
});

export const PUT = handler("settings.save", async (req: NextRequest, sb) => {
  const k = new URL(req.url).searchParams.get("k") ?? "";
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return fail(400, "ไม่มีข้อมูลที่จะบันทึก");

  if (k === "leadRules") {
    const { dealerCode, ...rules } = body as { dealerCode?: string };
    if (!dealerCode) return fail(400, "ไม่ได้ระบุสาขา");
    const { error } = await sb.from("dealer_lead_rules").upsert(toSnake({ dealerCode, ...rules } as Row));
    if (error) return dbFail("settings.saveLeadRules", error);
    return ok({ ok: true });
  }

  // กู้คืนหลายกลุ่มพร้อมกันแบบ all-or-nothing (RPC 0093) — เน็ตหลุดกลางทางแล้วได้ครึ่ง ๆ ไม่ได้
  if (k === "restore") {
    const p = body as { policy?: Row; targets?: Row; notifRules?: Row; lostReasons?: string[]; company?: Row };
    const { error } = await sb.rpc("restore_hq_settings", {
      p_policy:       p.policy      ? toSnake(p.policy)      : null,
      p_targets:      p.targets     ? toSnake(p.targets)     : null,
      p_notif_rules:  p.notifRules  ? toSnake(p.notifRules)  : null,
      p_lost_reasons: p.lostReasons ?? null,
      p_company:      p.company     ? toSnake(p.company)     : null,
    });
    if (error) return dbFail("settings.restore", error);
    return ok({ ok: true });
  }

  // lost reasons / lead tasks อยู่ตารางเดียวกัน (hq_sales_journey) แต่คนละคอลัมน์
  if (k === "lostReasons" || k === "leadTasks") {
    const col = k === "lostReasons" ? "lost" : "tasks";
    const { error } = await sb.from("hq_sales_journey").upsert({ id: 1, [col]: body.value });
    if (error) return dbFail(`settings.${k}`, error);
    return ok({ ok: true });
  }

  // ค่าตั้งหาดีลเลอร์ — จัดรูปแบบซ้ำที่เซิร์ฟเวอร์เสมอ ห้ามเชื่อว่าหน้าจอจัดมาแล้ว
  if (k === "recruit") {
    const { error } = await sb.from("hq_recruit_settings").upsert({ id: 1, config: รวมค่าตั้งหาดีลเลอร์(body.config) });
    if (error) return dbFail("settings.recruit", error);
    return ok({ ok: true });
  }

  const table = ONE[k];
  if (!table) return fail(400, `ไม่รู้จักค่าตั้ง "${k}"`);
  const { error } = await sb.from(table).upsert({ id: 1, ...toSnake(body) });
  if (error) return dbFail(`settings.${k}`, error);
  return ok({ ok: true });
});
