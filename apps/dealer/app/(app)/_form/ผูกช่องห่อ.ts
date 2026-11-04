// ── ผูกตัวกลางช่องบังคับ (useช่องบังคับ) กับช่องที่อยู่ในคอมโพเนนต์ห่อ เช่น ProvinceSelect (บอสสั่ง 4 พ.ย. 69) ──────────
//   ProvinceSelect ไม่รับ ref/aria-invalid จากข้างนอก → ใส่ ref นี้ที่กล่องที่ครอบไว้
//   หา <select> ข้างใน แล้วลงทะเบียนให้ตัวกลางเลื่อน/โฟกัสไปได้ + ติด aria-invalid/data-invalid ตามผลตรวจ
//   กรอบแดงส่งทาง style ของ ProvinceSelect เอง (กรอบผิด)
type ผูกได้ = { ref: (el: HTMLElement | null) => void; "aria-invalid"?: boolean; "data-invalid"?: string };

export function refช่องในกล่อง(ผูก: ผูกได้, ตัวเลือก = "select") {
  return (กล่อง: HTMLElement | null) => {
    const ช่อง = กล่อง?.querySelector<HTMLElement>(ตัวเลือก) ?? null;
    ผูก.ref(ช่อง);
    if (!ช่อง) return;
    if (ผูก["aria-invalid"]) { ช่อง.setAttribute("aria-invalid", "true"); ช่อง.setAttribute("data-invalid", "1"); }
    else { ช่อง.removeAttribute("aria-invalid"); ช่อง.removeAttribute("data-invalid"); }
  };
}
