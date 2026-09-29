import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { PERMISSION_CATALOG, type PermissionKey } from "../../shared/permissions.js";

type QueryResult = { rows: Array<{ permission_key: string }> };
type Query = (sql: string, params: unknown[]) => Promise<QueryResult>;

export async function listUserPermissions(
  userId: number,
  query: Query = (sql, params) => pool.query(sql, params)
): Promise<PermissionKey[]> {
  const result = await query(
    "SELECT permission_key FROM app_user_permissions WHERE user_id = $1",
    [userId]
  );
  const selected = new Set(result.rows.map((row) => row.permission_key));
  return PERMISSION_CATALOG.filter((definition) => selected.has(definition.key)).map((definition) => definition.key);
}

export async function replaceUserPermissions(
  client: PoolClient,
  userId: number,
  keys: readonly PermissionKey[]
): Promise<void> {
  await client.query("DELETE FROM app_user_permissions WHERE user_id = $1", [userId]);
  if (keys.length) {
    await client.query(
      "INSERT INTO app_user_permissions (user_id, permission_key) SELECT $1, unnest($2::text[])",
      [userId, [...keys]]
    );
  }
}
