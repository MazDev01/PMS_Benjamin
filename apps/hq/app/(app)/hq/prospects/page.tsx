"use client";

// ─── HQ · ผู้สนใจของสำนักงานใหญ่ (ผู้สนใจเป็นดีลเลอร์) ────────────────────
//
// บอสสั่ง 14 ก.ย. 69:
//   "เพิ่มโมดูลผู้สนใจของทางฝั่ง HQ และเมื่อสำเร็จจากผู้สนใจจะกลายเป็นดีลเลอร์"
//   "ทำให้ ผู้สนใจ ออกแบบการทำออกมาใช้งานให้เสร็จ" · "ให้มันทำงานแบบเดียวกับดีลเลอร์"
//
// ทำงานแบบเดียวกับลูกค้าเป้าหมายของดีลเลอร์:
//   กดแถว → แผงกลางจอ 820px หัวน้ำเงิน + ปุ่มลัด + แท็บ
//     ภาพรวม (แก้ข้อมูล) · งาน/ความคืบหน้า (ติ๊กงาน ขั้นเลื่อนเอง) · บันทึกการติดต่อ (+ ประวัติ) · ใบค่าแฟรนไชส์
//   ตารางมี "ติดต่อล่าสุด" + ตัวกรองไม่ได้ติดต่อ 7/14/30 วัน (สเปก: ตัวกรองติดตามด่วน)
//   ปิดท้าย: ตั้งเป็นดีลเลอร์ (สร้างสาขาใหม่พร้อมบัญชี / ผูกกับดีลเลอร์ที่มีอยู่) หรือ ไม่สำเร็จ
//
// ⚠️ ขั้นเปลี่ยนจากงานเท่านั้น — ฟอร์มไม่มีช่องเลือกสถานะแล้ว · ฐานข้อมูลบังคับทีละขั้น (0174)
// ⚠️ คนละเรื่องกับ "ลูกค้าเป้าหมายทั้งเครือ" (/hq/leads = ลูกค้าที่จะซื้ออาคารของดีลเลอร์) — คนละตาราง (0170)
//
// สิทธิ์: ดูได้ทุกบทบาทฝั่งสำนักงานใหญ่ · เพิ่ม/แก้/ลบ/ตั้งเป็นดีลเลอร์ = ผู้มีสิทธิ์จัดการดีลเลอร์ (dealers:manage)
//   RLS บังคับซ้ำที่ฐานข้อมูล — การซ่อนปุ่มตรงนี้เป็นแค่ความสะดวก ไม่ใช่ด่านจริง
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  UserPlus, Users, AlarmClock, Store, Percent, Search, X, Trash2, Copy, Check, MapPin, Phone, User, Paperclip,
} from "lucide-react";
import {
  prospects as prospectsRepo, dealers as dealersRepo, proposals as proposalsRepo, prospectActivities as activitiesRepo,
  users as usersRepo, territories as territoriesRepo, metrics as metricsRepo,
} from "@pms/shared/lib/data";
import type { HqOverview } from "@pms/shared/lib/hqOverview";
import { invalidateCache } from "@pms/shared/lib/data/dedupe";
import type { DealerPackageProposal, DealerProspect, DealerProspectStatus, DealerRow, ProspectActivity, SystemUser } from "@pms/shared/lib/data/types";
import {
  PROSPECT_STATUS_ORDER, prospectStatusLabel, prospectStatusColor, ยังติดตามอยู่,
  เตรียมบันทึก, ตรวจผู้สนใจ, ถึงกำหนดติดตาม, สรุปผู้สนใจ, ตรงกับคำค้น,
} from "@pms/shared/lib/dealerProspects";
import {
  ความคืบหน้า, ขั้นก่อนไม่สำเร็จ, มีบันทึกการติดต่อ, เกณฑ์ไม่ได้ติดต่อ, ไม่ได้ติดต่อเกิน, ติดต่อล่าสุดอ่านง่าย,
} from "@pms/shared/lib/prospectJourney";
import { REGIONS, ALL_REGIONS, ALL_PROVINCES, provincesOfRegion, regionOf } from "@pms/shared/lib/provinces";
import { createDealerAccount, linkProspectToDealer, listDealerLoginEmails } from "@pms/shared/lib/adminApi";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";
import { DEMO_PASSWORD } from "@pms/shared/lib/auth";
import { ProspectProposalsPanel } from "@pms/shared/components/hq/ProspectProposalsPanel";
import { ProspectJourney } from "@pms/shared/components/hq/ProspectJourney";
import { ProspectActivityPanel } from "@pms/shared/components/hq/ProspectActivityPanel";
import { มีใบเสนอที่ส่งแล้ว, ใบหลักสำหรับตั้งดีลเลอร์, มูลค่าอ่านง่าย } from "@pms/shared/lib/dealerProposals";
import { useRole } from "@pms/shared/context/RoleContext";
import { useAuditLogger } from "@pms/shared/lib/useAudit";
import { APP_NOW_ISO } from "@pms/shared/context/FilterContext";
import { ExportMenu } from "@pms/shared/components/ui/ExportMenu";
import { TopbarActions } from "@pms/shared/components/layout/TopbarActions";
import { ModalCard } from "@pms/shared/components/ui/ModalCard";
import { TablePagination, pageSlice, pageCountOf, ROWS_PER_PAGE } from "@pms/shared/components/ui/TablePagination";
import { ClickableRow } from "@pms/shared/components/ui/ClickableRow";
import { ยืนยัน, แจ้งพลาด, แจ้งสำเร็จ } from "@pms/shared/components/ui/ConfirmToast";
import { formatPhone } from "@pms/shared/lib/format";
import { fileToResizedDataURL } from "@pms/shared/lib/imageResize";
import { fmtISOToThai } from "@pms/shared/lib/mock";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { useRecruitSettings } from "@pms/shared/lib/useHQConfig";
import { อีเมลเข้าระบบของสาขา } from "@pms/shared/lib/dealerLogin";

const PRIMARY = "#003366";
const MUTED = "#6b7280";
const HQ_CODE = "HQ";
// ช่องทางที่เข้ามา / ประเภทธุรกิจ / ช่องทางติดต่อ / เหตุผลที่ไม่สำเร็จ / ชื่องาน มาจากหน้าตั้งค่า › หาดีลเลอร์ (0176)
//   เดิมเขียนตายตัวที่นี่ — ทีมเพิ่มตัวเลือกเองไม่ได้ (บอสสั่งให้ตั้งเองได้ 14 ก.ย. 69)

const ร่างว่าง = (): Partial<DealerProspect> => ({ name: "", status: "new", firstContact: APP_NOW_ISO });

type ฟอร์มดีลเลอร์ = { code: string; name: string; region: string; province: string; email: string; password: string; existingCode: string };
type แท็บ = "overview" | "tasks" | "contact" | "proposals";
type ตัวกรองสถานะ = "all" | "due" | "idle7" | "idle14" | "idle30" | DealerProspectStatus;

const แท็บทั้งหมด: { key: แท็บ; label: string }[] = [
  { key: "overview",  label: "ภาพรวม" },
  { key: "tasks",     label: "งาน/ความคืบหน้า" },
  { key: "contact",   label: "บันทึกการติดต่อ" },
  { key: "proposals", label: "ใบค่าแฟรนไชส์" },
];

