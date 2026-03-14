function stripBom(s: string) {
  return s.replace(/^\uFEFF/, "");
}

function parseYi(text: string): number | null {
  const t = String(text ?? "").trim();
  if (!t) return null;
  const m = t.match(/([-+]?\d*\.?\d+)\s*亿/);
  if (m) return Number(m[1]);
  const asNum = Number(t);
  return Number.isFinite(asNum) ? asNum : null;
}

function parseNumber(text: string): number | null {
  const t = String(text ?? "").trim();
  if (!t) return null;
  const asNum = Number(t);
  return Number.isFinite(asNum) ? asNum : null;
}

export type ImportedDailyAgg = {
  date: string; // YYYY-MM-DD
  n: number;
  meanAmtYi?: number;
  medianAmtYi?: number;
  midCoreMeanAmtYi?: number;
  midCoreMedianAmtYi?: number;
  limitUp20Count?: number;
  limitUp20Share?: number;

  // Report macro/micro factors
  overlapRatio?: number; // 0-1
  core100Count?: number;
  resonance?: boolean;
  microStructure?: string;
  anomalySignal?: string;
  nextJudgement?: string;
  action?: string;
};

/**
 * 兼容两种 CSV：
 * 1) 入选明细（多行）：必须含「日期」「成交额」列，按日期聚合算 n/均值/中位。
 * 2) 日度汇总（每行=1天）：必须含 date/日期 + n，可选 mean/median/midCore 列。
 */
