import fs from "node:fs";
import path from "node:path";
import { createArtifactPaths } from "./artifact-paths.mjs";

const DEFAULT_DATA_DIR = path.resolve(process.cwd(), "data");
const SAFE_OBJECT_KEY = /^[A-Z0-9_-]+$/;

export class PassiveKbAccessError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = "PassiveKbAccessError";
    this.code = code;
    this.details = details;
  }
}

export function createPassiveKbRetriever({ dataDir = DEFAULT_DATA_DIR } = {}) {
  const kbRoot = path.resolve(dataDir);
  const artifactPaths = createArtifactPaths({ projectRoot: path.resolve(kbRoot, "..") });

  return {
    getRepositoryManifest: () => readJsonIfExists(safePath(kbRoot, "manifest.json")),
    resolveObject: (objectKey) => resolveObject(kbRoot, objectKey),
    getAbapAnalysis: (objectKey, options = {}) => getAbapAnalysis(kbRoot, objectKey, options),
    getAbapSource: (programName, options = {}) => getAbapSource(kbRoot, programName, options),
    getDdicTable: (tableName, options = {}) => getDdicTable(kbRoot, tableName, options),
    getAgentRun: (objectKey, options = {}) => getAgentRun(kbRoot, artifactPaths, objectKey, options)
  };
}

function resolveObject(kbRoot, objectKey) {
  const key = normalizeObjectKey(objectKey);
  const candidates = [
    {
      type: "abap_tcode_analysis_summary",
      path: safePath(kbRoot, "abap-analysis", "deep", `${key}.summary.json`)
    },
    {
      type: "abap_program_analysis_summary",
      path: safePath(kbRoot, "abap-analysis", "deep-programs", `${key}.summary.json`)
    },
    {
      type: "abap_source_cache",
      path: safePath(kbRoot, "abap-source-local", `${key}.abap`)
    },
    {
      type: "ddic_table",
      path: safePath(kbRoot, "ddic-index", "tables", `${key}.json`)
    },
    {
      type: "agent_runs",
      path: safePath(kbRoot, "agent-runs", key)
    }
  ];

  const matches = candidates
    .filter((candidate) => fs.existsSync(candidate.path))
    .map((candidate) => ({
      type: candidate.type,
      path: toRepoPath(candidate.path),
      preferredAccess: preferredAccessFor(candidate.type)
    }));

  return {
    objectKey: key,
    found: matches.length > 0,
    matches,
    accessPolicy: "object-key-only"
  };
}

function getAbapAnalysis(kbRoot, objectKey, { detailLevel = "summary", kind = "auto" } = {}) {
  const key = normalizeObjectKey(objectKey);
  const levels = new Set(["summary", "full"]);
  if (!levels.has(detailLevel)) throwInvalidDetailLevel(detailLevel, [...levels]);

  const roots = kind === "program"
    ? ["deep-programs"]
    : kind === "tcode"
      ? ["deep"]
      : ["deep", "deep-programs"];
  const suffix = detailLevel === "summary" ? ".summary.json" : ".json";

  for (const rootName of roots) {
    const artifactPath = safePath(kbRoot, "abap-analysis", rootName, `${key}${suffix}`);
    const artifact = readJsonIfExists(artifactPath);
    if (artifact) {
      return {
        objectKey: key,
        kind: rootName === "deep" ? "tcode" : "program",
        detailLevel,
        source: toRepoPath(artifactPath),
        artifact
      };
    }
  }

  return notFound("abap_analysis", key, roots.map((rootName) => `data/abap-analysis/${rootName}/${key}${suffix}`));
}

function getAbapSource(kbRoot, programName, { mode = "metadata", maxLines = 120 } = {}) {
  const key = normalizeObjectKey(programName);
  const modes = new Set(["metadata", "snippet", "full"]);
  if (!modes.has(mode)) throwInvalidDetailLevel(mode, [...modes]);

  const sourcePath = safePath(kbRoot, "abap-source-local", `${key}.abap`);
  if (!fs.existsSync(sourcePath)) return notFound("abap_source", key, [`data/abap-source-local/${key}.abap`]);

  const stats = fs.statSync(sourcePath);
  const result = {
    objectKey: key,
    mode,
    source: toRepoPath(sourcePath),
    metadata: {
      bytes: stats.size,
      modifiedAt: stats.mtime.toISOString()
    }
  };

  if (mode === "snippet") {
    result.lines = readTextLines(sourcePath, maxLines);
    result.truncated = true;
  }

  if (mode === "full") {
    result.text = fs.readFileSync(sourcePath, "utf8");
    result.truncated = false;
  }

  return result;
}

function getDdicTable(kbRoot, tableName, { detailLevel = "summary" } = {}) {
  const key = normalizeObjectKey(tableName);
  const levels = new Set(["summary", "full"]);
  if (!levels.has(detailLevel)) throwInvalidDetailLevel(detailLevel, [...levels]);

  if (detailLevel === "summary") {
    const summaryPath = safePath(kbRoot, "ddic-index", "summary.json");
    const summary = readJsonIfExists(summaryPath);
    const table = summary?.tables?.find((entry) => entry.tableName === key);
    if (table) {
      return {
        objectKey: key,
        detailLevel,
        source: toRepoPath(summaryPath),
        table
      };
    }
  }

  const tablePath = safePath(kbRoot, "ddic-index", "tables", `${key}.json`);
  const artifact = readJsonIfExists(tablePath);
  if (artifact) {
    return {
      objectKey: key,
      detailLevel: "full",
      source: toRepoPath(tablePath),
      artifact
    };
  }

  return notFound("ddic_table", key, [`data/ddic-index/summary.json`, `data/ddic-index/tables/${key}.json`]);
}

