// POST /api/signup  { email, list? }
//   list omitted   → "Be first in line" news list
//   list 'restock' → email me when Keytags are back in stock
import { db } from '../lib/services.js';
import { handler, json, fail, isEmail } from '../lib/util.js';

export default handler(['POST'], async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!isEmail(email)) return fail(res, 400, 'Enter a valid email address.');
  const table = req.body?.list === 'restock' ? 'restock_requests' : 'signups';
  const { error } = await db().from(table).upsert({ email }, { onConflict: 'email', ignoreDuplicates: true });
  if (error) throw error;
  json(res, 200, { ok: true });
});
