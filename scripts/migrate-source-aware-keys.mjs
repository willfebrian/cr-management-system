import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const schemaName = process.env.PGSCHEMA || "cr_management";

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, options: `-c search_path=${schemaName},public` }
    : {
        host: process.env.PGHOST,
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        options: `-c search_path=${schemaName},public`
      }
);

const statements = [
  "ALTER TABLE cr_objects ADD COLUMN IF NOT EXISTS sap_system_code TEXT",
  "ALTER TABLE cr_object_keys ADD COLUMN IF NOT EXISTS sap_system_code TEXT",
  `
    UPDATE cr_objects object
    SET sap_system_code = request.sap_system_code
    FROM cr_requests request
    WHERE object.trkorr = request.trkorr
      AND object.sap_system_code IS NULL
  `,
  `
    UPDATE cr_object_keys object_key
    SET sap_system_code = request.sap_system_code
    FROM cr_requests request
    WHERE object_key.trkorr = request.trkorr
      AND object_key.sap_system_code IS NULL
  `,
  "UPDATE cr_objects SET sap_system_code = 'DEV' WHERE sap_system_code IS NULL",
  "UPDATE cr_object_keys SET sap_system_code = 'DEV' WHERE sap_system_code IS NULL",
  "UPDATE cr_status_snapshots SET sap_system_code = 'DEV' WHERE sap_system_code IS NULL",
  "ALTER TABLE cr_objects ALTER COLUMN sap_system_code SET NOT NULL",
  "ALTER TABLE cr_object_keys ALTER COLUMN sap_system_code SET NOT NULL",
  "ALTER TABLE cr_status_snapshots ALTER COLUMN sap_system_code SET NOT NULL",
  "ALTER TABLE cr_requests ALTER COLUMN sap_system_code SET NOT NULL",
  "ALTER TABLE cr_requests ALTER COLUMN trkorr SET NOT NULL",
  "ALTER TABLE cr_objects ALTER COLUMN trkorr SET NOT NULL",
  "ALTER TABLE cr_object_keys ALTER COLUMN trkorr SET NOT NULL",
  "ALTER TABLE cr_status_snapshots ALTER COLUMN trkorr SET NOT NULL",
  dropConstraint("cr_objects", "cr_objects_trkorr_fkey"),
  dropConstraint("cr_object_keys", "cr_object_keys_trkorr_fkey"),
  dropConstraint("cr_status_snapshots", "cr_status_snapshots_trkorr_fkey"),
  dropConstraint("cr_objects", "cr_objects_trkorr_position_key"),
  dropConstraint("cr_status_snapshots", "cr_status_snapshots_trkorr_sync_run_id_key"),
  dropConstraint("cr_requests", "cr_requests_pkey"),
  `
    ALTER TABLE cr_requests
    ADD CONSTRAINT cr_requests_pkey PRIMARY KEY (sap_system_code, trkorr)
  `,
  `
    ALTER TABLE cr_objects
    ADD CONSTRAINT cr_objects_system_trkorr_position_key UNIQUE (sap_system_code, trkorr, position)
  `,
  `
    ALTER TABLE cr_objects
    ADD CONSTRAINT cr_objects_system_trkorr_fkey
    FOREIGN KEY (sap_system_code, trkorr)
    REFERENCES cr_requests(sap_system_code, trkorr)
    ON DELETE CASCADE
  `,
  `
    ALTER TABLE cr_object_keys
    ADD CONSTRAINT cr_object_keys_system_trkorr_fkey
    FOREIGN KEY (sap_system_code, trkorr)
    REFERENCES cr_requests(sap_system_code, trkorr)
    ON DELETE CASCADE
  `,
  `
    ALTER TABLE cr_status_snapshots
    ADD CONSTRAINT cr_status_snapshots_system_trkorr_sync_run_key UNIQUE (sap_system_code, trkorr, sync_run_id)
  `,
  `
    ALTER TABLE cr_status_snapshots
    ADD CONSTRAINT cr_status_snapshots_system_trkorr_fkey
    FOREIGN KEY (sap_system_code, trkorr)
    REFERENCES cr_requests(sap_system_code, trkorr)
    ON DELETE CASCADE
  `,
  "CREATE INDEX IF NOT EXISTS idx_cr_requests_trkorr ON cr_requests(trkorr)",
  "CREATE INDEX IF NOT EXISTS idx_cr_requests_system ON cr_requests(sap_system_code)",
  "CREATE INDEX IF NOT EXISTS idx_cr_requests_parent ON cr_requests(sap_system_code, parent_request)",
  "CREATE INDEX IF NOT EXISTS idx_cr_objects_request ON cr_objects(sap_system_code, trkorr)",
  "CREATE INDEX IF NOT EXISTS idx_cr_status_snapshots_trkorr ON cr_status_snapshots(sap_system_code, trkorr)"
];

try {
  await pool.query("BEGIN");
  for (const statement of statements) {
    await pool.query(statement);
  }
  await pool.query("COMMIT");
  console.log(JSON.stringify({ ok: true, migrated: "source-aware-keys" }, null, 2));
} catch (error) {
  await pool.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await pool.end();
}

function dropConstraint(tableName, constraintName) {
  return `
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_schema = '${schemaName}'
          AND table_name = '${tableName}'
          AND constraint_name = '${constraintName}'
      ) THEN
        ALTER TABLE ${tableName} DROP CONSTRAINT ${constraintName};
      END IF;
    END $$;
  `;
}
