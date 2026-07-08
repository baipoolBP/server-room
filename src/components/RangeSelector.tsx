"use client";

import { useState } from "react";
import { RANGE_OPTIONS, RangeKey } from "@/lib/range";
import { toDatetimeLocalValue } from "@/lib/format";

interface RangeSelectorProps {
  value: RangeKey;
  customFrom: Date;
  customTo: Date;
  onChange: (range: RangeKey, customFrom?: Date, customTo?: Date) => void;
}

export function RangeSelector({ value, customFrom, customTo, onChange }: RangeSelectorProps) {
  const [showCustom, setShowCustom] = useState(value === "custom");
  const [fromInput, setFromInput] = useState(toDatetimeLocalValue(customFrom));
  const [toInput, setToInput] = useState(toDatetimeLocalValue(customTo));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {RANGE_OPTIONS.map((option) => {
        const isActive = value === option.key;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => {
              if (option.key === "custom") {
                setShowCustom(true);
                return;
              }
              setShowCustom(false);
              onChange(option.key);
            }}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? "border-transparent bg-[var(--series-temp)] text-white"
                : "border-[var(--border-hairline)] bg-surface text-ink-secondary hover:bg-[var(--gridline)]"
            }`}
          >
            {option.label}
          </button>
        );
      })}

      {showCustom ? (
        <form
          className="flex flex-wrap items-center gap-2 rounded-full border border-[var(--border-hairline)] bg-surface px-3 py-1.5 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            const from = new Date(fromInput);
            const to = new Date(toInput);
            if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from < to) {
              onChange("custom", from, to);
            }
          }}
        >
          <input
            type="datetime-local"
            value={fromInput}
            onChange={(e) => setFromInput(e.target.value)}
            className="rounded border border-[var(--border-hairline)] bg-transparent px-2 py-1 text-ink-primary"
          />
          <span className="text-ink-muted">ถึง</span>
          <input
            type="datetime-local"
            value={toInput}
            onChange={(e) => setToInput(e.target.value)}
            className="rounded border border-[var(--border-hairline)] bg-transparent px-2 py-1 text-ink-primary"
          />
          <button
            type="submit"
            className="rounded-full bg-[var(--series-temp)] px-3 py-1 font-medium text-white"
          >
            ใช้ช่วงนี้
          </button>
        </form>
      ) : null}
    </div>
  );
}
