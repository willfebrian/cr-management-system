export const semanticLayer = {
  modules: {
    FI: {
      tables: {
        BKPF: {
          role: "accounting_document_header",
          large_table: true,
          key_fields: ["MANDT", "BUKRS", "BELNR", "GJAHR"],
          mandatory_filters_any: [["BUKRS", "BELNR", "GJAHR"], ["BUKRS", "GJAHR", "BUDAT"], ["AWTYP", "AWKEY"]]
        },
        BSEG: {
          role: "accounting_document_line_item",
          large_table: true,
          key_fields: ["MANDT", "BUKRS", "BELNR", "GJAHR", "BUZEI"],
          mandatory_filters_any: [["BUKRS", "BELNR", "GJAHR"]]
        }
      }
    },
    MM: {
      tables: {
        EKKO: {
          role: "purchase_order_header",
          large_table: true,
          key_fields: ["MANDT", "EBELN"],
          mandatory_filters_any: [["EBELN"], ["BUKRS", "BEDAT"], ["EKORG", "BEDAT"]]
        },
        EKPO: {
          role: "purchase_order_item",
          large_table: true,
          key_fields: ["MANDT", "EBELN", "EBELP"],
          mandatory_filters_any: [["EBELN"]]
        },
        MARA: {
          role: "material_master_general",
          large_table: true,
          key_fields: ["MANDT", "MATNR"],
          mandatory_filters_any: [["MATNR"], ["MTART"]]
        },
        MSEG: {
          role: "material_document_item",
          large_table: true,
          key_fields: ["MANDT", "MBLNR", "MJAHR", "ZEILE"],
          mandatory_filters_any: [["MBLNR", "MJAHR"], ["MATNR", "WERKS"], ["MATNR", "CHARG"], ["AUFNR"]]
        },
        MKPF: {
          role: "material_document_header",
          large_table: true,
          key_fields: ["MANDT", "MBLNR", "MJAHR"],
          mandatory_filters_any: [["MBLNR", "MJAHR"], ["BUDAT"]]
        },
        EKBE: {
          role: "purchase_order_history",
          large_table: true,
          key_fields: ["MANDT", "EBELN", "EBELP", "ZEKKN", "VGABE", "GJAHR", "BELNR", "BUZEI"],
          mandatory_filters_any: [["EBELN"], ["EBELN", "EBELP"]]
        },
        MCHB: {
          role: "batch_stock_storage_location",
          large_table: true,
          key_fields: ["MANDT", "MATNR", "WERKS", "LGORT", "CHARG"],
          mandatory_filters_any: [["MATNR", "CHARG"], ["MATNR", "WERKS", "CHARG"]]
        }
      }
    },
    SD: {
      tables: {
        VBAK: {
          role: "sales_document_header",
          large_table: true,
          key_fields: ["MANDT", "VBELN"],
          mandatory_filters_any: [["VBELN"], ["VKORG", "ERDAT"]]
        },
        VBAP: {
          role: "sales_document_item",
          large_table: true,
          key_fields: ["MANDT", "VBELN", "POSNR"],
          mandatory_filters_any: [["VBELN"]]
        },
        VBPA: {
          role: "sales_document_partner",
          large_table: true,
          key_fields: ["MANDT", "VBELN", "POSNR", "PARVW"],
          mandatory_filters_any: [["VBELN"], ["VBELN", "PARVW"]]
        },
        VBFA: {
          role: "sales_document_flow",
          large_table: true,
          key_fields: ["MANDT", "VBELV", "POSNV", "VBELN", "POSNN"],
          mandatory_filters_any: [["VBELV"], ["VBELN"]]
        },
        LIKP: {
          role: "delivery_header",
          large_table: true,
          key_fields: ["MANDT", "VBELN"],
          mandatory_filters_any: [["VBELN"]]
        },
        LIPS: {
          role: "delivery_item",
          large_table: true,
          key_fields: ["MANDT", "VBELN", "POSNR"],
          mandatory_filters_any: [["VBELN"], ["MATNR", "CHARG"]]
        },
        VBRK: {
          role: "billing_document_header",
          large_table: true,
          key_fields: ["MANDT", "VBELN"],
          mandatory_filters_any: [["VBELN"], ["VKORG", "FKDAT"]]
        },
        VBRP: {
          role: "billing_document_item",
          large_table: true,
          key_fields: ["MANDT", "VBELN", "POSNR"],
          mandatory_filters_any: [["VBELN"]]
        }
      }
    },
    PP: {
      tables: {
        AUFK: {
          role: "order_master_header",
          large_table: true,
          key_fields: ["MANDT", "AUFNR"],
          mandatory_filters_any: [["AUFNR"], ["AUART", "ERDAT"], ["KOKRS", "AUART"], ["WERKS", "AUART"]]
        },
        AFKO: {
          role: "production_order_header",
          large_table: true,
          key_fields: ["MANDT", "AUFNR"],
          mandatory_filters_any: [["AUFNR"], ["DISPO", "GSTRP"]]
        },
        AFPO: {
          role: "production_order_item",
          large_table: true,
          key_fields: ["MANDT", "AUFNR", "POSNR"],
          mandatory_filters_any: [["AUFNR"], ["MATNR", "DWERK"]]
        },
        AFVC: {
          role: "order_operation",
          large_table: true,
          key_fields: ["MANDT", "AUFPL", "APLZL"],
          mandatory_filters_any: [["AUFPL"], ["ARBID", "WERKS"]]
        },
        AFVV: {
          role: "operation_quantities_dates_values",
          large_table: true,
          key_fields: ["MANDT", "AUFPL", "APLZL"],
          mandatory_filters_any: [["AUFPL"]]
        },
        RESB: {
          role: "order_component_reservation",
          large_table: true,
          key_fields: ["MANDT", "RSNUM", "RSPOS", "RSART"],
          mandatory_filters_any: [["RSNUM"], ["AUFNR"], ["MATNR", "WERKS"]]
        },
        JEST: {
          role: "object_status_current",
          large_table: true,
          key_fields: ["MANDT", "OBJNR", "STAT", "INACT"],
          mandatory_filters_any: [["OBJNR"], ["STAT", "INACT"]]
        },
        JCDS: {
          role: "object_status_change_history",
          large_table: true,
          key_fields: ["MANDT", "OBJNR", "STAT", "CHGNR"],
          mandatory_filters_any: [["OBJNR"], ["OBJNR", "STAT"]]
        },
        MKAL: {
          role: "production_version",
          large_table: true,
          key_fields: ["MANDT", "MATNR", "WERKS", "VERID"],
          mandatory_filters_any: [["MATNR", "WERKS"], ["MATNR", "WERKS", "VERID"]]
        },
        MAST: {
          role: "material_to_bom_link",
          large_table: true,
          key_fields: ["MANDT", "MATNR", "WERKS", "STLAN", "STLNR"],
          mandatory_filters_any: [["MATNR", "WERKS"], ["STLNR"]]
        },
        STKO: {
          role: "bom_header",
          large_table: true,
          key_fields: ["MANDT", "STLTY", "STLNR", "STLAL", "STKOZ"],
          mandatory_filters_any: [["STLTY", "STLNR"]]
        },
        STPO: {
          role: "bom_item",
          large_table: true,
          key_fields: ["MANDT", "STLTY", "STLNR", "STLKN", "STPOZ"],
          mandatory_filters_any: [["STLTY", "STLNR"]]
        },
        PLKO: {
          role: "routing_header",
          large_table: true,
          key_fields: ["MANDT", "PLNTY", "PLNNR", "PLNAL", "ZAEHL"],
          mandatory_filters_any: [["PLNTY", "PLNNR"]]
        },
        PLPO: {
          role: "routing_operation",
          large_table: true,
          key_fields: ["MANDT", "PLNTY", "PLNNR", "PLNKN", "ZAEHL"],
          mandatory_filters_any: [["PLNTY", "PLNNR"]]
        },
        PLAS: {
          role: "routing_sequence_operation_assignment",
          large_table: true,
          key_fields: ["MANDT", "PLNTY", "PLNNR", "PLNAL", "PLNFL", "PLNKN", "ZAEHL"],
          mandatory_filters_any: [["PLNTY", "PLNNR"], ["PLNTY", "PLNNR", "PLNAL"]]
        },
        PLMZ: {
          role: "bom_item_to_routing_operation_assignment",
          large_table: true,
          key_fields: ["MANDT", "PLNTY", "PLNNR", "PLNAL", "PLNFL", "PLNKN", "ZAEHL", "STLTY", "STLNR", "STLKN"],
          mandatory_filters_any: [["PLNTY", "PLNNR"], ["STLTY", "STLNR"]]
        },
        CRHD: {
          role: "work_center_header",
          large_table: true,
          key_fields: ["MANDT", "OBJTY", "OBJID"],
          mandatory_filters_any: [["OBJTY", "OBJID"], ["ARBPL", "WERKS"]]
        }
      }
    },
    QM: {
      tables: {
        QALS: {
          role: "inspection_lot_record",
          large_table: true,
          key_fields: ["PRUEFLOS"],
          mandatory_filters_any: [["PRUEFLOS"], ["MATNR", "WERK"]]
        },
        QAVE: {
          role: "usage_decision",
          large_table: true,
          key_fields: ["PRUEFLOS"],
          mandatory_filters_any: [["PRUEFLOS"]]
        },
        QAMR: {
          role: "inspection_characteristic_results",
          large_table: true,
          key_fields: ["PRUEFLOS", "VORGLFNR", "MERKNR"],
          mandatory_filters_any: [["PRUEFLOS"]]
        },
        QASE: {
          role: "sample_results",
          large_table: true,
          key_fields: ["PRUEFLOS", "VORGLFNR", "MERKNR", "PROBENR"],
          mandatory_filters_any: [["PRUEFLOS"]]
        },
        QMEL: {
          role: "quality_notification",
          large_table: true,
          key_fields: ["MANDT", "QMNUM"],
          mandatory_filters_any: [["QMNUM"], ["QMART", "ERDAT"]]
        }
      }
    },
    CO: {
      tables: {
        COBK: {
          role: "co_document_header",
          large_table: true,
          key_fields: ["MANDT", "KOKRS", "BELNR"],
          mandatory_filters_any: [["KOKRS", "BELNR"], ["KOKRS", "BUDAT"]]
        },
        COEP: {
          role: "co_line_item_actual",
          large_table: true,
          key_fields: ["MANDT", "KOKRS", "BELNR", "BUZEI"],
          mandatory_filters_any: [["KOKRS", "BELNR"], ["KOKRS", "OBJNR"]]
        },
        CSKS: {
          role: "cost_center_master",
          large_table: true,
          key_fields: ["MANDT", "KOKRS", "KOSTL", "DATBI"],
          mandatory_filters_any: [["KOKRS", "KOSTL"], ["KOKRS"]]
        },
        CSKT: {
          role: "cost_center_text",
          large_table: true,
          key_fields: ["MANDT", "SPRAS", "KOKRS", "KOSTL", "DATBI"],
          mandatory_filters_any: [["KOKRS", "KOSTL"], ["KOKRS", "SPRAS"]]
        },
        CEPC: {
          role: "profit_center_master",
          large_table: true,
          key_fields: ["MANDT", "PRCTR", "DATBI", "KOKRS"],
          mandatory_filters_any: [["KOKRS", "PRCTR"], ["KOKRS"]]
        },
        CEPCT: {
          role: "profit_center_text",
          large_table: true,
          key_fields: ["MANDT", "SPRAS", "PRCTR", "DATBI", "KOKRS"],
          mandatory_filters_any: [["KOKRS", "PRCTR"], ["KOKRS", "SPRAS"]]
        }
      }
    },
    CLASSIFICATION: {
      tables: {
        AUSP: {
          role: "characteristic_value_assignment",
          large_table: true,
          key_fields: ["MANDT", "OBJEK", "ATINN", "ATZHL", "MAFID", "KLART", "ADZHL"],
          mandatory_filters_any: [["OBJEK"], ["OBJEK", "KLART"], ["ATINN"]]
        },
        CABN: {
          role: "characteristic_definition",
          large_table: true,
          key_fields: ["MANDT", "ATINN", "ADZHL"],
          mandatory_filters_any: [["ATINN"], ["ATNAM"]]
        },
        CABNT: {
          role: "characteristic_description",
          large_table: true,
          key_fields: ["MANDT", "ATINN", "SPRAS", "ADZHL"],
          mandatory_filters_any: [["ATINN"], ["SPRAS"]]
        },
        CAWN: {
          role: "characteristic_allowed_values",
          large_table: true,
          key_fields: ["MANDT", "ATINN", "ATZHL", "ADZHL"],
          mandatory_filters_any: [["ATINN"]]
        },
        CAWNT: {
          role: "characteristic_allowed_value_text",
          large_table: true,
          key_fields: ["MANDT", "ATINN", "ATZHL", "SPRAS", "ADZHL"],
          mandatory_filters_any: [["ATINN"], ["ATINN", "SPRAS"]]
        },
        INOB: {
          role: "classification_object_number_link",
          large_table: true,
          key_fields: ["MANDT", "CUOBJ"],
          mandatory_filters_any: [["OBJEK"], ["CUOBJ"], ["KLART", "OBTAB"]]
        },
        KSSK: {
          role: "object_to_class_assignment",
          large_table: true,
          key_fields: ["MANDT", "OBJEK", "MAFID", "KLART", "CLINT", "ADZHL"],
          mandatory_filters_any: [["OBJEK"], ["OBJEK", "KLART"], ["CLINT"]]
        },
        KLAH: {
          role: "class_header",
          large_table: true,
          key_fields: ["MANDT", "CLINT"],
          mandatory_filters_any: [["CLINT"], ["CLASS", "KLART"]]
        },
        KSML: {
          role: "class_characteristic_assignment",
          large_table: true,
          key_fields: ["MANDT", "CLINT", "IMERK", "POSNR", "ADZHL"],
          mandatory_filters_any: [["CLINT"], ["IMERK"]]
        },
        MCHA: {
          role: "batch_master_plant",
          large_table: true,
          key_fields: ["MANDT", "MATNR", "WERKS", "CHARG"],
          mandatory_filters_any: [["MATNR", "WERKS", "CHARG"], ["MATNR", "WERKS"]]
        },
        MCH1: {
          role: "batch_master_cross_plant",
          large_table: true,
          key_fields: ["MANDT", "MATNR", "CHARG"],
          mandatory_filters_any: [["MATNR", "CHARG"], ["MATNR"]]
        }
      }
    }
  }
};
