// GET  /api/checkout  -> public settings for the registration page (price, VAT display, participants)
// POST /api/checkout  -> validates the registration, sets the price on the server and asks SUMIT for a
//                        secure payment link (POST /billing/payments/beginredirect/). Keys never reach the browser.
//
// NOTE: the SUMIT request/response field names below follow public community integrations and must be
// checked against the official docs (developers.sumit.co.il) before the first live test.
const crypto = require('crypto');
const { config, validate } = require('./_workshop');

module.exports = async function handler(req, res) {
  const cfg = config();
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const { workshopName, price, currency, vatIncluded, vatRate, allowMultiple, maxParticipants, open, mode } = cfg;
    return res.status(200).json({ workshopName, price, currency, vatIncluded, vatRate, allowMultiple, maxParticipants, open, mode: mode === 'mock' ? 'mock' : undefined });
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ ok: false }); }
  if (!cfg.open) return res.status(503).json({ ok: false, message: 'ההרשמה בתשלום עוד לא נפתחה' });

  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  if (body._honey) return res.status(200).json({ ok: true, redirectUrl: cfg.siteUrl + '/registration-success/' });
  const v = validate(body, cfg);
  if (!v.ok) return res.status(400).json({ ok: false, errors: v.errors });
  const d = v.data;

  const quantity = 1 + d.participants.length;
  const ref = 'TM-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const pref = d.preference === 'morning' ? 'סדנת בוקר' : 'סדנת ערב';
  const back = cfg.siteUrl + '/registration-success/?ref=' + encodeURIComponent(ref) + '&q=' + quantity;

  if (cfg.mode === 'mock') {
    return res.status(200).json({ ok: true, ref, redirectUrl: back + '&mock=1' });
  }

  const customer = d.invoiceToBusiness
    ? { Name: d.businessName, CompanyNumber: d.taxId.replace(/\D/g, ''), EmailAddress: d.invoiceEmail || d.email, Phone: d.phone, Address: d.address || undefined }
    : { Name: d.fullName, EmailAddress: d.email, Phone: d.phone };
  const payload = {
    Credentials: { CompanyID: Number(process.env.SUMIT_COMPANY_ID), APIKey: process.env.SUMIT_API_KEY },
    Customer: customer,
    Items: [{ Item: { Name: cfg.workshopName + ' · ' + pref }, Quantity: quantity, UnitPrice: cfg.price, Currency: cfg.currency }],
    VATIncluded: cfg.vatIncluded,
    RedirectURL: back,
    ExternalIdentifier: ref,
    MaximumPayments: 1,
  };
  try {
    const r = await fetch('https://api.sumit.co.il/billing/payments/beginredirect/', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(9000),
    });
    const j = await r.json().catch(() => ({}));
    const url = j && j.Data && j.Data.RedirectURL;
    if (!r.ok || !url) { console.error('beginredirect failed', r.status, JSON.stringify(j).slice(0, 300)); return res.status(502).json({ ok: false, message: 'לא הצלחנו ליצור קישור לתשלום. נסו שוב בעוד רגע.' }); }
    return res.status(200).json({ ok: true, ref, redirectUrl: url });
  } catch (e) {
    console.error('beginredirect error', e && e.message);
    return res.status(502).json({ ok: false, message: 'שירות התשלום לא זמין כרגע. נסו שוב בעוד רגע.' });
  }
};
