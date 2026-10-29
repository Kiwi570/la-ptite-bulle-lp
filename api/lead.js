// POST /api/lead : enregistre une demande de maquette envoyée par le formulaire de la page.
// Étape 1 (« etape: 'site' ») : l’adresse du site est enregistrée tout de suite, e-mail vide (en attente).
// Étape 2 (« etape: 'email' ») : la même demande est complétée avec l’e-mail (même identifiant, même date).
// Sans identifiant de visite (« ref »), une demande complète est créée comme avant.
const crypto = require('crypto');
const { LEADS_KEY, redisConfig, redis, clean, siteOk, emailOk, hash } = require('./_lib');

const MAX_PER_HOUR = 8; // nouvelles demandes acceptées par adresse IP et par heure (et autant d’ajouts d’e-mail)
const SAME_REQUEST_TTL = 7 * 24 * 3600; // une même demande (type + site + e-mail) n’est enregistrée qu’une fois sur 7 jours
const VISIT_TTL = 7 * 24 * 3600; // lien entre une visite et sa demande

// Anti-doublon : la clé de la demande et son ajout à la liste sont écrits d’un seul coup (script atomique).
// Si la réponse se perd après l’enregistrement, un nouvel essai retrouve la clé et n’ajoute rien.
const STORE_ONCE = "if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', tonumber(ARGV[2])) then redis.call('LPUSH', KEYS[2], ARGV[3]) return 1 end return 0";

// Enregistre ou remplace la demande d’une visite, d’un seul coup.
// KEYS : visite, liste, [doublon]. ARGV : version attendue ('' si aucune), nouvelle version, durée, [identifiant].
// Renvoie 1 (ajoutée), 2 (remplacée), 0 (déjà à jour ou doublon d’une demande complète), -1 (version changée entre-temps).
const SAVE_VISIT = `
local cur = redis.call('GET', KEYS[1]) or ''
if cur ~= ARGV[1] then
  if cur == ARGV[2] then return 0 end
  return -1
end
if KEYS[3] then
  if redis.call('EXISTS', KEYS[3]) == 1 then
    if ARGV[1] ~= '' then redis.call('LREM', KEYS[2], 1, ARGV[1]) end
    redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
    return 0
  end
  redis.call('SET', KEYS[3], ARGV[4], 'EX', tonumber(ARGV[3]))
end
if ARGV[1] ~= '' then
  local items = redis.call('LRANGE', KEYS[2], 0, -1)
  for i, v in ipairs(items) do
    if v == ARGV[1] then
      redis.call('LSET', KEYS[2], i - 1, ARGV[2])
      redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
      return 2
    end
  end
end
redis.call('LPUSH', KEYS[2], ARGV[2])
redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
return 1`;

const scriptsMissing = (msg) => /unknown command|NOPERM|not allowed|disabled|not supported/i.test(msg);

function normalSite(type, site) {
  return type === 'site'
    ? site.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '')
    : site.toLowerCase().replace(/\s+/g, ' ');
}

function sameRequestKey(type, site, email) {
  return 'lpb:doublon:' + hash(type + '|' + normalSite(type, site) + '|' + email);
}

const visitKey = (ref) => 'lpb:visite:' + hash(ref);

// Même format qu’avant pour le Studio : mêmes champs, dans le même ordre.
const leadJson = (l) => JSON.stringify({ id: l.id, date: l.date, site: l.site, email: l.email, type: l.type, origine: l.origine, page: l.page });

function parseLead(raw) {
  if (!raw) return null;
  try { const l = JSON.parse(raw); return l && typeof l === 'object' && l.id ? l : null; } catch (e) { return null; }
}

