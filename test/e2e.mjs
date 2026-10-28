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
process.env.ADMIN_EMAILS = 'ben@keytag.club';

const D = fakeDb({
  owners: [{ id: 'u-sam', name: 'Sam Example', email: 'sam@example.com', phone: '+447700900123' }],
  tags: [
    { code: 'AAA111', owner_id: 'u-sam' },
    { code: 'BBB222', owner_id: null },
    { code: 'CCC333', owner_id: null }
  ]
});
const users = D.users; users['u-sam'] = { id: 'u-sam', email: 'sam@example.com', user_metadata: {} };
const texts = [], emails = [];
const SVC = {
  db: D,
  inStock: null,
  currentUser: async req => { const t = (req.headers.authorization || '').replace('Bearer ', ''); return users[t] || null; },
  sendSms: async (to, body) => { texts.push({ to, body }); },
  sendEmail: async m => { emails.push(m); },
  validTwilioRequest: () => true,
  textsEnabled: true
};
setServices(SVC);

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

// 3. Register: header button → code → email + mobile → Save (no PIN, no email step)
await p.goto('http://localhost:4321/');
await p.click('header [data-go="register"]');
await p.fill('#rCode', 'ZZZ999'); await p.click('#regCode button[type=submit]');
await p.waitForSelector('#rCodeErr:not([hidden])');
check((await p.textContent('#rCodeErr')).includes('Code not found'), 'unknown code shows "Code not found"');
await p.fill('#rCode', 'bbb-222'); await p.click('#regCode button[type=submit]');
await p.waitForSelector('#regForm');
await p.fill('#rEmail', 'ana@example.com'); await p.fill('#rPhone', '07700 900222'); await p.fill('#rLabel', 'House');
await p.click('#regForm button[type=submit]');
await p.waitForSelector('#verifyForm');
check(D.tables.tags.find(t => t.code === 'BBB222').owner_id == null, 'nothing registered until the codes are entered');
const emailCode = [...emails].reverse().find(m => m.to === 'ana@example.com' && /Keytag code/.test(m.subject)).subject.slice(0, 6);
const textCode = [...texts].reverse().find(m => m.to === '+447700900222' && /Keytag code is/.test(m.body)).body.match(/\d{6}/)[0];
await p.fill('#vEmail', '000000'); await p.fill('#vPhone', textCode); await p.click('#verifyForm button[type=submit]');
await p.waitForSelector('#verifyErr:not([hidden])');
check((await p.textContent('#verifyErr')).includes('email code'), 'wrong email code is caught');
await p.fill('#vEmail', emailCode); await p.click('#verifyForm button[type=submit]');
await p.waitForSelector('text=Your Keytag is registered');
const anaTag = D.tables.tags.find(t => t.code === 'BBB222');
const ana = D.tables.owners.find(o => o.email === 'ana@example.com');
check(ana && anaTag.owner_id === ana.id && anaTag.label === 'House' && ana.phone === '+447700900222', 'tag registered with email, mobile and name straight away');
check(emails.some(e => e.to === 'ana@example.com' && e.subject === 'Your Keytag is registered'), 'confirmation email with manage link sent');

// 3b. Code already used → invited to enter email to edit details
await p.click('text=Register another tag');
await p.fill('#rCode', 'AAA111'); await p.click('#regCode button[type=submit]');
await p.waitForSelector('text=This Keytag is already registered');
await p.fill('#tEmail', 'someone@example.com'); await p.click('#takenForm button[type=submit]');
await p.waitForSelector('#takenMsg:not([hidden])');
check(true, 'registered code invites you to get an edit link by email');

// 3c. Scanning a brand-new tag's QR also leads to register
await p.goto('http://localhost:4321/t/CCC333');
await p.waitForSelector('#regForm');
check(new URL(p.url()).pathname === '/scan/CCC-333', 'new tag QR → set-up form on /scan/CODE');
await p.goto('http://localhost:4321/scan');
await p.fill('#codeIn', 'aaa-111'); await p.click('#codeForm button[type=submit]');
await p.waitForSelector('#findForm');
check(new URL(p.url()).pathname === '/scan/AAA-111', '/scan code entry → finder page');

// 4. Log in, test own tag: no text sent
await p.goto('http://localhost:4321/login');
await p.fill('#lEmail', 'ana@example.com'); await p.click('#loginForm button[type=submit]');
await p.waitForSelector('text=Check your email');
await openMagicLink();
await p.waitForSelector('text=Your Keytags');
check(await p.locator('.tagrow >> text=House').count() === 1, 'account shows the tag by its name');
const before = texts.length;
await p.click('[data-scan="BBB222"]');
await p.waitForSelector('text=Your tag works');
check(texts.length === before && emails.some(e => e.to === 'ana@example.com' && e.subject === 'Your Keytag works'), 'test sends an email, not a text');

// 5. Add a second tag from the account, by code only
await p.goto('http://localhost:4321/account'); await p.waitForSelector('#addForm');
await p.fill('#aCode', 'ccc-333'); await p.fill('#aLabel2', 'Car');
await p.click('#addForm button[type=submit]');
await p.waitForSelector('text=CCC-333 is added');
check(D.tables.tags.find(t => t.code === 'CCC333').owner_id === ana.id, 'second tag added to the same account');

// 6. Update number
await p.fill('#dPhone', '07700 900333'); await p.click('#detailsForm button[type=submit]');
await p.waitForSelector('#phoneCodeForm');
await p.fill('#pcCode', [...texts].reverse().find(m => m.to === '+447700900333').body.match(/\d{6}/)[0]);
await p.click('#phoneCodeForm button[type=submit]');
await p.waitForSelector('text=Number confirmed and saved.');
check(D.tables.owners.find(o => o.email === 'ana@example.com').phone === '+447700900333', 'new phone number confirmed with a texted code');

// 7. Log out, log back in with the existing account
await p.click('#logout'); await p.waitForSelector('.hero-copy');
await p.goto('http://localhost:4321/login');
await p.fill('#lEmail', 'ana@example.com'); await p.click('#loginForm button[type=submit]');
await p.waitForSelector('text=Check your email');
await openMagicLink(); await p.waitForSelector('text=Your Keytags');
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
users['u-ben'] = { id: 'u-ben', email: 'ben@keytag.club', user_metadata: {} };
await p.goto('http://localhost:4321/admin'); await p.waitForSelector('text=Activity');
check(!(await p.content()).includes('900999'), 'admin page never shows finder numbers');

// Sold out: the shop shows a back-in-stock email box instead of Checkout
SVC.inStock = false;
await p.goto('http://localhost:4321/shop');
await p.waitForSelector('#restockForm');
check(!(await p.$('#checkout')), 'sold out hides Checkout');
await p.fill('#rsEmail', 'waiting@example.com'); await p.click('#restockForm button');
await p.waitForSelector('#rsMsg:not([hidden])');
check(D.tables.restock_requests.some(r => r.email === 'waiting@example.com'), 'sold out: back-in-stock email saved');
SVC.inStock = null;

check(errors.length === 0, 'no script errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await b.close(); server.close();
