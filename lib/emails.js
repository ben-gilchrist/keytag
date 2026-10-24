// Plain, short emails. Each returns { subject, text, html }.

import { siteUrl } from './util.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function wrap(title, paragraphs, button) {
  const body = paragraphs.map(p => `<p style="margin:0 0 14px;font:16px/1.5 Arial,sans-serif;color:#141414">${p}</p>`).join('');
  const btn = button
    ? `<p style="margin:22px 0"><a href="${esc(button.href)}" style="display:inline-block;background:#141414;color:#fff;text-decoration:none;font:600 14px Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;padding:14px 22px;border-radius:12px">${esc(button.label)}</a></p>`
    : '';
  return `<div style="background:#e8e8e6;padding:24px"><div style="max-width:520px;margin:0 auto;background:#fff;border-radius:20px;padding:28px">
    <p style="margin:0 0 18px;font:800 22px Arial Narrow,Arial,sans-serif;letter-spacing:.02em">KEYTAG</p>
    <h1 style="margin:0 0 16px;font:700 26px Arial Narrow,Arial,sans-serif;text-transform:uppercase;color:#141414">${esc(title)}</h1>
    ${body}${btn}
    <p style="margin:18px 0 0;font:13px/1.5 Arial,sans-serif;color:#626260">Keytag never shares your number. ${esc(siteUrl().replace(/^https?:\/\//, ''))}</p>
  </div></div>`;
}

export function foundKeysEmail({ ownerName, code, label, message, canReply }) {
  const keys = label ? `your ${label} keys` : 'your keys';
  const first = String(ownerName || '').split(' ')[0] || 'there';
  const reply = canReply
    ? 'We’ve also sent this to you by text. Reply to that text to message the finder. Neither of you sees the other’s number.'
    : 'The finder didn’t leave a number, so head to where they said.';
  return {
    subject: 'Someone found your keys',
    text: `Hi ${first},\n\nSomeone found ${keys} (tag ${code}). They said:\n\n"${message}"\n\n${reply}\n\nKeytag`,
    html: wrap('Someone found your keys', [
      `Hi ${esc(first)}, someone found ${esc(keys)} (tag <b>${esc(code)}</b>). They said:`,
      `<span style="display:block;background:#c8dd7b;border-radius:12px;padding:14px 16px;font-size:17px">“${esc(message)}”</span>`,
      esc(reply)
    ])
  };
}

export function testEmail({ ownerName, code, phone }) {
  const first = String(ownerName || '').split(' ')[0] || 'there';
  return {
    subject: 'Your Keytag works',
    text: `Hi ${first},\n\nThis is a test. Your tag ${code} is set up. If someone finds your keys, you'll get a text at ${phone} and an email like this with their message.\n\nKeytag`,
    html: wrap('Your Keytag works', [
      `Hi ${esc(first)}, this is a test. Your tag <b>${esc(code)}</b> is set up.`,
      `If someone finds your keys, you’ll get a text at <b>${esc(phone)}</b> and an email like this with their message.`
    ])
  };
}

export function giftEmail({ fromName, toName, code }) {
  const link = `${siteUrl()}/register/${code}`;
  const from = String(fromName || '').split(' ')[0] || 'Someone';
  return {
    subject: `${from} has given you a Keytag`,
    text: `Hi ${toName || 'there'},\n\n${from} has given you their Keytag (tag ${code}). Set it up with your own details here:\n${link}\n\nKeytag`,
    html: wrap(`${from} has given you a Keytag`, [
      `Hi ${esc(toName || 'there')}, ${esc(from)} has passed their Keytag (tag <b>${esc(code)}</b>) on to you.`,
      'Register it with your own email and mobile. It takes a minute.'
    ], { href: link, label: 'Set up my Keytag' })
  };
}

export function adminScanEmail({ code, kind, message }) {
  const what = { finder: 'Finder page opened', owner_test: 'Owner test', setup: 'Set-up page opened', message: 'Finder sent a message' }[kind] || kind;
  return {
    subject: `[Keytag] ${what}: ${code}`,
    text: `${what} for tag ${code} at ${new Date().toISOString()}.${message ? `\n\nMessage: "${message}"` : ''}\n\n${siteUrl()}/admin`,
    html: wrap(`${what}: ${code}`, [
      `${esc(what)} for tag <b>${esc(code)}</b>.`,
      message ? `Message: “${esc(message)}”` : ''
    ].filter(Boolean), { href: `${siteUrl()}/admin`, label: 'Open admin' })
  };
}

export function registeredEmail({ code, phone, link, existing }) {
  const pretty = `${code.slice(0, 3)}-${code.slice(3)}`;
  const lead = existing
    ? `We’ve added Keytag ${pretty} to your account. We’ll text ${phone} if it’s found.`
    : `Your Keytag ${pretty} is registered. If someone finds your keys, we’ll text ${phone} and email you here.`;
  return {
    subject: existing ? 'Keytag added to your account' : 'Your Keytag is registered',
    text: `${lead}\n\nChange your details any time: ${link}\n\nDidn’t register a Keytag? Reply to this email and we’ll sort it out.\n\nKeytag`,
    html: wrap(existing ? 'Keytag added' : 'Your Keytag is registered', [
      esc(lead),
      'Use the button to change your mobile number or manage your tags.',
      '<span style="font-size:13px;color:#626260">Didn’t register a Keytag? Reply to this email and we’ll sort it out.</span>'
    ], { href: link, label: 'Manage my Keytag' })
  };
}

export function codeEmail({ code }) {
  return {
    subject: `${code} is your Keytag code`,
    text: `Your Keytag code is ${code}\n\nEnter it on the page to confirm your email. It expires in 15 minutes.\n\nDidn't ask for this? You can ignore this email.\n\nKeytag`,
    html: wrap('Your Keytag code', [
      'Enter this code to confirm your email. It expires in 15 minutes.',
      `<span style="display:inline-block;font:700 34px/1 'Courier New',monospace;letter-spacing:.3em;background:#e8e8e6;border-radius:12px;padding:16px 20px">${esc(code)}</span>`,
      '<span style="font-size:13px;color:#626260">Didn’t ask for this? You can ignore this email.</span>'
    ])
  };
}
