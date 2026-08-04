BEGIN;

ALTER TABLE cr_transport_lifecycle
  ADD COLUMN IF NOT EXISTS transport_step TEXT;

UPDATE cr_transport_lifecycle
SET transport_step = upper((regexp_match(message, 'Confirmed from TPALOG step ([A-Za-z])', 'i'))[1])
WHERE transport_step IS NULL
  AND message ~* 'Confirmed from TPALOG step [A-Za-z]';

ALTER TABLE cr_transport_lifecycle
  DROP CONSTRAINT IF EXISTS chk_cr_transport_lifecycle_confirmed_step;

ALTER TABLE cr_transport_lifecycle
  ADD CONSTRAINT chk_cr_transport_lifecycle_confirmed_step
  CHECK (
    transport_status <> 'imported'
    OR (evidence_source = 'confirmed' AND transport_step = 'I')
  ) NOT VALID;

COMMIT;