export default function HQProspectsPage() {
  const { can } = useRole();
  const จัดการได้ = can("dealers:manage");
  const logAudit = useAuditLogger();
  const ค่าตั้ง = useRecruitSettings();
  // "อื่น ๆ" ต่อท้ายให้เสมอ — ช่องทางที่ไม่อยู่ในรายการยังเลือกได้
  const ตัวเลือกช่องทาง = ค่าตั้ง.channels.includes("อื่น ๆ") ? ค่าตั้ง.channels : [...ค่าตั้ง.channels, "อื่น ๆ"];

  const [list, setList] = useState<DealerProspect[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [dealers, setDealers] = useState<DealerRow[]>([]);
  const [ผู้ใช้HQ, setผู้ใช้HQ] = useState<SystemUser[]>([]);

  const [q, setQ] = useState("");
  // แถบสรุปย้ายมาจากแดชบอร์ด (บอสสั่ง 21 ต.ค. 69) — ผู้สนใจกำลังคุย · จังหวัดที่มีลูกค้าเป้าหมายแต่ยังไม่มีดีลเลอร์ (hq_overview · ใบ 0209)
  const [ภาพรวม, setภาพรวม] = useState<HqOverview["recruit"] | null>(null);
  useEffect(() => {
    metricsRepo.hqOverview().then(o => setภาพรวม(o.recruit)).catch(e => logRepoRead("metrics.hqOverview", e));
    // ?q= (กิจกรรมล่าสุดของแดชบอร์ด) = ค้นชื่อผู้สนใจ
    const คำ = new URLSearchParams(window.location.search).get("q");
    if (คำ) { setQ(คำ); window.history.replaceState(null, "", "/hq/prospects"); }
  }, []);
  const [statusFilter, setStatusFilter] = useState<ตัวกรองสถานะ>("all");
  const [provinceFilter, setProvinceFilter] = useState("all");
  const [page, setPage] = useState(0);

  // เพิ่มรายใหม่ (หน้าต่างเล็ก) · รายที่เปิดดู (แผงกลางจอ)
  const [เพิ่มใหม่, setเพิ่มใหม่] = useState(false);
  const [รายที่เปิด, setรายที่เปิด] = useState<DealerProspect | null>(null);
  const เปิดอยู่Ref = useRef<number | null>(null);
  const [แท็บที่เปิด, setแท็บที่เปิด] = useState<แท็บ>("overview");
  const [ร่าง, setร่าง] = useState<Partial<DealerProspect>>(ร่างว่าง());
  const [formErr, setFormErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [stageBusy, setStageBusy] = useState(false);

  // ของรายที่เปิด: ใบเสนอ · ประวัติ
  const [ใบของรายที่เปิด, setใบของรายที่เปิด] = useState<DealerPackageProposal[]>([]);
  const [ประวัติ, setประวัติ] = useState<ProspectActivity[]>([]);
  const [ประวัติโหลดแล้ว, setประวัติโหลดแล้ว] = useState(false);
  const [ประวัติผิด, setประวัติผิด] = useState("");
  const [ฟอร์มติดต่อเปิด, setฟอร์มติดต่อเปิด] = useState(false);
  const [สัญญาณออกใบ, setสัญญาณออกใบ] = useState(0);

  const [converting, setConverting] = useState<DealerProspect | null>(null);
  const [โหมดตั้ง, setโหมดตั้ง] = useState<"new" | "existing">("new");
  const [ฟอร์ม, setฟอร์ม] = useState<ฟอร์มดีลเลอร์>({ code: "", name: "", region: "", province: "", email: "", password: "", existingCode: "" });
  const [convErr, setConvErr] = useState("");
  const [convBusy, setConvBusy] = useState(false);
  // จังหวัดที่ดูแล (ด่าน 4 · FLOW: แปลงเป็นดีลเลอร์ · HQ กำหนดจังหวัดที่ดูแล · หนึ่งจังหวัด หนึ่งดีลเลอร์ 0195)
  //   เจ้าของพื้นที่ = null ระหว่างโหลด · โหลดไม่ได้ = บอกตรง ๆ ห้ามแสดงว่าทุกจังหวัดว่าง
  const [พื้นที่, setพื้นที่] = useState<string[]>([]);
  const [เจ้าของพื้นที่, setเจ้าของพื้นที่] = useState<Map<string, string[]> | null>(null);   // จังหวัด → ดีลเลอร์ที่ดูแลอยู่ (หลายรายได้ · ใบ 0214)
  const [พื้นที่ผิด, setพื้นที่ผิด] = useState("");
  // ตกลง + ชำระ (0208): ฐานข้อมูลตอบว่าพร้อมแปลงไหม — undefined = กำลังตรวจ · null = พร้อม · ข้อความ = ยังไม่พร้อมเพราะอะไร
  const [ยังไม่พร้อมแปลง, setยังไม่พร้อมแปลง] = useState<string | null | undefined>(undefined);
  // ผูกกับสาขาที่ยังไม่มีบัญชีเข้าระบบ — ผูกได้ แต่ต้องเตือนให้เห็นชัด พร้อมทางไปตั้งอีเมล/รหัสผ่าน
  const [ผูกแล้วไม่มีบัญชี, setผูกแล้วไม่มีบัญชี] = useState<{ name: string; code: string } | null>(null);
  // สาขาที่มีบัญชีเข้าระบบ (รหัส → อีเมล) — โหลดตอนเปิดหน้าต่างผูก · null = ยังไม่รู้ (ไม่เตือนมั่ว)
  const [สาขามีบัญชี, setสาขามีบัญชี] = useState<Record<string, string> | null>(null);
  const [creds, setCreds] = useState<{ name: string; code: string; email: string; password: string } | null>(null);
  const [คัดลอกแล้ว, setคัดลอกแล้ว] = useState("");
  const รูปRef = useRef<HTMLInputElement>(null);

  const โหลด = useCallback(async () => {
    try {
      setList(await prospectsRepo.list());
      setLoadErr("");
    } catch (e) {
      // ห้ามปล่อยตารางว่างเงียบ ๆ — ผู้ใช้จะนึกว่ายังไม่มีข้อมูล แล้วกรอกซ้ำ
      setLoadErr(friendlyError(e, "โหลดผู้สนใจไม่สำเร็จ"));
    } finally {
      setLoaded(true);
    }
  }, []);
  const โหลดดีลเลอร์ = useCallback(() => {
    dealersRepo.list().then(setDealers).catch(e => logRepoRead("dealers.list", e));
  }, []);
  useEffect(() => { void โหลด(); โหลดดีลเลอร์(); }, [โหลด, โหลดดีลเลอร์]);
  // เปิดหน้าต่างผูก → ถามเซิร์ฟเวอร์ว่าสาขาไหนมีบัญชีเข้าระบบ (ห้ามเดาจากรหัสสาขา)
  const เปิดผูกอยู่ = !!converting;
  useEffect(() => {
    if (!เปิดผูกอยู่) return;
    let alive = true;
    listDealerLoginEmails().then(m => { if (alive) setสาขามีบัญชี(m); }).catch(() => {});
    return () => { alive = false; };
  }, [เปิดผูกอยู่]);
  // ผู้ดูแล = ผู้ใช้งานสำนักงานใหญ่ที่เปิดใช้งานอยู่ (บอสสั่ง 14 ก.ย. 69: "ทำเป็นดรอปดาวน์ เอาจากผู้ใช้งานสำนักงานใหญ่")
  //   เก็บเป็นชื่อเหมือนเดิม (ช่อง assigned) — ไม่ต้องเปลี่ยนฐานข้อมูล · โหลดไม่ได้ = รายการว่าง ค่าเดิมยังแสดงอยู่
  useEffect(() => {
    usersRepo.list()
      .then(rows => setผู้ใช้HQ(rows
        .filter(u => !u.dealerCode && u.status === "active" && u.name.trim())
        .sort((a, b) => a.name.localeCompare(b.name, "th"))))
      .catch(e => logRepoRead("users.list", e));
  }, []);

  // ── ของรายที่เปิด: ใบเสนอ + ประวัติ (งานในแท็บต้องรู้ว่ามีใบที่ส่งแล้ว/มีบันทึกการติดต่อหรือยัง) ──
  const โหลดของราย = useCallback(async (id: number) => {
    try {
      const [ป, ใ] = await Promise.all([activitiesRepo.list(id), proposalsRepo.list(id)]);
      if (เปิดอยู่Ref.current !== id) return;   // ปิด/เปลี่ยนรายไปแล้ว — ผลที่มาช้าห้ามทับของรายใหม่
      setประวัติ(ป);
      setใบของรายที่เปิด(ใ);
      setประวัติผิด("");
    } catch (e) {
      if (เปิดอยู่Ref.current === id) setประวัติผิด(friendlyError(e, "โหลดประวัติไม่สำเร็จ"));
    } finally {
      if (เปิดอยู่Ref.current === id) setประวัติโหลดแล้ว(true);
    }
  }, []);

  // ฐานข้อมูลเปลี่ยนรายนี้ให้เอง (บันทึกการติดต่อ → ติดต่อล่าสุด/นัดติดตาม/ขั้น · ส่งใบ → รอตัดสินใจ) — ดึงของจริงใหม่
  const รีเฟรชรายที่เปิด = useCallback(async () => {
    const id = เปิดอยู่Ref.current;
    if (id == null) return;
    try {
      const ทั้งหมด = await prospectsRepo.list();
      setList(ทั้งหมด);
      const สด = ทั้งหมด.find(x => x.id === id);
      if (สด && เปิดอยู่Ref.current === id) {
        setรายที่เปิด(สด);
        setร่าง(r => ({ ...r, followUp: สด.followUp, firstContact: สด.firstContact }));
      }
    } catch (e) {
      logRepoRead("prospects.list", e);
    }
    void โหลดของราย(id);
  }, [โหลดของราย]);

  // แผงใบเสนอแจ้งรายการใหม่ → ดึงรายนี้ใหม่ด้วย (ส่งใบแล้วขั้นอาจเลื่อน) · ต้องคงที่ ไม่งั้นแผงโหลดวน
  const เมื่อใบเปลี่ยน = useCallback((l: DealerPackageProposal[]) => {
    setใบของรายที่เปิด(l);
    void รีเฟรชรายที่เปิด();
  }, [รีเฟรชรายที่เปิด]);

  function เปิดแผง(p: DealerProspect, แท็บเริ่ม: แท็บ = "overview") {
    เปิดอยู่Ref.current = p.id;
    setรายที่เปิด(p);
    setแท็บที่เปิด(แท็บเริ่ม);
    // รายเก่าที่ยังไม่มีภาค แต่จังหวัดเป็นจังหวัดที่ระบบรู้จัก → เติมภาคให้ในฟอร์ม จะได้เลือกจังหวัดต่อได้ทันที
    setร่าง({ ...p, region: p.region || regionOf(p.province ?? "") });
    setFormErr("");
    setใบของรายที่เปิด([]);
    setประวัติ([]);
    setประวัติโหลดแล้ว(false);
    setประวัติผิด("");
    setฟอร์มติดต่อเปิด(false);
    setสัญญาณออกใบ(0);
    void โหลดของราย(p.id);
  }
  function ปิดแผงทันที() {
    เปิดอยู่Ref.current = null;
    setรายที่เปิด(null);
  }
  function ปิดแผง() {
    if (saving || stageBusy) return;
    ปิดแผงทันที();
  }

  // ?open=ID → เปิดแผงรายนั้นหลังโหลดรายการเสร็จ (ลิงก์จากหน้าใบค่าแฟรนไชส์) · ล้างพารามิเตอร์กันเปิดซ้ำตอนรีเฟรช
  //   ไม่พบ = บอกตรง ๆ ไม่เงียบ (รายนั้นอาจถูกลบไปแล้ว)
  const เปิดจากลิงก์แล้ว = useRef(false);
  useEffect(() => {
    if (!loaded || เปิดจากลิงก์แล้ว.current) return;
    เปิดจากลิงก์แล้ว.current = true;
    const รหัส = new URLSearchParams(window.location.search).get("open");
    if (!รหัส) return;
    window.history.replaceState(null, "", "/hq/prospects");
    const ราย = list.find(x => String(x.id) === รหัส);
    // เป็นดีลเลอร์แล้ว = ไม่อยู่หน้านี้ → พาไปหน้าดีลเลอร์นั้นแทน (ลิงก์เก่าจากกระดิ่ง/บันทึกการใช้งานยังใช้ได้)
    if (ราย?.status === "won") {
      if (ราย.dealerCode) window.location.assign(`/hq/dealers/${ราย.dealerCode}`);
      else แจ้งพลาด(`“${ราย.name}” เป็นดีลเลอร์แล้ว แต่ไม่พบดีลเลอร์ที่ผูกไว้ (อาจถูกลบไปแล้ว)`);
    }
    else if (ราย) เปิดแผง(ราย);
    else if (!loadErr) แจ้งพลาด("ไม่พบผู้สนใจรายนี้ — อาจถูกลบหรือลิงก์ไม่ถูกต้อง");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ทำครั้งเดียวตอนโหลดเสร็จ ไม่ต้องทำซ้ำเมื่อรายการเปลี่ยน
  }, [loaded]);

  const ชื่อดีลเลอร์ = useMemo(() => new Map(dealers.map(d => [d.code, d.name])), [dealers]);
  // เป็นดีลเลอร์แล้ว (ครบ 100%) = ไปอยู่หน้าดีลเลอร์ ไม่แสดงในหน้านี้ (บอสสั่ง 15 ก.ย. 69)
  //   ตาราง · ตัวกรอง · ส่งออก · การ์ดตัวเลข ใช้รายการนี้ทั้งหมด — ข้อมูลยังอยู่ครบในฐานข้อมูล (ประวัติ/ใบเสนอไม่หาย)
  const รายที่แสดงได้ = useMemo(() => list.filter(p => p.status !== "won"), [list]);
  const จังหวัดในข้อมูล = useMemo(
    () => [...new Set(รายที่แสดงได้.map(p => (p.province ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th")),
    [list],
  );

  const filtered = useMemo(() => รายที่แสดงได้.filter(p => {
    const ผ่านสถานะ =
      statusFilter === "all" ? true
      : statusFilter === "due" ? ถึงกำหนดติดตาม(p, APP_NOW_ISO)
      : statusFilter === "idle7" ? ไม่ได้ติดต่อเกิน(p, 7, APP_NOW_ISO)
      : statusFilter === "idle14" ? ไม่ได้ติดต่อเกิน(p, 14, APP_NOW_ISO)
      : statusFilter === "idle30" ? ไม่ได้ติดต่อเกิน(p, 30, APP_NOW_ISO)
      : p.status === statusFilter;
    return ผ่านสถานะ && (provinceFilter === "all" || (p.province ?? "").trim() === provinceFilter) && ตรงกับคำค้น(p, q);
  }), [รายที่แสดงได้, statusFilter, provinceFilter, q]);

  // การ์ดตัวเลขคิดจาก "ผลที่กรองอยู่" — ตรงกับสิ่งที่ตารางแสดง (กติกาเดียวกับทุกหน้า HQ)
  const สรุป = useMemo(() => สรุปผู้สนใจ(filtered, APP_NOW_ISO), [filtered]);
  // อัตราสำเร็จต้องนับรายที่เป็นดีลเลอร์แล้วด้วย — ซ่อนจากตาราง แต่ยังเป็นผลงานจริง (ตามจังหวัด/คำค้นที่เลือกอยู่)
  const อัตราสำเร็จ = useMemo(() => สรุปผู้สนใจ(
    list.filter(p => (provinceFilter === "all" || (p.province ?? "").trim() === provinceFilter) && ตรงกับคำค้น(p, q)),
    APP_NOW_ISO,
  ).อัตราสำเร็จ, [list, provinceFilter, q]);

  // ── เพิ่มรายใหม่ ──
  function เปิดเพิ่ม() {
    setเพิ่มใหม่(true); setร่าง(ร่างว่าง()); setFormErr("");
  }
  const ตั้งค่า = <K extends keyof DealerProspect>(k: K, v: DealerProspect[K]) => setร่าง(r => ({ ...r, [k]: v }));
  // รูปประจำตัว — ย่อเหลือ 256px ก่อนเก็บ แบบเดียวกับรูปลูกค้าเป้าหมายของดีลเลอร์ (fileToResizedDataURL)
  async function อัปโหลดรูป(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";   // ให้เลือกไฟล์เดิมซ้ำได้หลังถูกปฏิเสธ
    if (!file) return;
    try { ตั้งค่า("logo", await fileToResizedDataURL(file, 256)); }
    catch (err) { แจ้งพลาด(err instanceof Error ? err.message : "ใช้ไฟล์นี้เป็นรูปไม่ได้"); }
  }
  // เปลี่ยนภาค → ล้างจังหวัดที่ไม่อยู่ในภาคใหม่ (กันภาค "ใต้" คู่จังหวัด "เชียงใหม่") · "ทุกภาค" = "ทุกจังหวัด" ให้เอง
  const เปลี่ยนภาคร่าง = (region: string) => setร่าง(r => ({
    ...r,
    region: region || null,
    province: region === ALL_REGIONS ? ALL_PROVINCES
      : region && provincesOfRegion(region).includes(r.province ?? "") ? r.province : null,
  }));

  async function บันทึก() {
    if (!เพิ่มใหม่ && !รายที่เปิด) return;
    // ขั้น/เหตุผล/ดีลเลอร์ที่ผูก มาจากของจริงล่าสุดเสมอ — ฟอร์มนี้แก้แค่ข้อมูลผู้ติดต่อ (ขั้นเปลี่ยนจากแท็บงานเท่านั้น)
    const row = เตรียมบันทึก(รายที่เปิด && !เพิ่มใหม่
      ? { ...ร่าง, status: รายที่เปิด.status, lostReason: รายที่เปิด.lostReason, dealerCode: รายที่เปิด.dealerCode, convertedAt: รายที่เปิด.convertedAt }
      : { ...ร่าง, status: "new" });
    const ผิด = ตรวจผู้สนใจ(row);
    if (ผิด) { setFormErr(ผิด); return; }
    setSaving(true); setFormErr("");
    try {
      if (เพิ่มใหม่) {
        const saved = await prospectsRepo.create(row);
        setList(l => [saved, ...l]);
        logAudit("เพิ่มผู้สนใจเป็นดีลเลอร์", saved.name);
        แจ้งสำเร็จ(`เพิ่ม “${saved.name}” แล้ว — เริ่มจากบันทึกการติดต่อครั้งแรก`);
        setเพิ่มใหม่(false);
        เปิดแผง(saved, "tasks");   // เพิ่มเสร็จพาเข้างานทันที แบบเดียวกับฝั่งดีลเลอร์
      } else if (รายที่เปิด) {
        const saved = await prospectsRepo.update({ ...row, id: รายที่เปิด.id, createdAt: รายที่เปิด.createdAt });
        setList(l => l.map(x => x.id === saved.id ? saved : x));
        setรายที่เปิด(saved);
        logAudit("แก้ไขผู้สนใจเป็นดีลเลอร์", saved.name);
        แจ้งสำเร็จ("บันทึกข้อมูลแล้ว");
      }
    } catch (e) {
      setFormErr(friendlyError(e, "บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  }

  // ── เปลี่ยนขั้นจากแท็บงาน ──
  async function เปลี่ยนขั้น(next: DealerProspectStatus, lostReason?: string) {
    const ราย = รายที่เปิด;
    if (!ราย) return;
    setStageBusy(true);
    try {
      const row = เตรียมบันทึก({ ...ราย, status: next, lostReason: next === "lost" ? lostReason : null });
      const saved = await prospectsRepo.update({ ...row, id: ราย.id, createdAt: ราย.createdAt });
      setList(l => l.map(x => x.id === saved.id ? saved : x));
      if (เปิดอยู่Ref.current === saved.id) setรายที่เปิด(saved);
      logAudit("เปลี่ยนขั้นผู้สนใจเป็นดีลเลอร์", `${saved.name} · ${prospectStatusLabel[ราย.status]} → ${prospectStatusLabel[saved.status]}`);
      void โหลดของราย(saved.id);
    } catch (e) {
      แจ้งพลาด(friendlyError(e, "เปลี่ยนขั้นไม่สำเร็จ"));
    } finally {
      setStageBusy(false);
    }
  }

  async function ลบ(p: DealerProspect) {
    if (!(await ยืนยัน({
      หัวข้อ: `ลบ “${p.name}” ออกจากผู้สนใจ ?`,
      // ลบรายที่เป็นดีลเลอร์แล้ว = ลบแค่ประวัติการติดตาม ดีลเลอร์และบัญชีเข้าระบบยังอยู่ครบ — ต้องบอกให้ชัด
      รายละเอียด: p.status === "won" && p.dealerCode
        ? `ดีลเลอร์ ${p.dealerCode} ที่สร้างไปแล้วจะยังอยู่ครบ — ลบเฉพาะประวัติการติดตามรายนี้ · ย้อนกลับไม่ได้`
        : "ใบค่าแฟรนไชส์และประวัติของรายนี้จะหายไปด้วย · ย้อนกลับไม่ได้",
      ปุ่มตกลง: "ลบผู้สนใจ", อันตราย: true,
    }))) return;
    try {
      await prospectsRepo.remove(p.id);
      setList(l => l.filter(x => x.id !== p.id));
      logAudit("ลบผู้สนใจเป็นดีลเลอร์", p.name);
      ปิดแผงทันที();
    } catch (e) {
      แจ้งพลาด(friendlyError(e, "ลบไม่สำเร็จ"));
    }
  }

  // ── ตั้งเป็นดีลเลอร์ ──
  function เปิดตั้งดีลเลอร์(p: DealerProspect) {
    // เดาภาคจากจังหวัดที่บันทึกไว้ให้ก่อน — ถ้าจังหวัดสะกดไม่ตรงรายการ ปล่อยว่างให้เลือกเอง ไม่เดาต่อ
    const ภาค = p.region || regionOf(p.province ?? "") || "";
    const จังหวัดเดิม = (p.province ?? "").trim();
    const จังหวัดใช้ได้ = ภาค === ALL_REGIONS
      ? จังหวัดเดิม === ALL_PROVINCES || provincesOfRegion(ALL_REGIONS).includes(จังหวัดเดิม)
      : !!ภาค && provincesOfRegion(ภาค).includes(จังหวัดเดิม);
    setConverting(p);
    setโหมดตั้ง("new");
    setฟอร์ม({
      code: "", name: p.name, region: ภาค,
      province: จังหวัดใช้ได้ ? จังหวัดเดิม : ภาค === ALL_REGIONS ? ALL_PROVINCES : "",
      email: p.email ?? "", password: "", existingCode: "",
    });
    setConvErr("");
    setพื้นที่([]); setเจ้าของพื้นที่(null); setพื้นที่ผิด("");
    setยังไม่พร้อมแปลง(undefined);
    proposalsRepo.conversionReady(p.id).then(setยังไม่พร้อมแปลง)
      .catch(e => setยังไม่พร้อมแปลง(friendlyError(e, "ตรวจใบค่าแฟรนไชส์ไม่สำเร็จ — ปิดแล้วเปิดใหม่")));
    territoriesRepo.owners().then(list => {
      const m = new Map<string, string[]>();
      for (const x of list) m.set(x.province, [...(m.get(x.province) ?? []), x.dealerCode]);
      setเจ้าของพื้นที่(m);
      // ตั้งต้น = จังหวัดของรายนี้ ถ้ายังไม่มีใครดูแล (HQ เลือกเพิ่ม/ถอดได้ · จังหวัดที่มีคนดูแลแล้วก็เลือกได้ — ใบ 0214)
      if (จังหวัดใช้ได้ && จังหวัดเดิม !== ALL_PROVINCES && !m.has(จังหวัดเดิม)) setพื้นที่([จังหวัดเดิม]);
    }).catch(e => { logRepoRead("territories.owners(convert)", e); setพื้นที่ผิด(friendlyError(e, "โหลดพื้นที่ของดีลเลอร์ไม่สำเร็จ")); });
  }

  function เปลี่ยนภาค(region: string) {
    setฟอร์ม(f => ({
      ...f, region,
      province: region === ALL_REGIONS ? ALL_PROVINCES : provincesOfRegion(region).includes(f.province) ? f.province : "",
    }));
  }

  async function ยืนยันตั้งดีลเลอร์() {
    if (!converting) return;
    setConvErr("");
    if (โหมดตั้ง === "existing") {
      if (!ฟอร์ม.existingCode) { setConvErr("ต้องเลือกดีลเลอร์"); return; }
      const row = เตรียมบันทึก({
        ...converting, status: "won", dealerCode: ฟอร์ม.existingCode, convertedAt: new Date().toISOString(), lostReason: null,
      });
      const ผิด = ตรวจผู้สนใจ(row);
      if (ผิด) { setConvErr(ผิด); return; }
      const ผูกอยู่ = list.find(x => x.id !== converting.id && x.dealerCode === ฟอร์ม.existingCode);
      if (ผูกอยู่) { setConvErr(`ดีลเลอร์ ${ฟอร์ม.existingCode} ถูกผูกกับ “${ผูกอยู่.name}” อยู่แล้ว — หนึ่งสาขาผูกได้รายเดียว`); return; }
      setConvBusy(true);
      try {
        const code = ฟอร์ม.existingCode;
        if (REAL_BACKEND) {
          // เซิร์ฟเวอร์ตรวจสาขามีจริง/เปิดใช้งาน/ยังไม่ถูกผูก และบันทึกการใช้งานให้เอง (บอสสั่ง 15 ก.ย. 69)
          const res = await linkProspectToDealer(converting.id, code);
          if (!res.ok) { setConvErr(res.error); return; }
          setList(l => l.map(x => x.id === converting.id ? { ...x, status: "won", dealerCode: code } : x));
          if (!res.hasAccount) setผูกแล้วไม่มีบัญชี({ name: converting.name, code });
        } else {
          const saved = await prospectsRepo.update({ ...row, id: converting.id, createdAt: converting.createdAt });
          setList(l => l.map(x => x.id === saved.id ? saved : x));
          logAudit("ผู้สนใจเป็นดีลเลอร์แล้ว", `#${saved.id} → ${code} · ${saved.name}`);
        }
        แจ้งสำเร็จ(`ผูก “${converting.name}” กับดีลเลอร์ ${code} แล้ว — ย้ายไปอยู่หน้าดีลเลอร์`);
        setConverting(null); ปิดแผงทันที();
      } catch (e) {
        setConvErr(friendlyError(e, "บันทึกไม่สำเร็จ"));
      } finally {
        setConvBusy(false);
      }
      return;
    }

    // สร้างดีลเลอร์ใหม่ — ตรวจที่หน้าจอก่อนเพื่อบอกตรงช่องที่ผิด (เซิร์ฟเวอร์ตรวจซ้ำเสมอ)
    if (ยังไม่พร้อมแปลง !== null) { setConvErr(ยังไม่พร้อมแปลง ?? "กำลังตรวจใบค่าแฟรนไชส์ — รอสักครู่"); return; }
    const code = ฟอร์ม.code.trim().toUpperCase();
    if (!/^[A-Z]{2,5}$/.test(code)) { setConvErr("รหัสดีลเลอร์ต้องเป็นตัวอักษร A–Z 2–5 ตัว (ห้ามมีตัวเลข)"); return; }
    if (dealers.some(d => d.code === code)) { setConvErr(`รหัส “${code}” มีอยู่แล้ว`); return; }
    if (!ฟอร์ม.name.trim()) { setConvErr("ต้องระบุชื่อดีลเลอร์"); return; }
    if (!ฟอร์ม.region) { setConvErr("ต้องเลือกภาคก่อน — รายการจังหวัดขึ้นกับภาคที่เลือก"); return; }
    if (!ฟอร์ม.province) { setConvErr("ต้องระบุจังหวัด"); return; }
    if (พื้นที่.length === 0) { setConvErr("ต้องเลือกจังหวัดที่ดูแลอย่างน้อย 1 จังหวัด"); return; }
    const อีเมล = ฟอร์ม.email.trim();
    if (อีเมล && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(อีเมล)) { setConvErr("รูปแบบอีเมลไม่ถูกต้อง"); return; }
    if (ฟอร์ม.password && ฟอร์ม.password.length < 8) { setConvErr("รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร"); return; }

    // โหมดเดโม (ไม่มีระบบยืนยันตัวตนจริง) — สร้างทะเบียนสาขาในเครื่องแล้วผูกรายนี้ ให้เล่นครบวงได้เหมือนของจริง
    //   ⚠️ ตัวเก็บข้อมูลในเครื่อง "เขียนทับทั้งรายการ" ต้องส่งทะเบียนเดิมทั้งหมดไปด้วยเสมอ ไม่งั้นสาขาอื่นหายหมด
    if (!REAL_BACKEND) {
      setConvBusy(true);
      try {
        invalidateCache("dealers.list");
        const ทะเบียน = await dealersRepo.list();
        const อีเมลเดโม = (อีเมล || อีเมลเข้าระบบของสาขา(code)).toLowerCase();
        if (ทะเบียน.some(d => d.credentials?.email?.toLowerCase() === อีเมลเดโม)) {
          setConvErr(`อีเมล ${อีเมลเดโม} ถูกใช้กับดีลเลอร์รายอื่นแล้ว — ใช้อีเมลอื่น`);
          return;
        }
        const แถวใหม่: DealerRow = {
          id: code, code, name: ฟอร์ม.name.trim(), province: ฟอร์ม.province, region: ฟอร์ม.region,
          revenueTarget: ใบหลักสำหรับตั้งดีลเลอร์(ใบของรายที่เปิด)?.annualTarget ?? 0, status: "active",
          package: ใบหลักสำหรับตั้งดีลเลอร์(ใบของรายที่เปิด)?.package ?? null,
          createdAt: new Date().toISOString(), // ให้ขึ้นบนสุดในตารางดีลเลอร์ (ใหม่ก่อน)
          // ต้องมีอีเมลเข้าระบบ ไม่งั้นหน้าเข้าสู่ระบบแบบตัวอย่างหาสาขานี้ไม่เจอ (เดิมสร้างแล้วเข้าระบบไม่ได้)
          //   ไม่เก็บรหัสผ่าน (ดู DealerCredentials) — โหมดตัวอย่างเข้าด้วยรหัสกลาง DEMO_PASSWORD
          credentials: { email: อีเมลเดโม },
        };
        await dealersRepo.save([...ทะเบียน, แถวใหม่]);
        const row = เตรียมบันทึก({ ...converting, status: "won", dealerCode: code, convertedAt: new Date().toISOString(), lostReason: null });
        const saved = await prospectsRepo.update({ ...row, id: converting.id, createdAt: converting.createdAt });
        setList(l => l.map(x => x.id === saved.id ? saved : x));
        invalidateCache("dealers.list");
        โหลดดีลเลอร์();
        logAudit("สร้างดีลเลอร์", `${code} · ${แถวใหม่.name} (จากผู้สนใจ #${saved.id})`);
        setCreds({ name: แถวใหม่.name, code, email: อีเมลเดโม, password: DEMO_PASSWORD });
        setConverting(null); ปิดแผงทันที();
      } catch (e) {
        setConvErr(friendlyError(e, "สร้างดีลเลอร์ไม่สำเร็จ"));
      } finally {
        setConvBusy(false);
      }
      return;
    }

    setConvBusy(true);
    const res = await createDealerAccount({
      code, name: ฟอร์ม.name.trim(), province: ฟอร์ม.province, region: ฟอร์ม.region,
      // เป้ายอดขายรายปี = เป้ายอดซื้อต่อปีในใบค่าแฟรนไชส์ (บอสสั่ง 14 ก.ย. 69) · ใบไม่ระบุ = 0 (ห้ามเดา)
      //   เซิร์ฟเวอร์อ่านจากใบด้วยกติกาเดียวกันอีกชั้น — ค่าตรงนี้เป็นแค่ค่าสำรองของคำขอ
      revenueTarget: ใบหลักสำหรับตั้งดีลเลอร์(ใบของรายที่เปิด)?.annualTarget ?? 0,
      email: อีเมล || undefined, password: ฟอร์ม.password || undefined,
      prospectId: converting.id, provinces: พื้นที่,
    });
    setConvBusy(false);
    if (!res.ok) { setConvErr(res.error); return; } // ล้มเหลวต้องบอกจริง คงฟอร์มไว้ให้แก้

    // ทะเบียนดีลเลอร์ถูกแคชไว้ 30 วินาที — ต้องล้างทันที ไม่งั้นหน้าดีลเลอร์ยังไม่เห็นสาขาใหม่
    invalidateCache("dealers.list");
    โหลดดีลเลอร์();
    await โหลด();
    if (res.prospectLinked === false) {
      // สาขาถูกสร้างแล้วจริง (บัญชีใช้ได้) แต่ผูกกลับมาที่รายนี้ไม่สำเร็จ — บอกทางแก้ที่ทำได้เอง
      แจ้งพลาด(`สร้างดีลเลอร์ ${code} แล้ว แต่ผูกกับผู้สนใจรายนี้ไม่สำเร็จ — เปิดรายนี้อีกครั้ง แล้วเลือก “ผูกกับดีลเลอร์ที่มีอยู่แล้ว” → ${code}`);
    }
    setCreds({ name: ฟอร์ม.name.trim(), code, email: res.email, password: res.password });
    setConverting(null); ปิดแผงทันที();
  }

  async function คัดลอก(ข้อความ: string, ช่อง: string) {
    try {
      await navigator.clipboard.writeText(ข้อความ);
      setคัดลอกแล้ว(ช่อง);
      setTimeout(() => setคัดลอกแล้ว(""), 1500);
    } catch {
      แจ้งพลาด("คัดลอกไม่สำเร็จ — เลือกข้อความแล้วคัดลอกเองได้");
    }
  }

  const ดูอย่างเดียว = !จัดการได้;
  // ใบที่จะใช้ตั้งดีลเลอร์ (ตอบรับล่าสุด หรือส่งแล้วล่าสุด) — บอกล่วงหน้าในกล่องว่าเป้ายอดขายจะตั้งตามใบไหน
  const ใบหลัก = ใบหลักสำหรับตั้งดีลเลอร์(ใบของรายที่เปิด);
  const มีใบส่งแล้ว = มีใบเสนอที่ส่งแล้ว(ใบของรายที่เปิด);

  // ── ช่องข้อมูลผู้ติดต่อ — ใช้ทั้งหน้าต่างเพิ่มรายใหม่ และแท็บภาพรวม ──
  const ช่องข้อมูล = (
    <fieldset disabled={ดูอย่างเดียว || saving} style={{ border: "none", margin: 0, padding: 0 }}>
      {/* รูปประจำตัวอยู่บนสุด — แบบเดียวกับการ์ดลูกค้าเป้าหมายของดีลเลอร์ (บอสสั่ง 14 ก.ย. 69 · "มีเพิ่มรูปตั้งแต่ในนี้") */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ width: 56, height: 56, borderRadius: 14, flexShrink: 0, overflow: "hidden", background: ร่าง.logo ? "#fff" : "#f8fafc",
          border: `1px ${ร่าง.logo ? "solid" : "dashed"} #e5e7eb`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {ร่าง.logo ? <img src={ร่าง.logo} alt="รูปประจำตัว" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <User size={22} color="#9ca3af" />}
        </span>
        <input ref={รูปRef} type="file" accept="image/*" aria-label="อัปโหลดรูปผู้สนใจ" style={{ display: "none" }} onChange={e => void อัปโหลดรูป(e)} />
        <button type="button" onClick={() => รูปRef.current?.click()} className="btn btn-secondary btn-sm" style={{ color: "#374151" }}>
          <Paperclip size={12} /> {ร่าง.logo ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
        </button>
        {ร่าง.logo && (
          <button type="button" onClick={() => ตั้งค่า("logo", null)} className="btn btn-secondary btn-sm" style={{ color: "#dc2626" }}>
            <X size={12} /> ลบรูป
          </button>
        )}
        <span style={{ fontSize: "0.68rem", color: MUTED }}>รูปคน/โลโก้ร้าน · ระบบย่อให้เอง</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="form-label" htmlFor="pr-name">ชื่อผู้ติดต่อ / ชื่อบริษัท *</label>
          <input id="pr-name" className="form-input" value={ร่าง.name ?? ""} onChange={e => ตั้งค่า("name", e.target.value)} placeholder="เช่น คุณสมชาย / หจก. ตัวอย่างสตีล" />
        </div>
        <div>
          <label className="form-label" htmlFor="pr-social">ชื่อบนโซเชียล</label>
          <input id="pr-social" className="form-input" value={ร่าง.social ?? ""} onChange={e => ตั้งค่า("social", e.target.value)} placeholder="ชื่อ Facebook / LINE" />
        </div>
        <div>
          <label className="form-label" htmlFor="pr-phone">เบอร์โทร</label>
          {/* พิมพ์ได้แต่ตัวเลข ใส่ขีดให้เอง (บอสสั่ง 14 ก.ย. 69) — ตัวจัดรูปแบบเดียวกับฟอร์มลูกค้า/ลูกค้าเป้าหมายของดีลเลอร์ */}
          <input id="pr-phone" className="form-input" inputMode="tel" value={ร่าง.phone ?? ""} onChange={e => ตั้งค่า("phone", formatPhone(e.target.value))} placeholder="08x-xxx-xxxx" />
        </div>
        <div>
          <label className="form-label" htmlFor="pr-email">อีเมล</label>
          <input id="pr-email" className="form-input" type="email" value={ร่าง.email ?? ""} onChange={e => ตั้งค่า("email", e.target.value)} placeholder="name@example.com" />
        </div>
        <div>
          <label className="form-label" htmlFor="pr-channel">ช่องทางที่เข้ามา</label>
          {/* ดรอปดาวน์ (บอสสั่ง 14 ก.ย. 69: "ทำเป็นดรอปดาวน์ด้วย") — ค่าเดิมที่ไม่อยู่ในรายการ (พิมพ์เองสมัยก่อน/นำเข้า) ต้องยังเห็น ไม่หายเงียบ */}
          <select id="pr-channel" className="form-select" value={ร่าง.channel ?? ""} onChange={e => ตั้งค่า("channel", e.target.value || null)} style={{ cursor: "pointer" }}>
            <option value="">— ยังไม่ระบุ —</option>
            {ตัวเลือกช่องทาง.map(c => <option key={c} value={c}>{c}</option>)}
            {ร่าง.channel && !ตัวเลือกช่องทาง.includes(ร่าง.channel) && (
              <option value={ร่าง.channel}>{ร่าง.channel} (ตามที่บันทึกไว้)</option>
            )}
          </select>
        </div>
        {/* ภาคมาก่อนจังหวัด — จังหวัดที่เลือกได้ขึ้นกับภาคที่เลือก (บอสสั่ง 14 ก.ย. 69) · "ทุกภาค" = ทั่วประเทศ */}
        <div>
          <label className="form-label" htmlFor="pr-region">ภาค</label>
          <select id="pr-region" className="form-select" value={ร่าง.region ?? ""} onChange={e => เปลี่ยนภาคร่าง(e.target.value)} style={{ cursor: "pointer" }}>
            <option value="">— ยังไม่ระบุ —</option>
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            <option value={ALL_REGIONS}>{ALL_REGIONS} (ทั่วประเทศ)</option>
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="pr-province">จังหวัด</label>
          {/* จังหวัดที่บันทึกไว้แต่ไม่อยู่ในรายการ (ข้อมูลเก่าพิมพ์ย่อ เช่น "ปทุม") ต้องยังเห็นค่าเดิม ไม่หายเงียบตอนเปิดมาแก้ */}
          <select id="pr-province" className="form-select" value={ร่าง.province ?? ""} onChange={e => ตั้งค่า("province", e.target.value || null)} style={{ cursor: "pointer" }}>
            <option value="">{ร่าง.region ? "— ยังไม่ระบุ —" : "— เลือกภาคก่อน —"}</option>
            {ร่าง.region === ALL_REGIONS && <option value={ALL_PROVINCES}>{ALL_PROVINCES}</option>}
            {provincesOfRegion(ร่าง.region ?? "").map(p => <option key={p} value={p}>{p}</option>)}
            {ร่าง.province && ร่าง.province !== ALL_PROVINCES && !provincesOfRegion(ร่าง.region ?? "").includes(ร่าง.province) && (
              <option value={ร่าง.province}>{ร่าง.province} (ตามที่บันทึกไว้)</option>
            )}
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="pr-type">ประเภทธุรกิจ</label>
          {/* ตั้งรายการไว้แล้ว = เลือกจากรายการ (นับ/กรองได้ตรงกัน) · ยังไม่ตั้ง = พิมพ์เองเหมือนเดิม
              ค่าเดิมที่ไม่อยู่ในรายการต้องยังเห็น ไม่หายเงียบตอนเปิดมาแก้ */}
          {ค่าตั้ง.businessTypes.length ? (
            <select id="pr-type" className="form-select" value={ร่าง.businessType ?? ""} onChange={e => ตั้งค่า("businessType", e.target.value || null)} style={{ cursor: "pointer" }}>
              <option value="">— ยังไม่ระบุ —</option>
              {ค่าตั้ง.businessTypes.map(t => <option key={t} value={t}>{t}</option>)}
              {ร่าง.businessType && !ค่าตั้ง.businessTypes.includes(ร่าง.businessType) && (
                <option value={ร่าง.businessType}>{ร่าง.businessType} (ตามที่บันทึกไว้)</option>
              )}
            </select>
          ) : (
            <input id="pr-type" className="form-input" value={ร่าง.businessType ?? ""} onChange={e => ตั้งค่า("businessType", e.target.value)} placeholder="เช่น ผู้รับเหมา / ขายเหล็ก / สถาปนิก" />
          )}
        </div>
        <div>
          <label className="form-label" htmlFor="pr-assigned">ผู้ดูแล (สำนักงานใหญ่)</label>
          <select id="pr-assigned" className="form-select" value={ร่าง.assigned ?? ""} onChange={e => ตั้งค่า("assigned", e.target.value || null)} style={{ cursor: "pointer" }}>
            <option value="">— ยังไม่ระบุ —</option>
            {ผู้ใช้HQ.map(u => <option key={u.id} value={u.name}>{u.name}{u.department ? ` · ${u.department}` : ""}</option>)}
            {/* ชื่อที่บันทึกไว้ก่อนแต่ไม่อยู่ในรายชื่อแล้ว (พิมพ์เองสมัยก่อน / ผู้ใช้ถูกปิด) ต้องยังเห็นค่าเดิม ไม่หายเงียบ */}
            {ร่าง.assigned && !ผู้ใช้HQ.some(u => u.name === ร่าง.assigned) && (
              <option value={ร่าง.assigned}>{ร่าง.assigned} (ตามที่บันทึกไว้)</option>
            )}
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="pr-first">เริ่มติดต่อ</label>
          <input id="pr-first" className="form-input" type="date" value={ร่าง.firstContact ?? ""} onChange={e => ตั้งค่า("firstContact", e.target.value || null)} />
        </div>
        <div>
          <label className="form-label" htmlFor="pr-follow">ติดตามครั้งถัดไป</label>
          <input id="pr-follow" className="form-input" type="date" value={ร่าง.followUp ?? ""} onChange={e => ตั้งค่า("followUp", e.target.value || null)} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="form-label" htmlFor="pr-note">หมายเหตุ</label>
          <textarea id="pr-note" className="form-input" rows={3} value={ร่าง.note ?? ""} onChange={e => ตั้งค่า("note", e.target.value)} placeholder="ข้อมูลที่ควรรู้เกี่ยวกับรายนี้ (สิ่งที่คุยแต่ละครั้ง ให้บันทึกในแท็บบันทึกการติดต่อ)" style={{ resize: "vertical" }} />
        </div>
      </div>
    </fieldset>
  );

  return (
    <div className="erp">
      <TopbarActions>
        <ExportMenu
          filename="hq-prospects"
          title="ผู้สนใจเป็นดีลเลอร์"
          headers={["ชื่อ", "ชื่อบนโซเชียล", "เบอร์โทร", "อีเมล", "ภาค", "จังหวัด", "ประเภทธุรกิจ", "ช่องทาง", "เริ่มติดต่อ", "ติดตามครั้งถัดไป", "สถานะ", "เหตุผลที่ไม่สำเร็จ", "ผู้ดูแล", "รหัสดีลเลอร์", "หมายเหตุ"]}
          rows={filtered.map(p => [
            p.name, p.social ?? "", p.phone ?? "", p.email ?? "", p.region ?? "", p.province ?? "", p.businessType ?? "", p.channel ?? "",
            p.firstContact ?? "", p.followUp ?? "", prospectStatusLabel[p.status], p.lostReason ?? "", p.assigned ?? "",
            p.dealerCode ?? "", p.note ?? "",
          ])}
        />
        {จัดการได้ && (
          <button className="btn btn-primary btn-sm" onClick={เปิดเพิ่ม}>
            <UserPlus size={14} /> เพิ่มผู้สนใจ
          </button>
        )}
      </TopbarActions>

      {/* สรุป — 4 ใบตามกติกากลาง (globals.css: ทุกหน้าใช้ KPI 4 ใบเท่ากัน ห้ามเพิ่มเป็น 5+) */}
      <div className="kpi-bar">
        <div className="kpi"><div className="kpi-icon kpi-navy"><Users size={16} /></div><div><div className="kpi-val">{สรุป.ทั้งหมด.toLocaleString()}</div><div className="kpi-label">ผู้สนใจที่แสดงอยู่</div></div></div>
        <div className="kpi"><div className="kpi-icon kpi-navy"><AlarmClock size={16} /></div><div><div className="kpi-val">{สรุป.ถึงกำหนด.toLocaleString()}</div><div className="kpi-label">ถึงกำหนดติดตาม</div></div></div>
        {/* "เป็นดีลเลอร์แล้ว" ไม่อยู่หน้านี้แล้ว (บอสสั่ง 15 ก.ย. 69) → การ์ดใบที่ 3 นับรายที่ยังติดตามอยู่แทน */}
        <div className="kpi"><div className="kpi-icon kpi-navy"><Store size={16} /></div><div><div className="kpi-val">{สรุป.กำลังติดตาม.toLocaleString()}</div><div className="kpi-label">กำลังติดตาม</div></div></div>
        {/* อัตราสำเร็จคิดจากรายที่จบแล้วเท่านั้น (รวมรายที่เป็นดีลเลอร์แล้วซึ่งซ่อนจากตาราง) · ยังไม่มีรายที่จบ = "—" ไม่ใช่ 0% */}
        <div className="kpi"><div className="kpi-icon kpi-green"><Percent size={16} /></div><div><div className="kpi-val">{อัตราสำเร็จ === null ? "—" : `${อัตราสำเร็จ}%`}</div><div className="kpi-label">อัตราสำเร็จ (จากรายที่จบแล้ว)</div></div></div>
      </div>

      {ภาพรวม && (() => {
        const st = ภาพรวม.stages;
        const กำลังคุย = st.new + st.contacted + st.profile_sent + st.meeting + st.considering;
        return (
          <div className="card" data-testid="prospect-overview" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", padding: "10px 14px", marginBottom: 12, fontSize: "0.8rem", color: "#374151" }}>
            <span>ผู้สนใจกำลังคุย <b data-testid="prospect-talking" data-value={กำลังคุย} style={{ color: "#003366" }}>{กำลังคุย.toLocaleString("th-TH")}</b> ราย <span style={{ color: "#8a929c" }}>(ทั้งหมด ไม่ขึ้นกับตัวกรอง)</span></span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <MapPin size={13} color="#b45309" /> จังหวัดที่มีลูกค้าเป้าหมายแต่ยังไม่มีดีลเลอร์:
              {ภาพรวม.provincesNoDealer.length === 0
                ? <b data-testid="provinces-no-dealer" style={{ color: "#059669" }}>ไม่มี</b>
                : <b data-testid="provinces-no-dealer" style={{ color: "#b45309" }}>{ภาพรวม.provincesNoDealer.map(x => `${x.province} (${x.leads})`).join(" · ")}</b>}
            </span>
          </div>
        );
      })()}

      {/* Toolbar */}
      <div className="card" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 14px", marginBottom: 16 }}>
        <div className="search-bar">
          <Search size={14} color="#9ca3af" />
          <input aria-label="ค้นหาผู้สนใจ" value={q} onChange={e => { setQ(e.target.value); setPage(0); }} placeholder="ค้นหาชื่อ / เบอร์โทร / จังหวัด / ประเภทธุรกิจ..." />
          {q && <button aria-label="ล้างคำค้น" onClick={() => { setQ(""); setPage(0); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", display: "flex", padding: 0 }}><X size={13} /></button>}
        </div>
        <div style={{ flex: 1 }} />
        <select aria-label="กรองตามสถานะ" value={statusFilter} onChange={e => { setStatusFilter(e.target.value as ตัวกรองสถานะ); setPage(0); }} className="form-select" style={{ width: "auto", cursor: "pointer" }}>
          <option value="all">ทุกสถานะ</option>
          <option value="due">ถึงกำหนดติดตาม</option>
          {/* ตัวกรองติดตามด่วน (สเปก: ไม่ได้ติดต่อ 7 / 14 / 30 วัน) — นับเฉพาะรายที่ยังติดตามอยู่ */}
          {เกณฑ์ไม่ได้ติดต่อ.map(ว => <option key={ว} value={`idle${ว}`}>ไม่ได้ติดต่อ {ว} วันขึ้นไป</option>)}
          {PROSPECT_STATUS_ORDER.filter(s => s !== "won").map(s => <option key={s} value={s}>{prospectStatusLabel[s]}</option>)}
        </select>
        <select aria-label="กรองตามจังหวัด" value={provinceFilter} onChange={e => { setProvinceFilter(e.target.value); setPage(0); }} className="form-select" style={{ width: "auto", cursor: "pointer" }}>
          <option value="all">ทุกจังหวัด</option>
          {จังหวัดในข้อมูล.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {loadErr && (
        <div className="card" role="alert" style={{ padding: "10px 14px", marginBottom: 12, fontSize: "0.8rem", color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", display: "flex", alignItems: "center", gap: 10 }}>
          {loadErr}
          <button className="btn btn-secondary btn-sm" onClick={() => void โหลด()}>ลองใหม่</button>
        </div>
      )}

      {/* ตาราง */}
      <div className="card">
        <div className="table-wrap" style={{ borderTop: "none" }}>
          <table>
            {/* เพิ่ม/ลบคอลัมน์ต้องแก้ colgroup ด้วย (table-layout: fixed — ใส่ความกว้างที่ th ไม่มีผล)
                minWidth รวม ~900px พอดีกรอบจอคอม · จอแคบให้เลื่อนซ้ายขวา ไม่บีบจนอ่านไม่ออก
                "ติดต่อล่าสุด" มาแทน "ช่องทาง/ประเภทธุรกิจ" (ดูได้ในแผง) — สิ่งที่ทีมต้องเห็นทุกวันคือใครไม่ได้ติดต่อนานแล้ว */}
            {/* "ช่องทาง" กลับมาอยู่ในตาราง (บอสสั่ง 14 ก.ย. 69: "แสดง ช่องทางที่เข้ามา ด้วย")
                "ชื่อบนโซเชียล" แยกเป็นคอลัมน์ (บอสสั่ง 14 ก.ย. 69: "เพิ่มชื่อ ชื่อบนโซเชียล ในตาราง") — เดิมเขียนปนกับประเภทธุรกิจใต้ชื่อ อ่านไม่ออกว่าอันไหนคืออะไร
                "ลำดับ" คอลัมน์แรก (บอสสั่ง 15 ก.ย. 69: "เพิ่มลำดับเข้าไป") — กว้างพอเลข 3 หลัก (ตอนนี้ 170 ราย) ไม่งั้นโดนตัดเป็น "1…"
                10 คอลัมน์ minWidth รวม ~1,014px · % รวมต้องได้ 100 เสมอ */}
            <colgroup>
              <col style={{ width: "5%", minWidth: 56 }} />{/* ลำดับ */}
              <col style={{ width: "16%", minWidth: 170 }} />
              <col style={{ width: "11%", minWidth: 110 }} />
              <col style={{ width: "10%", minWidth: 104 }} />
              <col style={{ width: "8%", minWidth: 84 }} />
              <col style={{ width: "9%", minWidth: 90 }} />
              <col style={{ width: "13%", minWidth: 140 }} />
              <col style={{ width: "11%", minWidth: 100 }} />
              <col style={{ width: "10%", minWidth: 100 }} />
              <col style={{ width: "7%", minWidth: 60 }} />
            </colgroup>
            <thead>
              <tr><th>ลำดับ</th><th>ชื่อ</th><th>ชื่อบนโซเชียล</th><th>เบอร์โทร</th><th>จังหวัด</th><th>ช่องทาง</th><th>ขั้น · ความคืบหน้า</th><th>ติดต่อล่าสุด</th><th>นัดติดตาม</th><th>ดีลเลอร์</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: "center", padding: "36px 14px", color: "#9ca3af", fontSize: "0.8rem" }}>
                  {!loaded ? "กำลังโหลด…" : list.length === 0 ? "ยังไม่มีผู้สนใจ" : "ไม่พบผู้สนใจตามตัวกรองที่เลือก"}
                </td></tr>
              )}
              {pageSlice(filtered, page).map((p, i) => {
                const สี = prospectStatusColor[p.status];
                const เลยกำหนด = ถึงกำหนดติดตาม(p, APP_NOW_ISO);
                const ไม่ได้ติดต่อนาน = ไม่ได้ติดต่อเกิน(p, 7, APP_NOW_ISO);
                const pct = ความคืบหน้า(p.status);
                // คีย์ใช้ p.id ได้: id ไม่ซ้ำทั้งระบบ (identity เดียวทั้งตาราง · dealerCode ในแถวนี้คือดีลเลอร์ที่รายนั้นกลายมาเป็น ไม่ใช่สาขาเจ้าของ)
                return (
                  <ClickableRow key={p.id} onActivate={() => เปิดแผง(p)} label={`เปิดรายละเอียดผู้สนใจ ${p.name}`}
                    style={{ background: รายที่เปิด?.id === p.id ? "#f0f6ff" : undefined }}>
                    {/* ลำดับต่อเนื่องข้ามหน้า — สูตรเดียวกับตารางดีลเลอร์ */}
                    <td style={{ fontSize: "0.72rem", color: "#6b7280", fontWeight: 600 }}>{Math.min(page, pageCountOf(filtered.length) - 1) * ROWS_PER_PAGE + i + 1}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                        <span style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, overflow: "hidden", background: p.logo ? "#fff" : "#eef3f8", color: PRIMARY, fontSize: "0.68rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {p.logo ? <img src={p.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (p.name.replace(/บจ\.|หจก\.|บริษัท|คุณ/g, "").trim().slice(0, 2) || "—")}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div title={p.name} style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                          {p.businessType && (
                            <div title={p.businessType} style={{ fontSize: "0.7rem", color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.businessType}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td title={p.social ?? undefined} style={{ fontSize: "0.8rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.social || "—"}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{p.phone ? formatPhone(p.phone) || p.phone : "—"}</td>
                    <td style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.province || "—"}</td>
                    <td title={p.channel ?? undefined} style={{ fontSize: "0.78rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.channel || "—"}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="badge" style={{ background: สี.bg, color: สี.text }}>{prospectStatusLabel[p.status]}</span>
                        {ยังติดตามอยู่(p.status) && <span style={{ fontSize: "0.7rem", fontWeight: 700, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{pct}%</span>}
                      </div>
                    </td>
                    <td style={{ fontSize: "0.78rem", whiteSpace: "nowrap", color: ไม่ได้ติดต่อนาน ? "#b91c1c" : undefined, fontWeight: ไม่ได้ติดต่อนาน ? 700 : undefined }}>
                      {ติดต่อล่าสุดอ่านง่าย(p, APP_NOW_ISO)}
                    </td>
                    <td style={{ fontSize: "0.78rem", whiteSpace: "nowrap", color: เลยกำหนด ? "#b91c1c" : undefined, fontWeight: เลยกำหนด ? 700 : undefined }}>
                      {p.followUp ? fmtISOToThai(p.followUp) : "—"}
                    </td>
                    <td>
                      {p.dealerCode
                        ? <Link href={`/hq/dealers/${p.dealerCode}`} onClick={e => e.stopPropagation()} title={ชื่อดีลเลอร์.get(p.dealerCode) ?? p.dealerCode} style={{ color: PRIMARY, fontWeight: 700 }}>{p.dealerCode}</Link>
                        : "—"}
                    </td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
        </div>
        <TablePagination page={page} total={filtered.length} onPage={setPage} unit="ราย" />
      </div>

      {/* ── เพิ่มผู้สนใจ (หน้าต่างเล็ก) — เพิ่มเสร็จเปิดแผงงานของรายนั้นให้ต่อเลย ── */}
      {เพิ่มใหม่ && (
        <div onClick={() => !saving && setเพิ่มใหม่(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.42)", zIndex: 1050, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <ModalCard onClose={() => !saving && setเพิ่มใหม่(false)} label="ข้อมูลผู้สนใจ" className="modal-fit"
            style={{ background: "#fff", borderRadius: 16, width: 620, maxWidth: "100%", boxShadow: "0 24px 80px rgba(0,0,0,.28)" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "#2D2D2D" }}>เพิ่มผู้สนใจ</h2>
              <button aria-label="ปิด" onClick={() => !saving && setเพิ่มใหม่(false)} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, display: "flex" }}><X size={18} /></button>
            </div>
            <div className="modal-fit-body" style={{ padding: "16px 20px" }}>
              {formErr && <div role="alert" style={{ background: "#fee2e2", border: "1px solid #dc262630", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: "0.8rem", color: "#dc2626", fontWeight: 600 }}>{formErr}</div>}
              {ช่องข้อมูล}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                <button className="btn btn-secondary btn-md" disabled={saving} onClick={() => setเพิ่มใหม่(false)}>ยกเลิก</button>
                <button className="btn btn-primary btn-md" disabled={saving} onClick={() => void บันทึก()}
                  style={saving ? { opacity: .6, cursor: "not-allowed" } : undefined}>
                  {saving ? "กำลังบันทึก…" : "เพิ่มผู้สนใจ"}
                </button>
              </div>
            </div>
          </ModalCard>
        </div>
      )}

      {/* ══ แผงลูกค้าเป้าหมาย — กลางจอ 820px หัวน้ำเงิน + แท็บ (แบบเดียวกับลูกค้าเป้าหมายของดีลเลอร์) ══ */}
      {รายที่เปิด && (() => {
        const ราย = รายที่เปิด;
        const sc = prospectStatusColor[ราย.status];
        const pct = ความคืบหน้า(ราย.status);
        const เลยกำหนด = ถึงกำหนดติดตาม(ราย, APP_NOW_ISO);
        const ติดตามอยู่ = ยังติดตามอยู่(ราย.status);
        const qa: React.CSSProperties = { background: "rgba(255,255,255,.15)", border: "none", borderRadius: 8, height: 30, padding: "0 11px", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap", textDecoration: "none" };
        const ป้าย: React.CSSProperties = { display: "flex", alignItems: "center", gap: 4, padding: "2px 10px", borderRadius: 99, fontSize: "0.65rem", fontWeight: 700, background: "rgba(255,255,255,.18)", color: "#fff" };
        const อักษรย่อ = ราย.name.replace(/บจ\.|หจก\.|บริษัท|คุณ/g, "").trim().slice(0, 2) || "—";
        return (
          <div onClick={ปิดแผง} style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.45)", zIndex: 1050, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
            <ModalCard onClose={ปิดแผง} label="ข้อมูลผู้สนใจ"
              style={{ width: 820, maxWidth: "100%", height: "min(920px, calc(100vh - 24px))", background: "#fff", borderRadius: 18, boxShadow: "0 30px 90px rgba(0,0,0,.32)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* หัวน้ำเงิน + ปุ่มลัด */}
              <div style={{ background: PRIMARY, padding: "14px 20px", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <div style={{ width: 46, height: 46, borderRadius: 13, background: ราย.logo ? "#fff" : "rgba(255,255,255,.18)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, border: "2px solid rgba(255,255,255,.25)", flexShrink: 0, overflow: "hidden" }}>
                      {ราย.logo ? <img src={ราย.logo} alt="รูปประจำตัว" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : อักษรย่อ}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h2 style={{ margin: 0, fontSize: "1.08rem", fontWeight: 800, color: "#fff", lineHeight: 1.2 }}>{ราย.name}</h2>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: "0.72rem", color: "rgba(255,255,255,.72)", marginTop: 4 }}>
                        {ราย.phone && <a href={`tel:${ราย.phone.replace(/[^\d+]/g, "")}`} style={{ color: "inherit", display: "flex", alignItems: "center", gap: 3 }}><Phone size={11} /> {formatPhone(ราย.phone) || ราย.phone}</a>}
                        {ราย.province && <span style={{ display: "flex", alignItems: "center", gap: 3 }}><MapPin size={11} /> {ราย.province}</span>}
                        {ราย.assigned && <span>ผู้ดูแล {ราย.assigned}</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    {/* ปุ่มลัด "บันทึกการติดต่อ" / "ออกใบค่าแฟรนไชส์" บนหัวแผง บอสสั่งเอาออก (14 ก.ย. 69) — ทำในแท็บของมันแทน ห้ามใส่กลับ */}
                    {จัดการได้ && ติดตามอยู่ && (
                      <button style={qa} onClick={() => เปิดตั้งดีลเลอร์(ราย)}><Store size={13} /> ตั้งเป็นดีลเลอร์</button>
                    )}
                    {ราย.status === "won" && ราย.dealerCode && (
                      <Link href={`/hq/dealers/${ราย.dealerCode}`} style={qa}><Store size={13} /> ดีลเลอร์ {ราย.dealerCode}</Link>
                    )}
                    {จัดการได้ && (
                      <button onClick={() => void ลบ(ราย)} title="ลบผู้สนใจ" aria-label="ลบผู้สนใจ" style={{ ...qa, width: 30, padding: 0, justifyContent: "center", color: "#fecaca" }}><Trash2 size={14} /></button>
                    )}
                    <button onClick={ปิดแผง} title="ปิด" aria-label="ปิด" style={{ ...qa, width: 30, padding: 0, justifyContent: "center" }}><X size={15} /></button>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                  <span style={{ padding: "2px 10px", borderRadius: 99, fontSize: "0.65rem", fontWeight: 700, background: sc.bg, color: sc.text }}>{prospectStatusLabel[ราย.status]}</span>
                  <span style={{ ...ป้าย, background: "#fff", color: PRIMARY, fontWeight: 800 }}>ความคืบหน้า {pct}%</span>
                  <span style={ป้าย}>ติดต่อล่าสุด: {ติดต่อล่าสุดอ่านง่าย(ราย, APP_NOW_ISO)}</span>
                  {ราย.followUp && ติดตามอยู่ && (
                    <span style={{ ...ป้าย, ...(เลยกำหนด ? { background: "#fee2e2", color: "#b91c1c" } : {}) }}>
                      นัดติดตาม {fmtISOToThai(ราย.followUp)}{เลยกำหนด ? " · ถึงกำหนดแล้ว" : ""}
                    </span>
                  )}
                </div>
              </div>

              {/* แท็บ */}
              <div className="tab-bar" role="tablist" aria-label="ส่วนของผู้สนใจ" style={{ padding: "0 12px", flexShrink: 0, background: "#fff" }}>
                {แท็บทั้งหมด.map(t => (
                  <button key={t.key} type="button" role="tab" aria-selected={แท็บที่เปิด === t.key}
                    className={`tab-item${แท็บที่เปิด === t.key ? " active" : ""}`} onClick={() => setแท็บที่เปิด(t.key)}>
                    {t.label}
                    {t.key === "proposals" && ใบของรายที่เปิด.length > 0 && ` (${ใบของรายที่เปิด.length})`}
                  </button>
                ))}
              </div>

              <div style={{ flex: 1, overflowY: "auto", background: "#f5f7fa", padding: 16 }}>
                <div style={{ background: "#fff", border: "1px solid #eef1f5", borderRadius: 14, padding: 16 }}>
                  {แท็บที่เปิด === "overview" && (
                    <>
                      {ราย.status === "won" && ราย.dealerCode && (
                        <div style={{ background: "#dcfce7", border: "1px solid #86efac", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: "0.78rem", color: "#15803d", fontWeight: 600 }}>
                          เป็นดีลเลอร์แล้ว — <Link href={`/hq/dealers/${ราย.dealerCode}`} style={{ color: "#15803d", textDecoration: "underline" }}>
                            {ราย.dealerCode} · {ชื่อดีลเลอร์.get(ราย.dealerCode) ?? ""}
                          </Link>
                          {ราย.convertedAt && ` (ตั้งเมื่อ ${fmtISOToThai(ราย.convertedAt)})`}
                        </div>
                      )}
                      {formErr && <div role="alert" style={{ background: "#fee2e2", border: "1px solid #dc262630", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: "0.8rem", color: "#dc2626", fontWeight: 600 }}>{formErr}</div>}
                      {ช่องข้อมูล}
                      {จัดการได้ && (
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                          <button className="btn btn-primary btn-md" disabled={saving} onClick={() => void บันทึก()}
                            style={saving ? { opacity: .6, cursor: "not-allowed" } : undefined}>
                            {saving ? "กำลังบันทึก…" : "บันทึก"}
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {แท็บที่เปิด === "tasks" && (
                    <ProspectJourney
                      prospect={ราย}
                      ขั้นก่อนปิด={ขั้นก่อนไม่สำเร็จ(ประวัติ, มีใบส่งแล้ว)}
                      มีบันทึกการติดต่อ={มีบันทึกการติดต่อ(ประวัติ)}
                      มีใบส่งแล้ว={มีใบส่งแล้ว}
                      editable={จัดการได้ && ประวัติโหลดแล้ว && !ประวัติผิด}
                      busy={stageBusy}
                      onStage={(next, reason) => void เปลี่ยนขั้น(next, reason)}
                      onNeedContact={() => {
                        setแท็บที่เปิด("contact"); setฟอร์มติดต่อเปิด(true);
                        แจ้งสำเร็จ("ติ๊กงานนี้เองไม่ได้ — บันทึกการติดต่อจริงก่อน แล้วระบบจะติ๊กให้เอง");
                      }}
                      onNeedProposal={() => {
                        setแท็บที่เปิด("proposals");
                        if (!ใบของรายที่เปิด.length) setสัญญาณออกใบ(n => n + 1);
                        แจ้งสำเร็จ(ใบของรายที่เปิด.length
                          ? "ติ๊กงานนี้เองไม่ได้ — เปลี่ยนสถานะใบเป็น “ส่งแล้ว” แล้วระบบจะติ๊กให้เอง"
                          : "ติ๊กงานนี้เองไม่ได้ — ออกใบค่าแฟรนไชส์แล้วเปลี่ยนเป็น “ส่งแล้ว” ระบบจะติ๊กให้เอง");
                      }}
                      onConvert={() => เปิดตั้งดีลเลอร์(ราย)}
                      ค่าตั้ง={ค่าตั้ง}
                    />
                  )}

                  {แท็บที่เปิด === "contact" && (
                    <ProspectActivityPanel
                      prospect={ราย}
                      activities={ประวัติ}
                      loaded={ประวัติโหลดแล้ว}
                      loadErr={ประวัติผิด}
                      editable={จัดการได้}
                      formOpen={ฟอร์มติดต่อเปิด}
                      setFormOpen={setฟอร์มติดต่อเปิด}
                      onReload={() => void โหลดของราย(ราย.id)}
                      onAdded={() => void รีเฟรชรายที่เปิด()}
                      ช่องทาง={ค่าตั้ง.contactChannels}
                    />
                  )}

                  {แท็บที่เปิด === "proposals" && (
                    // key พ่วงสัญญาณ: กดปุ่มลัด "ออกใบค่าแฟรนไชส์" ซ้ำ → แผงสร้างใหม่แล้วเปิดฟอร์มให้อีกครั้ง
                    <ProspectProposalsPanel key={`${ราย.id}-${สัญญาณออกใบ}`} prospect={ราย} editable={จัดการได้ && ติดตามอยู่}
                      onChange={เมื่อใบเปลี่ยน} เปิดฟอร์มทันที={สัญญาณออกใบ > 0} />
                  )}
                </div>
              </div>
            </ModalCard>
          </div>
        );
      })()}

      {/* ── ตั้งเป็นดีลเลอร์ ── */}
      {converting && (
        <div onClick={() => !convBusy && setConverting(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <ModalCard onClose={() => !convBusy && setConverting(null)} label="ตั้งเป็นดีลเลอร์" className="modal-fit"
            style={{ background: "#fff", borderRadius: 16, width: 520, maxWidth: "100%", boxShadow: "0 24px 80px rgba(0,0,0,.3)" }}>
            <div style={{ background: PRIMARY, color: "#fff", padding: "14px 20px", fontWeight: 800, borderRadius: "16px 16px 0 0" }}>
              ตั้ง “{converting.name}” เป็นดีลเลอร์
            </div>
            <div className="modal-fit-body" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              {convErr && <div role="alert" style={{ background: "#fee2e2", border: "1px solid #dc262630", borderRadius: 8, padding: "8px 12px", fontSize: "0.8rem", color: "#dc2626", fontWeight: 600 }}>{convErr}</div>}

              <div role="radiogroup" aria-label="วิธีตั้งเป็นดีลเลอร์" style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "0.82rem" }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                  <input type="radio" name="convert-mode" checked={โหมดตั้ง === "new"} onChange={() => { setโหมดตั้ง("new"); setConvErr(""); }} disabled={convBusy} />
                  สร้างดีลเลอร์ใหม่ พร้อมบัญชีเข้าระบบ
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                  <input type="radio" name="convert-mode" checked={โหมดตั้ง === "existing"} onChange={() => { setโหมดตั้ง("existing"); setConvErr(""); }} disabled={convBusy} />
                  ผูกกับดีลเลอร์ที่มีอยู่แล้ว
                </label>
              </div>

              {/* ด่านเดียวกับที่เซิร์ฟเวอร์บังคับ — บอกก่อนกด ไม่ต้องให้ผู้ใช้กรอกครบแล้วค่อยโดนปฏิเสธ
                  ผูกกับดีลเลอร์ที่มีอยู่แล้วไม่ต้องมีใบ (บันทึกประวัติรายที่เป็นดีลเลอร์มาก่อนระบบนี้) */}
              {โหมดตั้ง === "new" && ยังไม่พร้อมแปลง !== null && (
                <div role="note" style={{ background: "#fff8e6", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 12px", fontSize: "0.78rem", color: "#92400e", fontWeight: 600, lineHeight: 1.6 }}>
                  {ยังไม่พร้อมแปลง === undefined ? "กำลังตรวจใบค่าแฟรนไชส์…" : <>
                    ยังสร้างดีลเลอร์ใหม่ไม่ได้ — {ยังไม่พร้อมแปลง}
                    <br />ต้องตกลง + ชำระ: ใบค่าแฟรนไชส์ “ตอบรับ” และยอดชำระรวมครบตามใบ (บันทึกในแท็บใบค่าแฟรนไชส์) · ถ้าเป็นดีลเลอร์อยู่แล้ว เลือก “ผูกกับดีลเลอร์ที่มีอยู่แล้ว”
                  </>}
                </div>
              )}

              {โหมดตั้ง === "existing" ? (
                <div>
                  <label className="form-label" htmlFor="cv-existing">ดีลเลอร์</label>
                  <select id="cv-existing" className="form-select" value={ฟอร์ม.existingCode} disabled={convBusy}
                    onChange={e => { setฟอร์ม(f => ({ ...f, existingCode: e.target.value })); setConvErr(""); }} style={{ cursor: "pointer" }}>
                    <option value="">— เลือกดีลเลอร์ —</option>
                    {/* ปิดใช้งาน / ผูกกับรายอื่นแล้ว = เลือกไม่ได้ (เซิร์ฟเวอร์ตรวจซ้ำเสมอ) */}
                    {dealers.filter(d => d.code !== HQ_CODE).map(d => {
                      const ผูกกับ = list.find(x => x.id !== converting.id && x.dealerCode === d.code);
                      const ปิด = d.status === "inactive";
                      return (
                        <option key={d.code} value={d.code} disabled={ปิด || !!ผูกกับ}>
                          {d.code} · {d.name}{d.province ? ` (${d.province})` : ""}{ปิด ? " · ปิดใช้งาน" : ผูกกับ ? " · ผูกกับรายอื่นแล้ว" : ""}
                        </option>
                      );
                    })}
                  </select>
                  {ฟอร์ม.existingCode && สาขามีบัญชี && !สาขามีบัญชี[ฟอร์ม.existingCode] && (
                    <div role="note" style={{ marginTop: 8, background: "#fff8e6", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 12px", fontSize: "0.78rem", color: "#92400e", fontWeight: 600, lineHeight: 1.6 }}>
                      ดีลเลอร์ {ฟอร์ม.existingCode} ยังไม่มีบัญชีเข้าระบบ — ผูกได้ แต่ดีลเลอร์จะยังเข้าระบบไม่ได้
                      จนกว่าจะตั้งอีเมล/รหัสผ่านที่หน้าดีลเลอร์
                    </div>
                  )}
                </div>
              ) : (
                <fieldset disabled={convBusy} style={{ border: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
                  <div>
                    <label className="form-label" htmlFor="cv-code">รหัสดีลเลอร์ *</label>
                    <input id="cv-code" className="form-input" value={ฟอร์ม.code} placeholder="เช่น CNXB"
                      onChange={e => setฟอร์ม(f => ({ ...f, code: e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 5) }))}
                      style={{ textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em" }} />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="cv-name">ชื่อดีลเลอร์ *</label>
                    <input id="cv-name" className="form-input" value={ฟอร์ม.name} onChange={e => setฟอร์ม(f => ({ ...f, name: e.target.value }))} placeholder="ชื่อที่จะใช้ในระบบ" />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="cv-region">ภาค *</label>
                    <select id="cv-region" className="form-select" value={ฟอร์ม.region} onChange={e => เปลี่ยนภาค(e.target.value)} style={{ cursor: "pointer" }}>
                      <option value="">— ยังไม่ระบุ —</option>
                      {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                      {/* ทุกภาค = ทั่วประเทศ (แบบเดียวกับฟอร์มดีลเลอร์) → จังหวัดเป็น "ทุกจังหวัด" ให้เอง */}
                      <option value={ALL_REGIONS}>{ALL_REGIONS} (ทั่วประเทศ)</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label" htmlFor="cv-province">จังหวัดที่ตั้ง *</label>
                    <select id="cv-province" className="form-select" value={ฟอร์ม.province} onChange={e => setฟอร์ม(f => ({ ...f, province: e.target.value }))} style={{ cursor: "pointer" }}>
                      <option value="">{ฟอร์ม.region ? "— ยังไม่ระบุ —" : "— เลือกภาคก่อน —"}</option>
                      {ฟอร์ม.region === ALL_REGIONS && <option value={ALL_PROVINCES}>{ALL_PROVINCES}</option>}
                      {provincesOfRegion(ฟอร์ม.region).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div className="form-label" id="cv-territory-label">จังหวัดที่ดูแล * <span style={{ fontWeight: 400, color: MUTED }}>(เลือกได้หลายจังหวัด · จังหวัดที่มีดีลเลอร์ดูแลอยู่แล้วก็เลือกได้)</span></div>
                    {พื้นที่ผิด ? (
                      <div role="alert" style={{ fontSize: "0.75rem", color: "#b91c1c" }}>{พื้นที่ผิด}</div>
                    ) : !เจ้าของพื้นที่ ? (
                      <div style={{ fontSize: "0.75rem", color: MUTED }}>กำลังโหลดพื้นที่…</div>
                    ) : !ฟอร์ม.region ? (
                      <div style={{ fontSize: "0.75rem", color: MUTED }}>เลือกภาคก่อน</div>
                    ) : (
                      <div role="group" aria-labelledby="cv-territory-label" style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", maxHeight: 150, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}>
                        {[...new Set([...พื้นที่, ...provincesOfRegion(ฟอร์ม.region)])].map(จ => {
                          const ดูแลอยู่ = เจ้าของพื้นที่.get(จ) ?? [];
                          return (
                            <label key={จ} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.76rem", color: "#374151", cursor: "pointer" }}>
                              <input type="checkbox" aria-label={`ดูแลจังหวัด ${จ}`} checked={พื้นที่.includes(จ)}
                                onChange={e => setพื้นที่(l => e.target.checked ? [...l, จ] : l.filter(x => x !== จ))} />
                              {จ}{ดูแลอยู่.length ? <span style={{ color: MUTED }}>{` (มี ${ดูแลอยู่.join(", ")} ดูแลอยู่)`}</span> : ""}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label className="form-label" htmlFor="cv-email">อีเมลเข้าระบบ</label>
                    <input id="cv-email" className="form-input" type="email" value={ฟอร์ม.email}
                      onChange={e => setฟอร์ม(f => ({ ...f, email: e.target.value.replace(/\s/g, "") }))}
                      placeholder={ฟอร์ม.code ? อีเมลเข้าระบบของสาขา(ฟอร์ม.code) : "เว้นว่าง = ระบบตั้งให้"} />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label className="form-label" htmlFor="cv-password">รหัสผ่าน</label>
                    <input id="cv-password" className="form-input" type="text" value={ฟอร์ม.password}
                      onChange={e => setฟอร์ม(f => ({ ...f, password: e.target.value.replace(/\s/g, "") }))}
                      placeholder="เว้นว่าง = ระบบสุ่มให้ (อย่างน้อย 8 ตัวอักษร)" />
                  </div>
                  <div style={{ gridColumn: "1 / -1", fontSize: "0.7rem", color: MUTED, lineHeight: 1.6 }}>
                    {ใบหลัก?.annualTarget != null
                      ? `เป้ายอดขายรายปีของสาขาจะตั้งตามใบเสนอ ${ใบหลัก.proposalNo ?? ""}: ${มูลค่าอ่านง่าย(ใบหลัก.annualTarget)}`
                      : "ใบเสนอยังไม่ได้ระบุเป้ายอดซื้อต่อปี — เป้ายอดขายตั้งเป็น 0 ไว้ก่อน แก้ได้ที่หน้าดีลเลอร์"}
                  </div>
                </fieldset>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                <button className="btn btn-secondary btn-md" disabled={convBusy} onClick={() => setConverting(null)}>ยกเลิก</button>
                <button className="btn btn-primary btn-md" disabled={convBusy || (โหมดตั้ง === "new" && ยังไม่พร้อมแปลง !== null)} onClick={() => void ยืนยันตั้งดีลเลอร์()}
                  style={convBusy ? { opacity: .6, cursor: "not-allowed" } : undefined}>
                  {convBusy ? "กำลังดำเนินการ…" : โหมดตั้ง === "new" ? "สร้างดีลเลอร์" : "ผูกกับดีลเลอร์นี้"}
                </button>
              </div>
            </div>
          </ModalCard>
        </div>
      )}

      {/* ── ผูกแล้ว แต่สาขายังไม่มีบัญชีเข้าระบบ — เตือนให้เห็นชัด พร้อมทางไปตั้งอีเมล/รหัสผ่าน ── */}
      {ผูกแล้วไม่มีบัญชี && (
        <div onClick={() => setผูกแล้วไม่มีบัญชี(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <ModalCard onClose={() => setผูกแล้วไม่มีบัญชี(null)} label="ดีลเลอร์ยังไม่มีบัญชีเข้าระบบ"
            style={{ background: "#fff", borderRadius: 16, width: 440, maxWidth: "100%", boxShadow: "0 24px 80px rgba(0,0,0,.3)" }}>
            <div style={{ background: "#b45309", color: "#fff", padding: "14px 20px", fontWeight: 800, borderRadius: "16px 16px 0 0" }}>
              ดีลเลอร์ {ผูกแล้วไม่มีบัญชี.code} ยังไม่มีบัญชีเข้าระบบ
            </div>
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{ margin: 0, fontSize: "0.84rem", color: "#374151", lineHeight: 1.7 }}>
                ผูก “{ผูกแล้วไม่มีบัญชี.name}” กับดีลเลอร์ {ผูกแล้วไม่มีบัญชี.code} แล้ว
                แต่สาขานี้ยังเข้าระบบไม่ได้ — ต้องตั้งอีเมลและรหัสผ่านให้ก่อน
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="btn btn-secondary btn-md" onClick={() => setผูกแล้วไม่มีบัญชี(null)}>ไว้ทีหลัง</button>
                <Link className="btn btn-primary btn-md" href={`/hq/dealers/${encodeURIComponent(ผูกแล้วไม่มีบัญชี.code)}`}
                  onClick={() => setผูกแล้วไม่มีบัญชี(null)}>
                  ไปตั้งอีเมล/รหัสผ่าน
                </Link>
              </div>
            </div>
          </ModalCard>
        </div>
      )}

      {/* ── บัญชีเข้าระบบของดีลเลอร์ใหม่ (โชว์ครั้งเดียวให้คัดลอกไปแจ้ง) ── */}
      {creds && (
        <div onClick={() => setCreds(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1150, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <ModalCard onClose={() => setCreds(null)} label="บัญชีเข้าระบบของดีลเลอร์ใหม่"
            style={{ background: "#fff", borderRadius: 16, width: 440, maxWidth: "100%", boxShadow: "0 24px 80px rgba(0,0,0,.3)", padding: 22 }}>
            <div style={{ fontWeight: 800, fontSize: "1rem", color: "#15803d", marginBottom: 4 }}>สร้างดีลเลอร์สำเร็จ</div>
            <div style={{ fontSize: "0.8rem", color: MUTED, marginBottom: 14 }}>{creds.code} · {creds.name} — คัดลอกบัญชีไปแจ้งดีลเลอร์</div>
            {[["อีเมลเข้าระบบ", creds.email, "email"], ["รหัสผ่าน", creds.password, "password"]].map(([ป้ายช่อง, ค่า, ช่อง]) => (
              <div key={ช่อง} style={{ marginBottom: 10 }}>
                <div className="form-label">{ป้ายช่อง}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <code style={{ flex: 1, background: "#f3f4f6", borderRadius: 8, padding: "8px 10px", fontSize: "0.82rem", wordBreak: "break-all" }}>{ค่า}</code>
                  <button className="btn btn-secondary btn-sm" aria-label={`คัดลอก${ป้ายช่อง}`} onClick={() => void คัดลอก(ค่า, ช่อง)}>
                    {คัดลอกแล้ว === ช่อง ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            ))}
            {!REAL_BACKEND && (
              <div role="note" style={{ background: "#fff8e6", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 12px", fontSize: "0.76rem", color: "#92400e", fontWeight: 600, lineHeight: 1.6 }}>
                โหมดข้อมูลตัวอย่าง — ใช้อีเมลนี้กับรหัสกลางของชุดตัวอย่างเข้าระบบฝั่งดีลเลอร์ได้ ไม่ใช่บัญชีจริง
              </div>
            )}
            <div style={{ fontSize: "0.72rem", color: MUTED, margin: "8px 0 14px", lineHeight: 1.6 }}>
              เปิดดูรหัสย้อนหลัง หรือแก้อีเมล/รหัสผ่านได้ที่หน้ารายละเอียดดีลเลอร์ {creds.code} · ดีลเลอร์เปลี่ยนเองได้ 2 ครั้ง ครั้งต่อไปต้องขออนุมัติ
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Link href={`/hq/dealers/${creds.code}`} className="btn btn-secondary btn-md">ไปที่ดีลเลอร์ {creds.code}</Link>
              <button className="btn btn-primary btn-md" onClick={() => setCreds(null)}>เสร็จแล้ว</button>
            </div>
          </ModalCard>
        </div>
      )}
    </div>
  );
}
