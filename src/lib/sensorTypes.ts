import { MetricKey } from "@/lib/metrics";

// Single source of truth for which metrics each sensor type reports.
// Adding a new sensor type: add its Pi-side profile (raspberry-pi/profiles/)
// and one entry here (plus any new metric keys in lib/metrics.ts) - nothing
// else in the ingest API, database, or dashboard needs to change.
export const SENSOR_TYPE_METRICS = {
  temp_humidity_xy_md02: ["temperature", "humidity"],
} as const satisfies Record<string, readonly MetricKey[]>;

export type SensorType = keyof typeof SENSOR_TYPE_METRICS;

export function isSensorType(value: string): value is SensorType {
  return Object.prototype.hasOwnProperty.call(SENSOR_TYPE_METRICS, value);
}
