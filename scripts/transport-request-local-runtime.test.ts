import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { resolveTransportRequestRuntime } from "../src/server/sap/transportRequestService.js";

test("Create CR transport runtime is bundled inside this application checkout", () => {
  const previousCreateDir = process.env.SAP_CR_CREATE_PLATFORM_DIR;
  delete process.env.SAP_CR_CREATE_PLATFORM_DIR;

  try {
    const runtime = resolveTransportRequestRuntime();
    assert.equal(runtime.cwd, process.cwd());
    assert.equal(runtime.script, path.join(runtime.cwd, "scripts", "cr-transport-request.mjs"));
    assert.equal(fs.existsSync(runtime.script), true);
  } finally {
    if (previousCreateDir === undefined) delete process.env.SAP_CR_CREATE_PLATFORM_DIR;
    else process.env.SAP_CR_CREATE_PLATFORM_DIR = previousCreateDir;
  }
});

test("SAP connector runtime does not reference the legacy platform directory", () => {
  const files = [
    "src/server/config.ts",
    "src/server/sap/crExtractor.ts",
    "scripts/refresh-transport-logs.mjs",
    ".env.example"
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    assert.equal(source.includes("SAP_AGENT_PLATFORM_DIR"), false, file);
  }
  const extractor = fs.readFileSync(path.join(process.cwd(), "src/server/sap/crExtractor.ts"), "utf8");
  assert.match(extractor, /SAP_DISCOVERY_SCRIPT must be a relative path/);
  assert.match(extractor, /SAP_DISCOVERY_SCRIPT must stay inside cr-management-system/);
});
