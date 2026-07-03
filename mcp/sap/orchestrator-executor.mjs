import { spawn } from "node:child_process";
import { businessWorkflows } from "../../config/business-workflows.mjs";
import { agentRuntimeBindings } from "../../config/agent-runtime-bindings.mjs";
import { planQuestionExecution } from "./orchestrator-planner.mjs";

const DEFAULT_TIMEOUT_MS = 90000;
const MAX_TIMEOUT_MS = 120000;
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;

export async function executeQuestionWorkflow({
  question,
  inputs = {},
  options = {},
  outputMode = "summary",
  timeoutMs = Number(process.env.SAP_WORKFLOW_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
}, runtime = {}) {
  const plan = planQuestionExecution({ question, inputs, options });
  if (!plan.ok) return { ok: false, executed: false, plan };

  const invocation = buildWorkflowInvocation(plan);
  const rawResult = await runInvocation(invocation, {
    spawnImpl: runtime.spawnImpl || spawn,
    cwd: runtime.cwd || process.cwd(),
    timeoutMs: normalizeTimeout(timeoutMs),
    maxOutputBytes: runtime.maxOutputBytes || MAX_OUTPUT_BYTES
  });

  return {
    ok: true,
    executed: true,
    plan,
    result: outputMode === "raw" ? rawResult : summarizeWorkflowResult(rawResult)
  };
}

export function buildWorkflowInvocation(plan) {
  if (!plan?.ok || plan.executionPolicy !== "PLAN_ONLY") {
    throw new Error("Planner-approved workflow is required before execution.");
  }

  const workflow = businessWorkflows.find((item) => item.id === plan.workflow?.id);
  if (!workflow?.scriptPath) throw new Error(`Workflow is not executable: ${plan.workflow?.id || "unknown"}`);
  for (const agent of workflow.agents) {
    const allowed = agentRuntimeBindings[agent]?.workflows || [];
    if (!allowed.includes(workflow.id)) {
      throw new Error(`Workflow ${workflow.id} is not bound to agent ${agent}`);
    }
  }

  const args = workflow.requiredInputs.map((name) => {
    const value = String(plan.detectedInputs?.[name] || "").trim();
    if (!value) throw new Error(`Missing workflow input: ${name}`);
    return value;
  });
  args.push(...(plan.flags?.enabled || []).map((flag) => flag.cliFlag));

  return {
    workflowId: workflow.id,
    executable: process.execPath,
    args: [workflow.scriptPath, ...args]
  };
}

export function summarizeWorkflowResult(rawResult) {
  const summary = {
    input: rawResult.input,
    auditAnswer: rawResult.auditAnswer,
    source: rawResult.source
  };
  if (rawResult.counts) summary.counts = rawResult.counts;
  summary.resultCounts = Object.fromEntries(Object.entries(rawResult)
    .filter(([, value]) => Array.isArray(value))
    .map(([key, value]) => [key, value.length]));
  return summary;
}

function runInvocation(invocation, { spawnImpl, cwd, timeoutMs, maxOutputBytes }) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(invocation.executable, invocation.args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    const timer = setTimeout(() => {
      child.kill();
      const error = new Error(`Workflow timed out after ${timeoutMs} ms`);
      error.code = "WORKFLOW_TIMEOUT";
      reject(error);
    }, timeoutMs);
    timer.unref?.();

    child.stdout.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        child.kill();
        const error = new Error(`Workflow output exceeds ${maxOutputBytes} bytes`);
        error.code = "WORKFLOW_OUTPUT_LIMIT";
        reject(error);
        return;
      }
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const error = new Error(stderr.trim() || `Workflow exited with code ${code}`);
        error.code = "WORKFLOW_FAILED";
        reject(error);
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        const error = new Error("Workflow returned invalid JSON.");
        error.code = "WORKFLOW_INVALID_JSON";
        reject(error);
      }
    });
  });
}

function normalizeTimeout(value) {
  const timeoutMs = Number(value);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) return DEFAULT_TIMEOUT_MS;
  return Math.min(timeoutMs, MAX_TIMEOUT_MS);
}
