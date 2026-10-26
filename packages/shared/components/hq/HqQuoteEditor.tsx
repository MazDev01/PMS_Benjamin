"use client";

// ─── HQ · ทำ BOQ และส่งใบ HQ ให้ดีลเลอร์ (FLOW.html ขั้น 5–6 · ด่าน 2) ─────────────────────────────────────────
//
// ขั้น 5  ทำ BOQ — HQ พิมพ์รายการเอง (ชื่อ · จำนวน · หน่วย · ต้นทุน) · บันทึกร่างกี่ครั้งก็ได้ ดีลเลอร์ไม่เห็นร่าง
//         แม่แบบวัสดุ (บอสสั่ง 26 ต.ค. 69 · ใบ 0244): ใบเปิดมามีรายการวัสดุที่ดีลเลอร์เลือกในคำขอ · เพิ่มจากแม่แบบได้ (ค้นได้)
//         แม่แบบอาคารแบบเดิมยังเอาออก (16 ต.ค. 69) · หัวใบแสดงราคาประเมินของดีลเลอร์ + % คลาดหลังส่ง
// ขั้น 6  ส่งใบ HQ — ล็อกเวอร์ชัน · หยุดนับ 14 วัน · อีเมลถึงดีลเลอร์ · ลูกค้าเป้าหมายคงเดิม (ฐานข้อมูลทำทั้งหมด)
// ส่งแล้วแก้ไม่ได้ (กฎ "ใบ HQ ที่ส่งแล้วแก้ไม่ได้ ต้องออกเวอร์ชันใหม่") — แผงนี้แสดงแบบอ่านอย่างเดียว
//   เวอร์ชันใหม่เกิดเมื่อดีลเลอร์ "ขอแก้ราคา" → คำขอใหม่ · HQ กด "เริ่มจากใบเวอร์ชันก่อน" แล้วแก้ต่อ
// ให้ใช้ง่าย (บอสสั่ง 26 ต.ค. 69):
//   • หัวใบ = กล่องข้อมูลคำขอกล่องเดียว (งาน · พื้นที่ · จังหวัด · ดีลเลอร์ · กำหนดส่ง + เหลือกี่วัน) · สเปกยาวย่อไว้ กด "ดูทั้งหมด"
//   • BOQ เปิดมามีแถวว่างพร้อมพิมพ์ 1 แถว · ตารางเป็นคอมโพเนนต์กลาง BoqTable (Enter แถวใหม่ · วางจาก Excel · หน่วย · เฉลี่ยบาท/ตร.ม.)
//     รายการจากแหล่งอื่น (แม่แบบวัสดุ · คำขอดีลเลอร์) เข้าทาง BoqTable แหล่ง → แทรกรายการ() ทางเดียว
//   • ยอดรวม = "ราคาส่งดีลเลอร์ (ก่อน VAT)" — ตรงกับฐาน: total_cost = ผลรวม qty×unitCost ไม่รวม VAT · ดีลเลอร์บวก % จากราคานี้
//   • ส่งได้เมื่อมีอย่างน้อย 1 รายการและยอด > 0 (บอกเหตุผลข้างปุ่ม · ฐานกันด้วย quote_empty ใน hq_quote_send)
//   • ยืนราคาถึงแสดง พ.ศ. (ThaiDateInput · ตัวจัดรูปกลาง fmtISOToThai)
//   • ร่างที่พิมพ์ค้างไม่หายเมื่อสลับไปคำขออื่น — เก็บไว้ในที่เก็บร่างของหน้า (ร่างค้าง) แล้วคืนให้เมื่อกลับมา
import { useEffect, useMemo, useState } from "react";
import { Send, X, Copy, Lock, Boxes, ClipboardList } from "lucide-react";
import { quoteRequests as repo } from "@pms/shared/lib/data";
import {
  type QuoteRequest, type HqQuote, type HqQuoteLine, type แถววาง, hqQuoteStatusLabel, ยอดรวมใบ, วันไทยสั้น, เกินกำหนด,
  แถวว่าง, แถวเปล่าใหม่, เหลือหรือเกิน,
} from "@pms/shared/lib/quoteRequests";
import { ModalCard } from "@pms/shared/components/ui/ModalCard";
import { BoqTable, type แหล่งรายการ } from "@pms/shared/components/hq/BoqTable";
import { MaterialTemplatePicker } from "@pms/shared/components/hq/MaterialTemplatePicker";
import { รายการประเมินเป็นแถวHQ, ป้ายราคาประเมิน, ป้ายเปอร์เซ็นต์คลาด } from "@pms/shared/lib/materialTemplates";
import { ThaiDateInput } from "@pms/shared/components/ui/ThaiDateInput";
import { ช่อง as ป้ายช่อง, กลุ่มช่อง } from "@pms/shared/lib/fieldLabels";
import { ยืนยัน, แจ้งพลาด, แจ้งสำเร็จ } from "@pms/shared/components/ui/ConfirmToast";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { logRepoRead } from "@pms/shared/lib/repoLog";

