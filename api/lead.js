// POST /api/lead : enregistre une demande de maquette envoyée par le formulaire de la page.
const crypto = require('crypto');
const { LEADS_KEY, redisConfig, redis, clean, siteOk, emailOk, hash } = require('./_lib');

const MAX_PER_HOUR = 8; // demandes acceptées par adresse IP et par heure
const SAME_REQUEST_TTL = 7 * 24 * 3600; // une même demande (type + site + e-mail) n’est enregistrée qu’une fois sur 7 jours

// Anti-doublon : la clé de la demande et son ajout à la liste sont écrits d’un seul coup (script atomique).
// Si la réponse se perd après l’enregistrement, un nouvel essai retrouve la clé et n’ajoute rien.
const STORE_ONCE = "if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', tonumber(ARGV[2])) then redis.call('LPUSH', KEYS[2], ARGV[3]) return 1 end return 0";

function sameRequestKey(type, site, email) {
  const s = type === 'site'
    ? site.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '')
    : site.toLowerCase().replace(/\s+/g, ' ');
  return 'lpb:doublon:' + hash(type + '|' + s + '|' + email);
}

// Renvoie true si la demande vient d’être ajoutée, false si elle était déjà enregistrée.
async function storeOnce(cfg, key, lead) {
  const json = JSON.stringify(lead);
  try {
    const [added] = await redis(cfg, [['EVAL', STORE_ONCE, '2', key, LEADS_KEY, lead.id, String(SAME_REQUEST_TTL), json]]);
    return Number(added) === 1;
  } catch (error) {
    const msg = String(error && error.message);
    if (/unknown command|NOPERM|not allowed|disabled|not supported/i.test(msg)) {
      // Scripts indisponibles sur ce Redis : même logique en deux temps, la clé est retirée si l’ajout échoue.
      const [set] = await redis(cfg, [['SET', key, lead.id, 'NX', 'EX', String(SAME_REQUEST_TTL)]]);
      if (set !== 'OK') return false;
      try { await redis(cfg, [['LPUSH', LEADS_KEY, json]]); } catch (e) { await redis(cfg, [['DEL', key]]).catch(() => {}); throw e; }
      return true;
    }
    // Réponse perdue entre Vercel et Redis : si notre clé est là, le script a tout écrit (il est atomique).
    const [current] = await redis(cfg, [['GET', key]]).catch(() => [null]);
    if (current === lead.id) {
      if (/WRONGTYPE|user_script|running script/i.test(msg)) { await redis(cfg, [['DEL', key]]).catch(() => {}); throw error; }
      return true;
    }
    throw error;
  }
}

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
    const added = await storeOnce(cfg, sameRequestKey(type, site, email), lead);
    if (!added) console.log('Demande déjà enregistrée : doublon ignoré.');
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Enregistrement impossible :', error.message);
    return res.status(500).json({ ok: false, error: 'enregistrement' });
  }
};
