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

// ========== Supabase Remote API ==========

function normalizeBase(base: string) {
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

export function getApiBase(): string | null {
  const envBase = (import.meta as any).env?.VITE_API_BASE as string | undefined;
  if (envBase && envBase.trim()) return normalizeBase(envBase.trim());

  // Same-origin fallback（适合前后端走同一域名反代的场景）
  // Zeabur 若未配置反代，建议显式设置 VITE_API_BASE
  return null;
}

export function getSupabaseAnonKey(): string {
  return (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string || "";
}

export function apiEnabled(): boolean {
  return getApiBase() !== null;
}

// 转换蛇形命名到驼峰
function snakeToCamel(r: any): DailyRecord {
  return {
    id: r.id,
    date: r.date,
    overlapRatio: r.overlap_ratio,
    core100Count: r.core100_count,
    resonance: r.resonance,
    microStructure: r.micro_structure,
    anomalySignal: r.anomaly_signal,
    nextJudgement: r.next_judgement,
    action: r.action,
    n: r.n ?? 0,
    stage: r.stage,
    limitUp20Count: r.limit_up_20_count,
    limitUp20Share: r.limit_up_20_share,
    signals: r.signals,
    primarySignalId: r.primary_signal_id,
    meanAmtYi: r.mean_amt_yi,
    medianAmtYi: r.median_amt_yi,
    iceDragon: r.ice_dragon,
    midCoreMeanAmtYi: r.mid_core_mean_amt_yi,
    midCoreMedianAmtYi: r.mid_core_median_amt_yi,
    themes: r.themes,
    notes: r.notes,
    nextPlan: r.next_plan,
    updatedAt: r.updated_at,
  };
}

// 转换驼峰到蛇形
function camelToSnake(rec: DailyRecord): any {
  return {
    id: rec.id,
    date: rec.date,
    overlap_ratio: rec.overlapRatio,
    core100_count: rec.core100Count,
    resonance: rec.resonance,
    micro_structure: rec.microStructure,
    anomaly_signal: rec.anomalySignal,
    next_judgement: rec.nextJudgement,
    action: rec.action,
    n: rec.n,
    stage: rec.stage,
    limit_up_20_count: rec.limitUp20Count,
    limit_up_20_share: rec.limitUp20Share,
    signals: rec.signals,
    primary_signal_id: rec.primarySignalId,
    mean_amt_yi: rec.meanAmtYi,
    median_amt_yi: rec.medianAmtYi,
    ice_dragon: rec.iceDragon,
    mid_core_mean_amt_yi: rec.midCoreMeanAmtYi,
    mid_core_median_amt_yi: rec.midCoreMedianAmtYi,
    themes: rec.themes,
    notes: rec.notes,
    next_plan: rec.nextPlan,
    updated_at: rec.updatedAt,
  };
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBase();
  const anonKey = getSupabaseAnonKey();
  const url = base ? `${base}${path}` : path;

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "apikey": anonKey,
      "Authorization": `Bearer ${anonKey}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }
  // DELETE 请求可能返回空 body
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return {} as T;
  }
  return (await res.json()) as T;
}

export async function listRecordsRemote(): Promise<DailyRecord[]> {
  // Supabase: GET /rest/v1/records?order=date.desc,updated_at.desc
  const data = await http<any[]>("/records?order=date.desc&order=updated_at.desc");
  return data.map(snakeToCamel);
}

export async function upsertRecordRemote(rec: DailyRecord): Promise<DailyRecord> {
  // Supabase: POST /records (upsert with resolution=merge-duplicates)
  return http<DailyRecord>("/records", {
    method: "POST",
    body: JSON.stringify(camelToSnake(rec)),
    headers: {
      "Prefer": "resolution=merge-duplicates",
    },
  });
}

export async function deleteRecordRemote(id: string): Promise<void> {
  await http<{ ok: boolean }>(`/records?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchLatestRemote(): Promise<DailyRecord> {
  // Supabase 不支持服务端 fetch latest，这里返回最新一条记录
  const data = await http<any[]>("/records?order=date.desc&limit=1");
  if (!data || data.length === 0) {
    throw new Error("No records found");
  }
  return snakeToCamel(data[0]);
}
