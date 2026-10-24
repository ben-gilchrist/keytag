// Browser test of the real site page against the real server functions,
// with a fake database, fake texts/emails and a fake login service.
// Run: node test/e2e.mjs

import http from 'node:http';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { setServices } from '../lib/services.js';
import { fakeDb } from './fake-db.js';

process.env.SITE_URL = 'http://localhost:4321';
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon';
process.env.ADMIN_EMAILS = 'ben@keytag.co.uk';

const D = fakeDb({
  owners: [{ id: 'u-sam', name: 'Sam Example', email: 'sam@example.com', phone: '+447700900123' }],
  tags: [
    { code: 'AAA111', claim_key: 'PINAAA', owner_id: 'u-sam' },
    { code: 'BBB222', claim_key: 'PINBBB', owner_id: null },
    { code: 'CCC333', claim_key: 'PINCCC', owner_id: null }
  ]
});
const users = { 'u-sam': { id: 'u-sam', email: 'sam@example.com', user_metadata: {} } };
const texts = [], emails = [];
setServices({
  db: D,
  currentUser: async req => { const t = (req.headers.authorization || '').replace('Bearer ', ''); return users[t] || null; },
  sendSms: async (to, body) => { texts.push({ to, body }); },
  sendEmail: async m => { emails.push(m); },
  validTwilioRequest: () => true,
  textsEnabled: true
});

const handlers = {};
for (const f of fs.readdirSync(new URL('../api/', import.meta.url))) handlers[f.replace('.js', '')] = (await import(`../api/${f}`)).default;
const page = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname.startsWith('/api/')) {
    let raw = ''; for await (const c of req) raw += c;
    const r = { method: req.method, headers: req.headers, query: Object.fromEntries(u.searchParams), body: raw ? JSON.parse(raw) : {} };
    const out = { status(c) { res.statusCode = c; return out; }, setHeader: (k, v) => res.setHeader(k, v), end: b => res.end(b), get headersSent() { return res.headersSent; } };
    return handlers[u.pathname.slice(5)](r, out);
  }
  res.setHeader('Content-Type', 'text/html'); res.end(page);
}).listen(4321);

// Fake supabase-js: "magic links" are stored in localStorage; the test opens them.
const fakeSupabase = `window.supabase={createClient(){return{auth:{
  async getSession(){const s=localStorage.getItem('fake_session');return{data:{session:s?JSON.parse(s):null}}},
  onAuthStateChange(){},
  async signInWithOtp({email,options}){localStorage.setItem('fake_otp',JSON.stringify({email,redirect:options.emailRedirectTo,data:options.data,create:options.shouldCreateUser}));return{error:null}},
  async signOut(){localStorage.removeItem('fake_session')}}}}};`;

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
p.on('pageerror', e => errors.push(e.message));
await p.route('**/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: fakeSupabase }));
await p.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));

async function openMagicLink() {
  const otp = await p.evaluate(() => JSON.parse(localStorage.getItem('fake_otp')));
  let user = Object.values(users).find(u => u.email === otp.email);
  if (!user) { if (!otp.create) throw new Error('no account'); user = { id: 'u-' + otp.email.split('@')[0], email: otp.email, user_metadata: otp.data || {} }; users[user.id] = user; }
  await p.evaluate(id => localStorage.setItem('fake_session', JSON.stringify({ access_token: id })), user.id);
  await p.goto(otp.redirect);
}
const h1 = () => p.textContent('h1');
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) process.exitCode = 1; };

// 1. Finder scans a registered tag, says they still have the keys (number required)
await p.goto('http://localhost:4321/t/AAA111');
check((await h1()).includes('found someone'), 'QR scan of a registered tag opens the finder page');
await p.click('[data-keep]');
await p.click('#findForm button[type=submit]');
check(await p.evaluate(() => !document.getElementById('findForm').checkValidity()), '"I still have them" makes the mobile number compulsory');
await p.fill('#fPhone', '07700 900999');
await p.click('#findForm button[type=submit]');
await p.waitForSelector('text=Sent. Thank you!');
check(texts.at(-1)?.to === '+447700900123' && texts.at(-1).body.includes('I still have them'), 'owner gets the text');

