import type {
  ManagedUser,
  ManagementActor,
  UserRole
} from "../../shared/userManagementTypes";

export class UserManagementError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
    readonly code = "USER_MANAGEMENT_ERROR",
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "UserManagementError";
  }
}

type ProtectedTarget = Pick<
  ManagedUser,
  "id" | "username" | "role" | "isActive" | "deletedAt"
>;

export function normalizeManagedUsername(value: string): string {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) {
    throw new UserManagementError("Username wajib diisi");
  }
  if (normalized.length > 64) {
    throw new UserManagementError("Username maksimal 64 karakter");
  }
  return normalized;
}

export function assertInitialPassword(password: string): void {
  if (String(password ?? "").length < 8) {
    throw new UserManagementError("Password minimal 8 karakter");
  }
}

export function assertUsernameChangeAllowed(
  target: ProtectedTarget,
  _actor: ManagementActor,
  nextUsername: string
): void {
  if (target.deletedAt) {
    throw new UserManagementError("Archived user harus dipulihkan sebelum diubah", 404);
  }
  normalizeManagedUsername(nextUsername);
}

export function assertRoleChangeAllowed(
  target: ProtectedTarget,
  actor: ManagementActor,
  activeAdminCount: number,
  nextRole: UserRole
): void {
  if (target.deletedAt) {
    throw new UserManagementError("Archived user harus dipulihkan sebelum diubah", 404);
  }
  if (target.id === actor.id && nextRole !== "ADMIN") {
    throw new UserManagementError("Administrator tidak dapat menurunkan role sendiri", 403);
  }
  if (
    target.role === "ADMIN" &&
    target.isActive &&
    nextRole !== "ADMIN" &&
    activeAdminCount <= 1
  ) {
    throw new UserManagementError("Administrator aktif terakhir harus dipertahankan", 403);
  }
}

export function assertStatusChangeAllowed(
  target: ProtectedTarget,
  actor: ManagementActor,
  activeAdminCount: number,
  isActive: boolean
): void {
  if (target.deletedAt) {
    throw new UserManagementError("Archived user hanya dapat diaktifkan melalui Restore", 404);
  }
  if (target.id === actor.id && !isActive) {
    throw new UserManagementError("Administrator tidak dapat menonaktifkan akun sendiri", 403);
  }
  if (
    target.role === "ADMIN" &&
    target.isActive &&
    !isActive &&
    activeAdminCount <= 1
  ) {
    throw new UserManagementError("Administrator aktif terakhir harus dipertahankan", 403);
  }
}

export function assertArchiveAllowed(
  target: ProtectedTarget,
  actor: ManagementActor,
  activeAdminCount: number
): void {
  if (target.deletedAt) {
    throw new UserManagementError("User sudah diarsipkan", 404);
  }
  if (target.id === actor.id) {
    throw new UserManagementError("Administrator tidak dapat mengarsipkan akun sendiri", 403);
  }
  if (target.role === "ADMIN" && target.isActive && activeAdminCount <= 1) {
    throw new UserManagementError("Administrator aktif terakhir harus dipertahankan", 403);
  }
}
