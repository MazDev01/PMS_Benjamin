"use client";

import { SortableTh } from "@pms/shared/components/ui/SortableTh";
import { ChevronUp, ChevronDown } from "lucide-react";
import React, { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { DEALER_FILES_EVENT, normalizeFileCategory, type DealerFile } from "@pms/shared/lib/mock";
import { useSales } from "@pms/shared/context/SalesContext";
import { files as filesRepo, storage as fileStorage } from "@pms/shared/lib/data";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { reportRepoSaveError } from "@pms/shared/lib/useRepoState";
import { useCurrentDealer } from "@pms/shared/lib/useCurrentDealer";
import { FolderOpen, Search, X, File, FileText, FileSpreadsheet, Image as ImageIcon, Download, ExternalLink } from "lucide-react";
import { FilterSelect } from "@pms/shared/components/filters/FilterRow";
import { EmptyState } from "@pms/shared/components/ui/EmptyState";
import { Skeleton } from "@pms/shared/components/ui/Skeleton";

type FileSortKey = "name" | "category" | "project" | "size" | "uploadedBy" | "uploadedAt";
/** "2.4 MB" → ไบต์ · อ่านไม่ออก/"—" = -1 (ไปอยู่ท้ายเมื่อเรียงมากไปน้อย) */
function sizeBytes(s: string): number {
  const m = /^([\d.,]+)\s*(B|KB|MB|GB)$/i.exec((s ?? "").trim());
  if (!m) return -1;
  const n = parseFloat(m[1].replace(/,/g, ""));
  return n * ({ B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 } as Record<string, number>)[m[2].toUpperCase()];
}

const PRIMARY = "#003366";
const STEEL   = "#2D2D2D";
const BORDER  = "#e5e7eb";
const MUTED   = "#6b7280";

type FileCategory = "ใบเสนอราคา" | "แบบแปลน" | "รูปภาพ" | "นำเสนอ" | "สัญญา" | "อื่นๆ";
type FileExt = "pdf" | "docx" | "xlsx" | "dwg" | "pptx" | "jpg" | "png" | "other";

// ชนิด/ขนาดไฟล์ที่รับอัปโหลด — ใช้กฎกลาง uploadLimits.ts (ต้องตรงกับ allowed_mime_types/file_size_limit
// ของ bucket dealer-files ใน 0075) · ห้ามประกาศเกณฑ์ซ้ำในไฟล์นี้อีก — เคยมี 3 หน้าถือกฎคนละชุด
// แล้วตกหล่นทีละหน้า (หน้าไฟล์ 30 ก.ค. · แผงลูกค้า 31 ก.ค. · แผงลูกค้าเป้าหมาย 6 ส.ค. 69)

// ไฟล์ในหน้านี้ = คลังไฟล์รวมของดีลเลอร์ (แหล่งเดียวใน mock.ts)
// แนบไฟล์จากหน้าลูกค้า/ลูกค้าเป้าหมาย → ปรากฏที่นี่อัตโนมัติ
type FileMock = DealerFile;

const CAT_COLORS: Record<FileCategory, { bg: string; text: string }> = {
  ใบเสนอราคา: { bg: "#dce5f0", text: "#003366" },
  แบบแปลน:     { bg: "#e5faf0", text: "#059669" },
  รูปภาพ:     { bg: "#e8ecf2", text: "#475569" },
  นำเสนอ:     { bg: "#fff3cd", text: "#d97706" },
  สัญญา:      { bg: "#fde8e8", text: "#dc2626" },
  อื่นๆ:      { bg: "#f0f0f5", text: "#6b7280" },
};

const ALL_CATS: FileCategory[] = ["ใบเสนอราคา","แบบแปลน","รูปภาพ","นำเสนอ","สัญญา","อื่นๆ"];

// คอลัมน์ที่ซ่อน/แสดงได้ของตาราง (มุมมองรายการ) — คอลัมน์ "ไฟล์" กับปุ่มการทำงานคงไว้เสมอ
const COLS = [
  { key: "category", label: "โฟลเดอร์" },
  { key: "project",  label: "โอกาสการขาย" },
  { key: "size",     label: "ขนาด" },
  { key: "uploadedBy", label: "อัปโหลดโดย" },
  { key: "uploadedAt", label: "วันที่" },
];

function extIcon(ext: FileExt) {
  const sz = 18;
  if (ext === "pdf")  return <FileText  size={sz} color="#dc2626" />;
  if (ext === "xlsx") return <FileSpreadsheet size={sz} color="#059669" />;
  if (ext === "docx") return <FileText  size={sz} color="#003366" />;
  if (ext === "pptx") return <FileText  size={sz} color="#d97706" />;
  if (ext === "dwg")  return <File      size={sz} color="#2D2D2D" />;
  if (ext === "jpg" || ext === "png") return <ImageIcon size={sz} color="#003366" />;
  return <File size={sz} color={MUTED} />;
}
function extLabel(ext: FileExt) {
  const m: Record<FileExt, string> = { pdf:"PDF", docx:"Word", xlsx:"Excel", pptx:"PowerPoint", dwg:"CAD", jpg:"รูปภาพ", png:"รูปภาพ", other:"อื่นๆ" };
  return m[ext] ?? "ไฟล์";
}
function extBg(ext: FileExt) {
  if (ext === "pdf")  return "#fee2e2";
  if (ext === "xlsx") return "#e5faf0";
  if (ext === "docx") return "#dce5f0";
  if (ext === "pptx") return "#fff3cd";
  if (ext === "dwg")  return "#eceef0";
  if (ext === "jpg" || ext === "png") return "#dce5f0";
  return "#f4f6f9";
}

function guessExt(name: string): FileExt {
  const parts = name.split(".");
  const e = (parts[parts.length - 1] || "").toLowerCase();
  if (e === "pdf") return "pdf";
  if (e === "docx" || e === "doc") return "docx";
  if (e === "xlsx" || e === "xls") return "xlsx";
  if (e === "pptx" || e === "ppt") return "pptx";
  if (e === "dwg" || e === "dxf") return "dwg";
  if (e === "jpg" || e === "jpeg") return "jpg";
  if (e === "png") return "png";
  return "other";
}

// ที่มาของไฟล์ = "ไฟล์นี้ของใคร" — แนบไว้กับลูกค้า/ลูกค้าเป้าหมายรายไหน หรือผู้ใช้อัปโหลดเข้าคลังเอง
const SOURCE_LABEL: Record<DealerFile["source"], string> = {
  customer: "แนบจากลูกค้า",
  lead:     "แนบจากลูกค้าเป้าหมาย",
  upload:   "อัปโหลดเข้าคลัง",
};

// ไฟล์ตัวอย่างจริงที่วางไว้ในเว็บ (apps/dealer/public/demo-files — สร้างด้วย scripts/gen-demo-files.mjs)
//
// ไฟล์ชุดตัวอย่างของระบบไม่มีไบต์เก็บอยู่ที่ไหน กดเปิด/ดาวน์โหลดแล้วเดิมไม่ได้อะไรเลย
// จึงให้ไฟล์พวกนี้ชี้มาที่ "เอกสารตัวอย่างของระบบสาธิต" ตามนามสกุล — เป็นไฟล์จริงที่เปิด/โหลดได้
// และมีข้อความกำกับในตัวเอกสารว่าเป็นตัวอย่าง ไม่ใช่เอกสารของลูกค้ารายใด (ไม่ปั้นเนื้อหาปลอม)
const DEMO_SAMPLE: Partial<Record<FileExt, string>> = {
  pdf:  "/demo-files/sample-document.pdf",
  docx: "/demo-files/sample-document.docx",
  xlsx: "/demo-files/sample-sheet.xlsx",
  jpg:  "/demo-files/sample-photo.jpg",
  png:  "/demo-files/sample-photo.png",
};
/** ไฟล์ตัวอย่างที่ใช้แทนได้ — เฉพาะไฟล์ที่ "ไม่มีไบต์จริง" เท่านั้น (ไฟล์ที่ผู้ใช้อัปโหลดใช้ของจริงเสมอ)
 *  ชนิดที่เราไม่มีไฟล์ตัวอย่างตรงชนิด (เช่น CAD, PowerPoint) ใช้เอกสารตัวอย่างแบบ PDF แทน
 *  และเปลี่ยนชื่อไฟล์ตอนดาวน์โหลดเป็น .pdf ด้วย — ห้ามยัดเนื้อ PDF ลงไฟล์นามสกุล .dwg
 *  เพราะจะได้ไฟล์เสียที่เปิดไม่ขึ้น (ผู้ใช้แยกไม่ออกว่าไฟล์พังหรือระบบพัง) */
function sampleOf(f: FileMock): string | null {
  if (f.storagePath) return null;
  return DEMO_SAMPLE[f.ext] ?? DEMO_SAMPLE.pdf ?? null;
}
/** ชื่อไฟล์ตอนบันทึกลงเครื่อง — ไฟล์จริงใช้ชื่อเดิม · ตัวอย่างที่ไม่ตรงชนิดเปลี่ยนท้ายเป็น .pdf ให้ตรงเนื้อไฟล์ */
function downloadNameOf(f: FileMock): string {
  if (f.storagePath || DEMO_SAMPLE[f.ext]) return f.name;
  const ฐาน = f.name.replace(/\.[^.]+$/, "");
  return `${ฐาน} (เอกสารตัวอย่าง).pdf`;
}
/** เปิด/ดาวน์โหลดได้หรือไม่ — มีไบต์จริง หรือมีไฟล์ตัวอย่างให้แทน */
function hasOpenable(f: FileMock): boolean {
  return !!f.storagePath || !!sampleOf(f);
}

// เปิดอ่าน / ดาวน์โหลดไฟล์
//   เปิดอ่าน = เปิดตัวไฟล์ในแท็บใหม่ด้วยตัวอ่านของเบราว์เซอร์เอง (ไม่มีหน้าต่างพรีวิวในระบบแล้ว
//   — บอสสั่งเอาออก 28 ส.ค. 69 · ของที่เอาออกคือหน้าต่างจำลอง ไม่ใช่ความสามารถในการเปิดอ่าน)
//   มี storagePath → ไฟล์จริงของผู้ใช้ (local = blob จาก IndexedDB · supabase/api = signed URL)
//   ไม่มี          → เอกสารตัวอย่างของระบบตามนามสกุล (ดู DEMO_SAMPLE)
async function openStoredFile(f: FileMock, mode: "open" | "download") {
  try {
    const url = f.storagePath ? await fileStorage.signedUrl(f.storagePath) : sampleOf(f);
    // ล้มเหลวเงียบ = กดแล้วไม่มีอะไรเกิดขึ้น แยกไม่ออกจากปุ่มเสีย → ต้องดังเป็นแถบเตือน
    if (!url) throw new Error("ไม่พบไฟล์จริงในระบบจัดเก็บ (อาจถูกลบไปแล้ว)");
    if (mode === "open") {
      window.open(url, "_blank", "noopener");
    } else {
      // blob:/ไฟล์ในเว็บเดียวกัน ใช้ attribute download ได้ตรง ๆ · signed URL ข้ามโดเมนต้องขอผ่านพารามิเตอร์
      const ข้ามโดเมน = /^https?:\/\//.test(url) && !url.startsWith(window.location.origin);
      const href = ข้ามโดเมน
        ? `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(downloadNameOf(f))}`
        : url;
      const a = document.createElement("a");
      a.href = href; a.download = downloadNameOf(f); a.rel = "noopener";
      document.body.appendChild(a); a.click(); a.remove();
    }
    // blob: URL ค้างไว้กินหน่วยความจำ — ปล่อยคืนหลังเบราว์เซอร์เปิด/บันทึกเสร็จ (เร็วกว่านี้ไฟล์จะไม่ขึ้น)
    if (url.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    reportRepoSaveError(e);
  }
}

// หน้าต่างอัปโหลด/แก้ไขไฟล์เอาออก (รอบ 4 · หน้าไฟล์ดูอย่างเดียว) — แนบ/ลบที่แผงลีด/แผงลูกค้า
function PaginationBar({
  from, to, total, page, totalPages, onPrev, onNext,
}: {
  from: number; to: number; total: number;
  page: number; totalPages: number;
  onPrev: () => void; onNext: () => void;
}) {
  const atFirst = page <= 1;
  const atLast  = page >= totalPages;
  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    padding: "6px 12px",
    borderRadius: 8,
    border: `1px solid ${disabled ? BORDER : PRIMARY}`,
    background: "#fff",
    color: disabled ? "#C0C0C0" : PRIMARY,
    fontSize: "0.72rem",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    transition: "all .15s",
  });
  return (
    <div style={{ padding: "11px 16px", borderTop: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
      <span style={{ fontSize: "0.72rem", color: MUTED }}>แสดง {from}–{to} จาก {total} ไฟล์</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={onPrev} disabled={atFirst} style={btnStyle(atFirst)}>ก่อนหน้า</button>
        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: STEEL }}>หน้า {page} / {totalPages}</span>
        <button onClick={onNext} disabled={atLast} style={btnStyle(atLast)}>ถัดไป</button>
      </div>
    </div>
  );
}

