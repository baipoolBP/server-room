interface StatCardProps {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  accent?: "temp" | "humidity" | "neutral";
}

const accentColorVar: Record<NonNullable<StatCardProps["accent"]>, string> = {
  temp: "var(--series-temp)",
  humidity: "var(--series-humidity)",
  neutral: "var(--ink-muted)",
};

export function StatCard({ label, value, unit, sub, accent = "neutral" }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-[var(--border-hairline)] bg-surface p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: accentColorVar[accent] }}
          aria-hidden
        />
        <p className="text-sm text-ink-secondary">{label}</p>
      </div>
      <p className="mt-3 text-3xl font-semibold text-ink-primary">
        {value}
        {unit ? <span className="ml-1 text-lg font-normal text-ink-muted">{unit}</span> : null}
      </p>
      {sub ? <p className="mt-1 text-xs text-ink-muted">{sub}</p> : null}
    </div>
  );
}