export function parseSignalCsv(text: string): ImportedDailyAgg[] {
  const raw = stripBom(text);
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((s) => s.trim());

  // --- Case B: 日度汇总 CSV ---
  const idxDate2 = header.indexOf("date") >= 0 ? header.indexOf("date") : header.indexOf("日期");
  const idxN = header.indexOf("n") >= 0 ? header.indexOf("n") : header.indexOf("N");
  const idxMean = header.indexOf("meanAmtYi") >= 0 ? header.indexOf("meanAmtYi") : header.indexOf("平均成交额");
  const idxMedian = header.indexOf("medianAmtYi") >= 0 ? header.indexOf("medianAmtYi") : header.indexOf("中位数成交额");
  const idxMidMean = header.indexOf("midCoreMeanAmtYi");
  const idxMidMedian = header.indexOf("midCoreMedianAmtYi");
  const idxLu = header.indexOf("limitUp20Count") >= 0 ? header.indexOf("limitUp20Count") : header.indexOf("20cm涨停数");
  const idxLuShare = header.indexOf("limitUp20Share");

  const idxOverlap = header.indexOf("overlapRatio") >= 0 ? header.indexOf("overlapRatio") : header.indexOf("overlap_ratio");
  const idxCore100 = header.indexOf("core100Count") >= 0 ? header.indexOf("core100Count") : header.indexOf("百亿中军数");
  const idxRes = header.indexOf("resonance") >= 0 ? header.indexOf("resonance") : header.indexOf("容弹共振");
  const idxMicro = header.indexOf("microStructure") >= 0 ? header.indexOf("microStructure") : header.indexOf("微观结构");
  const idxAnom = header.indexOf("anomalySignal") >= 0 ? header.indexOf("anomalySignal") : header.indexOf("异常信号");
  const idxJud = header.indexOf("nextJudgement") >= 0 ? header.indexOf("nextJudgement") : header.indexOf("次日判定");
  const idxAction = header.indexOf("action") >= 0 ? header.indexOf("action") : header.indexOf("执行动作");

  if (idxDate2 >= 0 && idxN >= 0) {
    const out: ImportedDailyAgg[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      if (cols.length <= Math.max(idxDate2, idxN)) continue;
      const date = cols[idxDate2]?.trim();
      const n = parseNumber(cols[idxN]);
      if (!date || n === null) continue;

      const mean = idxMean >= 0 ? parseNumber(cols[idxMean]) : null;
      const median = idxMedian >= 0 ? parseNumber(cols[idxMedian]) : null;
      const midMean = idxMidMean >= 0 ? parseNumber(cols[idxMidMean]) : null;
      const midMedian = idxMidMedian >= 0 ? parseNumber(cols[idxMidMedian]) : null;
      const lu = idxLu >= 0 ? parseNumber(cols[idxLu]) : null;
      const luShare = idxLuShare >= 0 ? parseNumber(cols[idxLuShare]) : null;

      const overlapRaw = idxOverlap >= 0 ? String(cols[idxOverlap] ?? "").trim() : "";
      const overlap = overlapRaw.endsWith("%") ? parseNumber(overlapRaw.replace("%", "")) : parseNumber(overlapRaw);
      const overlapRatio = overlap === null ? null : overlap > 1 ? overlap / 100 : overlap;

      const core100 = idxCore100 >= 0 ? parseNumber(cols[idxCore100]) : null;
      const resRaw = idxRes >= 0 ? String(cols[idxRes] ?? "").trim() : "";
      const resonance = idxRes >= 0 ? (resRaw === "True" || resRaw === "true" || resRaw === "1" || resRaw === "✓") : null;

      const microStructure = idxMicro >= 0 ? String(cols[idxMicro] ?? "").trim() : "";
      const anomalySignal = idxAnom >= 0 ? String(cols[idxAnom] ?? "").trim() : "";
      const nextJudgement = idxJud >= 0 ? String(cols[idxJud] ?? "").trim() : "";
      const action = idxAction >= 0 ? String(cols[idxAction] ?? "").trim() : "";

      out.push({
        date,
        n: Math.max(0, Math.floor(n)),
        ...(mean === null ? {} : { meanAmtYi: mean }),
        ...(median === null ? {} : { medianAmtYi: median }),
        ...(midMean === null ? {} : { midCoreMeanAmtYi: midMean }),
        ...(midMedian === null ? {} : { midCoreMedianAmtYi: midMedian }),
        ...(lu === null ? {} : { limitUp20Count: Math.max(0, Math.floor(lu)) }),
        ...(luShare === null ? {} : { limitUp20Share: luShare }),
        ...(overlapRatio === null ? {} : { overlapRatio }),
        ...(core100 === null ? {} : { core100Count: Math.max(0, Math.floor(core100)) }),
        ...(resonance === null ? {} : { resonance }),
        ...(microStructure ? { microStructure } : {}),
        ...(anomalySignal ? { anomalySignal } : {}),
        ...(nextJudgement ? { nextJudgement } : {}),
        ...(action ? { action } : {}),
      });
    }

    out.sort((a, b) => b.date.localeCompare(a.date));
    return out;
  }

  // --- Case A: 入选明细 CSV（按日期聚合） ---
  const idxDate = header.indexOf("日期");
  const idxAmt = header.indexOf("成交额");
  if (idxDate < 0 || idxAmt < 0) return [];

  const byDate = new Map<string, number[]>();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length <= Math.max(idxDate, idxAmt)) continue;
    const date = cols[idxDate]?.trim();
    const amtRaw = cols[idxAmt]?.trim();
    if (!date) continue;
    const amt = parseYi(amtRaw);
    if (amt === null) continue;
    const arr = byDate.get(date) ?? [];
    arr.push(amt);
    byDate.set(date, arr);
  }

  const out: ImportedDailyAgg[] = [];
  for (const [date, amts] of byDate.entries()) {
    amts.sort((a, b) => a - b);
    const n = amts.length;
    if (!n) continue;
    const mean = amts.reduce((s, x) => s + x, 0) / n;
    const median = n % 2 ? amts[(n - 1) / 2] : (amts[n / 2 - 1] + amts[n / 2]) / 2;
    out.push({ date, n, meanAmtYi: mean, medianAmtYi: median });
  }

  out.sort((a, b) => b.date.localeCompare(a.date));
  return out;
}
