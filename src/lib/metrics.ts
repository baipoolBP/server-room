// Single source of truth for every metric a sensor can report. Adding a new
// sensor type that reports a metric not listed here starts by adding an
// entry to this registry - the ingest API, charts, and stat cards all read
// from it instead of hardcoding metric names.
export const METRIC_DEFINITIONS = {
  temperature: {
    label: "อุณหภูมิ",
    unit: "°C",
    min: -40,
    max: 85,
    decimals: 1,
    color: "var(--series-temp)",
  },
  humidity: {
    label: "ความชื้น",
    unit: "%",
    min: 0,
    max: 100,
    decimals: 1,
    color: "var(--series-humidity)",
  },
} as const;

export type MetricKey = keyof typeof METRIC_DEFINITIONS;

export function isMetricKey(value: string): value is MetricKey {
  return Object.prototype.hasOwnProperty.call(METRIC_DEFINITIONS, value);
}
