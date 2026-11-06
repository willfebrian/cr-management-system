
export async function readMonitoringTable(tools, options) {
  const monitored = new Set(["E070", "E070CREATE", "E07T", "E071", "E071K", "TPALOG"]);
  if (!monitored.has(options.tableName)) return tools.sap_table_read_limited_normalized(options);
  const rowCount = Number(options.rowCount || 500);
  if (!Number.isInteger(rowCount) || rowCount < 1 || rowCount > 5000) throw new Error("Monitoring page size must be between 1 and 5000.");
  const rows = [];
  let result;
  for (let page = 0; page < 10000; page += 1) {
    result = await tools.sap_table_read_limited_normalized({ ...options, rowCount, rowSkip: rows.length });
    rows.push(...result.rows);
    if (result.rows.length < rowCount) return { ...result, rows, rowCount: rows.length };
  }
  throw new Error("Monitoring read exceeded its page limit; select a shorter period.");
}
