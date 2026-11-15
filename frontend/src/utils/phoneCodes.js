export const GULF_INDIA_COUNTRY_CODES = [
  { code: '+973', country: 'Bahrain', short: 'BH', flag: '🇧🇭' },
  { code: '+966', country: 'Saudi Arabia', short: 'SA', flag: '🇸🇦' },
  { code: '+971', country: 'UAE', short: 'AE', flag: '🇦🇪' },
  { code: '+965', country: 'Kuwait', short: 'KW', flag: '🇰🇼' },
  { code: '+974', country: 'Qatar', short: 'QA', flag: '🇶🇦' },
  { code: '+968', country: 'Oman', short: 'OM', flag: '🇴🇲' },
  { code: '+91', country: 'India', short: 'IN', flag: '🇮🇳' },
];

export function getDefaultCountryCode(vendor) {
  const tz = String(vendor?.timezone || '').toLowerCase();
  const cur = String(vendor?.currency_code || '').toUpperCase();

  if (tz.includes('bahrain') || cur === 'BHD') return '+973';
  if (tz.includes('riyadh') || cur === 'SAR') return '+966';
  if (tz.includes('dubai') || cur === 'AED') return '+971';
  if (tz.includes('kuwait') || cur === 'KWD') return '+965';
  if (tz.includes('qatar') || cur === 'QAR') return '+974';
  if (tz.includes('muscat') || cur === 'OMR') return '+968';
  if (tz.includes('kolkata') || tz.includes('india') || cur === 'INR') return '+91';

  return '+973';
}

export function buildFullMobile(dialCode, rawNumber) {
  const trimmed = String(rawNumber || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+')) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  const codeDigits = String(dialCode || '+973').replace(/\D/g, '');
  if (digits.startsWith(codeDigits) && digits.length > codeDigits.length + 5) {
    return `+${digits}`;
  }
  const local = digits.replace(/^0+/, '');
  return `+${codeDigits}${local}`;
}

export function toWhatsAppDigits(mobileNo, fallbackDialCode = '+973') {
  const digits = String(mobileNo || '').replace(/\D/g, '');
  if (!digits) return '';
  const knownPrefixes = ['973', '966', '971', '965', '974', '968', '91'];
  if (knownPrefixes.some((p) => digits.startsWith(p) && digits.length >= p.length + 7)) {
    return digits;
  }
  const codeDigits = String(fallbackDialCode || '+973').replace(/\D/g, '');
  return `${codeDigits}${digits.replace(/^0+/, '')}`;
}

