import "dotenv/config";
import { pool } from "../src/server/db/pool.ts";

const apply = process.argv.includes("--apply");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: badParents } = await client.query(`
      SELECT sap_system_code, trkorr, owner, description
      FROM cr_requests
      WHERE parent_request IS NULL
        AND COALESCE(upper(owner), '') <> 'TRSTDEV'
      ORDER BY changed_date DESC NULLS LAST, changed_time DESC NULLS LAST, trkorr
    `);

    const { rows: impacted } = await client.query(`
      WITH bad_parent AS (
        SELECT sap_system_code, trkorr
        FROM cr_requests
        WHERE parent_request IS NULL
          AND COALESCE(upper(owner), '') <> 'TRSTDEV'
      ),
      bad_request AS (
        SELECT sap_system_code, trkorr
        FROM bad_parent
        UNION
        SELECT child.sap_system_code, child.trkorr
        FROM cr_requests child
        JOIN bad_parent parent
          ON parent.sap_system_code = child.sap_system_code
          AND parent.trkorr = child.parent_request
      )
      SELECT
        (SELECT COUNT(*)::int FROM bad_parent) AS bad_parent_count,
        (SELECT COUNT(*)::int FROM bad_request) AS bad_request_count,
        (SELECT COUNT(*)::int FROM cr_objects object JOIN bad_request bad ON bad.sap_system_code = object.sap_system_code AND bad.trkorr = object.trkorr) AS object_count,
        (SELECT COUNT(*)::int FROM cr_object_keys object_key JOIN bad_request bad ON bad.sap_system_code = object_key.sap_system_code AND bad.trkorr = object_key.trkorr) AS object_key_count,
        (SELECT COUNT(*)::int FROM cr_status_snapshots snapshot JOIN bad_request bad ON bad.sap_system_code = snapshot.sap_system_code AND bad.trkorr = snapshot.trkorr) AS snapshot_count,
        (SELECT COUNT(*)::int FROM cr_transport_lifecycle lifecycle JOIN bad_parent bad ON bad.sap_system_code = lifecycle.source_system_code AND bad.trkorr = lifecycle.trkorr) AS lifecycle_count,
        (SELECT COUNT(*)::int FROM issue_cr_links link JOIN bad_parent bad ON bad.sap_system_code = link.sap_system_code AND bad.trkorr = link.trkorr) AS issue_link_count
    `);

    console.table(badParents.slice(0, 25));
    console.log(JSON.stringify({ apply, impacted: impacted[0] }, null, 2));

    if (apply && badParents.length) {
      await client.query(`
        WITH bad_parent AS (
          SELECT sap_system_code, trkorr
          FROM cr_requests
          WHERE parent_request IS NULL
            AND COALESCE(upper(owner), '') <> 'TRSTDEV'
        ),
        bad_request AS (
          SELECT sap_system_code, trkorr
          FROM bad_parent
          UNION
          SELECT child.sap_system_code, child.trkorr
          FROM cr_requests child
          JOIN bad_parent parent
            ON parent.sap_system_code = child.sap_system_code
            AND parent.trkorr = child.parent_request
        ),
        delete_object_keys AS (
          DELETE FROM cr_object_keys object_key
          USING bad_request bad
          WHERE bad.sap_system_code = object_key.sap_system_code
            AND bad.trkorr = object_key.trkorr
        ),
        delete_objects AS (
          DELETE FROM cr_objects object
          USING bad_request bad
          WHERE bad.sap_system_code = object.sap_system_code
            AND bad.trkorr = object.trkorr
        ),
        delete_snapshots AS (
          DELETE FROM cr_status_snapshots snapshot
          USING bad_request bad
          WHERE bad.sap_system_code = snapshot.sap_system_code
            AND bad.trkorr = snapshot.trkorr
        ),
        delete_lifecycle AS (
          DELETE FROM cr_transport_lifecycle lifecycle
          USING bad_parent bad
          WHERE bad.sap_system_code = lifecycle.source_system_code
            AND bad.trkorr = lifecycle.trkorr
        ),
        delete_issue_links AS (
          DELETE FROM issue_cr_links link
          USING bad_parent bad
          WHERE bad.sap_system_code = link.sap_system_code
            AND bad.trkorr = link.trkorr
        )
        DELETE FROM cr_requests request
        USING bad_request bad
        WHERE bad.sap_system_code = request.sap_system_code
          AND bad.trkorr = request.trkorr
      `);
    }

    if (apply) {
      await client.query("COMMIT");
    } else {
      await client.query("ROLLBACK");
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
