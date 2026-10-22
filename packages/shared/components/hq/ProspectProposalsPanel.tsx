"use client";

// ── แผง "ใบค่าแฟรนไชส์" ของผู้สนใจหนึ่งราย (แท็บในหน้าต่างรายละเอียดของ /hq/prospects) ──
//
// บอสสั่ง 14 ก.ย. 69: "ต้องทำเหมือนดีลเลอร์ที่ต้องมีใบเสนอราคา แต่อันนี้ของ HQ"
//   ออกใบ (ร่าง) → พิมพ์ส่งให้ → เปลี่ยนเป็น "ส่งแล้ว" → ตอบรับ / ปฏิเสธ
//   ต้องมีใบที่ส่งแล้วหรือตอบรับอย่างน้อย 1 ใบ ถึงจะสร้างดีลเลอร์ใหม่จากรายนี้ได้ (หน้าแม่รับรายการผ่าน onChange)
//
// ฟอร์ม (ProposalFormModal) และคำสั่ง พิมพ์/เปลี่ยนสถานะ/ลบ (useProposalActions) ใช้ชุดเดียวกับหน้ารวมใบเสนอ
// ส่งแล้วแก้เนื้อหา/ลบไม่ได้ — ฐานข้อมูลบังคับ (0172) หน้าจอแค่ไม่เปิดปุ่มให้กด
import React, { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Plus, Printer, Pencil, Trash2, CopyPlus } from "lucide-react";
import { proposals as proposalsRepo } from "@pms/shared/lib/data";
import type { DealerPackageProposal, DealerProposalStatus, DealerProspect } from "@pms/shared/lib/data/types";
import {
  packageLabel, proposalStatusLabel, proposalStatusColor,
  สถานะที่เปลี่ยนไปได้, ใบล็อกแล้ว, มูลค่าอ่านง่าย, หมดอายุแล้ว, ระยะสัญญาอ่านง่าย, ทำเวอร์ชันใหม่ได้,
} from "@pms/shared/lib/dealerProposals";
import { APP_NOW_ISO } from "@pms/shared/context/FilterContext";
import { fmtISOToThai } from "@pms/shared/lib/mock";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { ProposalFormModal } from "@pms/shared/components/hq/ProposalFormModal";
import { useProposalActions } from "@pms/shared/components/hq/useProposalActions";
import { ProposalPaymentsBox } from "@pms/shared/components/hq/ProposalPaymentsBox";

const PRIMARY = "#003366";
const MUTED = "#6b7280";

