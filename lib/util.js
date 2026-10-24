// Small helpers shared by the server functions.

// Tag codes and PINs use letters and digits that can't be confused when read off a tag
// (no 0/O, 1/I/L, 2/Z, 5/S, 8/B).
export const CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679';

export function normCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

/** UK-first phone normalisation to E.164. Returns null if it doesn't look like a mobile number. */
export function normPhone(raw) {
  let s = String(raw || '').replace(/[\s().-]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('07')) s = '+44' + s.slice(1);
  if (s.startsWith('447')) s = '+' + s;
  if (!s.startsWith('+')) return null;
  if (s.startsWith('+44')) return /^\+447\d{9}$/.test(s) ? s : null;   // UK mobiles only
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;                        // other countries
}

export function cleanText(raw, max) {
  return String(raw || '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function cleanName(raw) { return cleanText(raw, 80); }
export function cleanLabel(raw) { return cleanText(raw, 30) || null; }

/** Swap characters that would force a text into the costlier Unicode encoding (curly quotes, dashes, emoji). */
export function gsm(s) {
  return String(s)
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[   ]/g, ' ')
    .replace(/[^\n\r\x20-\x7E£¥èéùìòÇØøÅåÆæßÉÄÖÑÜ§¿äöñüà¡€]/g, '');
}

export function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '')); }

export function randomCode(len = 6) {
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  // 25 symbols; reject-sample to keep it uniform
  let out = '';
  let i = 0;
  while (out.length < len) {
    if (i >= bytes.length) { globalThis.crypto.getRandomValues(bytes); i = 0; }
    const b = bytes[i++];
    if (b < 250) out += CODE_ALPHABET[b % 25];
  }
  return out;
}

export function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function fail(res, status, error) { return json(res, status, { error }); }

export function siteUrl() {
  return (process.env.SITE_URL || 'https://keytag.co.uk').replace(/\/$/, '');
}

export function adminEmails() {
  return String(process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

/** Wraps a handler so unexpected errors return a clean 500 and get logged. */
export function handler(methods, fn) {
  return async (req, res) => {
    if (!methods.includes(req.method)) { res.setHeader('Allow', methods.join(', ')); return fail(res, 405, 'Method not allowed'); }
    try { await fn(req, res); }
    catch (e) { console.error(e); if (!res.headersSent) fail(res, 500, 'Something went wrong. Please try again.'); }
  };
}
