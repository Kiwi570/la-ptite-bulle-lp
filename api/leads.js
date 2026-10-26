// GET /api/leads : liste des contacts, protégée par mot de passe (variable ADMIN_PASSWORD sur Vercel).
// GET /api/leads?format=csv : même liste en fichier CSV (Excel, Numbers, Google Sheets).
const { LEADS_KEY, redisConfig, redis, safeEqual, escapeHtml } = require('./_lib');

const dateFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' });

function csvCell(value) {
  let s = String(value == null ? '' : value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // empêche l'exécution de formules dans le tableur
  return '"' + s.replace(/"/g, '""') + '"';
}

function siteHref(lead) {
  if (lead.type !== 'site') return '';
  return /^https?:\/\//i.test(lead.site) ? lead.site : 'https://' + lead.site;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(503).send('Ajoutez la variable ADMIN_PASSWORD dans les réglages du projet Vercel, puis redéployez.');
  }
  const auth = String(req.headers.authorization || '');
  const given = auth.startsWith('Basic ') ? Buffer.from(auth.slice(6), 'base64').toString('utf8').split(':').slice(1).join(':') : '';
  if (!given || !safeEqual(given, password)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="La Ptite Bulle - contacts", charset="UTF-8"');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(401).send('Accès réservé.');
  }

  const cfg = redisConfig();
  if (!cfg) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(503).send('Stockage non configuré : ajoutez Upstash Redis au projet Vercel, puis redéployez.');
  }

  let leads = [];
  try {
    const [items] = await redis(cfg, [['LRANGE', LEADS_KEY, '0', '-1']]);
    leads = (items || []).map((s) => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);
  } catch (error) {
    console.error('Lecture impossible :', error.message);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(500).send('Lecture des contacts impossible pour le moment.');
  }

  const query = req.query || {};
  if (query.format === 'csv') {
    const rows = [['Date (Paris)', 'Site ou activité', 'E-mail', 'Type', 'Formulaire', 'Page']]
      .concat(leads.map((l) => [dateFmt.format(new Date(l.date)), l.site, l.email, l.type === 'site' ? 'Site' : 'Activité', l.origine === 'final' ? 'Bas de page' : 'Haut de page', l.page]));
    const csv = '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
    const day = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="contacts-la-ptite-bulle-' + day + '.csv"');
    return res.status(200).send(csv);
  }

  const rows = leads.map((l) => {
    const href = siteHref(l);
    const site = href ? '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(l.site) + '</a>' : escapeHtml(l.site);
    return '<tr><td>' + escapeHtml(dateFmt.format(new Date(l.date))) + '</td><td>' + site + '</td><td><a href="mailto:' + escapeHtml(l.email) + '">' + escapeHtml(l.email) + '</a></td><td>' + (l.type === 'site' ? 'Site' : 'Activité') + '</td><td>' + (l.origine === 'final' ? 'Bas de page' : 'Haut de page') + '</td></tr>';
  }).join('');

  const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Contacts · La P’tite Bulle</title><style>'
    + ':root{color-scheme:dark}body{margin:0;background:#12172F;color:#F6F1E7;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}'
    + 'main{max-width:1100px;margin:0 auto;padding:32px 16px 48px}h1{margin:0 0 4px;font-size:28px}p{margin:0;color:#B9BED3}'
    + '.top{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:24px}'
    + '.btn{display:inline-block;padding:10px 18px;border-radius:999px;background:#EF7AA4;color:#1B1533;font-weight:700;text-decoration:none}'
    + '.wrap{overflow-x:auto;border:1px solid rgba(246,241,231,.12);border-radius:16px}table{width:100%;border-collapse:collapse;min-width:640px}'
    + 'th,td{padding:12px 14px;text-align:left;border-bottom:1px solid rgba(246,241,231,.08);vertical-align:top}th{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7FD4EA;background:#151A33}'
    + 'tr:last-child td{border-bottom:0}td a{color:#F6F1E7}.empty{padding:40px 16px;text-align:center;color:#B9BED3}'
    + '</style></head><body><main><div class="top"><div><h1>Contacts</h1><p>' + leads.length + ' demande' + (leads.length > 1 ? 's' : '') + ' de maquette, de la plus récente à la plus ancienne.</p></div>'
    + '<a class="btn" href="?format=csv">Télécharger en CSV</a></div><div class="wrap">'
    + (leads.length ? '<table><thead><tr><th>Date (Paris)</th><th>Site ou activité</th><th>E-mail</th><th>Type</th><th>Formulaire</th></tr></thead><tbody>' + rows + '</tbody></table>' : '<p class="empty">Aucune demande pour le moment.</p>')
    + '</div></main></body></html>';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(html);
};
