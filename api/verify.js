// GET /api/verify?pid=<OG-PaymentID>&ref=<our ref>&q=<participants>
// Confirms a payment with SUMIT on the server (POST /billing/payments/get/) before the success page says
// anything. Read-only: refreshing the success page never charges, records or emails anything again.
// NOTE: response field names must be checked against the official SUMIT docs before the first live test.
const { config } = require('./_workshop');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ status: 'error' }); }
  const cfg = config();
  const q = req.query || {};
  const pid = String(q.pid || '').trim(), ref = String(q.ref || '').trim(), qty = Math.max(1, parseInt(q.q, 10) || 1);
  if (cfg.mode === 'mock') return res.status(200).json({ status: q.mock === '1' ? 'paid' : 'unknown', mock: true });
  if (cfg.mode !== 'live' || !pid) return res.status(200).json({ status: 'unknown' });
  try {
    const r = await fetch('https://api.sumit.co.il/billing/payments/get/', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ Credentials: { CompanyID: Number(process.env.SUMIT_COMPANY_ID), APIKey: process.env.SUMIT_API_KEY }, PaymentID: Number(pid) || pid }),
      signal: AbortSignal.timeout(9000),
    });
    const j = await r.json().catch(() => ({}));
    const p = (j && j.Data && (j.Data.Payment || j.Data)) || {};
    if (!r.ok || !p || j.Status !== 0 && j.Status !== undefined && j.Status !== 'Success (0)') return res.status(200).json({ status: 'pending' });
    const valid = p.ValidPayment === true || p.Status === 'Success' || p.StatusDescription === 'מאושר';
    const amountOk = cfg.price ? Math.abs(Number(p.Amount) - cfg.price * qty * (cfg.vatIncluded ? 1 : 1 + cfg.vatRate)) < 0.01 : true;
    const currencyOk = !p.Currency || /ILS|1/.test(String(p.Currency));
    const refOk = !p.ExternalIdentifier || !ref || p.ExternalIdentifier === ref;
    if (valid && amountOk && currencyOk && refOk) return res.status(200).json({ status: 'paid' });
    if (p.ValidPayment === false) return res.status(200).json({ status: 'failed' });
    return res.status(200).json({ status: 'pending' });
  } catch (e) {
    console.error('verify error', e && e.message);
    return res.status(200).json({ status: 'pending' });
  }
};
