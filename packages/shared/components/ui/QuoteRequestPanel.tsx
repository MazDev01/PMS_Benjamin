"use client";

// ── แผงคำขอใบเสนอราคาในหน้าลูกค้าเป้าหมาย (ฝั่งดีลเลอร์ · FLOW.html ขั้น 3 · ด่าน 1) ────────────────────────────
//
// ขั้น 3: ดีลเลอร์ส่งคำขอ (งาน + พื้นที่ + สเปก — กรอกให้จากลีด แก้ได้ก่อนส่ง) → ลูกค้าเป้าหมาย "รอราคา HQ" — ฐานข้อมูลขยับสถานะเอง
//   (เดิมเลือกจากแม่แบบ — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69 · ฐานยังบังคับต้องมีชื่องาน product_required)
// ระหว่างรอ HQ: ยกเลิกได้จนกว่า HQ ส่งใบ ต้องระบุเหตุผล (กลับรวบรวมความต้องการ หรือปิดเป็นไม่สำเร็จ) — แถว 6
// หลัง HQ ส่งใบ: ขอแก้ราคาได้ (ใบเก่าปิด คำขอใหม่เริ่มนับ 14 วัน) — แถว 7
// HQ ส่งใบแล้ว (แถว 4 · ด่าน 2): ป้าย "ได้ราคาแล้ว" + ใบ HQ แบบอ่านอย่างเดียว (ต้นทุนของดีลเลอร์ · เลขใบ · เวอร์ชัน · ยืนราคาถึง)
//   ฐานให้ดีลเลอร์เห็นเฉพาะใบที่ส่งแล้วของสาขาตัวเอง — ร่างของ HQ ไม่หลุดมาที่นี่
// ขอราคาได้เมื่อ "เก็บข้อมูลลูกค้า" + "สรุปความต้องการ" ครบ (บอสสั่ง 2 พ.ย. 69 · ใบ 0273 ฐานกันซ้ำ) — ข้อมูลยังไม่ครบ:
//   กด "ขอราคาจาก HQ" = เปิดฟอร์มเฉพาะช่องที่ขาด (บังคับกรอก) → บันทึกลงลีด (2 งานติ๊กเอง) → ไปต่อฟอร์มขอราคา (ช่องดึงจากลีดตามเดิม)
//   เกณฑ์ "ครบ" = lib/leadInfoTasks.ts ตัวเดียวกับที่ติ๊ก 2 งานนี้ · "นัดหมาย" ไม่บังคับ
// ไฟล์แนบ 2 ทาง (ใบ 0273): แนบตอนส่งคำขอ (ส่งคำขอก่อน แล้วไฟล์ตามไป) + แนบเพิ่ม/ลบได้จนกว่า HQ ส่งใบ · ไฟล์ HQ ดูได้หลัง HQ ส่งใบ
// โหมดข้อมูลตัวอย่าง (ไม่มีฐานข้อมูล) ไม่แสดงแผงนี้
// ยกเลิก (บอสสั่ง 5 พ.ย. 69 · ใบ 0280): คำขอที่ส่งแล้วไม่ถูกลบ — ยังเห็นในแผงนี้ (คำขอที่ยกเลิกแล้ว: เหตุผล · ใคร · เมื่อไร · ไฟล์แนบเปิดดูได้)
//   ขอราคาใหม่ได้ตามปกติ คำขอเก่าไม่ทับ · กดยกเลิกฟอร์มขอราคา (ยังไม่ส่ง) = ฐานจดประวัติของลีด "เริ่มขอราคาแล้วยกเลิก" + ใคร (ไม่เก็บที่กรอก)
import { useCallback, useEffect, useRef, useState } from "react";
import { Send, ChevronDown, ChevronUp, Paperclip } from "lucide-react";
import { quoteRequests as repo } from "@pms/shared/lib/data";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { dealerCodeOf } from "@pms/shared/lib/dealerCode";
import {
  type QuoteRequest, type HqQuote, quoteRequestStatusLabel, quoteRequestStatusColor, อยู่กับHQ, คำขอเปิดอยู่, เกินกำหนด, วันไทยสั้น,
  ยอดบรรทัด, ป้ายได้ราคาแล้ว,
} from "@pms/shared/lib/quoteRequests";
import type { LeadRow } from "@pms/shared/lib/mock";
// ชื่อขั้นจากแหล่งเดียว (leadStage.ts) — เดิมพิมพ์ชื่อสถานะเก่า "ติดต่อแล้ว/รวบรวมความต้องการ" ไม่ตรงแถบ 5 ขั้น (บอสสั่ง 28 ต.ค. 69)
import { ชื่อขั้นการขาย } from "@pms/shared/lib/leadStage";
import { ช่องขอราคา, ตัวอย่างช่อง } from "@pms/shared/lib/fieldLabels";
import { MaterialEstimatePicker, type วัสดุที่เลือก } from "@pms/shared/components/ui/MaterialEstimatePicker";
import { ป้ายราคาประเมิน } from "@pms/shared/lib/materialTemplates";
import { ถามเหตุผล } from "@pms/shared/components/ui/ConfirmToast";
import { ตารางรายการ } from "@pms/shared/components/ui/LineItemsTable";
import { จัดรูปจำนวน, จัดรูปหน่วย } from "@pms/shared/lib/lineItemColumns";
import { quoteFiles } from "@pms/shared/lib/data";
import { useSales } from "@pms/shared/context/SalesContext";
import { ข้อมูลลูกค้าครบ, ข้อมูลงานครบ } from "@pms/shared/lib/leadInfoTasks";
import { ช่อง as ป้ายช่อง } from "@pms/shared/lib/fieldLabels";
import { ProvinceSelect } from "@pms/shared/components/ui/ProvinceSelect";
import { provincesOfRegion, ALL_REGIONS } from "@pms/shared/lib/provinces";
import { QuoteFilesBox } from "@pms/shared/components/ui/QuoteFilesBox";
import { FileDropBox, แถวไฟล์, คัดไฟล์, type ไฟล์ไม่ผ่าน } from "@pms/shared/components/ui/FileDropBox";
import { FieldLabel, FieldError, useช่องบังคับ } from "@pms/shared/components/ui/FieldLabel";

