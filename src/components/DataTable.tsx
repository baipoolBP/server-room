"use client";

import { BucketPoint } from "@/lib/types";
import { formatDateTime, formatNumber } from "@/lib/format";

export interface MetricSeries {
  metricKey: string;
  label: string;
  unit: string;
  points: BucketPoint[];
}

interface MergedRow {
  bucket: string;
  cells: Record<string, BucketPoint>;
}

// Each metric is fetched independently (see Dashboard.tsx), so this merges
// them back into one row-per-timestamp table by bucket. A device's metrics
// normally share the same buckets (read together in one cycle), but a
// metric missing a bucket just renders as "—" rather than breaking the row.
function mergeByBucket(series: MetricSeries[]): MergedRow[] {
  const byBucket = new Map<string, Record<string, BucketPoint>>();
  for (const s of series) {
    for (const point of s.points) {
      const cells = byBucket.get(point.bucket) ?? {};
      cells[s.metricKey] = point;
      byBucket.set(point.bucket, cells);
    }
  }
  return [...byBucket.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([bucket, cells]) => ({ bucket, cells }));
}

function toCsv(series: MetricSeries[], rows: MergedRow[]): string {
  const header = [
    "เวลา",
    ...series.flatMap((s) => [
      `${s.label} เฉลี่ย`,
      `${s.label} ต่ำสุด`,
      `${s.label} สูงสุด`,
      `${s.label} ตัวอย่าง`,
    ]),
  ];
  const rowsOut = rows.map((row) => [
    row.bucket,
    ...series.flatMap((s) => {
      const cell = row.cells[s.metricKey];
      return [
        cell?.avg_value ?? "",
        cell?.min_value ?? "",
        cell?.max_value ?? "",
        cell?.sample_count ?? "",
      ];
    }),
  ]);
  return [header, ...rowsOut].map((row) => row.join(",")).join("\n");
}

export function DataTable({ series }: { series: MetricSeries[] }) {
  const rows = mergeByBucket(series);

  function handleExport() {
    const csv = toCsv(series, rows);
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
          disabled={rows.length === 0}
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
              {series.map((s) => (
                <th key={s.metricKey} className="py-1.5 pr-3 font-medium">
                  {s.label} ({s.unit})
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={1 + series.length} className="py-6 text-center text-ink-muted">
                  ไม่มีข้อมูลในช่วงเวลานี้
                </td>
              </tr>
            ) : (
              [...rows]
                .reverse()
                .map((row) => (
                  <tr key={row.bucket} className="border-t border-[var(--gridline)]">
                    <td className="py-1.5 pr-3 text-ink-secondary">{formatDateTime(row.bucket)}</td>
                    {series.map((s) => {
                      const cell = row.cells[s.metricKey];
                      return (
                        <td
                          key={s.metricKey}
                          className="py-1.5 pr-3 tabular-nums text-ink-primary"
                        >
                          {cell
                            ? `${formatNumber(cell.avg_value)} (${formatNumber(cell.min_value)}–${formatNumber(cell.max_value)})`
                            : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
