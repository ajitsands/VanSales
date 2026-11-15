import React, { useEffect, useState } from 'react';
import { Printer, FileText, BookOpen } from 'lucide-react';

export default function PublicShareView({ token }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedInv, setSelectedInv] = useState(null);

  useEffect(() => {
    fetch(`/api/public/share/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok || j.success === false) throw new Error(j.message || 'Unable to load shared document');
        return j.data ?? j;
      })
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontSize: 14 }}>Loading shared document...</div>;
  }

  if (err || !data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: 20 }}>
        <div className="card" style={{ maxWidth: 420, textAlign: 'center', padding: 24 }}>
          <h3 style={{ fontWeight: 800, color: '#be123c' }}>Link Unavailable</h3>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>{err || 'This shared link could not be found.'}</p>
        </div>
      </div>
    );
  }

  const vendor = data.vendor || {};
  const cur = vendor.currency || 'BHD';
  const fmt = (n) => `${Number(n || 0).toFixed(3)} ${cur}`;

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', padding: '16px 12px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 16px rgba(15,23,42,0.06)' }}>
        <div style={{ background: vendor.header_color || '#0f2942', color: '#ffffff', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{vendor.company_name || 'Van Supply & Distribution'}</div>
            <div style={{ fontSize: 11.5, opacity: 0.85, display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
              {data.share_type === 'ledger' ? <><BookOpen size={13} /> Customer Ledger Statement</> : <><FileText size={13} /> Tax Invoice / Bill</>}
            </div>
          </div>
          <button type="button" className="btn btn-sm" style={{ background: '#ffffff', color: '#0f172a', fontWeight: 700 }} onClick={() => window.print()}>
            <Printer size={14} /> Print / Save PDF
          </button>
        </div>

        <div style={{ padding: 18 }}>
          {data.share_type === 'ledger' && (() => {
            const st = data.statement;
            return (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid #e2e8f0' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>{st.shop.shop_name}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{st.shop.shop_code} &bull; {st.shop.route_name}</div>
                    {st.shop.address && <div style={{ fontSize: 11.5, color: '#475569' }}>{st.shop.address}</div>}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 12 }}>
                    <div style={{ color: '#64748b' }}>Statement Period</div>
                    <div style={{ fontWeight: 700 }}>{st.from_date || 'Start'} &rarr; {st.to_date || 'Today'}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 14 }}>
                  <div style={{ padding: 10, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 10.5, color: '#64748b', fontWeight: 700 }}>Opening Balance</div>
                    <div className="mono" style={{ fontSize: 14, fontWeight: 800 }}>{fmt(st.opening_balance)}</div>
                  </div>
                  <div style={{ padding: 10, background: '#fff1f2', borderRadius: 8, border: '1px solid #fecdd3' }}>
                    <div style={{ fontSize: 10.5, color: '#be123c', fontWeight: 700 }}>Closing Balance Owed</div>
                    <div className="mono" style={{ fontSize: 14, fontWeight: 800, color: '#9f1239' }}>{fmt(st.balance)}</div>
                  </div>
                  <div style={{ padding: 10, background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a' }}>
                    <div style={{ fontSize: 10.5, color: '#92400e', fontWeight: 700 }}>Pending Cheques</div>
                    <div className="mono" style={{ fontSize: 14, fontWeight: 800, color: '#78350f' }}>{fmt(st.pending_cheques)}</div>
                  </div>
                </div>

                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr><th>Date</th><th>Type</th><th>Ref #</th><th>Notes</th><th>Debit</th><th>Credit</th><th>Balance</th></tr>
                    </thead>
                    <tbody>
                      {st.entries.map(e => (
                        <tr key={e.id}>
                          <td style={{ fontSize: 11 }}>{e.created_at}</td>
                          <td><span className="badge badge-slate">{e.entry_type}</span></td>
                          <td className="mono">{e.ref_no}</td>
                          <td style={{ fontSize: 11 }}>{e.notes}</td>
                          <td className="mono">{Number(e.debit) > 0 ? fmt(e.debit) : '-'}</td>
                          <td className="mono" style={{ color: '#059669' }}>{Number(e.credit) > 0 ? fmt(e.credit) : '-'}</td>
                          <td className="mono" style={{ fontWeight: 700 }}>{fmt(e.running_balance)}</td>
                        </tr>
                      ))}
                      {st.entries.length === 0 && (
                        <tr><td colSpan="7" style={{ textAlign: 'center', color: '#64748b', padding: 18 }}>No transactions in this date range.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {(st.invoices || []).length > 0 && (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, color: '#0f172a' }}>
                      Purchase Bills ({st.invoices.length})
                    </div>
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr><th>Bill #</th><th>Date</th><th>Total</th><th>Action</th></tr>
                        </thead>
                        <tbody>
                          {st.invoices.map((inv) => (
                            <tr key={inv.id}>
                              <td className="mono" style={{ fontWeight: 700 }}>{inv.invoice_no}</td>
                              <td style={{ fontSize: 11 }}>{inv.created_at}</td>
                              <td className="mono" style={{ fontWeight: 700 }}>{fmt(inv.total_amount)}</td>
                              <td>
                                <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelectedInv(inv)}>
                                  <FileText size={13} /> View Bill
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {selectedInv && (
                  <div className="modal-overlay" onClick={() => setSelectedInv(null)}>
                    <div className="modal-card" style={{ maxWidth: 640, width: '95%' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div>
                          <div className="mono" style={{ fontSize: 15, fontWeight: 800 }}>{selectedInv.invoice_no}</div>
                          <div style={{ fontSize: 11.5, color: '#64748b' }}>{selectedInv.created_at}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>
                            <Printer size={13} /> Print Bill
                          </button>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelectedInv(null)}>Close</button>
                        </div>
                      </div>
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
                          <tbody>
                            {(selectedInv.lines || []).map((l, idx) => (
                              <tr key={idx}>
                                <td>{l.item_name}</td>
                                <td className="mono">{Number(l.qty)}</td>
                                <td className="mono">{fmt(l.unit_price)}</td>
                                <td className="mono" style={{ fontWeight: 700 }}>{fmt(l.line_total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ marginTop: 10, textAlign: 'right', fontWeight: 800, fontSize: 15 }} className="mono">
                        Grand Total: {fmt(selectedInv.total_amount)}
                      </div>
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {data.share_type === 'invoice' && (() => {
            const inv = data.invoice;
            return (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid #e2e8f0' }}>
                  <div>
                    <div className="mono" style={{ fontSize: 16, fontWeight: 800 }}>{inv.invoice_no}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{inv.invoice_type.toUpperCase()} ({inv.vat_mode.toUpperCase()}) &bull; {inv.created_at}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{inv.shop_name || inv.customer_name}</div>
                    <div style={{ fontSize: 11.5, color: '#64748b' }}>{inv.van_name || 'Main Store'}</div>
                  </div>
                </div>

                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>VAT</th><th>Total</th></tr></thead>
                    <tbody>
                      {(data.lines || []).map((l, i) => (
                        <tr key={i}>
                          <td>{l.item_name}</td>
                          <td className="mono">{Number(l.qty)}</td>
                          <td className="mono">{fmt(l.unit_price)}</td>
                          <td className="mono">{fmt(l.line_vat)}</td>
                          <td className="mono" style={{ fontWeight: 700 }}>{fmt(l.line_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 14, padding: 12, background: '#f8fafc', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal:</span><span className="mono">{fmt(inv.subtotal)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>VAT ({vendor.vat_percent || 10}%):</span><span className="mono">{fmt(inv.vat_amount)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16, borderTop: '1px solid #e2e8f0', paddingTop: 6, marginTop: 4 }}>
                    <span>Grand Total:</span><span className="mono">{fmt(inv.total_amount)}</span>
                  </div>
                </div>

                {(data.payments || []).length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Payment Breakdown</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {data.payments.map((p, i) => (
                        <span key={i} className="badge badge-emerald">
                          {p.payment_method.replace('_', ' ').toUpperCase()}: {fmt(p.amount)}
                          {p.cheque_no ? ` (#${p.cheque_no})` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

