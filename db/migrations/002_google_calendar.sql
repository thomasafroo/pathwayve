CREATE TABLE IF NOT EXISTS pathwayve.google_calendar_connections (
  owner_id UUID PRIMARY KEY,
  encrypted_tokens TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
