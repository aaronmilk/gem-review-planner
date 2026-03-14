import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { buildCandidateLists, type CandidateLists } from "@/lib/candidates";
import { loadThresholds } from "@/lib/storage";
import { calcStage, formatYi, formatPct } from "@/lib/logic";
import { normalizeYmd } from "@/lib/date";
import { useRecords } from "@/hooks/useRecords";
import { calcSignals, pickPrimarySignal, hasMidCore } from "@/lib/signals";

function fmtWinRate(x?: number) {
  if (x === undefined || x === null || !Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(1)}%`;
}

function genPlan(args: {
  date: string;
  n: number;
  stage: string;
  thresholds: { p25: number; p50: number; p75: number; p90: number };
  meanAmtYi?: number;
  medianAmtYi?: number;
  limitUp20Count?: number;
  limitUp20Share?: number;

  // --- 宏微观共振（来自深度交叉融合报告） ---
  overlapRatio?: number; // 0-1
  core100Count?: number;
  resonance?: boolean;
  microStructure?: string;

  primarySignalText?: {
    name: string;
    winRate?: number;
    plan: string;
    reason: string[];
  };
  hitSignals?: { name: string; winRate?: number }[];
}) {
  const {
    date,
    n,
    stage,
    thresholds,
    meanAmtYi,
    medianAmtYi,
    limitUp20Count,
    limitUp20Share,
    overlapRatio,
    core100Count,
    resonance,
    microStructure,
    primarySignalText,
    hitSignals,
  } = args;

  const lines: string[] = [];

  lines.push(`# 次日预案（${date}）`);
  lines.push("");
  lines.push(`- 今日阶段（仅作背景）：**${stage}**`);
  lines.push(
    `- 广度 n：**${n}**（阈值：P25≤${thresholds.p25} / P50≤${thresholds.p50} / P75≤${thresholds.p75} / P90≥${thresholds.p90}）`
  );
  if (meanAmtYi !== undefined || medianAmtYi !== undefined) {
    lines.push(`- 启动信号单条成交额：均值 **${formatYi(meanAmtYi)}** / 中位 **${formatYi(medianAmtYi)}**`);
  }
  if (limitUp20Count !== undefined || limitUp20Share !== undefined) {
    lines.push(`- 20cm 强度：数量 **${limitUp20Count ?? "—"}** / 占比 **${formatPct(limitUp20Share)}**`);
  }

  lines.push("\n---\n");

  // 宏微观共振模型（来自《深度交叉融合分析报告》）：决定“真主升还是电风扇”与“买什么”
  if (overlapRatio !== undefined || core100Count !== undefined || resonance !== undefined || microStructure) {
    const overlapPct = overlapRatio === undefined ? "—" : `${Math.round(overlapRatio * 100)}%`;
    const coreTxt = core100Count === undefined ? "—" : String(core100Count);
    const resTxt = resonance === true ? "✓" : resonance === false ? "—" : "?";

    lines.push("## 宏微观共振（结构判定）");
    lines.push(`- 资金粘性 Overlap_Ratio：**${overlapPct}**（≥20% 更偏“真主升”）`);
    lines.push(`- 百亿中军数：**${coreTxt}**（>0 = 承载力底线）`);
    lines.push(`- 容弹共振：**${resTxt}**（共振日优先做“中军+弹性”）`);
    if (microStructure) lines.push(`- 微观结构：**${microStructure}**`);

    // 直接给“买什么”的一句话建议（不输出具体股票，避免口径不一致；后续再接入微观明细表生成清单）
    const isTrueUp = overlapRatio !== undefined && overlapRatio >= 0.2 && (core100Count ?? 0) > 0;
    if (isTrueUp && resonance) {
      lines.push("- 明日建议：**强攻**（放弃杂毛，围绕百亿中军做分歧低吸；弹性侧只做同属性最强 20cm）");
    } else if (isTrueUp) {
      lines.push("- 明日建议：偏进攻（有承载力 + 高粘性，优先聚焦核心，回避后排）");
    } else if ((core100Count ?? 0) > 0) {
      lines.push("- 明日建议：偏观望/结构性机会（有中军但粘性不足，优先抱团核心，不格局后排）");
    } else {
      lines.push("- 明日建议：偏防守（无中军承载更像电风扇轮动：轻仓快进快出，逢高收缩）");
    }

    lines.push("");
  }

  // V1.0：五大触发器（优先输出清晰指令）
  if (primarySignalText) {
    lines.push("> 🎯 **明日交易推演**");
    lines.push(`> **触发信号：** 【${primarySignalText.name}】`);
    lines.push(`> **历史回测胜率：** ${fmtWinRate(primarySignalText.winRate)}`);
    if (primarySignalText.reason?.length) {
      lines.push(`> **触发原因：** ${primarySignalText.reason.join("；")}`);
    }
    lines.push(`> **核心预案：** ${primarySignalText.plan}`);
    lines.push("");
  } else {
    lines.push("> 🎯 **明日交易推演**");
    lines.push("> **触发信号：** 暂无（按阶段模板走）");
    lines.push("> **核心预案：** 先按阶段策略做‘轻仓/聚焦/降速’，等待触发器给出明确进攻/防守指令。");
    lines.push("");
  }

  if (hitSignals && hitSignals.length) {
    lines.push("## 今日命中触发器（仅列命中项）");
    for (const s of hitSignals) {
      lines.push(`- 【${s.name}】胜率：${fmtWinRate(s.winRate)}`);
    }
    lines.push("");
  }

  lines.push("## 两条过滤器（先决定能不能上仓位）");
  lines.push("- **midCore（主线准入证）**：midCore=0 一律按电风扇轮动处理 → 不出重仓格局、逢高收缩");
  lines.push("- **抱团预警（均中差）**：mean-median>15 → 只做唯一中军/最高确定性核心，禁止后排\n");

  lines.push("## 明日待办清单（按时间）");
  lines.push("- [ ] 09:25 竞价：主线是否一致？midCore 是否继续承接？");
  lines.push("- [ ] 09:45 盘初：若命中‘连续加速/绝对极致/假拐点’ → 禁止接力，先减速");
  lines.push("- [ ] 10:30 结构：n 与 20cm 是否同向（防假拐点/骗炮）");
  lines.push("- [ ] 14:00 风控：均中差是否突然>15（抱团吸血）？若是，禁止买后排");
  lines.push("- [ ] 收盘复盘：补齐 20cm、均/中位成交额，把预案写回记录");
  lines.push("");

  return lines.join("\n");
}

