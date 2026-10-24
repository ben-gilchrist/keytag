// A tiny in-memory stand-in for the parts of supabase-js the server functions use.
// Lets the tests run the real handlers without a database.

const RELATIONS = {
  tags:          { owners: { table: 'owners', local: 'owner_id', foreign: 'id', many: false } },
  conversations: { owners: { table: 'owners', local: 'owner_id', foreign: 'id', many: false },
                   messages: { table: 'messages', local: 'id', foreign: 'conversation_id', many: true } }
};
const PK = { owners: 'id', tags: 'code', scans: 'id', conversations: 'id', messages: 'id', signups: 'email', rate_limits: 'id', verifications: 'id' };

function parseSelect(s) {
  const fields = [], rels = [];
  let rest = String(s || '*');
  rest = rest.replace(/(\w+)\s*\(([^)]*)\)/g, (_, name, inner) => { rels.push({ name, fields: inner.split(',').map(x => x.trim()) }); return ''; });
  rest.split(',').map(x => x.trim()).filter(Boolean).forEach(f => fields.push(f));
  return { fields, rels };
}

export function fakeDb(seed = {}) {
  const tables = { owners: [], tags: [], scans: [], conversations: [], messages: [], signups: [], rate_limits: [], verifications: [], ...structuredClone(seed) };
  let seq = 1;
  const users = {};

  function project(table, row, sel) {
    const out = {};
    const fields = sel.fields.includes('*') || !sel.fields.length ? Object.keys(row) : sel.fields;
    fields.forEach(f => { out[f] = row[f]; });
    for (const r of sel.rels) {
      const rel = RELATIONS[table]?.[r.name];
      const pick = x => { const o = {}; r.fields.forEach(f => { o[f] = x[f]; }); return o; };
      if (rel.many) out[r.name] = tables[rel.table].filter(x => x[rel.foreign] === row[rel.local]).map(pick);
      else { const t = tables[rel.table].find(x => x[rel.foreign] === row[rel.local]); out[r.name] = t ? pick(t) : null; }
    }
    return out;
  }

  function query(table) {
    let op = 'select', sel = parseSelect('*'), filters = [], payload = null, opts = {}, order = null, limit = null, returning = false, upsertOpts = null;
    const q = {
      select(s, o = {}) { if (op === 'select') { sel = parseSelect(s); opts = o; } else { returning = true; sel = parseSelect(s); } return q; },
      insert(p) { op = 'insert'; payload = p; return q; },
      upsert(p, o) { op = 'upsert'; payload = p; upsertOpts = o; return q; },
      update(p) { op = 'update'; payload = p; return q; },
      delete() { op = 'delete'; return q; },
      eq(c, v) { filters.push(r => r[c] === v); return q; },
      ilike(c, v) { filters.push(r => String(r[c] ?? '').toLowerCase() === String(v).toLowerCase()); return q; },
      is(c, v) { filters.push(r => (r[c] ?? null) === v); return q; },
      not(c, o, v) { filters.push(r => !((r[c] ?? null) === v)); return q; },
      gte(c, v) { filters.push(r => r[c] >= v); return q; },
      in(c, vs) { filters.push(r => vs.includes(r[c])); return q; },
      order(c, o = {}) { order = { c, asc: o.ascending !== false }; return q; },
      limit(n) { limit = n; return q; },
      maybeSingle() { return run().then(r => ({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data })); },
      single() { return run().then(r => ({ ...r, data: Array.isArray(r.data) ? r.data[0] : r.data })); },
      then(res, rej) { return run().then(res, rej); }
    };
    function now() { return new Date(Date.now() + (seq++)).toISOString(); }
    async function run() {
      const rows = tables[table];
      const match = () => rows.filter(r => filters.every(f => f(r)));
      if (op === 'insert' || op === 'upsert') {
        const list = (Array.isArray(payload) ? payload : [payload]).map(p => {
          const row = { ...p };
          if (PK[table] === 'id' && row.id === undefined) row.id = table === 'conversations' ? `c${seq++}` : table === 'verifications' ? globalThis.crypto.randomUUID() : seq++;
          if (table === 'verifications' && row.attempts === undefined) row.attempts = 0;
          const stamps = table === 'scans' ? ['scanned_at'] : table === 'conversations' ? ['created_at', 'last_activity_at'] : table === 'rate_limits' ? ['at'] : ['created_at'];
          for (const c of stamps) if (row[c] === undefined) row[c] = now();
          return row;
        });
        const added = [];
        for (const row of list) {
          const exists = rows.find(r => r[PK[table]] === row[PK[table]]);
          if (exists) { if (op === 'upsert' && upsertOpts?.ignoreDuplicates) continue; if (op === 'insert') return { data: null, error: { message: 'duplicate key' } }; Object.assign(exists, row); added.push(exists); continue; }
          rows.push(row); added.push(row);
        }
        return { data: returning ? added.map(r => project(table, r, sel)) : null, error: null };
      }
      if (op === 'update') { const m = match(); m.forEach(r => Object.assign(r, payload)); return { data: returning ? m.map(r => project(table, r, sel)) : null, error: null }; }
      if (op === 'delete') { const m = match(); tables[table] = rows.filter(r => !m.includes(r)); return { data: null, error: null }; }
      let m = match();
      if (order) m = [...m].sort((a, b) => (a[order.c] < b[order.c] ? -1 : a[order.c] > b[order.c] ? 1 : 0) * (order.asc ? 1 : -1));
      if (limit != null) m = m.slice(0, limit);
      if (opts.head) return { data: null, count: m.length, error: null };
      return { data: m.map(r => project(table, r, sel)), count: opts.count ? m.length : undefined, error: null };
    }
    return q;
  }

  return {
    tables, users,
    from: query,
    rpc: async (fn, args) => fn === 'user_id_by_email'
      ? { data: Object.values(users).find(u => u.email.toLowerCase() === String(args.e).toLowerCase())?.id || null, error: null }
      : { data: null, error: { message: 'no such function' } },
    auth: { admin: {
      deleteUser: async id => { delete users[id]; return { error: null }; },
      createUser: async ({ email }) => { const id = 'u-' + email.split('@')[0]; users[id] = { id, email, user_metadata: {} }; return { data: { user: users[id] }, error: null }; },
      generateLink: async ({ email, options }) => ({ data: { properties: { action_link: `https://fake/magic?e=${email}&to=${options.redirectTo}` } }, error: null })
    } }
  };
}

export function mockReq({ method = 'GET', query = {}, body = {}, headers = {} } = {}) { return { method, query, body, headers }; }
export function mockRes() {
  const r = { statusCode: 200, headers: {}, body: '', headersSent: false,
    status(c) { r.statusCode = c; return r; },
    setHeader(k, v) { r.headers[k.toLowerCase()] = v; return r; },
    end(b) { r.body = b ?? ''; r.headersSent = true; } };
  r.json = () => JSON.parse(r.body);
  return r;
}
