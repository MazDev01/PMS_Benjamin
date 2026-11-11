import { describe, it, expect } from "vitest";
import { รวมแถวตามภาค } from "@pms/shared/lib/provinces";

// การ์ดสัดส่วนดีลเลอร์ตามภาค (แดชบอร์ด HQ) ขึ้น "ภาคตะวันออกเฉียงเหนือ" 2 แถว (10 พ.ย. 69) — ฐานมีทั้ง "อีสาน" และ "ตะวันออกเฉียงเหนือ"
// ตัวกลาง รวมแถวตามภาค: ภาคเดียวกันสะกดต่าง = แถวเดียว ภาคของแถว = ภาคมาตรฐาน · ภาคไม่รู้จักคงกลุ่มเดิม
// ตกบนโค้ดเดิม: ไม่มี รวมแถวตามภาค
describe("รวมแถวตามภาค", () => {
  const รวม = (ก: { region: string; dealers: number; sales: number }, ข: { region: string; dealers: number; sales: number }) =>
    ({ ...ก, dealers: ก.dealers + ข.dealers, sales: ก.sales + ข.sales });
  it("อีสาน + ตะวันออกเฉียงเหนือ + ภาคอีสาน = แถวเดียว ภาค = อีสาน · ยอดรวมกัน", () => {
    const ผล = รวมแถวตามภาค([
      { region: "อีสาน", dealers: 2, sales: 100 },
      { region: "กลาง", dealers: 1, sales: 50 },
      { region: "ตะวันออกเฉียงเหนือ", dealers: 3, sales: 200 },
      { region: "ภาคอีสาน", dealers: 1, sales: 1 },
    ], รวม);
    expect(ผล).toEqual([{ region: "อีสาน", dealers: 6, sales: 301 }, { region: "กลาง", dealers: 1, sales: 50 }]);
    expect(new Set(ผล.map(r => r.region)).size, "ไม่มีภาคซ้ำ (key ซ้ำ)").toBe(ผล.length);
  });
  it("ภาคที่ไม่รู้จัก (ไม่ระบุ) คงกลุ่มของตัวเอง · ว่าง/ช่องว่างรวมกัน", () => {
    const ผล = รวมแถวตามภาค([
      { region: "ไม่ระบุ", dealers: 1, sales: 0 },
      { region: "ใต้", dealers: 1, sales: 0 },
      { region: " ไม่ระบุ ", dealers: 2, sales: 5 },
    ], รวม);
    expect(ผล).toEqual([{ region: "ไม่ระบุ", dealers: 3, sales: 5 }, { region: "ใต้", dealers: 1, sales: 0 }]);
  });
  it("ไม่แก้แถวต้นทาง", () => {
    const ต้น = [{ region: "ตะวันออกเฉียงเหนือ", dealers: 1, sales: 1 }];
    รวมแถวตามภาค(ต้น, รวม);
    expect(ต้น[0].region).toBe("ตะวันออกเฉียงเหนือ");
  });
});
