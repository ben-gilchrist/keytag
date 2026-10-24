// GET /api/scan?code=ABC123&k=PIN
// Called when someone opens keytag.co.uk/t/CODE (a QR scan) or types a code in.
// Works out which page to show and logs the scan. Never reveals anything about the owner.

import { db, currentUser, sendEmail, env } from '../lib/services.js';
import { handler, json, normCode } from '../lib/util.js';
import { testEmail, adminScanEmail } from '../lib/emails.js';

export default handler(['GET'], async (req, res) => {
  const code = normCode(req.query.code);
  const key = normCode(req.query.k);
  if (code.length !== 6) return json(res, 200, { status: 'unknown' });

  const { data: tag, error } = await db().from('tags').select('code, claim_key, owner_id').eq('code', code).maybeSingle();
  if (error) throw error;
  if (!tag) return json(res, 200, { status: 'unknown' });

  const user = await currentUser(req);
  let result, kind;

  if (tag.owner_id && user && user.id === tag.owner_id) {
    kind = 'owner_test';
    const { data: owner } = await db().from('owners').select('name, email, phone').eq('id', user.id).maybeSingle();
    // one test email every 2 minutes at most
    const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { count } = await db().from('scans').select('id', { count: 'exact', head: true })
      .eq('tag_code', code).eq('kind', 'owner_test').gte('scanned_at', since);
    if (owner && !count) {
      try { await sendEmail({ to: owner.email, ...testEmail({ ownerName: owner.name, code, phone: owner.phone }) }); }
      catch (e) { console.error('test email', e); }
    }
    result = { status: 'yours', code, phone: owner?.phone || null, email: owner?.email || null };
  } else if (tag.owner_id) {
    kind = 'finder';
    result = { status: 'registered', code };
  } else {
    kind = 'setup';
    result = { status: 'unregistered', code, claimable: key.length > 0 && key === tag.claim_key, signedIn: !!user };
  }

  await db().from('scans').insert({ tag_code: code, kind });

  if (kind !== 'owner_test' && process.env.ADMIN_EMAILS) {
    try { await sendEmail({ to: env('ADMIN_EMAILS').split(',').map(s => s.trim()), ...adminScanEmail({ code, kind }) }); }
    catch (e) { console.error('admin email', e); }
  }

  json(res, 200, result);
});
