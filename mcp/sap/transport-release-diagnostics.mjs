/** Reconcile legacy SAP task diagnostics without claiming unrelated objects failed. */
export function reconcileInactiveDiagnostics(task, describeType = (_pgmid, type) => ({
  SSFO: "SAP Smart Form", PROG: "Program", REPS: "ABAP Source/Include",
  REPT: "Program Text / Selection Texts"
}[type] || `SAP object ${type || "(unknown type)"}`)) {
  if (task.status !== "ERROR" || !/^Inactive\b/i.test(task.message || "")) return task;
  const message = task.message.trim().split(" — ")[0];
  if (message.startsWith("Inactive:") && message.endsWith("run the test again.")) return task;
  const tokens = message.toUpperCase().split(/[^A-Z0-9_/$%]+/).filter(Boolean);
  const matches = (task.objects || []).filter((object) => object.objectName
    && tokens.includes(object.objectName.toUpperCase()));
  if (!matches.length) {
    return { ...task, message: `${message} — SAP did not identify a matching transport object. Object validation is incomplete.`,
      objects: (task.objects || []).map((object) => object.status === "PASS"
        ? { ...object, status: "WARNING", statusSource: "DIAGNOSTIC", message: "Individual validation is inconclusive: SAP reported an inactive object that could not be mapped. See task diagnostic." }
        : object) };
  }
  // Prefer the explicit diagnostic type if several E071 objects share a name.
  const typed = matches.filter((object) => tokens.includes(object.objectType?.toUpperCase()));
  if (matches.length > 1 && !typed.length) {
    const candidates = matches.map((object) => `${describeType(object.pgmid, object.objectType)} (${object.pgmid} ${object.objectType}) ${object.objectName}`).join("; ");
    return { ...task, message: `${message} — Ambiguous object type. Candidates: ${candidates}. SAP diagnostic does not identify which type is inactive.`,
      objects: (task.objects || []).map((object) => matches.includes(object) && object.status === "PASS"
        ? { ...object, status: "WARNING", statusSource: "DIAGNOSTIC", message: "Inactive object name matched, but SAP did not identify its type. See task diagnostic." }
        : object) };
  }
  const affected = typed.length ? typed : matches;
  const identities = affected.map((object) => `${describeType(object.pgmid, object.objectType)} (${object.pgmid} ${object.objectType}) ${object.objectName}`);
  const detail = `Inactive: ${identities.join("; ")}. Activate the object in SAP and run the test again.`;
  return { ...task, message: detail, objects: (task.objects || []).map((object) => affected.includes(object)
    ? { ...object, status: "ERROR", statusSource: "DIAGNOSTIC", message: `${detail} SAP diagnostic: ${message}` }
    : object) };
}
