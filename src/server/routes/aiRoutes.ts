import { Router } from "express";
import { generateAnalysisFromEmail } from "../services/aiService.js";

export const aiRoutes = Router();

aiRoutes.post("/generate-analysis", async (req, res, next) => {
  try {
    const { emailContext, emailSubject, issueName } = req.body;
    const result = await generateAnalysisFromEmail(emailContext, emailSubject, issueName);
    res.json(result);
  } catch (error) {
    next(error);
  }
});
