import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { loadThresholds } from "@/lib/storage";
import { calcStage, formatYi, formatPct } from "@/lib/logic";
import { buildBossBrief } from "@/lib/brief";
import { normalizeYmd } from "@/lib/date";
import { useRecords } from "@/hooks/useRecords";
import { calcSignals, pickPrimarySignal, hasMidCore } from "@/lib/signals";
import { toast } from "sonner";
import { buildCandidateLists } from "@/lib/candidates";

function num(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}


function LightDot({ color, blink }: { color: "green" | "yellow" | "red" | "gray"; blink?: boolean }) {
  const cls =
    color === "green"
      ? "bg-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.55)]"
      : color === "yellow"
        ? "bg-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.55)]"
        : color === "red"
          ? "bg-rose-400 shadow-[0_0_18px_rgba(244,63,94,0.55)]"
          : "bg-muted-foreground/40";

  return <span className={`inline-block h-3 w-3 rounded-full ${cls} ${blink ? "animate-pulse" : ""}`} />;
}

function Crosshair({
  latest,
  prev,
  xMax,
  yMax,
}: {
  latest: { n: number; limitUp20Count?: number | null };
  prev?: { n: number; limitUp20Count?: number | null };
  xMax: number;
  yMax: number;
}) {
  const w = 560;
  const h = 420;
  const pad = 52;

  const x = (v: number) => pad + (Math.max(0, Math.min(v, xMax)) / xMax) * (w - pad * 2);
  const y = (v: number) => h - pad - (Math.max(0, Math.min(v, yMax)) / yMax) * (h - pad * 2);

  const lx = x(latest.n);
  const ly = y(latest.limitUp20Count ?? 0);

  const px = prev ? x(prev.n) : null;
  const py = prev ? y(prev.limitUp20Count ?? 0) : null;

  const midX = x(xMax / 2);
  const midY = y(yMax / 2);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[320px] md:h-[360px]">
        <defs>
          <linearGradient id="grid" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="rgba(255,255,255,0.08)" />
            <stop offset="1" stopColor="rgba(255,255,255,0.04)" />
          </linearGradient>
        </defs>

        {/* background */}
        <rect x={0} y={0} width={w} height={h} rx={18} fill="rgba(15,23,42,0.25)" stroke="rgba(255,255,255,0.10)" />

        {/* crosshair */}
        <line x1={midX} y1={pad} x2={midX} y2={h - pad} stroke="rgba(255,255,255,0.18)" strokeWidth={2} />
        <line x1={pad} y1={midY} x2={w - pad} y2={midY} stroke="rgba(255,255,255,0.18)" strokeWidth={2} />

        {/* border box */}
        <rect
          x={pad}
          y={pad}
          width={w - pad * 2}
          height={h - pad * 2}
          fill="none"
          stroke="url(#grid)"
          strokeWidth={2}
        />

        {/* quadrant labels */}
        <text x={w - pad - 8} y={pad + 18} textAnchor="end" fontSize={16} fill="rgba(255,255,255,0.72)">
          主升共振区
        </text>
        <text x={pad + 8} y={pad + 18} textAnchor="start" fontSize={16} fill="rgba(255,255,255,0.72)">
          无量抱团区
        </text>
        <text x={pad + 8} y={h - pad - 10} textAnchor="start" fontSize={16} fill="rgba(255,255,255,0.72)">
          绝望冰点区
        </text>
        <text x={w - pad - 8} y={h - pad - 10} textAnchor="end" fontSize={16} fill="rgba(255,255,255,0.72)">
          轮动骗炮区
        </text>

        {/* axis labels */}
        <text x={w / 2} y={h - 14} textAnchor="middle" fontSize={12} fill="rgba(255,255,255,0.55)">
          X轴：广度 n
        </text>
        <text
          x={16}
          y={h / 2}
          textAnchor="middle"
          fontSize={12}
          fill="rgba(255,255,255,0.55)"
          transform={`rotate(-90 16 ${h / 2})`}
        >
          Y轴：强度 20cm（数量）
        </text>

        {/* prev -> latest */}
        {prev && px !== null && py !== null ? (
          <>
            <line
              x1={px}
              y1={py}
              x2={lx}
              y2={ly}
              stroke="rgba(255,255,255,0.45)"
              strokeWidth={2}
              strokeDasharray="6 6"
            />
            <circle cx={px} cy={py} r={6} fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.55)" strokeWidth={2} />
          </>
        ) : null}

        {/* latest dot */}
        <circle cx={lx} cy={ly} r={7} fill="rgba(124,255,112,0.25)" stroke="#7CFF70" strokeWidth={3} />
        <circle cx={lx} cy={ly} r={16} fill="rgba(124,255,112,0.06)" />

        {/* value label */}
        <text x={lx + 12} y={ly - 10} fontSize={12} fill="rgba(255,255,255,0.75)">
          今日（n={latest.n}, 20cm={latest.limitUp20Count ?? 0}）
        </text>
      </svg>

      <div className="mt-2 text-xs text-muted-foreground">
        读图：右上越“敢打敢拼”；左下越“绝望冰点”。连线表示从昨日到今日的迁移方向。
      </div>
    </div>
  );
}

