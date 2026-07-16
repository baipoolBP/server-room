"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StatCard } from "@/components/StatCard";
import { StatusPill } from "@/components/StatusPill";
import { RangeSelector } from "@/components/RangeSelector";
import { ReadingChart } from "@/components/ReadingChart";
import { DataTable, MetricSeries } from "@/components/DataTable";
import { RangeKey } from "@/lib/range";
import { formatDateTime, formatNumber } from "@/lib/format";
import { DevicesResponse, MetricReadingsResponse } from "@/lib/types";
import { METRIC_DEFINITIONS, MetricKey } from "@/lib/metrics";
import { isSensorType, SENSOR_TYPE_METRICS } from "@/lib/sensorTypes";

const POLL_MS: Partial<Record<RangeKey, number>> = {
  "1h": 30_000,
  "24h": 30_000,
  "7d": 5 * 60_000,
  "30d": 5 * 60_000,
};

export function Dashboard({ deviceId }: { deviceId: string }) {
  const [range, setRange] = useState<RangeKey>("24h");
  const [customFrom, setCustomFrom] = useState(() => new Date(Date.now() - 24 * 60 * 60 * 1000));
  const [customTo, setCustomTo] = useState(() => new Date());

  // Which metrics this device reports - discovered from its sensor_type via
  // /api/devices before we know what to fetch/render. null = still loading.
  const [metricKeys, setMetricKeys] = useState<MetricKey[] | null>(null);
  const [deviceLabel, setDeviceLabel] = useState("");
  const [deviceNotFound, setDeviceNotFound] = useState(false);

  const [readingsByMetric, setReadingsByMetric] = useState<Record<string, MetricReadingsResponse>>(
    {}
  );
  const [error, setError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function loadDevice() {
      try {
        const res = await fetch("/api/devices", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: DevicesResponse = await res.json();
        const device = json.devices.find((d) => d.deviceId === deviceId);
        if (cancelled) return;
        if (!device || !isSensorType(device.sensorType)) {
          setDeviceNotFound(true);
          return;
        }
        setDeviceLabel(device.label);
        setMetricKeys([...SENSOR_TYPE_METRICS[device.sensorType]]);
      } catch {
        if (!cancelled) setDeviceNotFound(true);
      }
    }
    loadDevice();
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  const load = useCallback(async () => {
    if (!metricKeys) return;
    const requestId = ++requestIdRef.current;
    setIsFetching(true);
    try {
      const entries = await Promise.all(
        metricKeys.map(async (metricKey) => {
          const params = new URLSearchParams({
            range,
            device_id: deviceId,
            metric_key: metricKey,
          });
          if (range === "custom" || range === "day") {
            params.set("from", customFrom.toISOString());
            params.set("to", customTo.toISOString());
          }
          const res = await fetch(`/api/readings?${params.toString()}`, { cache: "no-store" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json: MetricReadingsResponse = await res.json();
          return [metricKey, json] as const;
        })
      );
      if (requestId === requestIdRef.current) {
        setReadingsByMetric(Object.fromEntries(entries));
        setError(null);
      }
    } catch {
      if (requestId === requestIdRef.current) {
        setError("โหลดข้อมูลไม่สำเร็จ กำลังลองใหม่...");
      }
    } finally {
      if (requestId === requestIdRef.current) setIsFetching(false);
    }
  }, [metricKeys, range, customFrom, customTo, deviceId]);

  useEffect(() => {
    if (!metricKeys) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount/range-change, requestIdRef guards stale writes
    load();
    const pollMs = POLL_MS[range];
    if (!pollMs) return;
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [load, range, metricKeys]);

  function handleRangeChange(next: RangeKey, from?: Date, to?: Date) {
    setRange(next);
    if ((next === "custom" || next === "day") && from && to) {
      setCustomFrom(from);
      setCustomTo(to);
    }
  }

  if (deviceNotFound) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-sm text-ink-secondary">ไม่พบข้อมูลอุปกรณ์ &quot;{deviceId}&quot;</p>
      </div>
    );
  }

  if (!metricKeys) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-sm text-ink-muted">กำลังโหลด...</p>
      </div>
    );
  }

  const overallLatestAt = metricKeys.reduce<string | null>((latest, key) => {
    const at = readingsByMetric[key]?.latest?.recordedAt ?? null;
    if (!at) return latest;
    return !latest || at > latest ? at : latest;
  }, null);

  const gridStyle = { gridTemplateColumns: `repeat(${metricKeys.length}, minmax(0, 1fr))` };

  const series: MetricSeries[] = metricKeys.map((key) => ({
    metricKey: key,
    label: METRIC_DEFINITIONS[key].label,
    unit: METRIC_DEFINITIONS[key].unit,
    points: readingsByMetric[key]?.points ?? [],
  }));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-primary">{deviceLabel || deviceId}</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            จุดวัด: <span className="font-medium text-ink-primary">{deviceId}</span>
          </p>
        </div>
        <StatusPill lastRecordedAt={overallLatestAt} />
      </header>

      <section className="flex flex-col gap-4">
        <div className="grid gap-4" style={gridStyle}>
          {metricKeys.map((key) => {
            const def = METRIC_DEFINITIONS[key];
            const latest = readingsByMetric[key]?.latest;
            return (
              <StatCard
                key={key}
                label={`${def.label}ปัจจุบัน`}
                value={formatNumber(latest?.value)}
                unit={def.unit}
                accentColor={def.color}
                sub={latest ? formatDateTime(latest.recordedAt) : undefined}
              />
            );
          })}
        </div>
        <div className="grid gap-4" style={gridStyle}>
          {metricKeys.map((key) => {
            const def = METRIC_DEFINITIONS[key];
            const stats = readingsByMetric[key]?.stats;
            return (
              <StatCard
                key={key}
                label={`${def.label}เฉลี่ย`}
                value={formatNumber(stats?.avgValue)}
                unit={def.unit}
                accentColor={def.color}
                sub="ในช่วงที่เลือก"
              />
            );
          })}
        </div>
        <div className="grid gap-4" style={gridStyle}>
          {metricKeys.map((key) => {
            const def = METRIC_DEFINITIONS[key];
            const stats = readingsByMetric[key]?.stats;
            return (
              <StatCard
                key={key}
                label={`ช่วง${def.label}`}
                value={`${formatNumber(stats?.minValue)}–${formatNumber(stats?.maxValue)}`}
                unit={def.unit}
                accentColor={def.color}
                sub="ต่ำสุด–สูงสุด"
              />
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <RangeSelector
          value={range}
          customFrom={customFrom}
          customTo={customTo}
          onChange={handleRangeChange}
        />
        {error ? <p className="text-sm text-[var(--status-critical)]">{error}</p> : null}
      </section>

      <section
        className="grid grid-cols-1 gap-4 lg:grid-cols-2 transition-opacity"
        style={{ opacity: isFetching && Object.keys(readingsByMetric).length === 0 ? 0.5 : 1 }}
      >
        {metricKeys.map((key) => {
          const def = METRIC_DEFINITIONS[key];
          return (
            <ReadingChart
              key={key}
              title={`${def.label}ตามเวลา (${def.unit})`}
              unit={def.unit}
              color={def.color}
              points={readingsByMetric[key]?.points ?? []}
              bucketSeconds={readingsByMetric[key]?.bucketSeconds ?? 60}
              metricKey={key}
            />
          );
        })}
      </section>

      <DataTable series={series} />
    </div>
  );
}
