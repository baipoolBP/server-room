import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DEFAULT_DEVICE_ID } from "@/lib/config";

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

function isFiniteNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
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

  const { device_id, temperature, humidity, recorded_at } = (body ?? {}) as {
    device_id?: unknown;
    temperature?: unknown;
    humidity?: unknown;
    recorded_at?: unknown;
  };

  if (!isFiniteNumberInRange(temperature, -40, 85)) {
    return NextResponse.json(
      { error: "temperature must be a number between -40 and 85" },
      { status: 400 }
    );
  }
  if (!isFiniteNumberInRange(humidity, 0, 100)) {
    return NextResponse.json(
      { error: "humidity must be a number between 0 and 100" },
      { status: 400 }
    );
  }

  const resolvedDeviceId =
    typeof device_id === "string" && device_id.trim() ? device_id.trim() : DEFAULT_DEVICE_ID;

  let resolvedRecordedAt = new Date();
  if (typeof recorded_at === "string") {
    const parsed = new Date(recorded_at);
    if (!Number.isNaN(parsed.getTime())) resolvedRecordedAt = parsed;
  }

  const { error } = await getSupabaseAdmin().from("readings").insert({
    device_id: resolvedDeviceId,
    temperature,
    humidity,
    recorded_at: resolvedRecordedAt.toISOString(),
  });

  if (error) {
    console.error("ingest insert failed", error);
    return NextResponse.json({ error: "failed to store reading" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
