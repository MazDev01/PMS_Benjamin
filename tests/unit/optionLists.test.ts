// รายการกลางของเครือ (บอสตัดสิน 19 พ.ย. 69 · ใบ 0296) — ตรรกะล้วนที่ทุกฟอร์ม/ตัวกรอง/ป้ายใช้
//   ข้อมูลเก็บรหัส · เปลี่ยนชื่อแล้วข้อมูลเก่าเห็นชื่อใหม่ · ซ่อน = ไม่ให้เลือกใหม่แต่ยังแสดงชื่อ
//   ค่าที่ไม่ตรงรายการ = "‹ค่า› (ตามที่บันทึกไว้)" ทุกที่ · ฟอร์ม/ตัวกรองยังมีค่าเดิม · นำเข้าจับคู่จากชื่อ ไม่เดา
import { describe, it, expect } from "vitest";
import {
  รายการตั้งต้นของ, ป้ายของ, ตัวเลือกฟอร์ม, ตัวเลือกตัวกรอง, หารหัสจากป้าย, ตรวจร่าง, จัดป้าย, อยู่ในรายการ,
  ค่าระบุเอง, แยกค่าระบุเอง, ตัวเลือกตั้งต้น, รายการกลางทั้งหมด, type ตัวเลือกกลาง,
} from "../../packages/shared/lib/optionLists";

const ช่องทาง = รายการตั้งต้นของ("lead_source");
const นัด = รายการตั้งต้นของ("appointment_type");
const เหตุผล = รายการตั้งต้นของ("prospect_lost_reason");

describe("ค่าตั้งต้น (ตรงกับใบ 0296)", () => {
  it("ช่องทางที่มา 7 ตัวที่ใช้อยู่ + ลูกค้าเดิม (ซ่อน) · อื่น ๆ มีเว้นวรรค", () => {
    expect(ช่องทาง.filter(x => !x.hidden).map(x => x.label)).toEqual(["Facebook", "เว็บไซต์", "LINE", "ลูกค้าเข้ามาเอง", "แนะนำต่อ", "งานแสดงสินค้า", "อื่น ๆ"]);
    expect(ช่องทาง.find(x => x.code === "repeat_customer")).toMatchObject({ hidden: true });
  });
  it("ประเภทนัดหมายมี call · meeting · site_visit ที่พบในข้อมูล", () => {
    expect(นัด.find(x => x.code === "call")?.label).toBe("โทรติดตาม");
    expect(นัด.find(x => x.code === "meeting")?.label).toBe("ประชุม");
    expect(นัด.find(x => x.code === "site_visit")?.label).toBe("นัดดูหน้างาน");
  });
  it("เหตุผลผู้สนใจไม่สำเร็จ 4 ข้อ + อื่น ๆ (ระบุ) แบบพิมพ์เอง", () => {
    expect(เหตุผล.map(x => x.label)).toEqual(["เงินทุนไม่พอ", "ยังไม่พร้อม", "เลือกแบรนด์อื่น", "ทำเลไม่เหมาะ", "อื่น ๆ (ระบุ)"]);
    expect(เหตุผล.at(-1)).toMatchObject({ code: "other", freeText: true });
  });
  it("ไม่มีคำว่า อื่นๆ (ไม่เว้นวรรค) · รหัสเป็นตัวอักษรอังกฤษเล็กเท่านั้น · ตัวที่แสดงชื่อไม่ซ้ำ", () => {
    for (const l of รายการกลางทั้งหมด) {
      for (const x of ตัวเลือกตั้งต้น[l]) {
        expect(x.label).not.toContain("อื่นๆ");
        expect(x.code).toMatch(/^[a-z][a-z0-9_]*$/);
      }
      expect(ตรวจร่าง(รายการตั้งต้นของ(l).map(x => ({ code: x.code, label: x.label, hidden: x.hidden })))).toBeNull();
    }
  });
});

describe("ป้ายของค่าที่บันทึก", () => {
  it("รหัส → ชื่อ · เปลี่ยนชื่อแล้วข้อมูลเก่าเห็นชื่อใหม่", () => {
    expect(ป้ายของ(ช่องทาง, "walk_in")).toBe("ลูกค้าเข้ามาเอง");
    const ใหม่ = ช่องทาง.map(x => x.code === "walk_in" ? { ...x, label: "เดินเข้าร้าน" } : x);
    expect(ป้ายของ(ใหม่, "walk_in")).toBe("เดินเข้าร้าน");
  });
  it("ซ่อนแล้วข้อมูลเดิมยังเห็นชื่อ", () => {
    const ซ่อน = ช่องทาง.map(x => x.code === "line" ? { ...x, hidden: true } : x);
    expect(ป้ายของ(ซ่อน, "line")).toBe("LINE");
  });
  it("ไม่ตรงรายการ = ค่าเดิม (ตามที่บันทึกไว้) · ว่าง = —", () => {
    expect(ป้ายของ(ช่องทาง, "TikTok")).toBe("TikTok (ตามที่บันทึกไว้)");
    expect(ป้ายของ(ช่องทาง, "")).toBe("—");
    expect(ป้ายของ(ช่องทาง, null, "")).toBe("");
  });
  it("ตัวเลือกระบุเอง = ชื่อหัว: ข้อความ", () => {
    const v = ค่าระบุเอง("other", " ย้ายไปต่างประเทศ ");
    expect(v).toBe("other:ย้ายไปต่างประเทศ");
    expect(ป้ายของ(เหตุผล, v)).toBe("อื่น ๆ: ย้ายไปต่างประเทศ");
    expect(แยกค่าระบุเอง(เหตุผล, v)?.item.code).toBe("other");
    expect(อยู่ในรายการ(เหตุผล, v)).toBe(true);
    // รหัสที่ไม่ใช่ตัวเลือกระบุเอง + ':' = ค่านอกรายการ ไม่ใช่ระบุเอง
    expect(ป้ายของ(เหตุผล, "no_capital:อะไร")).toBe("no_capital:อะไร (ตามที่บันทึกไว้)");
  });
});

