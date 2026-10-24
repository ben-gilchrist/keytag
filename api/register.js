// POST /api/register  { code, email, phone, label? }
// Registers a tag with just its code, an email and a mobile number. No password, no PIN.
// - Unknown code      → 404 "Code not found"
// - Already registered → 409 { registered: true } (the page then offers an email link to edit details)
// - Email already has an account → the tag is added to it; existing details are kept

import { db, sendEmail, env } from '../lib/services.js';
import { handler, json, fail, normCode, normPhone, isEmail, siteUrl, cleanLabel } from '../lib/util.js';
import { clientKey, overLimit } from '../lib/ratelimit.js';
import { registeredEmail } from '../lib/emails.js';

export const REGISTER_LIMIT = { count: 10, windowSec: 3600 };

async function manageLink(email) {
  try {
    const { data, error } = await db().auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: `${siteUrl()}/account` } });
    if (!error && data?.properties?.action_link) return data.properties.action_link;
  } catch (e) { console.error('generateLink', e); }
  return `${siteUrl()}/login`;
}

export default handler(['POST'], async (req, res) => {
  if (await overLimit(clientKey(req, 'register'), REGISTER_LIMIT.count, REGISTER_LIMIT.windowSec)) {
    return fail(res, 429, 'Too many attempts. Please try again in an hour.');
  }
  const b = req.body || {};
  const code = normCode(b.code);
  const email = String(b.email || '').trim().toLowerCase();
  const phone = normPhone(b.phone);
  const label = cleanLabel(b.label);

  const { data: tag, error } = await db().from('tags').select('code, owner_id').eq('code', code).maybeSingle();
  if (error) throw error;
  if (!tag) return fail(res, 404, 'Code not found. Check the code on the back of your tag.');
  if (tag.owner_id) return json(res, 409, { error: 'This Keytag is already registered.', registered: true });
  if (!isEmail(email)) return fail(res, 400, 'Enter a valid email address.');
  if (!phone) return fail(res, 400, 'Enter a mobile number we can text, like 07700 900123.');

  // Existing customer? Add the tag to their account and keep their current details.
  const { data: existing } = await db().from('owners').select('id, phone').ilike('email', email).maybeSingle();
  let ownerId = existing?.id;
  if (!ownerId) {
    let { data: uid } = await db().rpc('user_id_by_email', { e: email });
    if (!uid) {
      const { data: created, error: cErr } = await db().auth.admin.createUser({ email, email_confirm: false });
      if (cErr) throw cErr;
      uid = created.user.id;
    }
    const { error: oErr } = await db().from('owners').insert({ id: uid, email, phone });
    if (oErr) throw oErr;
    ownerId = uid;
  }

  const { data: updated, error: uErr } = await db().from('tags')
    .update({ owner_id: ownerId, label, activated_at: new Date().toISOString(), gift_to_email: null })
    .eq('code', code).is('owner_id', null).select('code');
  if (uErr) throw uErr;
  if (!updated?.length) return json(res, 409, { error: 'This Keytag is already registered.', registered: true });

  const ownerPhone = existing ? existing.phone : phone;
  try {
    await sendEmail({ to: email, ...registeredEmail({ code, phone: ownerPhone, link: await manageLink(email), existing: !!existing }) });
  } catch (e) { console.error('registered email', e); }

  json(res, 200, { ok: true, code, existing: !!existing, phone: ownerPhone });
});
