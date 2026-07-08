"use client";

import { BucketPoint } from "@/lib/types";
import { formatDateTime, formatNumber } from "@/lib/format";

function toCsv(points: BucketPoint[]): string {
  const header = [
    "เวลา",
    "อุณหภูมิเฉลี่ย",
    "อุณหภูมิต่ำสุด",
    "อุณหภูมิสูงสุด",
    "ความชื้นเฉลี่ย",
    "ความชื้นต่ำสุด",
    "ความชื้นสูงสุด",
    "จำนวนตัวอย่าง",
  ];
  const rows = points.map((p) => [
    p.bucket,
    p.avg_temperature,
    p.min_temperature,
    p.max_temperature,
    p.avg_humidity,
    p.min_humidity,
    p.max_humidity,
    p.sample_count,
  ]);
  return [header, ...rows].map((row) => row.join(",")).join("\n");
}

export function DataTable({ points }: { points: BucketPoint[] }) {
  function handleExport() {
    const csv = toCsv(points);
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sensor-readings-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-2xl border border-[var(--border-hairline)] bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink-secondary">ข้อมูลย้อนหลัง (ตาราง)</h3>
        <button
          type="button"
          onClick={handleExport}
          disabled={points.length === 0}
          className="rounded-full border border-[var(--border-hairline)] px-3 py-1 text-xs font-medium text-ink-secondary hover:bg-[var(--gridline)] disabled:opacity-40"
        >
          ดาวน์โหลด CSV
        </button>
      </div>
      <div className="mt-3 max-h-72 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="sticky top-0 bg-surface text-ink-muted">
              <th className="py-1.5 pr-3 font-medium">เวลา</th>
              <th className="py-1.5 pr-3 font-medium">อุณหภูมิ (°C)</th>
              <th className="py-1.5 pr-3 font-medium">ความชื้น (%)</th>
              <th className="py-1.5 pr-3 font-medium tabular-nums">ตัวอย่าง</th>
            </tr>
          </thead>
          <tbody>
            {points.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-ink-muted">
                  ไม่มีข้อมูลในช่วงเวลานี้
                </td>
              </tr>
            ) : (
              [...points]
                .reverse()
                .map((p) => (
                  <tr key={p.bucket} className="border-t border-[var(--gridline)]">
                    <td className="py-1.5 pr-3 text-ink-secondary">{formatDateTime(p.bucket)}</td>
                    <td className="py-1.5 pr-3 tabular-nums text-ink-primary">
                      {formatNumber(p.avg_temperature)} ({formatNumber(p.min_temperature)}–
                      {formatNumber(p.max_temperature)})
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums text-ink-primary">
                      {formatNumber(p.avg_humidity)} ({formatNumber(p.min_humidity)}–
                      {formatNumber(p.max_humidity)})
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums text-ink-muted">{p.sample_count}</td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
