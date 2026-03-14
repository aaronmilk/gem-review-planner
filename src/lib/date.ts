export function normalizeYmd(input: string): string {
  const s = String(input ?? "").trim();
  if (!s) return s;

  // Accept: YYYY-MM-DD, YYYY/M/D, YYYY/M/DD, etc.
  const m = s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (m) {
    const y = m[1];
    const mo = String(Number(m[2])).padStart(2, "0");
    const d = String(Number(m[3])).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }

  // Fallback: try Date parse
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    const y = dt.getFullYear();
    const mo = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }

  return s;
}
