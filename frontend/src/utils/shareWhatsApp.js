import { api } from '../api/client';
import { toWhatsAppDigits } from './phoneCodes';

/**
 * Generates a public share link via /api/share-links and opens WhatsApp (wa.me) with the link.
 * Optionally attaches a Purchase Bill link (bill_invoice_id) alongside a ledger statement.
 */
export async function shareViaWhatsApp({
  share_type,
  shop_id,
  invoice_id,
  bill_invoice_id,
  bill_label,
  from_date,
  to_date,
  phone,
  label,
  fallbackDialCode = '+973',
}) {
  const requests = [
    api.post('/api/share-links', {
      share_type,
      shop_id: shop_id || null,
      invoice_id: invoice_id || null,
      from_date: from_date || null,
      to_date: to_date || null,
    }),
  ];

  if (share_type === 'ledger' && bill_invoice_id) {
    requests.push(
      api.post('/api/share-links', {
        share_type: 'invoice',
        invoice_id: bill_invoice_id,
      })
    );
  }

  const [res, billRes] = await Promise.all(requests);
  const url = `${window.location.origin}${res.share_path}`;
  const billUrl = billRes ? `${window.location.origin}${billRes.share_path}` : null;

  const lines = [`${label || 'Document'}: ${url}`];
  if (billUrl) {
    lines.push(`${bill_label || 'Purchase Bill'}: ${billUrl}`);
  }
  const text = lines.join('\n');

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
  const digits = toWhatsAppDigits(phone, fallbackDialCode);
  const waUrl = digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(waUrl, '_blank', 'noopener,noreferrer');
  return url;
}

