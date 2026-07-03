export const STANDARD_FUNCTION_REFERENCE = {
  QMSP_MATERIAL_BATCH_CLASS_READ: {
    applicationComponent: "CA-CL",
    coreModuleHint: "",
    processArea: "Batch/material characteristic read",
    standardTcodeEquivalent: ["MSC3N", "CL20N"],
    classificationStrength: "read_only_classification",
    notes: "Reads batch/material characteristic data. Do not infer QM core module from this function alone."
  },
  BAPI_CLASS_GET_CHARACTERISTICS: {
    applicationComponent: "CA-CL",
    coreModuleHint: "",
    processArea: "Class/characteristic metadata read",
    standardTcodeEquivalent: ["CL20N"],
    classificationStrength: "read_only_classification",
    notes: "Classification API. Do not infer QM core module from this BAPI alone."
  },
  QC01_BATCH_VALUES_READ: {
    applicationComponent: "LO-BM",
    coreModuleHint: "MM",
    processArea: "Batch classification value read",
    standardTcodeEquivalent: ["MSC3N"],
    classificationStrength: "weak",
    notes: "Batch characteristic read helper. Treat as batch/material support unless stronger QM evidence exists."
  },
  BAPI_GOODSMVT_CREATE: {
    applicationComponent: "MM-IM",
    coreModuleHint: "MM",
    processArea: "Goods movement",
    standardTcodeEquivalent: ["MIGO", "MB31", "MB1A", "MB1B"],
    classificationStrength: "strong",
    notes: "Business BAPI for inventory goods movement."
  },
  BAPI_PROCORD_CREATE: {
    applicationComponent: "PP-PI-POR",
    coreModuleHint: "PP",
    processArea: "Process order creation",
    standardTcodeEquivalent: ["COR1"],
    classificationStrength: "strong",
    notes: "Business BAPI for process-order creation. Treat as strong PP evidence."
  },
  BAPI_PROCORD_RELEASE: {
    applicationComponent: "PP-PI-POR",
    coreModuleHint: "PP",
    processArea: "Process order release",
    standardTcodeEquivalent: ["COR2", "COR5"],
    classificationStrength: "strong",
    notes: "Business BAPI for process-order release. Treat as strong PP evidence."
  },
  BAPI_PROCORDCONF_CREATE_TT: {
    applicationComponent: "PP-PI-POR",
    coreModuleHint: "PP",
    processArea: "Process order confirmation",
    standardTcodeEquivalent: ["COR6N", "CORK"],
    classificationStrength: "strong",
    notes: "Business BAPI for process-order confirmation. Treat as strong PP evidence."
  },
  BAPI_PROCORDCONF_CANCEL: {
    applicationComponent: "PP-PI-POR",
    coreModuleHint: "PP",
    processArea: "Process order confirmation cancellation",
    standardTcodeEquivalent: ["CORS"],
    classificationStrength: "strong",
    notes: "Business BAPI for process-order confirmation cancellation. Treat as strong PP evidence."
  },
  BAPI_PROCORD_COMPLETE_TECH: {
    applicationComponent: "PP-PI-POR",
    coreModuleHint: "PP",
    processArea: "Process order technical completion",
    standardTcodeEquivalent: ["COR2"],
    classificationStrength: "strong",
    notes: "Business BAPI for process-order TECO. Treat as strong PP evidence."
  },
  HU_CREATE_GOODS_MOVEMENT: {
    applicationComponent: "LO-HU",
    coreModuleHint: "MM",
    processArea: "Handling-unit goods movement",
    standardTcodeEquivalent: ["HU02", "MIGO"],
    classificationStrength: "medium",
    notes: "HU process with inventory movement context."
  },
  BAPI_HU_PACK: {
    applicationComponent: "LO-HU",
    coreModuleHint: "",
    processArea: "Handling-unit packing",
    standardTcodeEquivalent: ["HU02"],
    classificationStrength: "supporting_component",
    notes: "HU packing process. Use supporting component LO-HU; core module needs table/process evidence."
  },
  BAPI_HU_UNPACK: {
    applicationComponent: "LO-HU",
    coreModuleHint: "",
    processArea: "Handling-unit unpacking",
    standardTcodeEquivalent: ["HU02"],
    classificationStrength: "supporting_component",
    notes: "HU unpacking process. Use supporting component LO-HU; core module needs table/process evidence."
  },
  BAPI_HU_DELETE: {
    applicationComponent: "LO-HU",
    coreModuleHint: "",
    processArea: "Handling-unit deletion",
    standardTcodeEquivalent: ["HU02"],
    classificationStrength: "supporting_component",
    notes: "HU maintenance process. Use supporting component LO-HU; core module needs table/process evidence."
  },
  BAPI_HU_GETLIST: {
    applicationComponent: "LO-HU",
    coreModuleHint: "",
    processArea: "Handling-unit list/read",
    standardTcodeEquivalent: ["HU02"],
    classificationStrength: "supporting_component",
    notes: "HU read/list helper. Not enough to infer a core module alone."
  },
  BAPI_HU_CHANGE_HEADER: {
    applicationComponent: "LO-HU",
    coreModuleHint: "",
    processArea: "Handling-unit header change",
    standardTcodeEquivalent: ["HU02"],
    classificationStrength: "supporting_component",
    notes: "HU maintenance process. Use supporting component LO-HU; core module needs table/process evidence."
  },
  SD_PARTNER_READ: {
    applicationComponent: "SD-BF-PD",
    coreModuleHint: "SD",
    processArea: "SD partner read",
    standardTcodeEquivalent: ["VA03"],
    classificationStrength: "medium",
    notes: "Reads SD partner context."
  },
  VC_I_GET_CONFIGURATION: {
    applicationComponent: "LO-VC",
    coreModuleHint: "",
    processArea: "Variant configuration read",
    standardTcodeEquivalent: [],
    classificationStrength: "supporting_component",
    notes: "Variant configuration support. Do not infer a core module alone."
  }
};

export function getStandardFunctionReference(functionName) {
  return STANDARD_FUNCTION_REFERENCE[String(functionName || "").toUpperCase()] || null;
}
