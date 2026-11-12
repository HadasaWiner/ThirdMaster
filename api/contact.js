// Vercel serverless function: receives the site's contact form (same domain, so content filters
// that block third-party form services do not block it) and forwards it to FormSubmit server-side.
const TO = 'rishum.pashut@gmail.com';
const SITE = 'https://www.thirdmaster.com/';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }
  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  const clean = v => String(v == null ? '' : v).trim().slice(0, 2000);
  if (clean(body._honey)) return res.status(200).json({ success: true });
  if (!clean(body['שם']) || !clean(body['טלפון'])) {
    return res.status(400).json({ success: false, message: 'Missing name or phone' });
  }

  const payload = {};
  for (const [k, v] of Object.entries(body)) if (k !== '_honey') payload[k] = clean(v);
  payload._subject = payload._subject || 'פנייה חדשה מאתר המאסטר השלישי';
  payload._template = 'table';
  payload._captcha = 'false';

  try {
    const r = await fetch('https://formsubmit.co/ajax/' + TO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: SITE.slice(0, -1), Referer: SITE },
      body: JSON.stringify(payload),
    });
    const d = await r.json().catch(() => ({}));
    const ok = r.ok && (d.success === true || d.success === 'true');
    return res.status(ok ? 200 : 502).json({ success: ok, message: d.message || (ok ? 'sent' : 'HTTP ' + r.status) });
  } catch (e) {
    return res.status(502).json({ success: false, message: 'Mail service unreachable' });
  }
};
