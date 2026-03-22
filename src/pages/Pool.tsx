import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { buildLifePools, type PoolRow } from "@/lib/pool-life";
import { calcLifeStatus, getLifeManual, lifeAnchorText, upsertLifeManual, type LifeManual } from "@/lib/lifecycle-manual";

type SortField = "streak" | "latestAmountYi" | "maxAmountYi" | "latestPct" | "latestDate" | "recentAppear";
type SortDirection = "asc" | "desc";

type PoolKind = "mid" | "pop";

function BoolSelect({
  value,
  onChange,
}: {
  value: boolean | undefined;
  onChange: (v: boolean | undefined) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border/60 overflow-hidden">
      <button
        className={
          "px-2 py-1 text-xs " +
          (value === false ? "bg-primary text-primary-foreground" : "bg-card/30 text-muted-foreground hover:bg-card/40")
        }
        onClick={() => onChange(false)}
        type="button"
      >
        否
      </button>
      <button
        className={
          "px-2 py-1 text-xs border-l border-border/60 " +
          (value === true ? "bg-primary text-primary-foreground" : "bg-card/30 text-muted-foreground hover:bg-card/40")
        }
        onClick={() => onChange(true)}
        type="button"
      >
        是
      </button>
      <button
        className={
          "px-2 py-1 text-xs border-l border-border/60 " +
          (value === undefined ? "bg-primary text-primary-foreground" : "bg-card/30 text-muted-foreground hover:bg-card/40")
        }
        onClick={() => onChange(undefined)}
        type="button"
        title="清空"
      >
        —
      </button>
    </div>
  );
}

