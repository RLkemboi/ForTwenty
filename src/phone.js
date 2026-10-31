// One place for phone numbers. Everything is stored and sent as digits with the country code, e.g. 254712345678.
// Accepts 0712345678, 712345678 (no zero), +254 712 345 678, 254712345678, 00254712345678, or a 0 typed after the code.
const CC = '254';
export function normalizePhone(raw) {
  let p = String(raw || '').replace(/[\s()-]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('00')) p = p.slice(2);
  if (/^0[17]\d{8}$/.test(p)) p = CC + p.slice(1);
  if (/^[17]\d{8}$/.test(p)) p = CC + p;
  p = p.replace(new RegExp('^' + CC + '(?:0|' + CC + ')(?=[17]\\d{8}$)'), CC); // code then 0..., or the code typed twice
  return new RegExp('^' + CC + '[17]\\d{8}$').test(p) ? p : null;
}
// A comma-separated setting (ALLOWLIST, ALERT_PHONES) in any of those formats -> clean list; unusable entries are dropped.
export const phoneList = (s) => String(s || '').split(',').map((x) => normalizePhone(x)).filter(Boolean);
