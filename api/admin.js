// GET /api/admin   (logged in, email listed in ADMIN_EMAILS)
// Activity overview for Keytag staff. Finder numbers are never shown.

import { db, currentUser } from '../lib/services.js';
import { handler, json, fail, adminEmails } from '../lib/util.js';

export default handler(['GET'], async (req, res) => {
  const user = await currentUser(req);
  if (!user) return fail(res, 401, 'Please log in.');
  if (!adminEmails().includes(String(user.email).toLowerCase())) return fail(res, 403, 'This page is for Keytag staff.');

  const weekAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const count = q => q.then(r => r.count || 0);
  const [tagsTotal, tagsActive, scansWeek, convsWeek, { data: scans }, { data: convs }, { data: tags }] = await Promise.all([
    count(db().from('tags').select('code', { count: 'exact', head: true })),
    count(db().from('tags').select('code', { count: 'exact', head: true }).not('owner_id', 'is', null)),
    count(db().from('scans').select('id', { count: 'exact', head: true }).gte('scanned_at', weekAgo)),
    count(db().from('conversations').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo)),
    db().from('scans').select('tag_code, kind, scanned_at').order('scanned_at', { ascending: false }).limit(50),
    db().from('conversations').select('id, tag_code, finder_phone, created_at, owners ( name ), messages ( direction, body, created_at )')
      .order('created_at', { ascending: false }).limit(20),
    db().from('tags').select('code, batch, activated_at, gift_to_email, owners ( name )').order('created_at', { ascending: false }).limit(200)
  ]);

  json(res, 200, {
    stats: { tagsTotal, tagsActive, scansWeek, convsWeek },
    scans: scans || [],
    conversations: (convs || []).map(c => ({
      code: c.tag_code, owner: c.owners?.name || null, canReply: !!c.finder_phone, at: c.created_at,
      messages: (c.messages || []).sort((a, b) => a.created_at.localeCompare(b.created_at))
    })),
    tags: (tags || []).map(t => ({ code: t.code, batch: t.batch, owner: t.owners?.name || null, giftPending: !!t.gift_to_email, activatedAt: t.activated_at }))
  });
});
