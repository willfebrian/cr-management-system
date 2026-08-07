import "dotenv/config";
import { TransportRequestService } from "../mcp/sap/transport-request-service.mjs";

const action = String(process.argv[2] || "").trim().toLowerCase();
if (!["resolve", "preflight", "create"].includes(action)) {
  throw new Error("Usage: node scripts/cr-transport-request.mjs <resolve|preflight|create>");
}

let input = "";
for await (const chunk of process.stdin) input += chunk;
const payload = input.trim() ? JSON.parse(input) : {};
const service = new TransportRequestService({ targetSystem: payload.targetSystem });

try {
  const result = action === "resolve"
    ? await service.resolve(payload.query)
    : action === "preflight"
      ? await service.preflight(payload)
      : await service.create(payload);
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  process.stdout.write(JSON.stringify({
    ok: false,
    message: error.message,
    code: error.code || "TRANSPORT_REQUEST_FAILED"
  }));
  process.exitCode = 1;
}
