// Shared response shapes between the API routes and the frontend. All of
// these are generic over "metric" now - nothing here is hardcoded to
// temperature/humidity, so a new sensor type reporting different metrics
// doesn't need a new type.

export interface BucketPoint {
  bucket: string;
  avg_value: number | null;
  min_value: number | null;
  max_value: number | null;
  sample_count: number;
}

export interface MetricStats {
  avgValue: number | null;
  minValue: number | null;
  maxValue: number | null;
  sampleCount: number;
}

export interface LatestValue {
  value: number;
  recordedAt: string;
}

// Response of /api/readings - always scoped to one device + one metric.
export interface MetricReadingsResponse {
  range: string;
  from: string;
  to: string;
  bucketSeconds: number;
  points: BucketPoint[];
  stats: MetricStats | null;
  latest: LatestValue | null;
}

export interface DeviceMetricValue {
  metricKey: string;
  value: number;
  recordedAt: string;
}

export interface DeviceSummary {
  deviceId: string;
  sensorType: string;
  label: string;
  metrics: DeviceMetricValue[];
  lastRecordedAt: string | null;
}

// Response of /api/devices - the list backing the Overview page.
export interface DevicesResponse {
  devices: DeviceSummary[];
}
