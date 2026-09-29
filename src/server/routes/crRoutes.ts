import { Router } from "express";
import { requirePermission } from "../auth/middleware.js";
import type { PermissionKey } from "../../shared/permissions.js";
import { pool, assertDatabaseConfigured } from "../db/pool.js";
import {
  getCrDetailForSystem,
  getDashboard,
  getDashboardStatusTrend,
  listCrRequests,
} from "../db/crRepository.js";
import { cancelIssue, deleteIssue, getIssueDashboardInsights, getIssueDetail, getIssueStatusOptions, getLeaderDashboardInsights, getNextIssueNumber, getNextSubIssueNumber, listIssues, registerIssuePeople, saveIssue, searchIssueCrHelpdesk, searchIssueCrLinks, searchIssuePeople, validateIssuePeople } from "../db/issueRepository.js";
import { getGlpiTicketDetailFromMaria, searchGlpiTicketsFromMaria } from "../db/glpiMariaRepository.js";
import { getSapCrSystem, listSapCrSystems } from "../config.js";
import { normalizeLookbackDays, normalizeSyncMode, normalizeSystemCodes, runCrSync } from "../sync/crSyncRunner.js";
import { buildCrTransportBatchArchive, buildCrTransportDocument, buildUserCrDocument } from "../templates/crTransportTemplateService.js";
import { buildIssueTemplatePreview, type IssueTemplateKind } from "../templates/issueTemplateService.js";
import { resolveGlpiPrefillActors } from "../services/glpiPrefillActorService.js";
import { exportCrReport, exportIssueReport } from "../services/reportExportService.js";
import { draftIssueReminderWithAi, previewIssueReminder, sendIssueReminder } from "../services/issueReminderService.js";

export const crRoutes = Router();

crRoutes.get("/cr/export", requirePermission("transport.export"), async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    const data = await exportCrReport({
      status: stringQuery(req.query.status), lifecycleStatus: stringQuery(req.query.lifecycleStatus),
      agingDays: numberQuery(req.query.agingDays, 0), sapSystemCode: stringQuery(req.query.sapSystemCode),
      owner: stringQuery(req.query.owner), q: stringQuery(req.query.q),
      fromDate: stringQuery(req.query.fromDate), toDate: stringQuery(req.query.toDate)
    });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="cr-transport-report.xlsx"');
    res.send(data);
  } catch (error) { next(error); }
});

crRoutes.get("/issues/export", requirePermission("issue.export"), async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    const data = await exportIssueReport({
      status: stringQuery(req.query.status), lifecycleStatus: stringQuery(req.query.lifecycleStatus),
      completionStatus: stringQuery(req.query.completionStatus), q: stringQuery(req.query.q),
      requester: stringQuery(req.query.requester), abaper: stringQuery(req.query.abaper),
      crHelpdesk: stringQuery(req.query.crHelpdesk), cr: stringQuery(req.query.cr), glpi: stringQuery(req.query.glpi),
      fromDate: stringQuery(req.query.fromDate), toDate: stringQuery(req.query.toDate)
    });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="issue-report.xlsx"');
    res.send(data);
  } catch (error) { next(error); }
});

crRoutes.get("/health", (_req, res) => {
  res.json({ ok: true, app: "CR Management System" });
});

crRoutes.get("/systems", requirePermission("transport.view"), (_req, res) => {
  res.json({ rows: listSapCrSystems() });
});