export default function FilesPage() {
  const router = useRouter();
  // คลังไฟล์รวม — ดึงไฟล์ที่แนบไว้กับลูกค้า/ลูกค้าเป้าหมายมารวมกัน (ไม่สร้างใหม่)
  // เริ่มว่างแล้วโหลดหลัง mount — กัน hydration mismatch (localStorage อ่านได้เฉพาะ client)
  const currentDealer = useCurrentDealer(); // คลังไฟล์เป็นของสาขานี้ (multi-tenant)
  const { customers } = useSales(); // ชื่อลูกค้าจากข้อมูลจริง (เดิมอ่านจากชุด seed → โหมด supabase ได้ชื่อผิดคน)
  const [files, setFiles] = useState<FileMock[]>([]);
  const [loaded, setLoaded] = useState(false); // false = กำลังโหลด (แสดง Skeleton)
  // อ่านไฟล์ของสาขานี้ผ่าน repository (local: localStorage · supabase: DB · RLS สาขาตัวเอง)
  // reloadFiles ถูกยิงซ้ำได้จากหลายทาง (mount, event, สลับสาขา) — ต้องกันผลลัพธ์เก่าที่มาช้ากว่า
  // ทับผลลัพธ์ใหม่ (เช่น สลับสาขาเร็ว ๆ หรืออัปโหลดไฟล์ 2 ครั้งใกล้กัน) ด้วย request token
  const reloadReqRef = useRef(0);
  const reloadFiles = () => {
    const myReq = ++reloadReqRef.current;
    return filesRepo.list({ dealerCode: currentDealer.code, isHQ: false })
      // ชื่อโฟลเดอร์เก่า ("แม่แบบ") ที่ค้างอยู่ในฐานข้อมูล → แปลงเป็นชื่อปัจจุบันตอนอ่าน
      .then(r => { if (reloadReqRef.current === myReq) setFiles(r.map(f => ({ ...f, category: normalizeFileCategory(f.category) }))); })
      .catch(e => logRepoRead("files.list", e));
  };
  useEffect(() => {
    reloadFiles().then(() => setLoaded(true));
    const sync = () => { void reloadFiles(); };
    window.addEventListener(DEALER_FILES_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(DEALER_FILES_EVENT, sync); window.removeEventListener("storage", sync); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDealer.code]);
  const [query,   setQuery]   = useState("");
  const [catFilter, setCat]   = useState<FileCategory | "ALL">("ALL");
  // "ไฟล์นี้ของใคร" — กรองตามที่มา (ลูกค้า/ลูกค้าเป้าหมาย/อัปโหลดเอง) และโอกาสการขายที่ผูกอยู่
  // ⚠️ ไม่มีตัวกรอง "ผู้อัปโหลด" (บอสสั่ง 28 ส.ค. 69) — ดีลเลอร์หนึ่งรายใช้บัญชีเดียว
  //    ชื่อในคอลัมน์อัปโหลดโดยคือชื่อผู้รับผิดชอบ ไม่ใช่ผู้ใช้คนละคน กรองด้วยจึงไม่มีความหมาย
  const [sourceFilter, setSource] = useState<string>("ALL");
  // ไฟล์นี้เป็นของลูกค้ารายไหน — ผูกผ่าน customerId ของไฟล์ (ไฟล์ที่ยังไม่ผูกลูกค้าจะไม่เข้าเงื่อนไขนี้)
  const [custFilter,   setCust]   = useState<string>("ALL");
  const [projFilter,   setProj]   = useState<string>("ALL");
  // extFilter ถูกลบพร้อมชิปสรุป + select "ทุกประเภท" — ไม่เหลือ UI ที่ตั้งค่าได้ จึงเป็นโค้ดตาย
  const [view,    setView]    = useState<"grid" | "list">("list");
  const [page,    setPage]    = useState(1);
  const PAGE_SIZE = 10;

  // แสดงทุกคอลัมน์เสมอ (ไม่มีเครื่องมือซ่อน/แสดงคอลัมน์ในมุมมองรายการแล้ว)
  const showCol = (_key: string) => true;

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return files.filter(f => {
      // ช่องว่างได้ในฐาน (ใบที่ไม่มีชื่อโครงการ → แถวไฟล์ของใบ project ว่าง) — เดิม .toLowerCase() ตรง ๆ หน้าไฟล์พังทั้งหน้า (15 ต.ค. 69)
      const มี = (v: string | null | undefined) => (v ?? "").toLowerCase().includes(q);
      const matchQ = !q || มี(f.name) || มี(f.project) || มี(f.uploadedBy);
      const matchC = catFilter === "ALL" || f.category === catFilter;
      const matchS = sourceFilter === "ALL" || f.source === sourceFilter;
      const matchCust = custFilter === "ALL" || String(f.customerId ?? "") === custFilter;
      const matchP = projFilter === "ALL" || f.project === projFilter;
      return matchQ && matchC && matchS && matchP && matchCust;
    });
  }, [files, query, catFilter, sourceFilter, projFilter, custFilter]);

  // ตัวเลือกในแถบกรองสร้างจากไฟล์จริงที่มีอยู่เท่านั้น (ไม่ hardcode รายชื่อคน/โครงการ)
  const projOptions = useMemo(
    () => Array.from(new Set(files.map(f => f.project).filter(p => p && p !== "—"))).sort((a, b) => a.localeCompare(b, "th")),
    [files]);
  // ตัวเลือก "ลูกค้า" = ลูกค้าที่มีไฟล์ผูกอยู่จริงเท่านั้น · ชื่อมาจากทะเบียนลูกค้า (ไม่ใช่ชื่อในไฟล์)
  const custOptions = useMemo(() => {
    const ไอดี = Array.from(new Set(files.map(f => f.customerId).filter((id): id is number => !!id)));
    return ไอดี
      .map(id => ({ v: String(id), l: customers.find(c => c.id === id)?.company ?? `ลูกค้า #${id}` }))
      .sort((a, b) => a.l.localeCompare(b.l, "th"));
  }, [files, customers]);
  const sourceOptions = useMemo(
    () => (["customer", "lead", "upload"] as const).filter(sv => files.some(f => f.source === sv)),
    [files]);

  // เปลี่ยนตัวกรอง/ค้นหา/มุมมอง → กลับไปหน้าแรก
  useEffect(() => { setPage(1); }, [query, catFilter, sourceFilter, projFilter, custFilter, view]);

  // ── เรียงลำดับ: กดหัวคอลัมน์ได้ (บอสสั่ง 16 ก.ย. 69 "ตอนกดทำให้เรียงได้") ──────────────
  //   ค่าเริ่มต้น = ไฟล์ใหม่สุดอยู่บนสุด (บอสสั่ง 16 ก.ย. 69 "ตอนเพิ่มข้อมูลทุกอันต้องอยู่อันแรกเสมอ")
  //   ขนาดเก็บเป็นข้อความ ("2.4 MB") → แปลงเป็นไบต์ก่อนเทียบ ไม่งั้น "10 MB" มาก่อน "9 MB"
  const [sortKey, setSortKey] = useState<FileSortKey>("uploadedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const toggleSort = (k: FileSortKey) => {
    if (sortKey === k) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "uploadedAt" || k === "size" ? "desc" : "asc"); }
  };
  // เปลี่ยนการเรียง → กลับหน้าแรก (ไม่งั้นค้างอยู่หน้ากลางลิสต์)
  useEffect(() => { setPage(1); }, [sortKey, sortDir]);
  const sorted = useMemo(() => {
    const ค่า = (f: DealerFile): string | number =>
      sortKey === "size" ? sizeBytes(f.size) : String(f[sortKey] ?? "");
    const คูณ = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = ค่า(a), vb = ค่า(b);
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "th");
      // เท่ากัน → ใหม่กว่าขึ้นก่อน (id เพิ่มตามลำดับที่เพิ่ม)
      return cmp !== 0 ? cmp * คูณ : b.id - a.id;
    });
  }, [filtered, sortKey, sortDir]);
  const หัวเรียง = (k: FileSortKey, label: string) => (
    <SortableTh label={label} active={sortKey === k} dir={sortDir} onSort={() => toggleSort(k)}>
      {label}
      {sortKey === k
        ? (sortDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
        : <ChevronDown size={11} style={{ opacity: 0.3 }} />}
    </SortableTh>
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // กันหน้าเกินเมื่อจำนวนรายการลดลง (เช่น ลบไฟล์)
  const curPage = Math.min(page, totalPages);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const pageStart = (curPage - 1) * PAGE_SIZE;
  const paged = sorted.slice(pageStart, pageStart + PAGE_SIZE);
  const rangeFrom = filtered.length === 0 ? 0 : pageStart + 1;
  const rangeTo   = Math.min(pageStart + PAGE_SIZE, filtered.length);

  // totalSize (ขนาดรวมของไฟล์ทั้งหมด) ถูกลบพร้อมคำโปรยใต้ชื่อหน้า — ไม่มีใครอ่านแล้ว

  // extCounts ถูกลบพร้อมชิปสรุปประเภทไฟล์ (PDF/Excel/Word/PowerPoint) — ไม่มีใครอ่านแล้ว

  const catCounts = useMemo(() => {
    const c: Record<FileCategory, number> = {
      ใบเสนอราคา: 0, แบบแปลน: 0, รูปภาพ: 0, นำเสนอ: 0, สัญญา: 0, "อื่นๆ": 0,
    };
    files.forEach(f => { c[f.category] += 1; });
    return c;
  }, [files]);

  return (
    <div className="erp">
      {/* Header */}
      {/* หัวหน้า/ปุ่ม → ไปอยู่บนแถบบน (ชื่อหน้ามาจาก Topbar) */}
      {/* หน้าไฟล์ดูอย่างเดียว (รอบ 4 · บอสสั่ง 21 ต.ค. 69) — แนบ/ลบไฟล์ที่แผงลีดหรือแผงลูกค้า · ปุ่มอัปโหลด/แก้ไข/ลบเอาออก */}
      {/* คำโปรยใต้ชื่อหน้าถูกเอาออกทุกหน้า (บอสสั่ง 14 ส.ค. 69) */}

      {/* ชิปสรุป (ไฟล์ทั้งหมด/ขนาดรวม/PDF/Excel/Word/PowerPoint) เอาออกตามที่บอสสั่ง */}

      {/* การ์ดชิป "โฟลเดอร์" ถูกเอาออก (บอสสั่ง 28 ส.ค. 69) — ย้ายไปเป็นช่อง "ทุกโฟลเดอร์"
          ในแถบเครื่องมือแถวเดียวกับตัวกรองอื่น จะได้เห็นตัวกรองทั้งหมดพร้อมกันโดยไม่กินพื้นที่หน้าจอ */}

      {/* Toolbar */}
      {/* แถบเครื่องมือเป็นการ์ดของตัวเอง แยกจากตาราง (บอสสั่ง 28 ส.ค. 69) — เดิมเชื่อมติดกันเป็นใบเดียว */}
      <div className="card" style={{ padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div className="search-bar">
          <Search size={13} color={MUTED} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาไฟล์ / โอกาสการขาย..." />
          {query && <button onClick={() => setQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, display: "flex", padding: 0 }}><X size={11} /></button>}
        </div>
        {/* ตัวเลือก "ทุกประเภท" เอาออกตามที่บอสสั่ง */}
        {/* โฟลเดอร์ + แถบแยก "ไฟล์นี้ของใคร" (ผู้อัปโหลด · ที่มา · โอกาสการขาย) — FilterSelect มาตรฐานเดียวกับหน้าอื่น */}
        {/* ความกว้าง = พอดีข้อความในช่อง (minWidth 0) — ก่อนหน้านี้ตั้ง 130–150 ทำให้ช่องยาวเกินคำว่างเป็นแถบ */}
        <FilterSelect caption="ทุกโฟลเดอร์" label="กรองตามโฟลเดอร์" value={catFilter} onChange={v => setCat(v as FileCategory | "ALL")}
          options={ALL_CATS.filter(c => catCounts[c] > 0).map(c => ({ v: c, l: `${c} (${catCounts[c]})` }))} minWidth={0} />
        <FilterSelect caption="ทุกที่มา" label="กรองตามที่มาของไฟล์" value={sourceFilter} onChange={setSource}
          options={sourceOptions.map(sv => ({ v: sv, l: SOURCE_LABEL[sv] }))} minWidth={0} />
        {/* ชื่อบริษัทยาวกว่าช่องอื่นมาก — จำกัดความกว้างไว้ ไม่งั้นแถบเครื่องมือตกบรรทัดที่จอ 1440 */}
        <FilterSelect caption="ทุกลูกค้า" label="กรองตามลูกค้า" value={custFilter} onChange={setCust}
          options={custOptions} minWidth={0} maxWidth={150} />
        <FilterSelect caption="ทุกโอกาสการขาย" label="กรองตามโอกาสการขาย" value={projFilter} onChange={setProj}
          options={projOptions.map(pj => ({ v: pj, l: pj }))} minWidth={0} maxWidth={150} />
        {(sourceFilter !== "ALL" || projFilter !== "ALL" || catFilter !== "ALL" || custFilter !== "ALL" || !!query) && (
          <button onClick={() => { setQuery(""); setCat("ALL"); setSource("ALL"); setProj("ALL"); setCust("ALL"); }}
            className="btn btn-secondary btn-sm">ล้างตัวกรอง</button>
        )}
        <div style={{ display: "flex", border: `1px solid ${BORDER}`, borderRadius: 9, overflow: "hidden", marginLeft: "auto", height: 36, boxSizing: "border-box" }}>
          {(["list","grid"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: "0 13px", height: "100%", border: "none", background: view === v ? PRIMARY : "#fff", color: view === v ? "#fff" : MUTED, fontSize: "0.72rem", fontWeight: 600, cursor: "pointer" }}>
              {v === "list" ? "รายการ" : "กริด"}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {view === "list" ? (
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="table-wrap">
            <table>
              <colgroup>
                {/* ⚠️ ตาราง table-layout:fixed — ความกว้างแก้ที่ <col> เท่านั้น (ใส่ที่ <th> ไม่มีผล)
                    ช่องปุ่มขวาสุด: เปิดอ่าน/ดาวน์โหลด (เฉพาะไฟล์ที่มีตัวไฟล์จริง) / แก้ไข / ลบ */}
                <col style={{ width: "22%" }} />
                {showCol("category")   && <col style={{ width: "10%" }} />}
                {showCol("project")    && <col style={{ width: "20%" }} />}
                {showCol("size")       && <col style={{ width: "8%" }} />}
                {showCol("uploadedBy") && <col style={{ width: "12%" }} />}
                {showCol("uploadedAt") && <col style={{ width: "12%" }} />}
                <col style={{ width: "15%" }} />
              </colgroup>
              <thead>
                <tr>
                  {หัวเรียง("name", "ไฟล์")}
                  {showCol("category")   && หัวเรียง("category", "โฟลเดอร์")}
                  {showCol("project")    && หัวเรียง("project", "โอกาสการขาย")}
                  {showCol("size")       && หัวเรียง("size", "ขนาด")}
                  {showCol("uploadedBy") && หัวเรียง("uploadedBy", "อัปโหลดโดย")}
                  {showCol("uploadedAt") && หัวเรียง("uploadedAt", "วันที่")}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {!loaded ? (
                  Array.from({ length: 6 }).map((_, r) => (
                    <tr key={`sk-${r}`}>{Array.from({ length: 2 + COLS.filter(c => showCol(c.key)).length }).map((_, i) => (
                      <td key={i}><Skeleton h={13} w={i === 0 ? "70%" : "55%"} /></td>
                    ))}</tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={2 + COLS.filter(c => showCol(c.key)).length} style={{ padding: 0 }}>
                    <EmptyState icon={<FolderOpen size={28} />} title="ไม่พบไฟล์"
                      description={query || catFilter !== "ALL" || sourceFilter !== "ALL" || projFilter !== "ALL" || custFilter !== "ALL" ? "ลองปรับคำค้นหรือล้างตัวกรอง" : "ไฟล์จะปรากฏเมื่อแนบกับลูกค้าเป้าหมายหรือลูกค้า"} />
                  </td></tr>
                ) : null}
                {/* แถวไม่กดเปิดหน้าต่างพรีวิวแล้ว (บอสสั่ง 28 ส.ค. 69) — ใช้ปุ่มด้านขวาแทน
                    ดาวน์โหลดไฟล์จริง / แก้ไขข้อมูลไฟล์ / ลบ */}
                {paged.map(f => (
                  <tr key={f.id}>
                    <td style={{ maxWidth: 260 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ background: extBg(f.ext), borderRadius: 8, padding: 7, display: "flex", flexShrink: 0 }}>{extIcon(f.ext)}</div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: STEEL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                          <div style={{ fontSize: "0.65rem", color: MUTED, marginTop: 2 }}>{extLabel(f.ext)}</div>
                        </div>
                      </div>
                    </td>
                    {showCol("category") && (
                      <td>
                        <span className="badge" style={{ background: CAT_COLORS[f.category].bg, color: CAT_COLORS[f.category].text }}>{f.category}</span>
                      </td>
                    )}
                    {showCol("project") && (
                      <td>
                        {f.project !== "—" ? (
                          <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                            <span style={{ fontSize:"0.72rem", color:STEEL }}>{f.project}</span>
                            {f.customerId && (
                              <button onClick={e => { e.stopPropagation(); router.push(`/customers?open=${f.customerId}`); }}
                                style={{ fontSize:"0.65rem", color:PRIMARY, fontWeight:700, background:"none", border:"none", padding:0, cursor:"pointer", textDecoration:"underline", textAlign:"left" }}>
                                {customers.find(c=>c.id===f.customerId)?.company ?? `ลูกค้า #${f.customerId}`} →
                              </button>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize:"0.72rem", color:MUTED }}>—</span>
                        )}
                      </td>
                    )}
                    {/* เอกสารที่ระบบสร้างให้ตอนพิมพ์ (เช่นใบเสนอราคา) ไม่ได้เก็บไฟล์ไว้จริง จึงไม่มีขนาด — ขึ้น "—" ไม่ใช่ช่องว่าง */}
                    {showCol("size")       && <td style={{ fontSize: "0.72rem", color: MUTED, whiteSpace: "nowrap" }}>{f.size || "—"}</td>}
                    {showCol("uploadedBy") && (
                      <td style={{ fontSize: "0.72rem", color: STEEL }}>
                        <div>{f.uploadedBy}</div>
                        {/* ที่มา = ไฟล์นี้ผูกอยู่กับใคร (ลูกค้า/ลูกค้าเป้าหมาย) หรืออัปโหลดเข้าคลังตรง ๆ */}
                        <div style={{ fontSize: "0.65rem", color: MUTED, marginTop: 2 }}>{SOURCE_LABEL[f.source]}</div>
                      </td>
                    )}
                    {showCol("uploadedAt") && <td style={{ fontSize: "0.72rem", color: MUTED, whiteSpace: "nowrap" }}>{f.uploadedAt}</td>}
                    <td className="ovf-visible">
                      <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                        {/* ไม่มีหน้าต่างพรีวิวในระบบแล้ว — "เปิดอ่าน" เปิดตัวไฟล์จริงในแท็บใหม่
                            ให้เบราว์เซอร์เป็นคนแสดง · ทั้งคู่ขึ้นเฉพาะไฟล์ที่มีตัวไฟล์ให้เปิดจริง */}
                        {hasOpenable(f) && (
                          <>
                            <button title="เปิดอ่านไฟล์" onClick={e => { e.stopPropagation(); void openStoredFile(f, "open"); }}
                              style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${BORDER}`, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: PRIMARY }}>
                              <ExternalLink size={12} />
                            </button>
                            <button title="ดาวน์โหลดไฟล์" onClick={e => { e.stopPropagation(); void openStoredFile(f, "download"); }}
                              style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${BORDER}`, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: PRIMARY }}>
                              <Download size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar
            from={rangeFrom} to={rangeTo} total={filtered.length}
            page={curPage} totalPages={totalPages}
            onPrev={() => setPage(p => Math.max(1, p - 1))}
            onNext={() => setPage(p => Math.min(totalPages, p + 1))}
          />
        </div>
      ) : (
        /* Grid view */
        <div className="card" style={{ padding: 16 }}>
          {!loaded ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, background: "#fafbfc", display: "flex", flexDirection: "column", gap: 10 }}>
                  <Skeleton w={40} h={40} r={9} /><Skeleton h={12} w="80%" /><Skeleton h={10} w="55%" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={<FolderOpen size={28} />} title="ไม่พบไฟล์"
              description={query || catFilter !== "ALL" || sourceFilter !== "ALL" || projFilter !== "ALL" || custFilter !== "ALL" ? "ลองปรับคำค้นหรือล้างตัวกรอง" : "ไฟล์จะปรากฏเมื่อแนบกับลูกค้าเป้าหมายหรือลูกค้า"} />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {paged.map(f => (
                <div key={f.id} style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, background: "#fafbfc", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ background: extBg(f.ext), borderRadius: 9, padding: 9, display: "flex" }}>{extIcon(f.ext)}</div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {/* เปิดอ่าน = เปิดไฟล์ในแท็บใหม่ (ไม่มีหน้าต่างพรีวิวในระบบ) เหมือนมุมมองรายการ */}
                      {hasOpenable(f) && (
                        <button title="เปิดอ่านไฟล์" onClick={e => { e.stopPropagation(); void openStoredFile(f, "open"); }} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${BORDER}`, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: PRIMARY }}>
                          <ExternalLink size={11} />
                        </button>
                      )}
                      {hasOpenable(f) && (
                        <button title="ดาวน์โหลดไฟล์" onClick={e => { e.stopPropagation(); void openStoredFile(f, "download"); }} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${BORDER}`, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: PRIMARY }}>
                          <Download size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: STEEL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.name}>{f.name}</div>
                    <div style={{ fontSize: "0.65rem", color: MUTED, marginTop: 3 }}>{f.size || "—"} · {f.uploadedAt}</div>
                    <div style={{ fontSize: "0.65rem", color: MUTED, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${f.uploadedBy} · ${SOURCE_LABEL[f.source]}`}>
                      {f.uploadedBy} · {SOURCE_LABEL[f.source]}
                    </div>
                  </div>
                  <span className="badge" style={{ background: CAT_COLORS[f.category].bg, color: CAT_COLORS[f.category].text, alignSelf: "flex-start" }}>{f.category}</span>
                </div>
              ))}
            </div>
          )}
          {filtered.length > 0 && (
            <div style={{ marginTop: 12, marginLeft: -16, marginRight: -16, marginBottom: -16 }}>
              <PaginationBar
                from={rangeFrom} to={rangeTo} total={filtered.length}
                page={curPage} totalPages={totalPages}
                onPrev={() => setPage(p => Math.max(1, p - 1))}
                onNext={() => setPage(p => Math.min(totalPages, p + 1))}
              />
            </div>
          )}
        </div>
      )}

    </div>
  );
}
