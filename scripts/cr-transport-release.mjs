import "dotenv/config";
import { TransportReleaseService } from "../mcp/sap/transport-release-service.mjs";

const action = String(process.argv[2] || "").trim().toLowerCase();
if (!["test-run", "release"].includes(action)) {
  throw new Error("Usage: node scripts/cr-transport-release.mjs <test-run|release>");
}

let input = "";
for await (const chunk of process.stdin) input += chunk;
const payload = input.trim() ? JSON.parse(input) : {};
const service = new TransportReleaseService({ targetSystem: payload.targetSystem });

try {
  const result = action === "test-run"
    ? await service.testRun(payload.trkorr)
    : await service.release(payload.trkorr);
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  process.stdout.write(JSON.stringify({
    ok: false,
    message: error.message,
    code: error.code || "TRANSPORT_RELEASE_FAILED"
  }));
  process.exitCode = 1;
}
