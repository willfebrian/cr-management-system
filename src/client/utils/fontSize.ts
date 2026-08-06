export function getActiveAppearanceKey(username?: string): string {
  if (username && username.trim()) {
    return `user_appearance_settings_${username.trim().toLowerCase()}`;
  }
  try {
    const lastUser = localStorage.getItem("last_auth_username");
    if (lastUser && lastUser.trim()) {
      return `user_appearance_settings_${lastUser.trim().toLowerCase()}`;
    }
    const keys = Object.keys(localStorage);
    const matchedKey = keys.find((k) => k.startsWith("user_appearance_settings_"));
    if (matchedKey) return matchedKey;
  } catch {}
  return "user_appearance_settings";
}

export function applyCustomFontSize(settings: Record<string, string> = {}, username?: string, isDbFallback: boolean = false) {
  const storageKey = getActiveAppearanceKey(username);
  
  let mergedLocalSettings: Record<string, string> = {};
  
  try {
    const sysSaved = localStorage.getItem("system_appearance_settings");
    if (sysSaved) {
      mergedLocalSettings = { ...mergedLocalSettings, ...JSON.parse(sysSaved) };
    }
  } catch {}

  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      mergedLocalSettings = { ...mergedLocalSettings, ...JSON.parse(saved) };
    }
  } catch {}

  // If it's a db fallback (initial load), mergedLocalSettings (user's explicit preference + system cache) overrides dbSettings
  // If it's NOT a fallback (live slider drag), settings (slider value) overrides mergedLocalSettings.
  const targetSize = isDbFallback 
    ? (mergedLocalSettings.app_font_size || settings.app_font_size || "14")
    : (settings.app_font_size || mergedLocalSettings.app_font_size || "14");
    
  const numSize = parseInt(targetSize, 10) || 14;

  let styleEl = document.getElementById("dynamic-font-size");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "dynamic-font-size";
    document.head.appendChild(styleEl);
  }

  const scaleRatio = (numSize / 14).toFixed(4);
  const inverseScale = (14 / numSize).toFixed(4);

  styleEl.innerHTML = `
    :root {
      --app-font-size: ${numSize}px;
      --app-font-scale: ${scaleRatio};
    }

    .sidebar-nav button,
    .sidebar-brand span,
    .sidebar-theme-toggle span,
    .sidebar-user {
      font-size: ${numSize}px !important;
    }

    .workspace, .auth-screen {
      zoom: ${scaleRatio};
      ${numSize > 14 
        ? `height: calc(100vh * ${inverseScale}) !important; min-height: calc(100vh * ${inverseScale}) !important;` 
        : `min-height: 100% !important; height: 100% !important;`}
    }

    .ui-modal-content, .user-dialog {
      zoom: ${scaleRatio};
    }
  `;
}
