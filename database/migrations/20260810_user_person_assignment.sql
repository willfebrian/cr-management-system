BEGIN;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS person_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'fk_app_users_person'
       AND conrelid = 'app_users'::regclass
  ) THEN
    ALTER TABLE app_users
      ADD CONSTRAINT fk_app_users_person
      FOREIGN KEY (person_id)
      REFERENCES issue_people(id) ON DELETE RESTRICT;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_person_unique
  ON app_users (person_id)
  WHERE person_id IS NOT NULL;

COMMIT;
