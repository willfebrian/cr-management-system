import React, { useState, useEffect } from "react";
import { Database, Loader2 } from "lucide-react";

export function AppLoadingScreen() {
  const [statusIdx, setStatusIdx] = useState(0);
  const statuses = [
    "Initializing CR Management System...",
    "Verifying User Session & Access Roles...",
    "Connecting to SAP Transport Repositories...",
    "Preparing Interactive Workspaces..."
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setStatusIdx((prev) => (prev + 1) % statuses.length);
    }, 500);
    return () => clearInterval(timer);
  }, [statuses.length]);

  return (
    <div className="interactive-loading-backdrop">
      <div className="interactive-loading-modal">
        <div className="app-loader-icon-wrapper">
          <div className="app-loader-pulse-ring" />
          <Database size={32} className="app-loader-brand-icon" />
        </div>
        <h3 className="app-loader-title">CR Management System</h3>
        <p className="app-loader-status">{statuses[statusIdx]}</p>

        <div className="app-loader-progress-track">
          <div className="app-loader-progress-bar" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonDetailLoader({ title = "Loading Details..." }: { title?: string }) {
  return (
    <div className="skeleton-detail-container">
      <div className="skeleton-header">
        <div className="skeleton-badge shimmer" />
        <div className="skeleton-title shimmer" />
      </div>
      <div className="skeleton-grid">
        <div className="skeleton-card shimmer" />
        <div className="skeleton-card shimmer" />
        <div className="skeleton-card shimmer" />
      </div>
      <div className="skeleton-section-title shimmer" />
      <div className="skeleton-table">
        <div className="skeleton-table-header shimmer" />
        <div className="skeleton-table-row shimmer" />
        <div className="skeleton-table-row shimmer" />
        <div className="skeleton-table-row shimmer" />
      </div>
      <div className="skeleton-footer-note">
        <Loader2 className="spinner" size={16} color="#0f766e" />
        <span>{title}</span>
      </div>
    </div>
  );
}

export function SkeletonTableLoader() {
  return (
    <div className="skeleton-table-container" style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "16px" }}>
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className="shimmer" style={{ height: "46px", borderRadius: "8px" }} />
      ))}
    </div>
  );
}
