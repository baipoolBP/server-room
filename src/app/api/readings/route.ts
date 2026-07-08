import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DEFAULT_DEVICE_ID } from "@/lib/config";
import { computeBucketSeconds, resolveRange, RangeKey } from "@/lib/range";

export const runtime = "nodejs";

const VALID_RANGES: RangeKey[] = ["1h", "24h", "7d", "30d", "custom"];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const rangeParam = (searchParams.get("range") ?? "24h") as RangeKey;
  const range = VALID_RANGES.includes(rangeParam) ? rangeParam : "24h";
  const deviceId = searchParams.get("device_id") || DEFAULT_DEVICE_ID;

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
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_bucket_seconds: bucketSeconds,
    }),
    supabaseAdmin.rpc("get_bucketed_readings", {
      p_device_id: deviceId,
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_bucket_seconds: wholeRangeBucketSeconds,
    }),
    supabaseAdmin
      .from("readings")
      .select("temperature, humidity, recorded_at")
      .eq("device_id", deviceId)
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

  return NextResponse.json({
    range,
    from: from.toISOString(),
    to: to.toISOString(),
    bucketSeconds,
    points: pointsResult.data ?? [],
    stats: stats
      ? {
          avgTemperature: stats.avg_temperature,
          minTemperature: stats.min_temperature,
          maxTemperature: stats.max_temperature,
          avgHumidity: stats.avg_humidity,
          minHumidity: stats.min_humidity,
          maxHumidity: stats.max_humidity,
          sampleCount: stats.sample_count,
        }
      : null,
    latest: latestResult.data,
  });
}
