CREATE SCHEMA IF NOT EXISTS pathwayve;

CREATE TABLE IF NOT EXISTS pathwayve.schedules (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  request_id UUID NOT NULL,
  name TEXT NOT NULL,
  origin_place_id TEXT NOT NULL,
  destination_place_id TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at),
  time_zone TEXT NOT NULL,
  transportation TEXT NOT NULL CHECK (transportation IN ('walking', 'driving', 'transit')),
  preferences JSONB NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(user_id, request_id)
);
CREATE INDEX IF NOT EXISTS schedules_owner_idx ON pathwayve.schedules(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS pathwayve.schedule_items (
  id UUID PRIMARY KEY,
  schedule_id UUID NOT NULL REFERENCES pathwayve.schedules(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('visit', 'task')),
  title TEXT NOT NULL,
  place_id TEXT,
  place_query TEXT,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 5 AND 180),
  priority TEXT NOT NULL CHECK (priority IN ('required', 'preferred', 'optional')),
  timing_type TEXT NOT NULL CHECK (timing_type IN ('flexible', 'window', 'fixed')),
  fixed_start_at TIMESTAMPTZ,
  earliest_start_at TIMESTAMPTZ,
  latest_end_at TIMESTAMPTZ,
  preferred_sequence INTEGER CHECK (preferred_sequence >= 0),
  order_locked BOOLEAN NOT NULL,
  requirements JSONB NOT NULL,
  CHECK (NOT order_locked OR preferred_sequence IS NOT NULL),
  CHECK (
    (timing_type = 'flexible' AND fixed_start_at IS NULL AND earliest_start_at IS NULL AND latest_end_at IS NULL)
    OR (timing_type = 'fixed' AND fixed_start_at IS NOT NULL AND earliest_start_at IS NULL AND latest_end_at IS NULL)
    OR (timing_type = 'window' AND fixed_start_at IS NULL AND earliest_start_at IS NOT NULL AND latest_end_at IS NOT NULL AND latest_end_at >= earliest_start_at + duration_minutes * INTERVAL '1 minute')
  ),
  UNIQUE(schedule_id, preferred_sequence)
);

CREATE TABLE IF NOT EXISTS pathwayve.schedule_runs (
  id UUID PRIMARY KEY,
  schedule_id UUID NOT NULL REFERENCES pathwayve.schedules(id) ON DELETE CASCADE,
  schedule_version INTEGER NOT NULL CHECK (schedule_version > 0),
  calculated_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('feasible', 'infeasible', 'failed')),
  result JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS schedule_runs_parent_idx ON pathwayve.schedule_runs(schedule_id, calculated_at DESC);