const NAVY = "#003366";
const บาท = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const วันนี้ไทย = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
/** วันยืนราคาตั้งต้น = 30 วันจากวันนี้ (เวลาไทย) */
const วันยืนราคาตั้งต้น = () => new Date(Date.now() + 7 * 3_600_000 + 30 * 86_400_000).toISOString().slice(0, 10);
/** สเปกยาวเกินนี้ = ย่อไว้ก่อน กด "ดูทั้งหมด" */
const สเปกยาว = 160;

/** ร่างที่พิมพ์ค้าง (ยังไม่บันทึก) ของคำขอหนึ่ง — หน้าแม่ถือไว้ข้ามการสลับคำขอ */
export type ร่างใบHQ = { lines: แถววาง[]; validUntil: string; note: string };

export function HqQuoteEditor({ request, dealerName, onClose, onChanged, inline = false, headerExtra, onDirtyChange, onBusyChange, ร่างค้าง }: {
  request: QuoteRequest;
  dealerName: string;
  onClose: () => void;
  /** ฝังในหน้า (กล่องงานคำขอราคา · หน้า 5) แทนหน้าต่างลอย — ใช้เนื้อหาชุดเดียวกัน · เป็นพื้นที่ชื่อ "ใบ HQ" */
  inline?: boolean;
  /** ปุ่มเพิ่มบนหัว (เช่น "รับเรื่อง" ของคำขอใหม่) — แสดงเฉพาะแบบฝังในหน้า */
  headerExtra?: React.ReactNode;
  /** มีการแก้ที่ยังไม่บันทึกหรือไม่ — หน้าแม่ใช้เตือนก่อนออกจากหน้า */
  onDirtyChange?: (dirty: boolean) => void;
  /** กำลังบันทึก/ส่งใบ — หน้าแม่ห้ามเปลี่ยนแถวจนกว่าจะเสร็จ (เปลี่ยนระหว่างรอคำตอบ = ต้นเหตุข้อไม่นิ่งรอบก่อน ๆ) */
  onBusyChange?: (busy: boolean) => void;
  /** สถานะคำขอเปลี่ยน (รับเรื่อง/ส่งใบ) — ให้คิวโหลดใหม่ */
  onChanged: () => void;
  /** ที่เก็บร่างค้างของหน้า (คีย์ = เลขคำขอ) — สลับคำขอแล้วกลับมา ร่างที่พิมพ์ไว้ยังอยู่ */
  ร่างค้าง?: Map<number, ร่างใบHQ>;
}) {
  const [ใบ, setใบ] = useState<HqQuote | null | undefined>(undefined);
  const [ใบก่อน, setใบก่อน] = useState<HqQuote | null>(null);
  const [lines, setLines] = useState<แถววาง[]>([]);
  const [ยืนราคาถึง, setยืนราคาถึง] = useState(วันยืนราคาตั้งต้น());
  const [หมายเหตุ, setหมายเหตุ] = useState("");
  const [busy, setBusy] = useState(false);
  const [กู้ร่าง, setกู้ร่าง] = useState(false);
  const [สเปกเต็ม, setสเปกเต็ม] = useState(false);
  // หน้าต่างเลือกจากแม่แบบวัสดุ — เก็บตัวแทรกของตาราง (BoqTable แหล่ง) ไว้ส่งรายการกลับ
  const [แทรกแม่แบบ, setแทรกแม่แบบ] = useState<((rows: แถววาง[]) => void) | null>(null);
  // ภาพของใบตอนโหลด/บันทึกล่าสุด — ต่างจากที่อยู่บนจอ = มีการแก้ที่ยังไม่บันทึก (แถวว่างไม่นับ)
  const [ภาพที่บันทึก, setภาพที่บันทึก] = useState<string | null>(null);
  const ภาพ = (ls: HqQuoteLine[], v: string, n: string) =>
    JSON.stringify([ls.filter(l => !แถวว่าง(l)).map(l => [l.name, Number(l.qty), l.unit, Number(l.unitCost)]), v, n]);

  useEffect(() => {
    let alive = true;
    repo.hqQuoteFor(request.id).then(h => {
      if (!alive) return;
      setใบ(h);
      const แก้ได้ตอนโหลด = (!h || h.status === "draft") && (request.status === "new" || request.status === "pricing");
      const บันทึกแล้ว = h ? h.lineItems : [];
      const ยืน = h?.validUntil ?? วันยืนราคาตั้งต้น();
      setภาพที่บันทึก(ภาพ(บันทึกแล้ว, ยืน, h?.note ?? ""));
      const ร่าง = แก้ได้ตอนโหลด ? ร่างค้าง?.get(request.id) : undefined;
      if (ร่าง) {
        setLines(ร่าง.lines); setยืนราคาถึง(ร่าง.validUntil); setหมายเหตุ(ร่าง.note); setกู้ร่าง(true);
      } else {
        // ใบที่แก้ได้และยังไม่มีรายการ: มีวัสดุจากคำขอ = เปิดมามีรายการนั้น (H8 · ใบ 0244) · ไม่มี = แถวว่างพร้อมพิมพ์ 1 แถว
        //   รายการจากคำขอนับเป็นจุดเริ่ม (ไม่ถือว่าแก้ค้าง) — ออกไปแล้วกลับมาก็เปิดมาเหมือนเดิม
        const จากคำขอ = รายการประเมินเป็นแถวHQ(request.estimateItems);
        const เริ่ม = แก้ได้ตอนโหลด && บันทึกแล้ว.length === 0 ? (จากคำขอ.length ? จากคำขอ : [แถวเปล่าใหม่()]) : บันทึกแล้ว;
        if (แก้ได้ตอนโหลด && บันทึกแล้ว.length === 0 && จากคำขอ.length) setภาพที่บันทึก(ภาพ(จากคำขอ, ยืน, h?.note ?? ""));
        setLines(เริ่ม);
        setยืนราคาถึง(ยืน); setหมายเหตุ(h?.note ?? "");
      }
    }).catch(e => {
      logRepoRead("quoteRequests.hqQuoteFor", e);
      if (alive) { setใบ(null); setLines([แถวเปล่าใหม่()]); setภาพที่บันทึก(ภาพ([], วันยืนราคาตั้งต้น(), "")); }
    });
    // ขอแก้ราคา: ใบเวอร์ชันก่อนหน้า (ใช้เป็นจุดเริ่มของเวอร์ชันใหม่)
    if (request.supersedesId) repo.hqQuoteFor(request.supersedesId).then(h => alive && setใบก่อน(h)).catch(e => logRepoRead("quoteRequests.hqQuoteFor(prev)", e));
    return () => { alive = false; };
  }, [request.id, request.supersedesId]); // eslint-disable-line react-hooks/exhaustive-deps

  const ล็อก = !!ใบ && ใบ.status !== "draft";
  const แก้ได้ = !ล็อก && (request.status === "new" || request.status === "pricing");
  const ใช้ = useMemo(() => lines.filter(l => !แถวว่าง(l)), [lines]);
  const รวม = useMemo(() => ยอดรวมใบ(ใช้), [ใช้]);
  const พื้นที่ = Number(request.area) > 0 ? Number(request.area) : null;
  const ปัญหา = useMemo(() => {
    if (ใช้.length === 0) return "ยังไม่มีรายการ — พิมพ์อย่างน้อย 1 รายการ";
    if (ใช้.some(l => l.เตือน)) return "มีแถวที่อ่านไม่ได้ (ดูคำเตือนที่แถว) — แก้ก่อนส่ง";
    const ผิด = ใช้.find(l => !l.name.trim() || !(Number(l.qty) > 0) || !(Number(l.unitCost) >= 0));
    if (ผิด) return `รายการ "${ผิด.name || "ไม่มีชื่อ"}" ต้องมีชื่อ จำนวนมากกว่า 0 และต้นทุนต่อหน่วย`;
    if (รวม <= 0) return "ยอดรวมต้องมากกว่า 0";
    if (!ยืนราคาถึง) return "ต้องกำหนดวันยืนราคา";
    return "";
  }, [ใช้, รวม, ยืนราคาถึง]);

  const แก้ค้าง = แก้ได้ && ภาพที่บันทึก !== null && ภาพ(lines, ยืนราคาถึง, หมายเหตุ) !== ภาพที่บันทึก;
  useEffect(() => { onDirtyChange?.(แก้ค้าง); }, [แก้ค้าง, onDirtyChange]);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => () => { onDirtyChange?.(false); onBusyChange?.(false); }, [onDirtyChange, onBusyChange]);
  // เก็บร่างค้างไว้ที่หน้าแม่ทุกครั้งที่แก้ — สลับไปคำขออื่นแล้วกลับมา = ได้คืนครบ · บันทึกแล้ว/ไม่มีอะไรค้าง = ล้างทิ้ง
  useEffect(() => {
    if (!ร่างค้าง || ภาพที่บันทึก === null) return;
    if (แก้ค้าง) ร่างค้าง.set(request.id, { lines, validUntil: ยืนราคาถึง, note: หมายเหตุ });
    else ร่างค้าง.delete(request.id);
  }, [ร่างค้าง, request.id, แก้ค้าง, lines, ยืนราคาถึง, หมายเหตุ, ภาพที่บันทึก]);
  const บันทึก = async (): Promise<HqQuote | null> => {
    const clean: HqQuoteLine[] = ใช้.map(({ เตือน: _ไม่ใช้, ...l }) => ({ ...l, name: l.name.trim(), unit: l.unit.trim(), qty: Number(l.qty), unitCost: Number(l.unitCost) }));
    const h = await repo.saveHqQuote(request.id, clean, ยืนราคาถึง, หมายเหตุ);
    setใบ(h);
    setภาพที่บันทึก(ภาพ(clean, ยืนราคาถึง, หมายเหตุ));
    setกู้ร่าง(false);
    return h;
  };
  const กดบันทึก = async () => {
    setBusy(true);
    try { await บันทึก(); แจ้งสำเร็จ("บันทึกร่างใบ HQ แล้ว — ดีลเลอร์ยังไม่เห็นจนกว่าจะส่ง"); onChanged(); }
    catch (e) { แจ้งพลาด(friendlyError(e)); }
    finally { setBusy(false); }
  };
  const กดส่ง = async () => {
    if (ปัญหา) { แจ้งพลาด(ปัญหา); return; }
    const ตกลง = await ยืนยัน({
      หัวข้อ: `ส่งใบ HQ ให้ ${request.dealerCode} ?`,
      รายละเอียด: `ราคาส่งดีลเลอร์ (ก่อน VAT) ${บาท(รวม)} บาท · ยืนราคาถึง ${วันไทยสั้น(ยืนราคาถึง)} — ส่งแล้วแก้ไม่ได้ ถ้าต้องแก้ ดีลเลอร์ต้องขอแก้ราคาเป็นเวอร์ชันใหม่`,
      ปุ่มตกลง: "ส่งใบ HQ",
    });
    if (!ตกลง) return;
    setBusy(true);
    try {
      await บันทึก();
      const h = await repo.sendHqQuote(request.id);
      setใบ(h);
      แจ้งสำเร็จ(`ส่งใบ ${h.quoteNo} ให้ดีลเลอร์แล้ว`);
      onChanged();
    } catch (e) { แจ้งพลาด(friendlyError(e)); }
    finally { setBusy(false); }
  };
  const เริ่มจากใบก่อน = async () => {
    if (!ใบก่อน) return;
    setBusy(true);
    try {
      const h = await repo.copyHqQuote(request.id, ใบก่อน.id);
      setใบ(h); setLines(h.lineItems); setยืนราคาถึง(h.validUntil ?? วันยืนราคาตั้งต้น()); setหมายเหตุ(h.note);
      setภาพที่บันทึก(ภาพ(h.lineItems, h.validUntil ?? วันยืนราคาตั้งต้น(), h.note));
      แจ้งสำเร็จ(`เริ่มเวอร์ชันใหม่จาก ${ใบก่อน.quoteNo} แล้ว — แก้รายการแล้วส่งได้เลย`);
      onChanged();
    } catch (e) { แจ้งพลาด(friendlyError(e)); }
    finally { setBusy(false); }
  };

  const ช่อง: React.CSSProperties = { width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 8px", fontSize: "0.84rem" };
  const ป้ายข้อมูล: React.CSSProperties = { fontSize: "0.7rem", color: "#6b7280", fontWeight: 700 };
  const ค่าข้อมูล: React.CSSProperties = { fontSize: "0.84rem", color: "#1f2937", fontWeight: 600 };
  const สเปก = request.spec?.trim() ?? "";
  const ต้องย่อสเปก = สเปก.length > สเปกยาว || สเปก.split("\n").length > 3;
  const เหลือ = เหลือหรือเกิน(request.dueAt);
  // ชุดช่องมาตรฐาน (บอสสั่ง 26 ต.ค. 69 · lib/fieldLabels.ts): ข้อมูลลูกค้า + ข้อมูลงาน ชุดเดียวกับลีด ในกล่องเดียว
  const ข้อมูลลูกค้า: [string, React.ReactNode, string][] = [
    [ป้ายช่อง.บริษัท, request.leadCompany || "—", "company"],
    [ป้ายช่อง.ผู้ติดต่อ, request.leadContact || "—", "contact"],
    [ป้ายช่อง.โทรศัพท์, request.leadPhone || "—", "phone"],
    [ป้ายช่อง.อีเมล, request.leadEmail || "—", "email"],
    [ป้ายช่อง.ที่อยู่, request.leadAddress || "—", "address"],
  ];
  const ข้อมูลคำขอ: [string, React.ReactNode, string][] = [
    [ป้ายช่อง.จังหวัด, request.province || "—", "province"],
    [ป้ายช่อง.งาน, `${request.product || "—"}${request.subtype ? ` · ${request.subtype}` : ""}`, "job"],
    [ป้ายช่อง.พื้นที่, พื้นที่ ? พื้นที่.toLocaleString() : "—", "area"],
    ...(request.estimateTotal != null ? [["ราคาประเมินของดีลเลอร์", (
      <>{บาท(Number(request.estimateTotal))} บาท <span style={{ fontWeight: 500, color: "#6b7280" }}>({(request.estimateItems ?? []).length} วัสดุ · {ป้ายราคาประเมิน}
        {request.estimateDeviationPct != null ? ` · คลาดจากใบ HQ ${ป้ายเปอร์เซ็นต์คลาด(request.estimateDeviationPct)}` : ""})</span></>
    ), "estimate"] as [string, React.ReactNode, string]] : []),
    ["ดีลเลอร์", `${request.dealerCode} ${dealerName}`.trim(), "dealer"],
  ];
  // แหล่งรายการของตาราง BOQ กลาง (ไม่รื้อตาราง — ส่งปุ่มเข้าไปทาง แหล่ง)
  const จากคำขอ = รายการประเมินเป็นแถวHQ(request.estimateItems);
  const แหล่ง: แหล่งรายการ[] = [
    { key: "material-templates", label: "เลือกจากแม่แบบวัสดุ", icon: Boxes, เปิด: แทรก => setแทรกแม่แบบ(() => แทรก) },
    { key: "request-items", label: "รายการจากคำขอดีลเลอร์", icon: ClipboardList, disabled: จากคำขอ.length === 0, เปิด: แทรก => แทรก(จากคำขอ) },
  ];
  const เนื้อหา = (
    <>
        <div style={{ background: NAVY, color: "#fff", padding: "16px 22px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: "1.02rem", fontWeight: 800 }}>
              ใบ HQ · {request.requestNo}{ใบ ? ` · ${ใบ.quoteNo}` : ""}
            </h2>
            <div style={{ fontSize: "0.78rem", opacity: 0.85, marginTop: 2 }}>
              {request.dealerCode} {dealerName} · {request.leadCompany || "—"}
            </div>
          </div>
          {ใบ && <span className="badge" style={{ background: ล็อก ? "#dcfce7" : "#fef3c7", color: ล็อก ? "#166534" : "#92400e" }}>{hqQuoteStatusLabel[ใบ.status]}</span>}
          {inline && headerExtra}
          {!inline && <button type="button" onClick={onClose} disabled={busy} aria-label="ปิด" style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", display: "flex" }}><X size={18} /></button>}
        </div>

        {/* minmax(0,1fr): ตาราง BOQ กว้างเกินจอแคบ = เลื่อนในกรอบตัวเอง ไม่ดันทั้งแผงล้นขอบ (หน้า 5 แบบฝังในหน้า) */}
        <div style={{ padding: "16px 22px", display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14 }}>
          {/* สิ่งที่ดีลเลอร์ขอ — กล่องเดียว */}
          <div data-box="request-info" style={{ background: "#f8fafc", border: "1px solid #eef1f5", borderRadius: 12, padding: "12px 14px", display: "grid", gap: 10 }}>
            <span style={{ ...ป้ายข้อมูล, color: NAVY }}>{กลุ่มช่อง.ลูกค้า}</span>
            <div data-group="customer" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px 16px" }}>
              {ข้อมูลลูกค้า.map(([ป้าย, ค่า, key]) => (
                <div key={key} data-info={key} style={{ display: "grid", gap: 2, minWidth: 0 }}>
                  <span style={ป้ายข้อมูล}>{ป้าย}</span>
                  <span style={{ ...ค่าข้อมูล, overflowWrap: "anywhere" }}>{ค่า}</span>
                </div>
              ))}
            </div>
            <span style={{ ...ป้ายข้อมูล, color: NAVY, borderTop: "1px solid #eef1f5", paddingTop: 8 }}>{กลุ่มช่อง.งาน}</span>
            <div data-group="job" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px 16px" }}>
              {ข้อมูลคำขอ.map(([ป้าย, ค่า, key]) => (
                <div key={key} data-info={key} style={{ display: "grid", gap: 2, minWidth: 0 }}>
                  <span style={ป้ายข้อมูล}>{ป้าย}</span>
                  <span style={{ ...ค่าข้อมูล, overflowWrap: "anywhere" }}>{ค่า}</span>
                </div>
              ))}
              {request.status !== "quoted" && (
                <div data-info="due" style={{ display: "grid", gap: 2, minWidth: 0 }}>
                  <span style={ป้ายข้อมูล}>กำหนดส่งใบ HQ</span>
                  <span style={ค่าข้อมูล}>
                    {วันไทยสั้น(request.dueAt)}{" "}
                    <span data-testid="due-countdown" style={{ fontSize: "0.76rem", fontWeight: 800, color: เกินกำหนด(request) ? "#b91c1c" : "#166534" }}>({เหลือ})</span>
                  </span>
                </div>
              )}
            </div>
            <div style={{ display: "grid", gap: 2 }}>
              <span style={ป้ายข้อมูล}>{ป้ายช่อง.สเปก}</span>
              <span data-testid="request-spec" style={{ fontSize: "0.82rem", color: "#374151", whiteSpace: "pre-wrap",
                ...(ต้องย่อสเปก && !สเปกเต็ม ? { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" } : {}) }}>{สเปก || "—"}</span>
              {ต้องย่อสเปก && (
                <button type="button" onClick={() => setสเปกเต็ม(v => !v)} aria-expanded={สเปกเต็ม}
                  style={{ justifySelf: "start", background: "none", border: "none", padding: 0, color: NAVY, fontWeight: 700, fontSize: "0.78rem", cursor: "pointer", fontFamily: "inherit" }}>
                  {สเปกเต็ม ? "ย่อ" : "ดูทั้งหมด"}
                </button>
              )}
            </div>
          </div>

          {ใบ === undefined && <div style={{ color: "#9ca3af", fontSize: "0.84rem" }}>กำลังโหลด…</div>}

          {กู้ร่าง && แก้ได้ && (
            <div role="status" data-testid="draft-restored" style={{ display: "flex", alignItems: "center", gap: 8, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "8px 12px", fontSize: "0.8rem", color: "#92400e" }}>
              ร่างที่พิมพ์ค้างไว้ยังอยู่ครบ — ยังไม่ได้บันทึกเข้าระบบ กด "บันทึกร่าง" เพื่อเก็บไว้
            </div>
          )}

          {ใบ !== undefined && !ใบ && ใบก่อน && แก้ได้ && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#eff6ff", borderRadius: 12, padding: "10px 14px", fontSize: "0.82rem" }}>
              <span style={{ flex: 1 }}>ดีลเลอร์ขอแก้ราคาจาก {ใบก่อน.quoteNo} — เริ่มเวอร์ชันใหม่จากรายการเดิมแล้วแก้ต่อได้</span>
              <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void เริ่มจากใบก่อน()}><Copy size={13} /> เริ่มจากใบเวอร์ชันก่อน</button>
            </div>
          )}

          {ใบ !== undefined && (
            <>
              {ล็อก && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#166534", background: "#f0fdf4", borderRadius: 12, padding: "10px 14px", fontSize: "0.82rem" }}>
                  <Lock size={14} /> ส่งให้ดีลเลอร์แล้ว{ใบ?.sentAt ? ` ${วันไทยสั้น(ใบ.sentAt)}` : ""}{ใบ?.sentByName ? ` โดย ${ใบ.sentByName}` : ""} — ใบนี้แก้ไม่ได้ ถ้าต้องแก้ ดีลเลอร์ต้องขอแก้ราคาเป็นเวอร์ชันใหม่
                </div>
              )}
              {/* ตาราง BOQ กลาง (BoqTable) — แหล่งรายการเพิ่ม (แม่แบบวัสดุ · รายการจากคำขอดีลเลอร์) ส่งเข้ามาทาง แหล่ง โดยไม่รื้อตาราง */}
              <BoqTable lines={lines} onChange={setLines} editable={แก้ได้} area={พื้นที่} แหล่ง={แหล่ง} />
              {แทรกแม่แบบ && <MaterialTemplatePicker onAdd={rows => แทรกแม่แบบ(rows)} onClose={() => setแทรกแม่แบบ(null)} />}

              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <div style={{ display: "grid", gap: 4, fontSize: "0.8rem", fontWeight: 600, color: "#374151" }}>
                  <span>ยืนราคาถึง</span>
                  {แก้ได้
                    ? <ThaiDateInput ariaLabel="ยืนราคาถึง" value={ยืนราคาถึง} min={วันนี้ไทย()} onChange={setยืนราคาถึง} />
                    : <span style={{ fontWeight: 400 }}>{ใบ?.validUntil ? วันไทยสั้น(ใบ.validUntil) : "—"}</span>}
                </div>
                <label style={{ display: "grid", gap: 4, fontSize: "0.8rem", fontWeight: 600, color: "#374151", flex: 1, minWidth: 240 }}>
                  หมายเหตุถึงดีลเลอร์
                  {แก้ได้
                    ? <input aria-label="หมายเหตุถึงดีลเลอร์" value={หมายเหตุ} onChange={e => setหมายเหตุ(e.target.value)} style={{ ...ช่อง, height: 36 }} placeholder="เช่น ราคานี้ยังไม่รวมฐานราก" />
                    : <span style={{ fontWeight: 400 }}>{ใบ?.note || "—"}</span>}
                </label>
              </div>

              {แก้ได้ && (
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
                  {ปัญหา && <span data-testid="send-blocked-reason" style={{ fontSize: "0.78rem", color: "#92400e", marginRight: "auto", fontWeight: 600 }}>ส่งไม่ได้: {ปัญหา}</span>}
                  {/* ปุ่มรองที่เห็นชัด — ขอบ/ตัวหนังสือสีน้ำเงิน (เดิม btn-outline จางจนแทบไม่เห็น) */}
                  <button type="button" className="btn btn-md" disabled={busy || ใช้.length === 0} onClick={() => void กดบันทึก()}
                    style={{ background: "#fff", color: NAVY, border: `1.5px solid ${NAVY}`, fontWeight: 700, opacity: busy || ใช้.length === 0 ? 0.5 : 1, cursor: busy || ใช้.length === 0 ? "not-allowed" : "pointer" }}>
                    บันทึกร่าง
                  </button>
                  <button type="button" className="btn btn-primary btn-md" disabled={busy || !!ปัญหา} onClick={() => void กดส่ง()}
                    style={{ opacity: busy || ปัญหา ? 0.45 : 1, cursor: busy || ปัญหา ? "not-allowed" : "pointer" }}>
                    <Send size={14} /> ส่งใบ HQ ให้ดีลเลอร์
                  </button>
                </div>
              )}
            </>
          )}
        </div>
    </>
  );
  if (inline) return (
    <section aria-label="ใบ HQ" style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", overflow: "hidden" }}>{เนื้อหา}</section>
  );
  return (
    <div onClick={() => !busy && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.42)", zIndex: 1050, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <ModalCard onClose={() => !busy && onClose()} label="ใบ HQ" className="modal-fit"
        style={{ width: 960, maxWidth: "100%", maxHeight: "92vh", overflow: "auto", background: "#fff", borderRadius: 18, boxShadow: "0 24px 80px rgba(0,0,0,.28)" }}>
        {เนื้อหา}
      </ModalCard>
    </div>
  );
}
