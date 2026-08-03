export type UserRole = "ADMIN" | "USER";
export type ManagedUserStatus = "active" | "inactive";
export type ManagedUserScope = "current" | "archived";

export type ManagementActor = {
  id: number;
  username: string;
  role: UserRole;
};

export type ManagedUser = {
  id: number;
  username: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deletedBySnapshot: string | null;
  deleteReason: string | null;
};

export type ManagedUserListFilters = {
  q?: string;
  role?: UserRole;
  status?: ManagedUserStatus;
  scope?: ManagedUserScope;
  page?: number;
  pageSize?: number;
};

export type ManagedUserListResult = {
  users: ManagedUser[];
  page: number;
  pageSize: number;
  total: number;
};

export type UserAuditAction =
  | "USER_CREATED"
  | "USERNAME_CHANGED"
  | "ROLE_CHANGED"
  | "USER_ACTIVATED"
  | "USER_DEACTIVATED"
  | "PASSWORD_RESET"
  | "SESSIONS_REVOKED"
  | "USER_ARCHIVED"
  | "USER_RESTORED";

export type UserAuditEntry = {
  id: number;
  actorUserId: number | null;
  actorUsername: string | null;
  targetUserId: number;
  action: UserAuditAction;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type CreateManagedUserPayload = {
  username: string;
  password: string;
  role: UserRole;
  isActive?: boolean;
};

export type UpdateManagedUserProfilePayload = {
  username?: string;
  role?: UserRole;
};

export type RestoreManagedUserPayload = {
  password: string;
  role: UserRole;
  isActive: boolean;
};

export type ArchivedUsernameConflict = {
  message: string;
  archivedUserId: number;
  canRestore: true;
};
