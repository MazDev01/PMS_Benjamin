#!/usr/bin/env node
// ── ตัวตรวจหน้าหลักหลังขึ้นเว็บ — อ่านอย่างเดียว ไม่ล็อกอิน (บอสสั่งโหมดเร็ว 12 พ.ย. 69 · แทนชุดทดสอบเว็บจริง + คำสั่งล้าง) ──────
//   ทุกคำขอเป็น GET ไม่มีบัญชี ไม่มีคุกกี้ ไม่เขียนอะไรลงเว็บ/ฐาน · คนรวมงานหรือบอสรันเองหลังขึ้นเว็บ (ef ไม่รันกับเว็บจริง)
//   ตรวจ: /api/health ทั้ง 2 โดเมน = 200 + status "ok" · หน้าเข้าระบบ HQ (/hq/login) + ดีลเลอร์ (/login) · หน้าแรก (/) ทั้ง 2 โดเมน
//         = 200 (หรือพาไปที่อื่นในโดเมนเดียวกัน) เป็น HTML และไม่ใช่หน้าผิดพลาด
//   รัน: npm run live:check                     ค่าตั้งต้น = โดเมนเว็บจริง
//        npm run live:check -- --hq <url> --dealer <url>   (ข้อทดสอบ/เว็บในเครื่อง)
//   ผล: exit 0 = ผ่านทุกข้อ · exit 1 = มีข้อไม่ผ่าน (บอกทีละข้อ) · ข้อทดสอบ tests/tools/live-check.test.mjs
const อาร์ก = process.argv.slice(2);
const ค่า = (k) => { const i = อาร์ก.indexOf(`--${k}`); return i >= 0 ? อาร์ก[i + 1] : undefined; };
const HQ = (ค่า("hq") ?? "https://pms.benjaminpebsteel.com").replace(/\/$/, "");
const DEALER = (ค่า("dealer") ?? "https://dealerpms.benjaminpebsteel.com").replace(/\/$/, "");
const หมดเวลา = Number(ค่า("timeout") ?? 20_000);

/** GET อย่างเดียว · ไม่ตามการพาไป (ตรวจว่าไปที่ไหน) · ไม่ส่งคุกกี้ */
async function ขอ(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), หมดเวลา);
  try {
    const r = await fetch(url, { method: "GET", redirect: "manual", signal: ctl.signal, headers: { "user-agent": "pms-live-check (read-only)" } });
    return { สถานะ: r.status, ชนิด: r.headers.get("content-type") ?? "", ไปที่: r.headers.get("location") ?? "", เนื้อ: await r.text() };
  } catch (e) { return { สถานะ: 0, ชนิด: "", ไปที่: "", เนื้อ: "", ผิด: e.name === "AbortError" ? `หมดเวลา ${หมดเวลา / 1000} วิ` : e.message }; }
  finally { clearTimeout(t); }
}
const หน้าผิดพลาด = /Application error|Internal Server Error|This page could not be found|404: This page|500: Internal/i;

const ผล = [];
const ข้อ = (ผ่าน, ชื่อ, รายละเอียด) => ผล.push({ ผ่าน, ชื่อ, รายละเอียด });

for (const [ชื่อ, ฐาน] of [["HQ", HQ], ["ดีลเลอร์", DEALER]]) {
  const r = await ขอ(`${ฐาน}/api/health`);
  let สุขภาพ = null; try { สุขภาพ = JSON.parse(r.เนื้อ); } catch { /* ไม่ใช่ JSON */ }
  ข้อ(r.สถานะ === 200 && สุขภาพ?.status === "ok", `${ชื่อ} /api/health = 200 ok`,
    r.ผิด ?? `ได้ ${r.สถานะ}${สุขภาพ ? ` · ${JSON.stringify(สุขภาพ.checks ?? สุขภาพ.status)}` : ""}`);
}
for (const [ชื่อ, url] of [["หน้าเข้าระบบ HQ", `${HQ}/hq/login`], ["หน้าเข้าระบบดีลเลอร์", `${DEALER}/login`], ["หน้าแรก HQ", `${HQ}/`], ["หน้าแรกดีลเลอร์", `${DEALER}/`]]) {
  const r = await ขอ(url);
  const ต้นทาง = new URL(url).origin;
  const พาไปในโดเมน = r.สถานะ >= 300 && r.สถานะ < 400 && (r.ไปที่.startsWith("/") || r.ไปที่.startsWith(ต้นทาง));
  const โหลดได้ = r.สถานะ === 200 && /text\/html/.test(r.ชนิด) && !หน้าผิดพลาด.test(r.เนื้อ);
  ข้อ(โหลดได้ || พาไปในโดเมน, `${ชื่อ} โหลดได้ (ไม่ล็อกอิน)`,
    r.ผิด ?? (พาไปในโดเมน ? `พาไป ${r.ไปที่}` : `ได้ ${r.สถานะ} ${r.ชนิด}${หน้าผิดพลาด.test(r.เนื้อ) ? " · เป็นหน้าผิดพลาด" : ""}`));
}

for (const x of ผล) console.log(`${x.ผ่าน ? "✓" : "✗"} ${x.ชื่อ}${x.ผ่าน ? "" : ` — ${x.รายละเอียด}`}`);
const ตก = ผล.filter(x => !x.ผ่าน).length;
console.log(ตก ? `✗ live:check ไม่ผ่าน ${ตก} จาก ${ผล.length} ข้อ (อ่านอย่างเดียว ไม่ได้เขียนอะไร)` : `✓ live:check ผ่านทั้ง ${ผล.length} ข้อ (อ่านอย่างเดียว ไม่ได้เขียนอะไร)`);
// ไม่สั่ง process.exit — Node บน Windows ล้ม (UV_HANDLE_CLOSING) ถ้าออกขณะการเชื่อมต่อ fetch ยังเปิด · ตั้งรหัสแล้วปล่อยจบเอง
process.exitCode = ตก ? 1 : 0;
