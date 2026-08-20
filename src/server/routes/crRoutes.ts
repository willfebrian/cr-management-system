import { Router } from "express";
import { pool, assertDatabaseConfigured } from "../db/pool.js";
import {
  getCrDetailForSystem,
  getDashboard,
  getDashboardStatusTrend,
  listCrRequests,
} from "../db/crRepository.js";
import { cancelIssue, deleteIssue, getIssueDashboardInsights, getIssueDetail, getIssueStatusOptions, getLeaderDashboardInsights, getNextIssueNumber, getNextSubIssueNumber, listIssues, registerIssuePeople, saveIssue, searchIssueCrHelpdesk, searchIssueCrLinks, searchIssuePeople, validateIssuePeople } from "../db/issueRepository.js";
import { findGlpiUserIdsByEmails, getGlpiTicketDetailFromMaria, searchGlpiTicketsFromMaria } from "../db/glpiMariaRepository.js";
import { getSapCrSystem, listSapCrSystems } from "../config.js";
import { normalizeLookbackDays, normalizeSyncMode, normalizeSystemCodes, runCrSync } from "../sync/crSyncRunner.js";
import { buildCrTransportDocument, buildUserCrDocument } from "../templates/crTransportTemplateService.js";
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
    res.json({ rows: await searchIssuePeople(stringQuery(req.query.q) || "", stringQuery(req.query.role)) });
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
    const q = stringQuery(req.query.q) || "";
    res.json({ rows: await searchGlpiTicketsFromMaria(q) });
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/value-help/glpi/:id", async (req, res, next) => {
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

crRoutes.get("/issues/:id/glpi-prefill-actors", async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    const issueId = numberQuery(req.params.id, 0);
    const { rows } = await pool.query(
      `SELECT people.email
       FROM issue_participants participant
       JOIN issue_people people ON people.id = participant.person_id
       WHERE participant.issue_id = $1
         AND participant.role = 'abaper'
         AND NULLIF(TRIM(COALESCE(people.email, '')), '') IS NOT NULL`,
      [issueId]
    );
    res.json({
      abaperGlpiUserIds: await findGlpiUserIdsByEmails(
        rows.map((row) => String(row.email || ""))
      )
    });
  } catch (error) {
    next(error);
  }
});

crRoutes.get("/issues/:id/templates/cr-transport", async (req, res, next) => {
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

crRoutes.get("/issues/:id/templates/cr-user", async (req, res, next) => {
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

crRoutes.get("/issues/:id/templates/:kind", async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    const kind = stringQuery(req.params.kind);
    if (kind !== "email" && kind !== "ticket") {
      res.status(400).json({ ok: false, message: "Template kind must be email or ticket." });
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

crRoutes.post("/issues", async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    const isNew = !req.body?.id;
    const result = await saveIssue(req.body || {});
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

crRoutes.put("/issues/:id", async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    const id = numberQuery(req.params.id, 0);
    const result = await saveIssue({ ...(req.body || {}), id });
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

crRoutes.post("/issues/:id/cancel", async (req, res, next) => {
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

crRoutes.delete("/issues/:id", async (req, res, next) => {
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

crRoutes.post("/sync/cr", async (req, res, next) => {
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
