import React, { useMemo, useState } from 'react';
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isIsoDateString, formatAppDateTime } from '../utils/dateFormat';

/**
 * Reusable interactive DataTable with Search, Column Sorting, Pagination, Page Size selector, and CSV Export.
 */
export default function DataTable({
  columns,
  data = [],
  searchPlaceholder = 'Search table...',
  defaultPageSize = 10,
  emptyText = 'No matching records found.',
  exportFilename = 'export.csv',
  compact = false,
  renderParentChild = null,
}) {
  const { vendor } = useAuth();
  const dateFormat = vendor?.date_format || 'DD/MM/YYYY';
  const formatCellIfDate = (v) => (isIsoDateString(v) ? formatAppDateTime(v, dateFormat) : v);

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((row) =>
      columns.some((col) => {
        const val = col.searchValue
          ? col.searchValue(row)
          : (col.key ? row[col.key] : '');
        return String(val ?? '').toLowerCase().includes(q);
      })
    );
  }, [data, search, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => (c.key || c.label) === sortKey);
    if (!col) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const va = col.sortValue ? col.sortValue(a) : (col.key ? a[col.key] : '');
      const vb = col.sortValue ? col.sortValue(b) : (col.key ? b[col.key] : '');
      const na = Number(va);
      const nb = Number(vb);
      if (va !== '' && vb !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) {
        return sortDir === 'asc' ? na - nb : nb - na;
      }
      const sa = String(va ?? '').toLowerCase();
      const sb = String(vb ?? '').toLowerCase();
      if (sa < sb) return sortDir === 'asc' ? -1 : 1;
      if (sa > sb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [filtered, sortKey, sortDir, columns]);

  const totalItems = sorted.length;
  const effectiveSize = pageSize === 'all' ? Math.max(1, totalItems) : Number(pageSize);
  const totalPages = Math.max(1, Math.ceil(totalItems / effectiveSize));
  const safePage = Math.min(page, totalPages);

  const paged = useMemo(() => {
    if (pageSize === 'all') return sorted;
    const start = (safePage - 1) * effectiveSize;
    return sorted.slice(start, start + effectiveSize);
  }, [sorted, safePage, effectiveSize, pageSize]);

  const toggleSort = (col) => {
    if (col.sortable === false) return;
    const id = col.key || col.label;
    if (sortKey === id) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(id);
      setSortDir('asc');
    }
    setPage(1);
  };

  const exportCsv = () => {
    const headers = columns.map((c) => `"${String(c.label).replace(/"/g, '""')}"`).join(',');
    const rows = sorted.map((row) =>
      columns
        .map((c) => {
          const rawVal = c.searchValue ? c.searchValue(row) : (c.key ? row[c.key] : '');
          const val = formatCellIfDate(rawVal);
          return `"${String(val ?? '').replace(/"/g, '""')}"`;
        })
        .join(',')
    );
    const blob = new Blob([[headers, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFilename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const startIdx = totalItems === 0 ? 0 : (safePage - 1) * effectiveSize + 1;
  const endIdx = Math.min(safePage * effectiveSize, totalItems);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* DataTable Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ position: 'relative', minWidth: 200, flex: '1 1 220px', maxWidth: 340 }}>
          <Search size={14} style={{ position: 'absolute', left: 9, top: 9, color: '#64748b' }} />
          <input
            className="form-control"
            style={{ paddingLeft: 28, paddingTop: 5, paddingBottom: 5, fontSize: 12 }}
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11.5, color: '#64748b' }}>Rows:</span>
          <select
            className="form-control"
            style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
            value={pageSize}
            onChange={(e) => { setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value)); setPage(1); }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value="all">All</option>
          </select>
          <button type="button" className="btn btn-outline btn-sm" onClick={exportCsv} title="Export CSV">
            <Download size={13} /> CSV
          </button>
        </div>
      </div>

      {/* Table or Parent-Child List */}
      {renderParentChild ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {paged.map((row, idx) => (
            <React.Fragment key={row.id ?? row.shop_id ?? idx}>
              {renderParentChild(row, idx)}
            </React.Fragment>
          ))}
          {paged.length === 0 && (
            <div style={{ textAlign: 'center', color: '#64748b', padding: 20, border: '1px dashed #cbd5e1', borderRadius: 8, fontSize: 12 }}>
              {emptyText}
            </div>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table" style={compact ? { fontSize: 11.5 } : undefined}>
            <thead>
              <tr>
                {columns.map((col) => {
                  const id = col.key || col.label;
                  const isSorted = sortKey === id;
                  const canSort = col.sortable !== false;
                  return (
                    <th
                      key={id}
                      onClick={() => toggleSort(col)}
                      style={{
                        cursor: canSort ? 'pointer' : 'default',
                        userSelect: 'none',
                        textAlign: col.align || 'left',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {col.label}
                        {canSort && (
                          isSorted
                            ? (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
                            : <ArrowUpDown size={11} style={{ opacity: 0.35 }} />
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {paged.map((row, idx) => (
                <tr key={row.id ?? idx}>
                  {columns.map((col) => {
                    const id = col.key || col.label;
                    return (
                      <td key={id} style={{ textAlign: col.align || 'left' }}>
                        {col.render ? col.render(row) : formatCellIfDate(row[col.key])}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {paged.length === 0 && (
                <tr>
                  <td colSpan={columns.length} style={{ textAlign: 'center', color: '#64748b', padding: 20 }}>
                    {emptyText}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 11.5, color: '#64748b' }}>
        <span>
          Showing <strong>{startIdx}</strong>–<strong>{endIdx}</strong> of <strong>{totalItems}</strong> entries
          {search && data.length !== totalItems ? ` (filtered from ${data.length})` : ''}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button type="button" className="btn btn-outline btn-sm" disabled={safePage <= 1} onClick={() => setPage(1)}>First</button>
          <button type="button" className="btn btn-outline btn-sm" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <ChevronLeft size={13} />
          </button>
          <span style={{ padding: '0 8px', fontWeight: 600 }}>Page {safePage} / {totalPages}</span>
          <button type="button" className="btn btn-outline btn-sm" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            <ChevronRight size={13} />
          </button>
          <button type="button" className="btn btn-outline btn-sm" disabled={safePage >= totalPages} onClick={() => setPage(totalPages)}>Last</button>
        </div>
      </div>
    </div>
  );
}

