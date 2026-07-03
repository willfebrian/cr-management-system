export const agentRouting = {
  defaultAgent: "sap_orchestrator",
  routes: [
    {
      intent: "data_dictionary",
      agent: "sap_knowledge_agent",
      keywords: ["table", "field", "ddic", "domain", "data element", "foreign key", "check table", "struktur", "tabel", "kolom"]
    },
    {
      intent: "abap",
      agent: "sap_technical_agent",
      keywords: ["abap", "source", "program", "include", "submit", "function", "class", "tcode", "z report", "source code"]
    },
    {
      intent: "pp_pro",
      agent: "sap_functional_agent",
      lens: "PP",
      keywords: ["production order", "process order", "pro", "aufnr", "routing", "bom", "work center", "component", "status order"]
    },
    {
      intent: "classification",
      agent: "sap_functional_agent",
      lens: "Classification",
      keywords: ["characteristic", "karakteristik", "batch", "batch characteristic", "ausp", "class", "klasifikasi", "atinn", "atnam"]
    },
    {
      intent: "qm",
      agent: "sap_functional_agent",
      lens: "QM",
      keywords: ["inspection lot", "quality", "qm", "prueflos", "usage decision", "qals", "qave", "qamr"]
    },
    {
      intent: "fi_co",
      agent: "sap_functional_agent",
      lens: "FI/CO",
      keywords: ["fi", "co", "fico", "accounting", "controlling", "cost center", "profit center", "bkpf", "bseg", "coep"]
    },
    {
      intent: "mm",
      agent: "sap_functional_agent",
      lens: "MM",
      keywords: ["material", "procurement", "purchase order", "purchase history", "goods movement", "inventory", "mm", "mara", "ekko", "ekpo", "ekbe", "mseg"]
    },
    {
      intent: "sd",
      agent: "sap_functional_agent",
      lens: "SD",
      keywords: ["sales order", "delivery", "ship-to", "sold-to", "partner", "billing", "invoice", "customer", "sd", "vbak", "vbap", "vbpa", "likp", "lips", "vbrk", "vbrp"]
    }
  ],
  multiAgentPatterns: [
    {
      intent: "production_quality_characteristic",
      keywords: ["process order", "production order", "characteristic", "inspection lot"],
      agents: ["sap_functional_agent", "sap_knowledge_agent"]
    },
    {
      intent: "production_costing",
      keywords: ["process order cost", "production cost", "settlement", "cost center"],
      agents: ["sap_functional_agent"]
    },
    {
      intent: "z_report_explanation",
      keywords: ["z report", "z tcode", "source logic"],
      agents: ["sap_technical_agent", "sap_knowledge_agent"]
    },
    {
      intent: "batch_sales_trace",
      keywords: ["batch", "delivery", "sales order", "ship-to", "sold-to"],
      minMatches: 2,
      agents: ["sap_functional_agent", "sap_knowledge_agent"]
    },
    {
      intent: "purchase_quality_trace",
      keywords: ["purchase order", "inspection lot", "quality", "goods receipt"],
      minMatches: 2,
      agents: ["sap_functional_agent"]
    }
  ]
};
