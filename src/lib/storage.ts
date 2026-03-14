import { nanoid } from "nanoid";
import type { DailyRecord, Thresholds } from "@/lib/types";
import { DEFAULT_THRESHOLDS } from "@/lib/types";
import { normalizeYmd } from "@/lib/date";

const KEY_RECORDS = "gem_review_records_v1";
const KEY_THRESHOLDS = "gem_review_thresholds_v1";

export function loadThresholds(): Thresholds {
  try {
    const raw = localStorage.getItem(KEY_THRESHOLDS);
    if (!raw) return DEFAULT_THRESHOLDS;
    const obj = JSON.parse(raw);
    return {
      p25: Number(obj.p25 ?? DEFAULT_THRESHOLDS.p25),
      p50: Number(obj.p50 ?? DEFAULT_THRESHOLDS.p50),
      p75: Number(obj.p75 ?? DEFAULT_THRESHOLDS.p75),
      p90: Number(obj.p90 ?? DEFAULT_THRESHOLDS.p90),
    };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

export function saveThresholds(t: Thresholds) {
  localStorage.setItem(KEY_THRESHOLDS, JSON.stringify(t));
}

export function loadRecords(): DailyRecord[] {
  try {
    const raw = localStorage.getItem(KEY_RECORDS);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];

    // normalize legacy date formats then keep sorted by date desc
    const out = arr.map((r: any) => {
      const date = typeof r?.date === "string" ? normalizeYmd(r.date) : r?.date;
      return { ...r, date };
    });

    out.sort((a: any, b: any) => String(b?.date || "").localeCompare(String(a?.date || "")));

    // 仅保留 2026 年的日度记录（YYYY-MM-DD）。其他年份数据会被自动清理。
    const filtered = out.filter((r: any) => {
      const d = r?.date;
      if (typeof d !== "string") return true;
      // normalizeYmd 之后应为 YYYY-MM-DD；直接按前缀判断
      return d.startsWith("2026-");
    });
    if (filtered.length !== out.length) {
      localStorage.setItem(KEY_RECORDS, JSON.stringify(filtered));
    }
    return filtered;
  } catch {
    return [];
  }
}

export function saveRecords(records: DailyRecord[]) {
  localStorage.setItem(KEY_RECORDS, JSON.stringify(records));
}

export function upsertRecord(partial: Omit<DailyRecord, "id" | "updatedAt"> & { id?: string }) {
  const records = loadRecords();
  const now = Date.now();
  const id = partial.id ?? nanoid();

  const normalizedDate = partial.date ? normalizeYmd(partial.date) : partial.date;

  const next: DailyRecord = {
    ...(records.find((r) => r.id === id) ?? ({} as DailyRecord)),
    ...partial,
    date: (normalizedDate ?? partial.date) as string,
    id,
    updatedAt: now,
  };

  const idx = records.findIndex((r) => r.id === id);
  const out = idx >= 0 ? records.map((r) => (r.id === id ? next : r)) : [next, ...records];
  // keep sorted by date desc when possible
  out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  saveRecords(out);
  return next;
}

export function deleteRecord(id: string) {
  const records = loadRecords().filter((r) => r.id !== id);
  saveRecords(records);
}

export function exportJson(): string {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    thresholds: loadThresholds(),
    records: loadRecords(),
  };
  return JSON.stringify(payload, null, 2);
}

export function importJson(raw: string) {
  const obj = JSON.parse(raw);
  if (obj?.thresholds) saveThresholds(obj.thresholds);
  if (Array.isArray(obj?.records)) saveRecords(obj.records);
}
