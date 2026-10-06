import catalog from "./transportObjectCatalog.json";

export const transportProgramIdDescriptions: Record<string, string> = {
  CORR: "Correction and transport entry",
  LIMU: "Repository sub-object",
  R3TR: "Repository object"
};

export const transportObjectTypeDescriptions: Record<string, string> = {
  ADIR: "Object directory entry",
  AUTH: "Authorization object",
  BSVS: "Status schema",
  CDAT: "Customizing data",
  CINS: "BC set content",
  CLAS: "Class",
  CINC: "Class include",
  CLSD: "Class definition",
  CMOD: "Enhancement project",
  CORR: "Correction",
  CPUB: "Class public section",
  CPRI: "Class private section",
  CPRO: "Class protected section",
  CUAD: "GUI status",
  DEVC: "Package",
  DOCU: "Documentation",
  DOMA: "Domain",
  DOMD: "Domain definition",
  DTEL: "Data element",
  DTED: "Data element definition",
  DYNP: "Screen",
  ENHO: "Enhancement implementation",
  ENHS: "Enhancement spot",
  FUNC: "Function module",
  FUGR: "Function group",
  FUGT: "Function group text",
  INDX: "Technical index object",
  INTF: "Interface",
  MESS: "Message",
  METH: "Class method",
  MSAG: "Message class",
  NOTE: "SAP Note",
  PRIN: "Print object",
  PROG: "Program",
  RELE: "Release information",
  REPS: "Report Source Code",
  REPT: "Program text",
  SBXL: "Business object extension",
  SBXP: "Business object extension part",
  SCVI: "View cluster",
  SHLP: "Search help",
  SPDV: "Standard variant",
  SSFO: "SAP Smart Form",
  SSST: "SAP Smart Style",
  STVI: "View cluster object",
  SUSC: "Authorization field",
  SUSO: "Authorization object",
  SXCI: "Customer enhancement implementation",
  TABD: "Table contents",
  TABL: "Table",
  TABT: "Table text",
  TABU: "Table contents",
  TDAT: "Table technical settings",
  TEXT: "Text object",
  TOBJ: "Transport object",
  TRAN: "Transaction",
  TTYP: "Table type",
  VARX: "Variant",
  VDAT: "View data",
  XSLT: "XSLT transformation",
  VIEW: "View"
};

export const transportObjectPairLabels: Record<string, string> = Object.fromEntries(
  catalog.rows.filter(row => row.description).map(row => [`${row.pgmid} ${row.objectType}`, row.description])
);

export function transportObjectLabel(pgmid?: string, objectType?: string, savedLabel?: string) {
  const normalizedPgmid = String(pgmid || "").trim().toUpperCase();
  const normalizedObjectType = String(objectType || "").trim().toUpperCase();
  const key = `${normalizedPgmid} ${normalizedObjectType}`.trim();
  if (transportObjectPairLabels[key]) return transportObjectPairLabels[key];
  if (savedLabel?.trim() && savedLabel.trim() !== normalizedObjectType) return savedLabel.trim();
  if (!normalizedPgmid && transportObjectTypeDescriptions[normalizedObjectType]) return transportObjectTypeDescriptions[normalizedObjectType];
  return key ? `SAP transport object (${key})` : "SAP transport object";
}
