import {
  createEvidence,
  createEvidenceAnswer,
  createFilter,
  createTableSource,
  validateEvidenceAnswer
} from "./evidence-engine.mjs";

export function buildSalesOrderEvidence({ vbeln, header = [], items = [], partners = [] }) {
  const evidence = [];
  if (header[0]) evidence.push(createEvidence(`VBAK has sales order ${header[0].VBELN}, sold-to ${header[0].KUNNR}, sales org ${header[0].VKORG}`, "VBAK"));
  else evidence.push(createEvidence(`VBAK has no row for sales order ${vbeln}`, "VBAK"));
  evidence.push(createEvidence(`VBAP returned ${items.length} item row(s) for sales order ${vbeln}`, "VBAP"));
  const shipTo = partners.filter((row) => row.PARVW === "WE");
  evidence.push(createEvidence(`VBPA returned ${shipTo.length} ship-to partner row(s) with PARVW WE`, "VBPA"));

  return finalize(createEvidenceAnswer({
    question: `Read sales order ${vbeln} with partners`,
    answer: header.length
      ? `Sales order ${vbeln} is evidenced with ${items.length} item(s) and ${shipTo.length} ship-to partner row(s).`
      : `Sales order ${vbeln} is not evidenced in VBAK.`,
    evidence,
    sources: [
      createTableSource("VBAK", { fields: ["VBELN", "AUART", "VKORG", "VTWEG", "SPART", "KUNNR", "ERDAT"] }),
      createTableSource("VBAP", { fields: ["VBELN", "POSNR", "MATNR", "KWMENG", "VRKME", "WERKS"] }),
      createTableSource("VBPA", { fields: ["VBELN", "POSNR", "PARVW", "KUNNR"] })
    ],
    filters: [createFilter("VBAK", { VBELN: vbeln }), createFilter("VBAP", { VBELN: vbeln }), createFilter("VBPA", { VBELN: vbeln })],
    confidence: header.length ? "high" : "low",
    limitations: ["Ship-to is identified from VBPA-PARVW = WE; item-level partners may differ from header-level partners."]
  }));
}

export function buildPurchaseOrderEvidence({ ebeln, header = [], items = [], history = [] }) {
  const evidence = [];
  if (header[0]) evidence.push(createEvidence(`EKKO has purchase order ${header[0].EBELN}, company code ${header[0].BUKRS}, vendor ${header[0].LIFNR}`, "EKKO"));
  else evidence.push(createEvidence(`EKKO has no row for purchase order ${ebeln}`, "EKKO"));
  evidence.push(createEvidence(`EKPO returned ${items.length} item row(s) for purchase order ${ebeln}`, "EKPO"));
  evidence.push(createEvidence(`EKBE returned ${history.length} purchase-order history row(s)`, "EKBE"));

  return finalize(createEvidenceAnswer({
    question: `Read purchase order ${ebeln} with history`,
    answer: header.length
      ? `Purchase order ${ebeln} is evidenced with ${items.length} item(s) and ${history.length} history row(s).`
      : `Purchase order ${ebeln} is not evidenced in EKKO.`,
    evidence,
    sources: [
      createTableSource("EKKO", { fields: ["EBELN", "BUKRS", "BSTYP", "BSART", "LIFNR", "EKORG", "BEDAT"] }),
      createTableSource("EKPO", { fields: ["EBELN", "EBELP", "MATNR", "WERKS", "LGORT", "MENGE", "MEINS"] }),
      createTableSource("EKBE", { fields: ["EBELN", "EBELP", "VGABE", "BEWTP", "BELNR", "GJAHR", "BUZEI", "MENGE", "BUDAT"] })
    ],
    filters: [createFilter("EKKO", { EBELN: ebeln }), createFilter("EKPO", { EBELN: ebeln }), createFilter("EKBE", { EBELN: ebeln })],
    confidence: header.length ? "high" : "low",
    limitations: ["EKBE is PO history; document-level interpretation may require MKPF/MSEG or FI document reads."]
  }));
}

