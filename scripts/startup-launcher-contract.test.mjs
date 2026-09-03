import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const cmdPath = path.join(root, "scripts", "start-cr-management-system.cmd");
const ps1Path = path.join(root, "scripts", "start-cr-management-system.ps1");

test("Windows launcher delegates to an idempotent PowerShell startup guard", () => {
  assert.equal(fs.existsSync(ps1Path), true, "PowerShell startup guard is missing");
  const cmd = fs.readFileSync(cmdPath, "utf8");
  const ps1 = fs.readFileSync(ps1Path, "utf8");
  assert.match(cmd, /start-cr-management-system\.ps1/i);
  assert.match(ps1, /api\/health/);
  assert.match(ps1, /already running/i);
  assert.match(ps1, /npm\.cmd/);
});
