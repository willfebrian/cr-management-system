import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { resolveTransportRequestRuntime } from "../src/server/sap/transportRequestService.js";

test("Create CR transport runtime is bundled inside cr-management-system", () => {
  const previousCreateDir = process.env.SAP_CR_CREATE_PLATFORM_DIR;
  const previousPlatformDir = process.env.SAP_AGENT_PLATFORM_DIR;
  delete process.env.SAP_CR_CREATE_PLATFORM_DIR;
  delete process.env.SAP_AGENT_PLATFORM_DIR;

  try {
    const runtime = resolveTransportRequestRuntime();
    assert.equal(path.basename(runtime.cwd), "cr-management-system");
    assert.equal(runtime.script, path.join(runtime.cwd, "scripts", "cr-transport-request.mjs"));
    assert.equal(fs.existsSync(runtime.script), true);
  } finally {
    if (previousCreateDir === undefined) delete process.env.SAP_CR_CREATE_PLATFORM_DIR;
    else process.env.SAP_CR_CREATE_PLATFORM_DIR = previousCreateDir;
    if (previousPlatformDir === undefined) delete process.env.SAP_AGENT_PLATFORM_DIR;
    else process.env.SAP_AGENT_PLATFORM_DIR = previousPlatformDir;
  }
});
