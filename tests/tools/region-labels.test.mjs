// ── ข้อทดสอบ: ตัวตรวจชื่อภาคบนหน้าจอผ่านรายการกลาง (scripts/check-region-labels.mjs · บอสสั่ง 30 ต.ค. 69) ───────────────────
//   ก. แสดงค่าภาคดิบ (>{x.region}< · ภาค{x.region} · PanelRow value={x.region} · `${x.region}` · REGIONS.map → {r} · [..x.region].join) = ตก
//   ข. ป้ายตัวกรอง "ทุกภาค" = ตก · ค. ผ่าน ชื่อภาค()/regionDisplay() · ช่องกรอก (select value) · คำค้น (toLowerCase) = ผ่าน
//   ง. ของจริงในโฟลเดอร์นี้ผ่าน · อ่านไฟล์อย่างเดียว ไม่แตะฐาน · รัน: node tests/tools/region-labels.test.mjs
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const ที่ = path.join("test-results", `region-labels-${process.pid}`);
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(-600)}`}`); };
const ตรวจ = (root) => { const r = spawnSync(process.execPath, ["scripts/check-region-labels.mjs"], { encoding: "utf8", env: { ...process.env, PMS_RGL_ROOT: root } }); return { ...r, ออก: (r.stdout ?? "") + (r.stderr ?? "") }; };
function จำลอง(ชื่อ, เนื้อ) {
  const r = path.join(ที่, ชื่อ), f = path.join(r, "apps/hq/app/page.tsx");
  mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, เนื้อ); return r;
}
const ผิด = {
  "ค่าดิบในเนื้อหา": `<span className="badge">{d.region}</span>`,
  "ภาค ต่อค่าดิบ": `<div>ภาค{dealer.region || "—"}</div>`,
  "PanelRow ค่าดิบ": `<PanelRow icon={X} label="ภาค" value={row.region} />`,
  "template ค่าดิบ": "const sub = `${d.code} · ${d.region}`;",
  "ตัวเลือกภาคดิบ": `{REGIONS.map(r => <option key={r} value={r}>{r}</option>)}`,
  "join ค่าดิบ": `{[d.province, d.region].filter(Boolean).join(" · ")}`,
  "ป้าย ทุกภาค": `<option value="all">ทุกภาค</option>`,
};
for (const [ชื่อ, เนื้อ] of Object.entries(ผิด)) {
  const r = ตรวจ(จำลอง(ชื่อ.replace(/\s/g, "-"), เนื้อ));
  ผล(r.status === 1, `ก/ข. ${ชื่อ} = ตก`, r.ออก);
}
{
  const r = ตรวจ(จำลอง("ถูก", [
    `<span>{ชื่อภาค(d.region)}</span>`, `<td>{regionDisplay(r.region)}</td>`,
    `<select value={form.region} onChange={e => set(e.target.value)}>`, "const ค้น = `${d.code} ${d.region}`.toLowerCase();",
    `{REGIONS.map(r => <option key={r} value={r}>{ชื่อภาค(r)}</option>)}`, `<option value="all">{ป้ายทุกภูมิภาค}</option>`,
  ].join("\n")));
  ผล(r.status === 0, "ค. ผ่านรายการกลาง · ช่องกรอก · คำค้น = ผ่าน", r.ออก);
}
{ const r = spawnSync(process.execPath, ["scripts/check-region-labels.mjs"], { encoding: "utf8" }); ผล(r.status === 0, "ง. ของจริงในโฟลเดอร์นี้ผ่าน", (r.stdout ?? "") + (r.stderr ?? "")); }
rmSync(ที่, { recursive: true, force: true });
if (ตก) { console.log(`\nFAIL ${ตก} ข้อ`); process.exit(1); }
console.log("\nALL PASS");
