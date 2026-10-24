// POST /api/tag  { action: 'remove' | 'gift', code, email?, name? }   (logged in)
// remove → take a lost or unused tag off your account
// gift   → pass a tag to someone else; they get an email link to set it up

import { db, currentUser, sendEmail } from '../lib/services.js';
import { handler, json, fail, normCode, randomCode, isEmail, cleanName } from '../lib/util.js';
import { giftEmail } from '../lib/emails.js';

export default handler(['POST'], async (req, res) => {
  const user = await currentUser(req);
  if (!user) return fail(res, 401, 'Please log in.');
  const b = req.body || {};
  const code = normCode(b.code);

  const { data: tag } = await db().from('tags').select('code, owner_id').eq('code', code).maybeSingle();
  if (!tag || tag.owner_id !== user.id) return fail(res, 404, 'That tag isn’t on your account.');

  if (b.action === 'remove') {
    // New PIN, so whoever ends up holding a lost tag can't set it up as theirs.
    const { error } = await db().from('tags').update({ owner_id: null, activated_at: null, claim_key: randomCode() }).eq('code', code);
    if (error) throw error;
    return json(res, 200, { ok: true });
  }

  if (b.action === 'gift') {
    const email = String(b.email || '').trim().toLowerCase();
    const name = cleanName(b.name);
    if (!isEmail(email)) return fail(res, 400, 'Enter their email address.');
    const key = randomCode();
    const { data: me } = await db().from('owners').select('name').eq('id', user.id).maybeSingle();
    const { error } = await db().from('tags')
      .update({ owner_id: null, activated_at: null, claim_key: key, gift_to_email: email }).eq('code', code).eq('owner_id', user.id);
    if (error) throw error;
    await sendEmail({ to: email, ...giftEmail({ fromName: me?.name, toName: name, code, key }) });
    return json(res, 200, { ok: true });
  }

  fail(res, 400, 'Unknown action.');
});
