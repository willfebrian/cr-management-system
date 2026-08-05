import { Router } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchOutlookEmails } from "../services/outlookService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

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

outlookRoutes.get("/download-agent", (_req, res) => {
  const batPath = path.join(projectRoot, "scripts", "Install_Outlook_Agent.bat");
  res.download(batPath, "Install_Outlook_Agent.bat");
});
