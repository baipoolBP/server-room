export interface BucketPoint {
  bucket: string;
  avg_temperature: number | null;
  min_temperature: number | null;
  max_temperature: number | null;
  avg_humidity: number | null;
  min_humidity: number | null;
  max_humidity: number | null;
  sample_count: number;
}

export interface Stats {
  avgTemperature: number | null;
  minTemperature: number | null;
  maxTemperature: number | null;
  avgHumidity: number | null;
  minHumidity: number | null;
  maxHumidity: number | null;
  sampleCount: number;
}

export interface LatestReading {
  temperature: number;
  humidity: number;
  recorded_at: string;
}

export interface ReadingsResponse {
  range: string;
  from: string;
  to: string;
  bucketSeconds: number;
  points: BucketPoint[];
  stats: Stats | null;
  latest: LatestReading | null;
}
