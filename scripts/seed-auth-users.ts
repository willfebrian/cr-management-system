import { pool } from "../src/server/db/pool";
import { hashPassword } from "../src/server/auth/authService";
import { ADMIN_PRESET, REGULAR_USER_PRESET } from "../src/shared/permissions";

const initialPassword = process.env.INITIAL_USER_PASSWORD || "admin";
const users = [
  ["TRST-WILLIAM", "ADMIN"],
  ["TRST-BUDI", "ADMIN"],
  ["TRST-FANY", "USER"],
  ["TRST-FIQIH", "USER"]
] as const;

for (const [username, role] of users) {
  const client = await pool.connect();
  const passwordHash = await hashPassword(initialPassword);
  try {
    await client.query("BEGIN");
    const inserted = await client.query<{ id: number }>(`INSERT INTO app_users (username, password_hash, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (username) DO NOTHING
      RETURNING id`, [username, passwordHash, role]);
    const account = inserted.rows[0] || (await client.query<{ id: number }>(
      `UPDATE app_users SET role = $2, is_active = true WHERE username = $1 RETURNING id`,
      [username, role]
    )).rows[0];

    if (inserted.rows[0] && account) {
      const permissions = role === "ADMIN" ? ADMIN_PRESET : REGULAR_USER_PRESET;
      for (const permission of permissions) {
        await client.query(
          `INSERT INTO app_user_permissions (user_id, permission_key) VALUES ($1, $2) ON CONFLICT (user_id, permission_key) DO NOTHING`,
          [account.id, permission]
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
console.log(`Seeded ${users.length} application users.`);
await pool.end();
