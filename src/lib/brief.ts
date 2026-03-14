import type { DailyRecord, Thresholds } from "@/lib/types";
import { calcStage } from "@/lib/logic";

export type BossBrief = {
  headline: string;
  transition: {
    label: string; // e.g. "极致→回暖（分歧/退潮）"
    verdict: "修复" | "分歧" | "退潮" | "延续" | "未知";
    notes: string[];
  };
  meaning: string[];
  actions: string[];
  risks: string[];
  metrics: {
    n?: number;
    stage?: string;
    prevN?: number | null;
    prevStage?: string | null;
    nDelta?: number | null;
    meanDelta?: number | null;
    medianDelta?: number | null;
    skew?: number | null; // mean - median
    midCorePresent?: boolean;
    limitUp20Count?: number | null;
    limitUp20Delta?: number | null;
  };
};

function fmtDelta(v: number | null | undefined, digits = 2) {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const s = v >= 0 ? "+" : "";
  return `${s}${v.toFixed(digits)}`;
}

function safeNum(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export function buildBossBrief(latest?: DailyRecord, prev?: DailyRecord, t?: Thresholds): BossBrief {
  if (!latest || !t) {
    return {
      headline: "暂无数据：先导入/抓取一条记录",
      transition: { label: "—", verdict: "未知", notes: [] },
      meaning: ["没有日度记录时，系统无法给出情绪解读与动作建议。"],
      actions: ["去「复盘记录」保存今天的 n（或点“自动抓取最新”）。"],
      risks: [],
      metrics: {},
    };
  }

  const stage = latest.stage ?? calcStage(latest.n, t);
  const prevStage = prev ? (prev.stage ?? calcStage(prev.n, t)) : null;

  const nDelta = prev ? latest.n - prev.n : null;
  const mean = safeNum(latest.meanAmtYi);
  const median = safeNum(latest.medianAmtYi);
  const prevMean = prev ? safeNum(prev.meanAmtYi) : null;
  const prevMedian = prev ? safeNum(prev.medianAmtYi) : null;

  const meanDelta = prevMean !== null && mean !== null ? mean - prevMean : null;
  const medianDelta = prevMedian !== null && median !== null ? median - prevMedian : null;

  const skew = mean !== null && median !== null ? mean - median : null;
  const midCorePresent = safeNum(latest.midCoreMeanAmtYi) !== null || safeNum(latest.midCoreMedianAmtYi) !== null;

  const meaning: string[] = [];
  const actions: string[] = [];
  const risks: string[] = [];

  const lu = safeNum(latest.limitUp20Count);
  const prevLu = prev ? safeNum(prev.limitUp20Count) : null;
  const luDelta = prevLu !== null && lu !== null ? lu - prevLu : null;

  const share = safeNum(latest.limitUp20Share);

  // 0) 先讲“质量”（20cm涨停：强度确认因子）
  if (lu !== null) {
    if (luDelta !== null) {
      if (luDelta >= 3) {
        meaning.push(`强度上升：20cm涨停数较前一交易日增加 ${fmtDelta(luDelta, 0)}，情绪更偏“敢封板”。`);
      } else if (luDelta <= -3) {
        meaning.push(`强度回落：20cm涨停数较前一交易日减少 ${fmtDelta(luDelta, 0)}，容易从“敢封板”转向“冲高回落”。`);
      }
    }

    if (share !== null) {
      meaning.push(`20cm涨停占比：${(share * 100).toFixed(1)}%（用于看强度是否跟随广度）。`);
    }

    // 结合 n 与涨停的“老板理解”
    if (latest.n >= t.p75 && lu <= 1) {
      risks.push("n 已在偏高区间，但 20cm 涨停偏少：更像“广度有但质量不足”，后排冲高回落概率增加。" );
      actions.push("策略：减少追涨，更多做分歧承接；用中军/确定性做利润锚。" );
    }
    if (latest.n <= t.p25 && lu >= 2) {
      meaning.push("在低位阶段却出现多只 20cm：典型是“少数票强修复”，不代表全面回暖，要看次日能否带动 n 上移。" );
      actions.push("策略：以龙头/中军为核心的小仓位试错，不要把‘单点强’当成‘全面牛’。" );
    }
  } else {
    meaning.push("20cm涨停数未录入：建议每天补充，它是判断“质量/强度”的关键确认因子。" );
  }

  // 1) 先讲“面”（n）
  if (nDelta !== null) {
    if (nDelta >= 5) meaning.push(`广度明显扩张：n 较前一交易日增加 ${fmtDelta(nDelta, 0)}，参与者变多，题材扩散更容易成立。`);
    else if (nDelta <= -5) meaning.push(`广度收缩：n 较前一交易日下降 ${fmtDelta(nDelta, 0)}，赚钱效应可能在回落，注意退潮/分歧扩大。`);
    else meaning.push(`广度变化不大：n 变化 ${fmtDelta(nDelta, 0)}，更多看结构（谁在涨、涨的质量）。`);
  } else {
    meaning.push("只有单日数据：广度趋势需要至少两天对比，先把“今天处在哪个阶段”建立为基准。");
  }

  // 2) 再讲“量”（mean/median）
  if (mean !== null && median !== null) {
    if (skew !== null) {
      if (skew >= 12) {
        meaning.push("均值显著高于中位数：典型含义是“少数大票/中军撑场”，其余偏跟风。情绪像是靠核心带节奏。");
        actions.push("优先围绕容量中军/最强主线做：低位分歧承接、趋势持有；减少后排补涨追涨。");
      } else if (skew <= 3) {
        meaning.push("均值接近中位数：资金分布更均匀，说明“普涨/扩散”属性更强，赚钱效应更可能外溢到后排。");
        actions.push("可以在主线内部做“龙头 + 次龙 + 低位补涨”梯队，但仍以确定性为先。");
      } else {
        meaning.push("均值与中位数存在一定差距：既有核心也有扩散，但还没到“极致一致”。");
        actions.push("主线内部结构化持仓：核心仓位给中军/龙头，试错仓位给低位补涨。出现大分歧先减速。");
      }
    }

    if (meanDelta !== null || medianDelta !== null) {
      const md = fmtDelta(meanDelta, 2);
      const med = fmtDelta(medianDelta, 2);
      meaning.push(`成交额（单条）变化：均值 ${md ?? "—"} / 中位 ${med ?? "—"}（单位：亿）。`);

      // 实战解释：中位更像“典型日”，均值偏“长尾/中军”
      if (meanDelta !== null && medianDelta !== null) {
        if (meanDelta > 0 && medianDelta <= 0) {
          meaning.push("均值上升但中位不动/下降：更像“核心更强，但扩散没跟上”。容易出现“看着热、体感一般”。");
          risks.push("若 n 未同步上升，可能是“中军拉指数/拉情绪”，后排容易冲高回落。" );
        }
        if (medianDelta > 0 && meanDelta <= 0) {
          meaning.push("中位上升但均值不动/下降：更像“多数票变得更有量”，但缺少超级中军。偏健康回暖。");
          actions.push("更适合做“低位放量的确定性”，避免一味等大中军再出手。");
        }
      }
    }
  } else {
    meaning.push("成交额均值/中位数为空：你可以用“导入明细CSV”自动补齐，或先只用 n 做阶段判断。");
  }

  // 3) 中军是否出现
  if (midCorePresent) {
    meaning.push("中军样本出现（≥你设定的中军阈值）：说明有大资金载体，主线持续性通常更强。" );
  } else {
    meaning.push("未出现明显中军样本：更像小票/题材轮动日，持续性与隔日溢价更依赖情绪而非趋势。" );
    risks.push("没有中军时，容易“快涨快跌”，仓位与止盈止损要更机械。" );
  }

  // 4) 阶段“本日判定” + “转移判定”（你提的关键点：必须看前后对比）
  const transitionNotes: string[] = [];
  let verdict: BossBrief["transition"]["verdict"] = "未知";

  if (prevStage) {
    transitionNotes.push(`前一日阶段：${prevStage}（n=${prev?.n ?? "—"}） → 今日阶段：${stage}（n=${latest.n}）`);

    // 关键：从 高潮/极致 急跌到 回暖/冰点/主升下沿，通常是“分歧/退潮”而非“回暖”
    const bigDrop = nDelta !== null && nDelta <= -10;
    const fromHot = prevStage === "高潮" || prevStage === "极致";
    const toLow = stage === "回暖" || stage === "冰点" || stage === "主升";

    if (fromHot && bigDrop && toLow) {
      verdict = "分歧";
      transitionNotes.push("从高位极端情绪快速回落：更像‘分歧/退潮第一天’，不要只看当日 n 的区间标签。" );
      if (lu !== null && prevLu !== null && lu < prevLu) {
        verdict = "退潮";
        transitionNotes.push("同时 20cm 涨停数回落：强度确认因子转弱，更偏‘退潮’而不是‘健康回暖’。" );
      }
      risks.push("典型误判风险：把‘高位回落后的 6’当成‘新一轮回暖’，实际可能只是分歧后缩量/退潮。" );
      actions.push("策略：降速（降仓位/降频次）；只做核心分歧承接，不做后排扩散追涨；把‘次日是否再回落’当成确认。" );
    } else if (!fromHot && nDelta !== null && nDelta >= 5) {
      verdict = "修复";
      transitionNotes.push("n 明显上升：更像情绪修复/扩散启动，结合强度（20cm）确认质量。" );
    } else if (nDelta !== null && nDelta <= -5) {
      verdict = "分歧";
      transitionNotes.push("n 明显回落：更像分歧加大；若强度同步走弱，按退潮更保守处理。" );
      if (lu !== null && prevLu !== null && lu <= prevLu - 2) verdict = "退潮";
    } else {
      verdict = "延续";
      transitionNotes.push("变化不大：以‘结构’与‘强度’为主，阶段标签仅作参考。" );
    }
  }

  const transitionLabel = prevStage ? `${prevStage}→${stage}（${verdict}）` : `${stage}`;

  let headline = "";
  if (stage === "冰点") {
    headline = "老板一句话：控回撤，轻仓右侧试错，等信号连续修复";
    actions.push("仓位：低；只做首板/低位容量试错，优先看承接。" );
    risks.push("最容易出现“盘中一度回暖、收盘再冰点”的假反弹。" );
  } else if (stage === "回暖") {
    headline = "老板一句话：右侧跟随，先围绕中军确认主线";
    actions.push("仓位：中低；主线中军/龙头优先，后排只做确定性。" );
    risks.push("回暖失败常见形态：n 回落 + 中位数不涨，体感转差。" );
  } else if (stage === "主升") {
    headline = "老板一句话：主线重仓顺势做强，但盯住退潮拐点";
    actions.push("仓位：中高；只做最强主线内的“龙头 + 中军”。" );
    risks.push("主升末期常见风险：n 维持但中位数下滑——赚钱效应开始集中、后排变难。" );
  } else if (stage === "高潮") {
    headline = "老板一句话：去弱留强，严控追高，准备随时降速";
    actions.push("仓位：逐步兑现；只做核心分歧承接，不做后排加速。" );
    risks.push("高潮之后最怕“高位亏钱效应扩散”：n 回落 + 中位数回落通常是信号。" );
  } else if (stage === "极致") {
    headline = "老板一句话：只卖不买，防退潮；把利润锁住";
    actions.push("仓位：以兑现为主；新开仓严格收缩。" );
    risks.push("极致日次日更容易降温：若 n/中位数同步回落，按退潮处理。" );
  } else {
    headline = `老板一句话：阶段=${stage}，以“广度(n) + 典型量(中位数) + 核心量(均值/中军)”三件套做决策`;
  }

  // 去重（保持可读性）
  const dedup = (arr: string[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const x of arr) {
      const k = x.trim();
      if (!k) continue;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(x);
    }
    return out;
  };

  const dMeaning = dedup(meaning);
  const dActions = dedup(actions);
  const dRisks = dedup(risks);

  return {
    headline,
    transition: { label: transitionLabel, verdict, notes: transitionNotes },
    meaning: dMeaning,
    actions: dActions,
    risks: dRisks,
    metrics: {
      n: latest.n,
      stage,
      prevN: prev ? prev.n : null,
      prevStage,
      nDelta,
      meanDelta,
      medianDelta,
      skew,
      midCorePresent,
      limitUp20Count: lu,
      limitUp20Delta: luDelta,
    },
  };
}
