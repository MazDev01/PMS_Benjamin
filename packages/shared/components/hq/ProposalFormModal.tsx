"use client";

// ── ฟอร์มออก/แก้ "ใบค่าแฟรนไชส์" — ตัวเดียวใช้ทั้งหน้ารวมใบเสนอ และหน้าต่างผู้สนใจ ──
//
// บอสสั่ง 14 ก.ย. 69: "ใบค่าแฟรนไชส์มันไม่จบแบบหน้าเดียว ให้แบบใช้งานง่าย"
//   → หน้ารวมใบเสนอออกใบได้เลยในฟอร์มเดียว (เลือกผู้สนใจในฟอร์ม) ไม่ต้องเปิดต่อหลายชั้น
//
// ⚠️ ห้ามแยกเขียนฟอร์มนี้ซ้ำที่อื่น — กติกา (ช่องบังคับ/ช่องเงินมีลูกน้ำ/ภาคก่อนจังหวัด) ต้องเหมือนกันทุกหน้า
//    วางที่ body (portal) เพราะบางหน้าเปิดจากในหน้าต่างอีกชั้น — คลิกฉากหลังต้องหยุดไม่ให้หน้าต่างแม่ปิดตาม
import { ProvinceSelect } from "@pms/shared/components/ui/ProvinceSelect";
import React, { useEffect, useRef, useState } from "react";
import { useRecruitSettings } from "@pms/shared/lib/useHQConfig";
import { บวกวัน } from "@pms/shared/lib/recruitSettings";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { proposals as proposalsRepo } from "@pms/shared/lib/data";
import type { DealerPackage, DealerPackageProposal, DealerProspect } from "@pms/shared/lib/data/types";
import { PACKAGE_ORDER, packageLabel, เตรียมบันทึกใบ, ตรวจใบเสนอ } from "@pms/shared/lib/dealerProposals";
import { REGIONS, ALL_REGIONS, ALL_PROVINCES, provincesOfRegion, regionOf, ชื่อภาค } from "@pms/shared/lib/provinces";
import { เป้าตามแพ็กเกจ } from "@pms/shared/lib/recruitSettings";
import { formatMoneyInput, parseMoneyInput } from "@pms/shared/lib/format";
import { APP_NOW_ISO } from "@pms/shared/context/FilterContext";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { ModalCard } from "@pms/shared/components/ui/ModalCard";
import { แจ้งสำเร็จ } from "@pms/shared/components/ui/ConfirmToast";

const MUTED = "#6b7280";

// ร่างในฟอร์ม — ช่องตัวเลขเก็บเป็นข้อความที่มีลูกน้ำระหว่างพิมพ์ (บอสสั่ง 26 ส.ค. 69: ช่องเงินต้องเห็นลูกน้ำ)
type ร่างใบ = Partial<DealerPackageProposal> & { มูลค่าที่พิมพ์: string; ระยะที่พิมพ์: string; เป้าที่พิมพ์: string };

function ร่างเริ่มต้น(editing: DealerPackageProposal | null | undefined, prospect: DealerProspect | null | undefined): ร่างใบ {
  if (editing) {
    return {
      ...editing,
      มูลค่าที่พิมพ์: editing.amount != null ? formatMoneyInput(String(editing.amount)) : "",
      ระยะที่พิมพ์: editing.contractMonths != null ? String(editing.contractMonths) : "",
      เป้าที่พิมพ์: editing.annualTarget != null ? formatMoneyInput(String(editing.annualTarget)) : "",
    };
  }
  return {
    prospectId: prospect?.id,
    // พื้นที่เติมจากผู้สนใจให้ก่อน — แก้ได้
    region: prospect ? prospect.region || regionOf(prospect.province ?? "") || null : null,
    province: prospect?.province ?? null,
    proposedDate: APP_NOW_ISO,
    status: "draft",
    มูลค่าที่พิมพ์: "", ระยะที่พิมพ์: "", เป้าที่พิมพ์: "",
  };
}

