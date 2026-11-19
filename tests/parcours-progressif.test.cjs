'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const apiSource = fs.readFileSync(path.join(root, 'api/lead.js'), 'utf8');
const lib = require(path.join(root, 'api/_lib.js'));
const functionSource = (name, next) => {
  const start = source.indexOf('  function ' + name + '(');
  const asyncStart = source.indexOf('  async function ' + name + '(');
  const a = start < 0 ? asyncStart : start;
  const b = source.indexOf(next, a);
  assert(a >= 0 && b > a, 'Fonction actuelle introuvable : ' + name);
  return source.slice(a, b);
};
const siteHandler = source.match(/v\.form\.addEventListener\('submit', async \(event\) => \{[\s\S]*?\n    \}\);/)[0];
const emailStart = source.indexOf("    step2.form.addEventListener('submit', async (event) => {");
const emailHandler = source.slice(emailStart, source.indexOf('\n    });\n  }', emailStart) + 11);

// Même API et même format de stockage que le site, commandes Redis simulées.
function stockage() {
  const store = new Map(), leads = [];
  let fails = 0, lose = 0, count = 0;
  async function redis(cfg, commands) {
    const out = [];
    for (const [cmd, key, ...args] of commands) {
      if (cmd === 'GET') out.push(store.get(key) || null);
      else if (cmd === 'INCR') { const n = (store.get(key) || 0) + 1; store.set(key, n); out.push(n); }
      else if (cmd === 'EXPIRE') out.push(1);
      else if (cmd === 'EVAL') {
        if (fails) { fails--; throw Error('Panne fictive'); }
        const n = Number(args[0]), keys = args.slice(1, n + 1), values = args.slice(n + 1);
        const current = store.get(keys[0]) || '';
        if (key.includes('LREM') && !key.includes('LSET')) {
          if (current === values[0]) { const i = leads.indexOf(current); if (i >= 0) leads.splice(i, 1); store.delete(keys[0]); }
          out.push(0); continue;
        }
        if (current !== values[0]) { out.push(-1); continue; }
        if (current) {
          const i = leads.indexOf(current);
          if (i < 0) { out.push(-2); continue; }
          if (current === values[1]) { out.push(0); continue; }
          leads[i] = values[1]; store.set(keys[0], values[1]); out.push(2);
        } else { leads.unshift(values[1]); store.set(keys[0], values[1]); out.push(1); }
        if (lose) { lose--; throw Error('Réponse perdue fictive après écriture'); }
      } else throw Error('Commande inattendue : ' + cmd);
    }
    return out;
  }
  const scope = { require: name => name === './_lib' ? { ...lib, redisConfig: () => ({ url: 'https://fictif.example', token: 'fictif' }), redis } : name === 'crypto' ? crypto : assert.fail('Import non autorisé'), module: { exports: {} }, console: { error() {} }, Date, URL, Buffer };
  vm.runInNewContext(apiSource, scope);
  async function fetchFictif(url, options) {
    count++;
    const res = { statusCode: 200, setHeader() {}, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } };
    await scope.module.exports({ method: options.method, headers: { host: 'wix.partenaire.ptitebulle.fr', origin: 'https://wix.partenaire.ptitebulle.fr', 'x-forwarded-for': '192.0.2.3' }, body: JSON.parse(options.body) }, res);
    return { ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: async () => res.body };
  }
  return { fetch: fetchFictif, leads, count: () => count, fail: () => { fails++; }, lose: () => { lose++; } };
}

