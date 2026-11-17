// ── ล้างของ Docker ของ PMS หลังขึ้นเว็บทุกครั้ง (บอสสั่ง 17 พ.ย. 69 · คนรวมงานรันหลัง push + เว็บตอบปกติ) ─────────────────────────
//   ① ลบ build cache: docker builder prune -f (cache ของการ build เท่านั้น · ไม่แตะคอนเทนเนอร์/volume/image)
//   ② ลบ image เก่าของ PMS ตามชื่อ: เฉพาะ public.ecr.aws/supabase/* ที่ไม่มีคอนเทนเนอร์ใดใช้ (ทั้งที่รันอยู่และหยุดอยู่)
//      ลบทีละตัวด้วย docker image rm <ชื่อ:แท็ก> (ไม่มี -f · ถ้า Docker ไม่ยอม = บอกแล้วไปต่อ)
//   ③ พิมพ์พื้นที่ว่างไดรฟ์ C · ว่างน้อยกว่า 30 GB = ข้อความเตือนชัด (exit 0 เหมือนเดิม — คำเตือนไม่ใช่ความล้มเหลวของการล้าง)
//   ⛔ ห้ามเด็ดขาด (บอสสั่ง · ตัวตรวจในข้อทดสอบ): docker system prune · volume prune/rm · image prune · ลบ image/คอนเทนเนอร์/volume ของโปรเจกต์อื่น
//      (nca-toolkit · miniio · architects-toolkit-main_* · n8n* · mysql · minio · stephengpope · file-benjamintomail_db_data ฯลฯ)
//   ใช้: node scripts/post-deploy-docker-cleanup.mjs [--dry-run]   (--dry-run = บอกว่าจะลบอะไร ไม่ลบจริง)
//   ตั้งค่าทดสอบ: PMS_DOCKER_BIN = ตัว docker จำลอง (.mjs = รันด้วย node) · PMS_FAKE_FREE_GB = พื้นที่ว่างจำลอง (GB)
//   ข้อทดสอบ: tests/tools/post-deploy-docker-cleanup.test.mjs (docker จำลอง · ไม่แตะ Docker จริง)
import { spawnSync } from "node:child_process";
import { statfsSync } from "node:fs";

export const ต้นชื่อimagePMS = "public.ecr.aws/supabase/";
export const เกณฑ์เตือนGB = 30;
const ทดลอง = process.argv.includes("--dry-run");

const ตัวdocker = process.env.PMS_DOCKER_BIN || "docker";
function docker(...args) {
  const [cmd, pre] = /\.m?js$/i.test(ตัวdocker) ? [process.execPath, [ตัวdocker]] : [ตัวdocker, []];
  const r = spawnSync(cmd, [...pre, ...args], { encoding: "utf8", maxBuffer: 64 << 20 });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() || (r.error?.message ?? "") };
}

/** image ของ PMS ที่ลบได้: ชื่อขึ้นต้น public.ecr.aws/supabase/ และไม่มีคอนเทนเนอร์ใช้ (เทียบทั้งรหัส image และชื่อ:แท็ก)
 *  @param {{ ชื่อ: string, id: string }[]} images @param {Set<string>} ใช้อยู่ (รหัส image แบบสั้น/ยาว + ชื่อ:แท็กที่คอนเทนเนอร์อ้าง) */
export function imageที่ลบได้(images, ใช้อยู่) {
  const สั้น = (id) => id.replace(/^sha256:/, "").slice(0, 12);
  const ใช้สั้น = new Set([...ใช้อยู่].map(x => (/^(sha256:)?[0-9a-f]{12,64}$/.test(x) ? สั้น(x) : x)));
  return images.filter(i => i.ชื่อ.startsWith(ต้นชื่อimagePMS) && !i.ชื่อ.endsWith(":<none>")
    && !ใช้สั้น.has(สั้น(i.id)) && !ใช้สั้น.has(i.ชื่อ));
}

