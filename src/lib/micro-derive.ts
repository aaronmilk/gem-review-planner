import { findPrevMicroDate, listMicroByDate } from "@/lib/microdb";

export type DerivedMacroFromMicro = {
  date: string;
  n: number;
  overlapRatio: number | null; // 0-1
  core100Count: number;
  resonance: boolean;
  topTopic?: { topic: string; count: number; ratio: number } | null;
  topicConcentration: number | null; // 0-1, topTopic.count / n
  microStructure: string; // 人类可读的结构判定
};

function safeTopic(t?: string | null) {
  const s = String(t ?? "").trim();
  return s ? s : "未标注";
}

function pctIs20cm(pct?: number | null) {
  if (pct === undefined || pct === null || !Number.isFinite(pct)) return false;
  // 近似：创业板 20cm 涨停通常约 19.8%~20.0%，用 19 作为宽松阈值
  return pct >= 19;
}

export async function deriveMacroFromMicroDate(date: string): Promise<DerivedMacroFromMicro> {
  const rows = await listMicroByDate(date);
  const n = rows.length;

  const prevDate = await findPrevMicroDate(date);
  const prevRows = prevDate ? await listMicroByDate(prevDate) : [];

  const todayCodes = new Set(rows.map((r) => r.code));
  const prevCodes = new Set(prevRows.map((r) => r.code));
  let overlap = 0;
  for (const c of todayCodes) if (prevCodes.has(c)) overlap += 1;
  const overlapRatio = n ? overlap / n : null;

  const core100 = rows.filter((r) => (r.amountYi ?? 0) >= 100).length;

  // 容弹共振：
  // - 至少 1 只百亿中军
  // - 同日存在弹性侧（用 pct>=19 近似 20cm 涨停）
  // - 若题材字段存在：优先判断“同题材共振”，否则退化为“同日共存”
  const elasticRows = rows.filter((r) => pctIs20cm(r.pct));
  const hasElastic = elasticRows.length > 0;

  let resonance = false;
  if (core100 > 0 && hasElastic) {
    const coreTopics = new Set(rows.filter((r) => (r.amountYi ?? 0) >= 100).map((r) => safeTopic(r.topic)));
    const elasticTopics = new Set(elasticRows.map((r) => safeTopic(r.topic)));
    // 若题材都未标注，则 set 里可能只有“未标注”，此时仍允许共振成立
    for (const t of elasticTopics) {
      if (coreTopics.has(t)) {
        resonance = true;
        break;
      }
    }
    if (!resonance && coreTopics.size === 1 && coreTopics.has("未标注")) resonance = true;
  }

  // 题材集中度：topTopic.count/n
  const topicCount = new Map<string, number>();
  for (const r of rows) {
    const t = safeTopic(r.topic);
    topicCount.set(t, (topicCount.get(t) ?? 0) + 1);
  }
  let topTopic: { topic: string; count: number; ratio: number } | null = null;
  for (const [topic, count] of topicCount.entries()) {
    if (!topTopic || count > topTopic.count) topTopic = { topic, count, ratio: n ? count / n : 0 };
  }
  const topicConcentration = n && topTopic ? topTopic.count / n : null;

  // 微观结构判定（可按你后续口径继续细化）：
  // - 无中军 & 无粘性：电风扇轮动
  // - 有中军 & 粘性>=20%：主线确立（真主升）
  // - 有中军但粘性不足：结构性机会（分化）
  // - 无中军但粘性较高：无量抱团（小票抱团）
  const sticky = overlapRatio !== null && overlapRatio >= 0.2;
  const hasCore = core100 > 0;
  let microStructure = "—";
  if (!hasCore && !sticky) microStructure = "无主线轮动（电风扇）";
  else if (hasCore && sticky) microStructure = resonance ? "主线确立（容弹共振）" : "主线确立（高粘性+中军承载）";
  else if (hasCore && !sticky) microStructure = "结构性机会（有中军但粘性不足）";
  else if (!hasCore && sticky) microStructure = "无量抱团（小票粘性）";

  return {
    date,
    n,
    overlapRatio,
    core100Count: core100,
    resonance,
    topTopic,
    topicConcentration,
    microStructure,
  };
}
