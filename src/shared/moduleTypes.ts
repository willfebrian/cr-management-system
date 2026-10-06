export type ModuleGroup = 'SAP' | 'NON-SAP';
export type ModuleSummary = { id: number; group: ModuleGroup; code: string; name: string; description: string | null; isActive: boolean };
export type ModuleSaveInput = { group: ModuleGroup; code: string; name: string; description?: string; isActive: boolean };
export function formatModules(modules: ModuleSummary[] = []): string {
  return [...modules].sort((a,b) => a.group.localeCompare(b.group) || a.code.localeCompare(b.code) || a.id-b.id).map(m => `${m.group}: ${m.code}`).join('; ');
}
