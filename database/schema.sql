CREATE SCHEMA IF NOT EXISTS cr_management;
SET search_path TO cr_management;

CREATE TABLE IF NOT EXISTS sap_systems (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id BIGSERIAL PRIMARY KEY,
  sap_system_code TEXT NOT NULL,
  scope_owner TEXT NOT NULL,
  period_type TEXT,
  period_value INTEGER,
  from_date DATE,
  to_date DATE,
  max_rows INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  message TEXT,
  request_count INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS period_type TEXT;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS period_value INTEGER;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS from_date DATE;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS to_date DATE;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS max_rows INTEGER;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS sync_mode TEXT NOT NULL DEFAULT 'full_period';
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS lookback_days INTEGER;

CREATE TABLE IF NOT EXISTS cr_requests (
  sap_system_code TEXT NOT NULL,
  trkorr TEXT NOT NULL,
  parent_request TEXT,
  description TEXT,
  function_code TEXT,
  status_code TEXT,
  status_group TEXT NOT NULL,
  target_system TEXT,
  category TEXT,
  owner TEXT,
  changed_date DATE,
  changed_time TIME,
  last_sync_run_id BIGINT REFERENCES sync_runs(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (sap_system_code, trkorr)
);

ALTER TABLE cr_requests ADD COLUMN IF NOT EXISTS sap_created_at TIMESTAMPTZ;
ALTER TABLE cr_requests ADD COLUMN IF NOT EXISTS sap_created_source TEXT;
ALTER TABLE cr_requests ADD COLUMN IF NOT EXISTS sap_released_at TIMESTAMPTZ;
ALTER TABLE cr_requests ADD COLUMN IF NOT EXISTS sap_released_source TEXT;
ALTER TABLE cr_requests ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cr_requests_trkorr ON cr_requests(trkorr);
CREATE INDEX IF NOT EXISTS idx_cr_requests_system ON cr_requests(sap_system_code);
CREATE INDEX IF NOT EXISTS idx_cr_requests_status_group ON cr_requests(status_group);
CREATE INDEX IF NOT EXISTS idx_cr_requests_owner ON cr_requests(owner);
CREATE INDEX IF NOT EXISTS idx_cr_requests_changed_date ON cr_requests(changed_date);
CREATE INDEX IF NOT EXISTS idx_cr_requests_parent ON cr_requests(sap_system_code, parent_request);
CREATE INDEX IF NOT EXISTS idx_cr_requests_sap_created_at ON cr_requests(sap_created_at);
CREATE INDEX IF NOT EXISTS idx_cr_requests_sap_released_at ON cr_requests(sap_released_at);

CREATE TABLE IF NOT EXISTS cr_objects (
  id BIGSERIAL PRIMARY KEY,
  sap_system_code TEXT NOT NULL,
  trkorr TEXT NOT NULL,
  position TEXT NOT NULL,
  pgmid TEXT,
  object_type TEXT,
  object_name TEXT,
  diff_readiness TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sap_system_code, trkorr, position),
  FOREIGN KEY (sap_system_code, trkorr) REFERENCES cr_requests(sap_system_code, trkorr) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cr_objects_name ON cr_objects(object_name);
CREATE INDEX IF NOT EXISTS idx_cr_objects_type ON cr_objects(object_type);
CREATE INDEX IF NOT EXISTS idx_cr_objects_request ON cr_objects(sap_system_code, trkorr);

CREATE TABLE IF NOT EXISTS sap_transport_program_ids (
  pgmid TEXT PRIMARY KEY,
  description TEXT,
  language TEXT NOT NULL DEFAULT 'E',
  source_system_code TEXT NOT NULL DEFAULT 'DEV',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sap_transport_object_types (
  object_type TEXT PRIMARY KEY,
  description TEXT,
  language TEXT NOT NULL DEFAULT 'E',
  source_system_code TEXT NOT NULL DEFAULT 'DEV',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sap_transport_object_catalog (
  pgmid TEXT NOT NULL REFERENCES sap_transport_program_ids(pgmid) ON DELETE CASCADE,
  object_type TEXT NOT NULL REFERENCES sap_transport_object_types(object_type) ON DELETE CASCADE,
  display_label TEXT,
  source_system_code TEXT NOT NULL DEFAULT 'DEV',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pgmid, object_type)
);

CREATE INDEX IF NOT EXISTS idx_sap_transport_object_catalog_label
  ON sap_transport_object_catalog(display_label);

CREATE TABLE IF NOT EXISTS cr_object_keys (
  id BIGSERIAL PRIMARY KEY,
  sap_system_code TEXT NOT NULL,
  trkorr TEXT NOT NULL,
  position TEXT NOT NULL,
  pgmid TEXT,
  object_type TEXT,
  object_name TEXT,
  table_key TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (sap_system_code, trkorr) REFERENCES cr_requests(sap_system_code, trkorr) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cr_status_snapshots (
  id BIGSERIAL PRIMARY KEY,
  sap_system_code TEXT NOT NULL,
  trkorr TEXT NOT NULL,
  sync_run_id BIGINT NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  parent_request TEXT,
  description TEXT,
  function_code TEXT,
  status_code TEXT,
  status_group TEXT NOT NULL,
  target_system TEXT,
  category TEXT,
  owner TEXT,
  sap_changed_date DATE,
  sap_changed_time TIME,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sap_system_code, trkorr, sync_run_id),
  FOREIGN KEY (sap_system_code, trkorr) REFERENCES cr_requests(sap_system_code, trkorr) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cr_status_snapshots_trkorr ON cr_status_snapshots(sap_system_code, trkorr);
CREATE INDEX IF NOT EXISTS idx_cr_status_snapshots_sync_run ON cr_status_snapshots(sync_run_id);
CREATE INDEX IF NOT EXISTS idx_cr_status_snapshots_status ON cr_status_snapshots(status_group);

CREATE TABLE IF NOT EXISTS cr_transport_lifecycle (
  source_system_code TEXT NOT NULL DEFAULT 'DEV',
  trkorr TEXT NOT NULL,
  target_system_code TEXT NOT NULL,
  transport_status TEXT NOT NULL DEFAULT 'unknown',
  evidence_source TEXT NOT NULL DEFAULT 'unknown',
  imported_at TIMESTAMPTZ,
  import_date DATE,
  import_time TIME,
  return_code TEXT,
  message TEXT,
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_system_code, trkorr, target_system_code)
);

CREATE INDEX IF NOT EXISTS idx_cr_transport_lifecycle_target ON cr_transport_lifecycle(target_system_code, transport_status);
CREATE INDEX IF NOT EXISTS idx_cr_transport_lifecycle_checked ON cr_transport_lifecycle(last_checked_at);

CREATE TABLE IF NOT EXISTS cr_orphan_transport_imports (
  source_system_code TEXT NOT NULL DEFAULT 'DEV',
  trkorr TEXT NOT NULL,
  target_system_code TEXT NOT NULL,
  transport_status TEXT NOT NULL DEFAULT 'unknown',
  imported_at TIMESTAMPTZ,
  import_date DATE,
  import_time TIME,
  return_code TEXT,
  message TEXT,
  recovery_status TEXT NOT NULL DEFAULT 'pending',
  recovery_message TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recovered_at TIMESTAMPTZ,
  PRIMARY KEY (source_system_code, trkorr, target_system_code)
);

CREATE INDEX IF NOT EXISTS idx_cr_orphan_transport_recovery
  ON cr_orphan_transport_imports(recovery_status, last_seen_at);

CREATE TABLE IF NOT EXISTS issue_people (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT,
  nickname TEXT,
  email TEXT,
  department TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_issue_people_name CHECK (
    NULLIF(trim(coalesce(full_name, '')), '') IS NOT NULL
    OR NULLIF(trim(coalesce(nickname, '')), '') IS NOT NULL
  )
);

ALTER TABLE issue_people ADD COLUMN IF NOT EXISTS department TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_people_full_name_unique
  ON issue_people (lower(trim(full_name)))
  WHERE NULLIF(trim(coalesce(full_name, '')), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_people_nickname_unique
  ON issue_people (lower(trim(nickname)))
  WHERE NULLIF(trim(coalesce(nickname, '')), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_people_email_unique
  ON issue_people (lower(trim(email)))
  WHERE NULLIF(trim(coalesce(email, '')), '') IS NOT NULL;

CREATE TABLE IF NOT EXISTS issue_headers (
  id BIGSERIAL PRIMARY KEY,
  issue_no INTEGER NOT NULL,
  sub_issue_no TEXT NOT NULL DEFAULT '01',
  issue_name TEXT NOT NULL,
  requester_person_id BIGINT REFERENCES issue_people(id),
  requester_name_snapshot TEXT,
  problem_analysis TEXT,
  impact_analysis TEXT,
  abaper_person_id BIGINT REFERENCES issue_people(id),
  abaper_name_snapshot TEXT,
  email_subject TEXT,
  email_date_received DATE,
  create_issue_date DATE,
  issue_status TEXT,
  cancelled_date DATE,
  cancelled_reason TEXT,
  cancelled_by_person_id BIGINT REFERENCES issue_people(id),
  cancelled_by_name_snapshot TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (issue_no, sub_issue_no)
);

ALTER TABLE issue_headers ADD COLUMN IF NOT EXISTS cancelled_date DATE;
ALTER TABLE issue_headers ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;
ALTER TABLE issue_headers ADD COLUMN IF NOT EXISTS cancelled_by_person_id BIGINT REFERENCES issue_people(id);
ALTER TABLE issue_headers ADD COLUMN IF NOT EXISTS cancelled_by_name_snapshot TEXT;
ALTER TABLE issue_headers ADD COLUMN IF NOT EXISTS email_subject TEXT;
ALTER TABLE issue_headers ADD COLUMN IF NOT EXISTS email_date_received DATE;
ALTER TABLE issue_headers ALTER COLUMN create_issue_date TYPE TIMESTAMPTZ USING create_issue_date::timestamptz;
ALTER TABLE issue_headers ALTER COLUMN cancelled_date TYPE TIMESTAMPTZ USING cancelled_date::timestamptz;

CREATE INDEX IF NOT EXISTS idx_issue_headers_issue_no ON issue_headers(issue_no);
CREATE INDEX IF NOT EXISTS idx_issue_headers_status ON issue_headers(issue_status);
CREATE INDEX IF NOT EXISTS idx_issue_headers_requester ON issue_headers(requester_person_id);
CREATE INDEX IF NOT EXISTS idx_issue_headers_abaper ON issue_headers(abaper_person_id);
CREATE INDEX IF NOT EXISTS idx_issue_headers_create_date ON issue_headers(create_issue_date);
CREATE INDEX IF NOT EXISTS idx_issue_headers_cancelled_date ON issue_headers(cancelled_date);

CREATE TABLE IF NOT EXISTS issue_status_history (
  id BIGSERIAL PRIMARY KEY,
  issue_id BIGINT NOT NULL REFERENCES issue_headers(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT,
  changed_by_person_id BIGINT REFERENCES issue_people(id),
  changed_by_name_snapshot TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issue_status_history_issue ON issue_status_history(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_status_history_to_status ON issue_status_history(to_status);
CREATE INDEX IF NOT EXISTS idx_issue_status_history_changed_at ON issue_status_history(changed_at);

CREATE TABLE IF NOT EXISTS issue_glpi_tickets (
  id BIGSERIAL PRIMARY KEY,
  issue_id BIGINT NOT NULL REFERENCES issue_headers(id) ON DELETE CASCADE,
  ticket_number INTEGER NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (issue_id, ticket_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_glpi_primary
  ON issue_glpi_tickets(issue_id)
  WHERE is_primary;

CREATE INDEX IF NOT EXISTS idx_issue_glpi_ticket_number ON issue_glpi_tickets(ticket_number);

CREATE TABLE IF NOT EXISTS issue_cr_helpdesk_numbers (
  id BIGSERIAL PRIMARY KEY,
  issue_id BIGINT NOT NULL REFERENCES issue_headers(id) ON DELETE CASCADE,
  cr_helpdesk_no TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (issue_id, cr_helpdesk_no)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_cr_helpdesk_primary
  ON issue_cr_helpdesk_numbers(issue_id)
  WHERE is_primary;

CREATE INDEX IF NOT EXISTS idx_issue_cr_helpdesk_no ON issue_cr_helpdesk_numbers(cr_helpdesk_no);

CREATE TABLE IF NOT EXISTS issue_cr_links (
  id BIGSERIAL PRIMARY KEY,
  issue_id BIGINT NOT NULL REFERENCES issue_headers(id) ON DELETE CASCADE,
  sap_system_code TEXT NOT NULL DEFAULT 'DEV',
  trkorr TEXT NOT NULL,
  relation_type TEXT NOT NULL DEFAULT 'main',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  cr_description_snapshot TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (issue_id, sap_system_code, trkorr)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_cr_primary
  ON issue_cr_links(issue_id)
  WHERE is_primary;

CREATE INDEX IF NOT EXISTS idx_issue_cr_links_trkorr ON issue_cr_links(trkorr);
CREATE INDEX IF NOT EXISTS idx_issue_cr_links_system_trkorr ON issue_cr_links(sap_system_code, trkorr);

CREATE TABLE IF NOT EXISTS issue_dev_timeline (
  issue_id BIGINT PRIMARY KEY REFERENCES issue_headers(id) ON DELETE CASCADE,
  dev_tested_date DATE,
  dev_tester_person_id BIGINT REFERENCES issue_people(id),
  dev_tester_name_snapshot TEXT,
  dev_evaluated_date DATE,
  dev_evaluator_person_id BIGINT REFERENCES issue_people(id),
  dev_evaluator_name_snapshot TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE issue_dev_timeline ALTER COLUMN dev_tested_date TYPE TIMESTAMPTZ USING dev_tested_date::timestamptz;
ALTER TABLE issue_dev_timeline ALTER COLUMN dev_evaluated_date TYPE TIMESTAMPTZ USING dev_evaluated_date::timestamptz;

CREATE TABLE IF NOT EXISTS issue_qa_timeline (
  issue_id BIGINT PRIMARY KEY REFERENCES issue_headers(id) ON DELETE CASCADE,
  transported_by_person_id BIGINT REFERENCES issue_people(id),
  transported_by_name_snapshot TEXT,
  qa_tested_date DATE,
  qa_tester_person_id BIGINT REFERENCES issue_people(id),
  qa_tester_name_snapshot TEXT,
  qa_evaluated_date DATE,
  qa_evaluator_person_id BIGINT REFERENCES issue_people(id),
  qa_evaluator_name_snapshot TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE issue_qa_timeline ALTER COLUMN qa_tested_date TYPE TIMESTAMPTZ USING qa_tested_date::timestamptz;
ALTER TABLE issue_qa_timeline ALTER COLUMN qa_evaluated_date TYPE TIMESTAMPTZ USING qa_evaluated_date::timestamptz;

CREATE TABLE IF NOT EXISTS issue_prd_timeline (
  issue_id BIGINT PRIMARY KEY REFERENCES issue_headers(id) ON DELETE CASCADE,
  prd_requester_person_id BIGINT REFERENCES issue_people(id),
  prd_requester_name_snapshot TEXT,
  prd_requested_date DATE,
  prd_evaluator_person_id BIGINT REFERENCES issue_people(id),
  prd_evaluator_name_snapshot TEXT,
  prd_evaluated_date DATE,
  approval_person_id BIGINT REFERENCES issue_people(id),
  approval_name_snapshot TEXT,
  approval_date DATE,
  executor_person_id BIGINT REFERENCES issue_people(id),
  executor_name_snapshot TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE issue_prd_timeline ALTER COLUMN prd_requested_date TYPE TIMESTAMPTZ USING prd_requested_date::timestamptz;
ALTER TABLE issue_prd_timeline ALTER COLUMN prd_evaluated_date TYPE TIMESTAMPTZ USING prd_evaluated_date::timestamptz;
ALTER TABLE issue_prd_timeline ALTER COLUMN approval_date TYPE TIMESTAMPTZ USING approval_date::timestamptz;

CREATE TABLE IF NOT EXISTS issue_documents (
  id BIGSERIAL PRIMARY KEY,
  issue_id BIGINT NOT NULL REFERENCES issue_headers(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  path TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issue_documents_issue ON issue_documents(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_documents_type ON issue_documents(document_type);

CREATE TABLE IF NOT EXISTS issue_participants (
  id BIGSERIAL PRIMARY KEY,
  issue_id BIGINT NOT NULL REFERENCES issue_headers(id) ON DELETE CASCADE,
  person_id BIGINT REFERENCES issue_people(id),
  person_name_snapshot TEXT NOT NULL,
  role TEXT NOT NULL,
  source_field TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (issue_id, role, source_field, person_name_snapshot)
);

CREATE INDEX IF NOT EXISTS idx_issue_participants_issue ON issue_participants(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_participants_person ON issue_participants(person_id);
CREATE INDEX IF NOT EXISTS idx_issue_participants_role ON issue_participants(role);

CREATE TABLE IF NOT EXISTS issue_import_batches (
  id BIGSERIAL PRIMARY KEY,
  source_file TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  import_mode TEXT NOT NULL DEFAULT 'dry-run',
  status TEXT NOT NULL DEFAULT 'running',
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  summary JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_issue_import_batches_started ON issue_import_batches(started_at);
CREATE INDEX IF NOT EXISTS idx_issue_import_batches_status ON issue_import_batches(status);

CREATE TABLE IF NOT EXISTS issue_import_rows (
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES issue_import_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  issue_no INTEGER,
  sub_issue_no TEXT,
  issue_key TEXT,
  row_status TEXT NOT NULL DEFAULT 'pending',
  is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
  cancel_reason TEXT,
  raw_data JSONB,
  normalized_data JSONB,
  warnings TEXT[] NOT NULL DEFAULT '{}',
  errors TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, row_number)
);

CREATE INDEX IF NOT EXISTS idx_issue_import_rows_batch ON issue_import_rows(batch_id);
CREATE INDEX IF NOT EXISTS idx_issue_import_rows_issue_key ON issue_import_rows(issue_key);
CREATE INDEX IF NOT EXISTS idx_issue_import_rows_status ON issue_import_rows(row_status);

INSERT INTO sap_systems (code, description)
VALUES
  ('DEV', 'SAP DEV AIX source for CR management'),
  ('QA', 'SAP QA source for CR management'),
  ('PRD', 'SAP production source for CR management')
ON CONFLICT (code) DO NOTHING;
