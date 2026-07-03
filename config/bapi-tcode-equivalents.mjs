export const BAPI_TCODE_EQUIVALENTS = {
  BAPI_GOODSMVT_CREATE: {
    process: "Goods movement: goods receipt, goods issue, transfer posting, scrap movement",
    tcodes: ["MIGO", "MB31", "MB1A", "MB1B"],
    confidence: "medium",
    note: "BAPI represents the goods movement process; it does not execute these tcodes directly."
  },
  BAPI_GOODSMVT_CANCEL: {
    process: "Cancel/reverse material document",
    tcodes: ["MIGO", "MBST"],
    confidence: "medium",
    note: "BAPI represents material document cancellation; tcode equivalence is process-level."
  },
  BAPI_PROCORD_RELEASE: {
    process: "Release process order",
    tcodes: ["COR2", "COR5"],
    confidence: "medium",
    note: "Release can be performed from process-order transactions; exact tcode depends on user flow."
  },
  BAPI_PROCORDCONF_CREATE_TT: {
    process: "Create process order confirmation",
    tcodes: ["COR6N", "CORK"],
    confidence: "medium",
    note: "BAPI creates confirmation data; tcode equivalence is process-level."
  },
  BAPI_PROCORDCONF_CANCEL: {
    process: "Cancel process order confirmation",
    tcodes: ["CORS"],
    confidence: "medium",
    note: "BAPI represents confirmation cancellation; explicit CALL TRANSACTION is stronger evidence when present."
  },
  BAPI_PROCORD_COMPLETE_TECH: {
    process: "Technically complete process order",
    tcodes: ["COR2"],
    confidence: "medium",
    note: "TECO is typically available from process-order change flow."
  },
  BAPI_BATCH_CREATE: {
    process: "Create batch master",
    tcodes: ["MSC1N"],
    confidence: "medium",
    note: "BAPI represents batch creation; tcode equivalence is process-level."
  },
  BAPI_OBJCL_CHANGE: {
    process: "Change object classification or batch characteristics",
    tcodes: ["CL20N", "MSC2N"],
    confidence: "medium",
    note: "For batch classification, MSC2N is a common business-facing equivalent."
  },
  BAPI_CLASS_GET_CHARACTERISTICS: {
    process: "Read class and characteristic metadata",
    tcodes: ["CL20N"],
    confidence: "low",
    note: "Read-only classification API. Use as CA-CL process evidence; do not infer QM core module from this BAPI alone."
  },
  BAPI_HU_PACK: {
    process: "Pack handling unit",
    tcodes: ["HU02"],
    confidence: "medium",
    note: "BAPI represents HU packing; exact business flow may be custom."
  },
  BAPI_HU_UNPACK: {
    process: "Unpack handling unit",
    tcodes: ["HU02"],
    confidence: "medium",
    note: "BAPI represents HU unpacking; exact business flow may be custom."
  },
  BAPI_HU_DELETE: {
    process: "Delete handling unit",
    tcodes: ["HU02"],
    confidence: "medium",
    note: "BAPI represents HU maintenance; exact business flow may be custom."
  },
  BAPI_HU_GETLIST: {
    process: "Read handling unit list",
    tcodes: ["HU02"],
    confidence: "low",
    note: "Read/list HU API. Use as LO-HU supporting evidence."
  },
  BAPI_HU_CHANGE_HEADER: {
    process: "Change handling unit header",
    tcodes: ["HU02"],
    confidence: "medium",
    note: "BAPI represents HU header maintenance; exact business flow may be custom."
  },
  BAPI_SALESORDER_CHANGE: {
    process: "Change sales order",
    tcodes: ["VA02"],
    confidence: "medium",
    note: "BAPI changes sales-order data; VA02 is the common business-facing equivalent."
  },
  BAPI_PR_CREATE: {
    process: "Create purchase requisition",
    tcodes: ["ME51N"],
    confidence: "medium",
    note: "BAPI creates a purchase requisition; ME51N is the common business-facing equivalent."
  },
  BAPI_PR_CHANGE: {
    process: "Change purchase requisition",
    tcodes: ["ME52N"],
    confidence: "medium",
    note: "BAPI changes a purchase requisition; ME52N is the common business-facing equivalent."
  },
  BAPI_REQUISITION_RELEASE: {
    process: "Release purchase requisition",
    tcodes: ["ME54N", "ME55"],
    confidence: "medium",
    note: "BAPI represents PR release; exact tcode depends on individual or collective release flow."
  },
  BAPI_REQUISITION_RESET_RELEASE: {
    process: "Reset purchase requisition release",
    tcodes: ["ME54N"],
    confidence: "medium",
    note: "BAPI resets PR release status; tcode equivalence is process-level."
  },
  BAPI_PO_CREATE1: {
    process: "Create purchase order",
    tcodes: ["ME21N"],
    confidence: "medium",
    note: "BAPI creates a purchase order; ME21N is the common business-facing equivalent."
  },
  BAPI_PO_CHANGE: {
    process: "Change purchase order",
    tcodes: ["ME22N"],
    confidence: "medium",
    note: "BAPI changes a purchase order; ME22N is the common business-facing equivalent."
  },
  BAPI_PO_RELEASE: {
    process: "Release purchase order",
    tcodes: ["ME29N", "ME28"],
    confidence: "medium",
    note: "BAPI represents PO release; exact tcode depends on individual or collective release flow."
  },
  BAPI_PO_RESET_RELEASE: {
    process: "Reset purchase order release",
    tcodes: ["ME29N"],
    confidence: "medium",
    note: "BAPI resets PO release status; tcode equivalence is process-level."
  },
  BAPI_TRANSACTION_COMMIT: {
    process: "Commit logical unit of work",
    tcodes: [],
    confidence: "not_applicable",
    note: "Technical transaction control, not a business tcode."
  },
  BAPI_TRANSACTION_ROLLBACK: {
    process: "Rollback logical unit of work",
    tcodes: [],
    confidence: "not_applicable",
    note: "Technical transaction control, not a business tcode."
  }
};

export function getBapiTcodeEquivalent(bapiName) {
  return BAPI_TCODE_EQUIVALENTS[String(bapiName || "").toUpperCase()] || {
    process: "Unknown or uncatalogued standard BAPI process",
    tcodes: [],
    confidence: "unknown",
    note: "No maintained BAPI-to-tcode process mapping yet."
  };
}