// 2. Owner replies by text; finder gets it from the Keytag number
await handlers['sms-inbound']({ method: 'POST', headers: {}, body: { From: '+447700900123', Body: 'Thanks! Pop by at 6?' } }, { status() { return this; }, setHeader() {}, end() {} });
check(texts.at(-1)?.to === '+447700900999', 'owner reply relayed to finder');

// 3. Brand-new tag: scan QR (PIN inside), register, open email link → account
await p.goto('http://localhost:4321/t/BBB222/PINBBB');
check((await h1()).includes('isn\'t set up'), 'new tag QR shows set-up choice');
await p.click('text=It\'s my tag, set it up');
check(await p.locator('#rPin[type=hidden]').count() === 1, 'PIN from the QR is used, not asked for');
await p.fill('#rName', 'Ana New'); await p.fill('#rEmail', 'ana@example.com'); await p.fill('#rPhone', '07700 900222');
await p.click('#regForm button[type=submit]');
await p.waitForSelector('text=Check your email');
await openMagicLink();
await p.waitForSelector('text=Hi Ana');
check(D.tables.tags.find(t => t.code === 'BBB222').owner_id === 'u-ana', 'tag claimed by the new owner after the email link');
check(await p.locator('text=BBB-222').count() > 0, 'account shows the tag');

// 4. Owner tests their own tag: no text sent
const before = texts.length;
await p.click('[data-scan="BBB222"]');
await p.waitForSelector('text=Your tag works');
check(texts.length === before && emails.some(e => e.to === 'ana@example.com' && e.subject === 'Your Keytag works'), 'test sends an email, not a text');

// 5. Add a second tag by typing code + PIN, wrong PIN first
await p.goto('http://localhost:4321/account');
await p.waitForSelector('#addForm');
await p.fill('#aCode', 'CCC-333'); await p.fill('#aCodePin', 'WRONG1');
await p.click('#addForm button[type=submit]');
await p.waitForSelector('text=That didn’t work');
await p.goto('http://localhost:4321/account'); await p.waitForSelector('#addForm');
await p.fill('#aCode', 'ccc333'); await p.fill('#aCodePin', 'pinccc');
await p.click('#addForm button[type=submit]');
await p.waitForSelector('text=CCC-333 is set up');
check(D.tables.tags.find(t => t.code === 'CCC333').owner_id === 'u-ana', 'second tag added with typed PIN');

// 6. Update number
await p.fill('#dPhone', '07700 900333'); await p.click('#detailsForm button[type=submit]');
await p.waitForSelector('#savedMsg:not([hidden])');
check(D.tables.owners.find(o => o.id === 'u-ana').phone === '+447700900333', 'phone number updated');

// 7. Log out, log back in with the existing account
await p.click('#logout'); await p.waitForSelector('.hero-copy');
await p.goto('http://localhost:4321/login');
await p.fill('#lEmail', 'ana@example.com'); await p.click('#loginForm button[type=submit]');
await p.waitForSelector('text=Check your email');
await openMagicLink(); await p.waitForSelector('text=Hi Ana');
check(true, 'log in again with an email link');

// 8. Found keys typed code on an unregistered-but-unknown code
await p.goto('http://localhost:4321/found');
await p.fill('#codeIn', 'ZZZ999'); await p.click('#codeForm button[type=submit]');
await p.waitForSelector('text=We can’t find that tag');
check(true, 'unknown code explained');

// 9. Shop: quantity and checkout (no shop connected yet)
await p.goto('http://localhost:4321/shop');
for (let i = 0; i < 4; i++) await p.click('.pricing [data-qty="1"]');
check((await p.textContent('.total')).trim() === '£50', '5 tags cost £50');
await p.click('#checkout'); await p.waitForSelector('text=Opening soon');
check(true, 'checkout without a shop link shows "opening soon"');

// 10. Admin
await p.evaluate(() => localStorage.setItem('fake_session', JSON.stringify({ access_token: 'u-ben' })));
users['u-ben'] = { id: 'u-ben', email: 'ben@keytag.co.uk', user_metadata: {} };
await p.goto('http://localhost:4321/admin'); await p.waitForSelector('text=Activity');
check(!(await p.content()).includes('900999'), 'admin page never shows finder numbers');

check(errors.length === 0, 'no script errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await b.close(); server.close();
