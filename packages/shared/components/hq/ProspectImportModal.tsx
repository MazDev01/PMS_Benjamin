"use client";

// ── นำเข้าผู้สนใจเป็นดีลเลอร์จากไฟล์ทำงานจริงของทีม (HQ · ใบ 0275 · บอสสั่ง 3 พ.ย. 69) ─────────────────────────────────────
//   ขั้น: อัปโหลด → จับคู่คอลัมน์ (ระบบเดา แก้ได้ จำไว้ครั้งหน้าตามหัวตาราง) → ตรวจ 3 กลุ่ม พร้อม/ต้องตรวจ/ข้าม → นำเข้า → สรุป + ดาวน์โหลดแถวที่ข้าม
//   ไม่บังคับใช้แม่แบบ: หาแถวหัวตารางเอง · ข้ามแถวหัวข้อแทรก · แยกแถวรวมช่องเดียว · จับคู่จังหวัด 77 · ถามปีครั้งเดียว · ตารางแปลงช่องทางแก้ได้
//   ฐานตัดสินสุดท้าย (เบอร์ซ้ำ · ขั้น · จังหวัด · ไม่เกิน 1,000 แถว · ทั้งชุด) · ยกเลิกทั้งชุดได้ · ตรรกะล้วนอยู่ lib/prospectImport.ts
import { ตัวเลือกฟอร์ม, type ตัวเลือกกลาง } from "@pms/shared/lib/optionLists";
import { fmtISOToThai } from "@pms/shared/lib/mock";
import { APP_NOW_ISO } from "@pms/shared/lib/appTime";
import { useEffect, useMemo, useState } from "react";
import { X, Download, Check, Undo2, Upload } from "lucide-react";
import { ModalPortal } from "@pms/shared/components/ui/ModalPortal";
import { ModalCard } from "@pms/shared/components/ui/ModalCard";
import { ยืนยัน, แจ้งสำเร็จ, แจ้งพลาด } from "@pms/shared/components/ui/ConfirmToast";
import { prospects as prospectsRepo } from "@pms/shared/lib/data";
import type { ชุดนำเข้าผู้สนใจ, ผลนำเข้าผู้สนใจ } from "@pms/shared/lib/data/types";
import { สร้างไฟล์Xlsx, ดาวน์โหลดไฟล์ } from "@pms/shared/lib/exportWorkbook";
import { อ่านสมุดงานจากไฟล์ } from "@pms/shared/lib/importSheet";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { ดาวบังคับ, FieldError, useRequiredFields } from "@pms/shared/components/ui/FieldLabel";
import {
  หาแถวหัวตาราง, เดาคอลัมน์, ลายเซ็นหัว, เตรียมแถว, จัดกลุ่ม, แถวส่งฐาน, เลือกวันที่, type ช่องวันที่, คีย์ช่องทาง, จังหวัดทั้งหมด,
  ชื่อช่องนำเข้า, นำเข้าได้สูงสุด, type การจับคู่, type ช่องนำเข้า, type แถวนำเข้า, type ขั้นนำเข้า, type กลุ่มแถว,
} from "@pms/shared/lib/prospectImport";
import { เป็นไฟล์เฟซบุ๊ก, เตรียมแถวเฟซบุ๊ก, สรุปเฟซบุ๊ก, แถวเฟซบุ๊กส่งฐาน, เป็นแถวซ้ำ, ข้อมูลไม่ครบ, หัวไฟล์เฟซบุ๊ก, type แถวเฟซบุ๊ก } from "@pms/shared/lib/facebookLeadImport";
import { apiFetch } from "@pms/shared/lib/data/http/HttpAdapter";
import { เตือนตัวตั้งเวลา, วันเวลาไทย, type สถานะดึงชีต } from "@pms/shared/lib/prospectSheetSync";
import { ดึงชีตผู้สนใจตอนนี้ } from "@pms/shared/lib/adminApi";

const ที่จำ = "bpms_prospect_import_map";
// ลิงก์ Google Sheets เก็บที่ฐาน (ตั้งค่าดึงอัตโนมัติแถวเดียว · ใบ 0295 · คนรวมงานสั่ง 23 พ.ย. 69 ไม่ใช่ localStorage)
/** แบบฟอร์มตัวอย่าง = หัวตารางเดียวกับไฟล์ Facebook (บอสสั่ง 20 พ.ย. 69 · ย้ายจากเมนูเข้ามาในหน้าต่าง) */
const ดาวน์โหลดแบบฟอร์ม = () => ดาวน์โหลดไฟล์(สร้างไฟล์Xlsx([{ ชื่อ: "ผู้สนใจ", หัวตาราง: [...หัวไฟล์เฟซบุ๊ก], แถว: [] }]), "แบบฟอร์มนำเข้าผู้สนใจ.xlsx");
const ขั้นที่นำเข้าได้: { k: ขั้นนำเข้า; label: string }[] = [
  { k: "new", label: "รอติดต่อ" }, { k: "contacted", label: "ติดต่อแล้ว" }, { k: "profile_sent", label: "ส่งข้อมูลบริษัทแล้ว" }, { k: "lost", label: "ไม่สำเร็จ" },
];
// กลุ่มหน้าตัวอย่าง (บอสสั่ง 23 พ.ย. 69 · ใบ 0295): เบอร์ซ้ำ/ข้อมูลไม่ครบ = นำเข้าด้วย · เคยนำเข้าแล้ว = ข้าม (แถวเดิมของชีต)
type กลุ่มเฟซบุ๊ก = "import" | "dup" | "short" | "noprov" | "already" | "skip";
const ในกลุ่มเฟซบุ๊ก = (r: แถวเฟซบุ๊ก, g: กลุ่มเฟซบุ๊ก) =>
  g === "import" ? !r.ข้าม : g === "dup" ? เป็นแถวซ้ำ(r) : g === "short" ? ข้อมูลไม่ครบ(r) : g === "noprov" ? !r.ข้าม && !r.province
    : g === "already" ? r.ชนิดข้าม === "เคยนำเข้า" : !!r.ข้าม && r.ชนิดข้าม !== "เคยนำเข้า";
