// POST /api/message  { code, body, allowContact, phone }
// A finder tells the owner where their keys are. The owner gets a text and an email.
// If the finder leaves a number, the owner can reply to the text and Keytag relays it.

import { db, sendSms, sendEmail, env, textsEnabled } from '../lib/services.js';
import { handler, json, fail, normCode, normPhone, cleanText, gsm } from '../lib/util.js';
import { foundKeysEmail, adminScanEmail } from '../lib/emails.js';

export const LIMITS = { perTagPerHour: 5, perPhonePerHour: 3 };

export default handler(['POST'], async (req, res) => {
  const b = req.body || {};
  const code = normCode(b.code);
  const body = cleanText(b.body, 160);
  if (code.length !== 6) return fail(res, 400, 'We can’t find that tag.');
  if (!body) return fail(res, 400, 'Tell the owner where their keys are.');

  let phone = null;
  if (b.allowContact && textsEnabled()) {   // replies need the Keytag number, so ignore numbers until it's live
    phone = normPhone(b.phone);
    if (!phone) return fail(res, 400, 'Enter a mobile number we can text, like 07700 900123.');
  }

  const { data: tag, error } = await db().from('tags')
    .select('code, label, owner_id, owners ( name, email, phone )').eq('code', code).maybeSingle();
  if (error) throw error;
  if (!tag || !tag.owner_id || !tag.owners) return fail(res, 404, 'This tag isn’t set up, so we can’t reach the owner.');

  const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
  const { count: tagCount } = await db().from('conversations').select('id', { count: 'exact', head: true })
    .eq('tag_code', code).gte('created_at', hourAgo);
  if (tagCount >= LIMITS.perTagPerHour) return fail(res, 429, 'The owner has already been sent several messages. Please try again later.');
  if (phone) {
    const { count: phoneCount } = await db().from('conversations').select('id', { count: 'exact', head: true })
      .eq('finder_phone', phone).gte('created_at', hourAgo);
    if (phoneCount >= LIMITS.perPhonePerHour) return fail(res, 429, 'You’ve sent a few messages already. Please try again later.');
  }

  const { data: conv, error: cErr } = await db().from('conversations')
    .insert({ tag_code: code, owner_id: tag.owner_id, finder_phone: phone }).select('id').single();
  if (cErr) throw cErr;
  await db().from('messages').insert({ conversation_id: conv.id, direction: 'finder_to_owner', body });

  const owner = tag.owners;
  // Plain characters only: a curly quote or emoji switches the whole text to a costlier encoding.
  const sms = gsm(`Keytag: someone found your ${tag.label ? tag.label + ' ' : ''}keys (tag ${code}). They said: "${body}"` +
    (phone ? ' Reply to this text to message them. They won\'t see your number.' : ' They didn\'t leave a number.'));

  const results = await Promise.allSettled([
    sendSms(owner.phone, sms),
    sendEmail({ to: owner.email, ...foundKeysEmail({ ownerName: owner.name, code, label: tag.label, message: body, canReply: !!phone }) }),
    process.env.ADMIN_EMAILS
      ? sendEmail({ to: env('ADMIN_EMAILS').split(',').map(s => s.trim()), ...adminScanEmail({ code, kind: 'message', message: body }) })
      : Promise.resolve()
  ]);
  results.forEach((r, i) => { if (r.status === 'rejected') console.error(['sms', 'owner email', 'admin email'][i], r.reason); });
  // The owner must hear about it one way or the other.
  if (results[0].status === 'rejected' && results[1].status === 'rejected') {
    return fail(res, 502, 'We couldn’t reach the owner just now. Please try again in a minute.');
  }

  json(res, 200, { ok: true, canReply: !!phone });
});
