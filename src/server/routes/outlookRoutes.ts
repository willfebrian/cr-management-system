import { Router } from "express";
import { searchOutlookEmails } from "../services/outlookService.js";

export const outlookRoutes = Router();

outlookRoutes.get("/search-email", async (req, res, next) => {
  try {
    const q = String(req.query.q || "");
    const results = await searchOutlookEmails(q);
    res.json({ rows: results });
  } catch (error) {
    next(error);
  }
});
