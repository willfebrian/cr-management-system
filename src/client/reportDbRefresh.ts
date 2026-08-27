export function startReportDbRefresh(refresh: () => void, intervalMs: number) {
  refresh();
  const interval = globalThis.setInterval(refresh, intervalMs);
  return () => globalThis.clearInterval(interval);
}
