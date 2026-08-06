import { Router } from "express";
import { listActivityLogs } from "../db/auditRepository.js";
import { assertDatabaseConfigured } from "../db/pool.js";

export const auditRoutes = Router();

function stringQuery(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value) && typeof value[0] === "string") return value[0].trim();
  return "";
}

function numberQuery(value: unknown, defaultValue: number): number {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : defaultValue;
}

auditRoutes.get("/audit-logs", async (req, res, next) => {
  try {
    await assertDatabaseConfigured();
    const result = await listActivityLogs({
      activityType: stringQuery(req.query.activityType),
      q: stringQuery(req.query.q),
      username: stringQuery(req.query.username),
      fromDate: stringQuery(req.query.fromDate),
      toDate: stringQuery(req.query.toDate),
      page: numberQuery(req.query.page, 1),
      pageSize: numberQuery(req.query.pageSize, 25)
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});