export function ProposalFormModal({ prospect, choices, editing, onClose, onSaved, แบบ = "popup" }: {
  /** popup = หน้าต่างเด้ง (หน้ารวมใบเสนอ) · inline = เปิดในหน้าเดิม (แท็บใบเสนอของผู้สนใจ · บอสสั่ง 15 ก.ย. 69) */
  แบบ?: "popup" | "inline";
  /** ออกใบให้รายนี้ (ล็อกไว้) — ไม่ส่ง = ให้เลือกในฟอร์มจาก choices */
  prospect?: DealerProspect | null;
  /** รายที่เลือกได้ (หน้ารวมใบเสนอ) — ควรส่งเฉพาะรายที่ยังติดตามอยู่ */
  choices?: DealerProspect[];
  /** แก้ใบร่างเดิม */
  editing?: DealerPackageProposal | null;
  onClose: () => void;
  onSaved: (p: DealerPackageProposal, prospect: DealerProspect) => void;
}) {
  const [ร่าง, setร่าง] = useState<ร่างใบ>(() => ร่างเริ่มต้น(editing, prospect));
  // เปิดในหน้าเดิม: เลื่อนให้เห็นฟอร์มทันที (ปุ่มที่กดอาจอยู่ท้ายรายการยาว ๆ)
  const ในหน้าRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (แบบ === "inline") ในหน้าRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [แบบ]);
  const [formErr, setFormErr] = useState("");
  const [busy, setBusy] = useState(false);

  // ── ค่าตั้งต้นจากหน้าตั้งค่า › หาดีลเลอร์ (ข้อ 2) — ใช้กับ "ใบใหม่" เท่านั้น · ใบเดิมไม่แตะ ──
  //   เติมเฉพาะช่องที่ยังว่าง หรือช่องที่ยังเป็นค่าที่ระบบเติมให้ (ผู้ใช้แก้แล้ว = ไม่ทับ)
  //   ไม่ได้ตั้งไว้ = ไม่เติมอะไรเลย (ห้ามเดาตัวเลขให้)
  const ค่าตั้งใบ = useRecruitSettings().proposal;
  const ตัวเลขของแพ็กเกจ = (k?: DealerPackage | null, ภาค?: string | null) => {
    const d = k ? ค่าตั้งใบ.packages[k] : null;
    // เป้ายอดซื้อต่อปีแยกตามภาค (บอสสั่ง 15 ก.ย. 69) — ภาคของใบตั้งเป้าไว้ใช้เป้านั้น ไม่งั้นใช้ค่ากลาง
    const เป้า = k ? เป้าตามแพ็กเกจ({ proposal: ค่าตั้งใบ }, k, ภาค) : null;
    return {
      มูลค่า: d?.amount != null ? formatMoneyInput(String(d.amount)) : "",
      ระยะ: d?.contractMonths != null ? String(d.contractMonths) : "",
      เป้า: เป้า != null ? formatMoneyInput(String(เป้า)) : "",
    };
  };
  const วันมีผลตามอายุใบ = (วันเสนอ?: string | null) =>
    ค่าตั้งใบ.validityDays && วันเสนอ ? บวกวัน(วันเสนอ, ค่าตั้งใบ.validityDays) : null;
  useEffect(() => {
    if (editing) return;
    setร่าง(r => ({
      ...r,
      terms: r.terms?.trim() ? r.terms : (ค่าตั้งใบ.terms || r.terms),
      validUntil: r.validUntil ?? วันมีผลตามอายุใบ(r.proposedDate),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- เติมตอนค่าตั้งโหลดมาเท่านั้น
  }, [ค่าตั้งใบ]);
  const เลือกแพ็กเกจ = (k: DealerPackage | undefined) => setร่าง(r => {
    if (r.id) return { ...r, package: k };
    const เดิม = ตัวเลขของแพ็กเกจ(r.package, r.region), ใหม่ = ตัวเลขของแพ็กเกจ(k, r.region);
    const แทน = (ตอนนี้: string, ของเดิม: string, ของใหม่: string) => (!ตอนนี้ || ตอนนี้ === ของเดิม ? ของใหม่ : ตอนนี้);
    return {
      ...r, package: k,
      มูลค่าที่พิมพ์: แทน(r.มูลค่าที่พิมพ์, เดิม.มูลค่า, ใหม่.มูลค่า),
      ระยะที่พิมพ์: แทน(r.ระยะที่พิมพ์, เดิม.ระยะ, ใหม่.ระยะ),
      เป้าที่พิมพ์: แทน(r.เป้าที่พิมพ์, เดิม.เป้า, ใหม่.เป้า),
    };
  });
  const เปลี่ยนวันเสนอ = (v: string | null) => setร่าง(r => ({
    ...r,
    proposedDate: v,
    // วันมีผลยังเป็นค่าที่ระบบคิดให้ → เลื่อนตาม · ผู้ใช้ตั้งเองแล้ว → ไม่แตะ
    validUntil: !r.id && r.validUntil === วันมีผลตามอายุใบ(r.proposedDate) ? (วันมีผลตามอายุใบ(v) ?? r.validUntil) : r.validUntil,
  }));

  const เลือกในฟอร์ม = !prospect && !editing;
  const รายของใบ = prospect ?? choices?.find(c => c.id === ร่าง.prospectId) ?? null;

  const ตั้งค่า = <K extends keyof ร่างใบ>(k: K, v: ร่างใบ[K]) => setร่าง(r => ({ ...r, [k]: v }));
  const เปลี่ยนภาค = (region: string) => setร่าง(r => {
    const ภาคใหม่ = region || null;
    const เป้าเดิม = ตัวเลขของแพ็กเกจ(r.package, r.region).เป้า, เป้าใหม่ = ตัวเลขของแพ็กเกจ(r.package, ภาคใหม่).เป้า;
    return {
      ...r,
      region: ภาคใหม่,
      province: region === ALL_REGIONS ? ALL_PROVINCES
        : region && provincesOfRegion(region).includes(r.province ?? "") ? r.province : null,
      // ใบใหม่ที่เป้ายังเป็นค่าที่ระบบเติมให้ → เปลี่ยนตามเป้าของภาคใหม่ · พิมพ์เองแล้วไม่ทับ
      เป้าที่พิมพ์: !r.id && (!r.เป้าที่พิมพ์ || r.เป้าที่พิมพ์ === เป้าเดิม) ? เป้าใหม่ : r.เป้าที่พิมพ์,
    };
  });
  // เลือกผู้สนใจ → เติมพื้นที่ของรายนั้นให้ (เฉพาะช่องที่ยังว่าง ไม่ทับที่กรอกไว้)
  const เลือกราย = (id: string) => setร่าง(r => {
    const ราย = choices?.find(c => String(c.id) === id);
    return {
      ...r,
      prospectId: ราย?.id,
      region: r.region ?? (ราย ? ราย.region || regionOf(ราย.province ?? "") || null : null),
      province: r.province ?? ราย?.province ?? null,
    };
  });

  async function บันทึก() {
    if (!รายของใบ) { setFormErr("ต้องเลือกผู้สนใจ"); return; }
    const { มูลค่าที่พิมพ์, ระยะที่พิมพ์, เป้าที่พิมพ์, ...ค่าอื่น } = ร่าง;
    const row = เตรียมบันทึกใบ({
      ...ค่าอื่น,
      prospectId: รายของใบ.id,
      amount: มูลค่าที่พิมพ์.trim() ? parseMoneyInput(มูลค่าที่พิมพ์) : null,
      contractMonths: ระยะที่พิมพ์.trim() ? Number(ระยะที่พิมพ์) : null,
      annualTarget: เป้าที่พิมพ์.trim() ? parseMoneyInput(เป้าที่พิมพ์) : null,
    });
    const ผิด = ตรวจใบเสนอ(row);
    if (ผิด) { setFormErr(ผิด); return; }
    setBusy(true); setFormErr("");
    try {
      if (ร่าง.id) {
        const saved = await proposalsRepo.update({ ...row, id: ร่าง.id, proposalNo: ร่าง.proposalNo, createdAt: ร่าง.createdAt });
        แจ้งสำเร็จ(`บันทึกใบ ${saved.proposalNo ?? ""} แล้ว`);
        onSaved(saved, รายของใบ);
      } else {
        const saved = await proposalsRepo.create(row);
        แจ้งสำเร็จ(`ออกใบ ${saved.proposalNo ?? ""} แล้ว (ร่าง)`);
        onSaved(saved, รายของใบ);
      }
    } catch (e) {
      setFormErr(friendlyError(e, "บันทึกใบค่าแฟรนไชส์ไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  // เนื้อฟอร์มชุดเดียว — ห่อเป็นหน้าต่างเด้ง หรือวางในหน้าเดิม (กติกาช่องต่าง ๆ ต้องเหมือนกันทุกที่)
  const ห่อ = (เนื้อ: React.ReactNode) => แบบ === "inline"
    ? (
      <section ref={ในหน้าRef} role="region" aria-label="ใบค่าแฟรนไชส์"
        style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, boxShadow: "0 2px 10px rgba(0,51,102,.06)", scrollMarginTop: 12 }}>
        {เนื้อ}
      </section>
    )
    : typeof document === "undefined" ? null : createPortal(
      <div onClick={e => { e.stopPropagation(); if (!busy) onClose(); }}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1120, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <ModalCard onClose={() => !busy && onClose()} label="ใบค่าแฟรนไชส์" className="modal-fit"
          style={{ background: "#fff", borderRadius: 16, width: 560, maxWidth: "100%", boxShadow: "0 24px 80px rgba(0,0,0,.3)" }}>
          {เนื้อ}
        </ModalCard>
      </div>,
      document.body,
    );

  return ห่อ(
    <>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: "0.98rem", fontWeight: 800, color: "#2D2D2D" }}>
            {ร่าง.id ? `แก้ไขใบ ${ร่าง.proposalNo ?? ""}` : "ออกใบค่าแฟรนไชส์"}
            {รายของใบ && !เลือกในฟอร์ม && <span style={{ display: "block", fontSize: "0.72rem", color: MUTED, fontWeight: 600 }}>{รายของใบ.name}</span>}
          </h2>
          <button aria-label="ปิด" onClick={() => !busy && onClose()} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, display: "flex" }}><X size={18} /></button>
        </div>
        <div className="modal-fit-body" style={{ padding: "14px 20px" }}>
          {formErr && <div role="alert" style={{ background: "#fee2e2", border: "1px solid #dc262630", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: "0.8rem", color: "#dc2626", fontWeight: 600 }}>{formErr}</div>}
          <fieldset disabled={busy} style={{ border: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {เลือกในฟอร์ม && (
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="form-label" htmlFor="pp-prospect">ผู้สนใจ *</label>
                <select id="pp-prospect" className="form-select" value={ร่าง.prospectId != null ? String(ร่าง.prospectId) : ""} onChange={e => เลือกราย(e.target.value)} style={{ cursor: "pointer" }}>
                  <option value="">— ยังไม่ระบุ —</option>
                  {(choices ?? []).map(c => <option key={c.id} value={String(c.id)}>{c.name}{c.province ? ` · ${c.province}` : ""}</option>)}
                </select>
                {(choices ?? []).length === 0 && (
                  <div style={{ fontSize: "0.7rem", color: "#92400e", marginTop: 4 }}>ยังไม่มีผู้สนใจที่ติดตามอยู่ — เพิ่มที่หน้าผู้สนใจเป็นดีลเลอร์ ก่อน</div>
                )}
              </div>
            )}
            <div>
              <label className="form-label" htmlFor="pp-package">แพ็กเกจ *</label>
              <select id="pp-package" className="form-select" value={ร่าง.package ?? ""} onChange={e => เลือกแพ็กเกจ((e.target.value || undefined) as DealerPackage | undefined)} style={{ cursor: "pointer" }}>
                <option value="">— ยังไม่ระบุ —</option>
                {PACKAGE_ORDER.map(k => <option key={k} value={k}>{packageLabel[k]}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="pp-amount">ค่าแรกเข้า (บาท · จ่ายครั้งเดียว)</label>
              {/* ช่องเงินใช้ text + ใส่ลูกน้ำเอง (บอสสั่ง 26 ส.ค. 69) · ไม่บังคับ — ไม่กรอก = "—" ห้ามเติมตัวเลขให้ */}
              <input id="pp-amount" className="form-input" type="text" inputMode="numeric" value={ร่าง.มูลค่าที่พิมพ์}
                onChange={e => ตั้งค่า("มูลค่าที่พิมพ์", formatMoneyInput(e.target.value))} placeholder="เว้นว่างได้" />
            </div>
            <div>
              <label className="form-label" htmlFor="pp-months">ระยะสัญญา (เดือน)</label>
              <input id="pp-months" className="form-input" type="text" inputMode="numeric" value={ร่าง.ระยะที่พิมพ์}
                onChange={e => ตั้งค่า("ระยะที่พิมพ์", e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="เช่น 12 · เว้นว่างได้" />
            </div>
            <div>
              <label className="form-label" htmlFor="pp-target">เป้ายอดซื้อต่อปี (บาท)</label>
              <input id="pp-target" className="form-input" type="text" inputMode="numeric" value={ร่าง.เป้าที่พิมพ์}
                onChange={e => ตั้งค่า("เป้าที่พิมพ์", formatMoneyInput(e.target.value))} placeholder="เว้นว่างได้" />
              <div style={{ fontSize: "0.66rem", color: MUTED, marginTop: 3 }}>ตั้งเป็นดีลเลอร์แล้ว ใช้เป็นเป้ายอดขายรายปีของสาขา</div>
            </div>
            {/* ภาคมาก่อนจังหวัด — กติกาเดียวกับฟอร์มผู้สนใจ · "ทุกภาค" = ทุกจังหวัด */}
            <div>
              <label className="form-label" htmlFor="pp-region">ภาค (พื้นที่ที่ได้สิทธิ์)</label>
              <select id="pp-region" className="form-select" value={ร่าง.region ?? ""} onChange={e => เปลี่ยนภาค(e.target.value)} style={{ cursor: "pointer" }}>
                <option value="">— ยังไม่ระบุ —</option>
                {REGIONS.map(r => <option key={r} value={r}>{ชื่อภาค(r)}</option>)}
                <option value={ALL_REGIONS}>{ALL_REGIONS} (ทั่วประเทศ)</option>
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="pp-province">จังหวัด</label>
              <ProvinceSelect id="pp-province" label="จังหวัด" className="form-select" value={ร่าง.province ?? ""} onChange={v => ตั้งค่า("province", v || null)} style={{ cursor: "pointer" }}
                options={provincesOfRegion(ร่าง.region ?? "")} ว่าง={ร่าง.region ? "— ยังไม่ระบุ —" : "— ยังไม่ระบุ (เลือกภาคก่อน) —"}
                ก่อน={ร่าง.region === ALL_REGIONS && <option value={ALL_PROVINCES}>{ALL_PROVINCES}</option>}
                หลัง={ร่าง.province && ร่าง.province !== ALL_PROVINCES && !provincesOfRegion(ร่าง.region ?? "").includes(ร่าง.province) && (
                  <option value={ร่าง.province}>{ร่าง.province} (ตามที่บันทึกไว้)</option>
                )} />
            </div>
            <div>
              <label className="form-label" htmlFor="pp-date">วันที่เสนอ *</label>
              <input id="pp-date" className="form-input" type="date" value={ร่าง.proposedDate ?? ""} onChange={e => เปลี่ยนวันเสนอ(e.target.value || null)} />
            </div>
            <div>
              <label className="form-label" htmlFor="pp-valid">ข้อเสนอมีผลถึง</label>
              <input id="pp-valid" className="form-input" type="date" value={ร่าง.validUntil ?? ""} onChange={e => ตั้งค่า("validUntil", e.target.value || null)} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="form-label" htmlFor="pp-terms">เงื่อนไข</label>
              <textarea id="pp-terms" className="form-input" rows={4} value={ร่าง.terms ?? ""} onChange={e => ตั้งค่า("terms", e.target.value)}
                placeholder="พิมพ์ทีละบรรทัด — แต่ละบรรทัดขึ้นเป็นหนึ่งข้อในเอกสาร" style={{ resize: "vertical" }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="form-label" htmlFor="pp-note">หมายเหตุภายใน (ไม่พิมพ์ลงเอกสาร)</label>
              <input id="pp-note" className="form-input" value={ร่าง.note ?? ""} onChange={e => ตั้งค่า("note", e.target.value)} placeholder="เช่น คุยรายละเอียดทาง LINE แล้ว" />
            </div>
          </fieldset>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button className="btn btn-secondary btn-md" disabled={busy} onClick={onClose}>ยกเลิก</button>
            <button className="btn btn-primary btn-md" disabled={busy} onClick={() => void บันทึก()}
              style={busy ? { opacity: .6, cursor: "not-allowed" } : undefined}>
              {busy ? "กำลังบันทึก…" : "บันทึกใบ"}
            </button>
          </div>
        </div>
    </>,
  );
}
