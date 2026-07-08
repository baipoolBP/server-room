export type RangeKey = "1h" | "24h" | "7d" | "30d" | "custom";

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "1h", label: "1 ชั่วโมง" },
  { key: "24h", label: "24 ชั่วโมง" },
  { key: "7d", label: "7 วัน" },
  { key: "30d", label: "30 วัน" },
  { key: "custom", label: "กำหนดเอง" },
];

const RANGE_MS: Record<Exclude<RangeKey, "custom">, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export function resolveRange(
  range: RangeKey,
  from?: string | null,
  to?: string | null
): { from: Date; to: Date } {
  const now = new Date();

  if (range === "custom" && from && to) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (!Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime())) {
      return { from: fromDate, to: toDate };
    }
  }

  const spanMs = RANGE_MS[range as Exclude<RangeKey, "custom">] ?? RANGE_MS["24h"];
  return { from: new Date(now.getTime() - spanMs), to: now };
}

// Picks an aggregation bucket size so charts stay smooth and payloads stay
// small regardless of how wide the selected time range is.
export function computeBucketSeconds(fromMs: number, toMs: number): number {
  const spanSeconds = Math.max(1, (toMs - fromMs) / 1000);

  if (spanSeconds <= 3 * 60 * 60) return 60; // <=3h -> 1 min buckets
  if (spanSeconds <= 12 * 60 * 60) return 300; // <=12h -> 5 min buckets
  if (spanSeconds <= 2 * 24 * 60 * 60) return 900; // <=2d -> 15 min buckets
  if (spanSeconds <= 10 * 24 * 60 * 60) return 3600; // <=10d -> 1 hour buckets
  return 86400; // otherwise -> 1 day buckets
}
