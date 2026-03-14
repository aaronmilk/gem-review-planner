import type { Stage, Thresholds } from "@/lib/types";

export function calcStage(n: number, t: Thresholds): Stage {
  if (Number.isNaN(n)) return "冰点";
  if (n <= t.p25) return "冰点";
  if (n <= t.p50) return "回暖";
  if (n <= t.p75) return "主升";
  if (n < t.p90) return "高潮";
  return "极致";
}

export function formatPct(x?: number) {
  if (x === undefined || x === null || Number.isNaN(x)) return "—";
  return `${(x * 100).toFixed(1)}%`;
}

export function formatYi(x?: number) {
  if (x === undefined || x === null || Number.isNaN(x)) return "—";
  return `${x.toFixed(2)}亿`;
}
