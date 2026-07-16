import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DEFAULT_DEVICE_ID } from "@/lib/config";
import { isSensorType, SENSOR_TYPE_METRICS } from "@/lib/sensorTypes";
import { isMetricKey, METRIC_DEFINITIONS } from "@/lib/metrics";

export const runtime = "nodejs";

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.INGEST_API_KEY;
  if (!expected) return false;

  const provided = request.headers.get("x-api-key") ?? "";
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);

  // Compare equal-length buffers only; mismatched length is already "not equal"
  // but doing this check first avoids timingSafeEqual throwing on length mismatch.
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { device_id, sensor_type, label, metrics, recorded_at } = (body ?? {}) as {
    device_id?: unknown;
    sensor_type?: unknown;
    label?: unknown;
    metrics?: unknown;
    recorded_at?: unknown;
  };

  if (typeof sensor_type !== "string" || !isSensorType(sensor_type)) {
    return NextResponse.json({ error: "unknown or missing sensor_type" }, { status: 400 });
  }

  if (typeof metrics !== "object" || metrics === null || Array.isArray(metrics)) {
    return NextResponse.json({ error: "metrics must be an object" }, { status: 400 });
  }

  const expectedMetricKeys: readonly string[] = SENSOR_TYPE_METRICS[sensor_type];
  const entries = Object.entries(metrics as Record<string, unknown>);

  if (entries.length === 0) {
    return NextResponse.json({ error: "metrics must not be empty" }, { status: 400 });
  }

  const validatedMetrics: { metricKey: string; value: number }[] = [];
  for (const [key, value] of entries) {
    if (!isMetricKey(key) || !expectedMetricKeys.includes(key)) {
      return NextResponse.json(
        { error: `metric "${key}" is not valid for sensor_type "${sensor_type}"` },
        { status: 400 }
      );
    }
    const { min, max } = METRIC_DEFINITIONS[key];
    if (!isFiniteNumber(value) || value < min || value > max) {
      return NextResponse.json(
        { error: `metric "${key}" must be a number between ${min} and ${max}` },
        { status: 400 }
      );
    }
    validatedMetrics.push({ metricKey: key, value });
  }

  const resolvedDeviceId =
    typeof device_id === "string" && device_id.trim() ? device_id.trim() : DEFAULT_DEVICE_ID;

  let resolvedRecordedAt = new Date();
  if (typeof recorded_at === "string") {
    const parsed = new Date(recorded_at);
    if (!Number.isNaN(parsed.getTime())) resolvedRecordedAt = parsed;
  }
  const recordedAtIso = resolvedRecordedAt.toISOString();

  const supabaseAdmin = getSupabaseAdmin();

  // Only include `label` in the upsert payload when one was actually sent -
  // omitting a column from a Supabase upsert leaves it untouched on conflict,
  // so a device's existing label survives readings that don't repeat it.
  const deviceUpsert: Record<string, unknown> = {
    device_id: resolvedDeviceId,
    sensor_type,
  };
  if (typeof label === "string" && label.trim()) {
    deviceUpsert.label = label.trim();
  }

  const { error: deviceError } = await supabaseAdmin
    .from("devices")
    .upsert(deviceUpsert, { onConflict: "device_id" });

  if (deviceError) {
    console.error("device upsert failed", deviceError);
    return NextResponse.json({ error: "failed to register device" }, { status: 500 });
  }

  const { error: readingsError } = await supabaseAdmin.from("readings").insert(
    validatedMetrics.map(({ metricKey, value }) => ({
      device_id: resolvedDeviceId,
      metric_key: metricKey,
      value,
      recorded_at: recordedAtIso,
    }))
  );

  if (readingsError) {
    console.error("ingest insert failed", readingsError);
    return NextResponse.json({ error: "failed to store reading" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