export default function Dashboard() {
  const thresholds = loadThresholds();
  const { records, loading, error, remote } = useRecords();
  const latest = records[0];
  const prev = records[1];

  const stage = latest ? (latest.stage ?? calcStage(latest.n, thresholds)) : undefined;

  const { signals } = calcSignals(records);
  const primary = pickPrimarySignal(signals);

  // Step1：仓位上限（参考附件2口径）
  const posCap = useMemo(() => {
    if (!latest) return { cap: "—", hint: "先在复盘记录导入/保存一天数据" };
    const n = latest.n;
    if (n <= 3) return { cap: "0-2成", hint: "绝对冰点：低频、等确定性" };
    if (n >= 21) return { cap: "0-2成", hint: "极致透支：优先离场、防回撤" };
    if (n >= 7 && n <= 11) return { cap: "6-8成", hint: "主升区：允许更积极" };
    if (n >= 4 && n <= 6) return { cap: "3-5成", hint: "回暖试错：轻仓快进快出" };
    if (n >= 12 && n <= 20) return { cap: "3-6成", hint: "高潮/分歧：降速、只做核心" };
    return { cap: "—", hint: "" };
  }, [latest]);

  // Step3：微观结构（若未导入微观则为空）
  const [microHint, setMicroHint] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      if (!latest?.date) {
        setMicroHint(null);
        return;
      }
      try {
        const c = await buildCandidateLists(latest.date);
        const overlapPct = c.overlapRatio === null ? "—" : `${Math.round(c.overlapRatio * 100)}%`;
        const focusTxt = latest.focusThemes?.length
          ? latest.focusThemes.slice(0, 3).map((x) => `${x.topic}(${x.count})`).join("、")
          : null;
        const driftTxt = latest.focusDrift ? ` · 题材${latest.focusDrift}` : "";
        const topTopic = c.topTopic ? `${c.topTopic.topic}（${Math.round(c.topTopic.ratio * 100)}%）` : "—";
        setMicroHint(
          `Overlap ${overlapPct} · 中军≥100亿 ${c.core100.length} · 弹性 ${c.elastic.length} · 日内重点题材 ${focusTxt ?? topTopic}${driftTxt}`
        );
      } catch {
        setMicroHint(null);
      }
    })();
  }, [latest?.date]);

  // crosshair scaling
  const xMax = Math.max(thresholds.p90 + 4, latest?.n ?? 0, prev?.n ?? 0, 24);
  const yMax = Math.max(latest?.limitUp20Count ?? 0, prev?.limitUp20Count ?? 0, 10);

  const dn = latest && prev ? latest.n - prev.n : null;
  const dLu =
    latest && prev && latest.limitUp20Count !== undefined && prev.limitUp20Count !== undefined
      ? (latest.limitUp20Count ?? 0) - (prev.limitUp20Count ?? 0)
      : null;
  const skew = latest?.meanAmtYi !== undefined && latest?.medianAmtYi !== undefined ? (latest.meanAmtYi ?? 0) - (latest.medianAmtYi ?? 0) : null;

  const midCoreOn = latest ? hasMidCore(latest) : false;
  const fakeRepairOn = dn !== null && dn > 0 && dLu !== null && dLu < 0;
  const clusterSiphonOn = skew !== null && skew > 15;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border/70 bg-card/60 backdrop-blur p-6 shadow-glow">
        <div className="grid gap-4 lg:grid-cols-12 mb-6">
          <div className="lg:col-span-8">
            <div className="font-display text-2xl">四步漏斗 · 今日结论</div>
            <div className="text-sm text-muted-foreground mt-1">把数据翻译成：仓位上限 → 一票否决 → 微观结构 → 明日动作</div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Card className="bg-background/20 border-border/60 p-4">
                <div className="text-xs text-muted-foreground">Step1 仓位上限</div>
                <div className="mt-2 text-2xl font-semibold">{posCap.cap}</div>
                <div className="mt-1 text-xs text-muted-foreground">{posCap.hint}</div>
              </Card>

              <Card className="bg-background/20 border-border/60 p-4">
                <div className="text-xs text-muted-foreground">Step2 一票否决（主信号）</div>
                <div className="mt-2 text-base font-semibold">{primary ? `【${primary.name}】` : "—"}</div>
                <div className="mt-1 text-xs text-muted-foreground">{primary ? primary.plan : "暂无命中：按阶段模板走"}</div>
              </Card>

              <Card className="bg-background/20 border-border/60 p-4">
                <div className="text-xs text-muted-foreground">Step3 微观结构（来自微观明细）</div>
                <div className="mt-2 text-base font-semibold">{latest?.microStructure ?? "—"}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {microHint ?? "暂无微观数据：去“复盘记录”导入微观明细，并点“用微观回填宏观”。"}
                </div>
              </Card>

              <Card className="bg-background/20 border-border/60 p-4">
                <div className="text-xs text-muted-foreground">Step4 明日动作（一句话）</div>
                <div className="mt-2 text-base font-semibold">
                  {latest?.action?.trim()
                    ? latest.action
                    : latest?.nextJudgement?.trim()
                      ? `按“${latest.nextJudgement}”执行` 
                      : primary
                        ? (primary.level === "defense" ? "偏防守：降速，只做核心" : primary.level === "attack" ? "偏进攻：只打最确定性" : "观望：等待明确信号")
                        : "—"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">建议去“次日预案”生成并写回记录</div>
              </Card>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="inline-flex items-center rounded-md border border-border/70 bg-card/30 px-3 py-2 text-sm hover:bg-card/40"
                onClick={async () => {
                  try {
                    const date = latest?.date ? normalizeYmd(latest.date) : "—";
                    const lines = [
                      `【四步漏斗结论】${date}`,
                      `Step1 仓位上限：${posCap.cap}`,
                      `Step2 信号：${primary ? primary.name : "—"}`,
                      `Step3 微观：${latest?.microStructure ?? "—"}`,
                      `Step4 动作：${latest?.action?.trim() ? latest.action : latest?.nextJudgement?.trim() ? latest.nextJudgement : "—"}`,
                    ].join("\n");
                    await navigator.clipboard.writeText(lines);
                    toast.success("已复制今日结论");
                  } catch {
                    toast.error("复制失败：请检查浏览器权限");
                  }
                }}
                type="button"
              >
                复制今日结论
              </button>

              <button
                className="inline-flex items-center rounded-md border border-border/70 bg-card/30 px-3 py-2 text-sm hover:bg-card/40"
                onClick={() => (window.location.hash = "#/plan")}
                type="button"
              >
                去生成次日预案
              </button>

              <button
                className="inline-flex items-center rounded-md border border-border/70 bg-card/30 px-3 py-2 text-sm hover:bg-card/40"
                onClick={() => (window.location.hash = "#/log")}
                type="button"
              >
                去录入/回填数据
              </button>
            </div>
          </div>

          <div className="lg:col-span-4">
            <Card className="bg-background/20 border-border/60 p-4">
              <div className="text-xs text-muted-foreground">快速检查（是否跑完整四步）</div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>宏观日表（n/成交额）</span>
                  <span className="font-mono-quant">{latest ? "✓" : "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>信号（异常拐点/过滤器）</span>
                  <span className="font-mono-quant">{primary ? "✓" : "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>微观回填（Overlap/中军/共振）</span>
                  <span className="font-mono-quant">{latest?.overlapRatio !== undefined || latest?.core100Count !== undefined ? "✓" : "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>预案写回（nextPlan）</span>
                  <span className="font-mono-quant">{latest?.nextPlan?.trim() ? "✓" : "—"}</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="font-display text-3xl">今日市场定位</div>
            <div className="text-sm text-muted-foreground mt-1">先用一张“准星图”让人秒懂：大盘在哪、往哪走。</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {remote ? (
              <Badge variant="outline" className="font-mono-quant">
                API
              </Badge>
            ) : (
              <Badge variant="outline" className="font-mono-quant">
                Local
              </Badge>
            )}
            {loading ? <Badge variant="outline">同步中…</Badge> : null}
            {error ? (
              <Badge variant="outline" className="border-destructive/40 text-destructive">
                {error}
              </Badge>
            ) : null}
            {stage ? <Badge className="bg-primary/15 text-primary border border-primary/30">{stage}</Badge> : <Badge variant="outline">暂无数据</Badge>}
            {latest?.date ? (
              <Badge variant="outline" className="font-mono-quant">
                {normalizeYmd(latest.date)}
              </Badge>
            ) : null}
          </div>
        </div>

        {latest ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <Crosshair
                latest={{ n: latest.n, limitUp20Count: latest.limitUp20Count ?? 0 }}
                prev={prev ? { n: prev.n, limitUp20Count: prev.limitUp20Count ?? 0 } : undefined}
                xMax={xMax}
                yMax={yMax}
              />
            </div>

            <div className="lg:col-span-4 space-y-4">
              <Card className="bg-background/20 border-border/60 p-4">
                <div className="text-xs text-muted-foreground">四步漏斗（摘要）</div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Step1 仓位上限（看 n） → Step2 异常拐点 → Step3 微观结构（粘性/中军/共振） → Step4 次日判定
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md border border-border/50 bg-card/20 p-2">
                    <div className="text-xs text-muted-foreground">Overlap 粘性</div>
                    <div className="mt-1 font-mono-quant">{latest?.overlapRatio !== undefined ? `${Math.round(latest.overlapRatio * 100)}%` : "—"}</div>
                  </div>
                  <div className="rounded-md border border-border/50 bg-card/20 p-2">
                    <div className="text-xs text-muted-foreground">百亿中军数</div>
                    <div className="mt-1 font-mono-quant">{latest?.core100Count ?? "—"}</div>
                  </div>
                  <div className="rounded-md border border-border/50 bg-card/20 p-2">
                    <div className="text-xs text-muted-foreground">容弹共振</div>
                    <div className="mt-1 font-mono-quant">{latest?.resonance ? "✓" : latest?.resonance === false ? "—" : "?"}</div>
                  </div>
                  <div className="rounded-md border border-border/50 bg-card/20 p-2">
                    <div className="text-xs text-muted-foreground">次日判定</div>
                    <div className="mt-1 font-semibold">{latest?.nextJudgement ?? (primary ? (primary.level === "defense" ? "防守" : primary.level === "attack" ? "进攻" : "观望") : "—")}</div>
                  </div>
                </div>

                <div className="mt-4 text-xs text-muted-foreground">资金结构红绿灯</div>
                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">大票承载灯</div>
                      <div className="text-xs text-muted-foreground mt-1">midCore&gt;0：大资金在场，适合波段</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <LightDot color={midCoreOn ? "green" : "gray"} />
                      <span className="text-xs text-muted-foreground">{midCoreOn ? "绿" : "灰"}</span>
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">真假修复灯</div>
                      <div className="text-xs text-muted-foreground mt-1">n涨但20cm跌：假修复，谨防核按钮</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <LightDot color={fakeRepairOn ? "red" : "gray"} blink={fakeRepairOn} />
                      <span className="text-xs text-muted-foreground">{fakeRepairOn ? "红闪" : "—"}</span>
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">抱团吸血灯</div>
                      <div className="text-xs text-muted-foreground mt-1">Mean - Median &gt; 15 亿：资金向头部集中</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <LightDot color={clusterSiphonOn ? "yellow" : "gray"} />
                      <span className="text-xs text-muted-foreground">{clusterSiphonOn ? "黄" : "—"}</span>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="bg-background/20 border-border/60 p-4">
                <div className="text-xs text-muted-foreground">行动区：明日交易推演</div>
                {primary ? (
                  <div className="mt-3">
                    <div className="font-semibold">触发信号：【{primary.name}】</div>
                    <div className="mt-1 text-xs text-muted-foreground">历史回测胜率：{primary.winRate === undefined ? "—" : `${(primary.winRate * 100).toFixed(1)}%`}</div>
                    <div className="mt-2 text-sm text-muted-foreground leading-relaxed">{primary.plan}</div>
                    {primary.reason?.length ? (
                      <div className="mt-3 text-xs text-muted-foreground">
                        触发原因：{primary.reason.join("；")}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-muted-foreground">暂无命中触发器：先按阶段策略执行，等待“进攻/防守”指令出现。</div>
                )}
              </Card>
            </div>
          </div>
        ) : (
          <div className="mt-6 text-sm text-muted-foreground">暂无数据：先在“复盘记录”保存/导入一条记录。</div>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Card className="bg-background/20 border-border/60 p-4">
            <div className="text-xs text-muted-foreground">当日符合个数 n（不截断）</div>
            <div className="mt-2 font-mono-quant text-3xl text-foreground">{latest ? latest.n : "—"}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              阈值：P25≤{thresholds.p25} / P50≤{thresholds.p50} / P75≤{thresholds.p75} / P90≥{thresholds.p90}
            </div>
          </Card>

          <Card className="bg-background/20 border-border/60 p-4">
            <div className="text-xs text-muted-foreground">20cm 强度（可选）</div>
            <div className="mt-2 flex items-baseline gap-3">
              <div className="font-mono-quant text-3xl">{latest?.limitUp20Count ?? "—"}</div>
              <div className="text-sm text-muted-foreground">占比 {formatPct(latest?.limitUp20Share)}</div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">用于验证“扩散/赚钱效应”是否真的回暖。</div>
          </Card>

          <Card className="bg-background/20 border-border/60 p-4">
            <div className="text-xs text-muted-foreground">单条成交额（启动信号样本）</div>
            <div className="mt-2 flex items-baseline gap-3">
              <div className="font-mono-quant text-2xl">均值 {formatYi(latest?.meanAmtYi)}</div>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">中位数 {formatYi(latest?.medianAmtYi)}</div>
            <div className="mt-2 text-xs text-muted-foreground">均值更吃“长尾”；中位数更像“典型一天”。</div>
          </Card>
        </div>
      </section>

      {(() => {
        const brief = buildBossBrief(latest, prev, thresholds);
        return (
          <section className="rounded-xl border border-border/70 bg-card/60 backdrop-blur p-6 shadow-glow">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="font-display text-2xl">老板视角解读</div>
                <div className="text-sm text-muted-foreground mt-1">把数据翻译成“发生了什么”与“接下来怎么做”。</div>
              </div>
              <Badge variant="outline" className="font-mono-quant">
                {brief.metrics.stage ?? "—"}
              </Badge>
            </div>

            <div className="mt-4 rounded-lg border border-border/60 bg-background/20 p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="font-semibold text-foreground">{brief.headline}</div>
                <Badge variant="outline" className="font-mono-quant">
                  {brief.transition.label}
                </Badge>
              </div>
              {brief.transition.notes.length ? (
                <ul className="mt-2 space-y-2 text-sm text-muted-foreground list-disc pl-5">
                  {brief.transition.notes.slice(0, 3).map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-2 grid gap-3 md:grid-cols-3 text-sm">
                <div className="rounded-md border border-border/50 bg-card/30 p-3">
                  <div className="text-xs text-muted-foreground">广度 n</div>
                  <div className="mt-1 font-mono-quant text-lg">{brief.metrics.n ?? "—"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Δ {brief.metrics.nDelta ?? "—"}</div>
                </div>
                <div className="rounded-md border border-border/50 bg-card/30 p-3">
                  <div className="text-xs text-muted-foreground">成交额均值Δ / 中位Δ（亿）</div>
                  <div className="mt-1 font-mono-quant text-sm">
                    {brief.metrics.meanDelta === null || brief.metrics.meanDelta === undefined
                      ? "—"
                      : (brief.metrics.meanDelta >= 0 ? "+" : "") + brief.metrics.meanDelta.toFixed(2)}
                    <span className="mx-2 text-muted-foreground">/</span>
                    {brief.metrics.medianDelta === null || brief.metrics.medianDelta === undefined
                      ? "—"
                      : (brief.metrics.medianDelta >= 0 ? "+" : "") + brief.metrics.medianDelta.toFixed(2)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    均值-中位：{brief.metrics.skew === null || brief.metrics.skew === undefined ? "—" : brief.metrics.skew.toFixed(2)}
                  </div>
                </div>
                <div className="rounded-md border border-border/50 bg-card/30 p-3">
                  <div className="text-xs text-muted-foreground">中军样本</div>
                  <div className="mt-1 font-mono-quant text-lg">{brief.metrics.midCorePresent ? "有" : "无"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">默认口径：≥100亿</div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <Card className="bg-background/20 border-border/60 p-4">
                <div className="text-xs text-muted-foreground">发生了什么（解读）</div>
                <ul className="mt-2 space-y-2 text-sm text-muted-foreground list-disc pl-5">
                  {brief.meaning.slice(0, 5).map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </Card>
              <Card className="bg-background/20 border-border/60 p-4">
                <div className="text-xs text-muted-foreground">建议怎么做（动作）</div>
                <ul className="mt-2 space-y-2 text-sm text-muted-foreground list-disc pl-5">
                  {brief.actions.slice(0, 5).map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </Card>
              <Card className="bg-background/20 border-border/60 p-4">
                <div className="text-xs text-muted-foreground">主要风险（风控）</div>
                {brief.risks.length ? (
                  <ul className="mt-2 space-y-2 text-sm text-muted-foreground list-disc pl-5">
                    {brief.risks.slice(0, 5).map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-2 text-sm text-muted-foreground">暂无额外风控提示。</div>
                )}
              </Card>
            </div>
          </section>
        );
      })()}

      <Card className="bg-card/60 border-border/70 p-2">
        <Accordion type="single" collapsible defaultValue={undefined}>
          <AccordionItem value="help" className="border-none">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <span className="font-display text-base">快速说明（可折叠）</span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-border/60 bg-background/20 p-4">
                  <div className="font-display text-lg">你应该记录什么？</div>
                  <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                    <li>1) n（不截断）+ 阶段（自动算，可手工覆盖）</li>
                    <li>2) 20cm 强度（数量/占比）</li>
                    <li>3) 中军成交额（可选：中军均值/中位数）</li>
                    <li>4) 主线题材、盘面结构、风控点</li>
                    <li>5) 次日预案：进攻/防守/观察清单</li>
                  </ul>
                </div>

                <div className="rounded-lg border border-border/60 bg-background/20 p-4">
                  <div className="font-display text-lg">最快起步方式</div>
                  <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                    <li>去“复盘记录”手动录入今天的 n 和几条要点</li>
                    <li>或在“复盘记录”导入你脚本导出的“入选汇总 CSV”自动生成 n/均值/中位数</li>
                    <li>去“次日预案”一键生成模板，再按你风格改写</li>
                  </ol>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>
    </div>
  );
}