export default function Plan() {
  const thresholds = loadThresholds();
  const { records, upsert } = useRecords();
  const latest = records[0];

  const [cands, setCands] = useState<CandidateLists | null>(null);
  const [candLoading, setCandLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (!latest?.date) {
        setCands(null);
        return;
      }
      setCandLoading(true);
      try {
        const out = await buildCandidateLists(latest.date);
        setCands(out);
      } catch {
        // 微观未导入时静默
        setCands(null);
      } finally {
        setCandLoading(false);
      }
    })();
  }, [latest?.date]);

  const auto = useMemo(() => {
    if (!latest) return "";
    const stage = latest.stage ?? calcStage(latest.n, thresholds);

    const { signals } = calcSignals(records);
    const primary = pickPrimarySignal(signals);

    return genPlan({
      date: latest.date,
      n: latest.n,
      stage,
      thresholds,
      meanAmtYi: latest.meanAmtYi,
      medianAmtYi: latest.medianAmtYi,
      limitUp20Count: latest.limitUp20Count,
      limitUp20Share: latest.limitUp20Share,
      overlapRatio: latest.overlapRatio,
      core100Count: latest.core100Count,
      resonance: latest.resonance,
      microStructure: latest.microStructure,
      primarySignalText: primary
        ? {
            name: primary.name,
            winRate: primary.winRate,
            plan: primary.plan,
            reason: primary.reason,
          }
        : undefined,
      hitSignals: signals.filter((s) => s.hit).map((s) => ({ name: s.name, winRate: s.winRate })),
    });
  }, [latest, thresholds, records]);

  const [text, setText] = useState(auto);

  // 当 latest 变化时，同步更新编辑区（避免仍停留在旧日期预案）
  useEffect(() => {
    setText(auto);
  }, [auto]);

  const candText = useMemo(() => {
    if (!cands) return "";
    const overlapPct = cands.overlapRatio === null ? "—" : `${Math.round(cands.overlapRatio * 100)}%`;
    const topTopicTxt = cands.topTopic ? `${cands.topTopic.topic}（${cands.topTopic.count}/${cands.nMicro}=${Math.round(cands.topTopic.ratio * 100)}%）` : "—";

    const fmtRow = (r: any) => {
      const amt = r.amountYi !== undefined ? `${r.amountYi}亿` : "—";
      const t = r.topic ? String(r.topic) : "—";
      return `- ${r.name}（${r.code}）· ${amt} · ${t}`;
    };

    const fmtElastic = (r: any) => {
      const pct = r.pct !== undefined ? `${r.pct}%` : "—";
      const amt = r.amountYi !== undefined ? `${r.amountYi}亿` : "—";
      const t = r.topic ? String(r.topic) : "—";
      return `- ${r.name}（${r.code}）· ${pct} · ${amt} · ${t}`;
    };

    const lines: string[] = [];
    lines.push("## 微观候选清单（自动）");
    lines.push(`- 微观条数 n_micro：**${cands.nMicro}**；Overlap_Ratio：**${overlapPct}**；Top题材：**${topTopicTxt}**`);
    if (cands.prevDate) lines.push(`- 对比基准：上一导入日 **${cands.prevDate}**`);
    lines.push("");

    lines.push("### ① 粘性 Top（昨日仍在榜）");
    if (cands.stickyTop.length) cands.stickyTop.forEach((r) => lines.push(fmtRow(r)));
    else lines.push("- —");
    lines.push("");

    lines.push("### ② 百亿中军（≥100亿）");
    if (cands.core100.length) cands.core100.forEach((r) => lines.push(fmtRow(r)));
    else lines.push("- —");
    lines.push("");

    lines.push("### ③ 弹性票（近似 20cm：pct≥19）");
    if (cands.elastic.length) cands.elastic.forEach((r) => lines.push(fmtElastic(r)));
    else lines.push("- —");

    return lines.join("\n");
  }, [cands]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="font-display text-3xl">次日预案</div>
          <div className="text-sm text-muted-foreground mt-1">
            用「5大规律」给出主基调，并叠加两条“一票否决过滤器”（midCore、均中差）把预案写成可执行动作。
            同时从微观明细自动生成“候选清单”（粘性/中军/弹性），让预案更接近实战。
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            className="border-border/70 bg-card/30"
            onClick={() => {
              if (!latest) return;
              setText(auto);
              toast.success("已重新生成");
            }}
          >
            重新生成
          </Button>

          <Button
            variant="outline"
            className="border-border/70 bg-card/30"
            onClick={async () => {
              try {
                const all = [text.trim(), candText.trim()].filter(Boolean).join("\n\n---\n\n");
                if (!all) {
                  toast.error("没有可复制内容");
                  return;
                }
                await navigator.clipboard.writeText(all);
                toast.success("已复制（预案 + 候选清单）");
              } catch {
                toast.error("复制失败：请检查浏览器权限");
              }
            }}
          >
            复制到剪贴板
          </Button>
          <Button
            className="bg-primary text-primary-foreground"
            onClick={async () => {
              if (!latest) {
                toast.error("还没有记录。先去“复盘记录”保存一天数据。");
                return;
              }
              try {
                await upsert({
                  ...latest,
                  nextPlan: text,
                  updatedAt: Date.now(),
                });
                toast.success("已写回到该日期记录");
              } catch (e: any) {
                toast.error(e?.message ?? "写回失败");
              }
            }}
          >
            写回记录
          </Button>
        </div>
      </div>

      {candText ? (
        <Card className="bg-card/60 border-border/70 p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-display text-xl">微观候选清单（自动）</div>
              <div className="text-xs text-muted-foreground mt-1">来自“复盘记录→微观明细表”的已导入数据（若为空，请先导入微观明细或检查日期）。</div>
            </div>
            <div className="text-xs text-muted-foreground">{candLoading ? "计算中…" : cands ? `日期：${cands.date}` : "—"}</div>
          </div>
          <div className="mt-4 whitespace-pre-wrap text-sm font-mono-quant bg-background/20 border border-border/60 rounded-lg p-3">{candText}</div>
        </Card>
      ) : (
        <Card className="bg-card/60 border-border/70 p-5">
          <div className="font-display text-xl">微观候选清单（自动）</div>
          <div className="mt-2 text-sm text-muted-foreground">
            {candLoading ? "计算中…" : "暂无微观数据：先在“复盘记录”导入微观明细，并确保最新日期与宏观记录日期一致。"}
          </div>
        </Card>
      )}

      <Card className="bg-card/60 border-border/70 p-5">
        {!latest ? (
          <div className="text-sm text-muted-foreground">暂无数据。先在“复盘记录”保存一条记录。</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3 text-sm">
            <div className="border border-border/60 rounded-lg p-3 bg-background/20">
              <div className="text-xs text-muted-foreground">日期</div>
              <div className="mt-1 font-mono-quant">{normalizeYmd(latest.date)}</div>
            </div>
            <div className="border border-border/60 rounded-lg p-3 bg-background/20">
              <div className="text-xs text-muted-foreground">n</div>
              <div className="mt-1 font-mono-quant">{latest.n}</div>
            </div>
            <div className="border border-border/60 rounded-lg p-3 bg-background/20">
              <div className="text-xs text-muted-foreground">成交额（单条）</div>
              <div className="mt-1 font-mono-quant text-muted-foreground">
                均值 {formatYi(latest.meanAmtYi)} · 中位 {formatYi(latest.medianAmtYi)}
              </div>
            </div>
          </div>
        )}

        <div className="mt-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[520px] bg-background/20 border-border/60 font-mono-quant text-sm"
            placeholder="生成后在这里编辑..."
          />
        </div>

        <div className="mt-3 text-xs text-muted-foreground">提示：触发器依赖“昨日对比”。建议尽量连续记录，并补录 20cm 与中位数。</div>
      </Card>
    </div>
  );
}
