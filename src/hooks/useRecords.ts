import { useCallback, useEffect, useMemo, useState } from "react";
import type { DailyRecord } from "@/lib/types";
import {
  apiEnabled,
  deleteRecordRemote,
  fetchLatestRemote,
  listRecordsRemote,
  upsertRecordRemote,
} from "@/lib/api";
import { deleteRecord as deleteLocal, loadRecords, upsertRecord as upsertLocal } from "@/lib/storage";

export function useRecords() {
  const remote = useMemo(() => apiEnabled(), []);
  const [records, setRecords] = useState<DailyRecord[]>(() => loadRecords());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!remote) {
      setRecords(loadRecords());
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const recs = await listRecordsRemote();
      // ensure sorted by date desc even if backend changes
      recs.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      // 仅展示 2026 年记录（不自动删除后端数据）
      const filtered = recs.filter((r) => typeof r?.date !== "string" || r.date.startsWith("2026-"));
      setRecords(filtered);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [remote]);

  useEffect(() => {
    // 远端模式启动后，自动用远端覆盖本地缓存
    refresh();
  }, [refresh]);

  const upsert = useCallback(
    async (rec: DailyRecord) => {
      if (!remote) {
        const out = upsertLocal(rec);
        setRecords(loadRecords());
        return out;
      }
      const out = await upsertRecordRemote(rec);
      await refresh();
      return out;
    },
    [remote, refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      if (!remote) {
        deleteLocal(id);
        setRecords(loadRecords());
        return;
      }
      await deleteRecordRemote(id);
      await refresh();
    },
    [remote, refresh]
  );

  const fetchLatest = useCallback(async () => {
    if (!remote) throw new Error("当前未配置后端 API（VITE_API_BASE）");
    const out = await fetchLatestRemote();
    await refresh();
    return out;
  }, [remote, refresh]);

  return {
    remote,
    records,
    loading,
    error,
    refresh,
    upsert,
    remove,
    fetchLatest,
  };
}