crRoutes.get("/dashboard", requirePermission("dashboard.view"), async (_req, res, next) => {
  try {
    await assertDatabaseConfigured();
    const [dashboard, issueInsights, leaderInsights] = await Promise.all([
      getDashboard(),
      getIssueDashboardInsights(),
      getLeaderDashboardInsights()
    ]);
    res.json({ ...dashboard, issueInsights, leaderInsights });
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/dashboard/status-trend", requirePermission("dashboard.view"), async (req, res, next) => {
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

crRoutes.get("/cr", requirePermission("transport.view"), async (_req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json({
      ...(await listCrRequests({
        status: stringQuery(_req.query.status),
        lifecycleStatus: stringQuery(_req.query.lifecycleStatus),
        agingDays: numberQuery(_req.query.agingDays, 0) || undefined,
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

crRoutes.get("/cr/:trkorr", requirePermission("transport.view"), async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    const system = getSapCrSystem(stringQuery(req.query.sapSystemCode));
    res.json(await getCrDetailForSystem(String(req.params.trkorr).toUpperCase(), system.code));
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/issues", requirePermission("issue.view"), async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json(await listIssues({
      status: stringQuery(req.query.status),
      lifecycleStatus: stringQuery(req.query.lifecycleStatus),
      completionStatus: stringQuery(req.query.completionStatus),
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

crRoutes.get("/issues/status-options", requirePermission("issue.view"), async (_req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json({ rows: await getIssueStatusOptions() });
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/issues/next-number", requirePermission("issue.create"), async (_req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json(await getNextIssueNumber());
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/issues/next-sub-issue", requirePermission("issue.create"), async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json(await getNextSubIssueNumber(numberQuery(req.query.issueNo, 0)));
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/value-help/people", requirePermission("issue.view"), async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json({ rows: await searchIssuePeople(stringQuery(req.query.q) || "", stringQuery(req.query.role)) });
  } catch (error) {
    next(error);
  }
});


crRoutes.post("/value-help/people/validate", requirePermission("issue.view"), async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json(await validateIssuePeople(req.body?.people || []));
  } catch (error) {
    next(error);
  }
});

crRoutes.post("/value-help/people", requirePermission("master_data.people"), async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json({ rows: await registerIssuePeople(req.body?.people || []) });
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/value-help/glpi", requirePermission("issue.view"), async (req, res, next) => {
  try {
    const q = stringQuery(req.query.q) || "";
    res.json({ rows: await searchGlpiTicketsFromMaria(q) });
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/value-help/glpi/:id", requirePermission("issue.view"), async (req, res, next) => {
  try {
    const id = numberQuery(req.params.id, 0);
    const detail = await getGlpiTicketDetailFromMaria(id);
    if (!detail) {
      res.status(404).json({ ok: false, message: `GLPI Ticket #${id} not found.` });
      return;
    }
    res.json({ ok: true, ticket: detail });
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/value-help/cr-helpdesk", requirePermission("issue.view"), async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json({ rows: await searchIssueCrHelpdesk(stringQuery(req.query.q) || "") });
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/value-help/cr", requirePermission("issue.view"), async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json({ rows: await searchIssueCrLinks(stringQuery(req.query.q) || "") });
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/issues/:id", requirePermission("issue.view"), async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json(await getIssueDetail(numberQuery(req.params.id, 0)));
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/issues/:id/reminder-preview", requirePermission("issue.reminder"), async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    const actions = typeof req.query.actions === "string" ? req.query.actions.split(",") : undefined;
    res.json(await previewIssueReminder(numberQuery(req.params.id, 0), req.authUser!, {
      to: stringQuery(req.query.to), cc: stringQuery(req.query.cc), bcc: stringQuery(req.query.bcc),
      notes: stringQuery(req.query.notes), actions: actions as any, otherAction: stringQuery(req.query.otherAction)
    }));
  } catch (error) { next(error); }
});
crRoutes.post("/issues/:id/reminder", requirePermission("issue.reminder"), async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json(await sendIssueReminder(numberQuery(req.params.id, 0), {
      to: req.body?.to, cc: req.body?.cc, bcc: req.body?.bcc, notes: req.body?.notes,
      actions: Array.isArray(req.body?.actions) ? req.body.actions : undefined, otherAction: req.body?.otherAction
    }, req.authUser!));
  } catch (error) { next(error); }
});
crRoutes.post("/issues/:id/reminder-ai-draft", requirePermission("issue.reminder"), async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    res.json(await draftIssueReminderWithAi(numberQuery(req.params.id, 0), {
      to: req.body?.to, cc: req.body?.cc, bcc: req.body?.bcc, notes: req.body?.notes,
      actions: Array.isArray(req.body?.actions) ? req.body.actions : undefined, otherAction: req.body?.otherAction
    }, req.authUser!));
  } catch (error) { next(error); }
});

crRoutes.get("/issues/:id/glpi-prefill-actors", requirePermission("issue.create_glpi_ticket"), async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    const issueId = numberQuery(req.params.id, 0);
    res.json(await resolveGlpiPrefillActors(issueId));
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/issues/:id/templates/cr-transport", requirePermission("issue.generate_cr_transport_form"), async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    const document = await buildCrTransportDocument(numberQuery(req.params.id, 0));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${document.filename.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(document.filename)}`
    );
    res.send(document.buffer);
  } catch (error) {
    next(error);
  }
});

crRoutes.post("/issues/templates/cr-transport/batch", requirePermission("issue.generate_cr_transport_form"), async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    const issueIds = normalizeBatchIssueIds(req.body?.issueIds);
    if (issueIds.length === 0) {
      res.status(400).json({ ok: false, message: "Select at least one Issue." });
      return;
    }

    const archive = await buildCrTransportBatchArchive(issueIds);
    const user = await resolveAuthUser(req);
    await recordActivityLog({
      activityType: "issue",
      action: "download_cr_transport_forms_batch",
      username: user?.username || "system",
      userId: user?.id || null,
      description: `Downloaded CR Transport Forms for ${archive.successfulIssueIds.length} Issue(s)`,
      metadata: {
        requestedIssueIds: issueIds,
        successfulIssueIds: archive.successfulIssueIds,
        failures: archive.failures
      },
      ipAddress: req.ip
    });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${archive.filename}"; filename*=UTF-8''${encodeURIComponent(archive.filename)}`
    );
    res.send(archive.buffer);
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/issues/:id/templates/cr-user", requirePermission("issue.generate_cr_user_form"), async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    const document = await buildUserCrDocument(numberQuery(req.params.id, 0));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${document.filename.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(document.filename)}`
    );
    res.send(document.buffer);
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/issues/:id/templates/:kind", (req, res, next) => { const kind = req.params.kind; const key: PermissionKey = kind === "email" ? "issue.generate_email" : kind === "ticket" ? "issue.generate_glpi_template" : "issue.reminder"; return requirePermission(key)(req, res, next); }, async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    const kind = stringQuery(req.params.kind);
    if (kind !== "email" && kind !== "ticket" && kind !== "reminder") {
      res.status(400).json({ ok: false, message: "Template kind must be email, ticket, or reminder." });
      return;
    }
    const authUser = await resolveAuthUser(req);
    let actorName = authUser?.username || "User";
    let actorNickname = authUser?.username || "User";
    let actorDept = "IT";

    if (authUser?.id || authUser?.username) {
      try {
        const personRes = await pool.query(
          `SELECT p.full_name, p.nickname, p.department 
           FROM app_users u 
           JOIN issue_people p ON p.id = u.person_id 
           WHERE u.id = $1
           UNION ALL
           SELECT full_name, nickname, department 
           FROM issue_people 
           WHERE lower(email) = lower($2) OR lower(nickname) = lower($2) OR lower(full_name) LIKE lower($3)
           LIMIT 1`,
          [authUser?.id || 0, authUser?.username || "", `%${authUser?.username || ""}%`]
        );
        if (personRes.rows.length > 0) {
          actorName = personRes.rows[0].full_name || personRes.rows[0].nickname || actorName;
          actorNickname = personRes.rows[0].nickname || personRes.rows[0].full_name || actorNickname;
          actorDept = personRes.rows[0].department || actorDept;
        }
      } catch (err) {
        console.warn("[crRoutes] Could not fetch actor full name:", err);
      }
    }

    res.json(await buildIssueTemplatePreview(
      numberQuery(req.params.id, 0),
      kind as IssueTemplateKind,
      { name: actorName, nickname: actorNickname, department: actorDept, username: authUser?.username }
    ));
  } catch (error) {
    next(error);
  }
});

