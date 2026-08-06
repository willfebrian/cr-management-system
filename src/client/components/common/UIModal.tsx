import React, { useEffect } from "react";
import { X, AlertTriangle, HelpCircle, Info, CheckCircle2, Trash2, Sparkles } from "lucide-react";

export type ModalType = "primary" | "danger" | "warning" | "info" | "purple" | "success";

export interface UIModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  type?: ModalType;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void | Promise<void>;
  confirmDisabled?: boolean;
  confirmLoading?: boolean;
  maxWidth?: string;
  hideFooter?: boolean;
}

export function UIModal({
  isOpen,
  onClose,
  title,
  subtitle,
  type = "primary",
  icon,
  children,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  confirmDisabled = false,
  confirmLoading = false,
  maxWidth = "520px",
  hideFooter = false
}: UIModalProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const typeStyles = {
    primary: {
      badgeBg: "#eefaf6",
      badgeColor: "#0f766e",
      buttonBg: "#0f766e",
      defaultIcon: <Info size={20} />
    },
    danger: {
      badgeBg: "#fef2f2",
      badgeColor: "#dc2626",
      buttonBg: "#dc2626",
      defaultIcon: <Trash2 size={20} />
    },
    warning: {
      badgeBg: "#fffbe8",
      badgeColor: "#d97706",
      buttonBg: "#d97706",
      defaultIcon: <AlertTriangle size={20} />
    },
    info: {
      badgeBg: "#eff6ff",
      badgeColor: "#2563eb",
      buttonBg: "#2563eb",
      defaultIcon: <HelpCircle size={20} />
    },
    purple: {
      badgeBg: "#f3e8ff",
      badgeColor: "#7c3aed",
      buttonBg: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
      defaultIcon: <Sparkles size={20} />
    },
    success: {
      badgeBg: "#f0fdf4",
      badgeColor: "#16a34a",
      buttonBg: "#16a34a",
      defaultIcon: <CheckCircle2 size={20} />
    }
  };

  const style = typeStyles[type] || typeStyles.primary;

  return (
    <div
      className="ui-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className="ui-modal-card"
        role="dialog"
        aria-modal="true"
        style={{ maxWidth }}
      >
        {/* Header */}
        <div className="ui-modal-header">
          <div className="ui-modal-title-group">
            <div className="ui-modal-badge" style={{ backgroundColor: style.badgeBg, color: style.badgeColor }}>
              {icon || style.defaultIcon}
            </div>
            <div>
              <h3 className="ui-modal-title">{title}</h3>
              {subtitle && <p className="ui-modal-subtitle">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            className="ui-modal-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body Content */}
        {children && <div className="ui-modal-body">{children}</div>}

        {/* Footer Actions */}
        {!hideFooter && (
          <div className="ui-modal-footer">
            <button type="button" className="ui-modal-btn-cancel" onClick={onClose}>
              {cancelText}
            </button>
            {onConfirm && (
              <button
                type="button"
                className="ui-modal-btn-confirm"
                style={{ background: style.buttonBg }}
                disabled={confirmDisabled || confirmLoading}
                onClick={() => {
                  void onConfirm();
                }}
              >
                {confirmLoading ? "Processing..." : confirmText}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
