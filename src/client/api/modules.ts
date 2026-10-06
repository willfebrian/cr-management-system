import type { ModuleGroup, ModuleSummary, ModuleSaveInput } from '../../shared/moduleTypes';

const invalidResponseMessage = 'The module service returned an invalid response. Please try again.';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...init });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('The module service is unavailable. Restart the application server and try again.');
  }
  const data = await response.json().catch(() => { throw new Error(invalidResponseMessage); });
  if (!response.ok) throw new Error(data?.message || 'Module request failed.');
  return data;
}

async function lookup(url: string): Promise<ModuleSummary[]> {
  const data = await request<{ rows: ModuleSummary[] }>(url);
  if (!data || !Array.isArray(data.rows)) throw new Error(invalidResponseMessage);
  return data.rows;
}

export function fetchAdminModules(filters: { group?: ModuleGroup; active?: boolean; q?: string } = {}): Promise<ModuleSummary[]> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return lookup('/api/admin/modules?' + query);
}

export function createAdminModule(input: ModuleSaveInput) {
  return request<ModuleSummary>('/api/admin/modules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
}

export function updateAdminModule(id: number, input: ModuleSaveInput) {
  return request<ModuleSummary>('/api/admin/modules/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
}

export function fetchIssueModuleOptions(): Promise<ModuleSummary[]> {
  return lookup('/api/value-help/modules');
}

export function fetchReportModuleOptions(): Promise<ModuleSummary[]> {
  return lookup('/api/value-help/modules/report');
}
