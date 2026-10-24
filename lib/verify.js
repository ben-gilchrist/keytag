// 6-digit codes that prove someone owns an email address or mobile number.
// Codes are stored hashed, expire after 15 minutes, and allow 5 wrong tries.

import { createHash, randomInt } from 'node:crypto';
import { db, sendEmail, sendSms } from './services.js';
import { codeEmail } from './emails.js';

export const CODE_TTL_MIN = 15;
export const MAX_ATTEMPTS = 5;

export const newCode = () => String(randomInt(0, 1000000)).padStart(6, '0');
const salt = () => process.env.CODE_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'keytag';
export const hashCode = (id, code) => createHash('sha256').update(`${salt()}:${id}:${String(code).replace(/\D/g, '')}`).digest('hex');

/** Creates a verification and sends the codes. Returns { id, emailSent, phoneSent }. */
export async function startVerification({ purpose, tagCode = null, ownerId = null, email = null, phone = null, label = null, sendEmailCode, sendPhoneCode }) {
  const { data: row, error } = await db().from('verifications').insert({
    purpose, tag_code: tagCode, owner_id: ownerId, email, phone, label,
    expires_at: new Date(Date.now() + CODE_TTL_MIN * 60 * 1000).toISOString()
  }).select('id').single();
  if (error) throw error;

  const emailCode = sendEmailCode ? newCode() : null;
  const phoneCode = sendPhoneCode ? newCode() : null;
  await db().from('verifications').update({
    email_code_hash: emailCode ? hashCode(row.id, emailCode) : null,
    phone_code_hash: phoneCode ? hashCode(row.id, phoneCode) : null
  }).eq('id', row.id);

  if (emailCode) await sendEmail({ to: email, ...codeEmail({ code: emailCode }) });
  if (phoneCode) await sendSms(phone, `Your Keytag code is ${phoneCode}. It expires in ${CODE_TTL_MIN} minutes. Don't share it with anyone.`);
  return { id: row.id, emailSent: !!emailCode, phoneSent: !!phoneCode };
}

/** Checks the codes. Returns { row } on success or { error, status } on failure. Each verification works once. */
export async function checkVerification(id, { emailCode, phoneCode }, purpose) {
  if (!/^[0-9a-z-]{8,}$/i.test(String(id || ''))) return { status: 400, error: 'Please start again.' };
  const { data: row } = await db().from('verifications').select('*').eq('id', id).maybeSingle();
  if (!row || row.purpose !== purpose) return { status: 400, error: 'Please start again.' };
  if (new Date(row.expires_at) < new Date()) return { status: 410, error: 'Those codes have expired. Send new ones.' };
  if (row.attempts >= MAX_ATTEMPTS) return { status: 429, error: 'Too many wrong codes. Send new ones.' };

  const emailOk = !row.email_code_hash || row.email_code_hash === hashCode(id, emailCode || '');
  const phoneOk = !row.phone_code_hash || row.phone_code_hash === hashCode(id, phoneCode || '');
  if (!emailOk || !phoneOk) {
    await db().from('verifications').update({ attempts: row.attempts + 1 }).eq('id', id);
    const which = !emailOk && !phoneOk ? 'Both codes are' : !emailOk ? 'The email code is' : 'The text code is';
    return { status: 400, error: `${which} not right. Check and try again.`, emailOk, phoneOk };
  }
  await db().from('verifications').delete().eq('id', id);   // single use
  return { row };
}
