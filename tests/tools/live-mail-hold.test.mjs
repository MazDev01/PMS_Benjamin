// ── ข้อทดสอบ: ถือจดหมายของงานทดสอบบนเว็บจริงไม่ให้ตัวส่งหยิบ (tests/prod-live/mailHold.mjs · บอสสั่ง 1 พ.ย. 69) ───────
//   ไม่ต่อฐาน: ใช้ตัวปลอมของ supabase-js (เก็บแถวในหน่วยความจำ)
//   1) แยกจดหมายทดสอบถูก: อ้างคำขอของสาขาทดสอบ · ถึงบัญชีชั่วคราว · มีป้าย ZZTEST/รหัสสาขาทดสอบ → ใช่ · จดหมายจริง → ไม่ใช่
//   2) เลื่อนเฉพาะจดหมายทดสอบที่ยังไม่ส่ง · จดหมายจริงไม่ถูกแตะ
//   3) รอช่วงปลอดรอบส่ง: ใกล้รอบส่ง = รอข้ามรอบ · เพิ่งผ่านรอบส่ง = ไม่รอ
// mutation proof: PMS_MAIL_MUTATE=all (นับทุกฉบับเป็นจดหมายทดสอบ) · none (ไม่นับอะไรเลย) · nowait (ไม่รอรอบส่ง) → ต้องตก
// รัน: node tests/tools/live-mail-hold.test.mjs
import * as จริง from "../prod-live/mailHold.mjs";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${เพิ่ม}`}`); };
const พัง = process.env.PMS_MAIL_MUTATE ?? "";
const เป็นจดหมายทดสอบ = พัง === "all" ? () => true : พัง === "none" ? () => false : จริง.เป็นจดหมายทดสอบ;
const รอช่วงปลอดรอบส่ง = พัง === "nowait" ? async () => 0 : จริง.รอช่วงปลอดรอบส่ง;

// ── ตัวปลอมของ supabase-js เท่าที่ mailHold.mjs ใช้ ──
function ฐานปลอม(ตาราง) {
  const จาก = (ชื่อ) => {
    let แถว = [...ตาราง[ชื่อ]], แก้ = null;
    const q = {
      select() { return q; }, gte() { return q; },
      in(col, vals) { แถว = แถว.filter(r => vals.map(String).includes(String(r[col]))); return q; },
      eq(col, v) { แถว = แถว.filter(r => r[col] === v); return q; },
      update(v) { แก้ = v; return q; },
      then(ok, no) {
        if (แก้) for (const r of แถว) Object.assign(ตาราง[ชื่อ].find(x => x.id === r.id), แก้);
        return Promise.resolve({ data: แถว, error: null }).then(ok, no);
      },
    };
    return q;
  };
  return { from: จาก };
}

const ตาราง = {
  quote_requests: [{ id: 11, dealer_code: "ZZT" }, { id: 12, dealer_code: "RYG" }],
  email_outbox: [
    { id: 1, kind: "request_new", status: "pending", to_email: "hq@company.example", subject: "คำขอราคาใหม่", body: "ร้าน A ขอราคา", ref_table: "quote_requests", ref_id: "11" },
    { id: 2, kind: "customer_accepted", status: "pending", to_email: "hq@company.example", subject: "ลูกค้าตอบรับ — ZZTEST-ทดสอบระบบ-1", body: "", ref_table: "quotations", ref_id: "99" },
    { id: 3, kind: "hq_quote_sent", status: "pending", to_email: "live-dealer-1@example.test", subject: "ใบ HQ", body: "", ref_table: "hq_quotes", ref_id: "5" },
    { id: 4, kind: "request_new", status: "pending", to_email: "hq@company.example", subject: "คำขอราคาใหม่", body: "ZZT · ZZTEST-ร้านทดสอบ ขอราคา", ref_table: "", ref_id: "" },
    { id: 5, kind: "request_new", status: "pending", to_email: "hq@company.example", subject: "คำขอราคาใหม่", body: "RYG · ร้านจริง ขอราคา", ref_table: "quote_requests", ref_id: "12" },
    { id: 6, kind: "customer_accepted", status: "sent", to_email: "hq@company.example", subject: "ลูกค้าตอบรับ — บริษัทจริง", body: "ZZTOP ร้านชื่อคล้าย", ref_table: "quotations", ref_id: "7" },
  ],
};
const ทดสอบ = new Set(["11"]);
const ใช่ = ตาราง.email_outbox.filter(m => เป็นจดหมายทดสอบ(m, "ZZT", ทดสอบ)).map(m => m.id);
ผล(JSON.stringify(ใช่) === "[1,2,3,4]", "แยกจดหมายทดสอบ: อ้างคำขอทดสอบ · ป้าย ZZTEST · บัญชีชั่วคราว = ใช่ · จดหมายจริง (รวมชื่อคล้าย ZZTOP) = ไม่ใช่", `ได้ ${JSON.stringify(ใช่)}`);

if (!พัง) {
  const svc = ฐานปลอม(ตาราง);
  const n = await จริง.เลื่อนจดหมายทดสอบ(svc, "ZZT");
  const เลื่อน = ตาราง.email_outbox.filter(m => m.next_attempt_at).map(m => m.id);
  ผล(n === 4 && JSON.stringify(เลื่อน) === "[1,2,3,4]", "เลื่อนเฉพาะจดหมายทดสอบที่ยังไม่ส่ง · จดหมายจริงไม่ถูกแตะ", `เลื่อน ${n} · แถว ${JSON.stringify(เลื่อน)}`);
  const วันถัดไป = ตาราง.email_outbox.filter(m => m.next_attempt_at).every(m => Date.parse(m.next_attempt_at) - Date.now() > 23 * 3_600_000);
  ผล(วันถัดไป, "เลื่อนไปไม่น้อยกว่า 23 ชั่วโมง (พ้นรอบส่งระหว่างทดสอบ)");
}

// รอช่วงปลอดรอบส่ง
const ที่ = (iso) => () => new Date(iso);
let รอ = [];
await รอช่วงปลอดรอบส่ง({ now: ที่("2026-11-01T11:13:30Z"), sleep: async ms => { รอ.push(ms); }, log: () => {} });
ผล(รอ.length === 1 && รอ[0] >= 2.5 * 60_000 && รอ[0] <= 2.6 * 60_000, "ใกล้รอบส่ง (เหลือ 1.5 นาที) → รอข้ามรอบส่งแล้วเริ่มหลังรอบ 1 นาที", JSON.stringify(รอ));
รอ = [];
await รอช่วงปลอดรอบส่ง({ now: ที่("2026-11-01T11:16:10Z"), sleep: async ms => { รอ.push(ms); }, log: () => {} });
ผล(รอ.length === 0, "เพิ่งผ่านรอบส่ง 1 นาที (เหลือ 13.8 นาที) → เริ่มได้เลย", JSON.stringify(รอ));
รอ = [];
await รอช่วงปลอดรอบส่ง({ now: ที่("2026-11-01T11:15:20Z"), sleep: async ms => { รอ.push(ms); }, log: () => {} });
ผล(รอ.length === 1, "เพิ่งผ่านรอบส่งไม่ถึง 1 นาที (ตัวส่งอาจยังทำงาน) → รอ", JSON.stringify(รอ));

console.log(ตก ? `FAIL ${ตก}` : "ALL PASS");
process.exit(ตก ? 1 : 0);
