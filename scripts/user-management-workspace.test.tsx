import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ManagedUser, UserAuditEntry } from "../src/shared/userManagementTypes";
import {
  conflictRestoreTarget,
  runPersonAssignmentMutation,
  UserManagementWorkspaceView
} from "../src/client/components/users/UserManagementWorkspace";
import { UserDetailPanel } from "../src/client/components/users/UserDetailPanel";
import { UserPersonAssignmentDialog } from "../src/client/components/users/UserPersonAssignmentDialog";
import { ManagedUserApiError } from "../src/client/api/userManagementApi";

const admin: ManagedUser = {
  id: 1,
  username: "ROOT",
  role: "ADMIN",
  isActive: true,
  mustChangePassword: false,
  lastLoginAt: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  deletedAt: null,
  deletedBySnapshot: null,
  deleteReason: null,
  person: null
};
const inactive: ManagedUser = {
  ...admin,
  id: 2,
  username: "ALICE",
  role: "USER",
  isActive: false
};
const archived: ManagedUser = {
  ...inactive,
  id: 3,
  username: "BOB",
  deletedAt: "2026-07-30T00:00:00.000Z",
  deletedBySnapshot: "ROOT",
  deleteReason: "Left"
};
const noop = () => {};
const linked: ManagedUser = {
  ...inactive,
  person: {
    id: 12,
    fullName: "Alice Wijaya",
    nickname: "Alice",
    email: "alice@example.test",
    isActive: true
  }
};

function view(overrides: Partial<React.ComponentProps<typeof UserManagementWorkspaceView>> = {}) {
  return renderToStaticMarkup(<UserManagementWorkspaceView
    currentUserId={1}
    scope="current"
    filters={{ q: "", role: "", status: "" }}
    users={[admin, inactive]}
    selectedUserId={2}
    loading={false}
    error=""
    onScopeChange={noop}
    onFiltersChange={noop}
    onSelect={noop}
    onCreate={noop}
    {...overrides}
  />);
}

test("renders loading, error, and empty states accessibly", () => {
  assert.match(view({ loading: true, users: [] }), /Loading user accounts/i);
  assert.match(view({ error: "Network down", users: [] }), /role="alert"[^>]*>Network down/i);
  assert.match(view({ users: [], selectedUserId: null }), /No users found in this scope/i);
});

test("renders filters and the selected inactive row in the workspace", () => {
  const html = view();
  assert.doesNotMatch(html, /role="tablist"/);
  assert.match(html, /aria-label="Search users"/);
  assert.match(html, /aria-label="Filter role"/);
  assert.match(html, /aria-label="Filter status"/);
  assert.match(html, /user-management__row--selected/);
  assert.match(html, /ALICE/);
  assert.match(html, /Inactive/);
});

test("archived scope renders archived accounts without a duplicate workspace toolbar", () => {
  const html = view({
    scope: "archived",
    users: [archived],
    selectedUserId: 3
  });
  assert.match(html, /Archived/);
  assert.doesNotMatch(html, /Create User/);
});

test("detail panel disables protected self actions but keeps self rename available", () => {
  const html = renderToStaticMarkup(<UserDetailPanel
    user={admin}
    audit={[]}
    currentUserId={1}
    activeAdminCount={1}
    onEdit={noop}
    onStatusChange={noop}
    onResetPassword={noop}
    onRevokeSessions={noop}
    onArchive={noop}
    onRestore={noop}
  />);
  assert.match(html, /Edit username/);
  assert.match(html, /Reset Password[^<]*<\/button>/);
  assert.match(html, /Reset Password[\s\S]*disabled/);
  assert.match(html, /Cannot deactivate own account/);
  assert.match(html, /Cannot archive own account/);
});

test("detail panel renders immutable audit entries without secret fields", () => {
  const audit: UserAuditEntry[] = [{
    id: 9,
    actorUserId: 1,
    actorUsername: "ROOT",
    targetUserId: 2,
    action: "USERNAME_CHANGED",
    metadata: { before: "OLD", after: "ALICE" },
    createdAt: "2026-07-30T00:00:00.000Z"
  }];
  const html = renderToStaticMarkup(<UserDetailPanel
    user={inactive}
    audit={audit}
    currentUserId={1}
    activeAdminCount={1}
    onEdit={noop}
    onStatusChange={noop}
    onResetPassword={noop}
    onRevokeSessions={noop}
    onArchive={noop}
    onRestore={noop}
  />);
  assert.match(html, /USERNAME CHANGED/);
  assert.match(html, /OLD/);
  assert.match(html, /ALICE/);
  assert.doesNotMatch(html, /password_hash|token_hash/i);
});

