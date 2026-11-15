/**
 * Formats an ISO date / datetime string (or Date object) using the vendor's configured date_format
 * ('DD/MM/YYYY', 'YYYY-MM-DD', or 'MM/DD/YYYY').
 */
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?Z?)?$/;

export function isIsoDateString(val) {
  return typeof val === 'string' && ISO_DATE_RE.test(val.trim());
}

function formatParts(yyyy, mm, dd, dateFormat = 'DD/MM/YYYY') {
  if (dateFormat === 'YYYY-MM-DD') return `${yyyy}-${mm}-${dd}`;
  if (dateFormat === 'MM/DD/YYYY') return `${mm}/${dd}/${yyyy}`;
  return `${dd}/${mm}/${yyyy}`;
}

export function formatAppDate(val, dateFormat = 'DD/MM/YYYY') {
  if (val === null || val === undefined || val === '') return '';
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const yyyy = String(val.getFullYear());
    const mm = String(val.getMonth() + 1).padStart(2, '0');
    const dd = String(val.getDate()).padStart(2, '0');
    return formatParts(yyyy, mm, dd, dateFormat);
  }
  const str = String(val).trim();
  const m = ISO_DATE_RE.exec(str);
  if (m) {
    return formatParts(m[1], m[2], m[3], dateFormat);
  }
  return str;
}

export function formatAppDateTime(val, dateFormat = 'DD/MM/YYYY') {
  if (val === null || val === undefined || val === '') return '';
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const d = formatAppDate(val, dateFormat);
    const hh = String(val.getHours()).padStart(2, '0');
    const min = String(val.getMinutes()).padStart(2, '0');
    return `${d} ${hh}:${min}`;
  }
  const str = String(val).trim();
  const m = ISO_DATE_RE.exec(str);
  if (m) {
    const d = formatParts(m[1], m[2], m[3], dateFormat);
    if (m[4] !== undefined && m[5] !== undefined) {
      return `${d} ${m[4]}:${m[5]}`;
    }
    return d;
  }
  return str;
}
