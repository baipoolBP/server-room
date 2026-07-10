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

const pad = (n: number) => String(n).padStart(2, "0");

function toMonthValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function toDateValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function lastDayOfMonth(monthValue: string): number {
  const [year, month] = monthValue.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

export function RangeSelector({ value, customFrom, customTo, onChange }: RangeSelectorProps) {
  const [showCustom, setShowCustom] = useState(value === "custom");
  const [fromInput, setFromInput] = useState(toDatetimeLocalValue(customFrom));
  const [toInput, setToInput] = useState(toDatetimeLocalValue(customTo));

  const today = new Date();
  const [showDay, setShowDay] = useState(value === "day");
  const [monthInput, setMonthInput] = useState(toMonthValue(today));
  const [dayInput, setDayInput] = useState("");

  const maxMonth = toMonthValue(today);
  const isCurrentMonth = monthInput === maxMonth;
  const minDay = monthInput ? `${monthInput}-01` : undefined;
  const maxDay = monthInput
    ? isCurrentMonth
      ? toDateValue(today)
      : `${monthInput}-${pad(lastDayOfMonth(monthInput))}`
    : undefined;

  function selectDay(day: string) {
    setDayInput(day);
    if (!day) return;
    const [year, month, date] = day.split("-").map(Number);
    const dayStart = new Date(year, month - 1, date, 0, 0, 0);
    const dayEnd = new Date(year, month - 1, date + 1, 0, 0, 0);
    onChange("day", dayStart, dayEnd);
  }

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
                setShowDay(false);
                setShowCustom(true);
                return;
              }
              if (option.key === "day") {
                setShowCustom(false);
                setShowDay(true);
                return;
              }
              setShowCustom(false);
              setShowDay(false);
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

      {showDay ? (
        <div className="flex flex-wrap items-center gap-2 rounded-full border border-[var(--border-hairline)] bg-surface px-3 py-1.5 text-sm">
          <span className="text-ink-muted">เดือน</span>
          <input
            type="month"
            value={monthInput}
            max={maxMonth}
            onChange={(e) => {
              const nextMonth = e.target.value;
              setMonthInput(nextMonth);
              setDayInput("");
            }}
            className="rounded border border-[var(--border-hairline)] bg-transparent px-2 py-1 text-ink-primary"
          />
          <span className="text-ink-muted">วัน</span>
          <input
            type="date"
            value={dayInput}
            min={minDay}
            max={maxDay}
            disabled={!monthInput}
            onChange={(e) => selectDay(e.target.value)}
            className="rounded border border-[var(--border-hairline)] bg-transparent px-2 py-1 text-ink-primary disabled:opacity-40"
          />
        </div>
      ) : null}

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