test("maps archived create conflict directly to its restore target", () => {
  assert.equal(conflictRestoreTarget(new ManagedUserApiError(
    "Restore",
    409,
    "ARCHIVED_USERNAME",
    { archivedUserId: 42, canRestore: true }
  )), 42);
  assert.equal(conflictRestoreTarget(new Error("other")), null);
});

test("renders linked identity and unassigned status in list and detail", () => {
  assert.match(view({ users: [admin, linked] }), /Alice Wijaya \(Alice\)/);
  assert.match(view({ users: [admin, inactive] }), /Unassigned/);
  const detail = renderToStaticMarkup(<UserDetailPanel
    user={linked}
    audit={[]}
    currentUserId={1}
    activeAdminCount={1}
    onAssignPerson={noop}
    onChangePerson={noop}
    onUnassignPerson={noop}
    onEdit={noop}
    onStatusChange={noop}
    onResetPassword={noop}
    onRevokeSessions={noop}
    onArchive={noop}
    onRestore={noop}
  />);
  assert.match(detail, /Linked Person/);
  assert.match(detail, /alice@example\.test/);
  assert.match(detail, /Change Assignment/);
});

test("assignment dialog disables inactive and owned people with explanations", () => {
  const html = renderToStaticMarkup(<UserPersonAssignmentDialog
    open
    user={inactive}
    query="ali"
    options={[
      { id: 12, fullName: "Inactive Person", nickname: "IP", email: null, isActive: false, assignedUser: null },
      { id: 13, fullName: "Owned Person", nickname: "OP", email: null, isActive: true,
        assignedUser: { id: 9, username: "BOB", deletedAt: null } }
    ]}
    selectedPersonId={null}
    phase="select"
    operation="assign"
    busy={false}
    error=""
    onQueryChange={noop}
    onSelect={noop}
    onContinue={noop}
    onBack={noop}
    onConfirm={noop}
    onClose={noop}
  />);
  assert.match(html, /Inactive Person[\s\S]*Inactive/);
  assert.match(html, /Owned Person[\s\S]*Assigned to BOB/);
  assert.equal((html.match(/disabled/g) ?? []).length >= 2, true);
});

test("assignment dialog confirms reassignment and unassignment transitions", () => {
  const options = [{
    id: 13,
    fullName: "Bob Wijaya",
    nickname: "Bob",
    email: null,
    isActive: true,
    assignedUser: null
  }];
  const reassignment = renderToStaticMarkup(<UserPersonAssignmentDialog
    open user={linked} query="" options={options} selectedPersonId={13}
    phase="confirm" operation="assign" busy={false} error=""
    onQueryChange={noop} onSelect={noop} onContinue={noop} onBack={noop}
    onConfirm={noop} onClose={noop}
  />);
  assert.match(reassignment, /Alice Wijaya \(Alice\)[\s\S]*Bob Wijaya \(Bob\)/);

  const unassignment = renderToStaticMarkup(<UserPersonAssignmentDialog
    open user={linked} query="" options={[]} selectedPersonId={null}
    phase="confirm" operation="unassign" busy={false} error=""
    onQueryChange={noop} onSelect={noop} onContinue={noop} onBack={noop}
    onConfirm={noop} onClose={noop}
  />);
  assert.match(unassignment, /Alice Wijaya \(Alice\)[\s\S]*Unassigned/);
});

test("assignment coordinator mutates then reloads audit", async () => {
  const calls: string[] = [];
  const api = {
    assignManagedUserPerson: async (userId: number, personId: number) => {
      calls.push(`assign:${userId}:${personId}`);
      return linked;
    },
    unassignManagedUserPerson: async (userId: number) => {
      calls.push(`unassign:${userId}`);
      return { ...linked, person: null };
    },
    fetchManagedUserAudit: async (userId: number) => {
      calls.push(`audit:${userId}`);
      return [];
    }
  };

  const assigned = await runPersonAssignmentMutation(api as any, 2, 12);
  assert.equal(assigned.user.person?.id, 12);
  assert.deepEqual(calls, ["assign:2:12", "audit:2"]);

  calls.length = 0;
  const unassigned = await runPersonAssignmentMutation(api as any, 2, null);
  assert.equal(unassigned.user.person, null);
  assert.deepEqual(calls, ["unassign:2", "audit:2"]);
});
