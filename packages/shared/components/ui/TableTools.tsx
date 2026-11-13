"use client";

import { useEffect, useRef, useState, type JSX } from "react";
import { RotateCw, Rows3, Rows2, Columns3, Check } from "lucide-react";

export type Density = "comfortable" | "compact";
export type Col = { key: string; label: string };

/* ═══════════════════════════════════════════════════════════════════════
   useTableLayout — SSR-safe localStorage-backed layout state.
   Usage: const { density, setDensity, hiddenCols, toggleCol } = useTableLayout("leads");
═══════════════════════════════════════════════════════════════════════ */
type StoredLayout = { density: Density; hiddenCols: string[] };

function readLayout(storageKey: string): StoredLayout | null {
  if (typeof window === "undefined") return null; // SSR guard
  try {
    const raw = window.localStorage.getItem(`tabletools:${storageKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredLayout>;
    return {
      density: parsed.density === "compact" ? "compact" : "comfortable",
      hiddenCols: Array.isArray(parsed.hiddenCols)
        ? parsed.hiddenCols.filter((k): k is string => typeof k === "string")
        : [],
    };
  } catch {
    return null;
  }
}

function writeLayout(storageKey: string, layout: StoredLayout): void {
  if (typeof window === "undefined") return; // SSR guard
  try {
    window.localStorage.setItem(`tabletools:${storageKey}`, JSON.stringify(layout));
  } catch {
    /* quota / private-mode — fail silently */
  }
}

export function useTableLayout(storageKey: string): {
  density: Density;
  setDensity: (d: Density) => void;
  hiddenCols: string[];
  toggleCol: (key: string) => void;
  setHiddenCols: (keys: string[]) => void;
} {
  // Start from a deterministic default so server & first client render match.
  const [density, setDensityState] = useState<Density>("comfortable");
  const [hiddenCols, setHiddenColsState] = useState<string[]>([]);

  // Hydrate from localStorage after mount (avoids SSR hydration mismatch).
  useEffect(() => {
    const stored = readLayout(storageKey);
    if (stored) {
      setDensityState(stored.density);
      setHiddenColsState(stored.hiddenCols);
    }
  }, [storageKey]);

  const setDensity = (d: Density) => {
    setDensityState(d);
    writeLayout(storageKey, { density: d, hiddenCols });
  };

  const setHiddenCols = (keys: string[]) => {
    setHiddenColsState(keys);
    writeLayout(storageKey, { density, hiddenCols: keys });
  };

  const toggleCol = (key: string) => {
    const next = hiddenCols.includes(key)
      ? hiddenCols.filter((k) => k !== key)
      : [...hiddenCols, key];
    setHiddenColsState(next);
    writeLayout(storageKey, { density, hiddenCols: next });
  };

  return { density, setDensity, hiddenCols, toggleCol, setHiddenCols };
}

/* ═══════════════════════════════════════════════════════════════════════
   TableTools — right-aligned toolbar of CI-styled icon buttons.
   Styles live in globals.css under the `.tt-*` namespace.
═══════════════════════════════════════════════════════════════════════ */
export function TableTools(props: {
  storageKey: string;
  onRefresh?: () => void;
  columns?: Col[];
  hiddenCols?: string[];
  onToggleCol?: (key: string) => void;
  density: Density;
  onDensityChange: (d: Density) => void;
}): JSX.Element {
  const {
    storageKey,
    onRefresh,
    columns,
    hiddenCols = [],
    onToggleCol,
    density,
    onDensityChange,
  } = props;

  const [spinning, setSpinning] = useState(false);
  const [colsOpen, setColsOpen] = useState(false);
  const colsRef = useRef<HTMLDivElement>(null);

  // Click-outside to close the column dropdown.
  useEffect(() => {
    if (!colsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (colsRef.current && !colsRef.current.contains(e.target as Node)) setColsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [colsOpen]);

  const handleRefresh = () => {
    setSpinning(true);
    window.setTimeout(() => setSpinning(false), 600);
    onRefresh?.();
  };

  const nextDensity: Density = density === "comfortable" ? "compact" : "comfortable";

  return (
    <div className="tt-bar" data-storage-key={storageKey}>
      {/* Refresh */}
      {onRefresh && (
        <button
          type="button"
          className="tt-btn"
          onClick={handleRefresh}
          title="โหลดใหม่"
          aria-label="โหลดใหม่"
        >
          <RotateCw size={15} className={spinning ? "tt-spin" : undefined} />
        </button>
      )}

      {/* Density toggle */}
      <button
        type="button"
        className="tt-btn"
        onClick={() => onDensityChange(nextDensity)}
        title={density === "comfortable" ? "มุมมองกะทัดรัด" : "มุมมองสบายตา"}
        aria-label="สลับความหนาแน่นของตาราง"
        aria-pressed={density === "compact"}
      >
        {density === "comfortable" ? <Rows3 size={15} /> : <Rows2 size={15} />}
      </button>

      {/* Column settings */}
      {columns && columns.length > 0 && (
        <div className="tt-cols" ref={colsRef}>
          <button
            type="button"
            className={`tt-btn${colsOpen ? " tt-btn-active" : ""}`}
            onClick={() => setColsOpen((o) => !o)}
            title="ตั้งค่าคอลัมน์"
            aria-label="ตั้งค่าคอลัมน์"
            aria-haspopup="menu"
            aria-expanded={colsOpen}
          >
            <Columns3 size={15} />
          </button>

          {colsOpen && (
            <div className="tt-menu" role="menu">
              <div className="tt-menu-hd">คอลัมน์</div>
              {columns.map((c) => {
                const hidden = hiddenCols.includes(c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={!hidden}
                    className="tt-menu-item"
                    onClick={() => onToggleCol?.(c.key)}
                  >
                    <span className={`tt-check${hidden ? "" : " tt-check-on"}`}>
                      {!hidden && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className="tt-menu-label">{c.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
