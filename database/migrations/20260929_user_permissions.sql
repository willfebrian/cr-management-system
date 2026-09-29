CREATE TABLE IF NOT EXISTS app_user_permissions (
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_app_user_permissions_key
  ON app_user_permissions (permission_key, user_id);

INSERT INTO app_user_permissions (user_id, permission_key)
SELECT u.id, defaults.permission_key
FROM app_users u
CROSS JOIN (VALUES
  ('dashboard.view', true, true),
  ('transport.view', true, true),
  ('transport.export', true, true),
  ('transport.sync', false, true),
  ('issue.view', true, true),
  ('issue.export', true, true),
  ('issue.create', true, true),
  ('issue.edit', true, true),
  ('issue.cr_references', false, true),
  ('issue.glpi_references', false, true),
  ('issue.helpdesk_references', true, true),
  ('issue.cancel_delete', false, true),
  ('issue.generate_email', true, true),
  ('issue.generate_glpi_template', true, true),
  ('issue.create_glpi_ticket', true, true),
  ('issue.generate_cr_transport_form', true, true),
  ('issue.generate_cr_user_form', true, true),
  ('issue.reminder', true, true),
  ('project.view', true, true),
  ('project.create', true, true),
  ('project.edit', true, true),
  ('project.cancel_delete', false, true),
  ('project.documents', true, true),
  ('master_data.view', false, true),
  ('master_data.people', false, true),
  ('master_data.group_emails', false, true),
  ('settings.target_systems', false, true),
  ('settings.general', false, true),
  ('settings.ai', false, true),
  ('settings.templates', false, true),
  ('settings.appearance', true, true),
  ('audit.view', true, true),
  ('users.view', false, true),
  ('users.manage', false, true)
) AS defaults(permission_key, regular_default, admin_default)
WHERE u.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM app_settings WHERE setting_key = 'permissions_backfill_v1')
  AND ((u.role = 'ADMIN' AND defaults.admin_default)
    OR (u.role = 'USER' AND defaults.regular_default))
ON CONFLICT (user_id, permission_key) DO NOTHING;

INSERT INTO app_settings (setting_key, setting_value)
VALUES ('permissions_backfill_v1', 'complete')
ON CONFLICT (setting_key) DO NOTHING;
