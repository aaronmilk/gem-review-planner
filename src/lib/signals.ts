import type { DailyRecord } from "@/lib/types";

export type SignalLevel = "attack" | "pivot" | "defense";

export type Signal = {
  id:
    | "ice-underflow"
    | "fake-turn"
    | "three-day-accel"
    | "absolute-extreme"
    | "extreme-squeeze"
    | "panic-rebound"
    | "no-midcore"
    | "cluster-warning";
  name: string;
  level: SignalLevel;
  winRate?: number; // 0-1
  hit: boolean;
  reason: string[];
  plan: string;
};

function num(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export function hasMidCore(r: DailyRecord) {
  // 兼容两套口径：
  // 1) 新版 core100Count（百亿中军数）
  // 2) 旧版 midCoreMean/Median（成交额）
  if (typeof (r as any)?.core100Count === "number") return ((r as any).core100Count as number) > 0;
  const a = num(r.midCoreMeanAmtYi);
  const b = num(r.midCoreMedianAmtYi);
  return (a !== null && a > 0) || (b !== null && b > 0);
}

function skewAmt(r: DailyRecord) {
  const mean = num(r.meanAmtYi);
  const median = num(r.medianAmtYi);
  if (mean === null || median === null) return null;
  return mean - median;
}

/**
 * 信号体系（以你提供的 277 日档案为准）
 *
 * 绝对边界：
 * - 绝对冰点：n ≤ 3
 * - 绝对极致：n ≥ 21
 *
 * 五大核心规律：
 * 1) 假拐点：Δn>0 且 Δ20cm<0（毒药）
 * 2) 冰点中位数异动：n≤3 且 medianAmtYi 较昨日暴增≥50%
 * 3) 连续加速透支：n 连续 3 日环比增长（第 4 天禁止接力）
 * 4) 极端缩量抱团：n≤7 且 20cm≥15（末日狂欢，极度谨慎）
 * 5) 恐慌衰竭反弹：n≤6 且 Δn≤-5（次日修复高胜率）
 *
 * 两个“一票否决/过滤器”：
 * - midCore==0：按“电风扇轮动”处理，逢高降速，不出重仓格局
 * - mean-median>15：抱团吸血预警，只能做唯一中军/最高确定性核心
 */
export function calcSignals(recordsDesc: DailyRecord[]): {
  latest?: DailyRecord;
  prev?: DailyRecord;
  signals: Signal[];
} {
  const latest = recordsDesc[0];
  const prev = recordsDesc[1];
  const prev2 = recordsDesc[2];
  const prev3 = recordsDesc[3];

  if (!latest) return { latest: undefined, prev: undefined, signals: [] };

  const n = num(latest.n) ?? 0;
  const prevN = prev ? num(prev.n) : null;
  const dn = prevN !== null ? n - prevN : null;

  const lu = num(latest.limitUp20Count) ?? 0;
  const prevLu = prev ? num(prev.limitUp20Count) : null;
  const dLu = prevLu !== null ? lu - prevLu : null;

  const median = num(latest.medianAmtYi);
  const prevMedian = prev ? num(prev.medianAmtYi) : null;

  // 过滤器 1：midCore
  const midCoreOk = hasMidCore(latest);
  const noMidCore: Signal = {
    id: "no-midcore",
    name: "电风扇轮动（midCore=0）",
    level: "defense",
    hit: !midCoreOk,
    reason: [midCoreOk ? "midCore>0" : "midCore=0：无容量中军"],
    plan:
      "没有中军承载时，不做重仓格局：只允许轻仓、快进快出，逢高收缩；不要把‘热闹’当成‘主线’。",
  };

  // 过滤器 2：抱团预警（均中差）
  const skew = skewAmt(latest);
  const clusterWarningHit = skew !== null && skew > 15;
  const clusterWarning: Signal = {
    id: "cluster-warning",
    name: "抱团吸血预警（均中差>15）",
    level: "defense",
    hit: clusterWarningHit,
    reason: [skew === null ? "缺少均值/中位数" : `mean-median=${skew.toFixed(2)}（阈值>15）`],
    plan:
      "资金极度集中时，禁止买启动池里的中小盘后排；要么只做唯一中军/最确定核心，要么降低频率等待分歧。",
  };

  // 规律 2：冰点中位数异动（左侧潜伏）
  const iceUnderflowHit = n <= 3 && prevMedian !== null && median !== null && prevMedian > 0 && median / prevMedian >= 1.5;
  const iceUnderflow: Signal = {
    id: "ice-underflow",
    name: "冰点中位数异动（左侧先手）",
    level: "attack",
    winRate: 0.667,
    hit: iceUnderflowHit,
    reason: [
      `n≤3：${n}`,
      prevMedian !== null && median !== null
        ? `medianAmtYi 较昨日 +${((median / prevMedian - 1) * 100).toFixed(0)}%`
        : "缺少中位数对比数据",
    ],
    plan:
      "冰点里出现‘单票承接暴增’，代表先知先觉资金拿先手。尾盘/次日低开回落，优先低吸容量核心/主线辨识度最高的方向；仓位中等，要求标的抗跌、能走趋势。",
  };

  // 规律 1：假拐点（量价背离，毒药）
  const fakeTurnHit = dn !== null && dn > 0 && dLu !== null && dLu < 0;
  const fakeTurn: Signal = {
    id: "fake-turn",
    name: "假拐点（Δn↑但Δ20cm↓）",
    level: "defense",
    winRate: 0.091,
    hit: fakeTurnHit,
    reason: [
      dn === null ? "缺少昨日 n" : `Δn=${dn >= 0 ? "+" : ""}${dn}`,
      dLu === null ? "缺少昨日 20cm" : `Δ20cm=${dLu >= 0 ? "+" : ""}${dLu}`,
    ],
    plan:
      "绝对毒药日：不追高接力、不做后排跟风；持仓若不能强封/走强，逢高无条件兑现。次日重点防迎头痛击。",
  };

  // 规律 3：连续加速透支（3 日连增）
  const p1 = prev ? num(prev.n) : null;
  const p2 = prev2 ? num(prev2.n) : null;
  const p3 = prev3 ? num(prev3.n) : null;
  const threeUp =
    dn !== null && dn > 0 && p1 !== null && p2 !== null && p3 !== null && p1 > p2 && p2 > p3 && n > p1;

  const threeDayAccel: Signal = {
    id: "three-day-accel",
    name: "连续加速透支（3日连增）",
    level: "defense",
    winRate: 0,
    hit: threeUp,
    reason: [threeUp ? "n 连续 3 个交易日环比增长" : "未满足（样本不足或不连续）"],
    plan:
      "看到 3 日连增后，第 4 天早盘禁止任何形式的打板接力；只能做高确定性核心的低吸/减仓防守，避免透支后的回落。",
  };

  // 绝对极致：n ≥ 21（右侧离场区）
  const absoluteExtreme: Signal = {
    id: "absolute-extreme",
    name: "绝对极致（n≥21）",
    level: "defense",
    winRate: 0,
    hit: n >= 21,
    reason: [`n=${n}`, n >= 21 ? "命中：n≥21" : "未命中"],
    plan: "极致区是离场区：优先落袋、控制回撤，次日/两日内防断崖式回落。",
  };

  // 规律 4：极端缩量抱团（n≤7 且 20cm≥15）
  const extremeSqueezeHit = n <= 7 && lu >= 15;
  const extremeSqueeze: Signal = {
    id: "extreme-squeeze",
    name: "极端缩量抱团（n≤7 且20cm≥15）",
    level: "pivot",
    hit: extremeSqueezeHit,
    reason: [`n=${n}`, `20cm=${lu}`],
    plan:
      "畸形结构：全在死顶高标妖股。禁止高低切、禁止买跟风后排；要么只做最高标/唯一核心并严格纪律，要么空仓等大分歧。",
  };

  // 规律 5：恐慌衰竭反弹（n≤6 且 Δn≤-5）
  const panicReboundHit = n <= 6 && dn !== null && dn <= -5;
  const panicRebound: Signal = {
    id: "panic-rebound",
    name: "恐慌衰竭反弹（低位暴跌）",
    level: "attack",
    winRate: 0.8,
    hit: panicReboundHit,
    reason: [`n≤6：${n}`, dn === null ? "缺少昨日 n" : `Δn=${dn}`],
    plan:
      "暴跌砸到低位后，空头动能衰竭：当日不杀跌；次日早盘优先盯‘前一日被错杀的强势股’反包/回流，做修复而非追高扩散。",
  };

  // 注意：过滤器不是“必然禁止交易”，但在 pickPrimarySignal 里优先级更高
  const signals = [
    // 先放过滤器（作为上层约束）
    noMidCore,
    clusterWarning,

    // 再放核心规律
    iceUnderflow,
    panicRebound,
    fakeTurn,
    extremeSqueeze,
    threeDayAccel,
    absoluteExtreme,
  ];

  return { latest, prev, signals };
}

export function pickPrimarySignal(signals: Signal[]): Signal | null {
  const hits = signals.filter((s) => s.hit);
  if (!hits.length) return null;

  const score = (s: Signal) => {
    // 过滤器类的防守信号优先级最高（直接约束仓位/打法）
    if (s.id === "no-midcore" || s.id === "cluster-warning") return 400;

    // 其次：绝对风险（极致、三连加速、假拐点）
    if (s.id === "absolute-extreme") return 380;
    if (s.id === "three-day-accel") return 370;
    if (s.id === "fake-turn") return 360;

    // 再其次：极端结构（抱团）
    if (s.id === "extreme-squeeze") return 250;

    // 最后：进攻类（冰点先手 / 恐慌反弹）
    if (s.level === "attack") return 200;

    return 100;
  };

  return hits.slice().sort((a, b) => score(b) - score(a))[0];
}
