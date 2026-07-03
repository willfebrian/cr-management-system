export function requireNonEmptyFields(input, requiredFields) {
  const missing = [];
  for (const field of requiredFields) {
    if (!String(input?.[field] ?? "").trim()) missing.push(field);
  }

  return {
    ok: missing.length === 0,
    missing,
    message: missing.length
      ? `Missing required input: ${missing.join(", ")}.`
      : null
  };
}

export function requireMaterialBatch({ material, batch }) {
  return requireNonEmptyFields({ material, batch }, ["material", "batch"]);
}

export function requireOrderNumber({ aufnr }) {
  return requireNonEmptyFields({ aufnr }, ["aufnr"]);
}

export function requireSalesOrder({ vbeln }) {
  return requireNonEmptyFields({ vbeln }, ["vbeln"]);
}

export function requirePurchaseOrder({ ebeln }) {
  return requireNonEmptyFields({ ebeln }, ["ebeln"]);
}

export function requireInspectionLot({ prueflos }) {
  return requireNonEmptyFields({ prueflos }, ["prueflos"]);
}

export function requireFiDocument({ bukrs, belnr, gjahr }) {
  return requireNonEmptyFields({ bukrs, belnr, gjahr }, ["bukrs", "belnr", "gjahr"]);
}

export function requireCoDocument({ kokrs, belnr }) {
  return requireNonEmptyFields({ kokrs, belnr }, ["kokrs", "belnr"]);
}
