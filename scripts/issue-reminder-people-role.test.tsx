import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("exposes the Reminder checklist through People Roles and the authenticated user", () => {
  const workspace = readFileSync(new URL("../src/client/pages/MasterDataWorkspace.tsx", import.meta.url), "utf8");
  const adminRoutes = readFileSync(new URL("../src/server/routes/adminRoutes.ts", import.meta.url), "utf8");
  const authService = readFileSync(new URL("../src/server/auth/authService.ts", import.meta.url), "utf8");
  const authRoutes = readFileSync(new URL("../src/server/routes/authRoutes.ts", import.meta.url), "utf8");
  const clientApi = readFileSync(new URL("../src/client/api.ts", import.meta.url), "utf8");

  assert.match(workspace, />Reminder</);
  assert.match(workspace, /is_reminder/);
  assert.match(adminRoutes, /is_reminder/);
  assert.match(authService, /isReminder/);
  assert.match(authRoutes, /isReminder/);
  assert.match(clientApi, /isReminder/);
});
