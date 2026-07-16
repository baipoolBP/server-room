-- Run this in the Supabase SQL Editor (Project > SQL Editor > New query).
-- Fresh schema for the multi-sensor-type design: rebuilds `readings` and adds
-- `devices`. Safe to re-run (drops and recreates the two tables + function).
-- NOTE: this drops any existing `readings` data - only run this if you don't
-- need to keep whatever is in the old single-sensor-type table.

drop function if exists get_bucketed_readings(text, timestamptz, timestamptz, int);
drop function if exists get_latest_readings();
drop table if exists readings;
drop table if exists devices;

-- One row per physical sensor. Upserted automatically by /api/ingest the
-- first time a device posts a reading - never insert into this by hand.
create table if not exists devices (
  device_id text primary key,
  sensor_type text not null,
  label text not null default '',
  created_at timestamptz not null default now()
);

-- One row per (device, metric, point in time) instead of fixed
-- temperature/humidity columns, so any sensor type can store any set of
-- metrics without a schema change - adding a new sensor type is just a new
-- `metric_key` value, not a new column.
create table if not exists readings (
  id bigint generated always as identity primary key,
  device_id text not null references devices (device_id),
  metric_key text not null,
  value numeric not null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists readings_device_metric_time_idx
  on readings (device_id, metric_key, recorded_at desc);

-- Row Level Security: block all direct client access.
-- All reads/writes go through the Next.js API routes using the service role key,
-- which bypasses RLS. This keeps the tables safe even if the anon key ever leaks.
alter table devices enable row level security;
alter table readings enable row level security;

-- Bucketed aggregation used by the dashboard for charts/stats, for ONE
-- metric at a time. Groups readings into fixed-size time buckets and
-- returns avg/min/max per bucket, so the API can return a handful of points
-- instead of thousands of raw rows when the selected range spans days/weeks.
create or replace function get_bucketed_readings(
  p_device_id text,
  p_metric_key text,
  p_from timestamptz,
  p_to timestamptz,
  p_bucket_seconds int
)
returns table (
  bucket timestamptz,
  avg_value numeric,
  min_value numeric,
  max_value numeric,
  sample_count bigint
)
language sql
stable
as $$
  select
    to_timestamp(floor(extract(epoch from recorded_at) / p_bucket_seconds) * p_bucket_seconds) as bucket,
    round(avg(value)::numeric, 2) as avg_value,
    min(value) as min_value,
    max(value) as max_value,
    count(*) as sample_count
  from readings
  where device_id = p_device_id
    and metric_key = p_metric_key
    and recorded_at >= p_from
    and recorded_at <= p_to
  group by 1
  order by 1;
$$;

-- Latest value per (device, metric) across every device - backs the
-- Overview page, which needs one "current reading" per metric per device
-- without the caller having to loop and query per device.
create or replace function get_latest_readings()
returns table (
  device_id text,
  metric_key text,
  value numeric,
  recorded_at timestamptz
)
language sql
stable
as $$
  select distinct on (device_id, metric_key)
    device_id, metric_key, value, recorded_at
  from readings
  order by device_id, metric_key, recorded_at desc;
$$;
