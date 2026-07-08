"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";

const STALE_AFTER_MS = 10 * 60 * 1000; // no reading in 10 min -> considered offline

export function StatusPill({ lastRecordedAt }: { lastRecordedAt: string | null | undefined }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const lastMs = lastRecordedAt ? new Date(lastRecordedAt).getTime() : null;
  const isOnline = lastMs !== null && now - lastMs <= STALE_AFTER_MS;

  return (
    <div className="flex items-center gap-2 rounded-full border border-[var(--border-hairline)] bg-surface px-3 py-1.5 text-xs">
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: isOnline ? "var(--status-good)" : "var(--status-critical)" }}
        aria-hidden
      />
      <span className="font-medium text-ink-primary">
        {isOnline ? "อุปกรณ์ออนไลน์" : "ขาดการเชื่อมต่อ"}
      </span>
      <span className="text-ink-muted">อัปเดตล่าสุด {formatDateTime(lastRecordedAt)}</span>
    </div>
  );
}
