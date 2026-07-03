import fs from "node:fs";
import path from "node:path";
import { artifactPaths } from "./artifact-paths.mjs";

export class AuditLogger {
  constructor({ enabled = true, logPath = "logs/sap-audit.jsonl" } = {}) {
    this.enabled = enabled;
    this.logPath = normalizeAuditLogPath(logPath);
  }

  write(event) {
    if (!this.enabled) return;

    const entry = {
      timestamp: new Date().toISOString(),
      ...event
    };

    fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
    fs.appendFileSync(this.logPath, `${JSON.stringify(entry)}\n`, "utf8");
  }
}

function normalizeAuditLogPath(logPath) {
  if (!logPath || logPath === "logs/sap-audit.jsonl" || logPath.endsWith(`${path.sep}logs${path.sep}sap-audit.jsonl`)) {
    return artifactPaths.auditLogPath();
  }
  return logPath;
}
