import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crRoutes } from "./routes/crRoutes.js";
import { config } from "./config.js";
import { startCrAutoSyncScheduler } from "./sync/crAutoSyncScheduler.js";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const clientDist = path.join(projectRoot, "dist", "client");

app.use(express.json({ limit: "1mb" }));
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", config.clientOrigin);
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  next();
});
app.options("*", (_req, res) => res.sendStatus(204));

app.use("/api", crRoutes);
app.use(express.static(clientDist));

app.get("*", (_req, res, next) => {
  if (_req.path.startsWith("/api")) return next();
  res.sendFile(path.join(clientDist, "index.html"));
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  res.status(500).json({ ok: false, message });
});

app.listen(config.port, config.host, () => {
  console.log(`CR Management System listening on http://${config.host}:${config.port}`);
  startCrAutoSyncScheduler();
});
