import type {
  EditableProjectStatus,
  ProjectSavePayload,
  ProjectStatus
} from "../../shared/projectTypes.js";

const EDITABLE_STATUSES = new Set<EditableProjectStatus>([
  "planned",
  "in_progress",
  "on_hold",
  "completed"
]);

export function validateProjectPayload(payload: unknown): ProjectSavePayload {
  const candidate = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const projectName = typeof candidate.projectName === "string" ? candidate.projectName.trim() : "";
  if (!projectName) throw new Error("Project name is required");

  const ownerPersonId = Number(candidate.ownerPersonId);
  if (!Number.isSafeInteger(ownerPersonId) || ownerPersonId <= 0) {
    throw new Error("Project owner is required");
  }

  if (candidate.projectStatus === "cancelled") {
    throw new Error("Cancelled status can only be set through the cancel operation");
  }
  if (!EDITABLE_STATUSES.has(candidate.projectStatus as EditableProjectStatus)) {
    throw new Error("Project status is invalid");
  }

  if (!Array.isArray(candidate.issueIds)) throw new Error("Issue IDs must be an array");
  const issueIds = uniquePositiveIds(candidate.issueIds);

  const id = candidate.id === undefined ? undefined : Number(candidate.id);
  if (id !== undefined && (!Number.isSafeInteger(id) || id <= 0)) {
    throw new Error("Project ID is invalid");
  }
  const description = typeof candidate.description === "string" ? candidate.description.trim() : "";
  return {
    ...(id === undefined ? {} : { id }),
    projectName,
    ...(description ? { description } : {}),
    ownerPersonId,
    projectStatus: candidate.projectStatus as EditableProjectStatus,
    issueIds
  };
}

export function diffIssueLinks(currentIds: number[], nextIds: number[]) {
  const current = new Set(uniquePositiveIds(currentIds));
  const next = new Set(uniquePositiveIds(nextIds));
  return {
    added: [...next].filter((id) => !current.has(id)).sort((a, b) => a - b),
    removed: [...current].filter((id) => !next.has(id)).sort((a, b) => a - b)
  };
}

export function assertProjectTransition(current: ProjectStatus, next: ProjectStatus) {
  if (current === "cancelled") throw new Error("Cancelled Projects are read-only");
  if (next === "cancelled") throw new Error("Use the Project cancel operation");
  if (!EDITABLE_STATUSES.has(next as EditableProjectStatus)) throw new Error("Project status is invalid");
}

function uniquePositiveIds(values: unknown[]) {
  const ids = values.map(Number);
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error("Issue IDs must contain positive integers");
  }
  return [...new Set(ids)].sort((a, b) => a - b);
}
