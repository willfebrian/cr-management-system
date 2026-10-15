type DiagnosticObject = {
  pgmid: string;
  objectType: string;
  objectName: string;
  status: string;
  message: string;
};
export function reconcileInactiveDiagnostics<T extends { status: string; message: string; objects: DiagnosticObject[] }>(
  task: T,
  describeType?: (pgmid: string, type: string) => string
): T;
