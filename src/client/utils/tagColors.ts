export interface StatusColorSetting {
  key: string;
  label: string;
  group: string;
  defaultBg: string;
  defaultText: string;
  defaultBorder: string;
  selectors: string[];
}

export const STATUS_COLOR_GROUP_ORDER = ["Preparation", "Transport", "Completion", "Other Statuses"];

export const STATUS_COLOR_CONFIGS: StatusColorSetting[] = [
  {
    key: "outstanding",
    label: "Outstanding / Open",
    group: "Other Statuses",
    defaultBg: "#fef3c7",
    defaultText: "#d97706",
    defaultBorder: "#fde68a",
    selectors: [".status.outstanding", ".status.open"]
  },
  {
    key: "released",
    label: "Released",
    group: "Transport",
    defaultBg: "#d1fae5",
    defaultText: "#059669",
    defaultBorder: "#a7f3d0",
    selectors: [".status.released", ".status.completed", ".status.ok", ".status.active"]
  },
  {
    key: "pending_qa",
    label: "Pending to QA",
    group: "Transport",
    defaultBg: "#fef3c7",
    defaultText: "#b45309",
    defaultBorder: "#fde68a",
    selectors: [".status.pending_qa"]
  },
  {
    key: "in_qa",
    label: "In QA",
    group: "Transport",
    defaultBg: "#dbeafe",
    defaultText: "#2563eb",
    defaultBorder: "#bfdbfe",
    selectors: [".status.in_qa"]
  },
  {
    key: "pending_prd",
    label: "Pending to PRD",
    group: "Transport",
    defaultBg: "#ffedd5",
    defaultText: "#c2410c",
    defaultBorder: "#fed7aa",
    selectors: [".status.pending_prd"]
  },
  {
    key: "in_prd",
    label: "In PRD",
    group: "Completion",
    defaultBg: "#d1fae5",
    defaultText: "#047857",
    defaultBorder: "#a7f3d0",
    selectors: [".status.in_prd"]
  },
  {
    key: "in_progress",
    label: "In Progress / Planned",
    group: "Other Statuses",
    defaultBg: "#dbeafe",
    defaultText: "#2563eb",
    defaultBorder: "#bfdbfe",
    selectors: [".status.in_progress", ".status.planned"]
  },
  {
    key: "created",
    label: "Created",
    group: "Preparation",
    defaultBg: "#f3e8ff",
    defaultText: "#7c3aed",
    defaultBorder: "#ddd6fe",
    selectors: [".status.created"]
  },
  {
    key: "cancelled",
    label: "Cancelled / Deleted",
    group: "Other Statuses",
    defaultBg: "#ffe4e6",
    defaultText: "#e11d48",
    defaultBorder: "#fecdd3",
    selectors: [".status.cancelled", ".status.deleted", ".status.on_hold"]
  }
];

import { getActiveAppearanceKey } from "./fontSize";

export function applyCustomStatusColors(settings: Record<string, string> = {}, username?: string, isDbFallback: boolean = false) {
  let mergedLocalSettings: Record<string, string> = {};
  
  try {
    const sysSaved = localStorage.getItem("system_appearance_settings");
    if (sysSaved) {
      mergedLocalSettings = { ...mergedLocalSettings, ...JSON.parse(sysSaved) };
    }
  } catch {}

  try {
    const storageKey = getActiveAppearanceKey(username);
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      mergedLocalSettings = { ...mergedLocalSettings, ...JSON.parse(saved) };
    }
  } catch {}

  const mergedSettings = isDbFallback
    ? { ...settings, ...mergedLocalSettings }
    : { ...mergedLocalSettings, ...settings };

  let styleEl = document.getElementById("dynamic-tag-colors");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "dynamic-tag-colors";
    document.head.appendChild(styleEl);
  }

  let cssRules = "";

  for (const cfg of STATUS_COLOR_CONFIGS) {
    const bg = mergedSettings[`status_color_${cfg.key}_bg`] || cfg.defaultBg;
    const txt = mergedSettings[`status_color_${cfg.key}_text`] || cfg.defaultText;
    const bdr = mergedSettings[`status_color_${cfg.key}_border`] || cfg.defaultBorder;

    const selectorStr = cfg.selectors.join(", ");
    cssRules += `
${selectorStr} {
  background-color: ${bg} !important;
  color: ${txt} !important;
  border-color: ${bdr} !important;
}
`;
  }

  styleEl.innerHTML = cssRules;
}
