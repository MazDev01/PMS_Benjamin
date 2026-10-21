"use client";

import { useState, useRef, useEffect } from "react";
import { FilePlus, Eye, Pencil, Printer, Copy, CopyPlus, Trash2, X, ArrowLeft, Send, FileText, Calendar, Coins, AlertTriangle } from "lucide-react";
import { useSales } from "@pms/shared/context/SalesContext";
import {
  quotationStatusLabel, quotationStatusColor, fmtISOToThai,
  type LeadRow, type CustomerRow, type QuotationMock, type QuoteLineItem,
} from "@pms/shared/lib/mock";
import { HqMarkupEditor } from "@pms/shared/components/ui/HqMarkupEditor";
import { quoteRequests as quoteRequestsRepo } from "@pms/shared/lib/data";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";
import { type HqQuote, รายการใบลูกค้าจากใบHQ, วันไทยสั้น } from "@pms/shared/lib/quoteRequests";
import { markupPctOf } from "@pms/shared/lib/boq";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { boqLineItems } from "@pms/shared/lib/boq";
import { printQuotation } from "@pms/shared/lib/quotationPrint";
import { ฉบับถัดไป, จะขึ้นฉบับใหม่ } from "@pms/shared/lib/quoteRevision";
import { parseBaht, fmtBaht, fmtFull } from "@pms/shared/lib/format";
import { คิดภาษีใบเสนอราคา, ช่องภาษีสำหรับบันทึก } from "@pms/shared/lib/quoteTax";
import { useHQPolicy } from "@pms/shared/lib/useHQConfig";
import { useQuoteValidity } from "@pms/shared/lib/useQuoteValidity";
import { useDealerSettings, useDealerVat, useDealerWht } from "@pms/shared/lib/useDealerSettings";
import { APP_NOW_ISO } from "@pms/shared/context/FilterContext";

// "วันนี้ของระบบ" (ISO) — โหมด supabase = วันจริง · โหมด local = 30 มิ.ย. 2569 (ดู APP_NOW ใน FilterContext)
// ใบเสนอราคาที่สร้าง/ส่งใหม่ลงวันที่นี้ → ตรงกับตัวกรอง/รายงานที่อิง APP_NOW เสมอ
const MOCK_TODAY = APP_NOW_ISO;

/** วันหมดอายุของใบ = วันที่ออกใบ + อายุใบที่สำนักงานใหญ่ตั้งไว้ (บอสสั่ง 20 ส.ค. 69)
 *  คิดจุดเดียวที่นี่ — ดีลเลอร์ไม่ต้องพิมพ์เอง จะได้ไม่มีทางพิมพ์ผิดหรือขัดกับนโยบาย */
