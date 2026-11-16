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

export function getVendorTimeHHMM(timeZone, now = new Date()) {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(now);
      const hh = parts.find((p) => p.type === 'hour')?.value || '00';
      const mm = parts.find((p) => p.type === 'minute')?.value || '00';
      return `${hh === '24' ? '00' : hh}:${mm}`;
    } catch {
      // fallback to local
    }
  }
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function getCurrentShift(shifts, timeZoneOrDate = null) {
  let timeZone = null;
  let now = new Date();
  if (typeof timeZoneOrDate === 'string') {
    timeZone = timeZoneOrDate;
  } else if (timeZoneOrDate instanceof Date) {
    now = timeZoneOrDate;
  }
  const cur = getVendorTimeHHMM(timeZone, now);
  return (shifts || []).find((s) => isTimeInShift(cur, s.from, s.to)) || null;
}

export function toLocalDateStr(d = new Date(), timeZone = null) {
  if (timeZone) {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
    } catch {
      // fallback to local
    }
  }
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
