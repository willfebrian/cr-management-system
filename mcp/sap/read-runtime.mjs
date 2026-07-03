import { AuditLogger } from "./audit-logger.mjs";
import { createSapClients } from "./sap-client-factory.mjs";
import { SapGateway } from "./sap-gateway.mjs";
import { createSapTools } from "./tools.mjs";

export function createReadRuntime() {
  const gateway = new SapGateway({
    clients: createSapClients(),
    auditLogger: new AuditLogger({
      enabled: process.env.SAP_AUDIT_LOG_ENABLED !== "false",
      logPath: "logs/sap-audit.jsonl"
    })
  });
  const tools = createSapTools(gateway);

  return {
    readBusiness: async ({ agentName, moduleName, tableName, filters, fields, rowCount, userQuestion }) => {
      const response = await tools.sap_business_read_limited({
        agentName,
        moduleName,
        tableName,
        filters,
        fields,
        rowCount,
        userQuestion
      });
      return response.result;
    }
  };
}