// ยกเลิกคำขอ / ขอแก้ราคา = กล่องเหตุผลกลาง (บอสสั่ง 28 ต.ค. 69) — กล่องรอฐาน + รอรายการคำขอโหลดใหม่ก่อนปิด
//   เดิมเป็นฟอร์มในแผง: ปุ่มไม่บอกว่ากำลังทำ · เหตุผลว่างกดได้แล้วขึ้นตัวแดงเล็ก · ปิดฟอร์มก่อนรายการโหลดใหม่
//   (ช่วงสั้น ๆ จอยังโชว์ "ใหม่" + ปุ่มยกเลิกคำขอ ทั้งที่ฐานยกเลิกแล้ว = ดูเหมือนกดแล้วไม่เกิดอะไร)
type โหมด = "ดู" | "ขอราคา" | "เติมข้อมูล";
/** ช่องของลีดที่ต้องครบก่อนขอราคา (ลำดับ = ลำดับในฟอร์มเติมข้อมูล · ชื่อช่องจาก fieldLabels) — เกณฑ์เดียวกับ lib/leadInfoTasks.ts */
const ช่องที่ต้องครบ = [
  ["company", ป้ายช่อง.บริษัท], ["contact", ป้ายช่อง.ผู้ติดต่อ], ["phone", ป้ายช่อง.โทรศัพท์],
  ["province", ป้ายช่อง.จังหวัด], ["project", ป้ายช่อง.งาน], ["area", ป้ายช่อง.พื้นที่], ["note", ป้ายช่อง.สเปก],
] as const;
type ช่องลีด = (typeof ช่องที่ต้องครบ)[number][0];
const ค่าช่อง = (l: Partial<Record<ช่องลีด, unknown>>, k: ช่องลีด) => String(l[k] ?? "").trim();
/** ช่องเดียวครบไหม — ใช้สูตรของ leadInfoTasks กับข้อมูลที่มีแค่ช่องนั้น (ไม่เขียนกติกาซ้ำ) */
const ช่องนี้ครบ = (l: Partial<Record<ช่องลีด, unknown>>, k: ช่องลีด) => {
  const เต็ม = { company: "x", contact: "x", phone: "x", province: "x", project: "x", area: "1", note: "x" };
  const ลอง = { ...เต็ม, [k]: ค่าช่อง(l, k) };
  return ข้อมูลลูกค้าครบ(ลอง) && ข้อมูลงานครบ(ลอง);
};
const ป้ายของ = (k: ช่องลีด) => ช่องที่ต้องครบ.find(([x]) => x === k)![1];
const จังหวัดทั้งหมด = provincesOfRegion(ALL_REGIONS);
const บาท = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ช่อง: React.CSSProperties = { width: "100%", border: "1px solid #d5dbe4", borderRadius: 9, padding: "9px 11px", fontSize: "0.84rem", fontFamily: "inherit", boxSizing: "border-box" };

