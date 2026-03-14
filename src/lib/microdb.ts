import { openDB } from "idb";

export type MicroStockRow = {
  id: string; // `${date}_${code}`
  date: string; // YYYY-MM-DD
  code: string;
  name: string;
  amountYi?: number;
  pct?: number;
  topic?: string;
  isNewFace?: boolean;
};

const DB_NAME = "gem_review_db_v1";
const DB_VERSION = 1;

async function db() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(upgradeDb) {
      if (!upgradeDb.objectStoreNames.contains("micro_stocks")) {
        const store = upgradeDb.createObjectStore("micro_stocks", { keyPath: "id" });
        store.createIndex("by_date", "date");
        store.createIndex("by_code", "code");
      }
    },
  });
}

export async function upsertMicroRows(rows: MicroStockRow[]) {
  const d = await db();
  const tx = d.transaction("micro_stocks", "readwrite");
  for (const r of rows) tx.store.put(r);
  await tx.done;
}

export async function listMicroByDate(date: string): Promise<MicroStockRow[]> {
  const d = await db();
  return d.getAllFromIndex("micro_stocks", "by_date", date);
}

export async function listMicroAll(): Promise<MicroStockRow[]> {
  const d = await db();
  return d.getAll("micro_stocks");
}

/**
 * 返回已导入的全部日期（YYYY-MM-DD，升序）。
 * 说明：从 key = `${date}_${code}` 提取，不依赖交易所日历。
 */
export async function listMicroDates(): Promise<string[]> {
  const d = await db();
  const keys = (await d.getAllKeys("micro_stocks")) as string[];
  if (!keys?.length) return [];

  const dates = new Set<string>();
  for (const k of keys) {
    const i = String(k).indexOf("_");
    if (i <= 0) continue;
    const dt = String(k).slice(0, i);
    if (dt) dates.add(dt);
  }
  return Array.from(dates).sort();
}

export async function upsertMicroRow(row: MicroStockRow) {
  const d = await db();
  await d.put("micro_stocks", row);
}

/**
 * 获取“已导入数据里”的上一条日期（按字符串 YYYY-MM-DD 比较）。
 * 说明：这里不接入交易所日历；以数据库中存在的日期为准。
 */
export async function findPrevMicroDate(date: string): Promise<string | null> {
  const d = await db();
  const keys = (await d.getAllKeys("micro_stocks")) as string[];
  if (!keys?.length) return null;

  // key = `${date}_${code}`
  const dates = new Set<string>();
  for (const k of keys) {
    const i = String(k).indexOf("_");
    if (i <= 0) continue;
    const dt = String(k).slice(0, i);
    if (dt) dates.add(dt);
  }
  const arr = Array.from(dates).sort(); // asc

  // 找到 < date 的最大值
  let prev: string | null = null;
  for (const dt of arr) {
    if (dt < date) prev = dt;
    else break;
  }
  return prev;
}

export async function clearMicroAll() {
  const d = await db();
  const tx = d.transaction("micro_stocks", "readwrite");
  await tx.store.clear();
  await tx.done;
}
