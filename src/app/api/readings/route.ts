import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DEFAULT_DEVICE_ID } from "@/lib/config";
import { computeBucketSeconds, resolveRange, RangeKey } from "@/lib/range";
import { isMetricKey } from "@/lib/metrics";
import { MetricReadingsResponse } from "@/lib/types";

export const runtime = "nodejs";

const VALID_RANGES: RangeKey[] = ["1h", "24h", "7d", "30d", "day", "custom"];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const rangeParam = (searchParams.get("range") ?? "24h") as RangeKey;
  const range = VALID_RANGES.includes(rangeParam) ? rangeParam : "24h";
  const deviceId = searchParams.get("device_id") || DEFAULT_DEVICE_ID;

  const metricKeyParam = searchParams.get("metric_key");
  if (!metricKeyParam || !isMetricKey(metricKeyParam)) {
    return NextResponse.json(
      { error: "`metric_key` is required and must be a known metric" },
      { status: 400 }
    );
  }
  const metricKey = metricKeyParam;

  const { from, to } = resolveRange(range, searchParams.get("from"), searchParams.get("to"));

  if (from.getTime() >= to.getTime()) {
    return NextResponse.json({ error: "`from` must be before `to`" }, { status: 400 });
  }

  const bucketSeconds = computeBucketSeconds(from.getTime(), to.getTime());
  const wholeRangeBucketSeconds = Math.ceil((to.getTime() - from.getTime()) / 1000) + 1;

  const supabaseAdmin = getSupabaseAdmin();

  const [pointsResult, statsResult, latestResult] = await Promise.all([
    supabaseAdmin.rpc("get_bucketed_readings", {
      p_device_id: deviceId,
      p_metric_key: metricKey,
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_bucket_seconds: bucketSeconds,
    }),
    supabaseAdmin.rpc("get_bucketed_readings", {
      p_device_id: deviceId,
      p_metric_key: metricKey,
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_bucket_seconds: wholeRangeBucketSeconds,
    }),
    supabaseAdmin
      .from("readings")
      .select("value, recorded_at")
      .eq("device_id", deviceId)
      .eq("metric_key", metricKey)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (pointsResult.error) {
    console.error("readings query failed", pointsResult.error);
    return NextResponse.json({ error: "failed to load readings" }, { status: 500 });
  }
  if (statsResult.error) {
    console.error("stats query failed", statsResult.error);
    return NextResponse.json({ error: "failed to load stats" }, { status: 500 });
  }
  if (latestResult.error) {
    console.error("latest query failed", latestResult.error);
    return NextResponse.json({ error: "failed to load latest reading" }, { status: 500 });
  }

  const stats = statsResult.data?.[0] ?? null;
  const latest = latestResult.data;

  const response: MetricReadingsResponse = {
    range,
    from: from.toISOString(),
    to: to.toISOString(),
    bucketSeconds,
    points: pointsResult.data ?? [],
    stats: stats
      ? {
          avgValue: stats.avg_value,
          minValue: stats.min_value,
          maxValue: stats.max_value,
          sampleCount: stats.sample_count,
        }
      : null,
    latest: latest ? { value: latest.value, recordedAt: latest.recorded_at } : null,
  };

  return NextResponse.json(response);
}
