// Vercel serverless function: the site's contact form posts here (same domain, so content
// filters that block third-party form services do not block it) and this sends the email.
//
// Sending, in order of preference:
//   1. Gmail SMTP  - set GMAIL_USER and GMAIL_APP_PASSWORD in Vercel (Settings > Environment Variables)
//   2. Resend API  - set RESEND_API_KEY
//   3. FormSubmit  - no setup, but it may refuse requests coming from servers (HTTP 403)
const TO = process.env.CONTACT_TO || 'rishum.pashut@gmail.com';
const SITE = 'https://www.thirdmaster.com/';

const clean = v => String(v == null ? '' : v).trim().slice(0, 2000);
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function render(fields) {
  const rows = Object.entries(fields).map(([k, v]) =>
    `<tr><th style="text-align:right;padding:6px 10px;background:#f3f1ea">${esc(k)}</th><td style="padding:6px 10px">${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('');
  const text = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n');
  return { html: `<div dir="rtl" style="font-family:Arial,sans-serif"><table style="border-collapse:collapse;border:1px solid #ddd">${rows}</table></div>`, text };
}

async function viaGmail(subject, fields, replyTo) {
  const nodemailer = require('nodemailer');
  const t = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
  const { html, text } = render(fields);
  await t.sendMail({ from: `"אתר המאסטר השלישי" <${process.env.GMAIL_USER}>`, to: TO, subject, text, html, ...(replyTo ? { replyTo } : {}) });
}

async function viaResend(subject, fields, replyTo) {
  const { html, text } = render(fields);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.RESEND_FROM || 'Third Master <onboarding@resend.dev>', to: [TO], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!r.ok) throw new Error('Resend HTTP ' + r.status);
}

async function viaFormSubmit(subject, fields) {
  const r = await fetch('https://formsubmit.co/ajax/' + TO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: SITE.slice(0, -1), Referer: SITE },
    body: JSON.stringify({ ...fields, _subject: subject, _template: 'table', _captcha: 'false' }),
  });
  const d = await r.json().catch(() => ({}));
  if (!(r.ok && (d.success === true || d.success === 'true'))) throw new Error(d.message || 'FormSubmit HTTP ' + r.status);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }
  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  if (clean(body._honey)) return res.status(200).json({ success: true });

  const fields = {};
  for (const [k, v] of Object.entries(body)) if (!k.startsWith('_')) fields[k] = clean(v);
  if (!fields['שם'] || !fields['טלפון']) return res.status(400).json({ success: false, message: 'Missing name or phone' });
  const subject = clean(body._subject) || 'פנייה חדשה מאתר המאסטר השלישי';
  const replyTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields['מייל'] || '') ? fields['מייל'] : undefined;

  try {
    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) await viaGmail(subject, fields, replyTo);
    else if (process.env.RESEND_API_KEY) await viaResend(subject, fields, replyTo);
    else await viaFormSubmit(subject, fields);
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('contact send failed:', e && e.message);
    return res.status(502).json({ success: false, message: String((e && e.message) || 'send failed').slice(0, 200) });
  }
};