const ป้ายเล็ก = (สี: "amber" | "red"): React.CSSProperties => ({ marginLeft: 6, fontSize: "0.66rem", fontWeight: 700, borderRadius: 6, padding: "1px 6px", whiteSpace: "nowrap",
  ...(สี === "amber" ? { color: "#b45309", background: "#fff8e6", border: "1px solid #f5d78e" } : { color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca" }) });
const ป้ายกลุ่ม: Record<กลุ่มแถว, string> = { ready: "พร้อม", review: "ต้องตรวจ", skip: "ข้าม" };
const ปีพศนี้ = () => new Date(Date.now() + 7 * 3_600_000).getUTCFullYear() + 543;
const อ่านที่จำ = (): Record<string, การจับคู่> => { try { return JSON.parse(localStorage.getItem(ที่จำ) ?? "{}"); } catch { return {}; } };
const จำ = (ลาย: string, คู่: การจับคู่) => { try { localStorage.setItem(ที่จำ, JSON.stringify({ ...อ่านที่จำ(), [ลาย]: คู่ })); } catch { /* จำไม่ได้ = ครั้งหน้าเดาใหม่ */ } };

export function ProspectImportModal({ open, onClose, onImported, เบอร์ที่มีอยู่, รายที่มีอยู่, แหล่งที่มา, เหตุผลไม่สำเร็จ }: {
  open: boolean; onClose: () => void; onImported: () => void;
  /** เบอร์ของผู้สนใจที่มีอยู่ (ตรวจซ้ำก่อนส่ง · ฐานตรวจอีกชั้น) */
  เบอร์ที่มีอยู่: string[];
  /** ผู้สนใจที่มีอยู่ เบอร์ + ชื่อ — หน้าตัวอย่างไฟล์ Facebook บอกว่าซ้ำกับใคร (บอส 20 พ.ย. 69 "ซ้ำยังไง") · ไม่ส่ง = ใช้เบอร์อย่างเดียว */
  รายที่มีอยู่?: { phone: string; name: string }[];
  /** รายการแหล่งที่มาของหน้าตั้งค่า (จับคู่ค่าในไฟล์จากชื่อ · ตารางแปลงช่องทางเลือกจากนี้) */
  แหล่งที่มา: string[];
  /** รายการกลาง "เหตุผลผู้สนใจไม่สำเร็จ" (ใบ 0296 · เก็บรหัส) */
  เหตุผลไม่สำเร็จ: ตัวเลือกกลาง[];
}) {
  const [ไฟล์, setไฟล์] = useState<{ ชื่อ: string; ตาราง: string[][] } | null>(null);
  const [แถวหัว, setแถวหัว] = useState(-1);
  const [คู่, setคู่] = useState<การจับคู่>({});
  const [ปี, setปี] = useState(ปีพศนี้());
  // ตารางแปลงช่องทาง: เริ่มว่าง — ค่าในไฟล์ที่ตรงชื่อในรายการจับคู่เอง · ไม่ตรง = HQ เลือกเอง หรือปล่อยไม่ระบุ (แถวขึ้นเตือนให้ตรวจ)
  const [ช่องทาง, setช่องทาง] = useState<Record<string, string>>({});
  const [แถว, setแถว] = useState<แถวนำเข้า[] | null>(null);
  const [หัวข้อที่ข้าม, setหัวข้อที่ข้าม] = useState(0);
  const [ดู, setดู] = useState<กลุ่มแถว>("review");
  const [กำลัง, setกำลัง] = useState(false);
  const [ผล, setผล] = useState<ผลนำเข้าผู้สนใจ | null>(null);
  const [พลาด, setพลาด] = useState("");
  const [ชุด, setชุด] = useState<ชุดนำเข้าผู้สนใจ[]>([]);
  // ไฟล์ลีดจาก Facebook Lead Ads (บอสสั่ง 20 พ.ย. 69 · ใบ 0292) — รู้จักจากหัว full_name + phone_number · อ่านทุกชีต · ไม่มีหน้าจับคู่คอลัมน์
  const [เฟซบุ๊ก, setเฟซบุ๊ก] = useState<แถวเฟซบุ๊ก[] | null>(null);
  const [ดูเฟซบุ๊ก, setดูเฟซบุ๊ก] = useState<กลุ่มเฟซบุ๊ก>("import");
  const [ลิงก์ชีต, setลิงก์ชีต] = useState("");
  const [กำลังดึงชีต, setกำลังดึงชีต] = useState(false);
  // ดึงอัตโนมัติทุกชั่วโมง (ใบ 0295): สถานะจากฐาน · สวิตช์ · บันทึก · ดึงตอนนี้ (ทางเดียวกับตัวตั้งเวลา)
  const [ซิงก์, setซิงก์] = useState<สถานะดึงชีต | null>(null);
  const [อัตโนมัติ, setอัตโนมัติ] = useState(false);
  const [กำลังตั้ง, setกำลังตั้ง] = useState(false);
  const [กำลังดึงตอนนี้, setกำลังดึงตอนนี้] = useState(false);
  const โหลดซิงก์ = () => apiFetch<สถานะดึงชีต>("/prospect-sheet").then(s => {
    // คำตอบไม่ใช่สถานะ (ไม่มี url) = ไม่แสดงส่วนดึงอัตโนมัติ ไม่ใช่หน้าพัง (deploy31: ได้ตารางชีตแทนสถานะ → .trim ของ undefined)
    if (!s || typeof s.url !== "string") { setซิงก์(null); return; }
    setซิงก์(s); setอัตโนมัติ(!!s.enabled); setลิงก์ชีต(v => v || s.url);
  }).catch(() => setซิงก์(null));
  useEffect(() => { if (open) void โหลดซิงก์(); }, [open]);
  const โหลดชุด = () => prospectsRepo.importBatches().then(setชุด).catch(() => setชุด([]));
  useEffect(() => { if (open) void โหลดชุด(); }, [open]);
  const ล้าง = () => { setไฟล์(null); setเฟซบุ๊ก(null); setแถว(null); setผล(null); setพลาด(""); setแถวหัว(-1); setคู่({}); };

  const หัว = ไฟล์ && แถวหัว >= 0 ? ไฟล์.ตาราง[แถวหัว] ?? [] : [];
  // ช่องทางดิบที่พบในไฟล์ (ทำตารางแปลงให้แก้)
  const ช่องทางในไฟล์ = useMemo(() => {
    if (!ไฟล์ || คู่.channel === undefined) return [];
    return [...new Set(ไฟล์.ตาราง.slice(แถวหัว + 1).map(r => String(r[คู่.channel!] ?? "").trim()).filter(Boolean))];
  }, [ไฟล์, คู่.channel, แถวหัว]);

  // อัปโหลดไฟล์ในหน้าต่าง (บอสสั่ง 23 พ.ย. 69 "ทำปุ่มอัพไฟล์ในนี้ด้วย" · ทับ 20 พ.ย. เฉพาะในหน้าต่าง — ปุ่มบนหน้ายังไม่มี)
  //   ตัวอ่าน .xlsx/.csv ตัวเดียวกับเดิม → รับสมุดงาน → หน้าตัวอย่าง Facebook / หน้าจับคู่คอลัมน์เดิม (ไม่มีทางที่สอง)
  async function เลือกไฟล์(f: File | undefined) {
    if (!f) return;
    ล้าง();
    try { await รับสมุดงาน(f.name, await อ่านสมุดงานจากไฟล์(f)); }
    catch (e) { setพลาด(`อ่านไฟล์ไม่ได้: ${friendlyError(e)}`); }
  }
  // ดึงจากลิงก์ Google Sheets (บอสสั่ง 20 พ.ย. 69) — เซิร์ฟเวอร์ดึงให้ (/api/v1/prospect-sheet) แล้วเข้าตัวอ่านเดียวกับไฟล์ (ไม่มีทางที่สอง)
  async function ดึงชีต() {
    const ลิงก์ = ลิงก์ชีต.trim();
    if (!/^https:\/\/docs\.google\.com\/spreadsheets\/d\//.test(ลิงก์)) { setพลาด("วางลิงก์ Google Sheets (https://docs.google.com/spreadsheets/d/…)"); return; }
    ล้าง(); setกำลังดึงชีต(true);
    try {
      const r = await apiFetch<{ fileName: string; sheets: [string, string[][]][] }>("/prospect-sheet", { method: "POST", body: JSON.stringify({ url: ลิงก์ }) });
      await รับสมุดงาน(r.fileName, new Map(r.sheets));
    } catch (e) { setพลาด(friendlyError(e)); }
    finally { setกำลังดึงชีต(false); }
  }
  async function รับสมุดงาน(ชื่อ: string, เล่ม: Map<string, string[][]>) {
    {
      const ตาราง = [...เล่ม.values()][0] ?? [];
      if (เป็นไฟล์เฟซบุ๊ก(เล่ม)) {
        // แถวที่เคยนำเข้าแล้ว (กุญแจจากฐาน · ใบ 0295) — อ่านไม่ได้ = แสดงเป็นจะนำเข้า (ฐานข้ามให้อีกชั้นตอนบันทึก)
        const กุญแจ = await apiFetch<string[]>("/prospect-import?view=keys").catch(() => [] as string[]);
        const ได้ = เตรียมแถวเฟซบุ๊ก(เล่ม, รายที่มีอยู่ ?? เบอร์ที่มีอยู่, APP_NOW_ISO, กุญแจ);
        setไฟล์({ ชื่อ, ตาราง }); setเฟซบุ๊ก(ได้); setดูเฟซบุ๊ก("import");
        if (!ได้.length) setพลาด("ไฟล์ Facebook นี้ไม่มีแถวข้อมูล");
        return;
      }
      const h = หาแถวหัวตาราง(ตาราง);
      setไฟล์({ ชื่อ, ตาราง });
      setแถวหัว(h);
      if (h >= 0) setคู่(อ่านที่จำ()[ลายเซ็นหัว(ตาราง[h])] ?? เดาคอลัมน์(ตาราง[h]));
      else setพลาด("หาแถวหัวตารางไม่เจอ (ต้องมีหัวคอลัมน์ เช่น เบอร์ · จังหวัด · ชื่อ) — เลือกแถวหัวตารางเองด้านล่าง");
    }
  }
  function ไปตรวจ() {
    if (!ไฟล์ || แถวหัว < 0) return;
    if (คู่.phone === undefined) { setพลาด("ต้องเลือกคอลัมน์เบอร์โทร (ใช้กันรายซ้ำ)"); return; }
    setพลาด("");
    จำ(ลายเซ็นหัว(หัว), คู่);
    const ได้ = เตรียมแถว(ไฟล์.ตาราง, แถวหัว, คู่, { ปี, วันนี้: APP_NOW_ISO, แหล่งที่มา, ช่องทาง, เหตุผลไม่สำเร็จ, เบอร์ที่มีอยู่ });
    setแถว(ได้.แถว); setหัวข้อที่ข้าม(ได้.หัวข้อที่ข้าม);
    setดู(ได้.แถว.some(r => r.กลุ่ม === "review") ? "review" : "ready");
  }
  const แก้แถว = (row: number, patch: Partial<แถวนำเข้า>) => setแถว(xs => xs && จัดกลุ่ม(xs.map(r => r.row === row ? { ...r, ...patch } : r), เบอร์ที่มีอยู่));
  // วันที่กำกวม (x.1): เลือกเดือนต่อแถว — ยังไม่เลือกครบ = ปุ่มยืนยันกดไม่ได้ (บอสสั่ง 4 พ.ย. 69)
  const เลือกเดือน = (row: number, ช่อง: ช่องวันที่, ค่า: string) => setแถว(xs => xs && จัดกลุ่ม(xs.map(r => r.row === row ? เลือกวันที่(r, ช่อง, ค่า) : r), เบอร์ที่มีอยู่));
  const นับ = (g: กลุ่มแถว) => (แถว ?? []).filter(r => r.กลุ่ม === g).length;
  // ช่องบังคับของแถวต้องตรวจ (บอสสั่ง 4 พ.ย. 69 · ตัวกลาง): ชื่อ · เหตุผล (ขั้นไม่สำเร็จ) — ขาด = กด "ยืนยัน" แล้วแถวยังต้องตรวจ กรอบแดง + ข้อความใต้ช่อง
  //   เบอร์: แถวไม่มีเบอร์ไปกลุ่มข้ามเอง (ฐานกันอีกชั้น ใบ 0276) จึงมีแค่ * ที่หัวคอลัมน์
  const บังคับ = useRequiredFields();
  const ยืนยันแถว = (r: แถวนำเข้า) => {
    if (!บังคับ.ตรวจ([
      { key: `name:${r.row}`, label: "ชื่อ", value: r.name, ข้อความ: "ต้องระบุชื่อ" },
      ...(r.status === "lost" ? [{ key: `reason:${r.row}`, label: "เหตุผล", value: r.lostReason, ข้อความ: "ต้องเลือกเหตุผลที่ไม่สำเร็จ" }] : []),
    ])) return;
    แก้แถว(r.row, { เหตุ: [] });
  };
  const พร้อม = (แถว ?? []).filter(r => r.กลุ่ม === "ready");

  async function นำเข้า() {
    if (!ไฟล์ || !พร้อม.length) return;
    if (พร้อม.length > นำเข้าได้สูงสุด) { setพลาด(`นำเข้าได้ครั้งละไม่เกิน ${นำเข้าได้สูงสุด.toLocaleString()} แถว — แบ่งไฟล์ก่อน`); return; }
    if (!(await ยืนยัน({ หัวข้อ: `นำเข้าผู้สนใจ ${พร้อม.length.toLocaleString()} ราย?`,
      รายละเอียด: `แถวต้องตรวจที่ยังไม่ยืนยัน ${นับ("review")} แถว และแถวข้าม ${นับ("skip")} แถว จะไม่ถูกนำเข้า · ยกเลิกทั้งชุดได้ภายหลัง`, ปุ่มตกลง: "นำเข้า" }))) return;
    setกำลัง(true); setพลาด("");
    try {
      const r = await prospectsRepo.importRows(ไฟล์.ชื่อ, พร้อม.map(แถวส่งฐาน));
      setผล(r); แจ้งสำเร็จ(`นำเข้าแล้ว ${r.inserted.toLocaleString()} ราย`); onImported(); void โหลดชุด();
    } catch (e) { setพลาด(`นำเข้าไม่สำเร็จ (ไม่มีแถวใดถูกบันทึก): ${friendlyError(e)}`); }
    finally { setกำลัง(false); }
  }
  const พร้อมเฟซบุ๊ก = (เฟซบุ๊ก ?? []).filter(r => !r.ข้าม);
  async function นำเข้าเฟซบุ๊ก() {
    if (!ไฟล์ || !พร้อมเฟซบุ๊ก.length) return;
    if (พร้อมเฟซบุ๊ก.length > นำเข้าได้สูงสุด) { setพลาด(`นำเข้าได้ครั้งละไม่เกิน ${นำเข้าได้สูงสุด.toLocaleString()} แถว — แบ่งไฟล์ก่อน`); return; }
    setกำลัง(true); setพลาด("");
    try {
      // ฐานข้ามแถวที่เคยนำเข้าแล้วอีกชั้นตอนบันทึก (กดซ้ำ/สองแท็บ/ตัวดึงอัตโนมัติพร้อมกัน = ไม่สร้างซ้ำ · ใบ 0295)
      const r = await prospectsRepo.importRows(ไฟล์.ชื่อ, พร้อมเฟซบุ๊ก.map(แถวเฟซบุ๊กส่งฐาน));
      setผล(r); แจ้งสำเร็จ(`นำเข้าแล้ว ${r.inserted.toLocaleString()} ราย`); onImported(); void โหลดชุด();
    } catch (e) { setพลาด(`นำเข้าไม่สำเร็จ (ไม่มีแถวใดถูกบันทึก): ${friendlyError(e)}`); }
    finally { setกำลัง(false); }
  }
  function ดาวน์โหลดที่ข้าม() {
    if (เฟซบุ๊ก) {
      const จากฐาน = new Map((ผล?.skipped ?? []).map(s => [String(s.row), s.reason]));
      const รายการ = เฟซบุ๊ก.filter(r => r.ข้าม || จากฐาน.has(r.row));
      const blob = สร้างไฟล์Xlsx([{ ชื่อ: "แถวที่ไม่ได้นำเข้า", หัวตาราง: ["ชีต:แถว", "เหตุผล", "full_name", "phone_number", "จังหวัดที่ลูกค้าพิมพ์", "created_time"],
        แถว: รายการ.map(r => [r.row, จากฐาน.get(r.row) ?? r.ข้าม ?? "", r.name, r.phone, r.จังหวัดเดิม, r.createdRaw]) }]);
      ดาวน์โหลดไฟล์(blob, `แถวที่ไม่ได้นำเข้า-${ไฟล์?.ชื่อ.replace(/\.[^.]+$/, "") ?? "ไฟล์"}.xlsx`);
      return;
    }
    if (!แถว) return;
    const จากฐาน = new Map((ผล?.skipped ?? []).map(s => [String(s.row), s.reason]));
    const รายการ = แถว.filter(r => r.กลุ่ม !== "ready" || จากฐาน.has(String(r.row)));
    const blob = สร้างไฟล์Xlsx([{ ชื่อ: "แถวที่ไม่ได้นำเข้า", หัวตาราง: ["แถว", "เหตุผล", "ชื่อ", "เบอร์", "จังหวัด", "ข้อความเดิม"],
      แถว: รายการ.map(r => [r.row, จากฐาน.get(String(r.row)) ?? (r.กลุ่ม === "review" ? `ยังไม่ยืนยัน: ${r.เหตุ.join(" · ")}` : r.เหตุ.join(" · ")),
        r.name, r.phone, r.province ?? "", r.เดิม ?? ""]) }]);
    ดาวน์โหลดไฟล์(blob, `แถวที่ไม่ได้นำเข้า-${ไฟล์?.ชื่อ.replace(/\.[^.]+$/, "") ?? "ไฟล์"}.xlsx`);
  }
  async function ยกเลิกชุด(b: ชุดนำเข้าผู้สนใจ) {
    if (!(await ยืนยัน({ หัวข้อ: `ยกเลิกการนำเข้า "${b.fileName}" ทั้งชุด?`, รายละเอียด: `ลบผู้สนใจที่นำเข้าชุดนี้ ${b.remaining.toLocaleString()} ราย · ทำได้เฉพาะชุดที่ยังไม่มีรายถูกบันทึกการติดต่อ/เปลี่ยนขั้น/ออกใบหลังนำเข้า`,
      ปุ่มตกลง: "ยกเลิกทั้งชุด", อันตราย: true }))) return;
    try { const r = await prospectsRepo.cancelImport(b.id); แจ้งสำเร็จ(`ยกเลิกแล้ว · ลบ ${r.deleted.toLocaleString()} ราย`); onImported(); void โหลดชุด(); }
    catch (e) { แจ้งพลาด(friendlyError(e)); }
  }

  async function บันทึกซิงก์() {
    setกำลังตั้ง(true); setพลาด("");
    try {
      const s = await apiFetch<สถานะดึงชีต>("/prospect-sheet", { method: "POST", body: JSON.stringify({ op: "settings", url: ลิงก์ชีต.trim(), enabled: อัตโนมัติ }) });
      setซิงก์(s); setอัตโนมัติ(s.enabled);
      แจ้งสำเร็จ(s.enabled ? "เปิดดึงอัตโนมัติทุกชั่วโมงแล้ว" : "บันทึกแล้ว · ดึงอัตโนมัติปิดอยู่");
    } catch (e) { setพลาด(friendlyError(e)); }
    finally { setกำลังตั้ง(false); }
  }
  async function ดึงตอนนี้() {
    setกำลังดึงตอนนี้(true); setพลาด("");
    const r = await ดึงชีตผู้สนใจตอนนี้();
    setกำลังดึงตอนนี้(false);
    if (!r.ok) { setพลาด(r.error); return; }
    if (r.สำเร็จ) { แจ้งสำเร็จ(r.ข้อความ); onImported(); void โหลดชุด(); } else setพลาด(r.ข้อความ);
    void โหลดซิงก์();
  }

  if (!open) return null;
  const เซลล์: React.CSSProperties = { padding: "6px 8px", fontSize: "0.76rem", borderBottom: "1px solid #f0f2f4", verticalAlign: "top" };
  return (
    <ModalPortal>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.45)", zIndex: 200 }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, pointerEvents: "none" }}>
        <ModalCard onClose={onClose} label="นำเข้าผู้สนใจ" className="card" style={{ width: "100%", maxWidth: 1080, maxHeight: "92vh", display: "flex", flexDirection: "column", pointerEvents: "auto" }}>
          <div data-panel-head style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid #e5e7eb" }}>
            <div style={{ fontWeight: 800 }}>นำเข้าผู้สนใจจากไฟล์</div>
            <button type="button" aria-label="ปิด" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}><X size={16} /></button>
          </div>
          <div style={{ padding: 18, overflowY: "auto", display: "grid", gap: 14 }}>
            {/* 1 · ลิงก์ Google Sheets หรือ อัปโหลดไฟล์ในหน้าต่าง (บอสสั่ง 23 พ.ย. 69 · ปุ่มบนหน้ายังไม่มี) · แบบฟอร์มตัวอย่าง */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {ไฟล์ && <span data-testid="import-file" style={{ fontSize: "0.78rem" }}>{ไฟล์.ชื่อ} · {ไฟล์.ตาราง.length.toLocaleString()} แถวที่มีข้อมูล</span>}
              <button type="button" data-act="import-template" onClick={ดาวน์โหลดแบบฟอร์ม}
                style={{ marginLeft: "auto", background: "none", border: "none", padding: 0, color: "#003366", fontWeight: 700, fontSize: "0.76rem", cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Download size={13} /> ดาวน์โหลดแบบฟอร์มตัวอย่าง
              </button>
            </div>
            {(
              <div data-sheet-import style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <label htmlFor="pi-sheet-link" style={{ fontSize: "0.76rem", fontWeight: 700, color: "#4b5563" }}>ลิงก์ Google Sheets</label>
                <input id="pi-sheet-link" className="form-input" type="url" inputMode="url" value={ลิงก์ชีต} onChange={e => setลิงก์ชีต(e.target.value.trim())}
                  onKeyDown={e => { if (e.key === "Enter") void ดึงชีต(); }} placeholder="https://docs.google.com/spreadsheets/d/…" style={{ flex: "1 1 320px", minWidth: 0 }} />
                <button type="button" className="btn btn-primary btn-sm" disabled={กำลังดึงชีต || !ลิงก์ชีต} onClick={() => void ดึงชีต()}>
                  {กำลังดึงชีต ? "กำลังดึงข้อมูล…" : "ดึงข้อมูลจากชีต"}
                </button>
                <span style={{ fontSize: "0.76rem", fontWeight: 700, color: "#6b7280" }}>หรือ</span>
                <label className="btn btn-secondary btn-sm" data-act="import-file" style={{ cursor: "pointer", gap: 6 }}>
                  <Upload size={13} /> เลือกไฟล์ (.xlsx, .csv)
                  <input type="file" aria-label="ไฟล์ผู้สนใจ" accept=".xlsx,.csv" hidden
                    onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; void เลือกไฟล์(f); }} />
                </label>
                <span style={{ flexBasis: "100%", fontSize: "0.68rem", color: "#6b7280" }}>วางลิงก์ Google Sheets (ต้องเปิดแชร์ &quot;ทุกคนที่มีลิงก์ดูได้&quot;) หรือเลือกไฟล์ .xlsx / .csv จากเครื่อง · อ่านทุกชีต (หัวตารางเดียวกับไฟล์ Facebook) · ระบบไม่เก็บไฟล์</span>
              </div>
            )}
            {/* ดึงอัตโนมัติทุกชั่วโมง (บอสสั่ง 23 พ.ย. 69 · ใบ 0295) — ลิงก์เก็บที่ฐาน · นำเข้าเลยไม่มีหน้าตัวอย่าง · แต่ละรอบ = 1 ชุด ยกเลิกได้ด้านล่าง */}
            {ซิงก์ && (() => {
              const เตือน = เตือนตัวตั้งเวลา(ซิงก์);
              const เปลี่ยน = อัตโนมัติ !== ซิงก์.enabled || ลิงก์ชีต.trim() !== ซิงก์.url;
              return (
                <section aria-label="ดึงอัตโนมัติจาก Google Sheets" data-sheet-sync style={{ display: "grid", gap: 6, padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#f9fafb" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "0.8rem", fontWeight: 700, cursor: "pointer" }}>
                      <input type="checkbox" role="switch" aria-checked={อัตโนมัติ} checked={อัตโนมัติ} onChange={e => setอัตโนมัติ(e.target.checked)} />
                      ดึงอัตโนมัติทุกชั่วโมง
                    </label>
                    <button type="button" className="btn btn-primary btn-sm" disabled={กำลังตั้ง || !เปลี่ยน} onClick={() => void บันทึกซิงก์()}>
                      {กำลังตั้ง ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" data-act="sheet-run-now" disabled={กำลังดึงตอนนี้ || !ซิงก์.url || เปลี่ยน} onClick={() => void ดึงตอนนี้()}
                      title={เปลี่ยน ? "บันทึกการตั้งค่าก่อน" : undefined}>
                      {กำลังดึงตอนนี้ ? "กำลังดึง…" : "ดึงตอนนี้"}
                    </button>
                  </div>
                  <div data-sheet-sync-status style={{ fontSize: "0.72rem", color: "#4b5563" }}>
                    {ซิงก์.lastRunAt
                      ? <>ดึงล่าสุดเมื่อ {วันเวลาไทย(ซิงก์.lastRunAt)} · ผล: <span style={{ color: ซิงก์.lastOk ? "#047857" : "#b91c1c", fontWeight: 600 }}>{ซิงก์.lastResult || "—"}</span></>
                      : "ยังไม่เคยดึงจากชีตที่ตั้งไว้"}
                    {ซิงก์.running && " · กำลังดึงอยู่"}
                    {ซิงก์.url && <> · ตั้งโดย {ซิงก์.updatedBy || "—"}{ซิงก์.updatedAt ? ` (${วันเวลาไทย(ซิงก์.updatedAt)})` : ""}</>}
                  </div>
                  {เตือน && <div role="alert" data-sheet-sync-warning style={{ fontSize: "0.74rem", fontWeight: 600, color: "#b45309", background: "#fff8e6", border: "1px solid #f5d78e", borderRadius: 8, padding: "6px 10px" }}>{เตือน}</div>}
                  <span style={{ fontSize: "0.68rem", color: "#6b7280" }}>นำเข้าทันทีไม่มีหน้าตัวอย่าง · แถวที่เคยนำเข้าแล้วไม่นำเข้าซ้ำ · มีรายใหม่ = แจ้งกระดิ่ง · แต่ละรอบเป็น 1 ชุด ยกเลิกทั้งชุดได้ด้านล่าง</span>
                </section>
              );
            })()}
            {พลาด && <div role="alert" style={{ padding: "8px 12px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: "0.78rem", fontWeight: 600 }}>{พลาด}</div>}

            {/* 2ก · ไฟล์ Facebook: หน้าตัวอย่าง → บอสกดยืนยัน (บอสสั่ง 20 พ.ย. 69) */}
            {เฟซบุ๊ก && !ผล && (() => {
              const ส = สรุปเฟซบุ๊ก(เฟซบุ๊ก);
              const กลุ่ม: { k: กลุ่มเฟซบุ๊ก; label: string; n: number }[] = [
                { k: "import", label: "จะนำเข้า", n: ส.นำเข้า }, { k: "dup", label: "เบอร์ซ้ำ (นำเข้าด้วย)", n: ส.เบอร์ซ้ำ },
                { k: "short", label: "ข้อมูลไม่ครบ (นำเข้าด้วย)", n: ส.ไม่ครบ }, { k: "noprov", label: "จังหวัดจับคู่ไม่ได้", n: ส.จังหวัดไม่ได้ },
                { k: "already", label: "เคยนำเข้าแล้ว (ข้าม)", n: ส.เคยนำเข้า },
                ...(ส.ข้ามอื่น ? [{ k: "skip" as const, label: "ข้าม (ไม่มีทั้งชื่อและเบอร์)", n: ส.ข้ามอื่น }] : []),
              ];
              const แสดง = เฟซบุ๊ก.filter(r => ในกลุ่มเฟซบุ๊ก(r, ดูเฟซบุ๊ก));
              return (
                <section aria-label="ตัวอย่างก่อนนำเข้าไฟล์ Facebook" data-facebook-preview style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: "0.78rem", color: "#374151" }}>
                    ไฟล์รายชื่อจาก Facebook · ทุกรายเข้าขั้น <b>รอติดต่อ</b> และขึ้น <b>ถึงกำหนดติดตาม</b> วันนี้ · แหล่งที่มา Facebook · ข้อความจังหวัด/โฆษณา/วันที่ทิ้งเบอร์เก็บในหมายเหตุ
                  </div>
                  <div role="tablist" aria-label="สรุปไฟล์ Facebook" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {กลุ่ม.map(g => (
                      <button key={g.k} type="button" role="tab" aria-selected={ดูเฟซบุ๊ก === g.k} data-fb-group={g.k}
                        className={ดูเฟซบุ๊ก === g.k ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"} onClick={() => setดูเฟซบุ๊ก(g.k)}>
                        {g.label} <span data-count={g.n}>{g.n.toLocaleString()}</span>
                      </button>
                    ))}
                  </div>
                  <div className="table-wrap" style={{ maxHeight: "48vh", overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 10 }}>
                    <table aria-label={`แถว Facebook: ${กลุ่ม.find(g => g.k === ดูเฟซบุ๊ก)?.label ?? ""}`} style={{ width: "100%", tableLayout: "fixed", minWidth: 860 }}>
                      {/* กว้างที่ colgroup · คอลัมน์สุดท้าย (เหตุผล/อีเมล) ตัดบรรทัดได้ ห้ามตัดด้วย … (บอส 20 พ.ย. 69 "ซ้ำยังไง") */}
                      <colgroup><col style={{ width: 90 }} /><col style={{ width: "20%" }} /><col style={{ width: 150 }} /><col style={{ width: "17%" }} /><col style={{ width: 110 }} /><col /></colgroup>
                      <thead><tr><th>ชีต:แถว</th><th>ชื่อ</th><th>เบอร์</th><th>จังหวัด</th><th>วันที่ทิ้งเบอร์</th><th>{ดูเฟซบุ๊ก === "already" || ดูเฟซบุ๊ก === "skip" ? "เหตุผลที่ข้าม" : ดูเฟซบุ๊ก === "dup" ? "ซ้ำกับ" : "อีเมล"}</th></tr></thead>
                      <tbody>
                        {แสดง.map(r => (
                          <tr key={r.row} data-fb-row={r.row}>
                            <td style={เซลล์}>{r.row}</td>
                            <td style={เซลล์}>{r.name || "—"}{!r.ข้าม && r.ไม่ครบ === "ไม่มีชื่อ" && <span data-tag="incomplete" style={ป้ายเล็ก("amber")}>ไม่มีชื่อ</span>}</td>
                            <td style={เซลล์}>{r.phone || "—"}{r.เบอร์ไม่ครบ && <span data-tag="phone-short" style={ป้ายเล็ก("amber")}>เบอร์ไม่ครบ</span>}
                              {!r.ข้าม && r.ไม่ครบ === "ไม่มีเบอร์" && <span data-tag="incomplete" style={ป้ายเล็ก("amber")}>ไม่มีเบอร์</span>}
                              {เป็นแถวซ้ำ(r) && <span data-tag="phone-dup" style={ป้ายเล็ก("red")}>เบอร์ซ้ำ</span>}</td>
                            <td style={เซลล์}>{r.province ?? "—"}{r.จังหวัดเดิม && r.จังหวัดเดิม !== r.province && <div style={{ fontSize: "0.66rem", color: "#9ca3af" }}>ลูกค้าพิมพ์: {r.จังหวัดเดิม}</div>}</td>
                            <td style={เซลล์}>{r.enteredAt ? fmtISOToThai(r.enteredAt) : "—"}</td>
                            <td className="wrap" data-fb-reason style={{ ...เซลล์, color: r.ข้าม ? "#b45309" : "#52606d", whiteSpace: "normal", overflowWrap: "anywhere", textOverflow: "clip" }}>{r.ข้าม ?? (ดูเฟซบุ๊ก === "dup" ? r.ซ้ำกับ : null) ?? (r.email || "—")}</td>
                          </tr>
                        ))}
                        {!แสดง.length && <tr><td colSpan={6} style={{ ...เซลล์, textAlign: "center", color: "#9ca3af" }}>ไม่มีแถวในกลุ่มนี้</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button type="button" className="btn btn-primary btn-sm" disabled={กำลัง || !พร้อมเฟซบุ๊ก.length} onClick={() => void นำเข้าเฟซบุ๊ก()}>
                      {กำลัง ? "กำลังนำเข้า…" : `ยืนยันนำเข้า ${พร้อมเฟซบุ๊ก.length.toLocaleString()} ราย`}
                    </button>
                    <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>เบอร์ซ้ำ/ข้อมูลไม่ครบนำเข้าด้วย (ติดป้ายในตาราง) · แถวที่เคยนำเข้าแล้วไม่นำเข้าซ้ำ (ระบบตรวจอีกครั้งตอนบันทึก) · ยกเลิกทั้งชุดได้ภายหลัง</span>
                  </div>
                </section>
              );
            })()}

            {/* 2 · จับคู่คอลัมน์ */}
            {ไฟล์ && !แถว && !เฟซบุ๊ก && (
              <section aria-label="จับคู่คอลัมน์" style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: "0.78rem" }}>
                  <label htmlFor="pi-header">แถวหัวตาราง</label>
                  {/* ต้องมีค่าเสมอ — แถวหัวตาราง (ตัวเลือกแรก −1 = ยังไม่ระบุ) */}
                  <select id="pi-header" className="form-select" style={{ width: "auto" }} value={แถวหัว}
                    onChange={e => { const h = Number(e.target.value); setแถวหัว(h); setคู่(h >= 0 ? (อ่านที่จำ()[ลายเซ็นหัว(ไฟล์.ตาราง[h])] ?? เดาคอลัมน์(ไฟล์.ตาราง[h])) : {}); }}>
                    <option value={-1}>— ยังไม่ระบุ —</option>
                    {ไฟล์.ตาราง.slice(0, 15).map((r, i) => <option key={i} value={i}>แถว {i + 1}: {r.filter(Boolean).slice(0, 4).join(" · ").slice(0, 60)}</option>)}
                  </select>
                  <label htmlFor="pi-year">ปีของวันที่ (วัน.เดือน ในไฟล์ไม่มีปี)</label>
                  {/* ต้องมีค่าเสมอ — ปีของวันที่ในไฟล์ (ถามครั้งเดียว · ค่าตั้งต้นปีนี้) */}
                  <select id="pi-year" className="form-select" style={{ width: "auto" }} value={ปี} onChange={e => setปี(Number(e.target.value))}>
                    {[ปีพศนี้() - 1, ปีพศนี้(), ปีพศนี้() + 1].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <span data-year-rule style={{ fontSize: "0.68rem", color: "#6b7280", flexBasis: "100%" }}>
                    วันเริ่มติดต่อที่เลยวันนี้ ระบบถอยเป็นปีก่อนให้ (เช่น 24.12 → ธ.ค. ปีก่อน) · วันติดตามต้องอยู่ระหว่างวันเริ่มกับวันนี้
                  </span>
                </div>
                {แถวหัว >= 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
                    {(Object.keys(ชื่อช่องนำเข้า) as ช่องนำเข้า[]).map(k => (
                      <label key={k} style={{ display: "grid", gap: 3, fontSize: "0.72rem", color: "#52606d" }}>
                        {ชื่อช่องนำเข้า[k]}{k === "phone" ? " *" : ""}
                        <select aria-label={`คอลัมน์ ${ชื่อช่องนำเข้า[k]}`} className="form-select" value={คู่[k] ?? ""}
                          onChange={e => setคู่(c => { const n = { ...c }; if (e.target.value === "") delete n[k]; else n[k] = Number(e.target.value); return n; })}>
                          <option value="">— ไม่ใช้ —</option>
                          {หัว.map((h, i) => h ? <option key={i} value={i}>{h}</option> : null)}
                        </select>
                      </label>
                    ))}
                  </div>
                )}
                {ช่องทางในไฟล์.length > 0 && (
                  <table aria-label="ตารางแปลงช่องทาง" style={{ maxWidth: 520 }}>
                    <thead><tr><th style={{ textAlign: "left" }}>ช่องทางในไฟล์</th><th style={{ textAlign: "left" }}>แหล่งที่มาในระบบ</th></tr></thead>
                    <tbody>
                      {ช่องทางในไฟล์.map(c => (
                        <tr key={c}><td style={เซลล์}>{c}</td><td style={เซลล์}>
                          {/* ค่าตั้งต้น = ชื่อในรายการที่ตรงกับค่าในไฟล์ · ไม่ตรง = ยังไม่ระบุ (ไม่เดา · แถวขึ้นเตือนในหน้าตรวจ) */}
                          <select aria-label={`แหล่งที่มาของ ${c}`} className="form-select" value={ช่องทาง[คีย์ช่องทาง(c)] ?? แหล่งที่มา.find(x => คีย์ช่องทาง(x) === คีย์ช่องทาง(c)) ?? ""}
                            onChange={e => setช่องทาง(m => ({ ...m, [คีย์ช่องทาง(c)]: e.target.value }))}>
                            <option value="">— ยังไม่ระบุ —</option>
                            {แหล่งที่มา.map(x => <option key={x} value={x}>{x}</option>)}
                          </select>
                        </td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div><button type="button" className="btn btn-primary btn-sm" disabled={แถวหัว < 0} onClick={ไปตรวจ}>ไปหน้าตรวจ</button></div>
              </section>
            )}

            {/* 3 · ตรวจ 3 กลุ่ม */}
            {แถว && !ผล && (
              <section aria-label="ตรวจก่อนนำเข้า" style={{ display: "grid", gap: 10 }}>
                <div role="tablist" aria-label="กลุ่มแถว" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {(["ready", "review", "skip"] as const).map(g => (
                    <button key={g} type="button" role="tab" aria-selected={ดู === g} data-group={g} className={ดู === g ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"} onClick={() => setดู(g)}>
                      {ป้ายกลุ่ม[g]} <span data-count={นับ(g)}>{นับ(g).toLocaleString()}</span>
                    </button>
                  ))}
                  <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>แถวหัวข้อแทรกที่ข้าม {หัวข้อที่ข้าม} แถว</span>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }} onClick={() => setแถว(null)}>กลับไปจับคู่คอลัมน์</button>
                </div>
                <div className="table-wrap" style={{ maxHeight: "48vh", overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 10 }}>
                  <table aria-label={`แถว${ป้ายกลุ่ม[ดู]}`} style={{ width: "100%" }}>
                    <thead><tr><th>แถว</th><th>ชื่อ{ดู === "review" && <ดาวบังคับ />}</th><th>เบอร์{ดู === "review" && <ดาวบังคับ />}</th><th>จังหวัด</th><th>แหล่งที่มา</th><th>ขั้น</th><th>{ดู === "skip" ? "เหตุผลที่ข้าม" : "ต้องตรวจ / หมายเหตุ"}</th>{ดู === "review" && <th />}</tr></thead>
                    <tbody>
                      {แถว.filter(r => r.กลุ่ม === ดู).map(r => (
                        <tr key={r.row} data-import-row={r.row} data-group={r.กลุ่ม}>
                          <td style={เซลล์}>{r.row}</td>
                          <td style={เซลล์}>{ดู === "review"
                            ? <><input className="form-input" aria-label={`ชื่อ แถว ${r.row}`} value={r.name} onChange={e => { แก้แถว(r.row, { name: e.target.value }); บังคับ.ล้าง(`name:${r.row}`); }} {...บังคับ.ผูก(`name:${r.row}`)} />
                                <FieldError>{บังคับ.ผิด[`name:${r.row}`]}</FieldError></>
                            : r.name || "—"}{r.เดิม && <div style={{ fontSize: "0.66rem", color: "#9ca3af" }}>เดิม: {r.เดิม}</div>}</td>
                          <td style={เซลล์}>{r.phone || "—"}</td>
                          <td style={เซลล์}>{ดู === "review"
                            ? <select className="form-select" aria-label={`จังหวัด แถว ${r.row}`} value={r.province ?? ""} onChange={e => แก้แถว(r.row, { province: e.target.value || null })}>
                                <option value="">— ยังไม่ระบุ —</option>
                                {จังหวัดทั้งหมด.map(p => <option key={p} value={p}>{p}</option>)}
                              </select>
                            : r.province ?? "—"}</td>
                          <td style={เซลล์}>{r.channel ?? "—"}</td>
                          <td style={เซลล์}>{ดู === "review"
                            ? <>
                                {/* ต้องมีค่าเสมอ — ขั้นของผู้สนใจ (ระบบเดาจากหมายเหตุ · HQ แก้ได้) */}
                                <select className="form-select" aria-label={`ขั้น แถว ${r.row}`} value={r.status} onChange={e => แก้แถว(r.row, { status: e.target.value as ขั้นนำเข้า })}>
                                  {ขั้นที่นำเข้าได้.map(s => <option key={s.k} value={s.k}>{s.label}</option>)}
                                </select>
                                {/* ไม่ใช่กล่องเหตุผล — แก้ค่าของแถวในหน้าตรวจก่อนนำเข้า (ยังไม่ได้ส่งฐาน · ฐานบังคับเหตุผลตอนนำเข้า) */}
                                {r.status === "lost" && (
                                  <><select className="form-select" aria-label={`เหตุผล แถว ${r.row}`} value={r.lostReason ?? ""} onChange={e => { แก้แถว(r.row, { lostReason: e.target.value || null }); บังคับ.ล้าง(`reason:${r.row}`); }}
                                    {...บังคับ.ผูก(`reason:${r.row}`)} style={{ marginTop: 4, ...บังคับ.ผูก(`reason:${r.row}`).style }}>
                                    <option value="">— ยังไม่ระบุ —</option>
                                    {ตัวเลือกฟอร์ม(เหตุผลไม่สำเร็จ, r.lostReason).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                  </select>
                                  <FieldError>{บังคับ.ผิด[`reason:${r.row}`]}</FieldError></>
                                )}
                              </>
                            : ขั้นที่นำเข้าได้.find(s => s.k === r.status)?.label}</td>
                          <td style={{ ...เซลล์, color: ดู === "ready" ? "#52606d" : "#b45309" }}>
                            {ดู === "ready" ? (r.note || "—") : r.เหตุ.join(" · ")}
                            {ดู === "review" && (r.วันต้องเลือก ?? []).map(x => (
                              <select key={x.ช่อง} className="form-select" data-date-choice={x.ช่อง} aria-label={`เลือกเดือน${x.ช่อง === "firstContact" ? "วันเริ่มติดต่อ" : "วันติดตาม"} แถว ${r.row}`}
                                value="" onChange={e => e.target.value && เลือกเดือน(r.row, x.ช่อง, e.target.value)} style={{ marginTop: 4, display: "block" }}>
                                {/* ยังไม่เลือก = ยืนยันไม่ได้ (ไม่ใช่ตัวเลือกกรอง) */}
                                <option value="">— {x.ช่อง === "firstContact" ? "วันเริ่มติดต่อ" : "วันติดตาม"} &quot;{x.ดิบ}&quot; เดือนไหน —</option>
                                {x.ตัวเลือก.map(d => <option key={d} value={d}>{fmtISOToThai(d)}</option>)}
                              </select>
                            ))}
                          </td>
                          {ดู === "review" && <td style={เซลล์}>
                            <button type="button" className="btn btn-secondary btn-sm" aria-label={`ยืนยัน แถว ${r.row}`} onClick={() => ยืนยันแถว(r)}
                              disabled={!!r.วันต้องเลือก?.length} title={r.วันต้องเลือก?.length ? "เลือกเดือนของวันที่ก่อน" : undefined}><Check size={12} /> ยืนยัน</button>
                          </td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button type="button" className="btn btn-primary btn-sm" disabled={กำลัง || !พร้อม.length} onClick={() => void นำเข้า()}>
                    {กำลัง ? "กำลังนำเข้า…" : `นำเข้า ${พร้อม.length.toLocaleString()} ราย`}
                  </button>
                  <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>นำเข้าเฉพาะกลุ่มพร้อม · ต้องตรวจ = กด &quot;ยืนยัน&quot; ทีละแถวก่อน · ไม่เกิน {นำเข้าได้สูงสุด.toLocaleString()} แถวต่อครั้ง</span>
                </div>
              </section>
            )}

            {/* 4 · สรุปผล */}
            {ผล && (
              <section aria-label="ผลการนำเข้า" data-testid="import-result" data-inserted={ผล.inserted} style={{ display: "grid", gap: 8, fontSize: "0.82rem" }}>
                <div><b>นำเข้าแล้ว {ผล.inserted.toLocaleString()} ราย</b> · ระบบข้าม {ผล.skipped.length.toLocaleString()} แถว · ไม่ได้ส่ง (ต้องตรวจ/ข้าม) {(เฟซบุ๊ก ? เฟซบุ๊ก.filter(r => r.ข้าม).length : นับ("review") + นับ("skip")).toLocaleString()} แถว</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={ดาวน์โหลดที่ข้าม}><Download size={13} /> ดาวน์โหลดแถวที่ข้าม</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={ล้าง}>นำเข้าไฟล์อื่น</button>
                </div>
                {/* แถบ "ยกเลิกชุดนี้" (บอสสั่ง 20 พ.ย. 69) — กติกาเดิมของยกเลิกทั้งชุด (ฐานกันรายที่ถูกแตะแล้ว) */}
                {(() => {
                  const b = ชุด.find(x => x.id === ผล.batch);
                  if (!b || !ผล.inserted) return null;
                  return (
                    <div data-batch-undo={b.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", borderRadius: 8, background: "#f7f9fc", border: "1px solid #e5e7eb" }}>
                      <span style={{ flex: 1, fontSize: "0.76rem", color: "#374151" }}>นำเข้าผิดชุด? ยกเลิกทั้งชุดได้จนกว่าจะมีรายถูกบันทึกการติดต่อ/เปลี่ยนขั้น/ออกใบ</span>
                      {b.cancelledAt ? <span style={{ color: "#6b7280", fontSize: "0.76rem" }}>ยกเลิกชุดนี้แล้ว</span>
                        : <button type="button" className="btn btn-secondary btn-sm" disabled={b.touched > 0} onClick={() => void ยกเลิกชุด(b)}><Undo2 size={12} /> ยกเลิกชุดนี้</button>}
                    </div>
                  );
                })()}
              </section>
            )}

            {/* ชุดที่นำเข้าล่าสุด — ยกเลิกทั้งชุดได้ */}
            {ชุด.length > 0 && (
              <section aria-label="ชุดที่นำเข้าล่าสุด" style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 700, marginBottom: 6 }}>ชุดที่นำเข้าล่าสุด</div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
                  {ชุด.map(b => (
                    <li key={b.id} data-batch={b.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "0.74rem" }}>
                      <span style={{ flex: 1 }}>{b.fileName || "ไฟล์ไม่มีชื่อ"} · เพิ่ม {b.inserted.toLocaleString()} · ข้าม {b.skipped.toLocaleString()} · {b.createdBy || "—"}</span>
                      {b.cancelledAt ? <span style={{ color: "#6b7280" }}>ยกเลิกแล้ว</span> : <>
                        {/* ยกเลิกได้เฉพาะชุดที่ยังไม่มีรายถูกแตะหลังนำเข้า (บอสสั่ง 3 พ.ย. 69 · ฐานกันอีกชั้น) */}
                        {b.touched > 0 && <span data-testid="batch-touched" style={{ color: "#b45309", fontWeight: 600 }}>มีการดำเนินการต่อแล้ว {b.touched.toLocaleString()} ราย — ยกเลิกทั้งชุดไม่ได้</span>}
                        <button type="button" className="btn btn-secondary btn-sm" disabled={b.touched > 0} onClick={() => void ยกเลิกชุด(b)}
                          title={b.touched > 0 ? "มีรายที่ถูกบันทึกการติดต่อ/เปลี่ยนขั้น/ออกใบแล้วหลังนำเข้า" : undefined}><Undo2 size={12} /> ยกเลิกทั้งชุด</button>
                      </>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </ModalCard>
      </div>
    </ModalPortal>
  );
}
