-- Store the parent transport's classification independently of Issue modules.
ALTER TABLE cr_requests
  ADD COLUMN IF NOT EXISTS module_id BIGINT REFERENCES module_master(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_cr_requests_module ON cr_requests(module_id);

-- Return a candidate code; only codes present in the SAP module master are assigned.
CREATE OR REPLACE FUNCTION cr_module_code(description TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN normalized LIKE 'AB - %' OR normalized LIKE 'ALF%' THEN 'ABAP'
    WHEN normalized LIKE 'BC%' THEN 'BASIS'
    WHEN left(normalized, 2) IN ('FI', 'CO') THEN 'FICO'
    WHEN left(normalized, 2) IN ('HR', 'HC') THEN NULL
    ELSE NULLIF(left(normalized, 2), '')
  END
  FROM (SELECT upper(regexp_replace(coalesce(description, ''), '^\s+', '')) AS normalized) source;
$$;
