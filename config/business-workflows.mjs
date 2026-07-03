export const businessWorkflows = [
  {
    id: "find_batch_by_pro",
    description: "Find produced batch candidates from a production/process order.",
    agents: ["sap_functional_agent"],
    keywords: ["batch", "pro", "production order", "process order", "aufnr"],
    requiredInputs: ["aufnr"],
    command: "sap:find-batch-by-pro",
    scriptPath: "scripts/find-batch-by-pro.mjs"
  },
  {
    id: "trace_pro_by_batch",
    description: "Trace a material batch back to its production/process order.",
    agents: ["sap_functional_agent"],
    keywords: ["batch", "pro", "production order", "process order", "trace"],
    requiredInputs: ["material", "batch"],
    command: "sap:trace-pro-by-batch",
    scriptPath: "scripts/trace-pro-by-batch.mjs"
  },
  {
    id: "find_batch_characteristics",
    description: "Read characteristic assignments for a material batch.",
    agents: ["sap_functional_agent"],
    keywords: ["batch", "characteristic", "karakteristik", "classification", "klasifikasi"],
    requiredInputs: ["material", "batch"],
    command: "sap:find-batch-characteristics",
    scriptPath: "scripts/find-batch-characteristics.mjs"
  },
  {
    id: "trace_batch_to_sales",
    description: "Trace a material batch to delivery, sales order, and partners.",
    agents: ["sap_functional_agent"],
    keywords: ["batch", "delivery", "sales order", "ship-to", "sold-to", "customer"],
    requiredInputs: ["material", "batch"],
    command: "sap:trace-batch-to-sales",
    scriptPath: "scripts/trace-batch-to-sales.mjs"
  },
  {
    id: "trace_batch_to_po_qm_fico",
    description: "Trace a material batch to PO references, inspection lots, FI documents, and the CO bridge.",
    agents: ["sap_functional_agent"],
    keywords: ["batch", "po", "purchase order", "inspection lot", "quality", "qm", "fi", "fico", "co", "accounting"],
    requiredInputs: ["material", "batch"],
    command: "sap:trace-batch-to-po-qm-fico",
    scriptPath: "scripts/trace-batch-to-po-qm-fico.mjs",
    optionalFlags: [
      {
        name: "includeCoItems",
        cliFlag: "--include-co-items",
        description: "Read performance-sensitive COEP line-item detail.",
        requiresExplicitOptIn: true
      }
    ]
  },
  {
    id: "read_sales_order",
    description: "Read sales-order header, items, and partners.",
    agents: ["sap_functional_agent"],
    keywords: ["sales order", "so", "sold-to", "ship-to", "partner"],
    requiredInputs: ["vbeln"],
    command: "sap:read-sales-order",
    scriptPath: "scripts/read-sales-order.mjs"
  },
  {
    id: "read_purchase_order",
    description: "Read purchase-order header, items, and history.",
    agents: ["sap_functional_agent"],
    keywords: ["purchase order", "po", "procurement", "ekko", "ekpo", "ekbe"],
    requiredInputs: ["ebeln"],
    command: "sap:read-purchase-order",
    scriptPath: "scripts/read-purchase-order.mjs"
  },
  {
    id: "read_inspection_lot",
    description: "Read QM inspection lot, usage decision, characteristics, and sample results.",
    agents: ["sap_functional_agent"],
    keywords: ["inspection lot", "prueflos", "quality", "qm", "usage decision"],
    requiredInputs: ["prueflos"],
    command: "sap:read-inspection-lot",
    scriptPath: "scripts/read-inspection-lot.mjs"
  },
  {
    id: "read_fi_document",
    description: "Read FI accounting-document header and line items.",
    agents: ["sap_functional_agent"],
    keywords: ["fi document", "accounting document", "bkpf", "bseg"],
    requiredInputs: ["bukrs", "belnr", "gjahr"],
    command: "sap:read-fi-document",
    scriptPath: "scripts/read-fi-document.mjs"
  },
  {
    id: "read_co_document",
    description: "Read CO document header and line items.",
    agents: ["sap_functional_agent"],
    keywords: ["co document", "controlling document", "cobk", "coep"],
    requiredInputs: ["kokrs", "belnr"],
    command: "sap:read-co-document",
    scriptPath: "scripts/read-co-document.mjs"
  }
];
