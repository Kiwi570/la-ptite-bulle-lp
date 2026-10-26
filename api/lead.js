// POST /api/lead : enregistre une demande de maquette envoyée par le formulaire de la page.
const crypto = require('crypto');
const { LEADS_KEY, redisConfig, redis, clean, siteOk, emailOk, hash } = require('./_lib');

const MAX_PER_HOUR = 8; // demandes acceptées par adresse IP et par heure

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'methode' });
  }

  // Refuse les envois faits depuis un autre site.
  const origin = req.headers.origin;
  if (origin) {
    let originHost = '';
    try { originHost = new URL(origin).host; } catch (e) { originHost = ''; }
    if (originHost !== req.headers.host) return res.status(403).json({ ok: false, error: 'origine' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'format' });

  // Champ piège invisible : rempli uniquement par les robots. On répond « ok » sans rien enregistrer.
  if (body.lp_hp) return res.status(200).json({ ok: true });

  const type = body.type === 'activite' ? 'activite' : 'site';
  const site = clean(body.site, 300);
  const email = clean(body.email, 254).toLowerCase();
  if (!site || (type === 'site' && !siteOk(site))) return res.status(400).json({ ok: false, error: 'site' });
  if (!emailOk(email)) return res.status(400).json({ ok: false, error: 'email' });

  const cfg = redisConfig();
  if (!cfg) {
    console.error('Stockage non configuré : ajoutez Upstash Redis au projet Vercel.');
    return res.status(503).json({ ok: false, error: 'stockage' });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'inconnu';
  const limitKey = 'lpb:limite:' + hash(ip);
  const now = new Date();
  const lead = {
    id: now.getTime().toString(36) + crypto.randomBytes(3).toString('hex'),
    date: now.toISOString(),
    site,
    email,
    type,
    origine: body.origine === 'final' ? 'final' : 'hero',
    page: clean(body.page, 300)
  };

  try {
    const [count] = await redis(cfg, [['INCR', limitKey], ['EXPIRE', limitKey, '3600']]);
    if (count > MAX_PER_HOUR) return res.status(429).json({ ok: false, error: 'limite' });
    await redis(cfg, [['LPUSH', LEADS_KEY, JSON.stringify(lead)]]);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Enregistrement impossible :', error.message);
    return res.status(500).json({ ok: false, error: 'enregistrement' });
  }
};
