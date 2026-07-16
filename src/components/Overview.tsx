"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { StatusPill } from "@/components/StatusPill";
import { formatNumber } from "@/lib/format";
import { DevicesResponse } from "@/lib/types";
import { isMetricKey, METRIC_DEFINITIONS } from "@/lib/metrics";

const POLL_MS = 30_000;

export function Overview() {
  const [data, setData] = useState<DevicesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      const res = await fetch("/api/devices", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: DevicesResponse = await res.json();
      if (requestId === requestIdRef.current) {
        setData(json);
        setError(null);
      }
    } catch {
      if (requestId === requestIdRef.current) {
        setError("โหลดข้อมูลไม่สำเร็จ กำลังลองใหม่...");
      }
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount, requestIdRef guards stale writes
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const devices = data?.devices ?? [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-semibold text-ink-primary">แดชบอร์ดเซนเซอร์ทั้งหมด</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          ข้อมูลล่าสุดของทุกจุดวัดแบบเรียลไทม์ — กดที่การ์ดเพื่อดูรายละเอียด/ย้อนหลัง
        </p>
      </header>

      {error ? <p className="text-sm text-[var(--status-critical)]">{error}</p> : null}

      {devices.length === 0 ? (
        <p className="text-sm text-ink-muted">ยังไม่มีอุปกรณ์ส่งข้อมูลเข้ามา</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((device) => (
            <Link
              key={device.deviceId}
              href={`/sensors/${encodeURIComponent(device.deviceId)}`}
              className="flex flex-col gap-3 rounded-2xl border border-[var(--border-hairline)] bg-surface p-5 shadow-sm transition-colors hover:bg-[var(--gridline)]"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-medium text-ink-primary">{device.label || device.deviceId}</h2>
                <StatusPill lastRecordedAt={device.lastRecordedAt} />
              </div>
              <div className="flex flex-wrap gap-4">
                {device.metrics.map((m) =>
                  isMetricKey(m.metricKey) ? (
                    <div key={m.metricKey}>
                      <p className="text-xs text-ink-muted">
                        {METRIC_DEFINITIONS[m.metricKey].label}
                      </p>
                      <p className="text-xl font-semibold text-ink-primary">
                        {formatNumber(m.value)}
                        <span className="ml-1 text-sm font-normal text-ink-muted">
                          {METRIC_DEFINITIONS[m.metricKey].unit}
                        </span>
                      </p>
                    </div>
                  ) : null
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
