// /api/me   (logged in)
// GET    → your details, your tags and messages from finders
// PATCH  { name, phone } → update your details. A new mobile number must be confirmed with a
//        texted code once texts are live: the first call returns { needCode, id }, then
//        PATCH { id, phoneCode } saves it.
// DELETE → delete your account (your tags stop working until set up again)

import { db, currentUser, textsEnabled } from '../lib/services.js';
import { handler, json, fail, normPhone, cleanName } from '../lib/util.js';
import { startVerification, checkVerification } from '../lib/verify.js';

export default handler(['GET', 'PATCH', 'DELETE'], async (req, res) => {
  const user = await currentUser(req);
  if (!user) return fail(res, 401, 'Please log in.');

  if (req.method === 'GET') {
    const { data: owner } = await db().from('owners').select('name, email, phone').eq('id', user.id).maybeSingle();
    if (!owner) return json(res, 200, { owner: null, email: user.email, tags: [], conversations: [] });
    const [{ data: tags }, { data: convs }] = await Promise.all([
      db().from('tags').select('code, label, activated_at').eq('owner_id', user.id).order('activated_at', { ascending: true }),
      db().from('conversations')
        .select('id, tag_code, finder_phone, created_at, last_activity_at, messages ( direction, body, created_at )')
        .eq('owner_id', user.id).order('last_activity_at', { ascending: false }).limit(20)
    ]);
    return json(res, 200, {
      owner,
      tags: tags || [],
      // never send the finder's number to the browser, only whether one exists
      conversations: (convs || []).map(c => ({
        id: c.id, code: c.tag_code, canReply: !!c.finder_phone, at: c.created_at,
        messages: (c.messages || []).sort((a, b) => a.created_at.localeCompare(b.created_at))
      }))
    });
  }

  if (req.method === 'PATCH') {
    const b = req.body || {};
    const { data: current } = await db().from('owners').select('name, phone').eq('id', user.id).maybeSingle();
    if (!current) return fail(res, 404, 'No Keytag account found.');

    if (b.id) {   // confirming a new number
      const check = await checkVerification(b.id, { phoneCode: b.phoneCode }, 'phone_change');
      if (check.error) return fail(res, check.status, check.error);
      if (check.row.owner_id !== user.id) return fail(res, 400, 'Please start again.');
      const { error } = await db().from('owners').update({ phone: check.row.phone, updated_at: new Date().toISOString() }).eq('id', user.id);
      if (error) throw error;
      return json(res, 200, { ok: true, owner: { name: current.name, phone: check.row.phone, email: user.email } });
    }

    const name = cleanName(b.name) || null;
    const phone = normPhone(b.phone);
    if (!phone) return fail(res, 400, 'Enter a mobile number we can text, like 07700 900123.');
    const { error } = await db().from('owners').update({ name, updated_at: new Date().toISOString() }).eq('id', user.id);
    if (error) throw error;

    if (phone !== current.phone) {
      if (textsEnabled()) {
        const v = await startVerification({ purpose: 'phone_change', ownerId: user.id, phone, sendPhoneCode: true });
        return json(res, 200, { ok: true, needCode: true, id: v.id, phone, owner: { name, phone: current.phone, email: user.email } });
      }
      await db().from('owners').update({ phone }).eq('id', user.id);   // texts not live yet: nothing to confirm with
    }
    return json(res, 200, { ok: true, owner: { name, phone, email: user.email } });
  }

  // DELETE
  await db().from('tags').update({ owner_id: null, activated_at: null, label: null }).eq('owner_id', user.id);
  await db().from('owners').delete().eq('id', user.id);
  const { error } = await db().auth.admin.deleteUser(user.id);
  if (error) throw error;
  json(res, 200, { ok: true });
});
