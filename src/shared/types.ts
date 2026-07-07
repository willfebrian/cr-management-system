export type DashboardData = {
  byStatus: Array<{ status_group: string; count: number }>;
  issueInsights?: {
    byStatus: Array<{ issue_status: string; count: number }>;
    completion: {
      total: number;
      active: number;
      complete: number;
      incomplete: number;
      cancelled: number;
    };
    byLifecycle: Array<{ lifecycle_status: string; count: number }>;
    missingBreakdown: Array<{ label: string; count: number }>;
    trend: Array<{
      month_label: string;
      month_start: string;
      open: number;
      in_progress: number;
      ok: number;
      cancelled: number;
    }>;
  };
  aging: {
    older_than_14_days: number;
    outstanding: number;
  };
  landscape: {
    dev_released: number;
    imported_qa: number;
    pending_qa: number;
    imported_prd: number;
    pending_prd: number;
    pending_qa_older_than_7_days: number;
    pending_prd_older_than_7_days: number;
  };
  lifecycleFunnel: Array<{
    label: string;
    value: number;
  }>;
  syncHealth: Array<{
    sap_system_code: string;
    status: string;
    request_count: number;
    started_at: string;
    finished_at?: string;
    message?: string;
    sync_mode?: string;
    lookback_days?: number | null;
    from_date?: string;
    to_date?: string;
  }>;
  recentActivity: Array<{
    sap_system_code: string;
    trkorr: string;
    description?: string;
    status_group: string;
    changed_date?: string;
  }>;
  lastSuccessfulSync: {
    id: string;
    sap_system_code: string;
    scope_owner: string;
    period_type?: string;
    period_value?: number | null;
    from_date?: string;
    to_date?: string;
    max_rows?: number;
    status: string;
    request_count: number;
    started_at: string;
    finished_at?: string;
    message?: string;
  } | null;
  lastSuccessfulSyncAt?: string | null;
  dbFetchedAt?: string;
};

export type StatusTrendData = {
  fromPeriod: string;
  toPeriod: string;
  dbFetchedAt?: string;
  rows: Array<{
    month_number: number;
    month_label: string;
    month_start: string;
    outstanding: number;
    released: number;
  }>;
};

export type SapSystemConfig = {
  code: string;
  server: string;
  owner: string;
  days: number;
  enabled: boolean;
};

export type CrRequest = {
  sap_system_code: string;
  trkorr: string;
  parent_request?: string;
  description?: string;
  function_code?: string;
  status_code?: string;
  status_group: string;
  lifecycle_status?: string;
  target_system?: string;
  category?: string;
  owner?: string;
  changed_date?: string;
  changed_time?: string;
};

export type CrDetail = {
  request: CrRequest | null;
  tasks: CrRequest[];
  lifecycle: {
    created_at?: string;
    released_at?: string;
    qa_imported_at?: string;
    prd_imported_at?: string;
    qa_status: "imported" | "pending" | "failed" | "unknown";
    prd_status: "imported" | "pending" | "failed" | "unknown";
    qa_evidence_source?: "confirmed" | "inferred" | "unknown";
    prd_evidence_source?: "confirmed" | "inferred" | "unknown";
    qa_return_code?: string;
    prd_return_code?: string;
  };
  objects: Array<{
    trkorr: string;
    position: string;
    pgmid?: string;
    object_type?: string;
    object_label?: string;
    pgmid_description?: string;
    object_type_description?: string;
    object_name?: string;
    diff_readiness?: string;
  }>;
  keys: Array<{
    trkorr: string;
    position: string;
    object_name?: string;
    table_key?: string;
  }>;
};

export type IssueRow = {
  id: number;
  issue_no: number;
  sub_issue_no: string;
  issue_key: string;
  issue_name: string;
  requester_name_snapshot?: string;
  abaper_name_snapshot?: string;
  create_issue_date?: string;
  issue_status?: string;
  source_issue_status?: string;
  cancelled_reason?: string;
  primary_glpi_ticket?: number;
  primary_cr_helpdesk_no?: string;
  primary_cr?: string;
  primary_cr_description?: string;
  primary_cr_status?: string;
  missing_data_count?: number;
};

export type IssueDetail = {
  issue: (IssueRow & {
    problem_analysis?: string;
    impact_analysis?: string;
    email_subject?: string;
    email_date_received?: string;
    cancelled_date?: string;
    cancelled_by_name_snapshot?: string;
  }) | null;
  glpi: Array<{
    id: number;
    ticket_number: number;
    is_primary: boolean;
  }>;
  crHelpdeskNumbers: Array<{
    id: number;
    cr_helpdesk_no: string;
    is_primary: boolean;
  }>;
  crLinks: Array<{
    id: number;
    sap_system_code: string;
    trkorr: string;
    relation_type: string;
    is_primary: boolean;
    cr_description_snapshot?: string;
    status_group?: string;
    lifecycle_status?: string;
    changed_date?: string;
    changed_time?: string;
    sap_created_at?: string;
    sap_created_source?: string;
    sap_released_at?: string;
    sap_released_source?: string;
    qa_import_date?: string;
    qa_import_time?: string;
    prd_import_date?: string;
    prd_import_time?: string;
  }>;
  devTimeline: Record<string, unknown> | null;
  qaTimeline: Record<string, unknown> | null;
  prdTimeline: Record<string, unknown> | null;
  participants: Array<{
    id: number;
    role: string;
    source_field: string;
    person_name_snapshot: string;
    is_primary: boolean;
    full_name?: string;
    nickname?: string;
    department?: string;
  }>;
  statusHistory: Array<{
    id: number;
    from_status?: string;
    to_status: string;
    reason?: string;
    changed_by_name_snapshot?: string;
    changed_at: string;
  }>;
};
