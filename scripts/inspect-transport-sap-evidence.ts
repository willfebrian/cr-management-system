import "dotenv/config";
import {
  readCrDetail,
  readTransportImportLogsByRequest
} from "../src/server/sap/crExtractor.js";

const trkorr = String(process.argv[2] || "").trim().toUpperCase();
if (!trkorr) {
  console.error("Usage: tsx scripts/inspect-transport-sap-evidence.ts <TRKORR>");
  process.exitCode = 1;
} else {
  const targets = [];
  for (const targetSystemCode of ["QA", "PRD"] as const) {
    try {
      const [logs, detail] = await Promise.all([
        readTransportImportLogsByRequest({ targetSystemCode, trkorr, rowCount: 100 }),
        readCrDetail(trkorr, targetSystemCode)
      ]);
      targets.push({
        targetSystemCode,
        logs,
        header: detail.header ? {
          trkorr: detail.header.trkorr,
          status: detail.header.status,
          statusGroup: detail.header.statusGroup,
          changedDate: detail.header.changedDate,
          changedTime: detail.header.changedTime
        } : null,
        taskCount: detail.counts.taskCount,
        objectCount: detail.counts.objectCount
      });
    } catch (error) {
      targets.push({
        targetSystemCode,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  console.log(JSON.stringify({ trkorr, targets }, null, 2));
}
