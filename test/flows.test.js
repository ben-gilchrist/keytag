// End-to-end checks of the server functions against a fake database, texts and emails.
// Run: npm test

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setServices } from '../lib/services.js';
import { fakeDb, mockReq, mockRes } from './fake-db.js';
import { normPhone, gsm, randomCode, CODE_ALPHABET } from '../lib/util.js';

import scan from '../api/scan.js';
import message from '../api/message.js';
import inbound from '../api/sms-inbound.js';
import claim from '../api/claim.js';
import me from '../api/me.js';
import tag from '../api/tag.js';
import admin from '../api/admin.js';
import signup from '../api/signup.js';
import register from '../api/register.js';

process.env.SITE_URL = 'https://keytag.co.uk';
process.env.ADMIN_EMAILS = 'ben@keytag.co.uk';

let D, texts, emails;
const USERS = {
  sam: { id: 'u-sam', email: 'sam@example.com', user_metadata: { name: 'Sam Example', phone: '07700 900123' } },
  ana: { id: 'u-ana', email: 'ana@example.com', user_metadata: { name: 'Ana New', phone: '07700 900222' } },
  ben: { id: 'u-ben', email: 'ben@keytag.co.uk', user_metadata: {} }
};

beforeEach(() => {
  D = fakeDb({
    owners: [{ id: 'u-sam', name: 'Sam Example', email: 'sam@example.com', phone: '+447700900123' }],
    tags: [
      { code: 'AAA111', owner_id: 'u-sam', batch: 'test' },
      { code: 'BBB222', owner_id: null, batch: 'test' },
      { code: 'CCC333', owner_id: null, batch: 'test' }
    ]
  });
  texts = []; emails = [];
  setServices({
    db: D,
    currentUser: async req => USERS[(req.headers.authorization || '').replace('Bearer ', '')] || null,
    sendSms: async (to, body) => { texts.push({ to, body }); },
    sendEmail: async m => { emails.push(m); },
    validTwilioRequest: req => req.headers['x-twilio-signature'] === 'ok',
    textsEnabled: true
  });
});


// Registration is two steps: start (codes sent) then verify (codes entered).
const lastCode = (to) => { const e = [...emails].reverse().find(m => m.to === to && /Keytag code/.test(m.subject)); return e && e.subject.slice(0, 6); };
const lastTextCode = (to) => { const t = [...texts].reverse().find(m => m.to === to && /Keytag code is/.test(m.body)); return t && t.body.match(/\d{6}/)[0]; };
async function registerFull(body, headers = {}) {
  const s1 = await call(register, { method: 'POST', body, headers });
  if (s1.status !== 200) return s1;
  const email = String(body.email).trim().toLowerCase();
  return call(register, { method: 'POST', headers, body: { id: s1.body.id, emailCode: lastCode(email), phoneCode: s1.body.phoneSent ? lastTextCode(s1.body.phone) : undefined } });
}

async function call(h, opts) { const res = mockRes(); await h(mockReq(opts), res); return { status: res.statusCode, body: res.headers['content-type']?.includes('json') ? res.json() : res.body }; }
const as = who => ({ authorization: `Bearer ${who}` });
const sms = (from, Body) => call(inbound, { method: 'POST', headers: { 'x-twilio-signature': 'ok' }, body: { From: from, Body } });

test('helpers: phone numbers, plain-text SMS, codes', () => {
  assert.equal(normPhone('07700 900123'), '+447700900123');
  assert.equal(normPhone('+44 7700 900123'), '+447700900123');
  assert.equal(normPhone('0044 7700 900123'), '+447700900123');
  assert.equal(normPhone('020 7946 0000'), null);            // landline
  assert.equal(normPhone('hello'), null);
  assert.equal(gsm('It’s “here” – ok 😀'), 'It\'s "here" - ok ');
  const c = randomCode(6);
  assert.equal(c.length, 6);
  assert.ok([...c].every(ch => CODE_ALPHABET.includes(ch)));
  assert.ok(!/[0O1IL2Z5S8B]/.test(CODE_ALPHABET));
});