function วันหมดอายุจาก(วันออกใบ: string, อายุวัน: number): string {
  const d = new Date(วันออกใบ);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + (อายุวัน > 0 ? อายุวัน : 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// vatOn/whtOn = "ใบนี้คิดภาษีตัวนั้นไหม" · vatPct/whtPct = อัตราที่ดีลเลอร์แก้เองได้ในฟอร์ม
// ค่าตั้งต้น (บอสสั่ง 28 ส.ค. 69): VAT ติ๊กไว้ · หัก ณ ที่จ่าย ไม่ติ๊ก
type FormState = { project: string; items: string; price: string; expiry: string; note: string;
  lineItems: QuoteLineItem[]; vatOn: boolean; vatPct: string; whtOn: boolean; whtPct: string };

// ต้องส่งมาอย่างใดอย่างหนึ่งเท่านั้น (lead หรือ customer) — เดิม prop เป็น optional ทั้งคู่แยกกัน
//   TS ไม่บังคับ จึงต้องใช้ customer! เดาเอาว่ามาแน่ ๆ ตอนไม่มี lead (พังถ้ามีคนเรียกผิดในอนาคต)
//   ตอนนี้เป็น discriminated union — เรียกไม่ครบ/เรียกทั้งคู่ = TS error ตั้งแต่คอมไพล์ ไม่ต้องพึ่ง !
// openCreateSignal = ตัวนับจากหน้าแม่ — ค่าเปลี่ยนเมื่อไร แปลว่า "เปิดฟอร์มออกใบให้เลย"
// ใช้ตอนดีลเลอร์ลากลูกค้าเป้าหมายไปขั้นเสนอราคา / กดติ๊กงาน "จัดทำใบเสนอราคา" (ต้องมีใบจริงถึงจะขยับขั้นได้)
type LeadQuotationsPanelProps =
  | { lead: LeadRow; customer?: undefined; onToast?: (m: string) => void; openCreateSignal?: number }
  | { lead?: undefined; customer: CustomerRow; onToast?: (m: string) => void; openCreateSignal?: undefined };

export function LeadQuotationsPanel({ lead, customer, onToast, openCreateSignal }: LeadQuotationsPanelProps) {
  const { quotations, createQuotation, updateQuotation, deleteQuotation, newQuotationVersion } = useSales();
  const [mode, setMode] = useState<"list" | "create" | "edit" | "view">("list");
  const [editing, setEditing] = useState<QuotationMock | null>(null);
  const ฉบับใหม่ = !!editing?.supersedesId;   // ฉบับใหม่ (V2 …): ลูกค้า โครงการ ภาษี คัดลอกจากใบเดิม แก้ไม่ได้ (0228)
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const savingRef = useRef(false); // กันกดออกใบซ้ำระหว่างรอเลขที่ใบจาก DB (H8 · guard synchronous)
  const [saving, setSaving] = useState(false); // ไว้ disable ปุ่ม (visual)
  const policy = useHQPolicy(); // นโยบาย HQ — อายุใบ ฯลฯ (VAT ย้ายไปเป็นของสาขาแล้ว · 7 ส.ค. 69)
  // อายุใบเสนอราคาที่สำนักงานใหญ่ประกาศไว้ — ใช้คิดวันหมดอายุแทนการให้ดีลเลอร์พิมพ์เอง
  // อายุใบเสนอราคาของ "สาขา" มาก่อนนโยบายเครือเสมอ (บอสสั่ง 20 ส.ค. 69)
  const validityDays = useQuoteValidity();
  // ใบใหม่: นับจากวันที่ออกใบ · ใบเดิมที่เคยระบุวันไว้แล้ว: คงวันเดิม ไม่เขียนทับของเก่า
  const วันหมดอายุตามสาขา = (mode === "edit" && editing?.expiry) ? editing.expiry : วันหมดอายุจาก(MOCK_TODAY, validityDays);
  const dealerCfg = useDealerSettings(); // หัวกระดาษ/ตราประทับ/VAT ของสาขา (ผ่าน repo)
  // % ที่บวกตั้งต้นต่อแม่แบบที่สาขาตั้งไว้เอง — ใช้ตั้งต้น % ของแต่ละบรรทัดในใบที่ทำจากใบ HQ
  const pricing = dealerCfg.settings.pricing;
  const dealerVat = useDealerVat();
  const dealerWht = useDealerWht();   // อัตราหัก ณ ที่จ่ายตั้งต้นของสาขา (ตั้งค่า › ใบเสนอราคา)      // % VAT ที่สาขาตั้งเอง — ใช้ตอนออกใบใหม่และเป็นค่าสำรองของใบเก่า
  const printCfg = { issuer: dealerCfg.settings.issuer, doc: dealerCfg.settings.document };

  // subject รวม — รองรับทั้ง "ลูกค้าเป้าหมาย" (lead) และ "ลูกค้า" (customer)
  const subj = lead ? {
    kind: "lead" as const, company: lead.company, contact: lead.contact, phone: lead.phone, email: lead.email,
    province: lead.province, assigned: lead.assigned,
    customerId: lead.customerId, dealId: lead.numId as number | undefined,
    area: lead.area,                         // พื้นที่ที่กรอกไว้ตอนเพิ่มลูกค้าเป้าหมาย — ใช้เป็นจำนวนตั้งต้นของ BOQ
    project: lead.project,                   // ชื่อโครงการที่ดีลเลอร์ตั้งไว้ตอนสร้างดีล (ถ้ามี)
  } : {
    kind: "customer" as const, company: customer.company, contact: customer.name, phone: customer.phone, email: customer.email,
    province: customer.province, assigned: customer.owner,
    customerId: customer.id, dealId: undefined as number | undefined,
    area: undefined as number | undefined,   // ลูกค้า (ปิดการขายแล้ว) ไม่มีพื้นที่ตั้งต้น — ใบเสนอราคาของลูกค้าดูอย่างเดียวอยู่แล้ว
    project: undefined as string | undefined,
  };
  // ดีลเลอร์ตั้งชื่อโครงการไว้แล้วตอนสร้างดีล → ใช้ชื่อนั้น ไม่ใช่ประกอบชื่อใหม่ทับ
  // ไม่ได้ตั้งไว้ใช้ชื่อบริษัท (ยังแก้ในช่องได้ตามเดิม) — ไม่ประกอบจากแม่แบบเก่าแล้ว (เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69)
  const defProject = () => subj.project?.trim() || subj.company;
  const readOnly = subj.kind === "customer"; // แท็บใบเสนอราคาของ "ลูกค้า" = ดูอย่างเดียว (ไม่แก้/สร้าง/ลบ)

  // ฟอร์มว่าง — รายการมาจากใบ HQ เท่านั้น (openCreate เติมให้) · Flow เก่าที่ตั้งรายการจากราคาแม่แบบลบแล้ว (16 ต.ค. 69)
  const emptyForm = (): FormState => {
    return {
      project: defProject(),
      items: "0", price: "",
      expiry: "", note: "", lineItems: [],
      vatOn: true, vatPct: String(dealerVat ?? 7), whtOn: false, whtPct: String(dealerWht ?? 3),
    };
  };
  const [form, setForm] = useState<FormState>(emptyForm);

  // ── ใบลูกค้าต้องทำจากใบ HQ (FLOW.html ขั้น 7 · ด่าน 3 · ใบ 0201) ───────────────────────────────────────
  //   ทางเดิม (ตั้งรายการจากแคตตาล็อกแล้วพิมพ์ราคาเอง) ปิดแล้ว — ฐานข้อมูลปฏิเสธใบใหม่ที่ไม่มีใบ HQ ทุกทาง
  //   ใบใหม่: รายการ/จำนวนจากใบ HQ ที่ส่งแล้วของลูกค้าเป้าหมายรายนี้ · ดีลเลอร์ตั้ง % ที่บวก (ตั้งต้นตามส่วนบวกของสาขา)
  //   ใบเดิมที่ไม่มีใบ HQ = ดูได้อย่างเดียว (บอสสั่งลบ Flow เก่า 16 ต.ค. 69) — แก้/ส่ง/ลบ/ทำสำเนาไม่ได้
  //   โหมดข้อมูลตัวอย่าง (ไม่มีฐานข้อมูล) ไม่มี Flow ใบ HQ = ดูใบได้อย่างเดียว ออกใบใหม่ไม่ได้
  const [ใบHQ, setใบHQ] = useState<HqQuote | null>(null);              // ใบ HQ ที่ส่งแล้วของลูกค้าเป้าหมายนี้ (ใช้ออกใบใหม่)
  const [ใบHQของใบที่แก้, setใบHQของใบที่แก้] = useState<HqQuote | null>(null);
  const [รอใบHQ, setรอใบHQ] = useState(REAL_BACKEND && !!lead);
  useEffect(() => {
    if (!REAL_BACKEND || !lead || lead.numId == null || !lead.dealerCode) { setรอใบHQ(false); return; }
    let alive = true;
    setรอใบHQ(true);   // ถามใหม่ = กำลังโหลด (คำสั่งเปิดฟอร์มที่เข้ามาระหว่างนี้ต้องรอ ไม่ใช่ตอบว่ายังไม่มีใบ HQ)
    quoteRequestsRepo.listForLead(lead.dealerCode, lead.numId)
      .then(async rs => {
        const ได้ราคา = rs.find(r => r.status === "quoted");
        const h = ได้ราคา ? await quoteRequestsRepo.hqQuoteFor(ได้ราคา.id) : null;
        if (alive) setใบHQ(h && h.status === "sent" ? h : null);
      })
      .catch(e => logRepoRead("quoteRequests.listForLead(quote-panel)", e))
      .finally(() => alive && setรอใบHQ(false));
    return () => { alive = false; };
  }, [lead?.dealerCode, lead?.numId, lead?.status]);   // ขั้นเปลี่ยน (ส่งใบ/ขอแก้ราคา) = ถามใหม่
  const ใบHQของฟอร์ม = REAL_BACKEND ? (mode === "create" ? ใบHQ : editing?.hqQuoteId ? ใบHQของใบที่แก้ : null) : null;
  const รายการจากใบHQ = (h: HqQuote) => รายการใบลูกค้าจากใบHQ(h.lineItems, () => markupPctOf(pricing));
  // อายุใบลูกค้าไม่เกินใบ HQ (กฎใน FLOW · ฐานข้อมูลบังคับอีกชั้น) — โชว์วันที่จะถูกบันทึกจริง
  const วันหมดอายุ = ใบHQของฟอร์ม?.validUntil && ใบHQของฟอร์ม.validUntil < วันหมดอายุตามสาขา ? ใบHQของฟอร์ม.validUntil : วันหมดอายุตามสาขา;

  // รับได้ทั้งข้อความและติ๊กถูก (ช่องภาษีเป็น boolean — เพิ่ม 28 ส.ค. 69)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(p => ({ ...p, [k]: v }));

  // ใบเสนอราคาที่เกี่ยวข้อง — ลูกค้า: ผูกด้วย customerId · ลูกค้าเป้าหมาย: ผูกด้วย dealId (legacy ใช้ customerId/ชื่อบริษัท)
  const related = quotations
    .filter(q => subj.kind === "customer"
      ? q.customerId === subj.customerId
      : (q.dealId === subj.dealId || (q.dealId == null && ((subj.customerId && q.customerId === subj.customerId) || q.customer === subj.company))))
    .sort((a, b) => b.date.localeCompare(a.date));

  // มูลค่างาน (ก่อน VAT) = ผลรวมรายการสินค้า — ระบบไม่มีส่วนลดแล้ว
  function netTotal(f: FormState) { return parseBaht(f.price); }

  // ── หนึ่งดีล = ใบเสนอราคาใบเดียว (บอสสั่ง 20 ส.ค. 69) ─────────────────────────
  //
  // เดิมกด "สร้างใบเสนอราคา" ทีไรก็ได้ใบใหม่ทุกครั้ง ลูกค้ารายเดียวเลยมีใบ 2-3 ฉบับ
  //   ทั้งที่เป็นงานเดียวกัน แค่เพิ่มรายการสินค้าเข้าไป
  // ตอนนี้ถ้ามีใบที่ยังแก้ได้อยู่แล้ว = พาไปเพิ่มรายการในใบนั้น ไม่ออกใบใหม่
  //
  // ⚠️ ใบที่ปิดไปแล้ว (ตอบรับ/ปฏิเสธ/หมดอายุ) ห้ามแก้ — เป็นบันทึกของการขายที่จบแล้ว
  //    ยอดขายและยอดสะสมของลูกค้าอ้างอิงใบพวกนี้อยู่ · ถ้าลูกค้าซื้อรอบใหม่ก็ต้องเป็นใบใหม่จริง ๆ
  //   ระบบจริง: นับเฉพาะใบที่ทำจากใบ HQ เวอร์ชันปัจจุบัน — ใบเดิมที่ไม่มีใบ HQ ไม่ใช่ที่ "เพิ่มรายการ" ได้อีก
  //   ใบที่ส่งให้ลูกค้าแล้ว ล็อกทั้งใบ (รอบ 3 · บอสสั่ง 20 ต.ค. 69 · กันที่ฐาน ใบ 0226) — เพิ่มรายการได้เฉพาะใบร่าง
  const ใบที่ยังแก้ได้ = related.find(q => q.status === "draft" && ใบHQ != null && q.hqQuoteId === ใบHQ.id);
  const ใบที่ส่งแล้วของใบHQนี้ = related.find(q => q.status === "sent_to_client" && ใบHQ != null && q.hqQuoteId === ใบHQ.id);
  // ใบเดิม (ไม่มีใบ HQ) = ดูได้อย่างเดียว · แท็บของลูกค้า = ดูอย่างเดียวทั้งหมด
  // ใบที่ลูกค้าตอบรับแล้ว = ยอดขายที่ปิดแล้ว: ไม่มีแก้ไข / ลบ / ทำสำเนา (บอสตัดสิน 19 ต.ค. 69)
  //   ทำสำเนาใบ won ไม่ได้ใบร่างใหม่จริง — ใบ HQ ของใบนั้นเป็น "สั่งผลิต" แล้ว ฐานปฏิเสธ (hq_quote_required) · ข้อทดสอบ flow-a-safety.spec.ts
  const แก้ได้ = (q: QuotationMock) => !readOnly && !!q.hqQuoteId && q.status !== "won" && q.status !== "superseded";
  // ลบได้เฉพาะใบร่าง (บอสสั่ง 21 ต.ค. 69 · ฐานกัน 0228) · ใบที่ส่งแล้ว ลูกค้าต่อรอง → ทำฉบับใหม่ (ใบร่าง V2 จากใบเดิม)
  const ลบได้ = (q: QuotationMock) => แก้ได้(q) && q.status === "draft";
  const ทำฉบับใหม่ได้ = (q: QuotationMock) => แก้ได้(q) && q.status === "sent_to_client";
  async function ทำฉบับใหม่(q: QuotationMock) {
    try {
      const ใหม่ = await newQuotationVersion(q);
      openEdit(ใหม่);
      onToast?.(`ทำฉบับใหม่ ${ใหม่.id} (${ใหม่.revision ?? ""}) แล้ว — แก้ % แล้วส่งให้ลูกค้า ใบเดิมจะเป็น "ถูกแทนที่"`);
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : String(e));
    }
  }
  // แก้เนื้อหาใบ (ลูกค้า โครงการ จังหวัด พื้นที่ %) ได้เฉพาะใบร่าง — ส่งแล้วเปลี่ยนสถานะ/ส่งอีกครั้งได้ แต่แก้ไม่ได้
  const แก้เนื้อหาได้ = (q: QuotationMock) => แก้ได้(q) && q.status === "draft";
  function openCreate() {
    if (ใบที่ยังแก้ได้) {
      openEdit(ใบที่ยังแก้ได้);
      onToast?.(`เพิ่มรายการในใบ ${ใบที่ยังแก้ได้.id} ที่มีอยู่แล้ว — ไม่ออกใบใหม่`);
      return;
    }
    if (ใบที่ส่งแล้วของใบHQนี้) {
      onToast?.(`ใบ ${ใบที่ส่งแล้วของใบHQนี้.id} ส่งให้ลูกค้าแล้ว แก้ทับไม่ได้ — ลูกค้าต่อรองให้กด "ทำฉบับใหม่" ที่ใบนั้น`);
      return;
    }
    if (!REAL_BACKEND) { onToast?.("ข้อมูลตัวอย่างไม่มีขั้นขอราคาจากสำนักงานใหญ่ — ออกใบเสนอราคาได้ในระบบจริงเท่านั้น"); return; }
    if (!ใบHQ) {
      onToast?.(รอใบHQ ? "กำลังโหลดใบ HQ…" : "ต้องได้ราคาจากสำนักงานใหญ่ก่อน — ส่งคำขอที่แผง “ราคาจากสำนักงานใหญ่” ด้านบน");
      return;
    }
    const f = emptyForm();
    {
      const li = รายการจากใบHQ(ใบHQ);
      f.lineItems = li; f.items = String(li.length);
      f.price = String(li.reduce((s, it) => s + it.qty * it.unitPrice, 0));
    }
    setEditing(null); setForm(f); setMode("create");
  }

  // หน้าแม่สั่งให้เปิดฟอร์มออกใบ (ลากลูกค้าเป้าหมายไปขั้นเสนอราคา / กดติ๊กงาน "จัดทำใบเสนอราคา")
  // 0 = ไม่ได้สั่ง · >0 = สั่ง — ต้องเทียบกับ 0 เสมอ ไม่ใช่ค่าตอน mount:
  //   ลูกค้าเป้าหมายที่ยังไม่เคยเปิดแผงจะ mount แผงนี้ "พร้อมกับ" คำสั่ง ถ้าจำค่าตอน mount ไว้จะไม่มีอะไรเกิดขึ้นเลย
  //   (หน้าแม่รีเซ็ตกลับเป็น 0 ทุกครั้งที่เปิด/ปิดแผงตามปกติ จึงไม่เด้งฟอร์มใส่หน้าโดยไม่ได้สั่ง)
  //   ⚠️ คำสั่งที่มาตอนใบ HQ ยังโหลดไม่เสร็จ ต้องรอให้โหลดเสร็จก่อนค่อยเปิด (รอบเต็ม 19 ต.ค. 69):
  //   แผงนี้โหลดพร้อมกล่อง "ขั้นต่อไป" — กล่องนั้นเสร็จก่อนแล้วดีลเลอร์กด "ทำใบให้ลูกค้า" ทันที
  //   เดิมใช้คำสั่งไปตอนนั้นเลย → ขึ้น "กำลังโหลดใบ HQ…" แล้วคำสั่งหาย ฟอร์มไม่เปิด
  const lastSignal = useRef(0);
  useEffect(() => {
    if (!openCreateSignal || openCreateSignal === lastSignal.current || รอใบHQ) return;
    lastSignal.current = openCreateSignal;
    if (readOnly) return;
    openCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCreateSignal, รอใบHQ]);
  function openEdit(q: QuotationMock) {
    if (!แก้เนื้อหาได้(q)) return;   // ใบที่ส่งแล้วล็อก (ฐานปฏิเสธอยู่แล้ว · ใบ 0226) — ไม่เปิดฟอร์มให้แก้เสียเปล่า
    setEditing(q);
    setใบHQของใบที่แก้(null);
    if (REAL_BACKEND && q.hqQuoteId) {
      quoteRequestsRepo.hqQuoteById(q.hqQuoteId).then(setใบHQของใบที่แก้).catch(e => logRepoRead("quoteRequests.hqQuoteById", e));
    }
    const lineItems: QuoteLineItem[] = boqLineItems(q);
    setForm({ project: q.project, items: String(lineItems.length),
      price: String(q.materialCost || q.totalValue), expiry: q.expiry ?? "", note: q.note ?? "", lineItems,
      // อัตราที่ตรึงไว้กับใบเป็นตัวจริงเสมอ — ใบเก่าที่ไม่มีค่า ให้ตกไปใช้ค่าที่สาขาตั้งไว้
      vatOn: (q.vatPercent ?? dealerVat ?? 0) > 0, vatPct: String(q.vatPercent ?? dealerVat ?? 7),
      whtOn: (q.whtRate ?? 0) > 0, whtPct: String(q.whtRate ?? dealerWht ?? 3) });
    setMode("edit");
  }

  async function save() {
    if (savingRef.current) return; // กันกดซ้ำระหว่างรอเลขที่ใบจาก DB (H8)
    savingRef.current = true; setSaving(true);
    try {
    const net = netTotal(form);
    // สแนปช็อตภาษี ณ วันที่ออก/แก้เอกสาร — ตรึงติดใบไว้ ไม่คำนวณใหม่ทีหลัง (บอสสั่ง 28 ส.ค. 69)
    const ภาษีที่บันทึก = ช่องภาษีสำหรับบันทึก(net, {
      vatPercent: form.vatOn ? Number(form.vatPct) : 0,
      whtPercent: form.whtOn ? Number(form.whtPct) : 0,
    });
    if (mode === "edit" && editing) {
      // ── ใบที่ส่งให้ลูกค้าไปแล้ว แก้เนื้อหาทีไร = ขึ้นฉบับใหม่ V1 → V2 → V3 (บอสสั่ง 21 ส.ค. 69) ──
      //   กติกาตัวจริงอยู่ที่ SalesContext.updateQuotation ที่เดียว (ดู lib/quoteRevision.ts)
      //   ที่นี่แค่ "ถามล่วงหน้า" ว่าจะขึ้นฉบับใหม่ไหม เพื่อเลือกข้อความแจ้งผู้ใช้ให้ตรง
      // ⚠️ ต้องเทียบกับ "ใบล่าสุดในระบบ" ไม่ใช่สำเนาที่ค้างอยู่ในฟอร์ม (แก้ 27 ส.ค. 69)
      //    ผู้ใช้กดส่งใบ แล้วกดแก้ไขต่อทันที — สำเนาในฟอร์มอาจยังเป็น "ร่าง" อยู่
      const ใบล่าสุด = quotations.find(q => q.id === editing.id) ?? editing;
      const ใบหลังแก้ = { ...ใบล่าสุด, project: form.project, items: form.lineItems.length,
        lineItems: form.lineItems, materialCost: parseBaht(form.price), totalValue: net, total: "฿" + net.toLocaleString("th-TH"),
        expiry: วันหมดอายุ, note: form.note || undefined, ...ภาษีที่บันทึก };
      const เวอร์ชันใหม่ = ฉบับถัดไป(ใบล่าสุด, ใบหลังแก้);
      const ขึ้นเวอร์ชัน = จะขึ้นฉบับใหม่(ใบล่าสุด, ใบหลังแก้);
      updateQuotation(ใบหลังแก้);
      onToast?.(ขึ้นเวอร์ชัน
        ? `บันทึกเป็นฉบับแก้ไข ${เวอร์ชันใหม่} แล้ว — ส่งให้ลูกค้าอีกครั้งเพื่อให้ได้ฉบับล่าสุด`
        : "บันทึกใบเสนอราคาแล้ว");
    } else {
      // สร้างใหม่ — ออกเลข + insert แบบ atomic (H8) · ออกใบในนาม subject (ลูกค้าเป้าหมาย/ลูกค้า)
      await createQuotation({
        customer: subj.company, project: form.project || defProject(),
        total: "฿" + net.toLocaleString("th-TH"), totalValue: net, materialCost: parseBaht(form.price),
        // พื้นที่ = จำนวนของรายการ BOQ ที่คิดเป็น ตร.ม. (เดิม hardcode 0 → พื้นที่หายไปจากใบ)
        province: subj.province, buildingType: "", // ใบใหม่ไม่มีประเภทอาคาร (แม่แบบ) — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
        area: form.lineItems.filter(it => it.unit === "ตร.ม.").reduce((s, it) => s + it.qty, 0),
        status: "draft", date: MOCK_TODAY, items: form.lineItems.length, lineItems: form.lineItems,
        customerId: subj.customerId ?? 0, projectId: 0, dealId: subj.dealId, revision: "V1", expiry: วันหมดอายุ,
        note: form.note || undefined,
        // สแนปช็อตภาษีตอนสร้างใบ — พิมพ์ซ้ำทีหลังใช้ค่านี้เสมอ (ไม่ใช้อัตราที่แก้ทีหลัง)
        ...ภาษีที่บันทึก,
        // ทำจากใบ HQ (ด่าน 3) — ฐานข้อมูลคิดราคาจาก % ของแต่ละบรรทัดและบังคับอายุใบไม่เกินใบ HQ
        ...(ใบHQของฟอร์ม ? { hqQuoteId: ใบHQของฟอร์ม.id, markupPercent: null } : {}),
      });
      onToast?.("สร้างใบเสนอราคาเรียบร้อย");
    }
    setMode("list");
    } finally { savingRef.current = false; setSaving(false); }
  }

  async function duplicate(q: QuotationMock) {
    if (savingRef.current) return; // กันกดซ้ำระหว่างรอเลขที่ใบจาก DB (H8)
    savingRef.current = true; setSaving(true);
    try {
      // ทำสำเนา = ออกใบใหม่แบบ atomic (ไม่พก id เดิม — DB ออกเลขใหม่ให้)
      const { id: _drop, supersedesId: _ฉบับเดิม, ...rest } = q;   // สำเนา = ใบใหม่ฉบับแรก ไม่ผูกฉบับเดิม
      await createQuotation({ ...rest, status: "draft", revision: "V1", date: MOCK_TODAY });
      onToast?.("ทำสำเนาใบเสนอราคาแล้ว");
    } finally { savingRef.current = false; setSaving(false); }
  }

  // กดส่ง = ส่งเลย (เดิมถาม "แนบแม่แบบไปด้วยไหม" — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69)
  function sendQuote(q: QuotationMock) {
    const resend = q.status !== "draft";
    updateQuotation({ ...q, status: "sent_to_client", date: MOCK_TODAY });
    onToast?.(`ส่งใบเสนอราคา ${q.id} ${resend ? "ให้ลูกค้าอีกครั้งแล้ว" : "ให้ลูกค้าแล้ว"}`);
  }

  const lbl: React.CSSProperties = { display: "block", fontSize: "0.65rem", fontWeight: 700, color: "#6b7280", marginBottom: 4 };
  const inp: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid #e6eaf0", fontSize: "0.82rem", fontFamily: "inherit", color: "#2D2D2D", background: "#fff", boxSizing: "border-box" };

  // ── ฟอร์มสร้าง/แก้ไข (inline · รีสไตล์ให้เข้ากับ wizard ใหม่) ──
  if (mode === "create" || mode === "edit") {
    const secLabel: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: "0.62rem", fontWeight: 800, color: "#8a929c", textTransform: "uppercase", letterSpacing: "0.05em", margin: "16px 0 10px" };
    const net = parseBaht(form.price);                 // มูลค่างาน (ก่อน VAT) = ยอดที่บันทึก
    // กันออกใบเปล่า (H-audit): ไม่มีรายการ BOQ เลย = ไม่ให้กดสร้าง/บันทึก — เดิมกดผ่านได้
    // ได้ใบ ฿0 ไม่มีรายการ ซึ่งแก้ทีหลังไม่ได้เลยเพราะโหมดแก้ไขใช้ editor ตัวเดียวกันนี้
    // (เสียเลขที่เอกสารจริงถาวร ไม่มีทางเพิ่มรายการย้อนหลังผ่านหน้าจอ)
    //
    // "มีแถว" อย่างเดียวไม่พอ — แถวที่จำนวนหรือราคาเป็น 0 ก็ยังได้ใบ ฿0 อยู่ดี (พบ 6 ส.ค. 69)
    // ใบ ฿0 ส่งให้ลูกค้าไม่ได้จริง แต่ไปนับรวมใน "จำนวนใบเสนอราคา" ของสาขา และถ้าเผลอปิดการขาย
    // จะได้ลูกค้าที่มียอดสะสม 0 ปนอยู่ในฐาน — ต้องมียอดจริงก่อนถึงจะออกใบได้
    const hasItems = form.lineItems.length > 0;
    const hasAmount = net > 0;
    const canSave = hasItems && hasAmount && !(editing?.hqQuoteId && !ใบHQของฟอร์ม);

    // ── ภาษีของใบนี้ — คิดสดตามที่ติ๊กไว้ในฟอร์ม (บอสสั่ง 28 ส.ค. 69) ─────────────
    //   สูตรอยู่ที่ lib/quoteTax.ts ที่เดียว ใช้ร่วมกับเอกสารที่พิมพ์และค่าที่บันทึกลงฐานข้อมูล
    //   ⚠️ ไม่แตะ net (มูลค่างานก่อน VAT = ผลรวม BOQ) ซึ่งเป็นยอดขายที่รายงาน/เป้าใช้อยู่
    const ภาษี = คิดภาษีใบเสนอราคา(net, {
      vatPercent: form.vatOn ? Number(form.vatPct) : 0,
      whtPercent: form.whtOn ? Number(form.whtPct) : 0,
    });
    return (
      <div>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <button onClick={() => setMode("list")} className="btn btn-secondary btn-sm" style={{ color: "#374151", padding: "5px 10px" }}><ArrowLeft size={13} /> กลับ</button>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 26, height: 26, borderRadius: 8, background: "#eef4fb", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><FileText size={14} color="#003366" /></span>
            <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#003366" }}>{mode === "edit" ? `แก้ไข ${editing?.id}` : "สร้างใบเสนอราคาใหม่"}</div>
          </div>
        </div>

        {/* ── เตือนเมื่อสาขายังไม่ได้กรอกข้อมูลบริษัทของตัวเอง (11 ส.ค. 69) ──────────────
            หัวกระดาษของใบเสนอราคามาจากข้อมูลบริษัทของสาขาเท่านั้น — ไม่มีค่าเริ่มต้นให้ยืมใช้แล้ว
            (เดิมเคยยืมข้อมูลของสาขาอื่นมาแสดง ซึ่งเป็นบั๊กที่แก้ไปแล้ว)
            ถ้ายังไม่กรอก เอกสารที่ส่งถึงลูกค้าจะไม่มีชื่อบริษัท ที่อยู่ เลขผู้เสียภาษี และช่องลงนามผู้เสนอราคาว่างเปล่า
            เตือนตรงนี้เพราะเป็นจังหวะที่ยังแก้ทัน — ไม่ได้ห้ามออกใบ (บางสาขาอาจตั้งใจร่างไว้ก่อน) */}
        {dealerCfg.loaded && !dealerCfg.settings.issuer?.company?.trim() && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 9, background: "#fff8e6", border: "1px solid #f5d78e",
            borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: "0.74rem", color: "#7a5b12", lineHeight: 1.55 }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <b>ยังไม่ได้กรอกข้อมูลบริษัทของสาขา</b> — ใบที่ออกจะไม่มีชื่อบริษัท ที่อยู่ และเลขประจำตัวผู้เสียภาษีบนหัวกระดาษ
              {" "}<a href="/settings" style={{ color: "#003366", fontWeight: 700, textDecoration: "underline" }}>ไปกรอกที่ตั้งค่า › บัญชีดีลเลอร์</a>
            </div>
          </div>
        )}

        {/* ข้อมูลจาก subject — เติมอัตโนมัติ (อ่านอย่างเดียว) */}
        <div style={{ background: "#f7f9fc", border: "1px solid #eef1f5", borderRadius: 12, padding: "11px 13px", fontSize: "0.72rem", color: "#475569", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 14px" }}>
          <div><b style={{ color: "#8a929c", fontWeight: 700 }}>ลูกค้า:</b> {subj.contact}</div><div><b style={{ color: "#8a929c", fontWeight: 700 }}>บริษัท:</b> {subj.company}</div>
          <div><b style={{ color: "#8a929c", fontWeight: 700 }}>โทร:</b> {subj.phone || "—"}</div><div><b style={{ color: "#8a929c", fontWeight: 700 }}>อีเมล:</b> {subj.email || "—"}</div>
          <div><b style={{ color: "#8a929c", fontWeight: 700 }}>จังหวัด:</b> {subj.province}</div><div><b style={{ color: "#8a929c", fontWeight: 700 }}>ผู้รับผิดชอบ:</b> {subj.assigned}</div>
        </div>

        {/* รายการใบเสนอราคา — ชื่อเอกสาร + รายการจากใบ HQ (แก้ได้เฉพาะ % ที่บวก) */}
        <div style={secLabel}><FileText size={12} color="#003366" /> รายการใบเสนอราคา</div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>ชื่อโครงการ / เอกสาร</label>
          <input value={form.project} onChange={e => set("project", e.target.value)} readOnly={ฉบับใหม่} style={ฉบับใหม่ ? { ...inp, background: "#f6f8fa", color: "#6b7280" } : inp} placeholder="เช่น โกดังเก็บสินค้าเกษตร — บจ. ..." />
          {ฉบับใหม่ && <div data-version-copied style={{ fontSize: "0.68rem", color: "#6b7280", marginTop: 4 }}>ฉบับใหม่: ลูกค้า โครงการ จังหวัด พื้นที่ และภาษี คัดลอกจากใบเดิม แก้ไม่ได้ — แก้ได้เฉพาะ % ที่บวก</div>}
        </div>
        {ใบHQของฟอร์ม ? (
          <>
            <div style={{ fontSize: "0.72rem", color: "#6b21a8", marginBottom: 6 }}>
              ทำจากใบ HQ {ใบHQของฟอร์ม.quoteNo} · ยืนราคาถึง {ใบHQของฟอร์ม.validUntil ? วันไทยสั้น(ใบHQของฟอร์ม.validUntil) : "—"} — อายุใบนี้ไม่เกินวันนี้
            </div>
            <HqMarkupEditor hqLines={ใบHQของฟอร์ม.lineItems} items={form.lineItems}
              readOnly={editing?.status === "won"}
              onChange={li => setForm(p => ({ ...p, lineItems: li, items: String(li.length),
                price: String(Math.round(li.reduce((s, it) => s + it.qty * it.unitPrice, 0) * 100) / 100) }))} />
          </>
        ) : editing?.hqQuoteId ? (
          <div style={{ color: "#9ca3af", fontSize: "0.78rem", padding: 12 }}>กำลังโหลดใบ HQ…</div>
        ) : null}

        {/* ── วันหมดอายุ: ระบบกำหนดให้เอง ไม่ต้องกรอก (บอสสั่ง 20 ส.ค. 69) ──────────
            อายุใบเป็นนโยบายของสำนักงานใหญ่อยู่แล้ว (ตั้งที่ ตั้งค่า › ใบเสนอราคา)
            ให้ดีลเลอร์พิมพ์เองซ้ำ = พิมพ์ผิดได้ และไม่ตรงกับนโยบายที่ประกาศไว้
            นับจากวันที่ออกใบเสมอ · ใบเก่าที่เคยระบุวันไว้เองยังคงวันเดิม ไม่ถูกเขียนทับ */}
        <div style={{ marginTop: 14 }}>
          <label style={lbl}><Calendar size={11} style={{ verticalAlign: "-1px" }} /> วันหมดอายุ</label>
          <div style={{ ...inp, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: "#f7f9fc", color: "#374151" }}>
            <span style={{ fontWeight: 700 }}>{fmtISOToThai(วันหมดอายุ)}</span>
            <span style={{ fontSize: "0.68rem", color: "#8a929c" }}>
              {mode === "edit" && editing?.expiry ? "ตามที่ระบุไว้ในใบนี้" : `อายุใบ ${validityDays} วันนับจากวันที่ออกใบ`}
            </span>
          </div>
        </div>

        {/* หมายเหตุ */}
        <div style={{ marginTop: 12 }}><label style={lbl}>หมายเหตุ</label>
          <textarea value={form.note} onChange={e => set("note", e.target.value)} rows={2} placeholder="รายละเอียดเพิ่มเติม…" style={{ ...inp, resize: "vertical", lineHeight: 1.6 }} /></div>

        {/* ── ภาษีของใบนี้ + ยอดสรุปสด (บอสสั่ง 28 ส.ค. 69) ────────────────────────
             ติ๊กเปิด/ปิดได้ทั้ง VAT และหัก ณ ที่จ่าย · แก้อัตราเองได้ · ตัวเลขขยับทันที
             ⚠️ "มูลค่างาน (ก่อน VAT)" คือยอดที่บันทึกเป็นยอดขาย — ภาษีไม่ไปแตะตัวนี้ */}
        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {([
            { on: "vatOn", pct: "vatPct", ป้าย: "ภาษีมูลค่าเพิ่ม (VAT)", ท้าย: "คิดจากมูลค่างาน" },
            { on: "whtOn", pct: "whtPct", ป้าย: "ภาษีหัก ณ ที่จ่าย", ท้าย: "คิดจากมูลค่างานก่อน VAT" },
          ] as const).map(t => {
            const เปิด = form[t.on] as boolean;
            return (
              <label key={t.on} style={{ flex: "1 1 240px", display: "flex", alignItems: "center", gap: 9, padding: "10px 12px",
                border: `1px solid ${เปิด ? "#003366" : "#e5e7eb"}`, borderRadius: 10, background: เปิด ? "#f4f8fc" : "#fff", cursor: "pointer" }}>
                <input type="checkbox" checked={เปิด} disabled={ฉบับใหม่} onChange={e => set(t.on, e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#2D2D2D" }}>{t.ป้าย}</span>
                  <span style={{ display: "block", fontSize: "0.62rem", color: "#8a929c" }}>{t.ท้าย}</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <input type="text" inputMode="decimal" aria-label={`อัตรา${t.ป้าย}`} disabled={!เปิด || ฉบับใหม่}
                    value={form[t.pct] as string}
                    onChange={e => set(t.pct, e.target.value.replace(/[^0-9.]/g, ""))}
                    onClick={e => e.stopPropagation()}
                    style={{ width: 52, textAlign: "right", padding: "5px 7px", borderRadius: 8, border: "1px solid #e5e7eb",
                      fontFamily: "inherit", fontSize: "0.8rem", fontWeight: 700, color: เปิด ? "#2D2D2D" : "#b7bec7", background: เปิด ? "#fff" : "#f8fafc" }} />
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#8a929c" }}>%</span>
                </span>
              </label>
            );
          })}
        </div>

        {/* ── ยอดเงิน — ทุกบรรทัดตรงกับเอกสารที่พิมพ์ ────────────────────────────
             จัดเป็นตาราง 3 คอลัมน์: ป้าย | เครื่องหมาย | จำนวนเงิน
             เครื่องหมาย +/− อยู่คนละช่องกับตัวเลข และใช้ตัวเลขความกว้างเท่ากัน (tabular-nums)
             หลักหน่วย-สิบ-ร้อยจึงตรงกันทุกแถว — ไม่งั้นบรรทัดที่มี + หรือ − จะเยื้องออกไป
             (ผู้ใช้แจ้ง 28 ส.ค. 69 ว่า "เรียงมั่ว" — สาเหตุคือเครื่องหมายไปเบียดตัวเลข) */}
        <div style={{ marginTop: 12, background: "#003366", borderRadius: 12, padding: "14px 16px", color: "#fff" }}>
          {(() => {
            const เงิน = (v: number) => fmtFull(v);
            const แถว = (ป้าย: React.ReactNode, ค่า: string, o?: { sign?: "+" | "−"; เด่น?: boolean; จาง?: boolean; สี?: string }) => (
              <>
                <span style={{ fontSize: o?.เด่น ? "0.78rem" : "0.72rem", fontWeight: o?.เด่น ? 800 : 600,
                  color: o?.สี ?? (o?.จาง ? "rgba(255,255,255,.7)" : "#fff"), whiteSpace: "nowrap" }}>{ป้าย}</span>
                <span style={{ textAlign: "right", fontSize: o?.เด่น ? "0.78rem" : "0.72rem", fontWeight: 700,
                  color: o?.สี ?? "rgba(255,255,255,.75)" }}>{o?.sign ?? ""}</span>
                <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums",
                  fontSize: o?.เด่น ? "1.05rem" : "0.8rem", fontWeight: o?.เด่น ? 800 : 700,
                  color: o?.สี ?? "#fff" }}>{ค่า}</span>
              </>
            );
            const เส้น = (หนา?: boolean) => (
              <span style={{ gridColumn: "1 / -1", height: 1, background: `rgba(255,255,255,${หนา ? ".28" : ".15"})`, margin: หนา ? "7px 0 3px" : "5px 0" }} />
            );
            return (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 12px auto", alignItems: "baseline", columnGap: 6, rowGap: 5 }}>
                {แถว(<span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Coins size={12} /> มูลค่างาน (ก่อน VAT)</span>, เงิน(ภาษี.subtotal), { เด่น: true })}
                <span style={{ gridColumn: "1 / -1", fontSize: "0.58rem", color: "rgba(255,255,255,.55)", marginTop: -2 }}>
                  = ยอดที่บันทึกเป็นยอดขาย (ภาษีไม่กระทบตัวนี้)
                </span>
                {เส้น()}
                {form.vatOn && แถว(`ภาษีมูลค่าเพิ่ม ${ภาษี.vatRate}%`, เงิน(ภาษี.vatAmount), { sign: "+", จาง: true })}
                {แถว("รวมเป็นเงิน", เงิน(ภาษี.totalAmount))}
                {form.whtOn && แถว(`หัก ณ ที่จ่าย ${ภาษี.whtRate}%`, เงิน(ภาษี.whtAmount), { sign: "−", สี: "#ffd7d7" })}
                {เส้น(true)}
                {แถว("ยอดชำระสุทธิ", เงิน(ภาษี.netPayable), { เด่น: true })}
              </div>
            );
          })()}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 16 }}>
          {!canSave && (
            <div style={{ marginRight: "auto", color: "#dc2626", fontSize: "0.72rem", fontWeight: 600 }}>
              {ใบHQของฟอร์ม || editing?.hqQuoteId
                ? "กำลังโหลดใบ HQ — รอสักครู่"
                : !hasItems
                    ? "ต้องมีรายการสินค้าอย่างน้อย 1 รายการก่อนบันทึก"
                    : "ยอดรวมเป็น ฿0 — ระบุจำนวนและราคาต่อหน่วยก่อนออกใบ"}
            </div>
          )}
          <button onClick={() => setMode("list")} className="btn btn-secondary btn-sm" style={{ color: "#374151" }}>ยกเลิก</button>
          <button onClick={save} disabled={saving || !canSave} className="btn btn-primary btn-sm" style={(saving || !canSave) ? { opacity: .6, cursor: "not-allowed" } : undefined}><FilePlus size={13} /> {mode === "edit" ? "บันทึก" : "สร้างใบเสนอราคา"}</button>
        </div>
      </div>
    );
  }

  // ── มุมมองอ่านอย่างเดียว (View) — เลย์เอาต์เดียวกับฟอร์ม แต่อ่านอย่างเดียว (มีตาราง BOQ) ──
  if (mode === "view" && editing) {
    const q = editing; const c = quotationStatusColor[q.status];
    const lis = boqLineItems(q);
    const subtotal = lis.reduce((s, it) => s + it.qty * it.unitPrice, 0) || q.materialCost || q.totalValue;
    const th: React.CSSProperties = { textAlign: "left", fontSize: "0.65rem", fontWeight: 700, color: "#6b7280", padding: "8px 10px", background: "#f7f9fc", whiteSpace: "nowrap" };
    const td: React.CSSProperties = { fontSize: "0.78rem", color: "#2D2D2D", padding: "9px 10px", borderTop: "1px solid #eef0f4" };
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <button onClick={() => setMode("list")} className="btn btn-secondary btn-sm" style={{ color: "#374151", padding: "5px 10px" }}><ArrowLeft size={13} /> กลับ</button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#003366" }}>{q.id}</div>
            <span className="badge" style={{ background: "#eef3f8", color: "#003366", fontSize: "0.65rem", fontWeight: 800 }}
                        title="ฉบับที่เท่าไรของใบนี้ — แก้ใบที่ส่งไปแล้วจะขึ้นฉบับใหม่">{q.revision ?? "V1"}</span>
          </div>
          <span className="badge" style={{ background: c.bg, color: c.text, marginLeft: "auto" }}>{quotationStatusLabel[q.status]}</span>
        </div>

        {/* ข้อมูลลูกค้า/ผู้ติดต่อ */}
        <div style={{ background: "#f0f4fa", border: "1px solid #dce5f0", borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontSize: "0.72rem", color: "#475569", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 14px" }}>
          <div><b>ลูกค้า:</b> {subj.contact}</div><div><b>บริษัท:</b> {q.customer || subj.company}</div>
          <div><b>โทร:</b> {subj.phone || "—"}</div><div><b>อีเมล:</b> {subj.email || "—"}</div>
          <div><b>จังหวัด:</b> {q.province || subj.province}</div><div><b>ผู้รับผิดชอบ:</b> {subj.assigned}</div>
        </div>

        {/* ชื่อโครงการ/เอกสาร (อ่านอย่างเดียว) — แม่แบบแสดงเป็นแท็กเล็กใต้ชื่อ (มาจากรายการ BOQ) */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>ชื่อโครงการ / เอกสาร</div>
          <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#2D2D2D" }}>{q.project}</div>
          {q.buildingType && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6, padding: "2px 9px", borderRadius: 999, background: "#eef4fb", color: "#003366", fontSize: "0.66rem", fontWeight: 700 }}>
              <FileText size={10} /> {q.buildingType}
            </span>
          )}
        </div>

        {/* ตารางรายการสินค้า (BOQ) — อ่านอย่างเดียว */}
        <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "#6b7280", marginBottom: 6 }}>รายการสินค้า (BOQ)</div>
        <div style={{ border: "1px solid #eef0f4", borderRadius: 10, overflow: "hidden", marginBottom: 4 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={th}>รายการ</th><th style={{ ...th, textAlign: "right" }}>จำนวน</th>
              <th style={th}>หน่วย</th><th style={{ ...th, textAlign: "right" }}>ราคา/หน่วย</th>
              <th style={{ ...th, textAlign: "right" }}>รวม</th>
            </tr></thead>
            <tbody>
              {lis.length === 0 ? (
                <tr><td style={{ ...td, textAlign: "center", color: "#9aa2ad" }} colSpan={5}>ไม่มีรายการ</td></tr>
              ) : lis.map((it, i) => (
                <tr key={i}>
                  <td style={{ ...td, fontWeight: 600 }}>{it.name}</td>
                  <td style={{ ...td, textAlign: "right" }}>{it.qty.toLocaleString("th-TH")}</td>
                  <td style={td}>{it.unit}</td>
                  <td style={{ ...td, textAlign: "right" }}>{it.unitPrice.toLocaleString("th-TH")}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#003366" }}>{fmtFull(it.qty * it.unitPrice)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...td, background: "#f7f9fc", fontWeight: 700 }} colSpan={4}>{lis.length} รายการ · รวมก่อน VAT</td>
                <td style={{ ...td, background: "#f7f9fc", textAlign: "right", fontWeight: 800, color: "#003366" }}>{fmtFull(subtotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* วันหมดอายุ / ยอดสุทธิ / หมายเหตุ */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
          <div><div style={{ fontSize: "0.65rem", fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>วันหมดอายุ</div>
            <div style={{ fontSize: "0.85rem", color: "#2D2D2D" }}>{q.expiry || "—"}</div></div>
          <div style={{ gridColumn: "1/-1" }}><div style={{ fontSize: "0.65rem", fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>ยอดสุทธิ</div>
            <div style={{ fontSize: "1rem", fontWeight: 800, color: "#003366" }}>{fmtBaht(q.totalValue)}</div></div>
          {q.note && (<div style={{ gridColumn: "1/-1" }}><div style={{ fontSize: "0.65rem", fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>หมายเหตุ</div>
            <div style={{ fontSize: "0.82rem", color: "#2D2D2D", lineHeight: 1.6 }}>{q.note}</div></div>)}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button onClick={() => printQuotation(q, { company: subj.company, name: subj.contact, phone: subj.phone, province: subj.province }, q.vatPercent ?? dealerVat, printCfg)} className="btn btn-secondary btn-sm" style={{ color: "#374151" }}><Printer size={13} /> พิมพ์ PDF</button>
          {แก้เนื้อหาได้(q) && <button onClick={() => openEdit(q)} className="btn btn-secondary btn-sm" style={{ color: "#374151" }}><Pencil size={13} /> แก้ไข</button>}
          {ทำฉบับใหม่ได้(q) && <button onClick={() => void ทำฉบับใหม่(q)} className="btn btn-secondary btn-sm" style={{ color: "#374151" }}><CopyPlus size={13} /> ทำฉบับใหม่</button>}
          {แก้ได้(q) && (q.status === "draft" || q.status === "sent_to_client") && (
            <button onClick={() => { sendQuote(q); setMode("list"); }} className="btn btn-primary btn-sm">
              <Send size={13} /> {q.status === "draft" ? "ส่งใบเสนอราคา" : "ส่งอีกครั้ง"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── รายการ (list) + ปุ่มสร้าง inline ──
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: "0.72rem", color: "#6b7280", fontWeight: 700 }}>ใบเสนอราคา · {related.length} ฉบับ{readOnly && " · ดูอย่างเดียว"}</div>
        {/* มีใบที่ยังแก้ได้ = ปุ่มนี้พาไปเพิ่มรายการในใบเดิม ไม่ออกใบใหม่ — ป้ายต้องบอกตรง ๆ
            ไม่งั้นกดคำว่า "สร้าง" แล้วได้หน้าแก้ไขใบเก่า ผู้ใช้จะงงว่ากดผิดหรือระบบพัง */}
        {/* ปุ่มทำใบอยู่ที่แถบ "ขั้นต่อไป" ที่เดียว (บอสสั่ง 19 ต.ค. 69) — แท็บนี้เหลือรายการใบอย่างเดียว */}
      </div>

      {related.length === 0 ? (
        <div style={{ textAlign: "center", padding: "28px 0", color: "#9aa2ad", fontSize: "0.8rem" }}>ยังไม่มีใบเสนอราคา{!readOnly && (REAL_BACKEND
          ? (ใบHQ ? " — กด “ทำใบให้ลูกค้า” ที่แถบขั้นต่อไปด้านบน" : " — ต้องได้ราคาจากสำนักงานใหญ่ก่อน (ส่งคำขอที่แผงด้านบน)")
          : " — กด “สร้างใบเสนอราคา” เพื่อเริ่ม")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {related.map(q => {
            const c = quotationStatusColor[q.status];
            return (
              <div key={q.id} style={{ padding: "10px 12px", borderRadius: 10, background: "#f8f9fb", border: "1px solid #f0f4f8" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#2D2D2D" }}>{q.id}</span>
                      {/* ฉบับที่เท่าไร (บอสสั่ง 21 ส.ค. 69) — ต้องเห็นคู่กับเลขที่ใบเสมอ
                          ลูกค้าถืออาจถือฉบับเก่าอยู่ เวลาคุยกันต้องอ้างอิงเลขฉบับให้ตรงกัน */}
                      <span className="badge" style={{ background: "#eef3f8", color: "#003366", fontSize: "0.65rem", fontWeight: 800 }}
                        title="ฉบับที่เท่าไรของใบนี้ — แก้ใบที่ส่งไปแล้วจะขึ้นฉบับใหม่">{q.revision ?? "V1"}</span>
                      <span className="badge" style={{ background: c.bg, color: c.text, fontSize: "0.65rem" }}>{quotationStatusLabel[q.status]}</span>
                    </div>
                    <div style={{ fontSize: "0.65rem", color: "#6b7280", marginTop: 2 }}>{q.date} · {fmtBaht(q.totalValue)}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {/* ส่งใบเสนอราคา — เด่นเป็นปุ่ม navy · แสดงเฉพาะใบที่ยังส่งได้ (ร่าง/ส่งแล้ว) · ซ่อนเมื่อดูอย่างเดียว */}
                    {แก้ได้(q) && (q.status === "draft" || q.status === "sent_to_client") && (
                      <button onClick={() => sendQuote(q)} title={q.status === "draft" ? "ส่งใบเสนอราคา" : "ส่งอีกครั้ง"}
                        className="btn btn-primary btn-sm" style={{ height: 28, padding: "0 11px" }}>
                        <Send size={12} /> {q.status === "draft" ? "ส่ง" : "ส่งอีกครั้ง"}
                      </button>
                    )}
                    {([
                      { ic: <Eye size={13} />, t: "ดู", fn: () => { setEditing(q); setMode("view"); } },
                      ...(แก้เนื้อหาได้(q) ? [{ ic: <Pencil size={13} />, t: "แก้ไข", fn: () => openEdit(q) }] : []),
                      ...(ทำฉบับใหม่ได้(q) ? [{ ic: <CopyPlus size={13} />, t: "ทำฉบับใหม่", fn: () => void ทำฉบับใหม่(q) }] : []),
                      { ic: <Printer size={13} />, t: "พิมพ์", fn: () => printQuotation(q, { company: subj.company, name: subj.contact, phone: subj.phone, province: subj.province }, q.vatPercent ?? dealerVat, printCfg) },
                      // ใบเดิมที่ไม่มีใบ HQ = ดูได้อย่างเดียว ไม่มีทำสำเนา/ลบ (บอสสั่งเก็บไว้เป็นประวัติ 16 ต.ค. 69)
                      // ทำสำเนาได้เฉพาะใบร่าง — ใบที่ส่งแล้ว/ถูกแทนที่/ตอบรับแล้ว ลูกค้าต่อรองให้ทำฉบับใหม่ (บอสสั่ง 21 ต.ค. 69 · ฐานกัน 0230)
                      ...(ลบได้(q) ? [
                        { ic: <Copy size={13} />, t: "ทำสำเนา", fn: () => duplicate(q) },
                      ] : []),
                      ...(ลบได้(q) ? [{ ic: <Trash2 size={13} />, t: "ลบ", fn: () => setConfirmDel(q.id), danger: true }] : []),
                    ] as { ic: React.ReactNode; t: string; fn: () => void; danger?: boolean }[]).map((b, i) => (
                      <button key={i} onClick={b.fn} title={b.t} aria-label={b.t}
                        style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #e5e7eb", background: "#fff",
                          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: b.danger ? "#dc2626" : "#475569" }}>{b.ic}</button>
                    ))}
                  </div>
                </div>
                {confirmDel === q.id && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 8, paddingTop: 8, borderTop: "1px solid #eef0f4" }}>
                    <span style={{ fontSize: "0.72rem", color: "#dc2626", marginRight: "auto" }}>ลบใบเสนอราคานี้?</span>
                    <button onClick={() => setConfirmDel(null)} className="btn btn-secondary btn-sm" style={{ padding: "3px 10px" }}>ยกเลิก</button>
                    <button onClick={() => { deleteQuotation(q.id); setConfirmDel(null); onToast?.("ลบใบเสนอราคาแล้ว"); }} className="btn btn-sm" style={{ background: "#dc2626", color: "#fff", padding: "3px 10px" }}><X size={12} /> ลบ</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
