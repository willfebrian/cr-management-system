import type { ModuleSaveInput } from '../../shared/moduleTypes.js';
export class ModuleError extends Error {
  constructor(message: string, public status = 400, public code = 'INVALID_MODULE') { super(message); }
}
export function normalizeModuleInput(input: ModuleSaveInput): ModuleSaveInput {
  if (!input || !['SAP','NON-SAP'].includes(input.group)) throw new ModuleError('Select SAP or NON-SAP.');
  if (typeof input.code !== 'string' || typeof input.name !== 'string' || !input.code.trim() || !input.name.trim()) throw new ModuleError('Module code and name are required.');
  if (typeof input.isActive !== 'boolean') throw new ModuleError('Active status must be a boolean.');
  if (input.description !== undefined && typeof input.description !== 'string') throw new ModuleError('Description must be text.');
  return {group:input.group,code:input.code.trim().toUpperCase(),name:input.name.trim(),description:input.description?.trim() || '',isActive:input.isActive};
}
export function normalizeModuleIds(input: unknown): number[] {
  if (!Array.isArray(input) || input.some(id => typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0)) throw new ModuleError('Module IDs must be positive integers.');
  return [...new Set(input as number[])].sort((a,b) => a-b);
}