export function ProspectProposalsPanel({ prospect, editable, onChange, เปิดฟอร์มทันที = false }: {
  prospect: DealerProspect;
  /** ผู้มีสิทธิ์จัดการดีลเลอร์ — ไม่มีสิทธิ์ = ดู/พิมพ์ได้อย่างเดียว */
  editable: boolean;
  /** แจ้งรายการใบล่าสุดให้หน้าแม่ (ต้องเป็นฟังก์ชันที่คงที่ — เปลี่ยนทุกครั้งจะโหลดวนไม่หยุด) */
  onChange?: (list: DealerPackageProposal[]) => void;
  /** เปิดฟอร์มออกใบใหม่ให้ครั้งเดียวหลังโหลดรายการเสร็จ (ปุ่มลัด "ออกใบค่าแฟรนไชส์" / งานส่งใบเสนอ) */
  เปิดฟอร์มทันที?: boolean;
}) {
  const { พิมพ์, เปลี่ยนสถานะ, ทำเวอร์ชันใหม่, ลบใบ } = useProposalActions();
  const [list, setList] = useState<DealerPackageProposal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [ฟอร์ม, setฟอร์ม] = useState<{ editing: DealerPackageProposal | null } | null>(null);

  const ตั้งรายการ = useCallback((next: DealerPackageProposal[]) => {
    setList(next);
    onChange?.(next);
  }, [onChange]);

  const โหลด = useCallback(async () => {
    try {
      ตั้งรายการ(await proposalsRepo.list(prospect.id));
      setLoadErr("");
    } catch (e) {
      // ห้ามปล่อยว่างเงียบ ๆ — ผู้ใช้จะนึกว่ายังไม่เคยออกใบ แล้วออกซ้ำ
      setLoadErr(friendlyError(e, "โหลดใบค่าแฟรนไชส์ไม่สำเร็จ"));
    } finally {
      setLoaded(true);
    }
  }, [prospect.id, ตั้งรายการ]);
  useEffect(() => { void โหลด(); }, [โหลด]);

  // รอรายการโหลดเสร็จก่อนค่อยเปิด — เปิดแค่ครั้งเดียว ปิดแล้วไม่เด้งกลับ
  const เปิดฟอร์มไปแล้ว = useRef(false);
  useEffect(() => {
    if (!เปิดฟอร์มทันที || !editable || !loaded || loadErr || เปิดฟอร์มไปแล้ว.current) return;
    เปิดฟอร์มไปแล้ว.current = true;
    setฟอร์ม({ editing: null });
  }, [เปิดฟอร์มทันที, editable, loaded, loadErr]);

  async function กดเปลี่ยนสถานะ(p: DealerPackageProposal, status: DealerProposalStatus) {
    const saved = await เปลี่ยนสถานะ(p, status, prospect.name);
    if (saved) ตั้งรายการ(list.map(x => x.id === saved.id ? saved : x));
  }
  async function กดทำเวอร์ชันใหม่(p: DealerPackageProposal) {
    const ใหม่ = await ทำเวอร์ชันใหม่(p, prospect.name);
    if (!ใหม่) return;
    ตั้งรายการ([ใหม่, ...list]);
    setฟอร์ม({ editing: ใหม่ });   // เปิดร่างเวอร์ชันใหม่ให้แก้ทันที
  }
  async function กดลบ(p: DealerPackageProposal) {
    if (await ลบใบ(p, prospect.name)) ตั้งรายการ(list.filter(x => x.id !== p.id));
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <FileText size={15} color={PRIMARY} />
        <div style={{ fontWeight: 800, color: "#2D2D2D", fontSize: "0.88rem" }}>ใบค่าแฟรนไชส์</div>
        <span style={{ fontSize: "0.72rem", color: MUTED }}>{loaded ? `${list.length} ใบ` : ""}</span>
        <div style={{ flex: 1 }} />
        {editable && !ฟอร์ม && (
          <button className="btn btn-secondary btn-sm" onClick={() => setฟอร์ม({ editing: null })}>
            <Plus size={13} /> ออกใบค่าแฟรนไชส์
          </button>
        )}
      </div>
      <div style={{ fontSize: "0.7rem", color: MUTED, marginBottom: 10, lineHeight: 1.6 }}>
        สร้างดีลเลอร์ใหม่จากรายนี้ได้ ต่อเมื่อใบ “ตอบรับ” และบันทึกการชำระครบตามใบ · ส่งแล้วแก้เนื้อหาไม่ได้ ต้องทำเวอร์ชันใหม่
      </div>

      {/* ออก/แก้ใบ = เปิดฟอร์มในแท็บนี้เลย ไม่เด้งหน้าต่าง (บอสสั่ง 15 ก.ย. 69) · ยกเลิก/บันทึกแล้วกลับเป็นรายการ */}
      {ฟอร์ม ? (
        <ProposalFormModal แบบ="inline" prospect={prospect} editing={ฟอร์ม.editing} onClose={() => setฟอร์ม(null)}
          onSaved={saved => {
            ตั้งรายการ(ฟอร์ม.editing ? list.map(x => x.id === saved.id ? saved : x) : [saved, ...list]);
            setฟอร์ม(null);
          }} />
      ) : <>
      {loadErr && (
        <div role="alert" style={{ fontSize: "0.78rem", color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", display: "flex", gap: 8, alignItems: "center" }}>
          {loadErr}
          <button className="btn btn-secondary btn-sm" onClick={() => void โหลด()}>ลองใหม่</button>
        </div>
      )}
      {!loadErr && (!loaded
        ? <div style={{ fontSize: "0.78rem", color: MUTED }}>กำลังโหลด…</div>
        : list.length === 0
          ? <div style={{ fontSize: "0.78rem", color: "#9ca3af", padding: "10px 0" }}>ยังไม่มีใบค่าแฟรนไชส์</div>
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {list.map(p => {
                const สี = proposalStatusColor[p.status];
                const หมดอายุ = หมดอายุแล้ว(p, APP_NOW_ISO);
                return (
                  <div key={p.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#fff" }}>
                    <div style={{ minWidth: 0, flex: "1 1 220px" }}>
                      <div style={{ fontWeight: 800, color: PRIMARY, fontSize: "0.82rem" }}>
                        {p.proposalNo ?? "—"}
                        {(p.version ?? 1) > 1 && <span style={{ fontWeight: 600, color: MUTED, fontSize: "0.7rem" }}> · เวอร์ชัน {p.version}</span>}
                      </div>
                      <div style={{ fontSize: "0.74rem", color: "#374151" }}>
                        {packageLabel[p.package]} · ค่าแรกเข้า {มูลค่าอ่านง่าย(p.amount)}
                        {p.proposedDate ? ` · เสนอ ${fmtISOToThai(p.proposedDate)}` : ""}
                      </div>
                      <div style={{ fontSize: "0.7rem", color: MUTED }}>
                        ระยะสัญญา {ระยะสัญญาอ่านง่าย(p.contractMonths)} · เป้ายอดซื้อต่อปี {มูลค่าอ่านง่าย(p.annualTarget)}
                      </div>
                      {p.validUntil && (
                        <div style={{ fontSize: "0.7rem", color: หมดอายุ ? "#b91c1c" : MUTED, fontWeight: หมดอายุ ? 700 : 400 }}>
                          มีผลถึง {fmtISOToThai(p.validUntil)}{หมดอายุ ? " · เลยกำหนดแล้ว" : ""}
                        </div>
                      )}
                      {p.closeReason && (
                        <div data-testid={`เหตุผลปิด-${p.proposalNo ?? ""}`} style={{ fontSize: "0.7rem", color: "#991b1b" }}>เหตุผล: {p.closeReason}</div>
                      )}
                    </div>
                    {editable && สถานะที่เปลี่ยนไปได้(p.status).length > 1 ? (
                      // ต้องมีค่าเสมอ — ใบทุกใบต้องมีสถานะ · ตัวเลือกมีเฉพาะขั้นที่เดินหน้าได้จริง (ฐานข้อมูลบังคับซ้ำ)
                      <select aria-label={`สถานะใบ ${p.proposalNo ?? ""}`} className="form-select" value={p.status}
                        onChange={e => void กดเปลี่ยนสถานะ(p, e.target.value as DealerProposalStatus)}
                        style={{ width: "auto", cursor: "pointer", fontSize: "0.76rem", padding: "5px 28px 5px 10px" }}>
                        {สถานะที่เปลี่ยนไปได้(p.status).map(s => <option key={s} value={s}>{proposalStatusLabel[s]}</option>)}
                      </select>
                    ) : (
                      <span className="badge" style={{ background: สี.bg, color: สี.text }}>{proposalStatusLabel[p.status]}</span>
                    )}
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" aria-label={`พิมพ์ใบ ${p.proposalNo ?? ""}`} title="พิมพ์" onClick={() => void พิมพ์(p, prospect)}>
                        <Printer size={13} />
                      </button>
                      {editable && ทำเวอร์ชันใหม่ได้(p, list) && (
                        <button className="btn btn-secondary btn-sm" aria-label={`ทำเวอร์ชันใหม่จากใบ ${p.proposalNo ?? ""}`} title="ทำเวอร์ชันใหม่"
                          onClick={() => void กดทำเวอร์ชันใหม่(p)}>
                          <CopyPlus size={13} /> เวอร์ชันใหม่
                        </button>
                      )}
                      {editable && !ใบล็อกแล้ว(p.status) && (
                        <>
                          <button className="btn btn-secondary btn-sm" aria-label={`แก้ไขใบ ${p.proposalNo ?? ""}`} title="แก้ไข" onClick={() => setฟอร์ม({ editing: p })}>
                            <Pencil size={13} />
                          </button>
                          <button className="btn btn-sm" aria-label={`ลบใบ ${p.proposalNo ?? ""}`} title="ลบ" onClick={() => void กดลบ(p)}
                            style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                    {/* ตกลง + ชำระ (0208) — บันทึกการชำระได้เฉพาะใบที่ตอบรับ */}
                    {/* การชำระ: ดูอย่างเดียวที่นี่ — บันทึกรับชำระที่หน้าใบค่าแฟรนไชส์ที่เดียว (รอบ 4 · บอสตัดสิน 21 ต.ค. 69) */}
                    {p.status === "accepted" && <ProposalPaymentsBox proposal={p} editable={false} />}
                  </div>
                );
              })}
            </div>
          ))}
      </>}
    </div>
  );
}
