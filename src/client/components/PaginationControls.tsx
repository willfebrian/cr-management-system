import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type PaginationModel = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function PaginationControls({
  pagination,
  onPage,
  onPageSize
}: {
  pagination: PaginationModel;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const { page, pageSize, total, totalPages } = pagination;
  const [jumpInput, setJumpInput] = useState(String(page));

  useEffect(() => {
    setJumpInput(String(page));
  }, [page]);

  const startRecord = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRecord = Math.min(page * pageSize, total);

  // Generate page numbers array (e.g. 1, 2, 3 ... 84)
  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) pages.push(i);
      }
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(jumpInput, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= totalPages) {
      onPage(parsed);
    } else {
      setJumpInput(String(page));
    }
  };

  return (
    <div
      className="pagination-bar"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        padding: "12px 18px",
        borderTop: "1px solid var(--color-border-soft, #e2e8f0)",
        background: "var(--color-bg, #ffffff)",
        flexWrap: "wrap",
        borderRadius: "0 0 12px 12px"
      }}
    >
      {/* Total Records Counter */}
      <div style={{ fontSize: "0.825rem", color: "var(--color-text-muted, #64748b)", fontWeight: "500" }}>
        Showing <strong style={{ color: "var(--color-text, #1e293b)" }}>{startRecord.toLocaleString()}–{endRecord.toLocaleString()}</strong> of <strong style={{ color: "var(--color-text, #1e293b)" }}>{total.toLocaleString()}</strong> entries
      </div>

      {/* Pagination Controls Group */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        {/* Page Size Select */}
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          style={{
            padding: "4px 10px",
            borderRadius: "6px",
            border: "1px solid var(--color-border, #cbd5e1)",
            background: "var(--color-bg, #ffffff)",
            color: "var(--color-text, #1e293b)",
            fontSize: "0.825rem",
            fontWeight: "500",
            cursor: "pointer",
            height: "32px"
          }}
        >
          {[10, 25, 50, 100].map((size) => (
            <option key={size} value={size}>{size} / page</option>
          ))}
        </select>

        {/* Previous Button */}
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "4px 10px",
            height: "32px",
            borderRadius: "6px",
            border: "1px solid var(--color-border, #cbd5e1)",
            background: page <= 1 ? "var(--color-bg-subtle, #f1f5f9)" : "var(--color-bg, #ffffff)",
            color: page <= 1 ? "#94a3b8" : "var(--color-text, #1e293b)",
            fontSize: "0.825rem",
            fontWeight: "600",
            cursor: page <= 1 ? "not-allowed" : "pointer"
          }}
        >
          <ChevronLeft size={16} /> Prev
        </button>

        {/* Page Number Pills */}
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          {getPageNumbers().map((pNum, idx) => {
            if (pNum === "...") {
              return (
                <span key={`dots-${idx}`} style={{ padding: "0 4px", color: "var(--color-text-muted, #94a3b8)", fontSize: "0.825rem" }}>
                  ...
                </span>
              );
            }
            const isCurrent = pNum === page;
            return (
              <button
                key={pNum}
                type="button"
                onClick={() => onPage(pNum)}
                style={{
                  minWidth: "32px",
                  height: "32px",
                  padding: "0 8px",
                  borderRadius: "6px",
                  border: isCurrent ? "none" : "1px solid var(--color-border, #cbd5e1)",
                  background: isCurrent ? "#0f766e" : "var(--color-bg, #ffffff)",
                  color: isCurrent ? "#ffffff" : "var(--color-text, #1e293b)",
                  fontSize: "0.825rem",
                  fontWeight: isCurrent ? "700" : "500",
                  cursor: "pointer"
                }}
              >
                {pNum}
              </button>
            );
          })}
        </div>

        {/* Next Button */}
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "4px 10px",
            height: "32px",
            borderRadius: "6px",
            border: "1px solid var(--color-border, #cbd5e1)",
            background: page >= totalPages ? "var(--color-bg-subtle, #f1f5f9)" : "var(--color-bg, #ffffff)",
            color: page >= totalPages ? "#94a3b8" : "var(--color-text, #1e293b)",
            fontSize: "0.825rem",
            fontWeight: "600",
            cursor: page >= totalPages ? "not-allowed" : "pointer"
          }}
        >
          Next <ChevronRight size={16} />
        </button>

        {/* Jump to page form */}
        <form onSubmit={handleJumpSubmit} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted, #64748b)" }}>Page</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            style={{
              width: "48px",
              height: "32px",
              textAlign: "center",
              borderRadius: "6px",
              border: "1px solid var(--color-border, #cbd5e1)",
              background: "var(--color-bg, #ffffff)",
              fontSize: "0.825rem",
              padding: "2px 4px",
              boxSizing: "border-box"
            }}
          />
          <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted, #64748b)" }}>of {totalPages}</span>
        </form>
      </div>
    </div>
  );
}
