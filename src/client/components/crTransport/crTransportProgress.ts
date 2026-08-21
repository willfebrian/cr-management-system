export interface CreateCrProgressState {
  description: string;
  selectedObjectCount: number;
  hasPreflightResult: boolean;
  busy: string;
  created: boolean;
}

export interface ReleaseCrProgressState {
  selectedTrkorr: string;
  releaseSucceeded: boolean;
}

export function isCreateCrIncomplete(state: CreateCrProgressState) {
  if (state.created) return false;
  return Boolean(
    state.description.trim()
    || state.selectedObjectCount > 0
    || state.hasPreflightResult
    || state.busy === "preflight"
    || state.busy === "create"
  );
}

export function isReleaseCrIncomplete(state: ReleaseCrProgressState) {
  return Boolean(state.selectedTrkorr.trim()) && !state.releaseSucceeded;
}

export function getCrTransportLeaveWarning(
  view: string,
  createIncomplete: boolean,
  releaseIncomplete: boolean
) {
  if (view === "cr-transport-create" && createIncomplete) {
    return {
      title: "Incomplete CR Transport Process",
      subtitle: "The current Create CR Transport process is not complete. Do you want to leave this page?"
    };
  }
  if (view === "cr-transport-release" && releaseIncomplete) {
    return {
      title: "Incomplete CR Transport Process",
      subtitle: "The current Release CR Transport process is not complete. Do you want to leave this page?"
    };
  }
  return null;
}
