// รายการเคสทดสอบ API
export async function run({ call, login, DEALER, HQ }) {
  console.log("");
  console.log("-- เข้าสู่ระบบ --");
  const a = await login("RYG", DEALER);   console.log("    login RYG -> " + a.status);
  const b = await login("CNX", DEALER);   console.log("    login CNX -> " + b.status);
  const c = await login("ADMIN", HQ);     console.log("    login ADMIN(HQ) -> " + c.status);
  const d = await login("RYG", HQ);       console.log("    login RYG at HQ app -> " + d.status);

  await call("ล็อกอินรหัสผิด", { method: "POST", path: "/api/v1/auth?op=login", as: null,
    body: { email: "admin@benjamin.com", password: "wrong-xyz" }, expect: [400, 401] });
  await call("ล็อกอินไม่ส่งรหัส", { method: "POST", path: "/api/v1/auth?op=login", as: null,
    body: { email: "admin@benjamin.com" }, expect: [400, 401] });
  await call("ล็อกอินชนิดผิด", { method: "POST", path: "/api/v1/auth?op=login", as: null,
    body: { email: 12345, password: [] }, expect: [400, 401] });
  await call("ล็อกอิน body ว่าง", { method: "POST", path: "/api/v1/auth?op=login", as: null,
    body: {}, expect: [400, 401] });

  console.log("");
  console.log("-- ไม่มีใบผ่าน / ใบผ่านปลอม --");
  const paths = ["/api/v1/leads?dealer=RYG", "/api/v1/quotations?dealer=RYG", "/api/v1/customers?dealer=RYG",
    "/api/v1/appointments?dealer=RYG", "/api/v1/dealers", "/api/v1/catalog", "/api/v1/settings",
    "/api/v1/users", "/api/v1/audit", "/api/v1/persons", "/api/v1/profile", "/api/v1/hq-company",
    "/api/v1/files?dealer=RYG", "/api/v1/notes?dealer=RYG", "/api/v1/dealer-settings?dealer=RYG"];
  for (const p of paths) await call("ไม่มีใบผ่าน " + p, { path: p, as: null, expect: 401 });
  for (const p of ["/api/v1/leads?dealer=RYG", "/api/v1/customers?dealer=RYG", "/api/v1/dealers"])
    await call("ใบผ่านปลอม " + p, { path: p, as: null, headers: { cookie: "pms_at=fake.fake.fake" }, expect: 401 });
  await call("ใบผ่านหมดอายุ", { path: "/api/v1/leads?dealer=RYG", as: null,
    headers: { authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjF9.x" }, expect: 401 });
  await call("เขียนโดยไม่มีใบผ่าน", { method: "POST", path: "/api/v1/leads", as: null,
    body: { company: "hack" }, expect: 401 });

  console.log("");
  console.log("-- อ่านข้อมูล (มีสิทธิ์) --");
  await call("ลีดของสาขาตัวเอง", { path: "/api/v1/leads?dealer=RYG", expect: 200 });
  await call("ใบเสนอราคาของสาขาตัวเอง", { path: "/api/v1/quotations?dealer=RYG", expect: 200 });
  await call("ลูกค้าของสาขาตัวเอง", { path: "/api/v1/customers?dealer=RYG", expect: 200 });
  await call("นัดหมายของสาขาตัวเอง", { path: "/api/v1/appointments?dealer=RYG", expect: 200 });
  await call("ทะเบียนสาขา", { path: "/api/v1/dealers", expect: 200 });
  await call("แคตตาล็อก", { path: "/api/v1/catalog", expect: 200 });
  await call("ตั้งค่าระบบ", { path: "/api/v1/settings?k=policy", expect: 200 });
  await call("โปรไฟล์ตัวเอง", { path: "/api/v1/profile", expect: 200 });
  await call("ตั้งค่าสาขาตัวเอง", { path: "/api/v1/dealer-settings?dealer=RYG", expect: 200 });
  await call("ไฟล์ของสาขา", { path: "/api/v1/files?dealer=RYG", expect: 200 });

  console.log("");
  console.log("-- กันข้ามสาขา --");
  const นับแถว = (t) => { try { const j = JSON.parse(t); const r = j.rows ?? j; return Array.isArray(r) ? r.length : "?"; } catch { return "?"; } };
  const x1 = await call("RYG ขอลีดของ CNX", { path: "/api/v1/leads?dealer=CNX" });
  const x2 = await call("RYG ขอใบของ CNX", { path: "/api/v1/quotations?dealer=CNX" });
  const x3 = await call("RYG ขอลูกค้าของ CNX", { path: "/api/v1/customers?dealer=CNX" });
  const x4 = await call("RYG ขอตั้งค่าสาขา CNX", { path: "/api/v1/dealer-settings?dealer=CNX" });
  const x5 = await call("RYG ขอทั้งเครือ hq=1", { path: "/api/v1/leads?hq=1" });
  console.log("    แถวที่หลุด: ลีดCNX=" + นับแถว(x1.text) + " ใบCNX=" + นับแถว(x2.text) +
    " ลูกค้าCNX=" + นับแถว(x3.text) + " ทั้งเครือ=" + นับแถว(x5.text));
  console.log("    ตั้งค่าสาขา CNX: " + x4.status + " " + x4.text.slice(0, 150));

  console.log("");
  console.log("-- ตรวจข้อมูลขาเข้า --");
  await call("สร้างลีด body ว่าง", { method: "POST", path: "/api/v1/leads", body: {}, expect: [400, 403] });
  await call("ออกเลขลีดไม่ส่งสาขา", { method: "POST", path: "/api/v1/leads?op=next", body: {}, expect: 400 });
  await call("ออกเลขลีดสาขาชนิดผิด", { method: "POST", path: "/api/v1/leads?op=next", body: { dealerCode: 123 }, expect: 400 });
  await call("แก้ลีดไม่ส่ง id", { method: "PUT", path: "/api/v1/leads", body: { company: "x" }, expect: 400 });
  await call("ลบลีดไม่ส่ง id", { method: "DELETE", path: "/api/v1/leads", expect: 400 });
  await call("ลบลีด id ไม่มีจริง", { method: "DELETE", path: "/api/v1/leads?id=%23L-999999999", expect: [200, 204, 404] });
  await call("สถานะใบมั่ว", { method: "PUT", path: "/api/v1/quotations?op=status",
    body: { id: "Q-RYG-2026-0001", status: "zzz" }, expect: 400 });
  await call("id ใบยาวเกิน", { method: "PUT", path: "/api/v1/quotations?op=status",
    body: { id: "Q".repeat(200), status: "won" }, expect: 400 });
  await call("รวมยอดลูกค้า id ติดลบ", { method: "POST", path: "/api/v1/customers?op=reconcile",
    body: { customerId: -5 }, expect: 400 });
  await call("รวมยอดลูกค้า id เป็นข้อความ", { method: "POST", path: "/api/v1/customers?op=reconcile",
    body: { customerId: "abc" }, expect: 400 });
  await call("ลบลูกค้า id ไม่มีจริง", { method: "POST", path: "/api/v1/customers?op=delete-cascade",
    body: { customerId: 999999999 }, expect: [200, 400, 404] });
  await call("หน้ารายการ limit ติดลบ", { method: "POST", path: "/api/v1/leads?op=page",
    body: { limit: -1, offset: 0 }, expect: [200, 400] });
  await call("หน้ารายการ limit มหาศาล", { method: "POST", path: "/api/v1/leads?op=page",
    body: { limit: 999999, offset: 0 }, expect: [200, 400] });

  console.log("");
  console.log("-- ของอันตราย --");
  await call("SQL injection ในช่องค้นหา", { method: "POST", path: "/api/v1/leads?op=page",
    body: { limit: 10, offset: 0, search: "x'; DROP TABLE leads; --" }, expect: 200 });
  await call("wildcard ในช่องค้นหา", { method: "POST", path: "/api/v1/leads?op=page",
    body: { limit: 10, offset: 0, search: "%_%" }, expect: 200 });
  await call("XSS ในช่องค้นหา", { method: "POST", path: "/api/v1/leads?op=page",
    body: { limit: 10, offset: 0, search: "<script>alert(1)</script>" }, expect: 200 });
  await call("metrics คีย์ไม่มีจริง", { method: "POST", path: "/api/v1/metrics?k=dropAll", body: {}, expect: 400 });
  await call("metrics ไม่ส่งคีย์", { method: "POST", path: "/api/v1/metrics", body: {}, expect: 400 });

  console.log("");
  console.log("-- ตัวสรุปตัวเลขทุกคีย์ (บัญชี HQ) --");
  const keys = {
    dealerRollup: { year: 2026, asOf: "2026-08-27", defaultDays: 7, perDealer: null },
    networkQuoteRange: { start: "2026-01-01", end: "2026-12-31", dealer: null },
    leadSummary: { dateStart: "2026-01-01", dateEnd: "2026-12-31" },
    dashboardQuoteSummary: { start: "2026-01-01", end: "2026-12-31", dealer: null },
    networkCustomerSummary: { dealerCode: null, dateStart: "2026-01-01", dateEnd: "2026-12-31" },
    unassignedLeads: { asOf: "2026-08-27T00:00:00Z", defaultHours: 24 },
    hqAlerts: { asOf: "2026-08-27", unassignedDefaultHours: 24, leadIdleDays: 7, quoteValidityDays: 30, quoteExpiringDays: 7, dealerIdleDays: 14 },
    hqQuotationsSummary: { asOf: "2026-08-27" },
    hqCustomersPage: { limit: 10, offset: 0 },
    hqCustomersFilterOptions: {},
  };
  for (const k of Object.keys(keys))
    await call("metrics " + k, { origin: HQ, as: "ADMIN", method: "POST", path: "/api/v1/metrics?k=" + k, body: keys[k], expect: 200 });

  console.log("");
  console.log("-- เส้นทางผู้ดูแลระบบ --");
  await call("ดีลเลอร์ขอรายชื่อผู้ใช้", { origin: HQ, as: "RYG", path: "/api/v1/users" });
  await call("ดีลเลอร์ขอบันทึกการใช้งาน", { origin: HQ, as: "RYG", path: "/api/v1/audit" });
  await call("ดีลเลอร์แก้ทะเบียนสาขา", { origin: HQ, as: "RYG", method: "PUT", path: "/api/v1/dealers",
    body: [{ code: "HACK", name: "hack" }] });
  await call("ดีลเลอร์แก้ตั้งค่าระบบ", { origin: HQ, as: "RYG", method: "PUT", path: "/api/v1/settings?op=policy",
    body: { quoteValidityDays: 1 } });
  await call("ดีลเลอร์แก้แคตตาล็อก", { origin: HQ, as: "RYG", method: "PUT", path: "/api/v1/catalog",
    body: [{ id: "x", name: "hack", price: 1 }] });
  await call("ดีลเลอร์ขอข้อมูลบริษัท HQ", { origin: HQ, as: "RYG", path: "/api/v1/hq-company" });
  await call("ผู้ดูแลขอรายชื่อผู้ใช้", { origin: HQ, as: "ADMIN", path: "/api/v1/users", expect: 200 });
  await call("ผู้ดูแลขอบันทึกการใช้งาน", { origin: HQ, as: "ADMIN", path: "/api/v1/audit", expect: 200 });
  await call("admin/dealers ไม่มีใบผ่าน", { origin: HQ, as: null, path: "/api/admin/dealers", expect: [401, 403, 405] });
  await call("ดีลเลอร์เรียก admin/dealers", { origin: HQ, as: "RYG", path: "/api/admin/dealers" });
  await call("ดีลเลอร์เรียก admin/users", { origin: HQ, as: "RYG", path: "/api/admin/users" });

  console.log("");
  console.log("-- เส้นทาง/เมธอดที่ไม่รองรับ --");
  await call("เส้นทางไม่มีจริง", { path: "/api/v1/nope", expect: 404 });
  await call("PATCH ที่ไม่รองรับ", { method: "PATCH", path: "/api/v1/leads", body: {}, expect: [404, 405, 501] });
  await call("ping", { path: "/api/v1/ping", expect: [200, 401] });
  await call("health ไม่ต้องล็อกอิน", { path: "/api/health", as: null, expect: 200 });
}
