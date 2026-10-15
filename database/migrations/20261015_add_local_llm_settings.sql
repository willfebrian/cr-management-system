-- Migration: Add Local LLM settings to app_settings
INSERT INTO app_settings (setting_key, setting_value, updated_at) VALUES
  ('local_llm_enabled', 'true', NOW()),
  ('local_llm_base_url', 'http://192.168.1.166:11434/v1', NOW()),
  ('local_llm_model', 'qwen3.8:latest', NOW()),
  ('local_llm_api_key', '', NOW()),
  ('local_llm_timeout', '60000', NOW())
ON CONFLICT (setting_key) DO NOTHING;
