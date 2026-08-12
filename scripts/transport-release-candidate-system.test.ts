import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("maps the TRD Development AIX target to the synced DEV request dataset", async () => {
  const releaseRoutes = await import("../src/server/routes/transportReleaseRoutes.js") as Record<string, unknown>;
  const mapCandidateSystem = releaseRoutes.releaseCandidateSourceSystem as
    | ((targetSystem: string) => string)
    | undefined;

  assert.equal(mapCandidateSystem?.("TRD"), "DEV");
});

test("returns the last successful source-system sync with release candidates", async () => {
  const releaseRoutes = await import("../src/server/routes/transportReleaseRoutes.js") as Record<string, unknown>;
  const loadSnapshot = releaseRoutes.loadReleaseCandidateSnapshot as
    | ((targetSystem: string, limit: number, query: string, dependencies: {
        query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>;
        getLastSuccessfulSyncRun: (sourceSystem: string) => Promise<Record<string, unknown> | null>;
      }) => Promise<Record<string, unknown>>)
    | undefined;

  assert.equal(typeof loadSnapshot, "function");
  const snapshot = await loadSnapshot!("TRD", 50, "", {
    query: async () => ({ rows: [] }),
    getLastSuccessfulSyncRun: async (sourceSystem) => ({
      sap_system_code: sourceSystem,
      started_at: "2026-08-12T04:10:00.000Z",
      finished_at: "2026-08-12T04:16:00.000Z"
    })
  });

  assert.equal(snapshot.targetSystem, "TRD");
  assert.equal(snapshot.lastSyncedAt, "2026-08-12T04:16:00.000Z");
});

test("searches all eligible Release candidates before applying the result limit", async () => {
  const releaseRoutes = await import("../src/server/routes/transportReleaseRoutes.js") as Record<string, unknown>;
  const loadSnapshot = releaseRoutes.loadReleaseCandidateSnapshot as
    | ((targetSystem: string, limit: number, query: string, dependencies: {
        query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>;
        getLastSuccessfulSyncRun: (sourceSystem: string) => Promise<Record<string, unknown> | null>;
      }) => Promise<Record<string, unknown>>)
    | undefined;
  let capturedSql = "";
  let capturedParams: unknown[] = [];

  assert.equal(typeof loadSnapshot, "function");
  await loadSnapshot!("TRD", 50, "TRDK905650", {
    query: async (sql, params) => {
      capturedSql = sql;
      capturedParams = params;
      return { rows: [{
        trkorr: "TRDK905650",
        description: "Comment Exit Customer (jgn transport)",
        owner: "TRSTDEV",
        status_group: "outstanding",
        changed_date: "2013-01-30",
        target_system: "TRQ",
        task_count: 1
      }] };
    },
    getLastSuccessfulSyncRun: async () => null
  });

  assert.match(capturedSql, /cr\.trkorr ILIKE \$2/);
  assert.ok(capturedSql.indexOf("ILIKE") < capturedSql.indexOf("LIMIT"));
  assert.deepEqual(capturedParams, ["DEV", "%TRDK905650%", 50]);
});

test("orders the default Release list by the newest transport number", async () => {
  const releaseRoutes = await import("../src/server/routes/transportReleaseRoutes.js") as Record<string, unknown>;
  const loadSnapshot = releaseRoutes.loadReleaseCandidateSnapshot as
    | ((targetSystem: string, limit: number, query: string, dependencies: {
        query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>;
        getLastSuccessfulSyncRun: (sourceSystem: string) => Promise<Record<string, unknown> | null>;
      }) => Promise<Record<string, unknown>>)
    | undefined;
  let capturedSql = "";

  assert.equal(typeof loadSnapshot, "function");
  await loadSnapshot!("TRD", 50, "", {
    query: async (sql) => {
      capturedSql = sql;
      return { rows: [] };
    },
    getLastSuccessfulSyncRun: async () => null
  });

  assert.match(capturedSql, /ORDER BY cr\.trkorr DESC\s+LIMIT \$2/);
  assert.doesNotMatch(capturedSql, /ORDER BY cr\.changed_date/);
});

test("renders consistent target labels and informative English Release empty states", async () => {
  const releaseModule = await import("../src/client/components/crTransport/CrTransportRelease.js") as Record<string, unknown>;
  const CrTransportRelease = releaseModule.CrTransportRelease as React.ComponentType<Record<string, unknown>>;
  const html = renderToStaticMarkup(React.createElement(CrTransportRelease, {
    targetSystem: "TRD",
    availableSystems: [{ code: "TRD", description: "Development AIX", is_active: true }]
  }));

  assert.doesNotMatch(html, /Target System/);
  assert.doesNotMatch(html, />Refresh</);
  assert.doesNotMatch(html, /Last synced:/);
  assert.match(html, /No outstanding parent transport requests found for this target/);
  assert.match(html, /Select a parent transport request to view its child tasks and run the pre-check before release/);
});

test("refreshes Release candidates after a successful Sync CR operation", async () => {
  const releaseModule = await import("../src/client/components/crTransport/CrTransportRelease.js") as Record<string, unknown>;
  const nextReleaseRefreshToken = releaseModule.nextReleaseRefreshToken as
    | ((current: number, view: string, syncSucceeded: boolean) => number)
    | undefined;

  assert.equal(typeof nextReleaseRefreshToken, "function");
  assert.equal(nextReleaseRefreshToken!(4, "cr-transport-release", true), 5);
  assert.equal(nextReleaseRefreshToken!(4, "cr-transport-create", true), 4);
  assert.equal(nextReleaseRefreshToken!(4, "cr-transport-release", false), 4);
});

test("uses the shared confirmation modal pattern for Release", async () => {
  const releaseModule = await import("../src/client/components/crTransport/CrTransportRelease.js") as Record<string, unknown>;
  const ReleaseConfirmationDialog = releaseModule.ReleaseConfirmationDialog as
    | React.ComponentType<Record<string, unknown>>
    | undefined;

  assert.equal(typeof ReleaseConfirmationDialog, "function");
  const html = renderToStaticMarkup(React.createElement(ReleaseConfirmationDialog!, {
    isOpen: true,
    busy: false,
    candidate: {
      trkorr: "TRDK924682",
      description: "Updated description",
      owner: "TRSTDEV",
      taskCount: 1
    },
    targetLabel: "Development AIX · TRD",
    onClose: () => {},
    onConfirm: () => {}
  }));

  assert.match(html, /Release SAP transport request\?/);
  assert.match(html, /TRDK924682/);
  assert.match(html, /1 child task/);
  assert.match(html, /Release Request/);
});