function fixture(options = {}) {
  let siteSubmit, emailSubmit, ref = 1, screen = 0, thanks = 0, timer = 0;
  const timers = new Map(), errors = [], calls = [];
  const v = { trap: { value: '' }, field: { value: '', readOnly: false }, toggle: { disabled: false }, submit: { disabled: false }, ctaLabel: { textContent: '' }, status: { textContent: '' }, label: { style: {}, textContent: '', closest: () => ({ classList: { remove() {} } }) }, wrap: { hidden: false }, done: { hidden: true }, doneMail: { textContent: '' }, edit: {}, privacy: {}, iconSite: { removeAttribute() {} }, iconMail: { setAttribute() {} }, stepText: { id: 'lp-step', textContent: '', classList: { toggle() {} } }, form: { classList: { toggle() {}, remove() {} }, setAttribute(k, value) { this[k] = value; }, querySelector() { return v.submit; }, addEventListener(type, fn) { siteSubmit = fn; } } };
  v.toggleHide = v.toggle;
  Object.assign(v.field, { setAttribute() {}, removeAttribute() {} });
  const state = { step: 1, site: 'https://example.fr', email: '', noSite: false, sending: false, warping: false, active: v, originView: v, scrollY: 0, error: '' };
  const storage = options.storage || stockage();
  const ctx = { state, v, heroView: options.final ? {} : v, views: [v], step2: { trap: { value: '' }, form: { addEventListener(type, fn) { emailSubmit = fn; } } }, endpoint: options.endpoint === undefined ? '/api/lead' : options.endpoint,
    visitRef: '1'.repeat(24), sourceMessage: 'a'.repeat(64), sitePending: null, suggestTimer: 0, NB: ' ',
    newVisitRef: () => (++ref).toString(16).padStart(24, '0'), pageSansReference: () => 'https://wix.partenaire.ptitebulle.fr/',
    clearTimeout(id) { timers.delete(id); }, setTimeout(fn, ms) { if (ms <= 700) { fn(); return 0; } const id = ++timer; timers.set(id, fn); return id; },
    AbortController, window: { AbortController }, console: { error() {} }, motionOff: () => true, setHidden: (el, hidden) => { el.hidden = hidden; }, setText: (el, text) => { el.textContent = text; }, shownName: () => 'example.fr', NNB: ' ',
    siteOk: () => true, announce() {}, showSuggestion() {}, history: { state: null }, jumpTo() {}, bounce() {}, setScreen() {},
    fail(view, message) { errors.push(message); state.error = message; ctx.render(); }, failStep2(message) { errors.push(message); state.error = message; ctx.render(); },
    goToStep2: async () => { screen++; state.step = 2; }, openMerci: () => { thanks++; },
    fetch: async (...args) => { calls.push(JSON.parse(args[1].body)); return options.fetch ? options.fetch(...args) : storage.fetch(...args); }
  };
  vm.createContext(ctx);
  vm.runInContext(functionSource('renderView', '\n  function render()'), ctx);
  ctx.render = () => ctx.renderView(v);
  vm.runInContext(functionSource('saveSite', '\n  async function sendRequest()') + functionSource('sendRequest', '\n  function reset(') + functionSource('reset', '\n  views.forEach') + siteHandler + '\n' + emailHandler, ctx);
  const event = () => ({ preventDefault() {} });
  return { ctx, state, v, storage, calls, errors, timers, screen: () => screen, thanks: () => thanks, site: () => siteSubmit(event()), email: () => emailSubmit(event()), reset: () => ctx.reset(v) };
}

function deferred() { let resolve, reject; const promise = new Promise((ok, no) => { resolve = ok; reject = no; }); return { promise, resolve, reject }; }

