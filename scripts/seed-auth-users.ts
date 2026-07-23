import { pool } from "../src/server/db/pool";
import { hashPassword } from "../src/server/auth/authService";

const initialPassword = process.env.INITIAL_USER_PASSWORD || "admin";
const users = [
  ["TRST-WILLIAM", "ADMIN"],
  ["TRST-BUDI", "ADMIN"],
  ["TRST-FANY", "USER"],
  ["TRST-FIQIH", "USER"]
] as const;

for (const [username, role] of users) {
  const passwordHash = await hashPassword(initialPassword);
  await pool.query(`INSERT INTO app_users (username, password_hash, role)
    VALUES ($1, $2, $3)
    ON CONFLICT (username) DO UPDATE SET role = EXCLUDED.role, is_active = true`, [username, passwordHash, role]);
}
console.log(`Seeded ${users.length} application users.`);
await pool.end();
