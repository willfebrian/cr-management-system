ALTER TABLE issue_people
  ADD COLUMN IF NOT EXISTS is_reminder BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS issue_reminder_emails (
  id BIGSERIAL PRIMARY KEY,
  issue_id BIGINT NOT NULL REFERENCES issue_headers(id) ON DELETE CASCADE,
  sender_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
  sender_person_id BIGINT REFERENCES issue_people(id) ON DELETE SET NULL,
  to_recipients TEXT NOT NULL,
  cc_recipients TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  notes TEXT NOT NULL,
  primary_cr TEXT,
  primary_cr_status TEXT,
  mcp_message_id TEXT,
  mcp_status TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issue_reminder_emails_issue_sent_at
  ON issue_reminder_emails(issue_id, sent_at DESC);
