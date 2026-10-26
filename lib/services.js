// Connections to Supabase, Twilio and Resend.
// Each is created lazily from environment variables. Tests swap them out with setServices().

import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';
import { Resend } from 'resend';

let overrides = null;
let cache = {};

export function setServices(s) { overrides = s; cache = {}; }

export function env(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing environment variable ${name}`);
  }
  return v;
}

export function db() {
  if (overrides?.db) return overrides.db;
  if (!cache.db) {
    cache.db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return cache.db;
}

/** Returns the logged-in Supabase user from the request's Bearer token, or null. */
export async function currentUser(req) {
  if (overrides?.currentUser) return overrides.currentUser(req);
  const h = req.headers?.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return null;
  const { data, error } = await db().auth.getUser(token);
  if (error) return null;
  return data.user || null;
}

/** True once Twilio is configured. Until then, finders and owners are contacted by email only. */
export function textsEnabled() {
  if (overrides && 'textsEnabled' in overrides) return overrides.textsEnabled;
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
}

export async function sendSms(to, body) {
  if (overrides?.sendSms) return overrides.sendSms(to, body);
  if (!textsEnabled()) { console.log('Texts not set up yet; skipped text to', to.slice(0, 6) + '…'); return null; }
  if (!cache.twilio) cache.twilio = twilio(env('TWILIO_ACCOUNT_SID'), env('TWILIO_AUTH_TOKEN'));
  return cache.twilio.messages.create({ from: env('TWILIO_PHONE_NUMBER'), to, body });
}

export async function sendEmail({ to, subject, text, html }) {
  if (overrides?.sendEmail) return overrides.sendEmail({ to, subject, text, html });
  if (!cache.resend) cache.resend = new Resend(env('RESEND_API_KEY'));
  const { error } = await cache.resend.emails.send({
    from: env('EMAIL_FROM', 'Keytag <hello@keytag.club>'),
    to, subject, text, html
  });
  if (error) throw new Error(`Email failed: ${error.message}`);
}

/** True if a Twilio webhook request really came from Twilio. */
export function validTwilioRequest(req, url) {
  if (overrides?.validTwilioRequest) return overrides.validTwilioRequest(req, url);
  const sig = req.headers['x-twilio-signature'];
  return twilio.validateRequest(env('TWILIO_AUTH_TOKEN'), sig, url, req.body || {});
}