// Ces tests exécutent les fonctions et gestionnaires extraits du main.js courant.
test('URL seule stockée avant ouverture de l’écran email, sans aucune adresse email', async () => {
  const f = fixture(); await f.site();
  assert.equal(f.storage.leads.length, 1); assert.equal(JSON.parse(f.storage.leads[0]).email, ''); assert.equal(f.screen(), 1); assert.equal(f.thanks(), 0); assert.equal(f.calls.length, 1);
});
test('Le second écran attend la réponse serveur, même avec le bouton déjà cliqué', async () => {
  const pending = deferred(), f = fixture({ fetch: () => pending.promise }); const p = f.site();
  assert.equal(f.screen(), 0); assert.equal(f.state.sending, true); assert.equal(f.v.field.readOnly, true); assert.equal(f.v.toggle.disabled, true); assert.equal(f.v.submit.disabled, true); assert.equal(f.v.ctaLabel.textContent, 'Enregistrement…'); assert.equal(f.v.form['aria-busy'], 'true');
  pending.resolve({ ok: true, json: async () => ({ ok: true }) }); await p; assert.equal(f.screen(), 1); assert.equal(f.state.sending, false);
});
test('Double clic URL : une seule requête avant la réponse', async () => {
  const pending = deferred(), f = fixture({ fetch: () => pending.promise }); const p = f.site(); await f.site(); assert.equal(f.calls.length, 1);
  pending.resolve({ ok: true, json: async () => ({ ok: true }) }); await p; assert.equal(f.screen(), 1);
});
test('Erreur réseau URL : saisie conservée, écran email fermé et contrôles réactivés', async () => {
  const f = fixture({ fetch: async () => { throw Error('Hors ligne fictif'); } }); await f.site();
  assert.equal(f.screen(), 0); assert.equal(f.state.site, 'https://example.fr'); assert.equal(f.v.field.value, f.state.site); assert.equal(f.state.sending, false); assert.equal(f.v.field.readOnly, false); assert.equal(f.v.submit.disabled, false); assert.equal(f.errors.length, 1);
});
for (const status of [400, 429, 500, 503]) test('HTTP ' + status + ' : aucun passage trompeur à l’email', async () => {
  const f = fixture({ fetch: async () => ({ ok: false, status, json: async () => ({ ok: false }) }) }); await f.site(); assert.equal(f.screen(), 0); assert.equal(f.errors.length, 1);
});
for (const data of [null, {}, { ok: false }, { ok: 'true' }]) test('Réponse non confirmée refusée : ' + JSON.stringify(data), async () => {
  const f = fixture({ fetch: async () => ({ ok: true, json: async () => data }) }); await f.site(); assert.equal(f.screen(), 0);
});
test('JSON illisible : aucune confirmation inventée', async () => {
  const f = fixture({ fetch: async () => ({ ok: true, json: async () => { throw Error('JSON fictif'); } }) }); await f.site(); assert.equal(f.screen(), 0);
});
test('URL déjà écrite mais réponse perdue : même référence au réessai, une seule fiche', async () => {
  const storage = stockage(), f = fixture({ storage }); storage.lose(); await f.site(); assert.equal(f.screen(), 0); assert.equal(storage.leads.length, 1);
  const ref = f.ctx.visitRef; await f.site(); assert.equal(f.ctx.visitRef, ref); assert.equal(storage.leads.length, 1); assert.equal(f.screen(), 1);
});
test('Ajout email : même identifiant, même date, même source de campagne', async () => {
  const f = fixture(); await f.site(); const a = JSON.parse(f.storage.leads[0]); f.state.email = 'client@example.fr'; await f.email(); const b = JSON.parse(f.storage.leads[0]);
  assert.equal(f.storage.leads.length, 1); assert.equal(a.id, b.id); assert.equal(a.date, b.date); assert.equal(b.email, 'client@example.fr'); assert.equal(b.source_message, 'a'.repeat(64)); assert.equal(f.thanks(), 1);
});
test('Deux parcours explicites avec mêmes URL/email : deux fiches complètes', async () => {
  const f = fixture(); await f.site(); f.state.email = 'client@example.fr'; await f.email(); const ref = f.ctx.visitRef;
  f.reset(); assert.notEqual(f.ctx.visitRef, ref); f.state.site = 'https://example.fr'; await f.site(); f.state.email = 'client@example.fr'; await f.email();
  assert.equal(f.storage.leads.length, 2); const [a, b] = f.storage.leads.map(JSON.parse); assert.notEqual(a.id, b.id); assert.equal(a.email, 'client@example.fr'); assert.equal(b.email, 'client@example.fr'); assert.equal(f.calls.length, 4); assert.equal(f.thanks(), 2);
});
test('Seconde finalisation en panne : aucun remerciement supplémentaire', async () => {
  const f = fixture(); await f.site(); f.state.email = 'client@example.fr'; await f.email(); f.reset(); f.state.site = 'https://example.fr'; await f.site(); f.state.email = 'client@example.fr'; f.storage.fail(); await f.email(); assert.equal(f.thanks(), 1); assert.equal(f.state.step, 2);
});
test('Email écrit avec réponse perdue : nouvelle confirmation serveur au réessai, sans doublon', async () => {
  const f = fixture(); await f.site(); f.state.email = 'client@example.fr'; f.storage.lose(); await f.email(); assert.equal(f.thanks(), 0); assert.equal(f.state.step, 2);
  await f.email(); assert.equal(f.thanks(), 1); assert.equal(f.storage.leads.length, 1); assert.equal(f.calls.length, 3);
});
test('Double clic email : une seule finalisation, un seul écran de succès', async () => {
  const f = fixture(); await f.site(); const pending = deferred(); f.ctx.fetch = (...args) => { f.calls.push(JSON.parse(args[1].body)); return pending.promise; }; f.state.email = 'client@example.fr'; const p = f.email(); await f.email();
  pending.resolve({ ok: true, json: async () => ({ ok: true }) }); await p; assert.equal(f.calls.length, 2); assert.equal(f.thanks(), 1);
});
test('URL sans endpoint : erreur avant seconde étape, aucun stockage local de remplacement', async () => {
  const f = fixture({ endpoint: '' }); await f.site(); assert.equal(f.calls.length, 0); assert.equal(f.screen(), 0); assert.equal(f.errors.length, 1);
});
test('Piège anti-robots conservé : aucune donnée enregistrée', async () => {
  const f = fixture(); f.v.trap.value = 'robot'; await f.site(); f.state.email = 'robot@example.fr'; await f.email(); assert.equal(f.storage.leads.length, 0);
});
test('Mode activité sans site : stockage dès l’étape 1 puis email sur la même fiche', async () => {
  const f = fixture(); f.state.noSite = true; f.state.site = 'Coach yoga'; await f.site(); assert.equal(JSON.parse(f.storage.leads[0]).type, 'activite'); f.state.email = 'client@example.fr'; await f.email(); assert.equal(f.storage.leads.length, 1); assert.equal(JSON.parse(f.storage.leads[0]).email, 'client@example.fr');
});
test('Délai réseau dépassé : abandon contrôlé sans passage à l’email', async () => {
  const f = fixture({ fetch: (url, options) => new Promise((resolve, reject) => { options.signal.addEventListener('abort', () => reject(Error('Abandon fictif'))); }) }); const p = f.site(); for (const fn of f.timers.values()) fn(); await p; assert.equal(f.screen(), 0); assert.equal(f.state.sending, false); assert.equal(f.errors.length, 1);
});
test('Aucune écriture supplémentaire dans le navigateur', () => {
  const count = text => (text.match(/(?:localStorage|sessionStorage)\.[A-Za-z]+/g) || []).sort(); assert.deepEqual(count(source), ['localStorage.getItem', 'localStorage.setItem']);
});

test('Formulaire final : URL confirmée puis email dans la même demande, origine finale conservée', async () => {
  const f = fixture({ final: true }); await f.site(); f.state.email = 'client@example.fr'; await f.email(); const lead = JSON.parse(f.storage.leads[0]); assert.equal(f.storage.leads.length, 1); assert.equal(lead.origine, 'final'); assert.equal(lead.email, 'client@example.fr');
});
test('Panne de stockage sur URL, puis correction : le même parcours peut reprendre', async () => {
  const f = fixture(); const ref = f.ctx.visitRef; f.storage.fail(); await f.site(); assert.equal(f.storage.leads.length, 0); assert.equal(f.screen(), 0); await f.site(); assert.equal(f.screen(), 1); assert.equal(f.ctx.visitRef, ref); assert.equal(f.storage.leads.length, 1);
});
test('La visite suivante en panne ne réutilise pas le succès de la précédente', async () => {
  const f = fixture(); await f.site(); f.state.email = 'client@example.fr'; await f.email(); f.reset(); f.state.site = 'https://example.fr'; f.storage.fail(); await f.site(); assert.equal(f.screen(), 1); assert.equal(f.state.step, 1); assert.equal(f.thanks(), 1);
});
