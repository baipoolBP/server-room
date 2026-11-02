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
  voltage: {
    label: "แรงดันไฟฟ้า",
    unit: "V",
    min: 0,
    max: 300,
    decimals: 1,
    color: "var(--series-voltage)",
  },
  current: {
    label: "กระแสไฟฟ้า",
    unit: "A",
    min: 0,
    max: 100,
    decimals: 3,
    color: "var(--series-current)",
  },
  power: {
    label: "กำลังไฟฟ้า",
    unit: "W",
    min: 0,
    max: 25000,
    decimals: 1,
    color: "var(--series-power)",
  },
  energy: {
    label: "พลังงานไฟฟ้าสะสม",
    unit: "kWh",
    min: 0,
    max: 1_000_000,
    decimals: 3,
    color: "var(--series-energy)",
  },
  frequency: {
    label: "ความถี่ไฟฟ้า",
    unit: "Hz",
    min: 0,
    max: 100,
    decimals: 1,
    color: "var(--series-frequency)",
  },
  power_factor: {
    label: "ตัวประกอบกำลังไฟฟ้า",
    unit: "",
    min: 0,
    max: 1,
    decimals: 2,
    color: "var(--series-power-factor)",
  },
} as const;

export type MetricKey = keyof typeof METRIC_DEFINITIONS;

export function isMetricKey(value: string): value is MetricKey {
  return Object.prototype.hasOwnProperty.call(METRIC_DEFINITIONS, value);
}
