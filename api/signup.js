// POST /api/signup  { email }   "Be first in line" launch list
import { db } from '../lib/services.js';
import { handler, json, fail, isEmail } from '../lib/util.js';

export default handler(['POST'], async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!isEmail(email)) return fail(res, 400, 'Enter a valid email address.');
  const { error } = await db().from('signups').upsert({ email }, { onConflict: 'email', ignoreDuplicates: true });
  if (error) throw error;
  json(res, 200, { ok: true });
});
