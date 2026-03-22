import { listMicroByDate, listMicroDates } from "@/lib/microdb";

export type FocusTheme = { topic: string; count: number };

function safeTopic(t?: string | null) {
  const s = String(t ?? "").trim();
  return s ? s : "未标注";
}

/**
 * 日内重点题材：当天 micro 里出现次数 >= minCount 的题材。
 * 默认 minCount=2（“两三个或以上股票 topic 有重复”）。
 */
export async function deriveFocusThemesByDate(date: string, minCount = 2): Promise<FocusTheme[]> {
  const rows = await listMicroByDate(date);
  const m = new Map<string, number>();
  for (const r of rows) {
    const t = safeTopic(r.topic);
    m.set(t, (m.get(t) ?? 0) + 1);
  }
  return Array.from(m.entries())
    .filter(([topic, count]) => topic !== "未标注" && count >= minCount)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([topic, count]) => ({ topic, count }));
}

function overlapCount(a: string[], b: string[]) {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = new Set([...A, ...B]).size;
  return { inter, union, jaccard: union ? inter / union : 0 };
}

export type ThemeFocusSummary = {
  date: string;
  focusThemes: FocusTheme[]; // 当天重点题材（count>=2）
  focusTop?: FocusTheme | null;
  overlapT1?: { date: string; inter: number; union: number; jaccard: number } | null;
  overlapT3?: { date: string; inter: number; union: number; jaccard: number } | null;
  overlapT5?: { date: string; inter: number; union: number; jaccard: number } | null;
  drift: "强延续" | "几日反复活跃" | "漂移明显" | "无重点题材";
};

/**
 * 题材集中度（用户口径简化版）：
 * - 当天重点题材：count>=2 的题材集合
 * - 若重点题材在 T-1 继续出现 → 次日延续偏强
 * - 若在 T-3/T-5 仍反复出现 → 几日内反复活跃
 * - 若重叠度低且新面孔多 → 漂移明显
 */
export async function deriveThemeFocusSummary(date: string): Promise<ThemeFocusSummary> {
  const focus = await deriveFocusThemesByDate(date, 2);
  const focusTopics = focus.map((x) => x.topic);

  const dates = await listMicroDates(); // asc
  const idx = dates.indexOf(date);

  const pick = async (k: number) => {
    if (idx < 0) return null;
    const j = idx - k;
    if (j < 0) return null;
    const d = dates[j];
    if (!d) return null;
    const f = await deriveFocusThemesByDate(d, 2);
    return { date: d, topics: f.map((x) => x.topic) };
  };

  const t1 = await pick(1);
  const t3 = await pick(3);
  const t5 = await pick(5);

  const mk = (t: { date: string; topics: string[] } | null) => {
    if (!t) return null;
    const { inter, union, jaccard } = overlapCount(focusTopics, t.topics);
    return { date: t.date, inter, union, jaccard };
  };

  const o1 = mk(t1);
  const o3 = mk(t3);
  const o5 = mk(t5);

  // 漂移判定（偏实战解释，不追求数学完美）
  let drift: ThemeFocusSummary["drift"] = "漂移明显";
  if (!focus.length) drift = "无重点题材";
  else if ((o1?.inter ?? 0) > 0) drift = "强延续";
  else if ((o3?.inter ?? 0) > 0 || (o5?.inter ?? 0) > 0) drift = "几日反复活跃";
  else drift = "漂移明显";

  return {
    date,
    focusThemes: focus,
    focusTop: focus[0] ?? null,
    overlapT1: o1,
    overlapT3: o3,
    overlapT5: o5,
    drift,
  };
}
