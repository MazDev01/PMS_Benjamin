"use client";

// ── คำสั่งของใบค่าแฟรนไชส์: พิมพ์ · เปลี่ยนสถานะ · ลบใบร่าง ──
//   ชุดเดียวใช้ทั้งหน้ารวมใบเสนอ (ปุ่มในแถว/แผงรายละเอียด) และแผงใบในหน้าต่างลูกค้าเป้าหมาย
//   ⚠️ ห้ามเขียนซ้ำที่อื่น — ข้อความยืนยัน/การบันทึกการใช้งานต้องเหมือนกันทุกหน้า
import { useCallback } from "react";
import { proposals as proposalsRepo, hqCompany as hqCompanyRepo, settings as settingsRepo } from "@pms/shared/lib/data";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import type { DealerPackageProposal, DealerProposalStatus, DealerProspect } from "@pms/shared/lib/data/types";
import { proposalStatusLabel, ต้องมีเหตุผล } from "@pms/shared/lib/dealerProposals";
import { เขียนใบเสนอลงหน้าต่าง } from "@pms/shared/lib/dealerProposalPrint";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { ยืนยัน, ถามเหตุผล, แจ้งพลาด, แจ้งสำเร็จ } from "@pms/shared/components/ui/ConfirmToast";

export function useProposalActions() {

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
    // ปฏิเสธ = ปิดใบ ต้องมีเหตุผล (FLOW: ปฏิเสธหรือหมดอายุ → ปิด พร้อมเหตุผล · ฐานข้อมูลบังคับ 0207)
    let เหตุผล: string | undefined;
    if (ต้องมีเหตุผล(status)) {
      const ตอบ = await ถามเหตุผล({
        หัวข้อ: `ปฏิเสธใบ ${p.proposalNo ?? ""} ?`,
        รายละเอียด: "ปิดใบแล้วย้อนกลับไม่ได้ — ถ้าจะเจรจาต่อ ทำเวอร์ชันใหม่จากใบนี้ได้",
        ป้ายช่อง: "เหตุผลที่ปฏิเสธ", ปุ่มตกลง: "ปฏิเสธใบนี้", อันตราย: true,
      });
      if (ตอบ == null) return null;
      เหตุผล = ตอบ;
    } else if (!(await ยืนยัน({
      หัวข้อ: `เปลี่ยนใบ ${p.proposalNo ?? ""} เป็น “${proposalStatusLabel[status]}” ?`,
      รายละเอียด: status === "sent"
        ? "ส่งแล้วจะแก้เนื้อหาในใบและลบใบไม่ได้อีก — ถ้าต้องแก้ ทำเวอร์ชันใหม่ · ใบนี้คือหลักฐานว่าเสนออะไรไป"
        : "เปลี่ยนแล้วย้อนกลับไม่ได้",
      ปุ่มตกลง: `เปลี่ยนเป็น${proposalStatusLabel[status]}`,
    }))) return null;
    try {
      const saved = await proposalsRepo.setStatus(p.id, status, เหตุผล);
      return saved;
    } catch (e) {
      แจ้งพลาด(friendlyError(e, "เปลี่ยนสถานะไม่สำเร็จ"));
      return null;
    }
  }, []);

  /** ส่งแล้วแก้ไม่ได้ → ทำเวอร์ชันใหม่ (ร่าง) · คืนใบใหม่ · ยกเลิก/ไม่สำเร็จ = null */
  const ทำเวอร์ชันใหม่ = useCallback(async (p: DealerPackageProposal, ชื่อราย: string) => {
    if (!(await ยืนยัน({
      หัวข้อ: `ทำเวอร์ชันใหม่จากใบ ${p.proposalNo ?? ""} ?`,
      รายละเอียด: "ได้ใบร่างเวอร์ชันใหม่ (คัดลอกเนื้อหาเดิม) ให้แก้แล้วส่ง · ส่งแล้วใบเดิมจะเป็น “ถูกแทนด้วยเวอร์ชันใหม่”",
      ปุ่มตกลง: "ทำเวอร์ชันใหม่",
    }))) return null;
    try {
      const ใหม่ = await proposalsRepo.newVersion(p.id);
      แจ้งสำเร็จ(`สร้างร่าง ${ใหม่.proposalNo ?? ""} แล้ว — แก้แล้วเปลี่ยนเป็น “ส่งแล้ว”`);
      return ใหม่;
    } catch (e) {
      แจ้งพลาด(friendlyError(e, "ทำเวอร์ชันใหม่ไม่สำเร็จ"));
      return null;
    }
  }, []);

  /** คืน true เมื่อลบแล้วจริง */
  const ลบใบ = useCallback(async (p: DealerPackageProposal, ชื่อราย: string) => {
    if (!(await ยืนยัน({
      หัวข้อ: `ลบใบร่าง ${p.proposalNo ?? ""} ?`,
      รายละเอียด: "ลบได้เฉพาะใบร่าง · ย้อนกลับไม่ได้",
      ปุ่มตกลง: "ลบใบร่าง", อันตราย: true,
    }))) return false;
    try {
      await proposalsRepo.remove(p.id);
      return true;
    } catch (e) {
      แจ้งพลาด(friendlyError(e, "ลบใบไม่สำเร็จ"));
      return false;
    }
  }, []);

  return { พิมพ์, เปลี่ยนสถานะ, ทำเวอร์ชันใหม่, ลบใบ };
}
