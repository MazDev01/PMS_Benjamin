import { chromium } from "@playwright/test";
const OUT="สื่อนำเสนอ/ภาพหน้าจอ";
const html = `<!doctype html><meta charset="utf-8">
<style>
 body{margin:0;font-family:"Segoe UI","Sarabun",system-ui;background:#fff;padding:28px;color:#0f172a}
 .row{display:flex;gap:18px;justify-content:center;align-items:stretch}
 .box{border:2px solid #003366;border-radius:14px;padding:14px 18px;text-align:center;background:#f8fafc;min-width:210px}
 .box b{display:block;font-size:19px;color:#003366}
 .box span{font-size:14px;color:#475569}
 .arrow{display:flex;align-items:center;justify-content:center;font-size:26px;color:#94a3b8;margin:6px 0}
 .db{border-color:#059669;background:#f0fdf4}.db b{color:#047857}
 .cap{font-size:13px;color:#64748b;text-align:center;margin-top:10px}
 .tag{display:inline-block;font-size:12px;background:#e0e7ff;color:#3730a3;border-radius:999px;padding:2px 10px;margin:3px 2px}
</style>
<div class="row">
  <div class="box"><b>ผู้ใช้ฝั่งดีลเลอร์</b><span>เบราว์เซอร์ / มือถือ</span></div>
  <div class="box"><b>ผู้ใช้สำนักงานใหญ่</b><span>เบราว์เซอร์</span></div>
</div>
<div class="arrow">▼</div>
<div class="row">
  <div class="box"><b>เว็บดีลเลอร์</b><span>dealerpms.benjaminpebsteel.com<br>12 หน้า</span></div>
  <div class="box"><b>เว็บสำนักงานใหญ่</b><span>pms.benjaminpebsteel.com<br>13 หน้า</span></div>
</div>
<div class="arrow">▼ &nbsp; ทุกคำขอผ่านการตรวจสิทธิ์ &nbsp; ▼</div>
<div class="row">
  <div class="box db" style="min-width:520px"><b>ฐานข้อมูลกลาง (Supabase / PostgreSQL)</b>
  <span>เก็บข้อมูลทุกสาขาไว้ที่เดียว · มีกฎกันข้อมูลข้ามสาขา 70+ ข้อ<br>พร้อมระบบยืนยันตัวตนและที่เก็บไฟล์</span></div>
</div>
<div class="cap">
  <span class="tag">TypeScript</span><span class="tag">Next.js 15</span><span class="tag">React 19</span>
  <span class="tag">Supabase</span><span class="tag">Vercel</span>
  <div style="margin-top:6px">ข้อมูลสาขาหนึ่งจะไม่ถูกส่งออกไปให้อีกสาขา เพราะกฎอยู่ที่ฐานข้อมูล ไม่ได้อยู่ที่หน้าจอ</div>
</div>`;
const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:900,height:640},deviceScaleFactor:2})).newPage();
await p.setContent(html,{waitUntil:"load"}); await p.waitForTimeout(400);
await p.screenshot({path:`${OUT}/diagram.png`});
await b.close(); console.log("diagram ok");
