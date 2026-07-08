"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BucketPoint } from "@/lib/types";
import { formatAxisTick, formatDateTime, formatNumber } from "@/lib/format";

interface ReadingChartProps {
  title: string;
  unit: string;
  color: string;
  points: BucketPoint[];
  bucketSeconds: number;
  metricKey: "temperature" | "humidity";
}

interface TooltipPayloadItem {
  payload: BucketPoint;
}

function CustomTooltip({
  active,
  payload,
  unit,
  metricKey,
  color,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  unit: string;
  metricKey: "temperature" | "humidity";
  color: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const avg = point[`avg_${metricKey}`];
  const min = point[`min_${metricKey}`];
  const max = point[`max_${metricKey}`];

  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-surface px-3 py-2 text-xs shadow-md">
      <p className="text-ink-muted">{formatDateTime(point.bucket)}</p>
      <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-ink-primary">
        <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: color }} />
        {formatNumber(avg)} {unit}
      </p>
      <p className="mt-0.5 text-ink-muted">
        ต่ำสุด {formatNumber(min)} · สูงสุด {formatNumber(max)} {unit}
      </p>
      <p className="text-ink-muted">{point.sample_count} ตัวอย่าง</p>
    </div>
  );
}

export function ReadingChart({
  title,
  unit,
  color,
  points,
  bucketSeconds,
  metricKey,
}: ReadingChartProps) {
  const hasData = points.length > 0;

  return (
    <div className="rounded-2xl border border-[var(--border-hairline)] bg-surface p-5 shadow-sm">
      <h3 className="text-sm font-medium text-ink-secondary">{title}</h3>
      <div className="mt-3 h-64">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id={`fill-${metricKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="var(--gridline)"
                strokeWidth={1}
                vertical={false}
              />
              <XAxis
                dataKey="bucket"
                tickFormatter={(v) => formatAxisTick(v, bucketSeconds)}
                stroke="var(--baseline)"
                tick={{ fill: "var(--ink-muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "var(--baseline)" }}
                minTickGap={32}
              />
              <YAxis
                stroke="var(--baseline)"
                tick={{ fill: "var(--ink-muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={40}
                domain={["auto", "auto"]}
              />
              <Tooltip
                cursor={{ stroke: "var(--baseline)", strokeWidth: 1 }}
                content={<CustomTooltip unit={unit} metricKey={metricKey} color={color} />}
              />
              <Area
                type="monotone"
                dataKey={`avg_${metricKey}`}
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                fill={`url(#fill-${metricKey})`}
                dot={false}
                activeDot={{ r: 5, fill: color, stroke: "var(--surface-1)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-ink-muted">
            ยังไม่มีข้อมูลในช่วงเวลานี้
          </div>
        )}
      </div>
    </div>
  );
}
