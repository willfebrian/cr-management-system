import React from "react";
import { PERMISSION_CATALOG, normalizePermissions, type PermissionKey } from "../../../shared/permissions";
import type { UserRole } from "../../../shared/userManagementTypes";

export function togglePermission(keys: readonly PermissionKey[], key: PermissionKey, checked: boolean, role: UserRole): PermissionKey[] {
  if (checked) return normalizePermissions([...keys, key], role);
  const selected = new Set(keys);
  selected.delete(key);
  let changed = true;
  while (changed) {
    changed = false;
    for (const definition of PERMISSION_CATALOG) {
      if (!selected.has(definition.key)) continue;
      if ("requires" in definition && definition.requires?.some((parent) => !selected.has(parent as PermissionKey))) {
        selected.delete(definition.key);
        changed = true;
      }
    }
  }
  return normalizePermissions([...selected], role);
}

export function UserPermissionsPanel({ role, value, onChange, disabled = false }: {
  role: UserRole;
  value: readonly PermissionKey[];
  onChange(value: PermissionKey[]): void;
  disabled?: boolean;
}) {
  const groups = [...new Set(PERMISSION_CATALOG.map((item) => item.group))];
  return <div className="user-permissions" aria-label="Feature permissions">
    <p>Choose the features this account can access. Create and Release Transport require explicit selection.</p>
    {groups.map((group) => <fieldset key={group}>
      <legend>{group}</legend>
      {PERMISSION_CATALOG.filter((item) => item.group === group).map((item) => {
        const adminOnly = "adminOnly" in item && item.adminOnly;
        const requires = "requires" in item ? item.requires : undefined;
        return <label key={item.key} className="user-permissions__option">
          <input type="checkbox" data-permission={item.key} checked={value.includes(item.key)} disabled={disabled || (adminOnly && role !== "ADMIN")}
            onChange={(event) => onChange(togglePermission(value, item.key, event.target.checked, role))} />
          <span>{item.label}{requires?.length ? <small>Requires {requires.join(", ")}</small> : null}</span>
        </label>;
      })}
    </fieldset>)}
  </div>;
}
