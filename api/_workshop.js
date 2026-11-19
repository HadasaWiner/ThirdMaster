// Shared settings and validation for workshop registration (option A+: SUMIT is the source of truth).
// Everything that is still undecided is read from environment variables in Vercel, never hard-coded:
//   WORKSHOP_NAME           e.g. "סדנת המאסטר השלישי"
//   WORKSHOP_PRICE          price per participant in ILS (number). Missing = registration closed.
//   WORKSHOP_VAT_INCLUDED   "true" = price includes VAT, "false" = price is before VAT
//   WORKSHOP_VAT_RATE       e.g. "0.18" (only used for display when VAT is not included)
//   ALLOW_MULTIPLE          "true" = several participants per order
//   MAX_PARTICIPANTS        default 5
//   SUMIT_COMPANY_ID, SUMIT_API_KEY   server-side only
//   SUMIT_MODE              "live" | "mock" (mock = no real charge, for testing)
//   SITE_URL                default https://www.thirdmaster.com
const env = process.env;
const num = (v, d) => (v !== undefined && v !== '' && !isNaN(+v) ? +v : d);

function config() {
  const price = num(env.WORKSHOP_PRICE, null);
  const mode = env.SUMIT_MODE === 'mock' ? 'mock'
    : (env.SUMIT_COMPANY_ID && env.SUMIT_API_KEY ? 'live' : 'unconfigured');
  return {
    workshopName: env.WORKSHOP_NAME || 'סדנת המאסטר השלישי',
    price, currency: 'ILS',
    vatIncluded: env.WORKSHOP_VAT_INCLUDED !== 'false',
    vatRate: num(env.WORKSHOP_VAT_RATE, 0.18),
    allowMultiple: env.ALLOW_MULTIPLE === 'true',
    maxParticipants: Math.max(1, Math.min(20, num(env.MAX_PARTICIPANTS, 5))),
    mode,
    open: price !== null && price > 0 && mode !== 'unconfigured',
    siteUrl: (env.SITE_URL || 'https://www.thirdmaster.com').replace(/\/$/, ''),
  };
}

const OCCUPATIONS = ['ייעוץ פרישה', 'ייעוץ משכנתאות', 'ראיית חשבון / ייעוץ מס', 'חשבות שכר', 'ייעוץ פיננסי', 'אחר'];
const clean = (v, n = 200) => String(v == null ? '' : v).trim().slice(0, n);
const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const phoneOk = v => { const p = v.replace(/[\s\-().]/g, ''); return /^0(?:5\d|7\d|[23489])\d{7}$/.test(p) || /^\+972(?:5\d|7\d|[23489])\d{7}$/.test(p) || /^\+(?!972)\d{8,15}$/.test(p); };
// Israeli ID / company number (ח.פ / ע.מ) check digit
const taxIdOk = v => { const d = v.replace(/\D/g, ''); if (!d || d.length > 9) return false; const s = d.padStart(9, '0'); let sum = 0; for (let i = 0; i < 9; i++) { let x = +s[i] * ((i % 2) + 1); if (x > 9) x -= 9; sum += x; } return sum % 10 === 0; };

function validate(body, cfg) {
  const e = {}, b = body || {};
  const r = {
    preference: clean(b.preference, 10), fullName: clean(b.fullName, 80), email: clean(b.email, 120).toLowerCase(),
    phone: clean(b.phone, 30), occupation: clean(b.occupation, 40), occupationOther: clean(b.occupationOther, 80),
    office: clean(b.office, 120), invoiceToBusiness: !!b.invoiceToBusiness,
    businessName: clean(b.businessName, 120), taxId: clean(b.taxId, 12), address: clean(b.address, 200), invoiceEmail: clean(b.invoiceEmail, 120).toLowerCase(),
    acceptTerms: !!b.acceptTerms, acceptPrivacy: !!b.acceptPrivacy, marketing: !!b.marketing, participants: [],
  };
  if (!['morning', 'evening'].includes(r.preference)) e.preference = 'נא לבחור סדנת בוקר או ערב';
  if (!r.fullName) e.fullName = 'נא למלא שם מלא';
  if (!emailOk(r.email)) e.email = 'כתובת המייל לא תקינה';
  if (!phoneOk(r.phone)) e.phone = 'מספר הטלפון לא תקין';
  if (!OCCUPATIONS.includes(r.occupation)) e.occupation = 'נא לבחור תחום עיסוק';
  if (r.occupation === 'אחר' && !r.occupationOther) e.occupationOther = 'נא לפרט את תחום העיסוק';
  if (r.invoiceToBusiness) {
    if (!r.businessName) e.businessName = 'נא למלא את שם העסק לחשבונית';
    if (!taxIdOk(r.taxId)) e.taxId = 'מספר ח.פ / ע.מ לא תקין';
    if (r.invoiceEmail && !emailOk(r.invoiceEmail)) e.invoiceEmail = 'כתובת המייל לחשבונית לא תקינה';
  }
  if (!r.acceptTerms) e.acceptTerms = 'נדרש אישור תנאי ההרשמה ומדיניות הביטולים';
  if (!r.acceptPrivacy) e.acceptPrivacy = 'נדרש אישור מדיניות הפרטיות';
  // participants: the registrant is participant 1; extra participants only when allowed
  const extra = Array.isArray(b.participants) ? b.participants : [];
  if (extra.length && !cfg.allowMultiple) e.participants = 'אפשר להירשם כרגע למשתתף אחד בלבד';
  if (1 + extra.length > cfg.maxParticipants) e.participants = 'מספר המשתתפים גדול מהמותר';
  extra.forEach((p, i) => { const name = clean(p && p.name, 80), email = clean(p && p.email, 120).toLowerCase();
    if (!name) e['p' + i + 'name'] = 'נא למלא שם משתתף'; if (!emailOk(email)) e['p' + i + 'email'] = 'מייל משתתף לא תקין';
    r.participants.push({ name, email }); });
  return { ok: Object.keys(e).length === 0, errors: e, data: r };
}

module.exports = { config, validate, taxIdOk, phoneOk, emailOk, OCCUPATIONS };
