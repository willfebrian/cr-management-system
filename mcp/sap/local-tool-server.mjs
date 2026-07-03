import readline from "node:readline";
import {
  getAbapRiskSummary,
  getSubmitGraph,
  lookupAbapProgram,
  lookupDdicTable,
  lookupTcode
} from "./index-lookup.mjs";
import { planBusinessRead } from "./business-query-planner.mjs";
import { routeQuestion } from "./agent-router.mjs";
import { planQuestionExecution } from "./orchestrator-planner.mjs";
import { executeQuestionWorkflow } from "./orchestrator-executor.mjs";

const tools = {
  ddic_lookup_table: ({ tableName }) => lookupDdicTable(tableName),
  abap_lookup_program: ({ programName }) => lookupAbapProgram(programName),
  abap_lookup_tcode: ({ tcode }) => lookupTcode(tcode),
  abap_risk_summary: () => getAbapRiskSummary(),
  abap_submit_graph: () => getSubmitGraph(),
  business_plan_read: (args) => planBusinessRead(args),
  agent_route_question: ({ question }) => routeQuestion(question),
  orchestrator_plan_question: (args) => planQuestionExecution(args),
  orchestrator_execute_question: (args) => executeQuestionWorkflow(args)
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on("line", async (line) => {
  let request;
  try {
    request = JSON.parse(line);
    const tool = tools[request.method];
    if (!tool) throw new Error(`Unknown method: ${request.method}`);
    const result = await tool(request.params || {});
    write({ id: request.id, result });
  } catch (error) {
    write({
      id: request?.id,
      error: {
        message: error.message,
        code: error.code
      }
    });
  }
});

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