export function buildInspectionLotEvidence({ prueflos, lots = [], decisions = [], characteristics = [], samples = [] }) {
  const evidence = [];
  if (lots[0]) evidence.push(createEvidence(`QALS has inspection lot ${lots[0].PRUEFLOS}, material ${lots[0].MATNR}, plant ${lots[0].WERK}, batch ${lots[0].CHARG || "blank"}`, "QALS"));
  else evidence.push(createEvidence(`QALS has no row for inspection lot ${prueflos}`, "QALS"));
  evidence.push(createEvidence(`QAVE returned ${decisions.length} usage-decision row(s)`, "QAVE"));
  evidence.push(createEvidence(`QAMR returned ${characteristics.length} inspection characteristic row(s)`, "QAMR"));
  evidence.push(createEvidence(`QASE returned ${samples.length} sample-result row(s)`, "QASE"));

  return finalize(createEvidenceAnswer({
    question: `Read QM inspection lot ${prueflos}`,
    answer: lots.length
      ? `Inspection lot ${prueflos} is evidenced with ${decisions.length} usage decision row(s), ${characteristics.length} characteristic row(s), and ${samples.length} sample row(s).`
      : `Inspection lot ${prueflos} is not evidenced in QALS.`,
    evidence,
    sources: [
      createTableSource("QALS", { fields: ["PRUEFLOS", "MATNR", "WERK", "CHARG", "ART", "ENSTEHDAT"] }),
      createTableSource("QAVE", { fields: ["PRUEFLOS", "KZART", "VCODEGRP", "VCODE", "VBEWERTUNG"] }),
      createTableSource("QAMR", { fields: ["PRUEFLOS", "VORGLFNR", "MERKNR", "SATZSTATUS"] }),
      createTableSource("QASE", { fields: ["PRUEFLOS", "VORGLFNR", "MERKNR", "PROBENR"] })
    ],
    filters: [createFilter("QALS", { PRUEFLOS: prueflos }), createFilter("QAVE", { PRUEFLOS: prueflos }), createFilter("QAMR", { PRUEFLOS: prueflos }), createFilter("QASE", { PRUEFLOS: prueflos })],
    confidence: lots.length ? "high" : "low",
    limitations: ["Result interpretation may require characteristic catalogs and code-group texts."]
  }));
}

export function buildFiDocumentEvidence({ bukrs, belnr, gjahr, header = [], items = [] }) {
  const evidence = [];
  if (header[0]) evidence.push(createEvidence(`BKPF has FI document ${header[0].BUKRS}/${header[0].BELNR}/${header[0].GJAHR}, type ${header[0].BLART}, posting date ${header[0].BUDAT}`, "BKPF"));
  else evidence.push(createEvidence(`BKPF has no row for FI document ${bukrs}/${belnr}/${gjahr}`, "BKPF"));
  evidence.push(createEvidence(`BSEG returned ${items.length} line-item row(s)`, "BSEG"));

  return finalize(createEvidenceAnswer({
    question: `Read FI document ${bukrs}/${belnr}/${gjahr}`,
    answer: header.length
      ? `FI document ${bukrs}/${belnr}/${gjahr} is evidenced with ${items.length} line item(s).`
      : `FI document ${bukrs}/${belnr}/${gjahr} is not evidenced in BKPF.`,
    evidence,
    sources: [
      createTableSource("BKPF", { fields: ["BUKRS", "BELNR", "GJAHR", "BLART", "BLDAT", "BUDAT", "WAERS", "XBLNR"] }),
      createTableSource("BSEG", { fields: ["BUKRS", "BELNR", "GJAHR", "BUZEI", "BSCHL", "HKONT", "KUNNR", "LIFNR", "DMBTR", "WRBTR", "SGTXT"] })
    ],
    filters: [createFilter("BKPF", { BUKRS: bukrs, BELNR: belnr, GJAHR: gjahr }), createFilter("BSEG", { BUKRS: bukrs, BELNR: belnr, GJAHR: gjahr })],
    confidence: header.length ? "high" : "low",
    limitations: ["Currency interpretation should use BKPF-WAERS and relevant BSEG amount fields."]
  }));
}

export function buildCoDocumentEvidence({ kokrs, belnr, header = [], items = [] }) {
  const evidence = [];
  if (header[0]) evidence.push(createEvidence(`COBK has CO document ${header[0].KOKRS}/${header[0].BELNR}, posting date ${header[0].BUDAT}`, "COBK"));
  else evidence.push(createEvidence(`COBK has no row for CO document ${kokrs}/${belnr}`, "COBK"));
  evidence.push(createEvidence(`COEP returned ${items.length} CO line-item row(s)`, "COEP"));

  return finalize(createEvidenceAnswer({
    question: `Read CO document ${kokrs}/${belnr}`,
    answer: header.length
      ? `CO document ${kokrs}/${belnr} is evidenced with ${items.length} line item(s).`
      : `CO document ${kokrs}/${belnr} is not evidenced in COBK.`,
    evidence,
    sources: [
      createTableSource("COBK", { fields: ["KOKRS", "BELNR", "GJAHR", "VRGNG", "BUDAT", "BLTXT"] }),
      createTableSource("COEP", { fields: ["KOKRS", "BELNR", "BUZEI", "OBJNR", "KSTAR", "WRTTP", "WTGBTR", "MEGBTR", "MEINH"] })
    ],
    filters: [createFilter("COBK", { KOKRS: kokrs, BELNR: belnr }), createFilter("COEP", { KOKRS: kokrs, BELNR: belnr })],
    confidence: header.length ? "high" : "low",
    limitations: ["Business interpretation may require master-data reads for cost element and CO object."]
  }));
}

