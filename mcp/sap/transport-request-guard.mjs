export class TransportRequestGuard {
  constructor({ confirmationService, target } = {}) {
    this.confirmationService = confirmationService;
    this.target = target;
  }

  authorize({ server, client, sapUser, mode, description, objects, confirmation }) {
    const normalizedServer = normalize(server);
    const target = this.target;
    if (!target) throw denied("TARGET_NOT_CONFIGURED");
    const normalizedMode = normalize(mode);
    const normalizedDescription = String(description || "").trim();
    const normalizedObjects = normalizeObjects(objects);

    if (normalizedServer !== target.server) throw denied("SERVER_NOT_ALLOWED");
    if (normalize(client) !== target.client) throw denied("CLIENT_NOT_ALLOWED");
    if (normalize(sapUser) !== target.sapUser) throw denied("SAP_USER_NOT_ALLOWED");
    if (!["PREFLIGHT", "CREATE"].includes(normalizedMode)) throw denied("MODE_NOT_ALLOWED");
    if (!normalizedDescription.startsWith("AB - ")) throw denied("DESCRIPTION_PREFIX_REQUIRED");
    if (normalizedDescription.length > 60) throw denied("DESCRIPTION_TOO_LONG");
    if (!normalizedDescription.slice(5).trim()) throw denied("DESCRIPTION_REQUIRED");
    if (!normalizedObjects.length) throw denied("OBJECTS_REQUIRED");

    for (const object of normalizedObjects) {
      if (object.pgmid !== "R3TR") throw denied("MAIN_OBJECT_REQUIRED");
      if (!["$TMP", target.package].includes(object.sourcePackage)) throw denied("SOURCE_PACKAGE_NOT_ALLOWED");
      if (object.targetPackage !== target.package) throw denied("TARGET_PACKAGE_REQUIRED");
      if (!/^(Z|Y|\/)/.test(object.objectName)) throw denied("CUSTOM_NAMESPACE_REQUIRED");
    }

    const parameters = {
      client: target.client,
      sapUser: target.sapUser,
      mode: normalizedMode,
      description: normalizedDescription,
      package: target.package,
      objects: normalizedObjects
    };

    if (normalizedMode === "CREATE") {
      if (!this.confirmationService) throw denied("TRUSTED_CONFIRMATION_SERVICE_REQUIRED");
      this.confirmationService.verifyAndConsume(confirmation, {
        agentName: "sap_abap_technical_agent",
        server: target.server,
        action: "create_transport_request",
        objectName: objectScope(normalizedObjects),
        parameters
      });
    }

    return { server: target.server, ...parameters };
  }
}

export function objectScope(objects) {
  return normalizeObjects(objects)
    .map((item) => `${item.pgmid}:${item.objectType}:${item.objectName}`)
    .sort()
    .join(",");
}

function normalizeObjects(objects) {
  if (!Array.isArray(objects)) return [];
  return objects.map((item) => ({
    pgmid: normalize(item?.pgmid),
    objectType: normalize(item?.objectType || item?.object),
    objectName: normalize(item?.objectName),
    sourcePackage: normalize(item?.sourcePackage || item?.package),
    targetPackage: normalize(item?.targetPackage || "ZTRD")
  })).filter((item) => item.pgmid && item.objectType && item.objectName);
}

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function denied(code) {
  const error = new Error(`Transport request denied: ${code}`);
  error.code = code;
  return error;
}
