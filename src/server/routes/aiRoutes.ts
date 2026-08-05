import { Router } from "express";
import { generateAnalysisFromEmail } from "../services/aiService.js";

export const aiRoutes = Router();

aiRoutes.post("/generate-analysis", async (req, res, next) => {
  try {
    const { emailContext, emailSubject } = req.body;
    const result = await generateAnalysisFromEmail(emailContext, emailSubject);
    res.json(result);
  } catch (error) {
    next(error);
  }
});
