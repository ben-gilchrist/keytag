// Simple per-IP limits stored in the database (serverless functions share no memory).
// Only a scrambled version of the IP is stored, and rows are purged after a day.

import { createHash } from 'node:crypto';
import { db } from './services.js';

export function clientKey(req, scope) {
  const ip = String(req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip'] || 'unknown').split(',')[0].trim();
  const salt = process.env.RATE_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'keytag';
  return `${scope}:${createHash('sha256').update(salt + ip).digest('hex').slice(0, 24)}`;
}

/** Number of hits for this key in the last `windowSec` seconds. */
export async function hits(key, windowSec) {
  const since = new Date(Date.now() - windowSec * 1000).toISOString();
  const { count } = await db().from('rate_limits').select('id', { count: 'exact', head: true }).eq('key', key).gte('at', since);
  return count || 0;
}

export async function record(key) {
  await db().from('rate_limits').insert({ key });
}

/** Records a hit and returns true if the caller is now over the limit. */
export async function overLimit(key, limit, windowSec) {
  const n = await hits(key, windowSec);
  if (n >= limit) return true;
  await record(key);
  return false;
}
