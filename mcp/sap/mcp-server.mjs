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

const serverInfo = {
  name: "sap-agent-discovery-platform",
  version: "0.1.0"
};

const toolDefinitions = [
  {
    name: "ddic_lookup_table",
    description: "Look up indexed SAP DDIC metadata for a table from the local DDIC index.",
    inputSchema: {
      type: "object",
      properties: {
        tableName: { type: "string" }
      },
      required: ["tableName"]
    }
  },
  {
    name: "abap_lookup_program",
    description: "Look up consolidated ABAP analysis summary for a program from the local ABAP index.",
    inputSchema: {
      type: "object",
      properties: {
        programName: { type: "string" }
      },
      required: ["programName"]
    }
  },
  {
    name: "abap_lookup_tcode",
    description: "Look up Z transaction catalog metadata and current ABAP index manifest.",
    inputSchema: {
      type: "object",
      properties: {
        tcode: { type: "string" }
      },
      required: ["tcode"]
    }
  },
  {
    name: "abap_risk_summary",
    description: "Return the consolidated ABAP risk summary from the local ABAP index.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "abap_submit_graph",
    description: "Return the consolidated ABAP SUBMIT graph from the local ABAP index.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "business_plan_read",
    description: "Plan a guarded SAP business table read without executing it.",
    inputSchema: {
      type: "object",
      properties: {
        moduleName: { type: "string" },
        tableName: { type: "string" },
        filters: { type: "object" },
        fields: { type: "array", items: { type: "string" } },
        rowCount: { type: "number" }
      },
      required: ["moduleName", "tableName", "filters"]
    }
  },
  {
    name: "agent_route_question",
    description: "Route a user question to the most relevant read-only SAP sub-agent and supporting agents.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string" }
      },
      required: ["question"]
    }
  },
  {
    name: "orchestrator_plan_question",
    description: "Plan the safest auditable read-only workflow for a SAP business question without executing SAP reads.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string" },
        inputs: { type: "object" },
        options: { type: "object" }
      },
      required: ["question"]
    }
  },
  {
    name: "orchestrator_execute_question",
    description: "Execute a planner-approved guarded read-only workflow. Returns a compact summary unless outputMode is raw.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string" },
        inputs: { type: "object" },
        options: { type: "object" },
        outputMode: { type: "string", enum: ["summary", "raw"] },
        timeoutMs: { type: "number" }
      },
      required: ["question"]
    }
  }
];

const toolHandlers = {
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
    const result = await handleRequest(request);
    if (request.id !== undefined) {
      write({ jsonrpc: "2.0", id: request.id, result });
    }
  } catch (error) {
    if (request?.id !== undefined) {
      write({
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32000,
          message: error.message
        }
      });
    }
  }
});

async function handleRequest(request) {
  switch (request.method) {
    case "initialize":
      return {
        protocolVersion: request.params?.protocolVersion || "2024-11-05",
        capabilities: {
          tools: {}
        },
        serverInfo
      };

    case "notifications/initialized":
      return {};

    case "tools/list":
      return { tools: toolDefinitions };

    case "tools/call": {
      const name = request.params?.name;
      const args = request.params?.arguments || {};
      const handler = toolHandlers[name];
      if (!handler) throw new Error(`Unknown tool: ${name}`);
      const result = await handler(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    }

    default:
      throw new Error(`Unsupported method: ${request.method}`);
  }
}

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
