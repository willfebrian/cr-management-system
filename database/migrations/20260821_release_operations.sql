SET search_path TO cr_management;

CREATE TABLE IF NOT EXISTS release_operations (
  id BIGSERIAL PRIMARY KEY,
  trkorr TEXT NOT NULL,
  target_system TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'timed_out')),
  phase TEXT NOT NULL DEFAULT 'queued'
    CHECK (phase IN ('queued', 'releasing_children', 'releasing_parent', 'verifying')),
  message TEXT,
  result JSONB,
  sync_status TEXT NOT NULL DEFAULT 'not_queued'
    CHECK (sync_status IN ('not_queued', 'queued', 'running', 'succeeded', 'failed')),
  sync_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_release_operations_active
  ON release_operations(target_system, trkorr)
  WHERE status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS idx_release_operations_request
  ON release_operations(target_system, trkorr, created_at DESC);
