import { listMicroAll, type MicroStockRow, listMicroDates } from "@/lib/microdb";

export type PoolRow = {
  code: string;
  name: string;
  topic?: string;
  latestDate: string;
  streak: number;
  maxAmountYi?: number;
  latestAmountYi?: number;
  latestPct?: number;
  // appearances in recent window
  recentAppear?: number;
};

function safeTopic(t?: string | null) {
  const s = String(t ?? "").trim();
  return s ? s : "未标注";
}

function computeStreak(arrAsc: MicroStockRow[], datesAsc: string[]) {
  if (!arrAsc.length) return 0;
  let streak = 1;
  for (let i = arrAsc.length - 1; i > 0; i--) {
    const dCur = arrAsc[i].date;
    const dPrev = arrAsc[i - 1].date;
    const idxCur = datesAsc.indexOf(dCur);
    const idxPrev = datesAsc.indexOf(dPrev);
    if (idxCur >= 0 && idxPrev >= 0 && idxCur - idxPrev === 1) streak += 1;
    else break;
  }
  return streak;
}

function countAppearInLastK(arrAsc: MicroStockRow[], lastKDates: Set<string>) {
  let c = 0;
  for (const r of arrAsc) if (lastKDates.has(r.date)) c += 1;
  return c;
}

/**
 * 返回两类池子：
 * - 中军池：最新(或峰值)成交额 >= 100亿 且 连续上榜>=minStreak
 * - 高标池：反复出现（近K日出现次数>=minAppear）或 连续上榜>=minStreakHigh 或 近似20cm(pct>=19)
 */
export async function buildLifePools(): Promise<{ midCore: PoolRow[]; highMark: PoolRow[]; all: PoolRow[]; latestDate?: string }> {
  // 固定口径：近 5 个交易日窗口
  const recentK = 5;
  // 固定口径：5日内出现次数 >= 2 视为“反复出现”
  const minAppear = 2;
  // 固定口径：百亿中军阈值
  const MIDCORE_AMT = 100;

  const rows = await listMicroAll();
  if (!rows.length) return { midCore: [], highMark: [], all: [] };

  const dates = await listMicroDates(); // asc
  if (!dates.length) return { midCore: [], highMark: [], all: [] };

  const latestDate = dates[dates.length - 1];
  const recentDates = new Set(dates.slice(Math.max(0, dates.length - recentK)));

  // group by code
  const byCode = new Map<string, MicroStockRow[]>();
  for (const r of rows) {
    const arr = byCode.get(r.code) ?? [];
    arr.push(r);
    byCode.set(r.code, arr);
  }

  const all: PoolRow[] = [];

  for (const [code, arr] of byCode.entries()) {
    arr.sort((a, b) => a.date.localeCompare(b.date)); // asc
    const latest = arr[arr.length - 1];

    const streak = computeStreak(arr, dates);
    const maxAmountYi = arr.reduce((m, r) => Math.max(m, r.amountYi ?? 0), 0) || undefined;
    const latestAmountYi = latest.amountYi;
    const recentAppear = countAppearInLastK(arr, recentDates);

    all.push({
      code,
      name: latest.name,
      topic: latest.topic ? safeTopic(latest.topic) : undefined,
      latestDate: latest.date,
      streak,
      maxAmountYi,
      latestAmountYi,
      latestPct: latest.pct,
      recentAppear,
    });
  }

  // 百亿中军：成交额>=100亿，且近5个交易日内出现次数>=2（反复出现才算“在内”）
  const midCore = all
    .filter((r) => ((r.latestAmountYi ?? 0) >= MIDCORE_AMT || (r.maxAmountYi ?? 0) >= MIDCORE_AMT) && (r.recentAppear ?? 0) >= minAppear)
    .sort(
      (a, b) =>
        ((b.recentAppear ?? 0) - (a.recentAppear ?? 0)) ||
        ((b.latestAmountYi ?? 0) - (a.latestAmountYi ?? 0)) ||
        (b.streak - a.streak) ||
        a.code.localeCompare(b.code)
    )
    .slice(0, 200);

  // 容量人气：非百亿，但近5个交易日内出现次数>=2
  const highMark = all
    .filter((r) => {
      const isMid = ((r.latestAmountYi ?? 0) >= MIDCORE_AMT || (r.maxAmountYi ?? 0) >= MIDCORE_AMT) && (r.recentAppear ?? 0) >= minAppear;
      if (isMid) return false;
      return (r.recentAppear ?? 0) >= minAppear;
    })
    .sort(
      (a, b) =>
        ((b.recentAppear ?? 0) - (a.recentAppear ?? 0)) ||
        ((b.latestAmountYi ?? 0) - (a.latestAmountYi ?? 0)) ||
        (b.streak - a.streak) ||
        a.code.localeCompare(b.code)
    )
    .slice(0, 200);

  return { midCore, highMark, all, latestDate };
}
