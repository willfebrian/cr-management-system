import assert from "node:assert/strict";
import test from "node:test";
import { buildTransportObjectCatalog, fetchTransportObjectCatalog } from "../mcp/sap/transport-object-catalog.mjs";

const source = `
  APPEND_OBJECT_TYPE 'LIMU' 'REPS' TEXT-163.
* APPEND_OBJECT_TYPE 'R3OB' 'CHDO' TEXT-111.
  APPEND_OBJECT_TYPE 'R3TR' 'PROG' TEXT-097.
  APPEND_OBJECT_TYPE 'R3TR' 'FORM' TEXT-085.
`;
const textPool = { E_TAB_TEXTPOOL: [{ LANGU: "E", TEXTS: [
  { ID: "I", KEY: "163", ENTRY: "Report Source Code" },
  { ID: "I", KEY: "097", ENTRY: "Program" },
  { ID: "I", KEY: "085", ENTRY: "SAPscript Form" }
] }] };

test("combines CTS system texts with logical object descriptions, keeping system precedence", () => {
  const rows = buildTransportObjectCatalog({ source, textPool, language: "E",
    headers: [{ OBJECTNAME: "SSFO", OBJECTTYPE: "L" }, { OBJECTNAME: "FORM", OBJECTTYPE: "L" }, { OBJECTNAME: "ZZZZ", OBJECTTYPE: "L" }],
    texts: [{ OBJECTNAME: "SSFO", OBJECTTYPE: "L", LANGUAGE: "E", DDTEXT: "SAP Smart Form" },
      { OBJECTNAME: "FORM", OBJECTTYPE: "L", LANGUAGE: "E", DDTEXT: "Wrong override" },
      { OBJECTNAME: "GHOST", OBJECTTYPE: "L", LANGUAGE: "E", DDTEXT: "Orphan" }]
  });
  const labels = Object.fromEntries(rows.map(row => [`${row.pgmid} ${row.objectType}`, row.description]));
  assert.deepEqual(labels, { "LIMU REPS": "Report Source Code", "R3TR FORM": "SAPscript Form", "R3TR PROG": "Program", "R3TR SSFO": "SAP Smart Form", "R3TR ZZZZ": "" });
});

test("rejects incomplete text reads instead of replacing a verified catalog with guessed labels", () => {
  assert.throws(() => buildTransportObjectCatalog({ source, textPool: { E_TAB_TEXTPOOL: [] }, headers: [], texts: [], language: "E" }), /Missing CTS text/);
});

test("reads and normalizes the RFC source and text pool into pair descriptions", async () => {
  const gateway = { async call({ rfcName, params }) {
    if (rfcName === "ZRFC_READ_REPORT") return { QTAB: source.split("\n").map(LINE => ({ LINE })) };
    if (rfcName === "SIW_RFC_READ_TEXTPOOL") return textPool;
    return { DELIMITER: "|", FIELDS: params.FIELDS, DATA: [{ WA: params.QUERY_TABLE === "OBJH"
      ? "SSST|L" : "SSST|L|E|SAP Smart Style" }] };
  } };
  const rows = await fetchTransportObjectCatalog(gateway);
  assert.equal(rows.find(row => row.pgmid === "LIMU" && row.objectType === "REPS")?.description, "Report Source Code");
  assert.equal(rows.find(row => row.pgmid === "R3TR" && row.objectType === "SSST")?.description, "SAP Smart Style");
});
