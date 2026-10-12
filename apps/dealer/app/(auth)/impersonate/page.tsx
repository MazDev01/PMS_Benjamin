"use client";

// ─── เข้าระบบแทนดีลเลอร์ (สำนักงานใหญ่กดจากหน้า /hq/dealers) ────────────────────
//
// ทำไมต้องมีหน้านี้ (แก้ 20 ส.ค. 69 — บอสแจ้งว่ากดปุ่ม "เข้าระบบ" แล้วไม่ได้):
//   เดิมสำนักงานใหญ่เปิด "ลิงก์ยืนยันของ Supabase" ตรง ๆ แล้วให้ Supabase พากลับมาที่แอปดีลเลอร์
//   แต่ปลายทางนั้นต้องถูกใส่ไว้ในรายการที่อนุญาต (Authentication → URL Configuration)
//   ถ้าไม่ได้ใส่ Supabase จะไม่แจ้งอะไรเลย แค่เงียบ ๆ แล้วพาไปที่ Site URL ของโปรเจกต์แทน
//   ผลคือเปิดแท็บใหม่ขึ้นมาเจอหน้าเปล่า/หน้า error — ผู้ใช้ไม่รู้ว่าเกิดอะไรขึ้น
//   (ยืนยันจากของจริง: ลิงก์ที่ได้มี redirect_to=http://127.0.0.1:3000 ซึ่งไม่มีอะไรรันอยู่)
//
// ตอนนี้จึงไม่พึ่งการตั้งค่าฝั่ง Supabase อีก: สำนักงานใหญ่ส่ง "ใบผ่านครั้งเดียว" มาที่หน้านี้
//   แล้วหน้านี้แลกเป็น session เอง — คุมได้ทั้งหมดในโค้ด ใช้ได้ทั้งตอนพัฒนาและระบบจริง
//
// ⚠️ ใบผ่านมาทาง #hash ไม่ใช่ query string — hash ไม่ถูกส่งไปกับคำขอ HTTP
//    จึงไม่มีทางไปโผล่ใน log ของเซิร์ฟเวอร์/ตัวกลางระหว่างทาง
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@pms/shared/lib/data/supabase/client";
import { REAL_BACKEND, DATA_SOURCE } from "@pms/shared/lib/data/config";
import { caAdoptTokens } from "@pms/shared/lib/cookieAuth";

