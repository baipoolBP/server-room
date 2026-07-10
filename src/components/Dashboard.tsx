"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StatCard } from "@/components/StatCard";
import { StatusPill } from "@/components/StatusPill";
import { RangeSelector } from "@/components/RangeSelector";
import { ReadingChart } from "@/components/ReadingChart";
import { DataTable } from "@/components/DataTable";
import { RangeKey } from "@/lib/range";
import { formatDateTime, formatNumber } from "@/lib/format";
import { ReadingsResponse } from "@/lib/types";

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
  const [data, setData] = useState<ReadingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setIsFetching(true);
    try {
      const params = new URLSearchParams({ range, device_id: deviceId });
      if (range === "custom" || range === "day") {
        params.set("from", customFrom.toISOString());
        params.set("to", customTo.toISOString());
      }
      const res = await fetch(`/api/readings?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ReadingsResponse = await res.json();
      if (requestId === requestIdRef.current) {
        setData(json);
        setError(null);
      }
    } catch {
      if (requestId === requestIdRef.current) {
        setError("โหลดข้อมูลไม่สำเร็จ กำลังลองใหม่...");
      }
    } finally {
      if (requestId === requestIdRef.current) setIsFetching(false);
    }
  }, [range, customFrom, customTo, deviceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount/range-change, requestIdRef guards stale writes
    load();
    const pollMs = POLL_MS[range];
    if (!pollMs) return;
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [load, range]);

  function handleRangeChange(next: RangeKey, from?: Date, to?: Date) {
    setRange(next);
    if ((next === "custom" || next === "day") && from && to) {
      setCustomFrom(from);
      setCustomTo(to);
    }
  }

  const latest = data?.latest ?? null;
  const stats = data?.stats ?? null;
  const points = data?.points ?? [];
  const bucketSeconds = data?.bucketSeconds ?? 60;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-primary">
            แดชบอร์ดตรวจวัดอุณหภูมิ &amp; ความชื้น
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">
            จุดวัด: <span className="font-medium text-ink-primary">{deviceId}</span>
          </p>
        </div>
        <StatusPill lastRecordedAt={latest?.recorded_at} />
      </header>

      <section className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <StatCard
            label="อุณหภูมิปัจจุบัน"
            value={formatNumber(latest?.temperature)}
            unit="°C"
            accent="temp"
            sub={latest ? formatDateTime(latest.recorded_at) : undefined}
          />
          <StatCard
            label="ความชื้นปัจจุบัน"
            value={formatNumber(latest?.humidity)}
            unit="%"
            accent="humidity"
            sub={latest ? formatDateTime(latest.recorded_at) : undefined}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <StatCard
            label="อุณหภูมิเฉลี่ย"
            value={formatNumber(stats?.avgTemperature)}
            unit="°C"
            accent="temp"
            sub="ในช่วงที่เลือก"
          />
          <StatCard
            label="ความชื้นเฉลี่ย"
            value={formatNumber(stats?.avgHumidity)}
            unit="%"
            accent="humidity"
            sub="ในช่วงที่เลือก"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <StatCard
            label="ช่วงอุณหภูมิ"
            value={`${formatNumber(stats?.minTemperature)}–${formatNumber(stats?.maxTemperature)}`}
            unit="°C"
            accent="temp"
            sub="ต่ำสุด–สูงสุด"
          />
          <StatCard
            label="ช่วงความชื้น"
            value={`${formatNumber(stats?.minHumidity)}–${formatNumber(stats?.maxHumidity)}`}
            unit="%"
            accent="humidity"
            sub="ต่ำสุด–สูงสุด"
          />
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
        style={{ opacity: isFetching && !data ? 0.5 : 1 }}
      >
        <ReadingChart
          title="อุณหภูมิตามเวลา (°C)"
          unit="°C"
          color="var(--series-temp)"
          points={points}
          bucketSeconds={bucketSeconds}
          metricKey="temperature"
        />
        <ReadingChart
          title="ความชื้นตามเวลา (%)"
          unit="%"
          color="var(--series-humidity)"
          points={points}
          bucketSeconds={bucketSeconds}
          metricKey="humidity"
        />
      </section>

      <DataTable points={points} />
    </div>
  );
}
