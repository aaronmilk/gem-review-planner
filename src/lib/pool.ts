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
};

function safeTopic(t?: string | null) {
  const s = String(t ?? "").trim();
  return s ? s : "未标注";
}

export async function buildPool(minAmountYi = 50, minStreak = 2): Promise<PoolRow[]> {
  const rows = await listMicroAll();
  if (!rows.length) return [];

  const dates = await listMicroDates();
  if (!dates.length) return [];

  // group by code
  const byCode = new Map<string, MicroStockRow[]>();
  for (const r of rows) {
    const arr = byCode.get(r.code) ?? [];
    arr.push(r);
    byCode.set(r.code, arr);
  }

  const out: PoolRow[] = [];

  for (const [code, arr] of byCode.entries()) {
    arr.sort((a, b) => a.date.localeCompare(b.date)); // asc

    // compute last streak (consecutive in imported date sequence)
    let streak = 1;
    for (let i = arr.length - 1; i > 0; i--) {
      const dCur = arr[i].date;
      const dPrev = arr[i - 1].date;
      const idxCur = dates.indexOf(dCur);
      const idxPrev = dates.indexOf(dPrev);
      if (idxCur >= 0 && idxPrev >= 0 && idxCur - idxPrev === 1) streak += 1;
      else break;
    }

    const latest = arr[arr.length - 1];
    const maxAmountYi = arr.reduce((m, r) => Math.max(m, r.amountYi ?? 0), 0) || undefined;
    const latestAmountYi = latest.amountYi;

    // pool condition
    const okAmount = (latestAmountYi ?? 0) >= minAmountYi || (maxAmountYi ?? 0) >= minAmountYi;
    const okStreak = streak >= minStreak;
    if (!okAmount || !okStreak) continue;

    out.push({
      code,
      name: latest.name,
      topic: latest.topic ? safeTopic(latest.topic) : undefined,
      latestDate: latest.date,
      streak,
      maxAmountYi,
      latestAmountYi,
      latestPct: latest.pct,
    });
  }

  out.sort((a, b) => (b.streak - a.streak) || ((b.latestAmountYi ?? 0) - (a.latestAmountYi ?? 0)) || a.code.localeCompare(b.code));
  return out.slice(0, 200);
}