export function buildBatchSalesTraceEvidence({ material, batch, movements = [], deliveries = [], deliveryItems = [], salesOrders = [], partners = [] }) {
  const evidence = [];
  evidence.push(createEvidence(`MSEG returned ${movements.length} movement row(s) for batch ${material}/${batch}`, "MSEG"));
  evidence.push(createEvidence(`LIKP returned ${deliveries.length} delivery header row(s)`, "LIKP"));
  evidence.push(createEvidence(`LIPS returned ${deliveryItems.length} delivery item row(s)`, "LIPS"));
  evidence.push(createEvidence(`VBAK returned ${salesOrders.length} sales order header row(s)`, "VBAK"));
  evidence.push(createEvidence(`VBPA returned ${partners.filter((row) => row.PARVW === "WE").length} ship-to row(s)`, "VBPA"));

  const gi = movements.filter((row) => String(row.BWART || "").trim() === "601");
  for (const row of gi.slice(0, 3)) {
    evidence.push(createEvidence(`MSEG goods issue BWART 601, MBLNR ${row.MBLNR}, delivery ${row.VBELN_IM || "blank"}, sales order ${row.KDAUF || "blank"}`, "MSEG"));
  }

  const answer = gi.length
    ? `Batch ${material}/${batch} has ${gi.length} evidenced goods-issue row(s) and ${deliveries.length} linked delivery header row(s).`
    : `No BWART 601 goods issue is evidenced for batch ${material}/${batch}.`;

  return finalize(createEvidenceAnswer({
    question: `Trace batch ${material}/${batch} to delivery and sales-order partners`,
    answer,
    evidence,
    sources: [
      createTableSource("MSEG"), createTableSource("LIKP"), createTableSource("LIPS"), createTableSource("VBAK"), createTableSource("VBAP"), createTableSource("VBPA")
    ],
    filters: [createFilter("MSEG", { MATNR: material, CHARG: batch })],
    confidence: gi.length && deliveries.length ? "high" : gi.length ? "medium" : "low",
    limitations: ["The workflow follows delivery and sales-order references present in movement/delivery items; unusual custom document flows may require VBFA."]
  }));
}

export function buildBatchProcurementQmFicoTraceEvidence({
  material,
  batch,
  movements = [],
  purchaseOrders = [],
  inspectionLots = [],
  fiHeaders = [],
  fiItems = [],
  orders = [],
  coItems = [],
  coItemsRead = false
}) {
  const poNumbers = unique(purchaseOrders.map((row) => row.EBELN));
  const fiDocuments = unique(fiHeaders.map((row) => `${row.BUKRS}/${row.BELNR}/${row.GJAHR}`));
  const coDocuments = unique(coItems.map((row) => `${row.KOKRS}/${row.BELNR}`));
  const evidence = [
    createEvidence(`MSEG returned ${movements.length} movement row(s) for batch ${material}/${batch}`, "MSEG"),
    createEvidence(`PO references evidenced from MSEG/EKKO: ${poNumbers.length ? poNumbers.join(", ") : "none"}`, "MSEG/EKKO"),
    createEvidence(`QALS returned ${inspectionLots.length} inspection lot row(s) for the material, plant, and batch`, "QALS"),
    createEvidence(`BKPF returned ${fiHeaders.length} FI header row(s) linked by AWTYP MKPF and AWKEY material document`, "BKPF"),
    createEvidence(`BSEG returned ${fiItems.length} FI line-item row(s) for linked FI documents`, "BSEG"),
    createEvidence(`AUFK returned ${orders.length} production/process order row(s) used as CO object bridges`, "AUFK"),
    createEvidence(coItemsRead
      ? `COEP returned ${coItems.length} CO line-item row(s) for linked order objects`
      : "COEP detail read was skipped because it is an explicit opt-in performance-sensitive step", "COEP")
  ];

  return finalize(createEvidenceAnswer({
    question: `Trace batch ${material}/${batch} to PO, inspection lot, and FI/CO data`,
    answer: `Batch ${material}/${batch}: ${poNumbers.length} linked PO(s), ${inspectionLots.length} inspection lot row(s), ${fiDocuments.length} linked FI document(s), and ${coDocuments.length} linked CO document(s) are evidenced.`,
    evidence,
    sources: [
      createTableSource("MSEG"), createTableSource("EKKO"), createTableSource("EKPO"), createTableSource("QALS"),
      createTableSource("BKPF"), createTableSource("BSEG"), createTableSource("AUFK"),
      ...(coItemsRead ? [createTableSource("COEP")] : [])
    ],
    filters: [createFilter("MSEG", { MATNR: material, CHARG: batch })],
    confidence: movements.length ? "high" : "low",
    limitations: [
      "PO is reported only when an EBELN reference is present in the batch movement trail.",
      "FI is linked from material documents through BKPF-AWTYP/AWKEY.",
      "CO is linked from production/process order object numbers; unrelated allocations require another business key.",
      ...(coItemsRead ? [] : ["COEP line-item detail was not read. Re-run with --include-co-items only when the additional SAP load is acceptable."])
    ]
  }));
}

function finalize(answer) {
  return { ...answer, validation: validateEvidenceAnswer(answer) };
}

function unique(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}
