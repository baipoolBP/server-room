import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DeviceMetricValue, DeviceSummary, DevicesResponse } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const supabaseAdmin = getSupabaseAdmin();

  const [devicesResult, latestResult] = await Promise.all([
    supabaseAdmin.from("devices").select("device_id, sensor_type, label"),
    supabaseAdmin.rpc("get_latest_readings"),
  ]);

  if (devicesResult.error) {
    console.error("devices query failed", devicesResult.error);
    return NextResponse.json({ error: "failed to load devices" }, { status: 500 });
  }
  if (latestResult.error) {
    console.error("latest readings query failed", latestResult.error);
    return NextResponse.json({ error: "failed to load latest readings" }, { status: 500 });
  }

  const latestByDevice = new Map<string, DeviceMetricValue[]>();
  for (const row of latestResult.data ?? []) {
    const list = latestByDevice.get(row.device_id) ?? [];
    list.push({ metricKey: row.metric_key, value: row.value, recordedAt: row.recorded_at });
    latestByDevice.set(row.device_id, list);
  }

  const devices: DeviceSummary[] = (devicesResult.data ?? []).map((device) => {
    const metrics = latestByDevice.get(device.device_id) ?? [];
    const lastRecordedAt =
      metrics.length > 0
        ? metrics.reduce((latest, m) => (m.recordedAt > latest ? m.recordedAt : latest), metrics[0].recordedAt)
        : null;

    return {
      deviceId: device.device_id,
      sensorType: device.sensor_type,
      label: device.label,
      metrics,
      lastRecordedAt,
    };
  });

  const response: DevicesResponse = { devices };
  return NextResponse.json(response);
}
