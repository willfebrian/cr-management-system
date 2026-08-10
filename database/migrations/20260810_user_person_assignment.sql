BEGIN;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS person_id BIGINT
  REFERENCES issue_people(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_person_unique
  ON app_users (person_id)
  WHERE person_id IS NOT NULL;

COMMIT;
