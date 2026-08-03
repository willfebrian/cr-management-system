BEGIN;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_by_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS delete_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_app_users_management_scope
  ON app_users (deleted_at, is_active, role, username);

CREATE TABLE IF NOT EXISTS app_user_usernames (
  normalized_username TEXT PRIMARY KEY,
  display_username TEXT NOT NULL,
  user_id BIGINT NOT NULL REFERENCES app_users(id),
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retired_at TIMESTAMPTZ,
  changed_by_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
  changed_by_snapshot TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_user_usernames_one_current
  ON app_user_usernames (user_id)
  WHERE is_current;

CREATE INDEX IF NOT EXISTS idx_app_user_usernames_user_history
  ON app_user_usernames (user_id, reserved_at DESC);

INSERT INTO app_user_usernames (
  normalized_username,
  display_username,
  user_id,
  is_current
)
SELECT
  upper(trim(u.username)),
  u.username,
  u.id,
  TRUE
FROM app_users u
WHERE NOT EXISTS (
  SELECT 1
  FROM app_user_usernames existing
  WHERE existing.user_id = u.id
    AND existing.is_current
)
ON CONFLICT (normalized_username) DO NOTHING;

COMMIT;
