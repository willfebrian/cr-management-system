import { Router } from "express";
import { requireAdmin } from "../auth/middleware.js";
import { pool } from "../db/pool.js";
import { mergeMaskedMcpEmailConfig } from "../services/mcpEmailConfig.js";
import { searchOutlookEmails, testConfiguredMcpEmail } from "../services/outlookService.js";

export const outlookRoutes = Router();

outlookRoutes.get("/search-email", async (req, res, next) => {
  try {
    const q = String(req.query.q || "");
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const maxChars = req.query.maxChars ? parseInt(String(req.query.maxChars), 10) : undefined;
    const results = await searchOutlookEmails(q, limit, maxChars);
    res.json({ rows: results });
  } catch (error) {
    next(error);
  }
});

outlookRoutes.post("/test-mcp-connection", requireAdmin, async (req, res, next) => {
  try {
    const configJson = String(req.body?.configJson || "");
    const stored = await pool.query<{ setting_value: string }>(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'outlook_mcp_config' LIMIT 1`
    );
    const resolvedConfig = mergeMaskedMcpEmailConfig(configJson, stored.rows[0]?.setting_value);
    res.json(await testConfiguredMcpEmail(resolvedConfig));
  } catch (error) {
    next(error);
  }
});
