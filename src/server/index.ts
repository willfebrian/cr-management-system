import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crRoutes } from "./routes/crRoutes.js";
import { config } from "./config.js";
import { startCrAutoSyncScheduler } from "./sync/crAutoSyncScheduler.js";
import { authRoutes } from "./routes/authRoutes.js";
import { requireAuth } from "./auth/middleware.js";
import { userRoutes } from "./routes/userRoutes.js";
import { projectRoutes } from "./routes/projectRoutes.js";
import { adminRoutes } from "./routes/adminRoutes.js";
import { outlookRoutes } from "./routes/outlookRoutes.js";
import { aiRoutes } from "./routes/aiRoutes.js";
import { auditRoutes } from "./routes/auditRoutes.js";
import { ProjectRepositoryError } from "./db/projectRepository.js";
import { transportRequestRoutes } from "./routes/transportRequestRoutes.js";
import { transportReleaseRoutes } from "./routes/transportReleaseRoutes.js";
import { checkDatabaseHealth, pool } from "./db/pool.js";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const clientDist = path.join(projectRoot, "dist", "client");

app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  res.header("Access-Control-Allow-Origin", origin || config.clientOrigin);
  res.header("Access-Control-Allow-Headers", "Content-Type, Cookie");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  next();
});
app.options("*", (_req, res) => res.sendStatus(204));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/health/database", async (_req, res) => {
  const result = await checkDatabaseHealth();
  res.status(result.ok ? 200 : 503).json(result);
});
app.use("/api/auth", authRoutes);
app.use("/api/users", requireAuth, userRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/admin", requireAuth, adminRoutes);
app.use("/api/outlook", requireAuth, outlookRoutes);
app.use("/api/ai", requireAuth, aiRoutes);
app.use("/api", requireAuth, auditRoutes);
app.use("/api/cr-transports/release", requireAuth, transportReleaseRoutes);
app.use("/api/cr-transports", requireAuth, transportRequestRoutes);
app.use("/api", requireAuth, crRoutes);
app.use(express.static(clientDist));

app.get("*", (_req, res, next) => {
  if (_req.path.startsWith("/api")) return next();
  res.sendFile(path.join(clientDist, "index.html"));
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof ProjectRepositoryError) {
    return res.status(error.status).json({ ok: false, message, code: error.code });
  }
  res.status(500).json({ ok: false, message });
});

const server = app.listen(config.port, config.host, () => {
  console.log(`CR Management System listening on http://${config.host}:${config.port}`);
  startCrAutoSyncScheduler();
});

let shuttingDown = false;
function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down CR Management System gracefully...`);
  server.close(() => {
    pool.end().catch(() => {}).finally(() => {
      process.exit(0);
    });
  });
  setTimeout(() => {
    process.exit(0);
  }, 5000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
