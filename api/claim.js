// POST /api/claim  { code, label?, phone? }   (logged in)
// Adds an unregistered tag to the logged-in owner's account.

import { db, currentUser } from '../lib/services.js';
import { handler, json, fail, normCode, normPhone, cleanName, cleanLabel } from '../lib/util.js';

export default handler(['POST'], async (req, res) => {
  const user = await currentUser(req);
  if (!user) return fail(res, 401, 'Please log in first.');

  const b = req.body || {};
  const code = normCode(b.code);

  const { data: tag, error } = await db().from('tags').select('code, owner_id').eq('code', code).maybeSingle();
  if (error) throw error;
  if (!tag) return fail(res, 404, 'Code not found. Check the code on the back of your tag.');
  if (tag.owner_id === user.id) return json(res, 200, { ok: true, code, already: true });
  if (tag.owner_id) return fail(res, 409, 'This tag is already set up by someone else.');

  // Make sure there's an owner record. Existing owners keep their current details.
  const { data: existing } = await db().from('owners').select('id').eq('id', user.id).maybeSingle();
  let created = false;
  if (!existing) {
    const meta = user.user_metadata || {};
    const name = cleanName(b.name || meta.name) || null;
    const phone = normPhone(b.phone || meta.phone);
    if (!phone) return json(res, 200, { ok: false, needDetails: true });
    const { error: oErr } = await db().from('owners').insert({ id: user.id, name, email: user.email, phone });
    if (oErr) throw oErr;
    created = true;
  }

  // Only claim if still unowned (stops two people claiming at the same moment).
  const { data: updated, error: uErr } = await db().from('tags')
    .update({ owner_id: user.id, label: cleanLabel(b.label), activated_at: new Date().toISOString(), gift_to_email: null })
    .eq('code', code).is('owner_id', null).select('code');
  if (uErr) throw uErr;
  if (!updated?.length) return fail(res, 409, 'This tag is already set up by someone else.');

  json(res, 200, { ok: true, code, newOwner: created });
});
