export type Stage = "冰点" | "回暖" | "主升" | "高潮" | "极致" | "退潮";

export type DailyRecord = {
  id: string;
  date: string; // YYYY-MM-DD

  // --- Macro_Daily (from report) ---
  overlapRatio?: number; // 资金粘性（0-1）
  core100Count?: number; // 百亿中军数
  resonance?: boolean; // 容弹共振
  microStructure?: string; // 真主升/无主线轮动/震荡分化...
  anomalySignal?: string; // 假拐点/连续加速/冰点异动...
  nextJudgement?: string; // 强攻/进攻/观望/防守
  action?: string; // 执行动作（一句话）


  // Core
  n: number; // 当日符合核心启动信号的全部个数（不截断口径）
  stage?: Stage; // 可手工覆盖；默认根据阈值计算

  // Strength & breadth
  limitUp20Count?: number; // 20cm涨停数量（可手工录入）
  limitUp20Share?: number; // 20cm占比（0-1，可选）

  // Derived (optional, UI/engine)
  signals?: {
    id: string;
    name: string;
    level: string;
    winRate?: number;
    reason: string[];
  }[];
  primarySignalId?: string;

  // Liquidity
  meanAmtYi?: number; // 全部启动信号单条成交额均值（亿）
  medianAmtYi?: number; // 全部启动信号单条成交额中位数（亿）

  // Middle cores
  midCoreMeanAmtYi?: number; // 容量中军样本均值（亿）
  midCoreMedianAmtYi?: number; // 容量中军样本中位数（亿）

  // Notes
  themes?: string; // 题材/主线
  notes?: string; // 当日复盘
  nextPlan?: string; // 次日预案（可自动生成后编辑）

  updatedAt: number;
};

export type Thresholds = {
  p25: number; // default 2
  p50: number; // default 6
  p75: number; // default 11
  p90: number; // default 18
};

export const DEFAULT_THRESHOLDS: Thresholds = {
  p25: 2,
  p50: 6,
  p75: 11,
  p90: 18,
};
