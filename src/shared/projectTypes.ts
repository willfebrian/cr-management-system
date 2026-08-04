export type ProjectStatus = "planned" | "in_progress" | "on_hold" | "completed" | "cancelled";
export type EditableProjectStatus = Exclude<ProjectStatus, "cancelled">;
export type ProjectRelationStatus = "active" | "removed" | "cancelled" | "deleted";

export type ProjectIssue = {
  linkId?: number | null;
  historyId?: number | null;
  issueId?: number | null;
  issueKey: string;
  issueName: string;
  issueStatus?: string | null;
  requesterName?: string | null;
  abaperName?: string | null;
  primaryCr?: string | null;
  relationStatus: ProjectRelationStatus;
  linkedAt?: string | null;
  unlinkedAt?: string | null;
  reason?: string | null;
};

export type ProjectRow = {
  id: number;
  projectNo: number;
  projectKey: string;
  projectName: string;
  description?: string | null;
  ownerPersonId: number;
  ownerName: string;
  projectStatus: ProjectStatus;
  canDelete: boolean;
  issueCount: number;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
  cancelledReason?: string | null;
};

export type ProjectStatusHistory = {
  id: number;
  fromStatus?: ProjectStatus | null;
  toStatus: ProjectStatus;
  reason?: string | null;
  changedBy: string;
  changedAt: string;
};

export type ProjectDetail = {
  project: ProjectRow;
  issues: ProjectIssue[];
  statusHistory: ProjectStatusHistory[];
};

export type ProjectIssueOption = {
  issueId: number;
  issueKey: string;
  issueName: string;
  issueStatus?: string | null;
  requesterName?: string | null;
  abaperName?: string | null;
  primaryCr?: string | null;
  owningProjectId?: number | null;
  owningProjectKey?: string | null;
  owningProjectName?: string | null;
  available: boolean;
};

export type ProjectOwnerOption = {
  personId: number;
  fullName: string;
  nickname?: string | null;
  department?: string | null;
};

export type ProjectFilters = {
  q?: string;
  status?: ProjectStatus | "all";
  page?: number;
  pageSize?: number;
};

export type ProjectListResult = {
  rows: ProjectRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ProjectSavePayload = {
  id?: number;
  projectName: string;
  description?: string;
  ownerPersonId: number;
  projectStatus: EditableProjectStatus;
  issueIds: number[];
};

export type ProjectCrReadinessSection = "project" | "initiation" | "qa" | "prd" | "cr";

export type ProjectCrReadinessItem = {
  id: string;
  label: string;
  section: ProjectCrReadinessSection;
  issueId?: number;
  issueKey?: string;
  crSap?: string;
  targetId?: string;
};

export type ProjectCrReadinessGroup = {
  section: ProjectCrReadinessSection;
  title: string;
  items: ProjectCrReadinessItem[];
};

export type ProjectCrReadiness = {
  ready: boolean;
  missingCount: number;
  groups: ProjectCrReadinessGroup[];
};
