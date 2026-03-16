import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { loadThresholds } from "@/lib/storage";
import type { DailyRecord } from "@/lib/types";
import { calcStage, formatYi } from "@/lib/logic";
import { parseSignalCsv } from "@/lib/csv";
import { normalizeYmd } from "@/lib/date";
import { nanoid } from "nanoid";
import { useRecords } from "@/hooks/useRecords";
import * as XLSX from "xlsx";
import {
  clearMicroAll,
  upsertMicroRows,
  listMicroAll,
  listMicroByDate,
  listMicroDates,
  findPrevMicroDate,
  type MicroStockRow,
} from "@/lib/microdb";
import { deriveMacroFromMicroDate } from "@/lib/micro-derive";

function todayYmd() {
  const d = new Date();
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function Logbook() {
  const thresholds = loadThresholds();
  const { records, remote, upsert, remove, fetchLatest, refresh } = useRecords();

  // 微观明细（Micro_Stocks）查看器
  const [microDate, setMicroDate] = useState(todayYmd());
  type MicroStockRowView = MicroStockRow & { _isNewFaceAuto?: boolean | null; _prevDate?: string | null };
  const [microRows, setMicroRows] = useState<MicroStockRowView[]>([]);
  const [microLoading, setMicroLoading] = useState(false);

  // 微观：全部数据模式
  const [microMode, setMicroMode] = useState<"latest" | "all">("latest");
  const [microAllRows, setMicroAllRows] = useState<MicroStockRowView[]>([]);
  const [microAllLoading, setMicroAllLoading] = useState(false);

  // 全量展示：多日罗列（按 date 倒序）
  const microAllView = useMemo(() => {
    if (!microAllRows.length) return [] as MicroStockRowView[];
    // “全部数据”模式：直接展示全量（按日期倒序），不提供日期筛选，避免与“按日期”重复。
    return microAllRows
      .slice()
      .sort((a, b) => (a.date === b.date ? a.code.localeCompare(b.code) : b.date.localeCompare(a.date)))
      .slice(0, 2000);
  }, [microAllRows]);
  const [microDates, setMicroDates] = useState<string[]>([]);

  // 新面孔口径：对比最近 N 个“已导入日期”（不接入交易所日历）
  const [newFaceLookback, setNewFaceLookback] = useState<1 | 3 | 5>(1);


  async function refreshMicro(d: string, lookback?: 1 | 3 | 5) {
    setMicroLoading(true);
    try {
      const rows = await listMicroByDate(d);

      // 以“已导入数据”的日期序列为准（不接入交易所日历）
      const dates = await listMicroDates();
      setMicroDates(dates);

      const lb = lookback ?? newFaceLookback;

      // 选出 d 之前的最近 N 个日期
      const prevDates = dates.filter((x) => x < d).slice(-lb);
      const prevCodes = new Set<string>();
      for (const pd of prevDates) {
        const pr = await listMicroByDate(pd);
        pr.forEach((x) => prevCodes.add(x.code));
      }

      const prevDate = await findPrevMicroDate(d);

      // 自动新面孔：T 日 code 不在“最近 N 日集合”里
      const withDerived = rows.map((r) => ({
        ...r,
        _isNewFaceAuto: prevDates.length ? !prevCodes.has(r.code) : null,
        _prevDate: prevDate,
      }));

      setMicroRows(withDerived as MicroStockRowView[]);
    } finally {
      setMicroLoading(false);
    }
  }

  function toNum(v: any): number | undefined {
    if (v === null || v === undefined || v === "") return undefined;
    const s = String(v).trim().replace(/,/g, "");
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  }

  function toYmd(v: any): string {
    if (v === null || v === undefined || v === "") return "";

    // Excel serial date (typically 20,000~60,000)
    if (typeof v === "number" && v > 20000 && v < 60000) {
      const dc = XLSX.SSF.parse_date_code(v);
      if (dc?.y && dc?.m && dc?.d) return normalizeYmd(`${dc.y}-${dc.m}-${dc.d}`);
    }

    // xlsx 读取到 Date 或字符串
    if (v instanceof Date && !Number.isNaN(v.getTime())) return normalizeYmd(v.toISOString().slice(0, 10));
    return normalizeYmd(String(v));
  }

  async function refreshMicroAll() {
    setMicroAllLoading(true);
    try {
      const rows = await listMicroAll();
      const dates = await listMicroDates();
      setMicroDates(dates);

      // 全量视图原样加载
      const derived: MicroStockRowView[] = [];
      for (const r of rows) derived.push({ ...r, _isNewFaceAuto: null, _prevDate: null });
      setMicroAllRows(derived);
    } finally {
      setMicroAllLoading(false);
    }
  }

  useEffect(() => {
    // 首次进入时加载日期列表（如果有数据）
    (async () => {
      const dates = await listMicroDates();
      setMicroDates(dates);
    })();
  }, []);

  async function saveMicroTable() {
    try {
      // 这里的“保存微观”指把当前表格视图的数据（导入/加载后的）再次写入 IndexedDB。
      // 注：导入时已经写入过，此按钮更像“确认/覆盖保存”。
      if (microMode === "all") {
        if (!microAllRows.length) {
          toast.error("全部数据尚未加载：请先切到“全部数据”让它自动加载一次");
          return;
        }
        await upsertMicroRows(microAllRows);
        toast.success(`已保存微观明细（全部数据）${microAllRows.length} 条`);
      } else {
        if (!microRows.length) {
          toast.error("当前日期没有数据可保存");
          return;
        }
        await upsertMicroRows(microRows);
        toast.success(`已保存微观明细（${microDate}）${microRows.length} 条`);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "保存微观失败");
    }
  }

  async function importMicroFromFile(file: File) {
    const name = file.name.toLowerCase();

    // 支持：xlsx / csv
    let rows: MicroStockRow[] = [];

    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const buf = await file.arrayBuffer();
      // cellDates=true 能把日期单元格读成 Date；raw:false 优先使用格式化文本
      const wb = XLSX.read(buf, { cellDates: true });
      const sheet = wb.Sheets["全部明细数据"] ?? wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<any>(sheet, { defval: null, raw: false });
      rows = json
        .map((r: any) => {
          const date = toYmd(r["日期"] ?? r["date"] ?? "");
          const code = String(r["代码"] ?? r["code"] ?? "").trim();
          const name = String(r["名称"] ?? r["name"] ?? "").trim();
          if (!date || !code) return null;
          const amountYi = toNum(r["成交额_亿"] ?? r["成交额"] ?? r["amountYi"]);
          const pct = toNum(r["涨幅(%)"] ?? r["涨幅"] ?? r["pct"]);
          const topic = r["题材"] ?? r["topic"];
          const isNewFace = r["是否新面孔"] ?? r["isNewFace"];
          return {
            id: `${date}_${code}`,
            date,
            code,
            name,
            amountYi,
            pct,
            topic: topic ? String(topic) : undefined,
            isNewFace: typeof isNewFace === "boolean" ? isNewFace : isNewFace === "True" || isNewFace === 1,
          } as MicroStockRow;
        })
        .filter(Boolean) as MicroStockRow[];
    } else {
      const text = await file.text();
      // 简单 CSV：用 xlsx 解析更鲁棒
      const wb = XLSX.read(text, { type: "string" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<any>(sheet, { defval: null, raw: false });
      rows = json
        .map((r: any) => {
          const date = toYmd(r["日期"] ?? r["date"] ?? "");
          const code = String(r["代码"] ?? r["code"] ?? "").trim();
          const name = String(r["名称"] ?? r["name"] ?? "").trim();
          if (!date || !code) return null;
          const amountYi = toNum(r["成交额_亿"] ?? r["成交额"] ?? r["amountYi"]);
          const pct = toNum(r["涨幅(%)"] ?? r["涨幅"] ?? r["pct"]);
          const topic = r["题材"] ?? r["topic"];
          const isNewFace = r["是否新面孔"] ?? r["isNewFace"];
          return {
            id: `${date}_${code}`,
            date,
            code,
            name,
            amountYi,
            pct,
            topic: topic ? String(topic) : undefined,
            isNewFace: typeof isNewFace === "boolean" ? isNewFace : isNewFace === "True" || isNewFace === 1,
          } as MicroStockRow;
        })
        .filter(Boolean) as MicroStockRow[];
    }

    if (!rows.length) {
      toast.error("未识别到任何微观明细行：请检查列名（date/code/name/amountYi/pct/topic）与日期格式");
      return;
    }

    // 修复：不再清空所有数据，而是逐条 upsert（keyPath=id 保证同日期同股票覆盖）
    // 如果之前有其他日期的数据，会保留下来
    await upsertMicroRows(rows);

    // 导入后默认展示“最新日期”（避免用户导入了历史数据但仍停留在今天导致看起来像没导入）
    const latest = rows.reduce((acc, r) => (acc && acc > r.date ? acc : r.date), "");
    toast.success(`已导入微观明细 ${rows.length} 条（IndexedDB），最新日期：${latest || "—"}`);
    if (latest) {
      setMicroDate(latest);
      // 默认刷新“最新日期”是为了让用户第一眼就看到数据；
      // 但所有日期的数据都已写入 IndexedDB，可在“全部数据”或切换日期查看。
      await refreshMicro(latest);
      // 同步刷新日期列表
      setMicroDates(await listMicroDates());
    } else {
      await refreshMicro(microDate);
    }

    // 如果用户当前在“全部数据”模式，也顺手刷新一次
    if (microMode === "all") await refreshMicroAll();
  }

  const [draft, setDraft] = useState<DailyRecord>(() => ({
    id: nanoid(),
    date: todayYmd(),
    n: 0,
    themes: "",
    notes: "",
    nextPlan: "",
    updatedAt: Date.now(),
  }));

  const computedStage = useMemo(() => calcStage(draft.n, thresholds), [draft.n, thresholds]);

  async function save() {
    try {
      const rec = await upsert({
        ...draft,
        stage: draft.stage ?? computedStage,
        updatedAt: Date.now(),
      });
      toast.success("已保存");
      setDraft({ ...rec });
    } catch (e: any) {
      toast.error(e?.message ?? "保存失败");
    }
  }

  async function importFromCsv(file: File) {
    const text = await file.text();
    const items = parseSignalCsv(text);
    if (!items.length) {
      toast.error("没有识别到可用的CSV（需要包含列：日期、成交额）");
      return;
    }

    let count = 0;
    for (const it of items) {
      const rec: DailyRecord = {
        id: `rec_${it.date}`,
        date: it.date,
        n: it.n,
        meanAmtYi: it.meanAmtYi,
        medianAmtYi: it.medianAmtYi,
        midCoreMeanAmtYi: it.midCoreMeanAmtYi,
        midCoreMedianAmtYi: it.midCoreMedianAmtYi,
        limitUp20Count: it.limitUp20Count,
        limitUp20Share: it.limitUp20Share,

        overlapRatio: it.overlapRatio,
        core100Count: it.core100Count,
        resonance: it.resonance,
        microStructure: it.microStructure,
        anomalySignal: it.anomalySignal,
        nextJudgement: it.nextJudgement,
        action: it.action,

        themes: "",
        notes: "",
        nextPlan: "",
        updatedAt: Date.now(),
      };
      await upsert(rec);
      count++;
    }

    toast.success(`已导入 ${count} 个交易日（自动生成 n/均值/中位数）`);
  }

  function loadToDraft(r: DailyRecord) {
    setDraft(r);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="font-display text-3xl">复盘记录（双表）</div>
          <div className="text-sm text-muted-foreground mt-1">
            这里分成两套数据：
            <b>宏观日表</b>（n/20cm/成交额/Overlap/中军/共振…）与 <b>微观明细表</b>（日期×股票明细）。
            先把两张表导入齐，后面的判断与预案才会稳定。
          </div>
        </div>

        <div className="flex gap-2 flex-wrap justify-end">
          {remote ? (
            <Button
              variant="outline"
              className="border-border/70 bg-card/30"
              onClick={async () => {
                try {
                  await fetchLatest();
                  toast.success("已抓取并写入最新交易日数据");
                } catch (e: any) {
                  toast.error(e?.message ?? "抓取失败");
                }
              }}
            >
              自动抓取最新（宏观）
            </Button>
          ) : null}

          <label className="inline-flex items-center gap-2">
            <Input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFromCsv(f);
              }}
            />
            <Button variant="outline" className="border-border/70 bg-card/30" asChild>
              <span>导入宏观CSV</span>
            </Button>
          </label>

          <label className="inline-flex items-center gap-2">
            <Input
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importMicroFromFile(f);
              }}
            />
            <Button variant="outline" className="border-border/70 bg-card/30" asChild>
              <span>导入微观明细（Excel/CSV）</span>
            </Button>
          </label>

          <Button onClick={save} className="bg-primary text-primary-foreground">
            保存宏观
          </Button>
          <Button onClick={saveMicroTable} className="bg-primary text-primary-foreground">
            保存微观
          </Button>
        </div>
      </div>

      <Tabs defaultValue="macro" className="w-full">
        <TabsList className="bg-card/40">
          <TabsTrigger value="macro">宏观日表</TabsTrigger>
          <TabsTrigger value="micro">微观明细表</TabsTrigger>
        </TabsList>

        <TabsContent value="macro" className="mt-4">
          <Card className="bg-card/60 border-border/70 p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="text-xs text-muted-foreground">日期</div>
            <Input
              value={draft.date}
              onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
              placeholder="YYYY-MM-DD"
              className="mt-2 bg-background/20 border-border/60"
            />
          </div>

          <div>
            <div className="text-xs text-muted-foreground">当日符合个数 n（不截断）</div>
            <Input
              value={String(draft.n ?? 0)}
              onChange={(e) => setDraft((d) => ({ ...d, n: Number(e.target.value) }))}
              type="number"
              min={0}
              className="mt-2 bg-background/20 border-border/60 font-mono-quant"
            />
            <div className="mt-2 text-xs text-muted-foreground">
              自动阶段：<span className="text-primary font-semibold">{computedStage}</span>
              <span className="ml-2">（可在“设置”调整阈值）</span>
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground">单条成交额（亿，自动或手填）</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Input
                value={draft.meanAmtYi ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, meanAmtYi: Number(e.target.value) }))}
                placeholder="均值"
                type="number"
                className="bg-background/20 border-border/60 font-mono-quant"
              />
              <Input
                value={draft.medianAmtYi ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, medianAmtYi: Number(e.target.value) }))}
                placeholder="中位数"
                type="number"
                className="bg-background/20 border-border/60 font-mono-quant"
              />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">导入CSV后会自动计算；手填时建议单位为“亿”。</div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground">主线/题材（可选）</div>
            <Input
              value={draft.themes ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, themes: e.target.value }))}
              placeholder="例如：AI应用、CPO、算力、传媒..."
              className="mt-2 bg-background/20 border-border/60"
            />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">20cm涨停（可选）</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Input
                value={draft.limitUp20Count ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, limitUp20Count: Number(e.target.value) }))}
                placeholder="数量"
                type="number"
                className="bg-background/20 border-border/60 font-mono-quant"
              />
              <Input
                value={draft.limitUp20Share ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, limitUp20Share: Number(e.target.value) }))}
                placeholder="占比(0-1)"
                type="number"
                step={0.01}
                className="bg-background/20 border-border/60 font-mono-quant"
              />
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs text-muted-foreground">当日复盘（要点）</div>
          <Textarea
            value={draft.notes ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            placeholder="结构、量价、情绪、分歧点、要规避的坑..."
            className="mt-2 min-h-[120px] bg-background/20 border-border/60"
          />
        </div>

        <div className="mt-4">
          <div className="text-xs text-muted-foreground">次日预案（可在“次日预案”自动生成后回填）</div>
          <Textarea
            value={draft.nextPlan ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, nextPlan: e.target.value }))}
            placeholder="明天盯什么？做什么？不做什么？触发条件是什么？"
            className="mt-2 min-h-[120px] bg-background/20 border-border/60"
          />
        </div>
          </Card>
        </TabsContent>

        <TabsContent value="micro" className="mt-4">
          <Card className="bg-card/60 border-border/70 p-5">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div>
                <div className="font-display text-xl">微观明细（日期×股票）</div>
                <div className="text-sm text-muted-foreground mt-1">
                  先导入明细，再按日期查看。用途：计算 Overlap_Ratio（昨日留存率）、百亿中军数（≥100亿）、题材集中度、容弹共振候选池。
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <div className="inline-flex rounded-md border border-border/60 overflow-hidden">
                  <Button
                    type="button"
                    variant={microMode === "latest" ? "default" : "outline"}
                    size="sm"
                    className={
                      microMode === "latest"
                        ? "rounded-none bg-primary text-primary-foreground"
                        : "rounded-none border-0 bg-card/30"
                    }
                    onClick={() => {
                      setMicroMode("latest");
                      // 按日期模式：日期输入回到当前 microDate
                      setMicroDate((d) => d || todayYmd());
                    }}
                  >
                    按日期
                  </Button>
                  <Button
                    type="button"
                    variant={microMode === "all" ? "default" : "outline"}
                    size="sm"
                    className={
                      microMode === "all"
                        ? "rounded-none bg-primary text-primary-foreground"
                        : "rounded-none border-0 bg-card/30"
                    }
                    onClick={async () => {
                      setMicroMode("all");
                      // 全部数据模式：直接展示全量，不提供筛选
                      setMicroDate("");
                      // 进入即加载（避免还要点“加载全部”）
                      if (!microAllRows.length) await refreshMicroAll();
                    }}
                  >
                    全部数据
                  </Button>
                </div>

                <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
                  新面孔口径：
                  {[1, 3, 5].map((n) => (
                    <Button
                      key={n}
                      type="button"
                      variant={newFaceLookback === n ? "default" : "outline"}
                      size="sm"
                      className={
                        newFaceLookback === n
                          ? "h-7 px-2 bg-primary text-primary-foreground"
                          : "h-7 px-2 border-border/60 bg-card/30"
                      }
                      onClick={async () => {
                        const lb = n as 1 | 3 | 5;
                        setNewFaceLookback(lb);
                        if (microMode === "latest") await refreshMicro(microDate, lb);
                      }}
                    >
                      T-{n}
                    </Button>
                  ))}
                </div>


                {microMode === "latest" ? (
                  <Input
                    value={microDate}
                    onChange={(e) => setMicroDate(e.target.value)}
                    placeholder="YYYY-MM-DD"
                    className="w-[140px] bg-background/20 border-border/60 font-mono-quant"
                  />
                ) : (
                  <div className="w-[140px] text-xs text-muted-foreground font-mono-quant px-2">
                    全量展示
                  </div>
                )}

                {microMode === "latest" ? (
                  <>
                    <Button
                      variant="outline"
                      className="border-border/70 bg-card/30"
                      onClick={async () => {
                        await refreshMicro(microDate);
                      }}
                    >
                      {microLoading ? "加载中…" : "查看"}
                    </Button>

                    <Button
                      className="bg-primary text-primary-foreground"
                      onClick={async () => {
                        try {
                          if (!microDate) {
                            toast.error("请先选择日期");
                            return;
                          }
                          // 以 IndexedDB 为准（避免 UI 状态与真实库不一致）
                          const d = await deriveMacroFromMicroDate(microDate);

                          const existing = records.find((r) => r.date === d.date);
                          const id = existing?.id ?? `rec_${d.date}`;

                          const topicTxt = d.topTopic
                            ? `${d.topTopic.topic}（${d.topTopic.count}/${d.n}=${Math.round(d.topTopic.ratio * 100)}%）`
                            : "";

                          await upsert({
                            ...(existing ?? ({} as any)),
                            id,
                            date: d.date,
                            // 若宏观 n 未填或为 0，则用微观明细条数兜底；否则保留用户的“不截断口径”n
                            n: existing?.n && existing.n > 0 ? existing.n : d.n,

                            overlapRatio: d.overlapRatio ?? undefined,
                            core100Count: d.core100Count,
                            resonance: d.resonance,
                            microStructure: d.microStructure,

                            // 自动给一个“题材提示”，方便后续生成预案；你也可在宏观日表手工改
                            themes: existing?.themes?.trim() ? existing.themes : topicTxt,

                            updatedAt: Date.now(),
                          });

                          toast.success("已用微观明细回填宏观：Overlap/中军/共振/结构/题材提示");
                        } catch (e: any) {
                          toast.error(e?.message ?? "回填失败");
                        }
                      }}
                    >
                      用微观回填宏观
                    </Button>
                  </>
                ) : null}
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-border/60 bg-background/20 p-3 text-sm">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-xs text-muted-foreground">
                  {microMode === "all" ? "微观总条数（全部日期）" : "当前日期明细条数"}
                </div>
                <div className="font-mono-quant">
                  {microMode === "all" ? microAllRows.length : microRows.length}
                </div>
              </div>
            </div>

            <div className="mt-4 max-h-[520px] overflow-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>代码</TableHead>
                    <TableHead>名称</TableHead>
                    <TableHead className="text-right">成交额(亿)</TableHead>
                    <TableHead className="text-right">涨幅%</TableHead>
                    <TableHead>题材</TableHead>
                    <TableHead>新面孔（自动）</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(microMode === "all" ? microAllView : microRows).length ? (
                    (microMode === "all" ? microAllView : microRows).flatMap((r, idx, arr) => {
                      const rows: any[] = [];
                      if (microMode === "all") {
                        const prev = idx > 0 ? arr[idx - 1] : null;
                        if (!prev || prev.date !== r.date) {
                          rows.push(
                            <TableRow key={`sep_${r.date}`} className="bg-card/30">
                              <TableCell colSpan={6} className="text-xs text-muted-foreground font-mono-quant">
                                {r.date}
                              </TableCell>
                            </TableRow>
                          );
                        }
                      }
                      rows.push(
                        <TableRow key={r.id}>
                          <TableCell
                            className={
                              "font-mono-quant " +
                              (r._isNewFaceAuto === false ? "text-red-400" : "")
                            }
                          >
                            {r.code}
                          </TableCell>
                          <TableCell className={r._isNewFaceAuto === false ? "text-red-400" : ""}>
                            {r.name}
                          </TableCell>
                          <TableCell className="text-right font-mono-quant">{r.amountYi ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono-quant">{r.pct ?? "—"}</TableCell>
                          <TableCell>{r.topic ?? "—"}</TableCell>
                          <TableCell>
                            {r._isNewFaceAuto === null ? (
                              <span className="text-muted-foreground">?</span>
                            ) : r._isNewFaceAuto ? (
                              "✓"
                            ) : (
                              "—"
                            )}
                          </TableCell>
                        </TableRow>
                      );
                      return rows;
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-sm text-muted-foreground">
                        暂无数据：先点页头「导入微观明细（Excel/CSV）」导入后再选择日期/模式查看。
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {microMode === "all" && microAllRows.length > 2000 ? (
              <div className="mt-2 text-xs text-muted-foreground">
                为避免页面卡顿，“全部数据”模式最多展示 2000 行。建议用日期筛选或后续我们加导出/分页。
              </div>
            ) : null}
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="bg-card/60 border-border/70 p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display text-xl">历史记录</div>
            <div className="text-sm text-muted-foreground mt-1">点击任意一行即可载入编辑。</div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              className="border-border/70 bg-card/30"
              onClick={async () => {
                if (!confirm("确定要清空所有宏观记录吗？此操作不可撤销。")) return;
                // 清空所有宏观记录
                localStorage.removeItem("gem_review_records_v1");
                // 刷新页面数据
                await refresh();
                toast.success("已清空所有宏观记录");
              }}
            >
              清空全部
            </Button>
            <Button
              variant="outline"
              className="border-border/70 bg-card/30"
              onClick={() => {
                setDraft({
                  id: nanoid(),
                  date: todayYmd(),
                  n: 0,
                  themes: "",
                  notes: "",
                  nextPlan: "",
                  updatedAt: Date.now(),
                });
              }}
            >
              新建
            </Button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日期</TableHead>
                <TableHead className="text-right">n</TableHead>
                <TableHead>阶段</TableHead>
                <TableHead className="text-right">20cm涨停</TableHead>
                <TableHead className="text-right">均值成交额</TableHead>
                <TableHead className="text-right">中位数成交额</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r) => {
                const stage = r.stage ?? calcStage(r.n, thresholds);
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => loadToDraft(r)}>
                    <TableCell className="font-mono-quant">{normalizeYmd(r.date)}</TableCell>
                    <TableCell className="text-right font-mono-quant">{r.n}</TableCell>
                    <TableCell>{stage}</TableCell>
                    <TableCell className="text-right font-mono-quant">{r.limitUp20Count ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono-quant">{formatYi(r.meanAmtYi)}</TableCell>
                    <TableCell className="text-right font-mono-quant">{formatYi(r.medianAmtYi)}</TableCell>
                    <TableCell className="text-right">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="destructive" size="sm" onClick={(e) => e.stopPropagation()}>
                            删除
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-card border-border/70">
                          <DialogHeader>
                            <DialogTitle>确认删除？</DialogTitle>
                            <DialogDescription>此操作不可撤销（除非你有导出的备份）。</DialogDescription>
                          </DialogHeader>
                          <DialogFooter>
                            <Button
                              variant="destructive"
                              onClick={async () => {
                                try {
                                  await remove(r.id);
                                  toast.success("已删除");
                                } catch (e: any) {
                                  toast.error(e?.message ?? "删除失败");
                                }
                              }}
                            >
                              删除
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
