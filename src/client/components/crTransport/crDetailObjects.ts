import type { CrDetail } from "../../../shared/types";

export function summarizeTransportObjects(objects: CrDetail["objects"]) {
  const grouped = new Map<string, CrDetail["objects"][number] & { sources: CrDetail["objects"] }>();
  const releaseEntries: CrDetail["objects"] = [];
  let sourceCount = 0;
  for (const object of objects) {
    if (object.pgmid?.trim().toUpperCase() === "CORR" && object.object_type?.trim().toUpperCase() === "RELE") {
      releaseEntries.push(object);
      continue;
    }
    sourceCount++;
    const key = JSON.stringify([object.pgmid?.trim(), object.object_type?.trim(), object.object_name || [object.trkorr, object.position]]);
    const existing = grouped.get(key);
    if (existing) existing.sources.push(object);
    else grouped.set(key, { ...object, sources: [object] });
  }
  return { objects: [...grouped.values()], releaseEntries, sourceCount };
}
