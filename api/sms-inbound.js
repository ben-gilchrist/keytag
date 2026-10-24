// POST /api/sms-inbound  (Twilio webhook for the Keytag number)
// Relays replies between owner and finder so neither sees the other's number.
// Also lets a finder report keys by texting the tag code, e.g. "7H4Q9M left at reception".

import { db, sendSms, validTwilioRequest } from '../lib/services.js';
import { handler, normPhone, normCode, cleanText, gsm, siteUrl } from '../lib/util.js';

const KEYWORDS = /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|START|UNSTOP|YES|HELP|INFO)$/i;
const ACTIVE_DAYS = 30;

function twiml(res, reply) {
  res.status(200).setHeader('Content-Type', 'text/xml');
  const x = s => s.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
  res.end(reply ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${x(gsm(reply))}</Message></Response>` : '<?xml version="1.0" encoding="UTF-8"?><Response/>');
}

export default handler(['POST'], async (req, res) => {
  if (!validTwilioRequest(req, `${siteUrl()}/api/sms-inbound`)) { res.status(403).end('Forbidden'); return; }

  const rawFrom = String(req.body?.From || '');
  const from = normPhone(rawFrom) || rawFrom;
  const text = cleanText(req.body?.Body, 300);
  if (!text || KEYWORDS.test(text)) return twiml(res);   // Twilio handles STOP/HELP itself

  const since = new Date(Date.now() - ACTIVE_DAYS * 86400 * 1000).toISOString();

  // Is this number an owner, a finder, or both? Use whichever conversation is most recent.
  const { data: owner } = await db().from('owners').select('id, phone').eq('phone', from).maybeSingle();
  const [asOwner, asFinder] = await Promise.all([
    owner
      ? db().from('conversations').select('id, tag_code, owner_id, finder_phone, last_activity_at')
          .eq('owner_id', owner.id).gte('last_activity_at', since).order('last_activity_at', { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    db().from('conversations').select('id, tag_code, owner_id, finder_phone, last_activity_at, owners ( phone )')
      .eq('finder_phone', from).gte('last_activity_at', since).order('last_activity_at', { ascending: false }).limit(1).maybeSingle()
  ]);
  const o = asOwner.data, f = asFinder.data;
  let conv = null, role = null;
  if (o && (!f || o.last_activity_at >= f.last_activity_at)) { conv = o; role = 'owner'; }
  else if (f) { conv = f; role = 'finder'; }

  const touch = id => db().from('conversations').update({ last_activity_at: new Date().toISOString() }).eq('id', id);

  if (role === 'owner') {
    if (!conv.finder_phone) return twiml(res, 'Keytag: the finder didn\'t leave a number, so we can\'t pass on your reply. Check their message for where your keys are.');
    await sendSms(conv.finder_phone, gsm(`Keytag: the owner of the keys says: "${text}" Reply to this text to answer.`));
    await db().from('messages').insert({ conversation_id: conv.id, direction: 'owner_to_finder', body: text });
    await touch(conv.id);
    return twiml(res);
  }

  if (role === 'finder') {
    if (!conv.owners?.phone) return twiml(res, 'Keytag: sorry, we can\'t reach the owner of this tag any more.');
    await sendSms(conv.owners.phone, gsm(`Keytag (tag ${conv.tag_code}): the finder says: "${text}" Reply to this text to answer.`));
    await db().from('messages').insert({ conversation_id: conv.id, direction: 'finder_to_owner', body: text });
    await touch(conv.id);
    return twiml(res);
  }

  // A new finder texting a tag code: "7H4Q9M left at the bar"
  const candidates = [...text.toUpperCase().matchAll(/\b([A-Z0-9]{3})[\s-]?([A-Z0-9]{3})\b/g)].slice(0, 5);
  for (const m of candidates) {
    const code = normCode(m[1] + m[2]);
    const { data: tag } = await db().from('tags').select('code, owner_id, owners ( phone )').eq('code', code).maybeSingle();
    if (tag?.owner_id && tag.owners?.phone) {
      const without = text.slice(0, m.index) + text.slice(m.index + m[0].length);
      const rest = cleanText(without.replace(/^[\s:,.-]+/, ''), 160) || 'I have found your keys.';
      const { data: c } = await db().from('conversations')
        .insert({ tag_code: code, owner_id: tag.owner_id, finder_phone: from }).select('id').single();
      await db().from('messages').insert({ conversation_id: c.id, direction: 'finder_to_owner', body: rest });
      await db().from('scans').insert({ tag_code: code, kind: 'finder' });
      await sendSms(tag.owners.phone, gsm(`Keytag: someone found your keys (tag ${code}). They said: "${rest}" Reply to this text to message them. They won't see your number.`));
      return twiml(res, 'Keytag: thanks, we\'ve passed your message to the owner. If they reply, it will come from this number.');
    }
  }

  twiml(res, `Keytag: to tell an owner you've found their keys, scan the tag or text the 6-character code on it followed by where the keys are. ${siteUrl().replace(/^https?:\/\//, '')}`);
});
