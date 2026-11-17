// ── ข้อทดสอบ: ล้างของ Docker ของ PMS หลังขึ้นเว็บ (scripts/post-deploy-docker-cleanup.mjs · บอสสั่ง 17 พ.ย. 69) ──────────────────
//   ใช้ docker จำลอง (PMS_DOCKER_BIN) — ไม่แตะ Docker จริง · ตัวจำลองจดทุกคำสั่งที่ถูกเรียก
//   ก. ลบเฉพาะ image public.ecr.aws/supabase/* ที่ไม่มีคอนเทนเนอร์ใช้ (ทั้งเทียบรหัส image และชื่อ:แท็กที่คอนเทนเนอร์หยุดอยู่อ้าง)
//   ข. ไม่แตะ image ของโปรเจกต์อื่น (n8n · nca-toolkit · minio · mysql · public.ecr.aws ที่ไม่ใช่ supabase · <none>)
//   ค. ไม่เคยเรียกคำสั่งลบทั้งเครื่อง/volume (system prune · volume · image prune · container rm · -f กับ image rm)
//   ง. ลบ build cache ด้วย builder prune -f ครั้งเดียว · ทดลอง (--dry-run) = ไม่ลบอะไรเลย
//   จ. พื้นที่ว่าง < 30 GB = เตือนชัด · ≥ 30 = ไม่เตือน · Docker ไม่ทำงาน / อ่านรายการคอนเทนเนอร์ไม่ได้ = ไม่ลบ image
//   ตกบนโค้ดเดิม: ไม่มีสคริปต์ (คนรวมงานล้างด้วยมือ)
// รัน: node tests/tools/post-deploy-docker-cleanup.test.mjs
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ราก = process.cwd();
const ที่ = mkdtempSync(path.join(tmpdir(), "pms-dockerclean-"));
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 800)}`}`); };

// docker จำลอง: สถานะจาก FAKE_STATE (JSON) · จดคำสั่งลง FAKE_LOG ทีละบรรทัด (JSON ของ argv)
const ตัวจำลอง = path.join(ที่, "fake-docker.mjs");
writeFileSync(ตัวจำลอง, `
import { appendFileSync, readFileSync } from "node:fs";
const a = process.argv.slice(2);
appendFileSync(process.env.FAKE_LOG, JSON.stringify(a) + "\\n");
const st = JSON.parse(readFileSync(process.env.FAKE_STATE, "utf8"));
const j = a.join(" ");
if (st.ล่ม) { console.error("error during connect: pipe not found"); process.exit(1); }
if (a[0] === "version") { console.log("29.0.0"); process.exit(0); }
if (j === "builder prune -f") { console.log("Total reclaimed space: 1.5GB"); process.exit(0); }
if (a[0] === "image" && a[1] === "ls") { console.log(st.images.map(i => i.ชื่อ + "|" + i.id).join("\\n")); process.exit(0); }
if (a[0] === "ps") { if (st.psพัง) { console.error("ps failed"); process.exit(1); } console.log(st.containers.map(c => c.id).join("\\n")); process.exit(0); }
if (a[0] === "inspect") { console.log(a.slice(3).map(id => { const c = st.containers.find(x => x.id === id); return c.image + "|" + c.config; }).join("\\n")); process.exit(0); }
if (a[0] === "image" && a[1] === "rm") { console.log("Untagged: " + a[2]); process.exit(0); }
console.error("ตัวจำลองไม่รู้จักคำสั่ง: " + j); process.exit(9);
`);
const สถานะ = {
  images: [
    { ชื่อ: "public.ecr.aws/supabase/postgres:17.6.1.011", id: "aaaaaaaaaaaa" },     // คอนเทนเนอร์รันอยู่ใช้ (รหัส)
    { ชื่อ: "public.ecr.aws/supabase/gotrue:v2.170.0", id: "bbbbbbbbbbbb" },          // ไม่มีใครใช้ → ลบ
    { ชื่อ: "public.ecr.aws/supabase/studio:2025.01.01", id: "cccccccccccc" },        // คอนเทนเนอร์หยุดอยู่อ้างชื่อ → คง
    { ชื่อ: "public.ecr.aws/supabase/realtime:v2.30.0", id: "dddddddddddd" },          // ไม่มีใครใช้ → ลบ
    { ชื่อ: "n8nio/n8n:latest", id: "eeeeeeeeeeee" },                                   // โปรเจกต์อื่น ไม่มีใครใช้ → ห้ามแตะ
    { ชื่อ: "stephengpope/no-code-architects-toolkit:latest", id: "ffffffffffff" },
    { ชื่อ: "minio/minio:latest", id: "111111111111" },
    { ชื่อ: "mysql:8", id: "222222222222" },
    { ชื่อ: "public.ecr.aws/other/thing:1", id: "333333333333" },                     // ecr แต่ไม่ใช่ supabase → ห้ามแตะ
    { ชื่อ: "<none>:<none>", id: "444444444444" },
  ],
  containers: [
    { id: "c1", image: "sha256:aaaaaaaaaaaa0000000000000000000000000000000000000000000000000000", config: "public.ecr.aws/supabase/postgres:17.6.1.011" },
    { id: "c2", image: "sha256:9999999999990000000000000000000000000000000000000000000000000000", config: "public.ecr.aws/supabase/studio:2025.01.01" },
    { id: "c3", image: "sha256:eeeeeeeeeeee0000000000000000000000000000000000000000000000000000", config: "n8nio/n8n:latest" },
  ],
};
let รอบ = 0;
function รัน(st, args = [], freeGB = "82") {
  const log = path.join(ที่, `log-${++รอบ}.txt`), state = path.join(ที่, `state-${รอบ}.json`);
  writeFileSync(state, JSON.stringify(st));
  const r = spawnSync(process.execPath, ["scripts/post-deploy-docker-cleanup.mjs", ...args], { cwd: ราก, encoding: "utf8",
    env: { ...process.env, PMS_DOCKER_BIN: ตัวจำลอง, FAKE_LOG: log, FAKE_STATE: state, PMS_FAKE_FREE_GB: freeGB } });
  const คำสั่ง = existsSync(log) ? readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l)) : [];
  return { ...r, ออก: (r.stdout ?? "") + (r.stderr ?? ""), คำสั่ง };
}
const ห้าม = (c) => { const j = c.join(" "); return /system prune|volume|image prune|container rm|\brm\b.*-f|\brmi\b|-f\b.*image rm/.test(j) || (c[0] === "image" && c[1] === "rm" && c.includes("-f")); };

