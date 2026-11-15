/**
 * Calculates exact FIFO/FEFO batch-split pricing for a cart line.
 * Matches backend InventoryModel::consumeFifoFefo + SalesController::createInvoice.
 */
export function calculateFifoLineBreakdown(qtyNeeded, batches = [], fallbackPrice = 0) {
  const qty = Number(qtyNeeded || 0);
  const fb = Number(fallbackPrice || 0);
  if (qty <= 0) {
    return { totalGross: 0, slices: [], hasMultiplePrices: false, effectiveUnitPrice: fb };
  }
  if (!Array.isArray(batches) || batches.length === 0) {
    const total = qty * fb;
    return {
      totalGross: total,
      slices: [{ batch_no: 'Default', qty, unit_price: fb, line_total: total }],
      hasMultiplePrices: false,
      effectiveUnitPrice: fb,
    };
  }

  let remaining = qty;
  const slices = [];
  let totalGross = 0;

  for (const b of batches) {
    if (remaining <= 1e-6) break;
    const avail = Number(b.qty_available || 0);
    if (avail <= 0) continue;
    const take = Math.min(avail, remaining);
    const price = b.selling_price !== null && b.selling_price !== undefined ? Number(b.selling_price) : fb;
    const lineTotal = take * price;
    slices.push({
      batch_no: b.batch_no || 'Batch',
      qty: take,
      unit_price: price,
      line_total: lineTotal,
    });
    totalGross += lineTotal;
    remaining -= take;
  }

  if (remaining > 1e-6) {
    const lineTotal = remaining * fb;
    slices.push({
      batch_no: 'Catalog',
      qty: remaining,
      unit_price: fb,
      line_total: lineTotal,
    });
    totalGross += lineTotal;
  }

  const uniquePrices = new Set(slices.map((s) => Number(s.unit_price).toFixed(3)));
  return {
    totalGross,
    slices,
    hasMultiplePrices: uniquePrices.size > 1,
    effectiveUnitPrice: qty > 0 ? totalGross / qty : fb,
  };
}
