export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey(): string {
  return dateKey(new Date());
}

export function timestampToDateKey(timestamp: string): string {
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) {
    throw new Error(`Unparseable timestamp: "${timestamp}"`);
  }
  return dateKey(d);
}

// Parses amounts like "1,234.56 USDC" -> 1234.56. Returns null for
// non-USDC amounts (e.g. "97 ZIG"), which must be ignored.
export function parseUsdcAmount(raw: string): number | null {
  const match = raw.trim().match(/^([\d,]+(?:\.\d+)?)\s*USDC$/i);
  if (!match) return null;
  return parseFloat(match[1].replace(/,/g, ""));
}
