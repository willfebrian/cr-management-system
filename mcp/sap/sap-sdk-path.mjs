export function ensureSapNwRfcSdkOnPath(env = process.env) {
  const sdkHome = env.SAPNWRFC_HOME || "C:\\nwrfcsdk";
  const sdkLib = `${sdkHome.replace(/[\\/]$/, "")}\\lib`;
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") || "PATH";
  const currentPath = String(env[pathKey] || "");

  if (!currentPath.toLowerCase().includes(sdkLib.toLowerCase())) {
    env[pathKey] = `${sdkLib};${currentPath}`;
  }

  return sdkLib;
}

