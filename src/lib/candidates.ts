import { findPrevMicroDate, listMicroByDate } from "@/lib/microdb";

export type CandidateLists = {
  date: string;
  prevDate?: string | null;
  nMicro: number;
  overlapRatio: number | null;
  stickyTop: { code: string; name: string; amountYi?: number; topic?: string; streak?: number }[];
  core100: { code: string; name: string; amountYi?: number; topic?: string }[];
  elastic: { code: string; name: string; pct?: number; amountYi?: number; topic?: string }[];
  topTopic?: { topic: string; count: number; ratio: number } | null;
};

function safeTopic(t?: string | null) {
  const s = String(t ?? "").trim();
  return s ? s : "未标注";
}

function pctIs20cm(pct?: number | null) {
  if (pct === undefined || pct === null || !Number.isFinite(pct)) return false;
  return pct >= 19;
}

export async function buildCandidateLists(date: string): Promise<CandidateLists> {
  const rows = await listMicroByDate(date);
  const nMicro = rows.length;

  const prevDate = await findPrevMicroDate(date);
  const prevRows = prevDate ? await listMicroByDate(prevDate) : [];
  const prevCodes = new Set(prevRows.map((r) => r.code));

  // overlap + sticky top
  const overlapRows = rows.filter((r) => prevCodes.has(r.code));
  const overlapRatio = nMicro ? overlapRows.length / nMicro : null;

  const stickyTop = overlapRows
    .slice()
    .sort((a, b) => (b.amountYi ?? 0) - (a.amountYi ?? 0))
    .slice(0, 5)
    .map((r) => ({ code: r.code, name: r.name, amountYi: r.amountYi, topic: r.topic }));

  const core100 = rows
    .filter((r) => (r.amountYi ?? 0) >= 100)
    .slice()
    .sort((a, b) => (b.amountYi ?? 0) - (a.amountYi ?? 0))
    .slice(0, 5)
    .map((r) => ({ code: r.code, name: r.name, amountYi: r.amountYi, topic: r.topic }));

  const elastic = rows
    .filter((r) => pctIs20cm(r.pct))
    .slice()
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
    .slice(0, 8)
    .map((r) => ({ code: r.code, name: r.name, pct: r.pct, amountYi: r.amountYi, topic: r.topic }));

  // top topic
  const topicCount = new Map<string, number>();
  for (const r of rows) {
    const t = safeTopic(r.topic);
    topicCount.set(t, (topicCount.get(t) ?? 0) + 1);
  }
  let topTopic: { topic: string; count: number; ratio: number } | null = null;
  for (const [topic, count] of topicCount.entries()) {
    if (!topTopic || count > topTopic.count) topTopic = { topic, count, ratio: nMicro ? count / nMicro : 0 };
  }

  return { date, prevDate, nMicro, overlapRatio, stickyTop, core100, elastic, topTopic };
}
