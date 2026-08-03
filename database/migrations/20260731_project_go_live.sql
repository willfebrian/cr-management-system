BEGIN;

CREATE TABLE IF NOT EXISTS project_headers (
  id BIGSERIAL PRIMARY KEY,
  project_no INTEGER NOT NULL UNIQUE,
  project_key TEXT NOT NULL UNIQUE,
  project_name TEXT NOT NULL,
  description TEXT,
  owner_person_id BIGINT NOT NULL REFERENCES issue_people(id),
  owner_name_snapshot TEXT NOT NULL,
  project_status TEXT NOT NULL DEFAULT 'planned',
  created_by_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
  created_by_snapshot TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by_snapshot TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_by_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
  cancelled_by_snapshot TEXT,
  cancelled_at TIMESTAMPTZ,
  cancelled_reason TEXT,
  CONSTRAINT chk_project_headers_status
    CHECK (project_status IN ('planned', 'in_progress', 'on_hold', 'completed', 'cancelled')),
  CONSTRAINT chk_project_headers_cancelled
    CHECK (
      (project_status <> 'cancelled' AND cancelled_at IS NULL AND cancelled_reason IS NULL)
      OR
      (project_status = 'cancelled' AND cancelled_at IS NOT NULL AND nullif(trim(cancelled_reason), '') IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_project_headers_key ON project_headers(project_key);
CREATE INDEX IF NOT EXISTS idx_project_headers_status ON project_headers(project_status);
CREATE INDEX IF NOT EXISTS idx_project_headers_owner ON project_headers(owner_person_id);

CREATE TABLE IF NOT EXISTS project_issue_links (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES project_headers(id) ON DELETE CASCADE,
  issue_id BIGINT NOT NULL REFERENCES issue_headers(id) ON DELETE RESTRICT,
  linked_by_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
  linked_by_snapshot TEXT NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_project_issue_links_issue UNIQUE (issue_id)
);

CREATE INDEX IF NOT EXISTS idx_project_issue_links_project ON project_issue_links(project_id);

CREATE TABLE IF NOT EXISTS project_issue_link_history (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT REFERENCES project_headers(id) ON DELETE SET NULL,
  issue_id BIGINT REFERENCES issue_headers(id) ON DELETE SET NULL,
  project_key_snapshot TEXT NOT NULL,
  project_name_snapshot TEXT NOT NULL,
  issue_key_snapshot TEXT NOT NULL,
  issue_name_snapshot TEXT NOT NULL,
  issue_status_snapshot TEXT,
  relation_status TEXT NOT NULL DEFAULT 'active',
  linked_by_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
  linked_by_snapshot TEXT NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unlinked_by_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
  unlinked_by_snapshot TEXT,
  unlinked_at TIMESTAMPTZ,
  reason TEXT,
  CONSTRAINT chk_project_issue_history_status
    CHECK (relation_status IN ('active', 'removed', 'cancelled', 'deleted'))
);

CREATE INDEX IF NOT EXISTS idx_project_issue_link_history_project
  ON project_issue_link_history(project_id, linked_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_issue_link_history_issue
  ON project_issue_link_history(issue_id, linked_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_issue_link_history_active
  ON project_issue_link_history(project_id, issue_id)
  WHERE relation_status = 'active';

CREATE TABLE IF NOT EXISTS project_status_history (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT REFERENCES project_headers(id) ON DELETE SET NULL,
  project_key_snapshot TEXT NOT NULL,
  project_name_snapshot TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT,
  changed_by_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
  changed_by_snapshot TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_project_status_history_from
    CHECK (from_status IS NULL OR from_status IN ('planned', 'in_progress', 'on_hold', 'completed', 'cancelled')),
  CONSTRAINT chk_project_status_history_to
    CHECK (to_status IN ('planned', 'in_progress', 'on_hold', 'completed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_project_status_history_project
  ON project_status_history(project_id, changed_at DESC);

COMMIT;
