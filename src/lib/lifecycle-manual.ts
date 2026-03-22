export type LifeManual = {
  belowMA5?: boolean; // 是否跌破5日线
  belowFib0809?: boolean; // 是否跌破0.809
  updatedAt: number;
};

const KEY = "gem_lifecycle_manual_v1";

function readAll(): Record<string, LifeManual> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") return obj;
    return {};
  } catch {
    return {};
  }
}

function writeAll(obj: Record<string, LifeManual>) {
  localStorage.setItem(KEY, JSON.stringify(obj));
}

export function makeLifeKey(code: string) {
  return String(code);
}

export function getLifeManual(code: string): LifeManual | null {
  const all = readAll();
  return all[makeLifeKey(code)] ?? null;
}

export function upsertLifeManual(code: string, patch: Partial<LifeManual>) {
  const all = readAll();
  const k = makeLifeKey(code);
  const cur = all[k] ?? { updatedAt: Date.now() };
  all[k] = { ...cur, ...patch, updatedAt: Date.now() };
  writeAll(all);
  return all[k];
}

export function clearLifeManual(code: string) {
  const all = readAll();
  delete all[makeLifeKey(code)];
  writeAll(all);
}

export type LifeStatus = "强势" | "破5走弱" | "破位" | "待判定";

export function calcLifeStatus(m: LifeManual | null): LifeStatus {
  if (!m) return "待判定";
  if (m.belowFib0809 === true) return "破位";
  if (m.belowMA5 === true) return "破5走弱";
  if (m.belowMA5 === false && m.belowFib0809 === false) return "强势";
  return "待判定";
}

export function lifeAnchorText(
  pools: {
    midCore: { code: string; name: string; topic?: string; streak: number; latestAmountYi?: number }[];
    highMark: { code: string; name: string; topic?: string; streak: number; latestAmountYi?: number }[];
  },
  manuals: Record<string, LifeManual | null>
) {
  const fmt = (r: any) => {
    const m = manuals[r.code] ?? null;
    const st = calcLifeStatus(m);
    const flags = [
      m?.belowMA5 === undefined ? null : m.belowMA5 ? "破5" : "未破5",
      m?.belowFib0809 === undefined ? null : m.belowFib0809 ? "破0.809" : "未破0.809",
    ]
      .filter(Boolean)
      .join("/");
    const t = r.topic ? `·${r.topic}` : "";
    const amt = r.latestAmountYi !== undefined ? `·${r.latestAmountYi}亿` : "";
    return `- ${r.name}（${r.code}）${t} · 连续${r.streak}天${amt} · **${st}**${flags ? `（${flags}）` : ""}`;
  };

  const lines: string[] = [];
  lines.push("## 底层做多逻辑锚点（手动判定版）");
  lines.push("");
  lines.push("### ① 中军池（≥100亿，承载核心）");
  if (pools.midCore.length) pools.midCore.slice(0, 20).forEach((r) => lines.push(fmt(r)));
  else lines.push("- —");
  lines.push("");
  lines.push("### ② 高标池（反复出现/高度票）");
  if (pools.highMark.length) pools.highMark.slice(0, 20).forEach((r) => lines.push(fmt(r)));
  else lines.push("- —");

  lines.push("");
  lines.push("> 解释：\n> - **强势**：未破5 且 未破0.809（可继续以它为主线锚点）\n> - **破5走弱**：破5 但未破0.809（减速、等确认，优先做分歧承接）\n> - **破位**：破0.809（底层逻辑被破坏，优先防守/退出）\n> - **待判定**：你还没选完");

  return lines.join("\n");
}