// ก–ค ปกติ
{
  const r = รัน(สถานะ);
  const ลบ = r.คำสั่ง.filter(c => c[0] === "image" && c[1] === "rm").map(c => c[2]).sort();
  ผล(r.status === 0, "ปกติ: จบด้วยรหัส 0", r.ออก);
  ผล(JSON.stringify(ลบ) === JSON.stringify(["public.ecr.aws/supabase/gotrue:v2.170.0", "public.ecr.aws/supabase/realtime:v2.30.0"]),
    "ก. ลบเฉพาะ image ของ supabase ที่ไม่มีคอนเทนเนอร์ใช้ (postgres รันอยู่ · studio คอนเทนเนอร์หยุดอยู่อ้าง = คงไว้)", JSON.stringify(ลบ));
  ผล(!ลบ.some(n => !n.startsWith("public.ecr.aws/supabase/")), "ข. ไม่แตะ image ของโปรเจกต์อื่น (n8n · toolkit · minio · mysql · ecr อื่น · <none>)", JSON.stringify(ลบ));
  ผล(!r.คำสั่ง.some(ห้าม), "ค. ไม่เรียกคำสั่งลบทั้งเครื่อง/volume/บังคับลบ", JSON.stringify(r.คำสั่ง));
  ผล(r.คำสั่ง.filter(c => c.join(" ") === "builder prune -f").length === 1 && !r.คำสั่ง.some(c => c[0] === "builder" && c.join(" ") !== "builder prune -f"),
    "ง. ลบ build cache ด้วย builder prune -f ครั้งเดียว (ไม่มีตัวเลือก --all/อื่น)", JSON.stringify(r.คำสั่ง));
  ผล(/พื้นที่ว่างไดรฟ์ C: 82\.0 GB/.test(r.ออก) && !/เตือน/.test(r.ออก), "จ. พื้นที่ 82 GB = แปะตัวเลข ไม่เตือน", r.ออก);
}
// ง. ทดลอง
{
  const r = รัน(สถานะ, ["--dry-run"]);
  ผล(!r.คำสั่ง.some(c => (c[0] === "image" && c[1] === "rm") || c[0] === "builder"), "ง. --dry-run = ไม่ลบ image และไม่ลบ build cache", JSON.stringify(r.คำสั่ง));
  ผล(/\(ทดลอง\) จะลบ image public\.ecr\.aws\/supabase\/gotrue/.test(r.ออก), "ง. --dry-run บอกว่าจะลบอะไร", r.ออก);
}
// จ. พื้นที่น้อย
{
  const r = รัน(สถานะ, [], "25.4");
  ผล(r.status === 0 && /เตือน: ไดรฟ์ C ว่างเหลือ 25\.4 GB \(น้อยกว่า 30 GB\)/.test(r.ออก), "จ. พื้นที่ 25.4 GB (< 30) = เตือนชัด", r.ออก);
}
// จ. Docker ไม่ทำงาน / อ่านคอนเทนเนอร์ไม่ได้
{
  const r = รัน({ ...สถานะ, ล่ม: true });
  ผล(r.status === 0 && /ต่อ Docker ไม่ได้/.test(r.ออก) && r.คำสั่ง.length === 1, "จ. Docker ไม่ทำงาน = บอกแล้วจบ ไม่เรียกคำสั่งอื่น", JSON.stringify(r.คำสั่ง) + r.ออก);
  const p = รัน({ ...สถานะ, psพัง: true });
  ผล(!p.คำสั่ง.some(c => c[0] === "image" && c[1] === "rm") && /ไม่ลบ image/.test(p.ออก), "จ. อ่านรายการคอนเทนเนอร์ไม่ได้ = ไม่ลบ image (กันลบของที่ใช้อยู่)", JSON.stringify(p.คำสั่ง) + p.ออก);
}
// ฟังก์ชันคัดเลือกตรงตัว
{
  const { imageที่ลบได้ } = await import(new URL(`file:///${path.join(ราก, "scripts/post-deploy-docker-cleanup.mjs").replace(/\\/g, "/")}`).href);
  const ได้ = imageที่ลบได้([{ ชื่อ: "public.ecr.aws/supabase/x:1", id: "abcabcabcabc" }, { ชื่อ: "public.ecr.aws/supabase/y:1", id: "def" }], new Set(["sha256:abcabcabcabc" + "0".repeat(52)]));
  ผล(ได้.length === 1 && ได้[0].ชื่อ === "public.ecr.aws/supabase/y:1", "ก. เทียบรหัส image แบบยาว (sha256:…) กับแบบสั้นได้", JSON.stringify(ได้));
}

rmSync(ที่, { recursive: true, force: true });
console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