test('scan: unknown, finder, set-up and owner test', async () => {
  assert.equal((await call(scan, { query: { code: 'ZZZ999' } })).body.status, 'unknown');
  assert.equal((await call(scan, { query: { code: 'aaa-111' } })).body.status, 'registered');
  assert.equal((await call(scan, { query: { code: 'bbb-222' } })).body.status, 'unregistered');
  assert.equal((await call(scan, { query: { code: 'BBB222' } })).body.status, 'unregistered');
  const mine = await call(scan, { query: { code: 'AAA111' }, headers: as('sam') });
  assert.equal(mine.body.status, 'yours');
  assert.ok(emails.some(e => e.subject === 'Your Keytag works'));
  assert.equal(D.tables.scans.length, 4);
  assert.ok(emails.some(e => e.subject.startsWith('[Keytag]')), 'admin told about scans');
});

test('finder message: owner gets a text and email, no number leaks', async () => {
  const r = await call(message, { method: 'POST', body: { code: 'AAA111', body: 'Handed in at the café on Old Street', allowContact: true, phone: '07700 900999' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.canReply, true);
  const t = texts.find(x => x.to === '+447700900123');
  assert.ok(t && t.body.includes('Handed in at the caf'), 'owner texted');
  assert.ok(!t.body.includes('900999'), 'finder number not in owner text');
  assert.ok(/^[\x20-\x7E£]*$/.test(t.body.replace(/é/g, '')), 'plain characters only');
  assert.ok(emails.some(e => e.to === 'sam@example.com' && e.subject === 'Someone found your keys'));
  assert.equal(D.tables.conversations[0].finder_phone, '+447700900999');
});

test('finder message: needs a valid number when contact is allowed; unregistered tags refused; rate limited', async () => {
  assert.equal((await call(message, { method: 'POST', body: { code: 'AAA111', body: 'x', allowContact: true, phone: 'nope' } })).status, 400);
  assert.equal((await call(message, { method: 'POST', body: { code: 'BBB222', body: 'Found them' } })).status, 404);
  for (let i = 0; i < 5; i++) assert.equal((await call(message, { method: 'POST', body: { code: 'AAA111', body: `msg ${i}` } })).status, 200);
  assert.equal((await call(message, { method: 'POST', body: { code: 'AAA111', body: 'one too many' } })).status, 429);
});

test('text relay: owner and finder reply to each other through the Keytag number', async () => {
  await call(message, { method: 'POST', body: { code: 'AAA111', body: 'I still have them', allowContact: true, phone: '07700900999' } });
  texts = [];
  await sms('+447700900123', 'Thank you! Can I collect at 6?');
  assert.deepEqual(texts.map(t => t.to), ['+447700900999']);
  assert.ok(texts[0].body.includes('Can I collect at 6?'));
  assert.ok(!texts[0].body.includes('900123'), 'owner number hidden');
  texts = [];
  await sms('+447700900999', 'Yes, see you then');
  assert.deepEqual(texts.map(t => t.to), ['+447700900123']);
  assert.equal(D.tables.messages.length, 3);
});

test('text relay: owner reply when finder left no number gets a polite explanation', async () => {
  await call(message, { method: 'POST', body: { code: 'AAA111', body: 'At the bar' } });
  texts = [];
  const r = await sms('+447700900123', 'Thanks');
  assert.equal(texts.length, 0);
  assert.match(r.body, /didn&apos;t leave a number/);
});

test('text relay: a stranger can report keys by texting the tag code', async () => {
  const r = await sms('+447700900555', 'aaa-111 left them with the barman at the Crown');
  assert.match(r.body, /passed your message/);
  assert.equal(texts[0].to, '+447700900123');
  assert.ok(texts[0].body.includes('left them with the barman'));
  const help = await sms('+447700900556', 'hello?');
  assert.match(help.body, /text the 6-character code/);
});

test('text relay: rejects requests not signed by Twilio, ignores STOP', async () => {
  const r = await call(inbound, { method: 'POST', headers: { 'x-twilio-signature': 'bad' }, body: { From: '+447700900123', Body: 'hi' } });
  assert.equal(r.status, 403);
  const stop = await sms('+447700900123', 'STOP');
  assert.equal(stop.body, '<?xml version="1.0" encoding="UTF-8"?><Response/>');
});

test('register: code + email + mobile, no PIN', async () => {
  const ok = await registerFull({ code: 'bbb-222', email: 'Ana@Example.com', phone: '07700 900222', label: 'House' });
  assert.deepEqual([ok.status, ok.body.ok, ok.body.existing], [200, true, false]);
  const t = D.tables.tags.find(x => x.code === 'BBB222');
  assert.equal(t.label, 'House');
  const owner = D.tables.owners.find(o => o.id === t.owner_id);
  assert.deepEqual([owner.email, owner.phone], ['ana@example.com', '+447700900222']);
  const mail = emails.find(e => e.to === 'ana@example.com' && !/code/.test(e.subject));
  assert.equal(mail.subject, 'Your Keytag is registered');
  assert.ok(mail.text.includes('https://fake/magic'), 'email has a manage link');
});

test('register: code not found, already registered, bad details', async () => {
  const nf = await call(register, { method: 'POST', body: { code: 'ZZZ999', email: 'a@b.com', phone: '07700900222' } });
  assert.equal(nf.status, 404);
  assert.match(nf.body.error, /Code not found/);
  const taken = await call(register, { method: 'POST', body: { code: 'AAA111', email: 'x@y.com', phone: '07700900222' } });
  assert.deepEqual([taken.status, taken.body.registered], [409, true]);
  assert.equal(D.tables.tags.find(x => x.code === 'AAA111').owner_id, 'u-sam', 'existing owner untouched');
  assert.equal((await call(register, { method: 'POST', body: { code: 'BBB222', email: 'nope', phone: '07700900222' } })).status, 400);
  assert.equal((await call(register, { method: 'POST', body: { code: 'BBB222', email: 'a@b.com', phone: '12345' } })).status, 400);
});

test('register: one email, many tags (one account, existing number kept)', async () => {
  const a = await registerFull({ code: 'BBB222', email: 'sam@example.com', phone: '07700 900444', label: 'Car' });
  assert.deepEqual([a.status, a.body.existing, a.body.phone], [200, true, '+447700900123']);
  const b = await registerFull({ code: 'CCC333', email: 'SAM@example.com', phone: '07700 900555', label: 'Bike' });
  assert.equal(b.body.existing, true);
  assert.equal(D.tables.owners.length, 1);
  assert.equal(D.tables.owners[0].phone, '+447700900123', 'a stranger can’t change the number');
  const mine = await call(me, { headers: as('sam') });
  assert.deepEqual(mine.body.tags.map(t => t.label ?? null).sort(), ['Bike', 'Car', null].sort());
  // finder message names the keys
  await call(message, { method: 'POST', body: { code: 'BBB222', body: 'At the gym' } });
  assert.ok(texts.at(-1).body.includes('found your Car keys'));
});

test('register: codes are checked, single use, limited tries; existing customers skip the text code', async () => {
  // new customer: email code + text code
  const s1 = await call(register, { method: 'POST', body: { code: 'BBB222', email: 'new@example.com', phone: '07700 900666' } });
  assert.deepEqual([s1.status, s1.body.emailSent, s1.body.phoneSent], [200, true, true]);
  assert.equal(D.tables.tags.find(t => t.code === 'BBB222').owner_id, null, 'nothing registered before codes are checked');
  const emailCode = lastCode('new@example.com'), textCode = lastTextCode('+447700900666');
  assert.match(emailCode, /^\d{6}$/); assert.match(textCode, /^\d{6}$/);
  assert.ok(!JSON.stringify(D.tables.verifications).includes(emailCode), 'codes stored hashed');
  const wrong = await call(register, { method: 'POST', body: { id: s1.body.id, emailCode, phoneCode: '000000' } });
  assert.equal(wrong.status, 400); assert.match(wrong.body.error, /text code/);
  const ok = await call(register, { method: 'POST', body: { id: s1.body.id, emailCode, phoneCode: textCode } });
  assert.equal(ok.status, 200);
  assert.equal((await call(register, { method: 'POST', body: { id: s1.body.id, emailCode, phoneCode: textCode } })).status, 400, 'single use');
  // 5 wrong tries locks it
  const s2 = await call(register, { method: 'POST', body: { code: 'CCC333', email: 'x@example.com', phone: '07700 900777' } });
  for (let i = 0; i < 5; i++) await call(register, { method: 'POST', body: { id: s2.body.id, emailCode: '111111', phoneCode: '111111' } });
  assert.equal((await call(register, { method: 'POST', body: { id: s2.body.id, emailCode: lastCode('x@example.com'), phoneCode: lastTextCode('+447700900777') } })).status, 429);
  // existing customer: email code only
  const s3 = await call(register, { method: 'POST', body: { code: 'CCC333', email: 'sam@example.com', phone: '07700 900888' } });
  assert.deepEqual([s3.body.emailSent, s3.body.phoneSent], [true, false]);
});

test('register: before texts are live, email code only', async () => {
  setServices({ db: D, currentUser: async () => null, sendSms: async (to, body) => { texts.push({ to, body }); }, sendEmail: async m => { emails.push(m); }, textsEnabled: false });
  const s1 = await call(register, { method: 'POST', body: { code: 'BBB222', email: 'early@example.com', phone: '07700 900666' } });
  assert.equal(s1.body.phoneSent, false);
  assert.equal(texts.length, 0);
  assert.equal((await call(register, { method: 'POST', body: { id: s1.body.id, emailCode: lastCode('early@example.com') } })).status, 200);
});

test('changing your mobile needs a texted code', async () => {
  const r = await call(me, { method: 'PATCH', headers: as('sam'), body: { name: 'Sam', phone: '07700 900999' } });
  assert.equal(r.body.needCode, true);
  assert.equal(D.tables.owners[0].phone, '+447700900123', 'not changed yet');
  assert.equal((await call(me, { method: 'PATCH', headers: as('sam'), body: { id: r.body.id, phoneCode: '000000' } })).status, 400);
  const ok = await call(me, { method: 'PATCH', headers: as('sam'), body: { id: r.body.id, phoneCode: lastTextCode('+447700900999') } });
  assert.equal(ok.body.owner.phone, '+447700900999');
  assert.equal(D.tables.owners[0].phone, '+447700900999');
});

test('register and code lookups are rate limited per IP', async () => {
  const ip = { 'x-forwarded-for': '1.2.3.4' };
  for (let i = 0; i < 30; i++) await call(scan, { query: { code: `ZZZ${String(i).padStart(3, '0')}` }, headers: ip });
  assert.equal((await call(scan, { query: { code: 'AAA111' }, headers: ip })).status, 429);
  assert.equal((await call(scan, { query: { code: 'AAA111' }, headers: { 'x-forwarded-for': '5.6.7.8' } })).body.status, 'registered');
  for (let i = 0; i < 10; i++) await call(register, { method: 'POST', body: { code: 'ZZZ999' }, headers: ip });
  assert.equal((await call(register, { method: 'POST', body: { code: 'BBB222', email: 'a@b.com', phone: '07700900222' }, headers: ip })).status, 429);
});

test('claim (logged in): add a tag, someone else can’t take it', async () => {
  assert.equal((await call(claim, { method: 'POST', body: { code: 'BBB222' } })).status, 401);
  const ok = await call(claim, { method: 'POST', headers: as('ana'), body: { code: 'BBB222', label: 'Office' } });
  assert.deepEqual([ok.status, ok.body.ok, ok.body.newOwner], [200, true, true]);
  assert.equal(D.tables.owners.find(o => o.id === 'u-ana').phone, '+447700900222');
  assert.equal(D.tables.tags.find(t => t.code === 'BBB222').label, 'Office');
  assert.equal((await call(claim, { method: 'POST', headers: as('sam'), body: { code: 'BBB222' } })).status, 409);
  assert.equal((await call(claim, { method: 'POST', headers: as('sam'), body: { code: 'ZZZ999' } })).status, 404);
});

test('claim: existing owner adding a tag keeps their details', async () => {
  D.tables.owners[0].phone = '+447700900777';
  const r = await call(claim, { method: 'POST', headers: as('sam'), body: { code: 'CCC333' } });
  assert.equal(r.body.newOwner, false);
  assert.equal(D.tables.owners[0].phone, '+447700900777');
});

test('account: see tags and messages without finder numbers, update details, delete', async () => {
  await call(message, { method: 'POST', body: { code: 'AAA111', body: 'At reception', allowContact: true, phone: '07700900999' } });
  const r = await call(me, { headers: as('sam') });
  assert.equal(r.body.tags.length, 1);
  assert.equal(r.body.conversations[0].canReply, true);
  assert.ok(!JSON.stringify(r.body).includes('900999'), 'finder number never sent to browser');
  assert.equal((await call(me, { method: 'PATCH', headers: as('sam'), body: { name: 'Sam E', phone: '020 7946 0000' } })).status, 400);
  assert.equal((await call(me, { method: 'PATCH', headers: as('sam'), body: { name: 'Sam E', phone: '07700 900888' } })).body.needCode, true);
  await call(me, { method: 'DELETE', headers: as('sam') });
  assert.equal(D.tables.owners.length, 0);
  assert.equal(D.tables.tags.find(t => t.code === 'AAA111').owner_id, null);
});

test('tags: rename, gift (register link), remove', async () => {
  await call(tag, { method: 'POST', headers: as('sam'), body: { action: 'label', code: 'AAA111', label: 'House' } });
  assert.equal(D.tables.tags.find(x => x.code === 'AAA111').label, 'House');
  const g = await call(tag, { method: 'POST', headers: as('sam'), body: { action: 'gift', code: 'AAA111', name: 'Jo', email: 'jo@example.com' } });
  assert.equal(g.status, 200);
  const t = D.tables.tags.find(x => x.code === 'AAA111');
  assert.deepEqual([t.owner_id, t.label], [null, null]);
  assert.ok(emails.find(e => e.to === 'jo@example.com').text.includes('/register/AAA111'));
  await call(claim, { method: 'POST', headers: as('sam'), body: { code: 'CCC333' } });
  await call(tag, { method: 'POST', headers: as('sam'), body: { action: 'remove', code: 'CCC333' } });
  assert.equal(D.tables.tags.find(x => x.code === 'CCC333').owner_id, null);
  assert.equal((await call(tag, { method: 'POST', headers: as('ana'), body: { action: 'remove', code: 'BBB222' } })).status, 404);
});

test('admin: staff only, no finder numbers', async () => {
  await call(message, { method: 'POST', body: { code: 'AAA111', body: 'Here', allowContact: true, phone: '07700900999' } });
  assert.equal((await call(admin, { headers: as('sam') })).status, 403);
  const r = await call(admin, { headers: as('ben') });
  assert.equal(r.status, 200);
  assert.equal(r.body.stats.tagsActive, 1);
  assert.ok(!JSON.stringify(r.body).includes('900999'));
});

test('signup list', async () => {
  assert.equal((await call(signup, { method: 'POST', body: { email: 'x' } })).status, 400);
  assert.equal((await call(signup, { method: 'POST', body: { email: 'A@b.com' } })).status, 200);
  await call(signup, { method: 'POST', body: { email: 'a@b.com' } });
  assert.equal(D.tables.signups.length, 1);
});

test('before the Twilio number is live: email only, finder numbers ignored', async () => {
  setServices({ db: D, currentUser: async () => null, sendSms: async (to, body) => { texts.push({ to, body }); }, sendEmail: async m => { emails.push(m); }, textsEnabled: false });
  const r = await call(message, { method: 'POST', body: { code: 'AAA111', body: 'At reception', allowContact: true, phone: '07700900999' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.canReply, false);
  assert.equal(D.tables.conversations[0].finder_phone, null);
  assert.ok(emails.some(e => e.to === 'sam@example.com'));
});
