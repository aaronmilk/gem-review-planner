import type { DailyRecord } from "@/lib/types";

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

export function apiEnabled(): boolean {
  return getApiBase() !== null;
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBase();
  const url = base ? `${base}${path}` : path;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }
  return (await res.json()) as T;
}

export async function listRecordsRemote(): Promise<DailyRecord[]> {
  return http<DailyRecord[]>("/api/records");
}

export async function upsertRecordRemote(rec: DailyRecord): Promise<DailyRecord> {
  return http<DailyRecord>("/api/records", {
    method: "POST",
    body: JSON.stringify(rec),
  });
}

export async function deleteRecordRemote(id: string): Promise<void> {
  await http<{ ok: boolean }>(`/api/records/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchLatestRemote(): Promise<DailyRecord> {
  return http<DailyRecord>("/api/fetch/latest", { method: "POST" });
}
