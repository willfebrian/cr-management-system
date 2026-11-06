import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";

test("CR module columns, preserved assignments, TRSTDEV filters, task inheritance, and export", { skip: !process.env.CR_MODULE_TEST_ENV_PATH }, async () => {
  dotenv.config({ path: process.env.CR_MODULE_TEST_ENV_PATH });
  const schema = "cr_module_test_" + randomBytes(6).toString("hex");
  assert.match(schema, /^cr_module_test_[a-f0-9]{12}$/);
  process.env.PGSCHEMA = schema;
  const bootstrap = new pg.Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
    host: process.env.PGHOST, port: Number(process.env.PGPORT || 5432), database: process.env.PGDATABASE,
    user: process.env.PGUSER, password: process.env.PGPASSWORD
  });
  let appPool: pg.Pool | undefined;
  try {
    await bootstrap.query("CREATE SCHEMA " + schema);
    const client = await bootstrap.connect();
    try {
      await client.query("SET search_path TO " + schema);
      await client.query(readFileSync(new URL("../database/schema.sql", import.meta.url), "utf8"));
      const migration = readFileSync(new URL("../database/migrations/20261022_cr_transport_modules.sql", import.meta.url), "utf8");
      await client.query(migration);
      await client.query(migration);
      for (const [description, expected] of [
        ["AB - Add column", "ABAP"], ["  alf-New label", "ABAP"], ["\tBC : Note", "BASIS"],
        ["fi-posting", "FICO"], ["CO allocation", "FICO"], ["MM-TCODE", "MM"], ["SD config", "SD"],
        ["PP config", "PP"], ["PM config", "PM"], ["QM config", "QM"], ["WM config", "WM"],
        ["HR change", null], ["HC change", null], ["NC-ABAP-Add", null], ["ZFI payment", null],
        ["ABAP-Create", null], ["AB-Create", null], ["OLAP report", null], ["", null], [null, null]
      ]) {
        const { rows } = await client.query("SELECT code FROM module_master WHERE module_group='SAP' AND code=cr_module_code($1)", [description]);
        assert.equal(rows[0]?.code || null, expected, String(description));
      }
      appPool = (await import("../src/server/db/pool.js")).pool;
      const repository = await import("../src/server/db/crRepository.js");
      const syncRun = await repository.createSyncRun({ scopeOwner: "*", sapSystemCode: "DEV", periodType: "date_range", periodValue: null, fromDate: "2026-01-01", toDate: "2026-10-22", maxRows: 100 });
      const header = { trkorr: "TESTK900001", description: "FI posting", owner: "TRSTDEV", statusGroup: "outstanding" };
      await repository.upsertCrHeader(header, "DEV", syncRun);
      assert.equal((await repository.getCrDetailForSystem(header.trkorr, "DEV")).request.module_id, null);
      await client.query("UPDATE cr_requests SET module_id=(SELECT id FROM module_master WHERE module_group='SAP' AND code='FICO') WHERE trkorr=$1", [header.trkorr]);
      await repository.upsertCrHeader({ ...header, trkorr: "OTHERK900001", owner: "OTHER_USER" }, "DEV", syncRun);
      assert.equal((await repository.listCrRequests({ owner: "OTHER_USER" })).total, 0);

      await repository.upsertCrHeader({ ...header, trkorr: "TESTK900002", parentRequest: header.trkorr, description: "MM child task", owner: "OTHER_USER" }, "DEV", syncRun);
      let detail = await repository.getCrDetailForSystem(header.trkorr, "DEV");
      assert.equal(detail.request.module_code, "FICO");
      assert.equal(detail.tasks[0].module_code, "FICO");
      assert.equal(detail.tasks[0].module_id, null);
      assert.equal((await repository.listCrRequests({ moduleCode: "FICO" })).total, 1);
      assert.equal((await repository.listCrRequests({ moduleCode: "MM" })).total, 0);
      assert.equal((await repository.listCrRequests({ moduleCode: "unclassified" })).total, 0);
      await repository.upsertCrHeader({ ...header, description: "MM updated" }, "DEV", syncRun);
      detail = await repository.getCrDetailForSystem(header.trkorr, "DEV");
      assert.equal(detail.request.module_code, "FICO");
      assert.equal(detail.tasks[0].module_code, "FICO");
      const { exportCrReport } = await import("../src/server/services/reportExportService.js");
      const workbook = await exportCrReport({ moduleCode: "FICO" });
      assert.match(workbook.toString("utf8"), />Module</);
      assert.match(workbook.toString("utf8"), />FICO</);
      await repository.upsertCrHeader({ ...header, description: "Unmatched description" }, "DEV", syncRun);
      assert.equal((await repository.getCrDetailForSystem(header.trkorr, "DEV")).request.module_code, "FICO");
      assert.equal((await repository.listCrRequests({ moduleCode: "unclassified" })).total, 0);
      await assert.rejects(client.query("UPDATE cr_requests SET module_id=-1 WHERE trkorr=$1", [header.trkorr]), (error: any) => error.code === "23503");
    } finally { client.release(); }
  } finally {
    if (appPool) await appPool.end();
    // Remove only this test's randomly generated schema.
    if (/^cr_module_test_[a-f0-9]{12}$/.test(schema)) await bootstrap.query("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
    await bootstrap.end();
  }
});