describe("ตัวเลือกของฟอร์มและตัวกรอง", () => {
  it("ฟอร์ม = ตัวที่ไม่ซ่อนตามลำดับ · ค่าเดิมที่ซ่อน/นอกรายการขึ้นก่อนให้เลือกค้างไว้", () => {
    expect(ตัวเลือกฟอร์ม(ช่องทาง).map(o => o.value)).toEqual(["facebook", "website", "line", "walk_in", "referral", "exhibition", "other"]);
    expect(ตัวเลือกฟอร์ม(ช่องทาง, "repeat_customer")[0]).toEqual({ value: "repeat_customer", label: "ลูกค้าเดิม (งานขายใหม่)" });
    expect(ตัวเลือกฟอร์ม(ช่องทาง, "TikTok")[0]).toEqual({ value: "TikTok", label: "TikTok (ตามที่บันทึกไว้)" });
    expect(ตัวเลือกฟอร์ม(ช่องทาง, "line").length).toBe(7);
  });
  it("ลำดับตามที่ HQ ตั้ง (sort)", () => {
    const สลับ: ตัวเลือกกลาง[] = ช่องทาง.map(x => x.code === "other" ? { ...x, sort: 0 } : x);
    expect(ตัวเลือกฟอร์ม(สลับ)[0].value).toBe("other");
  });
  it("ตัวกรอง = ทุกตัว (รวมที่ซ่อน) + ค่านอกรายการที่พบในข้อมูล ไม่ซ้ำ", () => {
    const o = ตัวเลือกตัวกรอง(ช่องทาง, ["facebook", "TikTok", "TikTok", "", null]);
    expect(o.map(x => x.value)).toContain("repeat_customer");
    expect(o.filter(x => x.value === "TikTok")).toEqual([{ value: "TikTok", label: "TikTok (ตามที่บันทึกไว้)" }]);
    expect(o.filter(x => x.value === "facebook").length).toBe(1);
  });
});

describe("นำเข้าจากไฟล์: จับคู่จากชื่อในรายการ ไม่เดา", () => {
  it("ตรงชื่อ (ไม่สนตัวเล็กใหญ่/ช่องว่าง/อื่นๆ) → รหัส", () => {
    expect(หารหัสจากป้าย(ช่องทาง, " facebook ")).toBe("facebook");
    expect(หารหัสจากป้าย(ช่องทาง, "อื่นๆ")).toBe("other");
    expect(หารหัสจากป้าย(เหตุผล, "เงินทุน ไม่พอ")).toBe("no_capital");
  });
  it("ชื่อซ้ำกับตัวที่ซ่อน → ตัวที่แสดงก่อน", () => {
    expect(หารหัสจากป้าย(นัด, "โทรติดตาม")).toBe("follow_up");
  });
  it("ไม่ตรง = null (ไม่มีค่าเริ่มต้นแทน)", () => {
    expect(หารหัสจากป้าย(ช่องทาง, "คุณสมชาย")).toBeNull();
    expect(หารหัสจากป้าย(เหตุผล, "ทุนไม่พอ")).toBeNull();
    expect(หารหัสจากป้าย(ช่องทาง, "")).toBeNull();
  });
});

describe("ตรวจร่างก่อนบันทึก", () => {
  it("จัดป้าย: อื่นๆ → อื่น ๆ · ช่องว่างซ้ำ", () => expect(จัดป้าย("  อื่นๆ   (ระบุ) ")).toBe("อื่น ๆ (ระบุ)"));
  it("ว่าง/ซ้ำ (ตัวที่แสดง)/ซ่อนหมด = ไม่ผ่าน", () => {
    expect(ตรวจร่าง([])).not.toBeNull();
    expect(ตรวจร่าง([{ label: " ", hidden: false }])).not.toBeNull();
    expect(ตรวจร่าง([{ label: "LINE", hidden: false }, { label: "line", hidden: false }])).toContain("ซ้ำ");
    expect(ตรวจร่าง([{ label: "อื่นๆ", hidden: false }, { label: "อื่น ๆ", hidden: false }])).toContain("ซ้ำ");
    expect(ตรวจร่าง([{ label: "ก", hidden: true }])).not.toBeNull();
  });
  it("ซ่อนตัวที่ชื่อซ้ำได้ (ข้อมูลเก่า)", () => {
    expect(ตรวจร่าง([{ label: "โทรติดตาม", hidden: false }, { label: "โทรติดตาม", hidden: true }])).toBeNull();
  });
});
