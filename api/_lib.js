// Outils partagés par les fonctions /api (ce fichier n'est pas une route : son nom commence par « _ »).
const crypto = require('crypto');

const LEADS_KEY = 'lpb:leads';

// Upstash Redis ajouté depuis Vercel : selon l'intégration, les variables s'appellent KV_* ou UPSTASH_REDIS_REST_*.
function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

// Envoie plusieurs commandes Redis en une requête (API REST d'Upstash, sans dépendance).
async function redis(cfg, commands) {
  const response = await fetch(cfg.url + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands)
  });
  if (!response.ok) throw new Error('Redis HTTP ' + response.status);
  const out = await response.json();
  const failed = Array.isArray(out) ? out.find((item) => item && item.error) : { error: 'réponse inattendue' };
  if (failed) throw new Error('Redis : ' + failed.error);
  return out.map((item) => item.result);
}

function clean(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
}

function siteOk(raw) {
  const host = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#\s]/)[0];
  return /^(?:[a-z0-9¡-￿](?:[a-z0-9¡-￿-]*[a-z0-9¡-￿])?\.)+[a-z¡-￿]{2,}$/.test(host);
}

function emailOk(raw) {
  return /^[^\s@,;]+@(?:[^\s@.,;]+\.)+[^\s@.,;]{2,}$/.test(raw);
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20);
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { LEADS_KEY, redisConfig, redis, clean, siteOk, emailOk, hash, safeEqual, escapeHtml };
