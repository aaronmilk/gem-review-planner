import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { buildPool, type PoolRow } from "@/lib/pool";

type SortField = "streak" | "latestAmountYi" | "maxAmountYi" | "latestPct" | "latestDate";
type SortDirection = "asc" | "desc";

export default function Pool() {
  const [minAmount, setMinAmount] = useState(50);
  const [minStreak, setMinStreak] = useState(2);
  const [rows, setRows] = useState<PoolRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortField, setSortField] = useState<SortField>("streak");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  async function refresh() {
    setLoading(true);
    try {
      const out = await buildPool(minAmount, minStreak);
      setRows(out);
    } catch (e: any) {
      toast.error(e?.message ?? "加载失败：请先导入微观明细");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = useMemo(() => {
    const cnt = rows.length;
    const top = rows[0];
    return {
      cnt,
      top: top ? `${top.name}（${top.code}）· 连续${top.streak}天 · 最新${top.latestAmountYi ?? "—"}亿` : "—",
    };
  }, [rows]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
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
      }
      if (aVal === undefined || aVal === null) aVal = -Infinity;
      if (bVal === undefined || bVal === null) bVal = -Infinity;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [rows, sortField, sortDirection]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="font-display text-3xl">中军/高标蓄水池</div>
          <div className="text-sm text-muted-foreground mt-1">
            从微观明细自动筛选“可格局的承载核心”。口径：成交额≥阈值 且 连续上榜≥N天（基于已导入的日期序列）。
          </div>
        </div>

        <div className="flex items-end gap-2 flex-wrap">
          <div className="text-xs text-muted-foreground">成交额阈值（亿）</div>
          <Input
            type="number"
            value={minAmount}
            onChange={(e) => setMinAmount(Number(e.target.value))}
            className="w-[120px] bg-background/20 border-border/60 font-mono-quant"
          />
          <div className="text-xs text-muted-foreground">连续天数</div>
          <Input
            type="number"
            value={minStreak}
            onChange={(e) => setMinStreak(Number(e.target.value))}
            className="w-[100px] bg-background/20 border-border/60 font-mono-quant"
          />
          <Button className="bg-primary text-primary-foreground" onClick={refresh}>
            {loading ? "计算中…" : "刷新"}
          </Button>
          <Button
            variant="outline"
            className="border-border/70 bg-card/30"
            onClick={async () => {
              try {
                const text = rows
                  .map((r) => `${r.name}（${r.code}） 连续${r.streak}天 最新${r.latestAmountYi ?? "—"}亿 题材:${r.topic ?? "—"}`)
                  .join("\n");
                if (!text) {
                  toast.error("没有可复制内容");
                  return;
                }
                await navigator.clipboard.writeText(text);
                toast.success("已复制蓄水池清单");
              } catch {
                toast.error("复制失败：请检查浏览器权限");
              }
            }}
          >
            复制清单
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-card/60 border-border/70 p-5">
          <div className="text-xs text-muted-foreground">池子数量</div>
          <div className="mt-2 font-mono-quant text-2xl">{summary.cnt}</div>
          <div className="mt-2 text-xs text-muted-foreground">Top：{summary.top}</div>
        </Card>
        <Card className="bg-card/60 border-border/70 p-5">
          <div className="text-xs text-muted-foreground">使用建议</div>
          
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground list-disc list-inside">
            <li>池子没票：按“电风扇轮动”对待，少格局，多兑现。</li>
            <li>池子有票且连续上榜：优先围绕它做分歧低吸/趋势跟随。</li>
            <li>后续若接入收盘价/MA5，可自动提示“破5日线=承载力下降”。</li>
          </ul>
        </Card>
      </div>

      <Card className="bg-card/60 border-border/70 p-5">
        <div className="font-display text-xl">池子明细</div>
        <div className="mt-2 text-xs text-muted-foreground">最多展示 200 行；排序：连续天数优先，其次成交额。</div>

        <div className="mt-4 max-h-[560px] overflow-auto rounded-lg border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>代码</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>题材</TableHead>
                <TableHead className="text-right cursor-pointer hover:text-primary" onClick={() => handleSort("streak")}>
                  连续天数<SortIcon field="streak" />
                </TableHead>
                <TableHead className="text-right cursor-pointer hover:text-primary" onClick={() => handleSort("latestAmountYi")}>
                  最新成交额(亿)<SortIcon field="latestAmountYi" />
                </TableHead>
                <TableHead className="text-right cursor-pointer hover:text-primary" onClick={() => handleSort("maxAmountYi")}>
                  最高成交额(亿)<SortIcon field="maxAmountYi" />
                </TableHead>
                <TableHead className="text-right cursor-pointer hover:text-primary" onClick={() => handleSort("latestPct")}>
                  最新涨幅%<SortIcon field="latestPct" />
                </TableHead>
                <TableHead className="cursor-pointer hover:text-primary" onClick={() => handleSort("latestDate")}>
                  最新日期<SortIcon field="latestDate" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.length ? (
                sortedRows.slice(0, 200).map((r) => (
                  <TableRow key={r.code}>
                    <TableCell className="font-mono-quant">{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.topic ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono-quant">{r.streak}</TableCell>
                    <TableCell className="text-right font-mono-quant">{r.latestAmountYi ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono-quant">{r.maxAmountYi ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono-quant">{r.latestPct ?? "—"}</TableCell>
                    <TableCell className="font-mono-quant text-xs text-muted-foreground">{r.latestDate}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-sm text-muted-foreground">
                    {loading ? "计算中…" : "暂无数据：先在“复盘记录”导入微观明细"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