/** openSignal = ปุ่ม "ขั้นต่อไป" ในหัวแผงสั่งเปิดฟอร์ม (ขอราคา / ขอราคาใหม่) · n เปลี่ยน = สั่งใหม่ (หน้า 3 UI ตาม flow · 16 ต.ค. 69) */
export function QuoteRequestPanel({ lead, onChanged, openSignal }: { lead: LeadRow; onChanged?: () => void; openSignal?: { mode: "ขอราคา" | "แก้ราคา"; n: number } }) {
  const [รายการ, setรายการ] = useState<QuoteRequest[] | null>(null);
  const [โหมด, setโหมด] = useState<โหมด>("ดู");
  const [product, setProduct] = useState("");
  const [spec, setSpec] = useState("");
  const [area, setArea] = useState("");
  // วัสดุจากแม่แบบ (ไม่บังคับ · ใบ 0244) — ราคาประเมินเบื้องต้น ไม่ใช่ใบเสนอราคา
  const [วัสดุ, setวัสดุ] = useState<วัสดุที่เลือก[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [ใบHQ, setใบHQ] = useState<HqQuote | null>(null);
  // ไฟล์ที่เลือกในฟอร์มขอราคา — ส่งตามไปหลังฐานสร้างคำขอแล้ว (ไฟล์ต้องผูกเลขคำขอ)
  const [ไฟล์รอส่ง, setไฟล์รอส่ง] = useState<File[]>([]);
  const [ไฟล์ไม่ผ่านฟอร์ม, setไฟล์ไม่ผ่านฟอร์ม] = useState<ไฟล์ไม่ผ่าน[]>([]);
  // ใบ HQ แบบย่อ (บอสสั่ง 3 พ.ย. 69 "ทำไมมันกางแบบนี้"): ค่าเริ่มต้น = บรรทัดสรุป · กด "ดูรายการ" แล้วกางตาราง
  const [กางรายการ, setกางรายการ] = useState(false);
  const [ไฟล์จากHQ, setไฟล์จากHQ] = useState<number | null>(null);
  // ไฟล์ที่ดีลเลอร์แนบเองหลัง HQ ส่งใบ — ดูย้อนได้ในรายละเอียดคำขอ (พับไว้)
  const [ดูไฟล์ของฉัน, setดูไฟล์ของฉัน] = useState(false);
  // ฟอร์มเติมข้อมูลที่ขาด: ช่องที่ขาด ณ ตอนเปิด + ค่าที่พิมพ์
  const [ช่องขาด, setช่องขาด] = useState<ช่องลีด[]>([]);
  // ช่องบังคับ (บอสสั่ง 4 พ.ย. 69 · ตัวกลาง): ช่องที่ขาดของลีด · งานที่ขอราคา — ว่าง = กรอบแดง + ข้อความใต้ช่อง + โฟกัสช่องแรก
  const บังคับขาด = useช่องบังคับ();
  const บังคับขอ = useช่องบังคับ();
  const [เติม, setเติม] = useState<Partial<Record<ช่องลีด, string>>>({});
  const { บันทึกลีดรอฐาน } = useSales();

  const dealerCode = dealerCodeOf(lead);
  // คืน Promise — หลังยกเลิก/ขอแก้ราคา กล่องรอรายการใหม่ก่อนปิด (จอไม่ค้างสถานะเก่า)
  const โหลด = useCallback(async () => {
    if (!REAL_BACKEND || !dealerCode || lead.numId == null) return;
    await repo.listForLead(dealerCode, lead.numId).then(setรายการ).catch(e => logRepoRead("quoteRequests.listForLead", e));
  }, [dealerCode, lead.numId]);
  useEffect(() => { void โหลด(); }, [โหลด]);

  const ล่าสุด = รายการ?.[0];
  const เปิด = ล่าสุด && คำขอเปิดอยู่(ล่าสุด.status) ? ล่าสุด : null;
  const ได้ราคา = เปิด?.status === "quoted" ? เปิด.id : 0;
  useEffect(() => {
    if (!ได้ราคา) { setใบHQ(null); return; }
    let alive = true;
    repo.hqQuoteFor(ได้ราคา).then(h => alive && setใบHQ(h)).catch(e => logRepoRead("quoteRequests.hqQuoteFor(dealer)", e));
    return () => { alive = false; };
  }, [ได้ราคา]);

  // ── เปิดฟอร์ม = กรอกให้จากข้อมูลล่าสุดทุกครั้ง (บอสสั่ง 26 ต.ค. 69 · FLOW ขั้น 3 "งาน + พื้นที่ + สเปก") ──
  //   ขอราคา: งานที่ขอราคา ← งานที่ต้องการ · พื้นที่ ← พื้นที่ · สเปก ← สเปก / รายละเอียดงาน ของลีด ณ ตอนเปิด (แก้ได้ก่อนส่ง)
  //   ขอแก้ราคา (D5x): สเปก ← คำขอล่าสุด · ลีด/คำขอไม่มีค่าช่องไหน = ช่องนั้นว่าง ห้ามเดา
  //   เดิมเปิดมาว่างทุกช่อง ดีลเลอร์ต้องพิมพ์ซ้ำสิ่งที่กรอกไว้ในลีดแล้ว · ยกเลิก/ส่งแล้วเปิดใหม่ = ดึงใหม่ ไม่ค้างค่าที่พิมพ์รอบก่อน
  const เข้าโหมด = useCallback((m: โหมด, ล่าสุด: LeadRow = lead) => {
    setErr("");
    if (m === "ขอราคา") {
      // ข้อมูลลูกค้า/ข้อมูลงานยังไม่ครบ → ฟอร์มเติมเฉพาะช่องที่ขาดก่อน (บอสสั่ง 2 พ.ย. 69)
      if (!ข้อมูลลูกค้าครบ(ล่าสุด) || !ข้อมูลงานครบ(ล่าสุด)) {
        const ขาด = ช่องที่ต้องครบ.map(([k]) => k).filter(k => !ช่องนี้ครบ(ล่าสุด, k));
        setช่องขาด(ขาด);
        setเติม(Object.fromEntries(ขาด.map(k => [k, k === "area" ? "" : ค่าช่อง(ล่าสุด, k)])));
        setโหมด("เติมข้อมูล");
        return;
      }
      setProduct(ล่าสุด.project ?? "");
      setArea(ล่าสุด.area != null && Number(ล่าสุด.area) > 0 ? String(ล่าสุด.area) : "");
      setSpec(ล่าสุด.note ?? "");
      setวัสดุ([]);
      setไฟล์รอส่ง([]); setไฟล์ไม่ผ่านฟอร์ม([]);
    }
    setโหมด(m);
  }, [lead]);

  // บันทึกช่องที่ขาดลงลีด (ทางเขียนลีดทางเดียว) → 2 งานติ๊กเอง → ไปต่อฟอร์มขอราคา
  const บันทึกข้อมูลที่ขาด = async () => {
    if (busy) return;
    บังคับขาด.ตรวจ(ช่องขาด.map(k => ({ key: k, label: ป้ายของ(k), value: ช่องนี้ครบ(เติม, k) ? "ครบ" : "", ข้อความ: `ต้องกรอก${ป้ายของ(k)}` })));
    const ยังขาด = ช่องขาด.filter(k => !ช่องนี้ครบ(เติม, k));
    if (ยังขาด.length) { setErr(`กรอกให้ครบก่อน: ${ยังขาด.map(ป้ายของ).join(" · ")}`); return; }
    setErr(""); setBusy(true);
    try {
      const fields = Object.fromEntries(ช่องขาด.map(k => [k, k === "area" ? Number(เติม[k]) : String(เติม[k] ?? "").trim()]));
      const ใหม่ = await บันทึกลีดรอฐาน(lead.id, { fields });
      onChanged?.();
      เข้าโหมด("ขอราคา", { ...lead, ...ใหม่ });
    } catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(false); }
  };

  // หลังฐานตอบสำเร็จ: รอรายการคำขอใหม่ก่อน (กล่องยังขึ้น "กำลัง…") แล้วค่อยบอกหน้าแม่
  const หลังทำ = async () => { await โหลด(); onChanged?.(); };
  const ยกเลิกแล้ว = (รายการ ?? []).filter(r => r.status === "cancelled");
  const [ดูไฟล์ยกเลิก, setดูไฟล์ยกเลิก] = useState<number | null>(null);
  // ปิดฟอร์มขอราคาโดยไม่ส่ง (ทั้งขั้นเติมข้อมูลที่ขาดและฟอร์มขอราคา) — ฐานจดประวัติ · จดไม่ได้ไม่ขวางการปิดฟอร์ม
  const ยกเลิกฟอร์ม = () => {
    setโหมด("ดู");
    if (lead.numId == null) return;
    void repo.abandonForm(lead.numId).then(() => onChanged?.()).catch(e => logRepoRead("quoteRequests.abandonForm", e));
  };
  const ยกเลิกคำขอ = (คำขอ: QuoteRequest) => ถามเหตุผล({
    หัวข้อ: `ยกเลิกคำขอ ${คำขอ.requestNo} ?`,
    รายละเอียด: "ยกเลิกแล้วลูกค้าเป้าหมายกลับไปขั้น \"ข้อมูลลูกค้า\" · ลูกค้าไม่สนใจแล้ว ใช้ \"ปิดไม่สำเร็จ\" ที่กล่องขั้นต่อไป",
    ป้ายช่อง: "เหตุผลที่ยกเลิก", ปุ่มตกลง: "ยืนยันยกเลิก", ปุ่มกำลังทำ: "กำลังยกเลิก…", ปุ่มยกเลิก: "ไม่ยกเลิก", อันตราย: true,
    // ปิดไม่สำเร็จ = กล่องขั้นต่อไปที่เดียว (รอบ 4) — ที่นี่กลับไปรวบรวมความต้องการเสมอ
    ทำ: async เหตุผล => { await repo.cancel(คำขอ.id, เหตุผล, false); await หลังทำ(); },
  });
  // ขอแก้ราคา (D5x): สเปก ← คำขอล่าสุด · ไม่มีค่า = ว่าง ห้ามเดา
  const ขอแก้ราคา = (คำขอ: QuoteRequest) => ถามเหตุผล({
    หัวข้อ: `ขอแก้ราคาคำขอ ${คำขอ.requestNo} ?`,
    รายละเอียด: "ใบ HQ ใบเดิมปิด · เปิดคำขอใหม่ให้ HQ ตีราคาอีกครั้ง (เริ่มนับ 14 วันใหม่)",
    ป้ายช่อง: "เหตุผลที่ขอแก้ราคา", ปุ่มตกลง: "ส่งขอแก้ราคา", ปุ่มกำลังทำ: "กำลังส่งขอแก้ราคา…",
    ช่องเพิ่ม: { ป้าย: "สเปกที่ขอแก้ราคา", ค่าตั้งต้น: คำขอ.spec ?? "" },
    ทำ: async (เหตุผล, สเปก) => { await repo.reprice(คำขอ.id, เหตุผล, สเปก || undefined); await หลังทำ(); },
  });

  // สั่งเปิดฟอร์มจากปุ่ม "ขั้นต่อไป" — รอให้รายการคำขอโหลดเสร็จก่อน (ต้องรู้ว่ามีคำขอเปิดอยู่ไหม)
  const สัญญาณล่าสุด = useRef(0);
  useEffect(() => {
    if (!openSignal || openSignal.n === สัญญาณล่าสุด.current || รายการ === null) return;
    สัญญาณล่าสุด.current = openSignal.n;
    if (openSignal.mode === "แก้ราคา") { if (เปิด) void ขอแก้ราคา(เปิด); }
    else เข้าโหมด("ขอราคา");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal, รายการ, เข้าโหมด]);

  if (!REAL_BACKEND) return null;
  const ขอได้ = !เปิด && (lead.status === "WAITING" || lead.status === "BULLET");

  // ส่งคำขอ: ปุ่มขึ้น "กำลังส่ง…" จนฐานตอบ และรอรายการคำขอใหม่ก่อนปิดฟอร์ม (กันจอค้างสถานะเก่า)
  const ส่งคำขอ = async () => {
    if (busy) return;
    if (!บังคับขอ.ตรวจ([{ key: "product", label: ช่องขอราคา.งาน, value: product, ข้อความ: "ระบุงานที่ขอราคาก่อน" }])) { setErr(`กรอกให้ครบก่อน: ${ช่องขอราคา.งาน}`); return; }
    if (วัสดุ.some(v => !(v.qty > 0))) { setErr("จำนวนวัสดุต้องมากกว่า 0 — แก้หรือเอาออกก่อนส่ง"); return; }
    setErr(""); setBusy(true);
    try {
      const คำขอ = await repo.submit({ leadNumId: lead.numId!, product: product.trim(), spec, area: area ? Number(area) : null, province: lead.province ?? "", estimate: วัสดุ });
      // ไฟล์ตามไปหลังมีเลขคำขอ — ไฟล์ไหนไม่ผ่าน บอกชื่อ (คำขอส่งแล้ว แนบเพิ่มได้ในกล่องไฟล์แนบ)
      const ไม่ผ่าน: string[] = [];
      for (const f of ไฟล์รอส่ง) {
        try { await quoteFiles.upload(คำขอ.id, "dealer", f); } catch (e) { ไม่ผ่าน.push(`${f.name}: ${friendlyError(e)}`); }
      }
      await หลังทำ();
      setโหมด("ดู"); setProduct(""); setSpec(""); setArea(""); setวัสดุ([]); setไฟล์รอส่ง([]); setไฟล์ไม่ผ่านฟอร์ม([]);
      if (ไม่ผ่าน.length) setErr(`ส่งคำขอแล้ว แต่แนบไฟล์ไม่สำเร็จ — ${ไม่ผ่าน.join(" · ")} (แนบใหม่ได้ที่กล่องไฟล์แนบ)`);
    } catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(false); }
  };

  return (
    <div data-panel="quote-request" style={{ border: "1px solid #e9d5ff", background: "#faf5ff", borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Send size={15} color="#6b21a8" />
        <strong style={{ fontSize: "0.86rem", color: "#3b0764" }}>ราคาจากสำนักงานใหญ่</strong>
      </div>

      {เปิด ? (
        <div style={{ fontSize: "0.8rem", color: "#374151", lineHeight: 1.8 }}>
          <div>
            คำขอ <b>{เปิด.requestNo}</b> ·{" "}
            <span className="badge" style={{ background: quoteRequestStatusColor[เปิด.status].bg, color: quoteRequestStatusColor[เปิด.status].text }}>
              {quoteRequestStatusLabel[เปิด.status]}
            </span>
            {เกินกำหนด(เปิด) && <span className="badge" style={{ marginLeft: 6, background: "#fee2e2", color: "#b91c1c" }}>เกินกำหนด</span>}
            {เปิด.status === "quoted" && <span className="badge" style={{ marginLeft: 6, background: "#dcfce7", color: "#166534" }}>{ป้ายได้ราคาแล้ว}</span>}
          </div>
          <div>งานที่ขอราคา: {เปิด.product}{เปิด.subtype ? ` · ${เปิด.subtype}` : ""}{เปิด.spec ? ` · ${เปิด.spec}` : ""}</div>
          {เปิด.estimateTotal != null && (
            <div className="no-print" data-testid="request-estimate">
              ราคาประเมินจากวัสดุ {(เปิด.estimateItems ?? []).length} รายการ: <b>{บาท(Number(เปิด.estimateTotal))} บาท</b>{" "}
              <span className="badge" style={{ background: "#fef3c7", color: "#92400e" }}>{ป้ายราคาประเมิน}</span>
            </div>
          )}
          {อยู่กับHQ(เปิด.status) && <div>กำหนดส่งใบ HQ: {วันไทยสั้น(เปิด.dueAt)}{เปิด.assigneeName ? ` · ผู้รับผิดชอบ ${เปิด.assigneeName}` : ""}</div>}
          {/* ใบ HQ แบบย่อ (บอสสั่ง 3 พ.ย. 69): บรรทัดสรุปเดียว · "ดูรายการ" กางตาราง · ไม่ซ้อนกรอบเพิ่ม (กล่องม่วง = ชั้นเดียว)
              ใต้ใบ = เฉพาะไฟล์ที่ HQ แนบกับใบฉบับนี้ ไม่มี = ไม่แสดงกล่อง ("ให้แสดงเฉพาะไฟล์ที่ HQ แนบมา") · ปุ่มทำใบให้ลูกค้าอยู่ที่กล่องขั้นต่อไปเหมือนเดิม */}
          {ใบHQ && (
            <div data-panel="hq-quote" style={{ borderTop: "1px solid #e9d5ff", paddingTop: 8, marginTop: 8, display: "grid", gap: 6 }}>
              <div data-testid="hq-quote-summary" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, color: "#3b0764" }}>ใบ HQ {ใบHQ.quoteNo} · เวอร์ชัน {ใบHQ.version}</span>
                <span>· ต้นทุนรวมจาก HQ <b data-testid="hq-quote-summary-total">{บาท(Number(ใบHQ.totalCost))}</b> บาท</span>
                <span>· ยืนราคาถึง {ใบHQ.validUntil ? วันไทยสั้น(ใบHQ.validUntil) : "—"}</span>
                <span data-testid="hq-quote-summary-lines">· {ใบHQ.lineItems.length} รายการ</span>
                <span data-testid="hq-quote-summary-files">· {ไฟล์จากHQ == null ? "กำลังโหลดไฟล์…" : ไฟล์จากHQ ? `ไฟล์แนบจาก HQ ${ไฟล์จากHQ} ไฟล์` : "ไม่มีไฟล์แนบจาก HQ"}</span>
                <button type="button" className="btn btn-secondary btn-sm" aria-expanded={กางรายการ} onClick={() => setกางรายการ(v => !v)} style={{ marginLeft: "auto" }}>
                  {กางรายการ ? <>ซ่อนรายการ <ChevronUp size={13} /></> : <>ดูรายการ <ChevronDown size={13} /></>}
                </button>
              </div>
              {กางรายการ && <>
                {/* ตารางรายการกลาง: จำนวน/หน่วยคนละคอลัมน์ หัวตรงแนวข้อมูล (บอสสั่ง 30 ต.ค. 69 · เดิม "38ตัน") */}
                <ตารางรายการ ป้าย="รายการในใบ HQ" แน่น กว้างขั้นต่ำ={560} แถว={ใบHQ.lineItems} คอลัมน์={[
                  { key: "name", หัว: "รายการ", ชนิด: "ข้อความ", กว้าง: "34%", ค่า: l => l.name, ชี้: l => l.name },
                  { key: "qty", หัว: "จำนวน", ชนิด: "จำนวน", กว้าง: "13%", ค่า: l => จัดรูปจำนวน(l.qty) },
                  { key: "unit", หัว: "หน่วย", ชนิด: "หน่วย", กว้าง: "13%", ค่า: l => จัดรูปหน่วย(l.unit) },
                  { key: "cost", หัว: "ต้นทุน/หน่วย", ชนิด: "เงิน", กว้าง: "20%", ค่า: l => บาท(Number(l.unitCost)) },
                  { key: "total", หัว: "ยอด", ชนิด: "เงิน", กว้าง: "20%", ค่า: l => บาท(ยอดบรรทัด(l)) },
                ]} ท้าย={<tr><td colSpan={5} className="num" style={{ fontWeight: 700 }}>ต้นทุนรวมจาก HQ</td><td className="num" style={{ fontWeight: 800 }} data-testid="dealer-hq-quote-total">{บาท(Number(ใบHQ.totalCost))}</td></tr>} />
                {ใบHQ.note && <div style={{ color: "#4b5563" }}>หมายเหตุจาก HQ: {ใบHQ.note}</div>}
                <div style={{ fontSize: "0.72rem", color: "#6b7280" }}>ราคานี้เป็นต้นทุนของคุณ ไม่แสดงต่อลูกค้า — ทำใบเสนอราคาให้ลูกค้าโดยบวก % จากใบนี้</div>
              </>}
              <QuoteFilesBox requestId={เปิด.id} uploadSide="dealer" canUpload={false} กลุ่มที่แสดง={["hq"]} เฉพาะใบHQ={ใบHQ.id} ซ่อนเมื่อว่าง
                onLoaded={fs => setไฟล์จากHQ(fs.length)} />
            </div>
          )}
          {/* ไฟล์ที่ดีลเลอร์แนบเอง: ก่อน HQ ส่งใบ = กล่องแนบ · หลังส่ง = ดูย้อนได้ (พับไว้) — ไฟล์ไม่หายไปจากระบบ */}
          {อยู่กับHQ(เปิด.status) ? (
            <div style={{ marginTop: 8 }}>
              <QuoteFilesBox requestId={เปิด.id} uploadSide="dealer" canUpload กลุ่มที่แสดง={["dealer"]} />
            </div>
          ) : (
            <div style={{ marginTop: 6 }}>
              <button type="button" data-act="my-request-files" aria-expanded={ดูไฟล์ของฉัน} onClick={() => setดูไฟล์ของฉัน(v => !v)}
                style={{ background: "none", border: "none", padding: 0, color: "#6b21a8", fontWeight: 700, fontSize: "0.76rem", cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Paperclip size={12} /> ไฟล์ที่คุณแนบกับคำขอ {ดูไฟล์ของฉัน ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {ดูไฟล์ของฉัน && <div style={{ marginTop: 6 }}><QuoteFilesBox requestId={เปิด.id} uploadSide="dealer" canUpload={false} กลุ่มที่แสดง={["dealer"]} lockedReason="ล็อกพร้อมคำขอ (HQ ส่งใบแล้ว)" /></div>}
            </div>
          )}
          {โหมด === "ดู" && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {อยู่กับHQ(เปิด.status) && <button type="button" className="btn btn-secondary btn-sm" onClick={() => void ยกเลิกคำขอ(เปิด)}>ยกเลิกคำขอ</button>}
              {/* ลีดปิดการขายแล้ว = ขอแก้ราคาไม่ได้ (ใบ 0221 กันที่ฐาน) */}
              {/* ราคาหมดอายุ = ปุ่ม "ขอราคาใหม่" ในกล่องขั้นต่อไป (ไม่ซ้ำสองปุ่ม · รอบ 4) */}
              {เปิด.status === "quoted" && lead.status !== "PAID" && !(ใบHQ?.validUntil && ใบHQ.validUntil < new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)) && <button type="button" className="btn btn-secondary btn-sm" onClick={() => void ขอแก้ราคา(เปิด)}>ขอแก้ราคา</button>}
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: "0.8rem", color: "#4b5563" }}>
          {ขอได้ ? "ยังไม่ได้ขอราคา — ส่งคำขอพร้อมชื่องานและสเปก สำนักงานใหญ่ทำ BOQ และส่งใบ HQ ภายใน 14 วัน"
                 : lead.status === "HQ_PRICING" ? "กำลังโหลดคำขอ…" : `ขอราคาจาก HQ ได้ในขั้น “${ชื่อขั้นการขาย[0]}”`}
          {/* ปุ่ม "ขอราคาจาก HQ" อยู่ในกล่องขั้นต่อไปที่เดียว (รอบ 4) — กดแล้วฟอร์มเปิดที่นี่ */}
          {ขอได้ && โหมด === "ดู" && " · กด “ขอราคาจาก HQ” ที่กล่องขั้นต่อไปด้านบน"}
        </div>
      )}

      {โหมด === "เติมข้อมูล" && (
        <div data-form="lead-info-missing" style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <div role="status" style={{ fontSize: "0.78rem", color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 9, padding: "8px 10px" }}>
            ขอราคาจาก HQ ได้เมื่อ “เก็บข้อมูลลูกค้า” และ “สรุปความต้องการ” ครบ — กรอกช่องที่ขาดก่อน แล้วไปต่อฟอร์มขอราคา
          </div>
          {ช่องขาด.map(k => {
            const ป้าย = ป้ายของ(k);
            const ค่า = เติม[k] ?? "";
            const ตั้ง = (v: string) => { setเติม(d => ({ ...d, [k]: v })); บังคับขาด.ล้าง(k); };
            return (
              <div key={k} style={{ display: "grid", gap: 4 }}>
                <FieldLabel htmlFor={`qr-missing-${k}`} required>{ป้าย}</FieldLabel>
                {k === "province"
                  ? <ProvinceSelect id={`qr-missing-${k}`} label={ป้าย} value={ค่า} onChange={ตั้ง} options={จังหวัดทั้งหมด} disabled={busy}
                      selectRef={บังคับขาด.ผูก(k).ref} invalid={!!บังคับขาด.ผิด[k]} />
                  : k === "note"
                  ? <textarea id={`qr-missing-${k}`} aria-label={ป้าย} rows={3} value={ค่า} onChange={e => ตั้ง(e.target.value)} disabled={busy}
                      {...บังคับขาด.ผูก(k)} style={{ ...ช่อง, ...บังคับขาด.ผูก(k).style }} />
                  : <input id={`qr-missing-${k}`} aria-label={ป้าย} value={ค่า} disabled={busy}
                      inputMode={k === "area" ? "decimal" : k === "phone" ? "tel" : undefined}
                      onChange={e => ตั้ง(k === "area" ? e.target.value.replace(/[^\d.]/g, "") : e.target.value)}
                      {...บังคับขาด.ผูก(k)} style={{ ...ช่อง, ...บังคับขาด.ผูก(k).style }} />}
                <FieldError>{บังคับขาด.ผิด[k]}</FieldError>
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} aria-busy={busy || undefined} data-busy-button onClick={() => void บันทึกข้อมูลที่ขาด()}>{busy ? "กำลังบันทึก…" : "บันทึกแล้วไปต่อ"}</button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} data-act="abandon-request-form" onClick={ยกเลิกฟอร์ม}>ยกเลิก</button>
          </div>
        </div>
      )}

      {โหมด === "ขอราคา" && (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <FieldLabel htmlFor="qr-product" required>{ช่องขอราคา.งาน}</FieldLabel>
          <input id="qr-product" aria-label={ช่องขอราคา.งาน} value={product} onChange={e => { setProduct(e.target.value); บังคับขอ.ล้าง("product"); }} disabled={busy}
            placeholder={ตัวอย่างช่อง.งาน} maxLength={200} required {...บังคับขอ.ผูก("product")} style={{ ...ช่อง, ...บังคับขอ.ผูก("product").style }} />
          <FieldError>{บังคับขอ.ผิด.product}</FieldError>
          <label className="form-label" htmlFor="qr-area">{ช่องขอราคา.พื้นที่}</label>
          <input id="qr-area" inputMode="decimal" style={ช่อง} value={area} onChange={e => setArea(e.target.value.replace(/[^\d.]/g, ""))} disabled={busy} />
          <label className="form-label" htmlFor="qr-spec">{ช่องขอราคา.สเปก}</label>
          <textarea id="qr-spec" aria-label={ช่องขอราคา.สเปก} rows={3} style={ช่อง} value={spec} onChange={e => setSpec(e.target.value)} disabled={busy} />
          <div style={{ fontSize: "0.74rem", color: "#6b7280" }}>{ช่องขอราคา.จังหวัด}: {lead.province || "—"}</div>
          <MaterialEstimatePicker value={วัสดุ} onChange={setวัสดุ} disabled={busy} />
          {/* ไฟล์แนบถึง HQ (ไม่บังคับ · ใบ 0273) — กล่องแนบไฟล์กลาง หน้าตาเดียวกับฝั่ง HQ (บอสสั่ง 3 พ.ย. 69 "ทำเป็นปุ่มแบบของ HQ")
              ไฟล์ส่งตามคำขอทันทีหลังส่ง · ไฟล์ที่ไม่ผ่านขึ้นเป็นแถวเตือนของไฟล์นั้น ไม่ถูกส่ง */}
          <div data-field="request-files" style={{ display: "grid", gap: 6, background: "#f8fafc", border: "1px solid #eef1f5", borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Paperclip size={14} color="#374151" />
              <strong style={{ fontSize: "0.82rem", color: "#1f2937" }}>ไฟล์แนบถึง HQ (ไม่บังคับ)</strong>
            </div>
            {ไฟล์รอส่ง.map((f, i) => (
              <div key={`${f.name}-${i}`} data-pending-file={f.name}>
                <แถวไฟล์ name={f.name} size={f.size} รายละเอียด="ส่งพร้อมคำขอ" ป้ายเอาออก={`เอา ${f.name} ออก`}
                  เอาออก={busy ? undefined : () => setไฟล์รอส่ง(l => l.filter((_, j) => j !== i))} />
              </div>
            ))}
            {ไฟล์ไม่ผ่านฟอร์ม.map(x => (
              <div key={x.key} data-file-rejected>
                <แถวไฟล์ name={x.name} size={x.size} เตือน={x.เหตุ} ป้ายเอาออก={`ปิดคำเตือน ${x.name}`} เอาออก={() => setไฟล์ไม่ผ่านฟอร์ม(l => l.filter(y => y.key !== x.key))} />
              </div>
            ))}
            <FileDropBox inputId="qr-files" มีอยู่แล้ว={ไฟล์รอส่ง.length} disabled={busy} ป้าย="แนบไฟล์ถึง HQ (แบบ/รูป/ใบเสนอเดิม)"
              onFiles={fs => { const { ผ่าน, ไม่ผ่าน } = คัดไฟล์(fs, ไฟล์รอส่ง.length); setไฟล์รอส่ง(l => [...l, ...ผ่าน]); setไฟล์ไม่ผ่านฟอร์ม(l => [...l, ...ไม่ผ่าน]); }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} aria-busy={busy || undefined} data-busy-button onClick={() => void ส่งคำขอ()}>{busy ? "กำลังส่ง…" : "ส่งคำขอ"}</button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} data-act="abandon-request-form" onClick={ยกเลิกฟอร์ม}>ยกเลิก</button>
          </div>
        </div>
      )}

      {ยกเลิกแล้ว.length > 0 && (
        <div data-box="cancelled-requests" style={{ marginTop: 12, display: "grid", gap: 6 }}>
          <div style={{ fontSize: "0.76rem", fontWeight: 700, color: "#6b7280" }}>คำขอที่ยกเลิกแล้ว</div>
          {ยกเลิกแล้ว.map(r => (
            <div key={r.id} data-cancelled-request={r.requestNo} style={{ border: "1px solid #eef0f3", borderRadius: 9, padding: "8px 10px", fontSize: "0.76rem", color: "#4b5563", display: "grid", gap: 4 }}>
              <div><b style={{ color: "#374151" }}>{r.requestNo}</b> · <span className="badge" style={{ background: quoteRequestStatusColor.cancelled.bg, color: quoteRequestStatusColor.cancelled.text }}>{quoteRequestStatusLabel.cancelled}</span></div>
              <div data-testid="cancel-info">เหตุผล: {r.cancelReason || "—"} · โดย {r.cancelledByName || "—"} · เมื่อ {r.cancelledAt ?? r.closedAt ? วันไทยสั้น((r.cancelledAt ?? r.closedAt)!) : "—"}</div>
              <button type="button" data-act="cancelled-request-files" aria-expanded={ดูไฟล์ยกเลิก === r.id} onClick={() => setดูไฟล์ยกเลิก(v => v === r.id ? null : r.id)}
                style={{ background: "none", border: "none", padding: 0, color: "#6b21a8", fontWeight: 700, fontSize: "0.74rem", cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4, justifySelf: "start" }}>
                <Paperclip size={12} /> ไฟล์แนบของคำขอนี้ {ดูไฟล์ยกเลิก === r.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {ดูไฟล์ยกเลิก === r.id && <QuoteFilesBox requestId={r.id} uploadSide="dealer" canUpload={false} กลุ่มที่แสดง={["dealer"]} lockedReason="คำขอนี้ยกเลิกแล้ว" />}
            </div>
          ))}
        </div>
      )}

      {err && <div role="alert" style={{ marginTop: 8, fontSize: "0.76rem", color: "#dc2626", fontWeight: 600 }}>{err}</div>}
    </div>
  );
}
