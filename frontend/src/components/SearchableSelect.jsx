import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, Check, X } from 'lucide-react';

/**
 * Select2-style Searchable Dropdown component for both Web App and Van Mobile App.
 */
export default function SearchableSelect({
  options = [],
  value = '',
  onChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  required = false,
  disabled = false,
  style = {},
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value)),
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      `${o.label || ''} ${o.sublabel || ''}`.toLowerCase().includes(q)
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 20);
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleSelect = (val) => {
    onChange?.(val);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', ...style }}>
      {required && (
        <input
          tabIndex={-1}
          required
          value={value === null || value === undefined ? '' : String(value)}
          onChange={() => {}}
          style={{
            position: 'absolute',
            bottom: 0,
            left: '50%',
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className="form-control"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          width: '100%',
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: disabled ? '#f1f5f9' : '#fff',
          padding: compact ? '4px 8px' : undefined,
          fontSize: compact ? 12 : undefined,
          minHeight: compact ? 30 : 36,
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: selected ? '#0f172a' : '#94a3b8',
            fontWeight: selected ? 500 : 400,
          }}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={14} style={{ color: '#64748b', flexShrink: 0 }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            minWidth: 210,
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            boxShadow: '0 12px 28px rgba(15, 23, 42, 0.16)',
            zIndex: 999,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: 6, borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Search size={13} style={{ color: '#64748b', flexShrink: 0 }} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              style={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                width: '100%',
                fontSize: 12.5,
                color: '#0f172a',
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 2, display: 'flex', color: '#64748b' }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div style={{ maxHeight: 230, overflowY: 'auto' }}>
            {filtered.map((opt) => {
              const isSelected = String(opt.value) === String(value);
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  style={{
                    width: '100%',
                    border: 'none',
                    borderBottom: '1px solid #f1f5f9',
                    background: isSelected ? '#eff6ff' : '#ffffff',
                    color: isSelected ? '#1d4ed8' : '#0f172a',
                    padding: '7px 10px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    fontSize: 12.5,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: isSelected ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {opt.label}
                    </div>
                    {opt.sublabel && (
                      <div style={{ fontSize: 10.5, color: '#64748b' }}>{opt.sublabel}</div>
                    )}
                  </div>
                  {isSelected && <Check size={14} style={{ color: '#2563eb', flexShrink: 0 }} />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: 12, textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
                No matching options
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