function หลัก() {
  // ตรวจว่ามี Docker ทำงานก่อน — ไม่ทำงาน = บอกแล้วจบ (ไม่ใช่ความผิดของการขึ้นเว็บ)
  const ver = docker("version", "--format", "{{.Server.Version}}");
  if (!ver.ok) { console.error(`⚠️ ต่อ Docker ไม่ได้ — ไม่ได้ล้างอะไร (${ver.err.split(/\r?\n/)[0]})`); พื้นที่(); process.exit(0); }

  // ① build cache
  if (ทดลอง) console.log("• (ทดลอง) จะลบ build cache: docker builder prune -f");
  else {
    const p = docker("builder", "prune", "-f");
    const คืน = /Total reclaimed space:\s*(.+)$/m.exec(p.out)?.[1] ?? "—";
    console.log(p.ok ? `✓ ลบ build cache แล้ว · คืนพื้นที่ ${คืน}` : `⚠️ ลบ build cache ไม่สำเร็จ: ${p.err.split(/\r?\n/)[0]}`);
  }

  // ② image เก่าของ PMS ที่ไม่มีคอนเทนเนอร์ใช้
  const ls = docker("image", "ls", "--format", "{{.Repository}}:{{.Tag}}|{{.ID}}");
  if (!ls.ok) { console.error(`⚠️ อ่านรายการ image ไม่ได้ — ไม่ลบ image (${ls.err.split(/\r?\n/)[0]})`); พื้นที่(); return; }
  const images = ls.out.split(/\r?\n/).filter(Boolean).map(l => { const [ชื่อ, id] = l.split("|"); return { ชื่อ, id: id ?? "" }; });
  const ids = docker("ps", "-aq");
  if (!ids.ok) { console.error(`⚠️ อ่านรายการคอนเทนเนอร์ไม่ได้ — ไม่ลบ image (กันลบของที่ใช้อยู่) (${ids.err.split(/\r?\n/)[0]})`); พื้นที่(); return; }
  const ใช้อยู่ = new Set();
  const รายคอนเทนเนอร์ = ids.out.split(/\r?\n/).filter(Boolean);
  if (รายคอนเทนเนอร์.length) {
    const ins = docker("inspect", "--format", "{{.Image}}|{{.Config.Image}}", ...รายคอนเทนเนอร์);
    if (!ins.ok) { console.error(`⚠️ อ่าน image ที่คอนเทนเนอร์ใช้ไม่ได้ — ไม่ลบ image (${ins.err.split(/\r?\n/)[0]})`); พื้นที่(); return; }
    for (const l of ins.out.split(/\r?\n/).filter(Boolean)) for (const x of l.split("|")) if (x) ใช้อยู่.add(x);
  }
  const ลบได้ = imageที่ลบได้(images, ใช้อยู่);
  const ข้ามเพราะใช้อยู่ = images.filter(i => i.ชื่อ.startsWith(ต้นชื่อimagePMS)).length - ลบได้.length;
  if (!ลบได้.length) console.log(`✓ ไม่มี image เก่าของ PMS ให้ลบ (ของ PMS ที่คอนเทนเนอร์ใช้อยู่ ${ข้ามเพราะใช้อยู่} ตัว · ไม่แตะ image ของโปรเจกต์อื่น)`);
  let ลบแล้ว = 0;
  for (const i of ลบได้) {
    if (ทดลอง) { console.log(`• (ทดลอง) จะลบ image ${i.ชื่อ}`); continue; }
    const r = docker("image", "rm", i.ชื่อ);
    if (r.ok) { ลบแล้ว++; console.log(`✓ ลบ image ${i.ชื่อ}`); } else console.log(`⚠️ ลบ image ${i.ชื่อ} ไม่ได้ — ${r.err.split(/\r?\n/)[0]}`);
  }
  if (ลบได้.length && !ทดลอง) console.log(`✓ ลบ image เก่าของ PMS ${ลบแล้ว}/${ลบได้.length} ตัว · คงไว้ (คอนเทนเนอร์ใช้อยู่) ${ข้ามเพราะใช้อยู่} ตัว`);
  พื้นที่();
}

/** ③ พื้นที่ว่างไดรฟ์ C */
function พื้นที่() {
  let ว่าง;
  if (process.env.PMS_FAKE_FREE_GB) ว่าง = Number(process.env.PMS_FAKE_FREE_GB);
  else { try { const s = statfsSync("C:\\"); ว่าง = (s.bavail * s.bsize) / 1024 ** 3; } catch (e) { console.log(`⚠️ อ่านพื้นที่ไดรฟ์ C ไม่ได้ (${e.message})`); return; } }
  console.log(`พื้นที่ว่างไดรฟ์ C: ${ว่าง.toFixed(1)} GB`);
  if (ว่าง < เกณฑ์เตือนGB) console.log(`⚠️⚠️ เตือน: ไดรฟ์ C ว่างเหลือ ${ว่าง.toFixed(1)} GB (น้อยกว่า ${เกณฑ์เตือนGB} GB) — แจ้งบอส · Docker/รอบตรวจอาจล้มเพราะดิสก์เต็ม`);
}

if (process.argv[1] && /post-deploy-docker-cleanup\.mjs$/.test(process.argv[1].replace(/\\/g, "/"))) หลัก();