// Renvoie true si la demande vient d’être ajoutée, false si elle était déjà enregistrée.
async function storeOnce(cfg, key, lead) {
  const json = leadJson(lead);
  try {
    const [added] = await redis(cfg, [['EVAL', STORE_ONCE, '2', key, LEADS_KEY, lead.id, String(SAME_REQUEST_TTL), json]]);
    return Number(added) === 1;
  } catch (error) {
    const msg = String(error && error.message);
    if (scriptsMissing(msg)) {
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

// Écrit la nouvelle version de la demande d’une visite (voir SAVE_VISIT), avec une solution de repli sans script.
async function saveVisit(cfg, vKey, oldJson, newJson, dupKey, leadId) {
  const keys = dupKey ? [vKey, LEADS_KEY, dupKey] : [vKey, LEADS_KEY];
  const args = [oldJson, newJson, String(VISIT_TTL)].concat(dupKey ? [leadId] : []);
  try {
    const [r] = await redis(cfg, [['EVAL', SAVE_VISIT, String(keys.length)].concat(keys, args)]);
    return Number(r);
  } catch (error) {
    const msg = String(error && error.message);
    if (!scriptsMissing(msg)) {
      // Réponse perdue : si la nouvelle version est en place, l’écriture a eu lieu.
      const [current] = await redis(cfg, [['GET', vKey]]).catch(() => [null]);
      if (current === newJson) return 1;
      throw error;
    }
    // Repli sans script (moins strict sur les accès simultanés, même résultat dans l’usage normal).
    const [cur] = await redis(cfg, [['GET', vKey]]);
    if ((cur || '') !== oldJson) return cur === newJson ? 0 : -1;
    if (dupKey) {
      const [set] = await redis(cfg, [['SET', dupKey, leadId, 'NX', 'EX', String(VISIT_TTL)]]);
      if (set !== 'OK') {
        if (oldJson) await redis(cfg, [['LREM', LEADS_KEY, '1', oldJson]]);
        await redis(cfg, [['SET', vKey, newJson, 'EX', String(VISIT_TTL)]]);
        return 0;
      }
    }
    if (oldJson) {
      const [items] = await redis(cfg, [['LRANGE', LEADS_KEY, '0', '-1']]);
      const i = (items || []).indexOf(oldJson);
      if (i >= 0) {
        await redis(cfg, [['LSET', LEADS_KEY, String(i), newJson], ['SET', vKey, newJson, 'EX', String(VISIT_TTL)]]);
        return 2;
      }
    }
    await redis(cfg, [['LPUSH', LEADS_KEY, newJson], ['SET', vKey, newJson, 'EX', String(VISIT_TTL)]]);
    return 1;
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

  // Champ piège invisible : rempli uniquement par les robots. On répond « ok » sans rien enregistrer,
  // et une adresse enregistrée à l’étape 1 pour cette visite (encore sans e-mail) est retirée.
  if (body.lp_hp) {
    const trapRef = typeof body.ref === 'string' && /^[a-f0-9]{16,64}$/.test(body.ref) ? body.ref : '';
    const trapCfg = redisConfig();
    if (trapRef && trapCfg) {
      try {
        const vKey = visitKey(trapRef);
        const [curRaw] = await redis(trapCfg, [['GET', vKey]]);
        const cur = parseLead(curRaw);
        if (cur && !cur.email) await redis(trapCfg, [['LREM', LEADS_KEY, '1', curRaw], ['DEL', vKey]]);
      } catch (e) { /* rien : réponse identique */ }
    }
    return res.status(200).json({ ok: true });
  }

  const step = body.etape === 'site' ? 'site' : 'email';
  const type = body.type === 'activite' ? 'activite' : 'site';
  const site = clean(body.site, 300);
  const email = step === 'site' ? '' : clean(body.email, 254).toLowerCase();
  const ref = typeof body.ref === 'string' && /^[a-f0-9]{16,64}$/.test(body.ref) ? body.ref : '';
  if (!site || (type === 'site' && !siteOk(site))) return res.status(400).json({ ok: false, error: 'site' });
  if (step === 'site' && !ref) return res.status(400).json({ ok: false, error: 'visite' });
  if (step === 'email' && !emailOk(email)) return res.status(400).json({ ok: false, error: 'email' });

  const cfg = redisConfig();
  if (!cfg) {
    console.error('Stockage non configuré : ajoutez Upstash Redis au projet Vercel.');
    return res.status(503).json({ ok: false, error: 'stockage' });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'inconnu';
  const limitKey = 'lpb:limite:' + hash(ip); // nouvelles demandes (étape 1, ou demande complète directe)
  const limitMailKey = 'lpb:limite-email:' + hash(ip); // e-mails ajoutés à une demande de l’étape 1
  const overLimit = async (key) => {
    const [count] = await redis(cfg, [['INCR', key], ['EXPIRE', key, '3600']]);
    return count > MAX_PER_HOUR;
  };
  const tooMany = () => res.status(429).json({ ok: false, error: 'limite' });
  const now = new Date();
  const fresh = {
    id: now.getTime().toString(36) + crypto.randomBytes(3).toString('hex'),
    date: now.toISOString(),
    site,
    email,
    type,
    origine: body.origine === 'final' ? 'final' : 'hero',
    page: clean(body.page, 300)
  };

  try {
    if (step === 'site' && await overLimit(limitKey)) return tooMany();

    if (ref) {
      const vKey = visitKey(ref);
      let counted = step === 'site';
      for (let attempt = 0; attempt < 3; attempt++) {
        const [curRaw] = await redis(cfg, [['GET', vKey]]);
        const cur = parseLead(curRaw);
        if (step === 'site') {
          // Demande déjà complétée pendant cette visite : rien à changer.
          if (cur && cur.email) return res.status(200).json({ ok: true });
          const next = cur ? { ...cur, site, type, origine: fresh.origine, page: fresh.page } : fresh;
          const r = await saveVisit(cfg, vKey, curRaw || '', leadJson(next), null, next.id);
          if (r !== -1) return res.status(200).json({ ok: true });
          continue;
        }
        // Étape 2
        if (!cur) break; // adresse non enregistrée à l’étape 1 : demande complète créée comme avant
        if (cur.email === email) return res.status(200).json({ ok: true }); // déjà complétée (nouvel essai après une réponse perdue)
        if (cur.email) break; // autre e-mail pour la même visite : nouvelle demande
        if (!counted) { counted = true; if (await overLimit(limitMailKey)) return tooMany(); }
        const next = { ...cur, site, email, type, origine: fresh.origine, page: fresh.page };
        const r = await saveVisit(cfg, vKey, curRaw, leadJson(next), sameRequestKey(type, site, email), next.id);
        if (r === 0 && !cur.email) console.log('Demande déjà enregistrée : doublon ignoré.');
        if (r !== -1) return res.status(200).json({ ok: true });
      }
      if (step === 'site') throw new Error('visite modifiée pendant l’écriture');
      // Repli : demande complète, et la visite pointe dessus pour qu’une étape 1 tardive n’ajoute rien.
      if (await overLimit(limitKey)) return tooMany();
      const added = await storeOnce(cfg, sameRequestKey(type, site, email), fresh);
      await redis(cfg, [['SET', vKey, leadJson(fresh), 'EX', String(VISIT_TTL)]]).catch(() => {});
      if (!added) console.log('Demande déjà enregistrée : doublon ignoré.');
      return res.status(200).json({ ok: true });
    }

    if (await overLimit(limitKey)) return tooMany();
    const added = await storeOnce(cfg, sameRequestKey(type, site, email), fresh);
    if (!added) console.log('Demande déjà enregistrée : doublon ignoré.');
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Enregistrement impossible :', error.message);
    return res.status(500).json({ ok: false, error: 'enregistrement' });
  }
};
