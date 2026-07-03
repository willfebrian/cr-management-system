import { Router } from "express";
import { assertDatabaseConfigured } from "../db/pool.js";
import {
  getCrDetailForSystem,
  getDashboard,
  getDashboardStatusTrend,
  listCrRequests,
} from "../db/crRepository.js";
import { cancelIssue, deleteIssue, getIssueDetail, getIssueStatusOptions, getNextIssueNumber, getNextSubIssueNumber, listIssues, registerIssuePeople, saveIssue, searchIssueCrHelpdesk, searchIssueCrLinks, searchIssueGlpi, searchIssuePeople, validateIssuePeople } from "../db/issueRepository.js";
import { getSapCrSystem, listSapCrSystems } from "../config.js";
import { normalizeLookbackDays, normalizeSyncMode, normalizeSystemCodes, runCrSync } from "../sync/crSyncRunner.js";
import { buildIssueTemplatePreview, type IssueTemplateKind } from "../templates/issueTemplateService.js";

export const crRoutes = Router();

crRoutes.get("/health", (_req, res) => {
  res.json({ ok: true, app: "CR Management System" });
});

crRoutes.get("/systems", (_req, res) => {
  res.json({ rows: listSapCrSystems() });
});

crRoutes.get("/dashboard", async (_req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json(await getDashboard());
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/dashboard/status-trend", async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json(await getDashboardStatusTrend({
      fromPeriod: stringQuery(req.query.fromPeriod),
      toPeriod: stringQuery(req.query.toPeriod)
    }));
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/cr", async (_req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json({
      ...(await listCrRequests({
        status: stringQuery(_req.query.status),
        lifecycleStatus: stringQuery(_req.query.lifecycleStatus),
        sapSystemCode: stringQuery(_req.query.sapSystemCode),
        owner: stringQuery(_req.query.owner),
        q: stringQuery(_req.query.q),
        fromDate: stringQuery(_req.query.fromDate),
        toDate: stringQuery(_req.query.toDate),
        page: numberQuery(_req.query.page, 1),
        pageSize: numberQuery(_req.query.pageSize, 10)
      }))
    });
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/cr/:trkorr", async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    const system = getSapCrSystem(stringQuery(req.query.sapSystemCode));
    res.json(await getCrDetailForSystem(req.params.trkorr.toUpperCase(), system.code));
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/issues", async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json(await listIssues({
      status: stringQuery(req.query.status),
      q: stringQuery(req.query.q),
      requester: stringQuery(req.query.requester),
      abaper: stringQuery(req.query.abaper),
      crHelpdesk: stringQuery(req.query.crHelpdesk),
      cr: stringQuery(req.query.cr),
      glpi: stringQuery(req.query.glpi),
      fromDate: stringQuery(req.query.fromDate),
      toDate: stringQuery(req.query.toDate),
      page: numberQuery(req.query.page, 1),
      pageSize: numberQuery(req.query.pageSize, 25)
    }));
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/issues/status-options", async (_req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json({ rows: await getIssueStatusOptions() });
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/issues/next-number", async (_req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json(await getNextIssueNumber());
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/issues/next-sub-issue", async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json(await getNextSubIssueNumber(numberQuery(req.query.issueNo, 0)));
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/value-help/people", async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json({ rows: await searchIssuePeople(stringQuery(req.query.q) || "") });
  } catch (error) {
    next(error);
  }
});

crRoutes.post("/value-help/people/validate", async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json(await validateIssuePeople(req.body?.people || []));
  } catch (error) {
    next(error);
  }
});

crRoutes.post("/value-help/people", async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json({ rows: await registerIssuePeople(req.body?.people || []) });
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/value-help/glpi", async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json({ rows: await searchIssueGlpi(stringQuery(req.query.q) || "") });
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/value-help/cr-helpdesk", async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json({ rows: await searchIssueCrHelpdesk(stringQuery(req.query.q) || "") });
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/value-help/cr", async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json({ rows: await searchIssueCrLinks(stringQuery(req.query.q) || "") });
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/issues/:id", async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json(await getIssueDetail(numberQuery(req.params.id, 0)));
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/issues/:id/templates/:kind", async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    const kind = stringQuery(req.params.kind);
    if (kind !== "email" && kind !== "ticket") {
      res.status(400).json({ ok: false, message: "Template kind must be email or ticket." });
      return;
    }
    res.json(await buildIssueTemplatePreview(numberQuery(req.params.id, 0), kind as IssueTemplateKind));
  } catch (error) {
    next(error);
  }
});

crRoutes.post("/issues", async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json(await saveIssue(req.body || {}));
  } catch (error) {
    next(error);
  }
});

crRoutes.put("/issues/:id", async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json(await saveIssue({ ...(req.body || {}), id: numberQuery(req.params.id, 0) }));
  } catch (error) {
    next(error);
  }
});

crRoutes.post("/issues/:id/cancel", async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json(await cancelIssue(numberQuery(req.params.id, 0), stringQuery(req.body?.reason) || ""));
  } catch (error) {
    next(error);
  }
});

crRoutes.delete("/issues/:id", async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json(await deleteIssue(numberQuery(req.params.id, 0)));
  } catch (error) {
    next(error);
  }
});

crRoutes.post("/sync/cr", async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    const result = await runCrSync({
      systemCodes: normalizeSystemCodes(req.body?.systemCodes || req.body?.systemCode),
      rowCount: Number(req.body?.rowCount || 5000),
      syncMode: normalizeSyncMode(req.body?.syncMode),
      lookbackDays: normalizeLookbackDays(req.body?.lookbackDays),
      fromDate: req.body?.fromDate,
      toDate: req.body?.toDate,
      owner: req.body?.owner
    });
    res.json(result.ok ? result : { ...result, message: "Sync CR failed for all selected systems." });
  } catch (error) {
    next(error);
  }
});

function stringQuery(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberQuery(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