export default function Pool() {
  // 固定口径：
  // - 百亿中军：>=100亿 且 近5交易日出现>=2
  // - 容量人气：非百亿 且 近5交易日出现>=2

  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<PoolKind>("mid");

  const [midRows, setMidRows] = useState<PoolRow[]>([]);
  const [highRows, setHighRows] = useState<PoolRow[]>([]);
  const [latestDate, setLatestDate] = useState<string | undefined>(undefined);

  const [sortField, setSortField] = useState<SortField>("streak");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // 手动生命周期标记（localStorage）
  const [manualMap, setManualMap] = useState<Record<string, LifeManual | null>>({});
  const [anchorText, setAnchorText] = useState<string>("");

  async function refresh() {
    setLoading(true);
    try {
      const out = await buildLifePools();
      setMidRows(out.midCore);
      setHighRows(out.highMark);
      setLatestDate(out.latestDate);

      // 初始化 manualMap（把池子里出现的票都读一遍）
      const codes = new Set([...out.midCore.map((r) => r.code), ...out.highMark.map((r) => r.code)]);
      const m: Record<string, LifeManual | null> = {};
      for (const c of codes) m[c] = getLifeManual(c);
      setManualMap(m);

      setAnchorText("");
    } catch (e: any) {
      toast.error(e?.message ?? "加载失败：请先导入微观明细");
      setMidRows([]);
      setHighRows([]);
      setLatestDate(undefined);
      setManualMap({});
      setAnchorText("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const curRows = tab === "mid" ? midRows : highRows;

  const sortedRows = useMemo(() => {
    return [...curRows].sort((a, b) => {
      let aVal: number | string | undefined;
      let bVal: number | string | undefined;
      switch (sortField) {
        case "streak":
          aVal = a.streak;
          bVal = b.streak;
          break;
        case "latestAmountYi":
          aVal = a.latestAmountYi;
          bVal = b.latestAmountYi;
          break;
        case "maxAmountYi":
          aVal = a.maxAmountYi;
          bVal = b.maxAmountYi;
          break;
        case "latestPct":
          aVal = a.latestPct;
          bVal = b.latestPct;
          break;
        case "latestDate":
          aVal = a.latestDate ?? "";
          bVal = b.latestDate ?? "";
          break;
        case "recentAppear":
          aVal = a.recentAppear;
          bVal = b.recentAppear;
          break;
      }
      if (aVal === undefined || aVal === null) aVal = -Infinity;
      if (bVal === undefined || bVal === null) bVal = -Infinity;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [curRows, sortField, sortDirection, tab]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    const isActive = sortField === field;
    return (
      <span className={`ml-1 inline-flex flex-col ${isActive ? "text-primary" : "text-muted-foreground/50"}`}>
        <span className={`text-[8px] leading-none ${isActive && sortDirection === "asc" ? "text-primary" : ""}`}>▲</span>
        <span className={`text-[8px] leading-none ${isActive && sortDirection === "desc" ? "text-primary" : ""}`}>▼</span>
      </span>
    );
  }

  const summary = useMemo(() => {
    const rows = tab === "mid" ? midRows : highRows;
    const cnt = rows.length;
    const strong = rows.filter((r) => calcLifeStatus(manualMap[r.code] ?? null) === "强势").length;
    const weak = rows.filter((r) => calcLifeStatus(manualMap[r.code] ?? null) === "破5走弱").length;
    const broken = rows.filter((r) => calcLifeStatus(manualMap[r.code] ?? null) === "破位").length;
    const pending = rows.filter((r) => calcLifeStatus(manualMap[r.code] ?? null) === "待判定").length;
    return { cnt, strong, weak, broken, pending };
  }, [midRows, highRows, manualMap, tab]);

  const poolExplain = tab === "mid"
    ? "百亿中军：成交额≥100亿，且近5个交易日内反复出现（出现次数≥2）。"
    : "容量人气：非百亿，但近5个交易日内反复出现（出现次数≥2）。";

  const poolsForAnchor = useMemo(() => ({ midCore: midRows, highMark: highRows }), [midRows, highRows]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="font-display text-3xl">百亿中军 / 容量人气（生命周期锚点）</div>
          <div className="text-sm text-muted-foreground mt-1">{poolExplain}</div>
          {latestDate ? <div className="mt-1 text-xs text-muted-foreground font-mono-quant">最新导入日：{latestDate}</div> : null}
          <div className="mt-1 text-xs text-muted-foreground">口径固定：近5交易日出现≥2；百亿中军=成交额≥100亿，容量人气=非百亿。</div>
        </div>

        <div className="flex items-end gap-2 flex-wrap">
          <Button className="bg-primary text-primary-foreground" onClick={refresh}>
            {loading ? "计算中…" : "刷新"}
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as PoolKind)}>
        <TabsList className="bg-card/40 border border-border/70">
          <TabsTrigger value="mid">中军池</TabsTrigger>
          <TabsTrigger value="pop">容量人气</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="bg-card/60 border-border/70 p-5">
              <div className="text-xs text-muted-foreground">池子数量</div>
              <div className="mt-2 font-mono-quant text-2xl">{summary.cnt}</div>
            </Card>
            <Card className="bg-card/60 border-border/70 p-5">
              <div className="text-xs text-muted-foreground">强势（未破5/未破0.809）</div>
              <div className="mt-2 font-mono-quant text-2xl">{summary.strong}</div>
            </Card>
            <Card className="bg-card/60 border-border/70 p-5">
              <div className="text-xs text-muted-foreground">破5走弱</div>
              <div className="mt-2 font-mono-quant text-2xl">{summary.weak}</div>
            </Card>
            <Card className="bg-card/60 border-border/70 p-5">
              <div className="text-xs text-muted-foreground">破位 / 待判定</div>
              <div className="mt-2 font-mono-quant text-2xl">
                {summary.broken} / {summary.pending}
              </div>
            </Card>
          </div>

          <Card className="bg-card/60 border-border/70 p-5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="font-display text-xl">底层做多逻辑锚点（生成器）</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  你只需要对池子里的票手动勾选：是否跌破 5 日线 / 是否跌破 0.809。点按钮后，系统自动生成可复制的锚点清单。
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  className="bg-primary text-primary-foreground"
                  onClick={() => {
                    const text = lifeAnchorText(poolsForAnchor, manualMap);
                    setAnchorText(text);
                    toast.success("已生成锚点清单（下方可复制）");
                  }}
                >
                  生成锚点
                </Button>
                <Button
                  variant="outline"
                  className="border-border/70 bg-card/30"
                  onClick={async () => {
                    try {
                      if (!anchorText.trim()) {
                        toast.error("先点“生成锚点”");
                        return;
                      }
                      await navigator.clipboard.writeText(anchorText);
                      toast.success("已复制锚点到剪贴板");
                    } catch {
                      toast.error("复制失败：请检查浏览器权限");
                    }
                  }}
                >
                  复制锚点
                </Button>
              </div>
            </div>

            {anchorText.trim() ? (
              <pre className="mt-4 whitespace-pre-wrap text-sm rounded-lg border border-border/60 bg-background/20 p-3 overflow-auto max-h-[360px]">
                {anchorText}
              </pre>
            ) : (
              <div className="mt-4 text-xs text-muted-foreground">尚未生成：先在下表完成“破5/破0.809”的手动选择。</div>
            )}
          </Card>

          <Card className="bg-card/60 border-border/70 p-5">
            <div className="font-display text-xl">池子明细（手动生命周期判定）</div>
            <div className="mt-2 text-xs text-muted-foreground">排序：默认连续/反复优先。最多展示 200 行。</div>

            <div className="mt-4 max-h-[620px] overflow-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>代码</TableHead>
                    <TableHead>名称</TableHead>
                    <TableHead>题材</TableHead>
                    <TableHead className="text-right cursor-pointer hover:text-primary" onClick={() => handleSort("streak")}>连续天数<SortIcon field="streak" /></TableHead>
                    <TableHead className="text-right cursor-pointer hover:text-primary" onClick={() => handleSort("recentAppear")}>近K日出现<SortIcon field="recentAppear" /></TableHead>
                    <TableHead className="text-right cursor-pointer hover:text-primary" onClick={() => handleSort("latestAmountYi")}>最新成交额(亿)<SortIcon field="latestAmountYi" /></TableHead>
                    <TableHead className="text-right cursor-pointer hover:text-primary" onClick={() => handleSort("latestPct")}>最新涨幅%<SortIcon field="latestPct" /></TableHead>
                    <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort("latestDate")}>最新日期<SortIcon field="latestDate" /></TableHead>

                    <TableHead>是否跌破5日线？</TableHead>
                    <TableHead>是否跌破0.809？</TableHead>
                    <TableHead>生命周期状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRows.length ? (
                    sortedRows.slice(0, 200).map((r) => {
                      const m = manualMap[r.code] ?? null;
                      const status = calcLifeStatus(m);
                      const statusCls =
                        status === "强势"
                          ? "text-green-400"
                          : status === "破5走弱"
                            ? "text-yellow-400"
                            : status === "破位"
                              ? "text-red-400"
                              : "text-muted-foreground";

                      return (
                        <TableRow key={`${tab}_${r.code}`}>
                          <TableCell className="font-mono-quant">{r.code}</TableCell>
                          <TableCell>{r.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.topic ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono-quant">{r.streak}</TableCell>
                          <TableCell className="text-right font-mono-quant">{r.recentAppear ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono-quant">{r.latestAmountYi ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono-quant">{r.latestPct ?? "—"}</TableCell>
                          <TableCell className="font-mono-quant text-xs text-muted-foreground">{r.latestDate}</TableCell>

                          <TableCell>
                            <BoolSelect
                              value={m?.belowMA5}
                              onChange={(v) => {
                                const next = upsertLifeManual(r.code, { belowMA5: v });
                                setManualMap((mm) => ({ ...mm, [r.code]: next }));
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <BoolSelect
                              value={m?.belowFib0809}
                              onChange={(v) => {
                                const next = upsertLifeManual(r.code, { belowFib0809: v });
                                setManualMap((mm) => ({ ...mm, [r.code]: next }));
                              }}
                            />
                          </TableCell>
                          <TableCell className={`text-sm font-semibold ${statusCls}`}>{status}</TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={11} className="text-sm text-muted-foreground">
                        {loading ? "计算中…" : "暂无数据：先在“复盘记录”导入微观明细"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
