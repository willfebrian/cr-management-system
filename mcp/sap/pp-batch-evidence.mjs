import {
  createEvidence,
  createEvidenceAnswer,
  createFilter,
  createTableSource,
  validateEvidenceAnswer
} from "./evidence-engine.mjs";

export function buildProducedBatchEvidence({ aufnr, orderHeader = [], orderItems = [], materialMovements = [], producedBatches = [] }) {
  const evidence = [];
  if (orderHeader.length) {
    const row = orderHeader[0];
    evidence.push(createEvidence(`AUFK has AUFNR ${row.AUFNR}, AUART ${row.AUART}, WERKS ${row.WERKS}`, "AUFK"));
  } else {
    evidence.push(createEvidence(`AUFK has no row for AUFNR ${aufnr}`, "AUFK", { confidence: "high" }));
  }

  if (orderItems.length) {
    for (const row of orderItems.slice(0, 3)) {
      evidence.push(createEvidence(`AFPO item ${row.POSNR || ""} has MATNR ${row.MATNR}, DWERK ${row.DWERK}, CHARG ${row.CHARG || "blank"}, WEMNG ${row.WEMNG}`, "AFPO"));
    }
  } else {
    evidence.push(createEvidence(`AFPO has no row for AUFNR ${aufnr}`, "AFPO", { confidence: "high" }));
  }

  if (materialMovements.length) {
    const receipt = materialMovements.find((row) => ["101", "131", "531"].includes(String(row.BWART || "").trim()) && String(row.CHARG || "").trim());
    if (receipt) {
      evidence.push(createEvidence(`MSEG production receipt candidate BWART ${receipt.BWART}, MBLNR ${receipt.MBLNR}, MJAHR ${receipt.MJAHR}, ZEILE ${receipt.ZEILE}, CHARG ${receipt.CHARG}`, "MSEG"));
    } else {
      evidence.push(createEvidence(`MSEG has ${materialMovements.length} rows but no production receipt candidate with batch`, "MSEG", { confidence: "medium" }));
    }
  } else {
    evidence.push(createEvidence(`MSEG has no rows for AUFNR ${aufnr}`, "MSEG", { confidence: "high" }));
  }

  const answer = producedBatches.length
    ? `Found ${producedBatches.length} produced batch candidate(s) for PRO ${aufnr}.`
    : `No produced batch is evidenced for PRO ${aufnr} in the checked movement data.`;

  return finalize(createEvidenceAnswer({
    question: `Find produced batch for PRO/process order ${aufnr}`,
    answer,
    evidence,
    sources: [
      createTableSource("AUFK", { fields: ["AUFNR", "AUART", "WERKS", "OBJNR", "ERDAT"] }),
      createTableSource("AFPO", { fields: ["AUFNR", "POSNR", "MATNR", "DWERK", "CHARG", "PSMNG", "WEMNG"] }),
      createTableSource("MSEG", { fields: ["MBLNR", "MJAHR", "ZEILE", "BWART", "MATNR", "WERKS", "CHARG", "AUFNR", "MENGE", "MEINS"] })
    ],
    filters: [
      createFilter("AUFK", { AUFNR: aufnr }),
      createFilter("AFPO", { AUFNR: aufnr }),
      createFilter("MSEG", { AUFNR: aufnr })
    ],
    confidence: producedBatches.length || (!materialMovements.length && orderHeader.length && orderItems.length) ? "high" : "medium",
    limitations: ["Produced batch detection is based on AFPO-CHARG and MSEG production receipt movement candidates."]
  }));
}

export function buildTraceProByBatchEvidence({ material, batch, batchMaster = [], movements = [], likelyProductionReceipts = [], orders = [] }) {
  const evidence = [];
  if (batchMaster.length) {
    evidence.push(createEvidence(`MCH1 has batch ${material}/${batch} with CUOBJ_BM ${batchMaster[0].CUOBJ_BM || "blank"}`, "MCH1"));
  } else {
    evidence.push(createEvidence(`MCH1 has no row for batch ${material}/${batch}`, "MCH1", { confidence: "high" }));
  }

  if (likelyProductionReceipts.length) {
    for (const row of likelyProductionReceipts.slice(0, 3)) {
      evidence.push(createEvidence(`MSEG production receipt BWART ${row.BWART}, MBLNR ${row.MBLNR}, MJAHR ${row.MJAHR}, ZEILE ${row.ZEILE}, AUFNR ${row.AUFNR}`, "MSEG"));
    }
  } else if (movements.length) {
    evidence.push(createEvidence(`MSEG has ${movements.length} rows but no production receipt candidate with AUFNR`, "MSEG", { confidence: "medium" }));
  } else {
    evidence.push(createEvidence(`MSEG has no rows for batch ${material}/${batch}`, "MSEG", { confidence: "high" }));
  }

  for (const order of orders.slice(0, 3)) {
    const header = order.header?.[0];
    const item = order.items?.[0];
    if (header) evidence.push(createEvidence(`AUFK confirms AUFNR ${header.AUFNR}, AUART ${header.AUART}, WERKS ${header.WERKS}`, "AUFK"));
    if (item) evidence.push(createEvidence(`AFPO confirms AUFNR ${item.AUFNR}, MATNR ${item.MATNR}, DWERK ${item.DWERK}, PSMNG ${item.PSMNG}, WEMNG ${item.WEMNG}`, "AFPO"));
  }

  const orderNumbers = [...new Set(likelyProductionReceipts.map((row) => row.AUFNR).filter(Boolean))];
  const answer = orderNumbers.length
    ? `Batch ${material}/${batch} is evidenced from PRO ${orderNumbers.join(", ")}.`
    : `No PRO origin is evidenced for batch ${material}/${batch} in the checked movement data.`;

  return finalize(createEvidenceAnswer({
    question: `Trace PRO/process order for batch ${material} / ${batch}`,
    answer,
    evidence,
    sources: [
      createTableSource("MCH1", { fields: ["MATNR", "CHARG", "ERSDA", "VFDAT", "HSDAT", "CUOBJ_BM"] }),
      createTableSource("MSEG", { fields: ["MBLNR", "MJAHR", "ZEILE", "BWART", "MATNR", "WERKS", "CHARG", "AUFNR", "MENGE", "MEINS"] }),
      createTableSource("AUFK", { fields: ["AUFNR", "AUART", "WERKS", "OBJNR", "ERDAT"] }),
      createTableSource("AFPO", { fields: ["AUFNR", "POSNR", "MATNR", "DWERK", "CHARG", "PSMNG", "WEMNG"] })
    ],
    filters: [
      createFilter("MCH1", { MATNR: material, CHARG: batch }),
      createFilter("MSEG", { MATNR: material, CHARG: batch })
    ],
    confidence: orderNumbers.length ? "high" : "low",
    limitations: ["PRO origin is inferred from MSEG production receipt candidates with AUFNR."]
  }));
}

