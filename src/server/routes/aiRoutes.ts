import { Router } from "express";
import { requirePermission } from "../auth/middleware.js";
import { generateAnalysisFromEmail, testAiProviderConnection } from "../services/aiService.js";

export const aiRoutes = Router();

aiRoutes.post("/generate-analysis", requirePermission("issue.edit"), async (req, res, next) => {
  try {
    const { emailContext, emailSubject, issueName } = req.body;
    const result = await generateAnalysisFromEmail(emailContext, emailSubject, issueName);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

aiRoutes.post("/test-connection", requirePermission("settings.ai"), async (req, res, next) => {
  try {
    const { provider, baseUrl, model, apiKey } = req.body;
    const result = await testAiProviderConnection({ provider, baseUrl, model, apiKey });
    res.json(result);
  } catch (error) {
    next(error);
  }
});
