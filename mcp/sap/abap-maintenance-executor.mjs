export class AbapMaintenanceExecutor {
  constructor({ adapter, requiredPackage = "$TMP" }) {
    if (!adapter) throw new Error("ABAP maintenance adapter is required");
    this.adapter = adapter;
    this.requiredPackage = requiredPackage;
  }

  async execute(action) {
    assertNoRequestOrCr(action.parameters);

    if (isRepositoryChange(action.action)) {
      const state = await this.adapter.inspectObjectState(action.objectName);
      assertVerifiedLocalObject(state, this.requiredPackage);
    }

    const result = await this.adapter.perform({
      ...action,
      parameters: {
        ...action.parameters,
        package: isRepositoryChange(action.action) ? this.requiredPackage : action.parameters.package,
        transportRequest: "",
        changeRequest: ""
      },
      cancelOnRequestOrCrPrompt: true
    });

    assertNoRequestOrCr(result);
    if (isRepositoryChange(action.action)) {
      const state = await this.adapter.inspectObjectState(action.objectName);
      assertVerifiedLocalObject(state, this.requiredPackage);
      return { ...result, package: this.requiredPackage };
    }
    return result;
  }
}

function isRepositoryChange(action) {
  return action === "edit_abap_source" || action === "activate_abap_program";
}

function assertVerifiedLocalObject(state, requiredPackage) {
  if (!state || state.verified !== true) throw denied("AUTHORITATIVE_OBJECT_STATE_REQUIRED");
  assertNoRequestOrCr(state);
  const packageName = String(state.package || state.devclass || "").trim().toUpperCase();
  if (packageName !== requiredPackage.toUpperCase()) throw denied("LOCAL_OBJECT_PACKAGE_REQUIRED");
}

function assertNoRequestOrCr(value = {}) {
  if (value.requestPrompted || value.transportRequestCreated || value.changeRequestCreated ||
      value.transportRequest || value.changeRequest || value.request || value.cr) {
    throw denied("REQUEST_OR_CR_PROHIBITED");
  }
}

function denied(code) {
  const error = new Error(`ABAP maintenance denied: ${code}`);
  error.code = code;
  return error;
}
