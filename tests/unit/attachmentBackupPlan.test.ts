import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
// @ts-expect-error — ไฟล์ .mjs ของเครื่องมือ (ไม่มีชนิดข้อมูล)
import { วางแผน, หาชุดก่อน, sha256, ชื่อบนดิสก์, โฟลเดอร์ไฟล์แนบ } from "../../scripts/lib/attachmentBackup.mjs";

// ── สำรองไฟล์แนบแบบดาวน์โหลดเฉพาะไฟล์ใหม่/เปลี่ยน (บอสเลือกทาง 3 · ข้อ 8 · 18 พ.ย. 69) ──
const ไฟล์ = (name: string, extra: Record<string, unknown> = {}) => ({
  bucket: "dealer-files", name, id: `id-${name}`, updated_at: "2026-11-18T00:00:00Z", size: 5, etag: `"e-${name}"`, ...extra });
const ก่อน = (o: ReturnType<typeof ไฟล์>, เนื้อ: string) => ({ ...o, sha256: sha256(Buffer.from(เนื้อ)), file: ชื่อบนดิสก์(o.bucket, o.name) });

describe("วางแผน", () => {
  const ชุด = { dir: "/ชุดก่อน", manifest: { files: [ก่อน(ไฟล์("a"), "AAAAA"), ก่อน(ไฟล์("b"), "BBBBB")] } };
  const อ่าน = (เนื้อ: Record<string, string>) => (f: string) => {
    const k = Object.keys(เนื้อ).find((n) => f.endsWith(ชื่อบนดิสก์("dealer-files", n)));
    return k ? Buffer.from(เนื้อ[k]) : null;
  };
  it("ไม่มีชุดก่อน = ดาวน์โหลดทุกไฟล์", () => {
    const p = วางแผน([ไฟล์("a")], null);
    expect(p.คัดลอก).toEqual([]);
    expect(p.ดาวน์โหลด.map((x: { name: string; เหตุ: string }) => [x.name, x.เหตุ])).toEqual([["a", "ใหม่"]]);
  });
  it("ไม่เปลี่ยน + ไฟล์ชุดก่อนตรง sha256 = คัดลอก · ไฟล์ใหม่ = ดาวน์โหลด", () => {
    const p = วางแผน([ไฟล์("a"), ไฟล์("c")], ชุด, อ่าน({ a: "AAAAA" }));
    expect(p.คัดลอก.map((x: { name: string }) => x.name)).toEqual(["a"]);
    expect(p.คัดลอก[0].จาก).toBe(path.join("/ชุดก่อน", โฟลเดอร์ไฟล์แนบ, ชื่อบนดิสก์("dealer-files", "a")));
    expect(p.ดาวน์โหลด.map((x: { name: string; เหตุ: string }) => [x.name, x.เหตุ])).toEqual([["c", "ใหม่"]]);
  });
  it.each([["updated_at", "2026-11-18T01:00:00Z"], ["size", 6], ["etag", '"อื่น"'], ["id", "id-ใหม่"]])(
    "%s เปลี่ยน = ดาวน์โหลด (เหตุ เปลี่ยน)", (ช่อง, ค่า) => {
      const p = วางแผน([ไฟล์("a", { [ช่อง]: ค่า })], ชุด, อ่าน({ a: "AAAAA" }));
      expect(p.คัดลอก).toEqual([]);
      expect(p.ดาวน์โหลด[0].เหตุ).toBe("เปลี่ยน");
    });
  it("ไฟล์ในชุดก่อนเสีย (sha256 ไม่ตรง) หรือหาย = ดาวน์โหลด", () => {
    const p = วางแผน([ไฟล์("a"), ไฟล์("b")], ชุด, อ่าน({ a: "เสีย" }));
    expect(p.คัดลอก).toEqual([]);
    expect(p.ดาวน์โหลด.map((x: { เหตุ: string }) => x.เหตุ)).toEqual(["ไฟล์ชุดก่อนเสีย/หาย", "ไฟล์ชุดก่อนเสีย/หาย"]);
  });
});

describe("หาชุดก่อน", () => {
  let ฐาน = "";
  afterEach(() => { if (ฐาน) rmSync(ฐาน, { recursive: true, force: true }); });
  const ชุด = (ชื่อ: string, m: Record<string, unknown>) => {
    mkdirSync(path.join(ฐาน, ชื่อ, โฟลเดอร์ไฟล์แนบ), { recursive: true });
    writeFileSync(path.join(ฐาน, ชื่อ, โฟลเดอร์ไฟล์แนบ, "manifest.json"), JSON.stringify(m));
  };
  it("เลือกชุดล่าสุดที่ครบ จากต้นทางเดียวกัน · ไม่นับชุดที่ไม่ครบ/คนละต้นทาง/ชุดที่กำลังทำ", () => {
    ฐาน = mkdtempSync(path.join(os.tmpdir(), "pms-attach-plan-"));
    ชุด("1", { at: "2026-11-16T00:00:00Z", source: "S", ครบ: true, files: [] });
    ชุด("2", { at: "2026-11-17T00:00:00Z", source: "S", ครบ: true, files: [] });
    ชุด("3", { at: "2026-11-17T06:00:00Z", source: "S", ครบ: false, files: [] });
    ชุด("4", { at: "2026-11-17T07:00:00Z", source: "อื่น", ครบ: true, files: [] });
    ชุด("5", { at: "2026-11-18T00:00:00Z", source: "S", ครบ: true, files: [] });
    mkdirSync(path.join(ฐาน, "ไม่มีไฟล์แนบ"));
    expect(path.basename(หาชุดก่อน(ฐาน, path.join(ฐาน, "5"), "S").dir)).toBe("2");
    expect(หาชุดก่อน(ฐาน, path.join(ฐาน, "5"), "ไม่มี")).toBeNull();
    expect(หาชุดก่อน(path.join(ฐาน, "ไม่มีโฟลเดอร์นี้"), "x", "S")).toBeNull();
  });
});
