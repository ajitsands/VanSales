import React from 'react';
import { AlertTriangle, Trash2, Info, X } from 'lucide-react';

/**
 * Reusable styled confirmation / alert popup modal replacing native window.confirm & window.alert.
 */
export default function ConfirmModal({
  open,
  title = 'Confirm Action',
  message = '',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger', // 'danger' | 'warning' | 'info'
  alertOnly = false,
  loading = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  const palette =
    variant === 'danger'
      ? { bg: '#fef2f2', border: '#fecaca', iconBg: '#fee2e2', iconColor: '#dc2626', btnClass: 'btn-rose', Icon: Trash2 }
      : variant === 'warning'
      ? { bg: '#fffbeb', border: '#fde68a', iconBg: '#fef3c7', iconColor: '#d97706', btnClass: 'btn-primary', Icon: AlertTriangle }
      : { bg: '#eff6ff', border: '#bfdbfe', iconBg: '#dbeafe', iconColor: '#2563eb', btnClass: 'btn-blue', Icon: Info };

  const Icon = palette.Icon;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 400,
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 24px 48px rgba(15, 23, 42, 0.25)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '16px 18px 12px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: palette.iconBg,
              color: palette.iconColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>{title}</div>
            <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>{message}</div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2 }}
          >
            <X size={16} />
          </button>
        </div>

        <div
          style={{
            padding: '12px 18px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          {!alertOnly && (
            <button type="button" className="btn btn-outline btn-sm" onClick={onCancel} disabled={loading}>
              {cancelText}
            </button>
          )}
          <button
            type="button"
            className={`btn btn-sm ${palette.btnClass}`}
            onClick={alertOnly ? onCancel : onConfirm}
            disabled={loading}
          >
            {loading ? 'Processing...' : alertOnly ? 'OK' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

