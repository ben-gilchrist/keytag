#!/usr/bin/env node
// Make a batch of tag codes for the manufacturer.
//
//   npm run codes -- --count 500 --batch 001
//   npm run codes -- --count 500 --batch 001 --insert     (also adds them to the database)
//
// Writes to out/batch-001/:
//   codes.csv          batch, serial, code, code_printed      → send to the manufacturer
//   keytag-qr.svg      the one QR printed on every tag         → send to the manufacturer
//   import.sql         the same tags as SQL                    → or paste into Supabase SQL editor
//
// Every tag carries the same QR, linking to HTTPS://KEYTAG.CLUB/SCAN. The person scanning
// then types the 6-character code printed on that tag. Capitals let the QR use its compact
// mode, so it's less dense and scans better when small or scratched.
// Add --unique-qr to give each tag its own QR (HTTPS://KEYTAG.CLUB/T/CODE) instead.

import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { createClient } from '@supabase/supabase-js';
import { randomCode } from '../lib/util.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return a;
}, []));

const count = Number(args.count || 0);
const batch = String(args.batch || '').padStart(3, '0');
const domain = String(args.domain || 'KEYTAG.CLUB').toUpperCase();
if (!count || count < 1 || count > 100000 || !args.batch) {
  console.error('Usage: npm run codes -- --count 500 --batch 001 [--insert] [--domain KEYTAG.CLUB] [--unique-qr]');
  process.exit(1);
}

const sb = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;
if (!sb) console.warn('! SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set: can\'t check codes against the database.');
if (args.insert && !sb) { console.error('--insert needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }

// Make unique codes, skipping any already in the database.
const codes = new Set();
while (codes.size < count) codes.add(randomCode(6));
if (sb) {
  let clashes = 0;
  for (;;) {
    const list = [...codes];
    const taken = new Set();
    for (let i = 0; i < list.length; i += 500) {
      const { data, error } = await sb.from('tags').select('code').in('code', list.slice(i, i + 500));
      if (error) throw error;
      data.forEach(r => taken.add(r.code));
    }
    if (!taken.size) break;
    clashes += taken.size;
    taken.forEach(c => codes.delete(c));
    while (codes.size < count) codes.add(randomCode(6));
  }
  if (clashes) console.log(`Replaced ${clashes} code(s) that already existed.`);
}

const unique = !!args['unique-qr'];
const rows = [...codes].map((code, i) => {
  return { batch, serial: i + 1, code, url: unique ? `HTTPS://${domain}/T/${code}` : `HTTPS://${domain}/SCAN` };
});

const dir = path.join('out', `batch-${batch}`);
fs.mkdirSync(dir, { recursive: true });
const qrOpts = { type: 'svg', errorCorrectionLevel: 'Q', margin: 1, color: { dark: '#000000', light: '#ffffff' } };

fs.writeFileSync(path.join(dir, 'codes.csv'),
  'batch,serial,code,code_printed' + (unique ? ',qr_url' : '') + '\n' +
  rows.map(r => `${r.batch},${r.serial},${r.code},${r.code.slice(0, 3)}-${r.code.slice(3)}` + (unique ? `,${r.url}` : '')).join('\n') + '\n');

if (unique) {
  fs.mkdirSync(path.join(dir, 'qr'), { recursive: true });
  for (const r of rows) fs.writeFileSync(path.join(dir, 'qr', `${r.code}.svg`), await QRCode.toString(r.url, qrOpts));
} else {
  fs.writeFileSync(path.join(dir, 'keytag-qr.svg'), await QRCode.toString(`HTTPS://${domain}/SCAN`, qrOpts));
}

fs.writeFileSync(path.join(dir, 'import.sql'),
  `-- Batch ${batch}: ${rows.length} tags\ninsert into public.tags (code, batch) values\n` +
  rows.map(r => `  ('${r.code}', '${r.batch}')`).join(',\n') + '\non conflict (code) do nothing;\n');

if (args.insert) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from('tags').insert(rows.slice(i, i + 500).map(r => ({ code: r.code, batch: r.batch })));
    if (error) throw error;
  }
  console.log(`Added ${rows.length} tags to the database.`);
}

console.log(`Made ${rows.length} codes in ${dir}/ (codes.csv, ${unique ? 'qr/*.svg' : 'keytag-qr.svg'}, import.sql).`);
