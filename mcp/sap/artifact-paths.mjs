import fs from "node:fs";
import path from "node:path";

export function createArtifactPaths({ projectRoot = process.cwd(), env = process.env } = {}) {
  const root = path.resolve(projectRoot);
  const dataRoot = resolveInside(root, env.SAP_DISCOVERY_DATA_ROOT || "data");
  const outputsRoot = resolveInside(root, env.SAP_DISCOVERY_OUTPUTS_ROOT || "outputs");
  const legacyExportsRoot = resolveInside(root, "exports");
  const legacyAgentRunsRoot = path.join(dataRoot, "agent-runs");

  const paths = {
    projectRoot: root,
    dataRoot,
    outputsRoot,
    logsRoot: resolveInside(root, env.SAP_DISCOVERY_LOGS_ROOT || path.join("outputs", "logs")),
    exportsRoot: resolveInside(root, env.SAP_DISCOVERY_EXPORTS_ROOT || path.join("outputs", "exports")),
    agentRunsRoot: resolveInside(root, env.SAP_DISCOVERY_AGENT_RUNS_ROOT || path.join("outputs", "agent-runs")),
    goldenRunsRoot: resolveInside(root, env.SAP_DISCOVERY_GOLDEN_RUNS_ROOT || path.join("outputs", "golden-tests", "runs")),
    goldenLatestPath: resolveInside(root, env.SAP_DISCOVERY_GOLDEN_LATEST_PATH || path.join("outputs", "golden-tests", "latest.json")),
    legacyExportsRoot,
    legacyAgentRunsRoot
  };

  return {
    ...paths,
    dataPath: (...segments) => path.join(dataRoot, ...segments),
    outputPath: (...segments) => path.join(outputsRoot, ...segments),
    logPath: (...segments) => path.join(paths.logsRoot, ...segments),
    auditLogPath: () => path.join(paths.logsRoot, "sap-audit.jsonl"),
    exportPath: (...segments) => path.join(paths.exportsRoot, ...segments),
    legacyExportPath: (...segments) => path.join(legacyExportsRoot, ...segments),
    firstExistingExportPath: (...segments) => firstExisting([
      path.join(paths.exportsRoot, ...segments),
      path.join(legacyExportsRoot, ...segments)
    ]),
    agentRunPath: (...segments) => path.join(paths.agentRunsRoot, ...segments),
    legacyAgentRunPath: (...segments) => path.join(legacyAgentRunsRoot, ...segments),
    firstExistingAgentRunPath: (...segments) => firstExisting([
      path.join(paths.agentRunsRoot, ...segments),
      path.join(legacyAgentRunsRoot, ...segments)
    ]),
    ensureDir: (dirPath) => fs.mkdirSync(dirPath, { recursive: true })
  };
}

export const artifactPaths = createArtifactPaths();

export function firstExisting(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || candidates[0];
}

function resolveInside(root, value) {
  const resolved = path.resolve(root, value);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Artifact path escapes project root: ${value}`);
  }
  return resolved;
}
