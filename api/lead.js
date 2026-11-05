// Une référence de parcours = une demande. Les coordonnées ne sont jamais une clé de dédoublonnage.
const crypto = require('crypto');
const { LEADS_KEY, redisConfig, redis, clean, siteOk, emailOk, hash } = require('./_lib');
const MAX_PER_HOUR = 8;
const VISIT_TTL = 7 * 24 * 3600;
const visitKey = (ref) => 'lpb:visite:' + hash(ref);
const leadJson = (l) => JSON.stringify({ id: l.id, date: l.date, site: l.site, email: l.email, type: l.type, origine: l.origine, page: l.page, source_message: l.source_message || '' });

// Comparaison et écriture dans un seul script. Pas de repli non atomique.
// 1 = nouvelle demande, 2 = mise à jour, 0 = même opération déjà traitée,
// -1 = modification concurrente (relire), -2 = demande retirée de la liste.
const SAVE_VISIT = `
local cur = redis.call('GET', KEYS[1]) or ''
if cur ~= ARGV[1] then return -1 end
if cur ~= '' then
  local items = redis.call('LRANGE', KEYS[2], 0, -1)
  for i, v in ipairs(items) do
    if v == cur then
      if cur == ARGV[2] then return 0 end
      redis.call('LSET', KEYS[2], i - 1, ARGV[2])
      redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
      return 2
    end
  end
  return -2
end
redis.call('LPUSH', KEYS[2], ARGV[2])
redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
return 1`;

function parseLead(raw) {
  if (!raw) return null;
  const l = JSON.parse(raw);
  if (!l || typeof l !== 'object' || !l.id || !l.date || typeof l.email !== 'string') throw new Error('Visite invalide');
  return l;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-LPB-Attribution', '3');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'methode' });
  }
  const origin = req.headers.origin;
  if (origin) {
    let originHost = '';
    try { originHost = new URL(origin).host; } catch (e) { /* refus ci-dessous */ }
    if (originHost !== req.headers.host) return res.status(403).json({ ok: false, error: 'origine' });
  }
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ ok: false, error: 'format' });
  const ref = typeof body.ref === 'string' && /^[a-f0-9]{16,64}$/.test(body.ref) ? body.ref : '';

  // Protection anti-robots conservée : aucune demande ajoutée par le champ piège.
  if (body.lp_hp) {
    const cfg = redisConfig();
    if (ref && cfg) {
      try {
        const [raw] = await redis(cfg, [['GET', visitKey(ref)]]);
        const cur = parseLead(raw);
        if (cur && !cur.email) {
          await redis(cfg, [['EVAL', "if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('LREM', KEYS[2], 1, ARGV[1]) redis.call('DEL', KEYS[1]) end return 0", '2', visitKey(ref), LEADS_KEY, raw]]);
        }
      } catch (e) { /* réponse volontairement identique pour le piège */ }
    }
    return res.status(200).json({ ok: true });
  }

  const sourceMessage = typeof body.source_message === 'string' && /^[a-f0-9]{64}$/.test(body.source_message) ? body.source_message : '';
  const step = body.etape === 'site' ? 'site' : 'email';
  const type = body.type === 'activite' ? 'activite' : 'site';
  const site = clean(body.site, 300);
  const email = step === 'site' ? '' : clean(body.email, 254).toLowerCase();
  if (!site || (type === 'site' && !siteOk(site))) return res.status(400).json({ ok: false, error: 'site' });
  if ((step === 'site' || body.ref != null) && !ref) return res.status(400).json({ ok: false, error: 'visite' });
  if (step === 'email' && !emailOk(email)) return res.status(400).json({ ok: false, error: 'email' });
  const cfg = redisConfig();
  if (!cfg) return res.status(503).json({ ok: false, error: 'stockage' });

  // Ancien format sans ref : chaque POST complet est une nouvelle demande.
  // Le formulaire actuel fournit toujours ref, ce qui protège ses doubles clics et reprises réseau.
  const vKey = visitKey(ref || crypto.randomBytes(24).toString('hex'));
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'inconnu';
  const prefix = step === 'site' ? 'lpb:limite:' : 'lpb:limite-email:';
  const fresh = {
    id: Date.now().toString(36) + crypto.randomBytes(12).toString('hex'),
    date: new Date().toISOString(), site, email, type,
    origine: body.origine === 'final' ? 'final' : 'hero',
    page: clean(body.page, 300), source_message: sourceMessage
  };
  try {
    let counted = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const [raw] = await redis(cfg, [['GET', vKey]]);
      const cur = parseLead(raw);
      if (cur && (cur.source_message || '') !== sourceMessage) {
        return res.status(409).json({ ok: false, error: 'origine_demande_modifiee' });
      }
      let next;
      if (cur && cur.email) {
        // Un POST de l’étape 1 arrivé en retard ne peut pas effacer l’e-mail.
        // Un contenu différent après confirmation exige un nouveau parcours.
        if (step === 'email' && (cur.email !== email || cur.site !== site || cur.type !== type)) {
          return res.status(409).json({ ok: false, error: 'demande_deja_confirmee' });
        }
        next = cur;
      } else {
        next = cur ? { ...cur, site, email, type, origine: fresh.origine, page: fresh.page } : fresh;
      }
      const json = leadJson(next);
      if (!counted && raw !== json) {
        const key = prefix + hash(ip);
        const [count] = await redis(cfg, [['INCR', key], ['EXPIRE', key, '3600']]);
        if (count > MAX_PER_HOUR) return res.status(429).json({ ok: false, error: 'limite' });
        counted = true;
      }
      const [result] = await redis(cfg, [['EVAL', SAVE_VISIT, '2', vKey, LEADS_KEY, raw || '', json, String(VISIT_TTL)]]);
      const r = Number(result);
      if (r === -1) continue;
      if (r === -2) return res.status(409).json({ ok: false, error: 'demande_introuvable' });
      if (result == null || ![0, 1, 2].includes(r)) throw new Error('Réponse de stockage invalide');
      return res.status(200).json({ ok: true, id: next.id, etat: next.email ? 'complete' : 'email_en_attente' });
    }
    return res.status(409).json({ ok: false, error: 'concurrence' });
  } catch (error) {
    console.error('Enregistrement impossible :', error.message);
    return res.status(500).json({ ok: false, error: 'enregistrement' });
  }
};
