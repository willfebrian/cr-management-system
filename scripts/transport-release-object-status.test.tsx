import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { TransportReleaseService } from "../mcp/sap/transport-release-service.mjs";
import { transportObjectLabel } from "../src/shared/transportObjectLabels.js";

test("provides a readable description for known and unknown SAP transport object types", () => {
  assert.equal(transportObjectLabel("LIMU", "REPS"), "Source/include ABAP");
  assert.equal(transportObjectLabel("R3TR", "TABL"), "Table");
  assert.equal(transportObjectLabel("R3TR", "ZNEW"), "SAP transport object (R3TR ZNEW)");
});

test("RFC test run uses SAP's generic inactive-object release check", () => {
  const source = readFileSync(new URL("../sap/abap/zrfc_transport_request_release/ZRFC_TRANSPORT_REQUEST_RELEASE.abap", import.meta.url), "utf8");
  assert.match(source, /CALL FUNCTION 'TRINT_CHECK_INACTIVE_OBJECTS'/);
  assert.match(source, /TYPE STANDARD TABLE OF SPROT_U/);
  assert.match(source, /LS_INACTIVE_LOG-VAR2/);
  assert.match(source, /Inactive' LV_INACTIVE_DESC/);
});

test("RFC test run uses SAP CTS preflight checks for repository, locks, and authorization", () => {
  const source = readFileSync(new URL("../sap/abap/zrfc_transport_request_release/ZRFC_TRANSPORT_REQUEST_RELEASE.abap", import.meta.url), "utf8");
  assert.match(source, /CALL FUNCTION 'TR_REQ_CHECK_OBJECT'/);
  assert.match(source, /IV_ACCEPT_MISSING_TADIR\s*= SPACE/);
  assert.match(source, /IV_CHECK_LOCKABILITY\s*= 'X'/);
  assert.match(source, /IV_RELEASE_CHECKS\s*= 'X'/);
  assert.match(source, /CALL FUNCTION 'TR_AUTHORITY_CHECK_TRFUNCTION'/);
  assert.match(source, /Authorization preflight failed/);
  assert.match(source, /Repository or lock consistency check failed/);
});

test("RFC explains inactive REPT objects as program text and selection texts", () => {
  const source = readFileSync(new URL("../sap/abap/zrfc_transport_request_release/ZRFC_TRANSPORT_REQUEST_RELEASE.abap", import.meta.url), "utf8");
  assert.match(source, /WHEN 'REPT'/);
  assert.match(source, /Program Text \/ Selection Texts/);
  assert.match(source, /Inactive' LV_INACTIVE_DESC/);
});

test("RFC summarizes multiple inactive objects without counting the task row", () => {
  const source = readFileSync(new URL("../sap/abap/zrfc_transport_request_release/ZRFC_TRANSPORT_REQUEST_RELEASE.abap", import.meta.url), "utf8");
  assert.match(source, /LV_OBJECT_ERROR_COUNT/);
  assert.match(source, /object errors found/);
  assert.match(source, /See object details below/);
  assert.match(source, /DELETE ADJACENT DUPLICATES/);
});

test("RFC verifies each background release in E070 before continuing to the next request", () => {
  const source = readFileSync(new URL("../sap/abap/zrfc_transport_request_release/ZRFC_TRANSPORT_REQUEST_RELEASE.abap", import.meta.url), "utf8");
  assert.match(source, /Release confirmation timeout/);
  assert.match(source, /SELECT SINGLE TRSTATUS INTO LV_VERIFIED_STATUS/);
  assert.match(source, /LV_VERIFIED_STATUS = 'R'/);
  assert.match(source, /LV_SUBRC = 5 OR LV_SUBRC = 11/);
  assert.match(source, /WAIT UP TO 2 SECONDS/);
});

test("groups SAP object validation rows under their owning task", async () => {
  const service = new TransportReleaseService({
    targetSystem: "DEV_AIX",
    client: {
      async call() {
        return {
          EV_SUCCESS: "X",
          EV_MESSAGE: "TEST_RUN_OK",
          ET_RESULTS: [
            { LINE: "TASK|TRDK924683|S|Child task|PASS|Ready for release|1" },
            { LINE: "OBJECT|TRDK924683|R3TR|PROG|ZDEMO_PROGRAM|PASS|Object ready|1" },
            { LINE: "TASK|TRDK924682|K|Parent request|PASS|Ready for release|2" }
          ]
        };
      }
    },
    auditLogger: { write() {} }
  });

  const result = await service.testRun("TRDK924682");

  assert.equal(result.tasks.length, 2);
  assert.deepEqual(result.tasks[0].objects, [{
    trkorr: "TRDK924683",
    pgmid: "R3TR",
    objectType: "PROG",
    objectName: "ZDEMO_PROGRAM",
    status: "PASS",
    message: "Object ready",
    sequence: 1,
    statusSource: "SAP"
  }]);
});

test("keeps supporting the legacy six-column task result", async () => {
  const service = new TransportReleaseService({
    targetSystem: "DEV_NC",
    client: {
      async call() {
        return {
          EV_SUCCESS: "X",
          EV_MESSAGE: "TEST_RUN_OK",
          ET_RESULTS: [{ LINE: "TRSK900001|S|Legacy task|PASS|Ready for release|1" }]
        };
      }
    },
    auditLogger: { write() {} }
  });

  const result = await service.testRun("TRSK900000");

  assert.equal(result.tasks[0].trkorr, "TRSK900001");
  assert.deepEqual(result.tasks[0].objects, []);
});

test("enriches missing SAP object rows from synchronized E071 data", async () => {
  const releaseService = await import("../src/server/sap/transportReleaseService.js") as Record<string, unknown>;
  const enrich = releaseService.enrichReleaseResultWithObjects as undefined | ((
    result: Record<string, any>,
    targetSystem: string,
    query: (sql: string, params: unknown[]) => Promise<{ rows: any[] }>
  ) => Promise<Record<string, any>>);

  assert.equal(typeof enrich, "function");
  const result = await enrich!({
    ok: true,
    hasErrors: false,
    tasks: [{
      trkorr: "TRDK924683",
      trfunction: "S",
      description: "Child task",
      status: "PASS",
      message: "Ready for release",
      sequence: 1,
      objects: []
    }]
  }, "DEV_AIX", async () => ({ rows: [{
    trkorr: "TRDK924683",
    pgmid: "R3TR",
    object_type: "PROG",
    object_name: "ZDEMO_PROGRAM"
  }] }));

  assert.deepEqual(result.tasks[0].objects, [{
    trkorr: "TRDK924683",
    pgmid: "R3TR",
    objectType: "PROG",
    objectName: "ZDEMO_PROGRAM",
    status: "PASS",
    message: "Inherited from task status: Ready for release",
    sequence: 1,
    statusSource: "TASK"
  }]);
});

test("an SAP object error blocks release even when the task row passes", async () => {
  const releaseService = await import("../src/server/sap/transportReleaseService.js") as Record<string, unknown>;
  const enrich = releaseService.enrichReleaseResultWithObjects as any;
  assert.equal(typeof enrich, "function");

  const result = await enrich({
    ok: true,
    hasErrors: false,
    tasks: [{
      trkorr: "TRDK924683",
      status: "PASS",
      message: "Ready for release",
      sequence: 1,
      objects: [{
        trkorr: "TRDK924683",
        pgmid: "R3TR",
        objectType: "PROG",
        objectName: "ZBROKEN_PROGRAM",
        status: "ERROR",
        message: "Object validation failed",
        sequence: 1,
        statusSource: "SAP"
      }]
    }]
  }, "DEV_AIX", async () => ({ rows: [] }));

  assert.equal(result.hasErrors, true);
  assert.equal(result.ok, false);
});

test("returns a complete failed Test Run payload instead of converting it into an HTTP error", async () => {
  const releaseService = await import("../src/server/sap/transportReleaseService.js") as Record<string, unknown>;
  const classify = releaseService.classifyReleaseProcessResult as undefined | ((
    action: "test-run" | "release",
    exitCode: number | null,
    result: Record<string, unknown>
  ) => "RESULT" | "ERROR");

  assert.equal(typeof classify, "function");
  assert.equal(classify!("test-run", 0, {
    ok: false,
    mode: "TEST_RUN",
    message: "TEST_RUN_HAS_ERRORS",
    hasErrors: true,
    tasks: [{ trkorr: "TRDK924683", status: "ERROR", objects: [{ objectName: "ZBAP_READY_REPORT_F01", status: "ERROR" }] }]
  }), "RESULT");
  assert.equal(classify!("release", 0, { ok: false, message: "RELEASE_FAILED", tasks: [] }), "ERROR");
  assert.equal(classify!("test-run", 1, { ok: false, message: "RFC_FAILURE", tasks: [] }), "ERROR");
});

test("keeps the release worker alive long enough for SAP background confirmation", async () => {
  const releaseService = await import("../src/server/sap/transportReleaseService.js") as Record<string, unknown>;
  const timeoutFor = releaseService.releaseRuntimeTimeoutMs as undefined | ((action: "test-run" | "release", baseTimeoutMs: number) => number);
  assert.equal(typeof timeoutFor, "function");
  assert.equal(timeoutFor!("test-run", 60_000), 60_000);
  assert.equal(timeoutFor!("release", 60_000), 180_000);
  assert.equal(timeoutFor!("release", 240_000), 240_000);
});

test("renders object statuses beneath the owning Test Run task", async () => {
  const releaseModule = await import("../src/client/components/crTransport/CrTransportRelease.js") as Record<string, unknown>;
  const ResultsPanel = releaseModule.ReleaseResultsPanel as React.ComponentType<any> | undefined;
  assert.equal(typeof ResultsPanel, "function");

  const html = renderToStaticMarkup(React.createElement(ResultsPanel!, {
    title: "Test Run Result",
    result: {
      ok: true,
      message: "TEST_RUN_OK",
      tasks: [{
        trkorr: "TRDK924683",
        description: "Child task",
        status: "PASS",
        message: "Ready for release",
        sequence: 1,
        objects: [{
          trkorr: "TRDK924683",
          pgmid: "R3TR",
          objectType: "PROG",
          objectName: "ZDEMO_PROGRAM",
          status: "PASS",
          message: "Inherited from task status: Ready for release",
          sequence: 1,
          statusSource: "TASK"
        }]
      }]
    }
  }));

  assert.match(html, /ZDEMO_PROGRAM/);
  assert.match(html, /PROG/);
  assert.match(html, /Program/);
  assert.match(html, /Inherited from task/);
});

test("renders the parent task before child tasks without changing object grouping", async () => {
  const releaseModule = await import("../src/client/components/crTransport/CrTransportRelease.js") as Record<string, unknown>;
  const ResultsPanel = releaseModule.ReleaseResultsPanel as React.ComponentType<any>;
  const html = renderToStaticMarkup(React.createElement(ResultsPanel, {
    title: "Test Run Result",
    result: {
      trkorr: "TRDK924682",
      ok: true,
      message: "TEST_RUN_OK",
      tasks: [
        { trkorr: "TRDK924683", description: "Child", status: "PASS", message: "Ready", sequence: 1, objects: [{ objectName: "ZCHILD", objectType: "REPS", pgmid: "LIMU", status: "PASS", message: "Ready", sequence: 1, statusSource: "SAP" }] },
        { trkorr: "TRDK924682", description: "Parent", status: "PASS", message: "Ready", sequence: 2, objects: [] }
      ]
    }
  }));

  assert.ok(html.indexOf("TRDK924682") < html.indexOf("TRDK924683"));
  assert.ok(html.indexOf("ZCHILD") > html.indexOf("TRDK924683"));
  assert.match(html, /<td class="center muted">1<\/td><td class="monospace">TRDK924682/);
  assert.match(html, /<td class="center muted">2<\/td><td class="monospace">TRDK924683/);
});

test("renders clear release progress and final outcome notifications", async () => {
  const releaseModule = await import("../src/client/components/crTransport/CrTransportRelease.js") as Record<string, unknown>;
  const OperationStatus = releaseModule.ReleaseOperationStatus as React.ComponentType<any> | undefined;
  assert.equal(typeof OperationStatus, "function");

  const progress = renderToStaticMarkup(React.createElement(OperationStatus!, {
    isReleasing: true,
    result: null
  }));
  assert.match(progress, /Release in progress/);
  assert.match(progress, /Waiting for SAP to confirm/);

  const success = renderToStaticMarkup(React.createElement(OperationStatus!, {
    isReleasing: false,
    result: { ok: true, message: "RELEASE_COMPLETE", syncQueued: true }
  }));
  assert.match(success, /Released successfully/);
  assert.match(success, /CR sync has been queued/);

  const failed = renderToStaticMarkup(React.createElement(OperationStatus!, {
    isReleasing: false,
    result: { ok: false, message: "PARENT_RELEASE_FAILED" }
  }));
  assert.match(failed, /Release failed/);
  assert.match(failed, /PARENT_RELEASE_FAILED/);
});
