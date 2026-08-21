import assert from "node:assert/strict";
import test from "node:test";

type ProgressModule = {
  isCreateCrIncomplete?: (state: {
    description: string;
    selectedObjectCount: number;
    hasPreflightResult: boolean;
    busy: string;
    created: boolean;
  }) => boolean;
  isReleaseCrIncomplete?: (state: {
    selectedTrkorr: string;
    releaseSucceeded: boolean;
  }) => boolean;
  getCrTransportLeaveWarning?: (
    view: string,
    createIncomplete: boolean,
    releaseIncomplete: boolean
  ) => { title: string; subtitle: string } | null;
};

async function loadProgressModule(): Promise<ProgressModule> {
  try {
    return await import("../src/client/components/crTransport/crTransportProgress");
  } catch {
    return {};
  }
}

test("marks Create CR as incomplete only after meaningful work starts", async () => {
  const progress = await loadProgressModule();
  assert.equal(typeof progress.isCreateCrIncomplete, "function");

  assert.equal(progress.isCreateCrIncomplete!({
    description: "",
    selectedObjectCount: 0,
    hasPreflightResult: false,
    busy: "",
    created: false
  }), false);
  assert.equal(progress.isCreateCrIncomplete!({
    description: "Update purchasing report",
    selectedObjectCount: 0,
    hasPreflightResult: false,
    busy: "",
    created: false
  }), true);
  assert.equal(progress.isCreateCrIncomplete!({
    description: "Update purchasing report",
    selectedObjectCount: 1,
    hasPreflightResult: true,
    busy: "",
    created: true
  }), false);
});

test("keeps Release CR incomplete until SAP confirms success", async () => {
  const progress = await loadProgressModule();
  assert.equal(typeof progress.isReleaseCrIncomplete, "function");

  assert.equal(progress.isReleaseCrIncomplete!({ selectedTrkorr: "", releaseSucceeded: false }), false);
  assert.equal(progress.isReleaseCrIncomplete!({ selectedTrkorr: "TRDK924752", releaseSucceeded: false }), true);
  assert.equal(progress.isReleaseCrIncomplete!({ selectedTrkorr: "TRDK924752", releaseSucceeded: true }), false);
});

test("returns the correct English leave warning for each CR workflow", async () => {
  const progress = await loadProgressModule();
  assert.equal(typeof progress.getCrTransportLeaveWarning, "function");

  assert.deepEqual(progress.getCrTransportLeaveWarning!("cr-transport-create", true, false), {
    title: "Incomplete CR Transport Process",
    subtitle: "The current Create CR Transport process is not complete. Do you want to leave this page?"
  });
  assert.deepEqual(progress.getCrTransportLeaveWarning!("cr-transport-release", false, true), {
    title: "Incomplete CR Transport Process",
    subtitle: "The current Release CR Transport process is not complete. Do you want to leave this page?"
  });
  assert.equal(progress.getCrTransportLeaveWarning!("cr-transport-create", false, false), null);
});