export default function ImpersonatePage() {
  const router = useRouter();
  const [ผิดพลาด, setผิดพลาด] = useState("");
  const [ถอยใน, setถอยใน] = useState<number | null>(null);   // วินาทีที่เหลือก่อนพากลับเอง

  // ── เข้าไม่ได้ = พากลับไปหน้าที่กดมา ไม่ใช่ทิ้งไว้ที่หน้าเข้าสู่ระบบของดีลเลอร์ (บอสสั่ง 24 ส.ค. 69) ──
  //
  // คนที่มาถึงหน้านี้คือ "ผู้ดูแลสำนักงานใหญ่" ไม่ใช่ดีลเลอร์ — เขาไม่มีรหัสของสาขานั้นอยู่แล้ว
  // การโยนไปหน้าเข้าสู่ระบบของดีลเลอร์จึงเป็นทางตัน ต้องพากลับไปหน้าดีลเลอร์ของสำนักงานใหญ่
  //
  // ⚠️ ไม่ส่ง URL ปลายทางมากับลิงก์ (จะกลายเป็นช่องให้คนอื่นแต่งลิงก์พาไปเว็บปลอมได้)
  //    ใช้ของที่เบราว์เซอร์รู้อยู่แล้วแทน:
  //      · เปิดเป็นแท็บใหม่ (ปกติ) → หน้าสำนักงานใหญ่ยังเปิดค้างอยู่แท็บเดิม แค่ปิดแท็บนี้แล้วโฟกัสกลับ
  //      · ป๊อปอัพถูกบล็อกจนต้องเปิดในแท็บเดิม → ถอยกลับหนึ่งหน้าก็คือหน้าสำนักงานใหญ่พอดี
  const กลับไปสำนักงานใหญ่ = useCallback(() => {
    const แท็บที่กดมา = window.opener as Window | null;
    if (แท็บที่กดมา && !แท็บที่กดมา.closed) {
      try { แท็บที่กดมา.focus(); } catch { /* บางเบราว์เซอร์ไม่ให้โฟกัสข้ามแท็บ — ปิดแท็บนี้ก็พอ */ }
      window.close();
      return;
    }
    if (window.history.length > 1) { window.history.back(); return; }
    window.location.href = "/login";   // ไม่มีที่ให้กลับจริง ๆ (เปิดลิงก์ตรงจากที่อื่น)
  }, []);

  // นับถอยหลังแล้วพากลับเอง — ให้เวลาอ่านข้อความว่าพลาดเพราะอะไรก่อน
  useEffect(() => {
    if (!ผิดพลาด) return;
    setถอยใน(5);
    const t = setInterval(() => setถอยใน(n => {
      if (n === null) return null;
      if (n <= 1) { clearInterval(t); กลับไปสำนักงานใหญ่(); return 0; }
      return n - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [ผิดพลาด, กลับไปสำนักงานใหญ่]);

  useEffect(() => {
    if (!REAL_BACKEND) { setผิดพลาด("โหมดเดโมไม่ต้องใช้หน้านี้"); return; }
    const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("th") ?? "";
    if (!token) { setผิดพลาด("ลิงก์ไม่สมบูรณ์ — ขอลิงก์ใหม่จากหน้าดีลเลอร์ของสำนักงานใหญ่"); return; }

    let alive = true;
    getSupabase().auth.verifyOtp({ token_hash: token, type: "magiclink" })
      .then(async ({ data, error }) => {
        if (!alive) return;
        if (error) {
          // ใบผ่านใช้ได้ครั้งเดียวและมีอายุสั้น — หมดอายุ/ถูกใช้ไปแล้วเป็นกรณีที่เจอบ่อยสุด
          setผิดพลาด(`เข้าระบบแทนไม่สำเร็จ — ${error.message}`);
          return;
        }
        // ── โหมด api: หน้าเว็บถือ session เองไม่ได้ ต้องส่งให้เซิร์ฟเวอร์ตั้ง cookie ก่อน ──
        //
        // ⚠️ บั๊กจริงบนเว็บใช้งานจริง (พบ 26 ส.ค. 69): เดิมทำแค่ตรวจใบผ่านแล้วสั่งไปหน้าแดชบอร์ด
        //    ซึ่งพอในโหมด supabase (ตัว supabase-js เก็บ session ให้เอง) แต่เว็บจริงรันโหมด api
        //    ที่ session อยู่ใน cookie ของเซิร์ฟเวอร์เท่านั้น → ไม่มีใครตั้ง cookie ให้
        //    ผลคือกด "เข้าระบบแทนดีลเลอร์" แล้วเด้งไปหน้าเข้าสู่ระบบของดีลเลอร์ทุกครั้ง
        //    บนเครื่องนักพัฒนาไม่มีทางเจอ เพราะ dev รันโหมด supabase
        if (DATA_SOURCE === "api") {
          const at = data?.session?.access_token ?? "";
          const rt = data?.session?.refresh_token;
          const ok = at ? await caAdoptTokens(at, rt) : null;
          if (!alive) return;
          if (!ok) { setผิดพลาด("เข้าระบบแทนไม่สำเร็จ — เก็บใบผ่านไม่ได้ ลองกดใหม่อีกครั้ง"); return; }
        }
        // ล้าง token ออกจากแถบที่อยู่ก่อนไปต่อ (กันติดไปกับประวัติเบราว์เซอร์)
        window.history.replaceState(null, "", window.location.pathname);
        if (DATA_SOURCE === "api") {
          // ⚠️ ต้องโหลดหน้าใหม่ทั้งหน้า ห้ามเปลี่ยนหน้าแบบภายในแอป (พบบนเว็บจริง 26 ส.ค. 69)
          //    ตอนหน้านี้เริ่มทำงาน แอปเพิ่งถามไปแล้วว่า "ตอนนี้เป็นใคร" และได้คำตอบว่า "ยังไม่ได้เข้าระบบ"
          //    (ตอนนั้น cookie ยังไม่ถูกตั้ง) การเปลี่ยนหน้าแบบภายในแอปจึงยังใช้คำตอบเก่าอยู่
          //    ตัวกันหน้าเลยเตะไปหน้าเข้าสู่ระบบทันที ทั้งที่ cookie ตั้งสำเร็จแล้ว
          //    โหลดใหม่ทั้งหน้า = แอปถามใหม่ด้วย cookie ที่มีอยู่จริง แล้วเข้าแดชบอร์ดได้
          window.location.replace("/dashboard?impersonated=1");
          return;
        }
        router.replace("/dashboard?impersonated=1");
      })
      .catch((e: unknown) => { if (alive) setผิดพลาด(`เข้าระบบแทนไม่สำเร็จ — ${String(e)}`); });
    return () => { alive = false; };
  }, [router]);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column", gap: 12, padding: 24, textAlign: "center", background: "#f7f9fc",
    }}>
      {ผิดพลาด ? (
        <>
          <div style={{ fontSize: "1rem", fontWeight: 800, color: "#b4232a" }}>{ผิดพลาด}</div>
          <div style={{ fontSize: "0.82rem", color: "#6b7280" }}>
            ลิงก์เข้าระบบแทนใช้ได้ครั้งเดียวและมีอายุสั้น — กลับไปกดใหม่ที่หน้าดีลเลอร์ได้เลย
          </div>
          <button type="button" onClick={กลับไปสำนักงานใหญ่}
            style={{ fontFamily: "inherit", fontSize: "0.85rem", fontWeight: 800, color: "#fff", background: "#003366",
              border: "none", borderRadius: 10, padding: "10px 18px", cursor: "pointer" }}>
            กลับไปหน้าดีลเลอร์ของสำนักงานใหญ่{ถอยใน !== null && ถอยใน > 0 ? ` (${ถอยใน})` : ""}
          </button>
          <a href="/login" style={{ fontSize: "0.78rem", color: "#8a94a3", fontWeight: 600 }}>หรือเข้าสู่ระบบด้วยบัญชีดีลเลอร์</a>
        </>
      ) : (
        <>
          <div style={{
            width: 26, height: 26, borderRadius: "50%",
            border: "2.5px solid #e6eaf0", borderTopColor: "#003366",
            animation: "spin 0.8s linear infinite",
          }} />
          <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#374151" }}>กำลังเข้าระบบแทนดีลเลอร์…</div>
          <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
        </>
      )}
    </div>
  );
}
