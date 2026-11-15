export const DEFAULT_SHIFTS = [
  { id: 'morning', name: 'Morning', from: '06:00', to: '14:00' },
  { id: 'afternoon', name: 'Afternoon', from: '14:00', to: '22:00' },
  { id: 'night', name: 'Night', from: '22:00', to: '06:00' },
];

export function getVendorShifts(vendor) {
  let raw = vendor?.shift_timings;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_SHIFTS;
  }
  const cleaned = raw
    .map((s, idx) => ({
      id: String(s?.id || `shift_${idx + 1}`),
      name: String(s?.name || `Shift ${idx + 1}`).trim(),
      from: String(s?.from || '00:00').slice(0, 5),
      to: String(s?.to || '23:59').slice(0, 5),
    }))
    .filter((s) => s.name && s.from && s.to);
  return cleaned.length > 0 ? cleaned : DEFAULT_SHIFTS;
}

export function isTimeInShift(hhmm, from, to) {
  if (!hhmm || !from || !to) return true;
  if (from <= to) {
    return hhmm >= from && hhmm <= to;
  }
  return hhmm >= from || hhmm <= to;
}

export function getCurrentShift(shifts, now = new Date()) {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const cur = `${hh}:${mm}`;
  return (shifts || []).find((s) => isTimeInShift(cur, s.from, s.to)) || null;
}

export function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysStr(dateStr, days) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toLocalDateStr(dt);
}

export function matchesDateAndShift(timestamp, { fromDate, toDate, fromTime = '00:00', toTime = '23:59' }) {
  const ts = String(timestamp || '');
  const dPart = ts.slice(0, 10);
  const tPart = ts.slice(11, 16) || '00:00';
  if (!dPart) return false;

  const fTime = fromTime || '00:00';
  const tTime = toTime || '23:59';

  if (fTime <= tTime) {
    const inDate = (!fromDate || dPart >= fromDate) && (!toDate || dPart <= toDate);
    const inTime = tPart >= fTime && tPart <= tTime;
    return inDate && inTime;
  }

  // Overnight shift (e.g. 22:00 to 06:00 next day)
  const nextFrom = fromDate ? addDaysStr(fromDate, 1) : '';
  const nextTo = toDate ? addDaysStr(toDate, 1) : '';
  const matchesEvening = (!fromDate || dPart >= fromDate) && (!toDate || dPart <= toDate) && tPart >= fTime;
  const matchesMorning = (!nextFrom || dPart >= nextFrom) && (!nextTo || dPart <= nextTo) && tPart <= tTime;
  return matchesEvening || matchesMorning;
}
