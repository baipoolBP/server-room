-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New query)
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE where possible.

create table if not exists readings (
  id bigint generated always as identity primary key,
  device_id text not null default 'room-1',
  temperature numeric(5,2) not null,
  humidity numeric(5,2) not null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists readings_device_time_idx
  on readings (device_id, recorded_at desc);

-- Row Level Security: block all direct client access.
-- All reads/writes go through the Next.js API routes using the service role key,
-- which bypasses RLS. This keeps the table safe even if the anon key ever leaks.
alter table readings enable row level security;

-- Bucketed aggregation used by the dashboard for charts/stats.
-- Groups readings into fixed-size time buckets and returns avg/min/max per bucket,
-- so the API can return a handful of points instead of thousands of raw rows
-- when the selected range spans days/weeks.
create or replace function get_bucketed_readings(
  p_device_id text,
  p_from timestamptz,
  p_to timestamptz,
  p_bucket_seconds int
)
returns table (
  bucket timestamptz,
  avg_temperature numeric,
  min_temperature numeric,
  max_temperature numeric,
  avg_humidity numeric,
  min_humidity numeric,
  max_humidity numeric,
  sample_count bigint
)
language sql
stable
as $$
  select
    to_timestamp(floor(extract(epoch from recorded_at) / p_bucket_seconds) * p_bucket_seconds) as bucket,
    round(avg(temperature)::numeric, 2) as avg_temperature,
    min(temperature) as min_temperature,
    max(temperature) as max_temperature,
    round(avg(humidity)::numeric, 2) as avg_humidity,
    min(humidity) as min_humidity,
    max(humidity) as max_humidity,
    count(*) as sample_count
  from readings
  where device_id = p_device_id
    and recorded_at >= p_from
    and recorded_at <= p_to
  group by 1
  order by 1;
$$;
