import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { loadThresholds } from "@/lib/storage";
import { calcStage } from "@/lib/logic";
import { normalizeYmd } from "@/lib/date";
import { useRecords } from "@/hooks/useRecords";
import { calcSignals, pickPrimarySignal, hasMidCore } from "@/lib/signals";
import {
  ResponsiveContainer,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  ScatterChart,
  Scatter,
  ReferenceLine,
  ReferenceArea,
  ComposedChart,
  Line,
  Bar,
  Legend,
  BarChart,
} from "recharts";

function num(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}


function fmtPct(x?: number | null) {
  if (x === undefined || x === null || !Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(1)}%`;
}

function fmtDelta(v: number | null) {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v}`;
}

function fmtWinRate(x?: number | null) {
  if (x === undefined || x === null || !Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(1)}%`;
}

function SignalNameTick(props: any) {
  const { x, y, payload } = props;
  const v = String(payload?.value ?? "");
  // 统一居中并轻微倾斜，避免 Recharts 默认 textAnchor 导致“看起来像错位”
  return (
    <g transform={`translate(${x},${y + 14})`}>
      <text transform="rotate(-10)" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={11}>
        {v}
      </text>
    </g>
  );
}

function envLabel(n: number, lu20: number, quadX: number, quadY: number) {
  if (n >= quadX && lu20 >= quadY) return { name: "主升/进攻", hint: "环境强：允许更激进的进攻与持仓" };
  if (n >= quadX && lu20 < quadY) return { name: "试错回暖", hint: "热闹但强度不足：轻仓试错、快进快出" };
  if (n < quadX && lu20 >= quadY) return { name: "集中抱团", hint: "强度集中：聚焦核心，别撒网" };
  return { name: "冰点/防守", hint: "弱市：降低频率与仓位，优先风控" };
}

function bgDot(props: any) {
  const { cx, cy } = props;
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  return <circle cx={cx} cy={cy} r={3} fill="rgba(255,255,255,0.18)" />;
}

function recentDot(showLabel: boolean) {
  return function RecentDot(props: any) {
    const { cx, cy, payload } = props;
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
    const label = String(payload?.dateShort ?? "");
    return (
      <g>
        <circle cx={cx} cy={cy} r={6} fill="#7CFF70" stroke="rgba(255,255,255,0.35)" strokeWidth={2} />
        {showLabel ? (
          <text x={cx} y={cy - 10} textAnchor="middle" fontSize={11} fill="rgba(255,255,255,0.75)">
            {label}
          </text>
        ) : null}
      </g>
    );
  };
}


export default function Analysis() {
  const thresholds = loadThresholds();
  const { records: recordsDesc } = useRecords();

  // 正序（oldest -> newest）用于时间/轨迹图
  const records = useMemo(() => recordsDesc.slice().reverse(), [recordsDesc]);

  const derived = useMemo(() => {
    return records
      .filter((r) => r.date)
      .map((r, idx) => {
        const prevR = idx > 0 ? records[idx - 1] : undefined;
        const stage = r.stage ?? calcStage(r.n, thresholds);

        const dn = prevR ? r.n - prevR.n : null;

        const lu = num(r.limitUp20Count);
        const prevLu = prevR ? num(prevR.limitUp20Count) : null;
        const dLu = prevLu !== null && lu !== null ? lu - prevLu : null;

        const mean = num(r.meanAmtYi);
        const median = num(r.medianAmtYi);
        const skew = mean !== null && median !== null ? mean - median : null;

        const midCore = hasMidCore(r);
        const fakeRepair = dn !== null && dn > 0 && dLu !== null && dLu < 0;
        const clusterSiphon = skew !== null && skew > 15;

        // 复用五大触发器：对“截至当日”的 desc 序列计算当日命中
        const sliceDesc = records.slice(0, idx + 1).slice().reverse();
        const { signals } = calcSignals(sliceDesc);
        const primary = pickPrimarySignal(signals);

        return {
          id: r.id,
          date: normalizeYmd(r.date),
          dateShort: normalizeYmd(r.date).slice(5),
          stage,
          n: r.n,
          dn,
          limitUp20Count: lu ?? 0,
          dLu,
          limitUp20Share: num(r.limitUp20Share),
          meanAmtYi: mean,
          medianAmtYi: median,
          skew,
          midCore: midCore ? 1 : 0,
          fakeRepair: fakeRepair ? 1 : 0,
          clusterSiphon: clusterSiphon ? 1 : 0,
          primaryName: primary?.name ?? "—",
          primaryLevel: primary?.level ?? "—",
          primaryWinRate: primary?.winRate ?? null,
        };
      });
  }, [records, thresholds]);

  const summary = useMemo(() => {
    const ns = derived.map((x) => x.n).filter((x) => Number.isFinite(x));
    if (!ns.length) return null;
    const mean = ns.reduce((s, x) => s + x, 0) / ns.length;
    const sorted = ns.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    return { count: ns.length, mean, median, min: sorted[0], max: sorted[sorted.length - 1] };
  }, [derived]);

  const primaryLatest = useMemo(() => {
    const { signals } = calcSignals(recordsDesc);
    return pickPrimarySignal(signals);
  }, [recordsDesc]);

  const signalCounts = useMemo(() => {
    const m = new Map<string, { name: string; count: number; defense: number; attack: number; pivot: number }>();
    for (const x of derived) {
      if (!x.primaryName || x.primaryName === "—") continue;
      if (!m.has(x.primaryName)) m.set(x.primaryName, { name: x.primaryName, count: 0, defense: 0, attack: 0, pivot: 0 });
      const row = m.get(x.primaryName)!;
      row.count += 1;
      if (x.primaryLevel === "defense") row.defense += 1;
      else if (x.primaryLevel === "attack") row.attack += 1;
      else if (x.primaryLevel === "pivot") row.pivot += 1;
    }
    return Array.from(m.values()).sort((a, b) => b.count - a.count);
  }, [derived]);

  const alertSeries = useMemo(() => {
    return derived.map((x) => ({
      date: x.dateShort,
      skew: x.skew,
      dn: x.dn,
      dLu: x.dLu,
      fakeRepair: x.fakeRepair,
      midCore: x.midCore,
      clusterSiphon: x.clusterSiphon,
    }));
  }, [derived]);

  // 结构警报：日期范围（用索引滑条裁剪）
  const maxAlertIdx = Math.max(0, alertSeries.length - 1);
  const [alertRange, setAlertRange] = useState<[number, number]>([0, maxAlertIdx]);

  useEffect(() => {
    // 当数据长度变化时：默认展示全区间，并确保范围合法
    setAlertRange(([a, b]) => {
      const na = Math.max(0, Math.min(a, maxAlertIdx));
      const nb = Math.max(0, Math.min(b, maxAlertIdx));
      if (na === 0 && nb === maxAlertIdx) return [na, nb];
      // 如果原范围越界或只有一端变化，直接重置全范围更符合“默认看全量”
      if (a > maxAlertIdx || b > maxAlertIdx || a === 0) return [0, maxAlertIdx];
      return [Math.min(na, nb), Math.max(na, nb)];
    });
  }, [maxAlertIdx]);

  const alertSeriesRange = useMemo(() => {
    if (!alertSeries.length) return alertSeries;
    const [a, b] = alertRange;
    return alertSeries.slice(a, b + 1);
  }, [alertSeries, alertRange]);

  const alertRangeLabel = useMemo(() => {
    if (!alertSeries.length) return "—";
    const [a, b] = alertRange;
    const s = alertSeries[a]?.date ?? "—";
    const e = alertSeries[b]?.date ?? "—";
    return `${s} → ${e}`;
  }, [alertRange, alertSeries]);

  // 四象限参考线：用阈值切图（可按你习惯改）
  const quadX = thresholds.p50; // n 的“中位阈值”
  const quadY = 2; // 20cm 强度参考线（默认 2 只）

  // 市场定位：默认只强调最近 N 天（历史点降权做背景）
  const [posWindow, setPosWindow] = useState<"7" | "14" | "30" | "all">("7");

  const posRecent = useMemo(() => {
    if (!derived.length) return [] as typeof derived;
    const n = posWindow === "all" ? derived.length : Number(posWindow);
    return derived.slice(Math.max(0, derived.length - n));
  }, [derived, posWindow]);

  const posLatest = posRecent[posRecent.length - 1] ?? derived[derived.length - 1];

  const posDomains = useMemo(() => {
    const all = derived.length ? derived : [];
    const ns = all.map((x) => x.n).filter((x) => Number.isFinite(x));
    const ys = all.map((x) => x.limitUp20Count).filter((x) => Number.isFinite(x));
    const maxN = ns.length ? Math.max(...ns) : quadX;
    const maxY = ys.length ? Math.max(...ys) : quadY;
    return {
      xMax: Math.max(quadX, maxN) * 1.1 + 2,
      yMax: Math.max(quadY, maxY) * 1.1 + 1,
    };
  }, [derived, quadX, quadY]);

  const posEnv = useMemo(() => {
    if (!posLatest) return { name: "—", hint: "先在“复盘记录”录入数据" };
    return envLabel(posLatest.n, posLatest.limitUp20Count ?? 0, quadX, quadY);
  }, [posLatest, quadX, quadY]);

  const posTrend = useMemo(() => {
    if (posRecent.length < 2) return null;
    const a = posRecent[0];
    const b = posRecent[posRecent.length - 1];
    return {
      dn: b.n - a.n,
      dy: (b.limitUp20Count ?? 0) - (a.limitUp20Count ?? 0),
    };
  }, [posRecent]);

  return (
    <div className="space-y-6">
      <div>
        <div className="font-display text-3xl">指标复盘（偏可交易）</div>
        <div className="text-sm text-muted-foreground mt-1">
          删除“阶段分布/纯 n 曲线”后，这里重点看三件事：<b>市场定位</b>（n×20cm）、<b>结构警报</b>（红绿灯回看）、<b>触发器命中</b>（预案引擎的历史触发频率）。
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-card/60 border-border/70 p-4">
          <div className="text-xs text-muted-foreground">样本天数</div>
          <div className="mt-2 font-mono-quant text-2xl">{summary?.count ?? "—"}</div>
        </Card>
        <Card className="bg-card/60 border-border/70 p-4">
          <div className="text-xs text-muted-foreground">n 均值</div>
          <div className="mt-2 font-mono-quant text-2xl">{summary ? summary.mean.toFixed(2) : "—"}</div>
        </Card>
        <Card className="bg-card/60 border-border/70 p-4">
          <div className="text-xs text-muted-foreground">n 中位数</div>
          <div className="mt-2 font-mono-quant text-2xl">{summary ? summary.median.toFixed(2) : "—"}</div>
        </Card>
        <Card className="bg-card/60 border-border/70 p-4">
          <div className="text-xs text-muted-foreground">最新主触发器</div>
          <div className="mt-2 font-semibold">{primaryLatest?.name ?? "—"}</div>
          <div className="mt-1 text-xs text-muted-foreground">胜率：{fmtWinRate(primaryLatest?.winRate ?? null)}</div>
        </Card>
      </div>

      <Card className="bg-card/60 border-border/70 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="font-display text-xl">1) 今日环境定位（n × 20cm）</div>
            <div className="mt-1 text-sm text-muted-foreground">先给结论：你现在处在什么环境，偏什么打法；图用来解释“为什么”。</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">环境</div>
            <div className="font-semibold">{posEnv.name}</div>
            <div className="mt-1 text-xs text-muted-foreground">{posEnv.hint}</div>
            {posTrend ? (
              <div className="mt-1 text-xs text-muted-foreground font-mono-quant">
                近{posWindow === "all" ? "全量" : posWindow}天迁移：Δn {fmtDelta(posTrend.dn)} / Δ20cm {fmtDelta(posTrend.dy)}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-muted-foreground">显示范围（强调最近，历史做背景）</div>
          <Tabs value={posWindow} onValueChange={(v) => setPosWindow(v as any)}>
            <TabsList className="bg-card/40">
              <TabsTrigger value="7">最近7天</TabsTrigger>
              <TabsTrigger value="14">最近14天</TabsTrigger>
              <TabsTrigger value="30">最近30天</TabsTrigger>
              <TabsTrigger value="all">全部</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="mt-4 h-[380px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={posRecent} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              {/* 四象限底色 + 标签：让图“自解释” */}
              <ReferenceArea x1={0} x2={quadX} y1={0} y2={quadY} fill="rgba(244,63,94,0.08)" />
              <ReferenceArea x1={quadX} x2={posDomains.xMax} y1={0} y2={quadY} fill="rgba(250,204,21,0.08)" />
              <ReferenceArea x1={0} x2={quadX} y1={quadY} y2={posDomains.yMax} fill="rgba(59,130,246,0.08)" />
              <ReferenceArea x1={quadX} x2={posDomains.xMax} y1={quadY} y2={posDomains.yMax} fill="rgba(34,197,94,0.08)" />

              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis type="number" dataKey="n" domain={[0, posDomains.xMax]} stroke="rgba(255,255,255,0.6)" name="n" />
              <YAxis type="number" dataKey="limitUp20Count" domain={[0, posDomains.yMax]} stroke="rgba(255,255,255,0.6)" name="20cm" />

              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                contentStyle={{
                  background: "rgba(15, 23, 42, 0.92)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
                labelFormatter={(_, payload) => {
                  const d: any = payload?.[0]?.payload;
                  return d?.date ? `${d.date}（主触发器：${d.primaryName}）` : "";
                }}
              />

              <ReferenceLine x={quadX} stroke="rgba(255,255,255,0.25)" strokeDasharray="6 6" />
              <ReferenceLine y={quadY} stroke="rgba(255,255,255,0.25)" strokeDasharray="6 6" />

              {/* 历史点：背景 */}
              <Scatter data={derived} shape={bgDot} />

              {/* 最近点：高亮 + 日期标签 */}
              <Scatter data={posRecent} shape={recentDot(true)} />

              {/* 最近迁移：连线（old → new） */}
              <Line type="linear" dataKey="limitUp20Count" stroke="rgba(124,255,112,0.8)" strokeWidth={2} dot={false} />

              {/* 象限标签（用 ReferenceLine 的 label 简化实现） */}
              <ReferenceLine y={posDomains.yMax} strokeOpacity={0} label={{ value: "左下：冰点/防守", position: "insideTopLeft", fill: "rgba(255,255,255,0.45)", fontSize: 12 }} />
              <ReferenceLine y={posDomains.yMax} strokeOpacity={0} label={{ value: "右下：试错", position: "insideTopRight", fill: "rgba(255,255,255,0.45)", fontSize: 12 }} />
              <ReferenceLine y={posDomains.yMax - 0.0001} strokeOpacity={0} label={{ value: "左上：集中", position: "insideBottomLeft", fill: "rgba(255,255,255,0.45)", fontSize: 12 }} />
              <ReferenceLine y={posDomains.yMax - 0.0001} strokeOpacity={0} label={{ value: "右上：进攻", position: "insideBottomRight", fill: "rgba(255,255,255,0.45)", fontSize: 12 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-2 text-xs text-muted-foreground">
          读图方式：看“今天落在哪个象限” + “最近几天线条是往右上（变强）还是往左下（变弱）”。参考线：X=P50（{quadX}），Y=2。
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-card/60 border-border/70 p-5">
          <div className="font-display text-xl">2) 结构警报回看（红绿灯时间轴）</div>
          <div className="mt-2 text-sm text-muted-foreground">一眼回看：哪些天是“假修复”（n涨但20cm跌）、哪些天有中军承载、哪些天出现抱团吸血。</div>
          <div className="mt-4 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={alertSeriesRange} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.6)" />
                <YAxis stroke="rgba(255,255,255,0.6)" />
                <Tooltip
                  contentStyle={{
                    background: "rgba(15, 23, 42, 0.92)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                  formatter={(v: any, k: any) => {
                    if (k === "skew") return [v === null ? "—" : Number(v).toFixed(2), "Mean-Median(亿)"];
                    if (k === "dn") return [fmtDelta(v), "Δn"];
                    if (k === "dLu") return [fmtDelta(v), "Δ20cm"];
                    if (k === "fakeRepair") return [v ? "是" : "否", "真假修复(红)"];
                    if (k === "midCore") return [v ? "是" : "否", "大票承载(绿)"];
                    if (k === "clusterSiphon") return [v ? "是" : "否", "抱团吸血(黄)"];
                    return [v, k];
                  }}
                />
                <Legend />
                <Bar dataKey="fakeRepair" name="真假修复(红)" fill="#FB7185" />
                <Bar dataKey="clusterSiphon" name="抱团吸血(黄)" fill="#FBBF24" />
                <Bar dataKey="midCore" name="大票承载(绿)" fill="#34D399" />
                <Line type="monotone" dataKey="skew" name="Mean-Median(亿)" stroke="#93C5FD" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs text-muted-foreground">注：三色柱是 0/1 标记；蓝线是均中差（资金集中度）。</div>
              <div className="text-xs text-muted-foreground font-mono-quant">当前范围：{alertRangeLabel}</div>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">拖动滑条：选择只看一段日期（默认全量）。</div>
              <Slider
                value={alertRange}
                onValueChange={(v) => setAlertRange([v[0] ?? 0, v[1] ?? maxAlertIdx])}
                min={0}
                max={maxAlertIdx}
                step={1}
                minStepsBetweenThumbs={1}
              />
            </div>
          </div>
        </Card>

        <Card className="bg-card/60 border-border/70 p-5">
          <div className="font-display text-xl">3) 触发器命中统计（预案引擎的“出现频率”）</div>
          <div className="mt-2 text-sm text-muted-foreground">不是为了“科学回测”，而是为了回答：你这套引擎最近更常在什么环境下工作？</div>
          <div className="mt-4 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={signalCounts} margin={{ top: 10, right: 20, bottom: 14, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis
                  dataKey="name"
                  stroke="rgba(255,255,255,0.0)"
                  interval={0}
                  height={72}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(255,255,255,0.18)" }}
                  tick={<SignalNameTick />}
                />
                <YAxis stroke="rgba(255,255,255,0.6)" />
                <Tooltip
                  contentStyle={{
                    background: "rgba(15, 23, 42, 0.92)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                />
                <Legend />
                <Bar dataKey="defense" name="防守" fill="#FB7185" radius={[6, 6, 0, 0]} />
                <Bar dataKey="attack" name="进攻" fill="#7CFF70" radius={[6, 6, 0, 0]} />
                <Bar dataKey="pivot" name="分歧低吸" fill="#FBBF24" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 text-xs text-muted-foreground text-center">
            提示：命中为“主触发器”统计（优先级：防守 &gt; 进攻 &gt; 分歧低吸）。
          </div>
        </Card>
      </div>

      <Card className="bg-card/60 border-border/70 p-5">
        <div className="font-display text-xl">最近 8 天（用于复盘记录是否“补齐关键字段”）</div>
        <div className="mt-3 space-y-2 text-sm">
          {derived
            .slice(-8)
            .reverse()
            .map((x) => (
              <div key={x.id} className="flex items-center justify-between border-b border-border/50 pb-2">
                <div className="font-mono-quant">{x.date}</div>
                <div className="text-xs text-muted-foreground">
                  n {x.n}（Δ{fmtDelta(x.dn)}） · 20cm {x.limitUp20Count}（Δ{fmtDelta(x.dLu)}） · 均中差 {x.skew === null ? "—" : x.skew.toFixed(2)}亿 · 主触发器 {x.primaryName}
                </div>
              </div>
            ))}
        </div>
        <div className="mt-2 text-xs text-muted-foreground">如果你发现“假修复/抱团/中军”经常是空的，说明那天的数据没补齐，建议回到“复盘记录”补录 20cm 与均/中位成交额。</div>
      </Card>
    </div>
  );
}
