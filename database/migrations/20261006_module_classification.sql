CREATE TABLE IF NOT EXISTS module_master (
  id BIGSERIAL PRIMARY KEY,
  module_group TEXT NOT NULL CHECK (module_group IN ('SAP', 'NON-SAP')),
  code TEXT NOT NULL CHECK (code = upper(trim(code)) AND code <> ''),
  name TEXT NOT NULL CHECK (trim(name) <> ''),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (module_group, code)
);
CREATE TABLE IF NOT EXISTS issue_module_links (
  issue_id BIGINT NOT NULL REFERENCES issue_headers(id) ON DELETE CASCADE,
  module_id BIGINT NOT NULL REFERENCES module_master(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (issue_id, module_id)
);
CREATE INDEX IF NOT EXISTS idx_issue_module_links_module ON issue_module_links(module_id, issue_id);
INSERT INTO module_master (module_group, code, name, is_active) VALUES
 ('SAP','PP','Production Planning',true),
 ('SAP','MM','Materials Management',true),
 ('SAP','SD','Sales and Distribution',true),
 ('SAP','FICO','Finance and Controlling',true),
 ('SAP','PM','Plant Maintenance',true),
 ('SAP','QM','Quality Management',true),
 ('SAP','WM','Warehouse Management',true),
 ('SAP','HCM','Human Capital Management',true),
 ('SAP','BASIS','Basis',true),
 ('SAP','ABAP','ABAP Development',true),
 ('NON-SAP','OLAP','OLAP',true),
 ('NON-SAP','IT-INVENTORY','IT Inventory',true)
ON CONFLICT (module_group, code) DO NOTHING;

INSERT INTO app_user_permissions (user_id, permission_key)
SELECT id, 'master_data.modules' FROM app_users WHERE role = 'ADMIN'
ON CONFLICT (user_id, permission_key) DO NOTHING;
