import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { exportJson, importJson, loadThresholds, saveThresholds } from "@/lib/storage";

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Settings() {
  const [t, setT] = useState(() => loadThresholds());
  const [importText, setImportText] = useState("");

  return (
    <div className="space-y-6">
      <div>
        <div className="font-display text-3xl">设置</div>
        <div className="text-sm text-muted-foreground mt-1">阈值、备份、恢复。</div>
      </div>

      <Card className="bg-card/60 border-border/70 p-5">
        <div className="font-display text-xl">情绪阈值（用于自动分段）</div>
        <div className="mt-2 text-sm text-muted-foreground">
          默认采用你“不截断口径”报告的整数落地：P25=2、P50=6、P75=11、P90=18。你也可以按月/按季度滚动重算后在这里更新。
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div>
            <div className="text-xs text-muted-foreground">P25（冰点上沿）</div>
            <Input
              type="number"
              value={t.p25}
              onChange={(e) => setT((x) => ({ ...x, p25: Number(e.target.value) }))}
              className="mt-2 bg-background/20 border-border/60 font-mono-quant"
            />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">P50（常态中枢）</div>
            <Input
              type="number"
              value={t.p50}
              onChange={(e) => setT((x) => ({ ...x, p50: Number(e.target.value) }))}
              className="mt-2 bg-background/20 border-border/60 font-mono-quant"
            />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">P75（偏强区）</div>
            <Input
              type="number"
              value={t.p75}
              onChange={(e) => setT((x) => ({ ...x, p75: Number(e.target.value) }))}
              className="mt-2 bg-background/20 border-border/60 font-mono-quant"
            />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">P90（长尾入口）</div>
            <Input
              type="number"
              value={t.p90}
              onChange={(e) => setT((x) => ({ ...x, p90: Number(e.target.value) }))}
              className="mt-2 bg-background/20 border-border/60 font-mono-quant"
            />
          </div>
        </div>

        <div className="mt-4">
          <Button
            className="bg-primary text-primary-foreground"
            onClick={() => {
              saveThresholds(t);
              toast.success("已保存阈值");
            }}
          >
            保存阈值
          </Button>
        </div>
      </Card>

      <Card className="bg-card/60 border-border/70 p-5">
        <div className="font-display text-xl">备份与恢复</div>
        <div className="mt-2 text-sm text-muted-foreground">
          数据默认存储在你的浏览器 localStorage。建议定期导出备份（JSON），换电脑/换浏览器时再导入。
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="border-border/70 bg-card/30"
            onClick={() => {
              const json = exportJson();
              download(`gem-review-backup-${new Date().toISOString().slice(0, 10)}.json`, json);
              toast.success("已导出备份");
            }}
          >
            导出备份
          </Button>

          <Button
            className="bg-primary text-primary-foreground"
            onClick={() => {
              try {
                importJson(importText);
                toast.success("已导入（刷新页面生效）");
              } catch {
                toast.error("导入失败：请确认是正确的JSON备份内容");
              }
            }}
          >
            导入备份
          </Button>
        </div>

        <div className="mt-4">
          <div className="text-xs text-muted-foreground">将导出的 JSON 内容粘贴到这里</div>
          <Textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            className="mt-2 min-h-[180px] bg-background/20 border-border/60 font-mono-quant text-sm"
            placeholder="{ ... }"
          />
        </div>
      </Card>

      <Card className="bg-card/60 border-border/70 p-5">
        <div className="font-display text-xl">小提示（建议工作流）</div>
        <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal list-inside">
          <li>每天收盘后：在“复盘记录”导入脚本导出的“入选汇总 CSV”自动写入 n/成交额统计。</li>
          <li>补充：20cm涨停强度、主线题材、当日结构要点。</li>
          <li>到“次日预案”：一键生成模板 → 手工补上你的交易语言与风控点 → 写回记录。</li>
          <li>每周：导出一次 JSON 备份。</li>
        </ol>
      </Card>
    </div>
  );
}
