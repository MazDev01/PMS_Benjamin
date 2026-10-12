"use client";

// ── คำสั่งของใบค่าแฟรนไชส์: พิมพ์ · เปลี่ยนสถานะ · ลบใบร่าง ──
//   ชุดเดียวใช้ทั้งหน้ารวมใบเสนอ (ปุ่มในแถว/แผงรายละเอียด) และแผงใบในหน้าต่างลูกค้าเป้าหมาย
//   ⚠️ ห้ามเขียนซ้ำที่อื่น — ข้อความยืนยัน/การบันทึกการใช้งานต้องเหมือนกันทุกหน้า
import { useCallback } from "react";
import { proposals as proposalsRepo, hqCompany as hqCompanyRepo, settings as settingsRepo } from "@pms/shared/lib/data";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import type { DealerPackageProposal, DealerProposalStatus, DealerProspect } from "@pms/shared/lib/data/types";
import { proposalStatusLabel } from "@pms/shared/lib/dealerProposals";
import { เขียนใบเสนอลงหน้าต่าง } from "@pms/shared/lib/dealerProposalPrint";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { ยืนยัน, แจ้งพลาด } from "@pms/shared/components/ui/ConfirmToast";
import { useAuditLogger } from "@pms/shared/lib/useAudit";

export function useProposalActions() {
  const logAudit = useAuditLogger();

  const พิมพ์ = useCallback(async (p: DealerPackageProposal, prospect: DealerProspect) => {
    // เปิดหน้าต่างทันทีตอนกด — เปิดหลังรอโหลดข้อมูลบริษัท เบราว์เซอร์จะบล็อกเป็นป๊อปอัป
    const w = window.open("", "_blank");
    if (!w) { แจ้งพลาด("เบราว์เซอร์บล็อกหน้าต่างพิมพ์ — อนุญาตป๊อปอัปของเว็บนี้แล้วลองใหม่"); return; }
    try {
      // ผู้ลงนามช่อง "ผู้เสนอ" จากหน้าตั้งค่า › หาดีลเลอร์ — อ่านไม่ได้ก็ยังพิมพ์ได้ (ใช้ชื่อบริษัทแทน) แต่ต้องแจ้งไว้
      const [hq, ค่าตั้ง] = await Promise.all([
        hqCompanyRepo.get(),
        settingsRepo.getRecruitSettings().catch(e => { logRepoRead("settings.getRecruitSettings(print)", e); return null; }),
      ]);
      เขียนใบเสนอลงหน้าต่าง(w, p, prospect, hq,
        ค่าตั้ง ? { name: ค่าตั้ง.proposal.signerName, title: ค่าตั้ง.proposal.signerTitle } : undefined);
    } catch (e) {
      w.close();
      แจ้งพลาด(friendlyError(e, "เปิดหน้าพิมพ์ไม่สำเร็จ"));
    }
  }, []);

  /** คืนใบที่บันทึกแล้ว · ผู้ใช้กดยกเลิก/บันทึกไม่สำเร็จ = null */
  const เปลี่ยนสถานะ = useCallback(async (p: DealerPackageProposal, status: DealerProposalStatus, ชื่อราย: string) => {
    if (status === p.status) return null;
    if (!(await ยืนยัน({
      หัวข้อ: `เปลี่ยนใบ ${p.proposalNo ?? ""} เป็น “${proposalStatusLabel[status]}” ?`,
      รายละเอียด: status === "sent"
        ? "ส่งแล้วจะแก้เนื้อหาในใบและลบใบไม่ได้อีก (เปลี่ยนได้แค่สถานะ) — ใบนี้คือหลักฐานว่าเสนออะไรไป"
        : "เปลี่ยนแล้วย้อนกลับไม่ได้",
      ปุ่มตกลง: `เปลี่ยนเป็น${proposalStatusLabel[status]}`,
    }))) return null;
    try {
      const saved = await proposalsRepo.setStatus(p.id, status);
      logAudit("เปลี่ยนสถานะใบค่าแฟรนไชส์", `${p.proposalNo ?? ""} · ${ชื่อราย} → ${proposalStatusLabel[status]}`);
      return saved;
    } catch (e) {
      แจ้งพลาด(friendlyError(e, "เปลี่ยนสถานะไม่สำเร็จ"));
      return null;
    }
  }, [logAudit]);

  /** คืน true เมื่อลบแล้วจริง */
  const ลบใบ = useCallback(async (p: DealerPackageProposal, ชื่อราย: string) => {
    if (!(await ยืนยัน({
      หัวข้อ: `ลบใบร่าง ${p.proposalNo ?? ""} ?`,
      รายละเอียด: "ลบได้เฉพาะใบร่าง · ย้อนกลับไม่ได้",
      ปุ่มตกลง: "ลบใบร่าง", อันตราย: true,
    }))) return false;
    try {
      await proposalsRepo.remove(p.id);
      logAudit("ลบใบค่าแฟรนไชส์ (ร่าง)", `${p.proposalNo ?? ""} · ${ชื่อราย}`);
      return true;
    } catch (e) {
      แจ้งพลาด(friendlyError(e, "ลบใบไม่สำเร็จ"));
      return false;
    }
  }, [logAudit]);

  return { พิมพ์, เปลี่ยนสถานะ, ลบใบ };
}