function getAgentRun(kbRoot, artifactPaths, objectKey, { runSelector = "latest", detailLevel = "manifest" } = {}) {
  const key = normalizeObjectKey(objectKey);
  const levels = new Set(["manifest", "outputs", "events"]);
  if (!levels.has(detailLevel)) throwInvalidDetailLevel(detailLevel, [...levels]);

  const objectRunRoot = artifactPaths.firstExistingAgentRunPath(key);
  if (!fs.existsSync(objectRunRoot)) return notFound("agent_runs", key, [`outputs/agent-runs/${key}`, `data/agent-runs/${key}`]);

  const runId = runSelector === "latest" ? latestRunId(objectRunRoot) : normalizeObjectKey(runSelector);
  if (!runId) return notFound("agent_run", key, [`outputs/agent-runs/${key}/<run>`, `data/agent-runs/${key}/<run>`]);

  const runRoot = safePath(objectRunRoot, runId);
  if (!fs.existsSync(runRoot)) return notFound("agent_run", `${key}/${runId}`, [`outputs/agent-runs/${key}/${runId}`, `data/agent-runs/${key}/${runId}`]);

  const files = listFilesOneLevel(runRoot);
  const result = {
    objectKey: key,
    runId,
    detailLevel,
    source: toRepoPath(runRoot),
    files
  };

  const manifestPath = firstExisting([
    safePath(runRoot, "run-manifest.json"),
    safePath(runRoot, "spawned-run-manifest.json")
  ]);
  if (manifestPath) result.manifest = readJsonIfExists(manifestPath);

  if (detailLevel === "outputs") {
    result.outputs = readRunOutputs(runRoot);
  }

  if (detailLevel === "events") {
    result.eventFiles = listEventFiles(runRoot);
    result.note = "Event JSONL files are listed only; read a specific file explicitly for audit/debug.";
  }

  return result;
}

function readRunOutputs(runRoot) {
  const outputs = {};
  for (const fileName of listFilesOneLevel(runRoot)) {
    if (!fileName.endsWith(".json")) continue;
    const filePath = safePath(runRoot, fileName);
    outputs[fileName] = readJsonIfExists(filePath);
  }
  return outputs;
}

function listEventFiles(runRoot) {
  const spawnedRoot = safePath(runRoot, "spawned");
  if (!fs.existsSync(spawnedRoot)) return [];
  return listFilesOneLevel(spawnedRoot)
    .filter((fileName) => fileName.endsWith(".events.jsonl"))
    .map((fileName) => toRepoPath(safePath(spawnedRoot, fileName)));
}

function latestRunId(objectRunRoot) {
  return fs.readdirSync(objectRunRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .at(-1);
}

function listFilesOneLevel(root) {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

function firstExisting(paths) {
  return paths.find((candidate) => fs.existsSync(candidate));
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readTextLines(filePath, maxLines) {
  const boundedMaxLines = Math.max(1, Math.min(Number(maxLines) || 120, 500));
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).slice(0, boundedMaxLines);
}

function normalizeObjectKey(value) {
  const key = String(value || "").trim().toUpperCase();
  if (!SAFE_OBJECT_KEY.test(key)) {
    throw new PassiveKbAccessError(`Invalid SAP object key "${value}".`, "INVALID_OBJECT_KEY", {
      expectedPattern: SAFE_OBJECT_KEY.source
    });
  }
  return key;
}

function safePath(root, ...segments) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...segments);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new PassiveKbAccessError("Passive KB path escaped repository root.", "PATH_ESCAPE", {
      root: resolvedRoot,
      path: resolved
    });
  }
  return resolved;
}

function preferredAccessFor(type) {
  return {
    abap_tcode_analysis_summary: "getAbapAnalysis(objectKey, { detailLevel: 'summary', kind: 'tcode' })",
    abap_program_analysis_summary: "getAbapAnalysis(objectKey, { detailLevel: 'summary', kind: 'program' })",
    abap_source_cache: "getAbapSource(objectKey, { mode: 'metadata' })",
    ddic_table: "getDdicTable(objectKey, { detailLevel: 'summary' })",
    agent_runs: "getAgentRun(objectKey, { runSelector: 'latest' })"
  }[type];
}

function throwInvalidDetailLevel(detailLevel, allowed) {
  throw new PassiveKbAccessError(`Invalid detail level "${detailLevel}".`, "INVALID_DETAIL_LEVEL", {
    allowed
  });
}

function notFound(type, objectKey, checkedPaths) {
  return {
    found: false,
    type,
    objectKey,
    checkedPaths,
    accessPolicy: "object-key-only"
  };
}

function toRepoPath(filePath) {
  return path.relative(process.cwd(), filePath).replaceAll(path.sep, "/");
}