export function buildBatchStockEvidence({ material, batch, rows = [] }) {
  const evidence = rows.length
    ? rows.slice(0, 5).map((row) => createEvidence(`MCHB stock row WERKS ${row.WERKS}, LGORT ${row.LGORT}, CLABS ${row.CLABS}, CINSM ${row.CINSM}, CSPEM ${row.CSPEM}`, "MCHB"))
    : [createEvidence(`MCHB has no current stock rows for batch ${material}/${batch}`, "MCHB")];

  return finalize(createEvidenceAnswer({
    question: `Read current batch stock position for ${material} / ${batch}`,
    answer: rows.length
      ? `Found ${rows.length} current stock row(s) for batch ${material}/${batch}.`
      : `No current stock row is evidenced for batch ${material}/${batch} in MCHB.`,
    evidence,
    sources: [createTableSource("MCHB", { fields: ["MATNR", "WERKS", "LGORT", "CHARG", "CLABS", "CUMLM", "CINSM", "CEINM", "CSPEM", "CRETM"] })],
    filters: [createFilter("MCHB", { MATNR: material, CHARG: batch })],
    confidence: "high",
    limitations: ["MCHB is current batch stock only; historical movement position must be checked in MSEG."]
  }));
}

export function buildBatchMovementEvidence({ material, batch, rows = [] }) {
  const sortedRows = [...rows].sort((a, b) => String(a.BUDAT_MKPF || "").localeCompare(String(b.BUDAT_MKPF || "")) || String(a.MBLNR || "").localeCompare(String(b.MBLNR || "")));
  const finalMovement = sortedRows.at(-1);
  const evidence = [];

  if (sortedRows.length) {
    const first = sortedRows[0];
    evidence.push(createEvidence(`First MSEG movement BWART ${first.BWART}, BUDAT ${first.BUDAT_MKPF}, MBLNR ${first.MBLNR}, LGORT ${first.LGORT}, AUFNR ${first.AUFNR || "blank"}`, "MSEG"));
    evidence.push(createEvidence(`Final MSEG movement BWART ${finalMovement.BWART}, BUDAT ${finalMovement.BUDAT_MKPF}, MBLNR ${finalMovement.MBLNR}, LGORT ${finalMovement.LGORT}, VBELN_IM ${finalMovement.VBELN_IM || "blank"}`, "MSEG"));
  } else {
    evidence.push(createEvidence(`MSEG has no movement rows for batch ${material}/${batch}`, "MSEG"));
  }

  return finalize(createEvidenceAnswer({
    question: `Read detailed movement chain for batch ${material} / ${batch}`,
    answer: finalMovement
      ? `Final evidenced movement for batch ${material}/${batch}: BWART ${finalMovement.BWART}, MBLNR ${finalMovement.MBLNR}, LGORT ${finalMovement.LGORT || "blank"}.`
      : `No movement chain is evidenced for batch ${material}/${batch}.`,
    evidence,
    sources: [createTableSource("MSEG", { fields: ["MBLNR", "MJAHR", "ZEILE", "BUDAT_MKPF", "BWART", "MATNR", "WERKS", "LGORT", "UMLGO", "CHARG", "AUFNR", "KDAUF", "KDPOS", "VBELN_IM", "VBELP_IM", "MENGE", "MEINS"] })],
    filters: [createFilter("MSEG", { MATNR: material, CHARG: batch })],
    confidence: rows.length ? "high" : "low",
    limitations: ["Final position from MSEG is movement-history based; current stock still requires MCHB."]
  }));
}

function finalize(answer) {
  return {
    ...answer,
    validation: validateEvidenceAnswer(answer)
  };
}
