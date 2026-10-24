// POST /api/register
// Registering a tag, in two steps:
//   1. { code, email, phone, label? }            → checks the code, sends a 6-digit code by email
//                                                  (and by text, once texts are live) → { id, emailSent, phoneSent }
//   2. { id, emailCode, phoneCode? }             → checks the codes and registers the tag
// - Unknown code       → 404 "Code not found"
// - Already registered → 409 { registered: true } (the page offers an email link to edit details)
// - Email already has an account → the tag joins it; the existing mobile number is kept

import { db, sendEmail, textsEnabled } from '../lib/services.js';
import { handler, json, fail, normCode, normPhone, isEmail, siteUrl, cleanLabel } from '../lib/util.js';
import { clientKey, overLimit } from '../lib/ratelimit.js';
import { startVerification, checkVerification } from '../lib/verify.js';
import { registeredEmail } from '../lib/emails.js';

export const REGISTER_LIMIT = { count: 10, windowSec: 3600 };   // starts per IP per hour
export const PER_EMAIL_LIMIT = 5;                                // code emails per address per hour

async function manageLink(email) {
  try {
    const { data, error } = await db().auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: `${siteUrl()}/account` } });
    if (!error && data?.properties?.action_link) return data.properties.action_link;
  } catch (e) { console.error('generateLink', e); }
  return `${siteUrl()}/login`;
}

const taken = res => json(res, 409, { error: 'This Keytag is already registered.', registered: true });

async function start(req, res, b) {
  if (await overLimit(clientKey(req, 'register'), REGISTER_LIMIT.count, REGISTER_LIMIT.windowSec)) {
    return fail(res, 429, 'Too many attempts. Please try again in an hour.');
  }
  const code = normCode(b.code);
  const email = String(b.email || '').trim().toLowerCase();
  const phone = normPhone(b.phone);
  const label = cleanLabel(b.label);

  const { data: tag, error } = await db().from('tags').select('code, owner_id').eq('code', code).maybeSingle();
  if (error) throw error;
  if (!tag) return fail(res, 404, 'Code not found. Check the code on the back of your tag.');
  if (tag.owner_id) return taken(res);
  if (!isEmail(email)) return fail(res, 400, 'Enter a valid email address.');
  if (!phone) return fail(res, 400, 'Enter a mobile number we can text, like 07700 900123.');

  const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
  const { count } = await db().from('verifications').select('id', { count: 'exact', head: true }).eq('email', email).gte('created_at', hourAgo);
  if (count >= PER_EMAIL_LIMIT) return fail(res, 429, 'We’ve sent several codes to that email already. Please try again in an hour.');

  // Existing customers keep their current number, so only new customers confirm a mobile.
  const { data: existing } = await db().from('owners').select('id').ilike('email', email).maybeSingle();
  const v = await startVerification({
    purpose: 'register', tagCode: code, email, phone, label,
    sendEmailCode: true, sendPhoneCode: textsEnabled() && !existing
  });
  json(res, 200, { id: v.id, emailSent: v.emailSent, phoneSent: v.phoneSent, email, phone });
}

async function verify(req, res, b) {
  const check = await checkVerification(b.id, { emailCode: b.emailCode, phoneCode: b.phoneCode }, 'register');
  if (check.error) return json(res, check.status, { error: check.error, emailOk: check.emailOk, phoneOk: check.phoneOk });
  const { tag_code: code, email, phone, label } = check.row;

  const { data: tag } = await db().from('tags').select('code, owner_id').eq('code', code).maybeSingle();
  if (!tag) return fail(res, 404, 'Code not found. Check the code on the back of your tag.');
  if (tag.owner_id) return taken(res);

  const { data: existing } = await db().from('owners').select('id, phone').ilike('email', email).maybeSingle();
  let ownerId = existing?.id;
  if (!ownerId) {
    let { data: uid } = await db().rpc('user_id_by_email', { e: email });
    if (!uid) {
      const { data: created, error: cErr } = await db().auth.admin.createUser({ email, email_confirm: true });
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
  if (!updated?.length) return taken(res);

  const ownerPhone = existing ? existing.phone : phone;
  try {
    await sendEmail({ to: email, ...registeredEmail({ code, phone: ownerPhone, link: await manageLink(email), existing: !!existing }) });
  } catch (e) { console.error('registered email', e); }

  json(res, 200, { ok: true, code, existing: !!existing, phone: ownerPhone });
}

export default handler(['POST'], async (req, res) => {
  const b = req.body || {};
  return b.id ? verify(req, res, b) : start(req, res, b);
});
