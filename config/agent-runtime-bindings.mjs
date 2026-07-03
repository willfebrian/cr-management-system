export const agentRuntimeBindings = {
  sap_orchestrator: {
    tools: ["orchestrator_plan_question", "orchestrator_execute_question"]
  },
  sap_technical_agent: {
    tools: ["abap_lookup_program", "abap_lookup_tcode", "abap_risk_summary", "abap_submit_graph"]
  },
  sap_functional_agent: {
    workflows: [
      "find_batch_by_pro",
      "trace_pro_by_batch",
      "find_batch_characteristics",
      "trace_batch_to_sales",
      "trace_batch_to_po_qm_fico",
      "read_sales_order",
      "read_purchase_order",
      "read_inspection_lot",
      "read_fi_document",
      "read_co_document"
    ]
  },
  sap_security_agent: {
    tools: ["policy_review", "audit_review"]
  },
  sap_knowledge_agent: {
    tools: ["ddic_lookup_table", "business_plan_read"]
  },
  sap_documentation_agent: {
    tools: ["generate_ricefw_docs", "generate_technical_spec"]
  },
  sap_pp_pro_agent: {
    workflows: ["find_batch_by_pro", "trace_pro_by_batch"]
  },
  sap_classification_agent: {
    workflows: ["trace_pro_by_batch", "find_batch_characteristics", "trace_batch_to_sales", "trace_batch_to_po_qm_fico"]
  },
  sap_mm_agent: {
    workflows: ["read_purchase_order", "trace_batch_to_sales", "trace_batch_to_po_qm_fico"]
  },
  sap_sd_agent: {
    workflows: ["read_sales_order", "trace_batch_to_sales"]
  },
  sap_qm_agent: {
    workflows: ["read_inspection_lot", "trace_batch_to_po_qm_fico"]
  },
  sap_fi_co_agent: {
    workflows: ["read_fi_document", "read_co_document", "trace_batch_to_po_qm_fico"]
  },
  sap_data_dictionary_agent: {
    tools: ["ddic_lookup_table", "business_plan_read"]
  },
  sap_abap_technical_agent: {
    tools: ["abap_lookup_program", "abap_lookup_tcode", "abap_risk_summary", "abap_submit_graph"]
  }
};