import { recordActivityLog } from "../db/auditRepository.js";
import { resolveAuthUser } from "../auth/middleware.js";

export function normalizeBatchIssueIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const ids = value
    .map((item) => typeof item === "number" ? item : typeof item === "string" ? Number(item) : Number.NaN)
    .filter((item) => Number.isInteger(item) && item > 0);
  return [...new Set(ids)];
}

crRoutes.post("/issues", requirePermission("issue.create"), async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    const isNew = !req.body?.id;
    const result = await saveIssue(req.body || {}, req.authUser!);
    const issueKey = result.issue ? `${result.issue.issue_no}-${result.issue.sub_issue_no}` : (req.body?.issueName || "");
    const user = await resolveAuthUser(req);
    const username = user?.username || "system";
    await recordActivityLog({
      activityType: "issue",
      action: isNew ? "create_issue" : "update_issue",
      username,
      userId: user?.id || null,
      description: isNew ? `Created issue ${issueKey} ("${req.body?.issueName || ''}")` : `Updated issue ${issueKey}`,
      ipAddress: req.ip
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

crRoutes.put("/issues/:id", requirePermission("issue.edit"), async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    const id = numberQuery(req.params.id, 0);
    const result = await saveIssue({ ...(req.body || {}), id }, req.authUser!);
    const issueKey = result.issue ? `${result.issue.issue_no}-${result.issue.sub_issue_no}` : `ID ${id}`;
    const user = await resolveAuthUser(req);
    const username = user?.username || "system";
    await recordActivityLog({
      activityType: "issue",
      action: "update_issue",
      username,
      userId: user?.id || null,
      description: `Updated issue ${issueKey}`,
      ipAddress: req.ip
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

crRoutes.post("/issues/:id/cancel", requirePermission("issue.cancel_delete"), async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    const id = numberQuery(req.params.id, 0);
    const reason = stringQuery(req.body?.reason) || "";
    const result = await cancelIssue(id, reason);
    const user = await resolveAuthUser(req);
    const username = user?.username || "system";
    await recordActivityLog({
      activityType: "issue",
      action: "cancel_issue",
      username,
      userId: user?.id || null,
      description: `Cancelled issue ID ${id}${reason ? ` (Reason: ${reason})` : ""}`,
      ipAddress: req.ip
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

crRoutes.delete("/issues/:id", requirePermission("issue.cancel_delete"), async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    const id = numberQuery(req.params.id, 0);
    const result = await deleteIssue(id);
    const user = await resolveAuthUser(req);
    const username = user?.username || "system";
    await recordActivityLog({
      activityType: "issue",
      action: "delete_issue",
      username,
      userId: user?.id || null,
      description: `Deleted issue ID ${id}`,
      ipAddress: req.ip
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

crRoutes.post("/sync/cr", requirePermission("transport.sync"), async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    const systemCodes = normalizeSystemCodes(req.body?.systemCodes || req.body?.systemCode);
    const result = await runCrSync({
      systemCodes,
      rowCount: Number(req.body?.rowCount || 5000),
      syncMode: normalizeSyncMode(req.body?.syncMode),
      lookbackDays: normalizeLookbackDays(req.body?.lookbackDays),
      fromDate: req.body?.fromDate,
      toDate: req.body?.toDate
    });
    const user = await resolveAuthUser(req);
    const username = user?.username || "system";
    await recordActivityLog({
      activityType: "sync",
      action: "sync_cr",
      username,
      userId: user?.id || null,
      description: `Executed SAP CR sync for systems [${systemCodes.join(", ")}] (Result: ${result.ok ? "Success" : "Failed"}, Requests: ${result.requestCount || 0})`,
      metadata: { ok: result.ok, requestCount: result.requestCount, systems: systemCodes },
      ipAddress: req.ip
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
