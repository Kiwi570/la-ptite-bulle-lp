(() => {
  'use strict';
  document.documentElement.classList.add('js');

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionOff = () => reduceMotion.matches || document.documentElement.classList.contains('is-paused');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const NB = ' ';
  const NNB = ' ';

  const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
  const setHidden = (el, hidden) => { if (el.hidden !== hidden) el.hidden = hidden; };

  /* ---------- Formulaires (hero et section finale, état partagé) ---------- */

  const hero = $('#concept');
  const note = $('#lp-note-text');
  const stage = $('#bubble-stage');
  const sleep = $('#bubble-sleep');
  const mini = $('#bubble-mini');
  const miniUrl = $('#mini-url');
  const miniBadge = $('#mini-badge');
  const miniBadgeText = $('#mini-badge-text');
  const tags = $$('.tag');
  const miniBlocks = $$('[data-mini]');

  function makeView(p) {
    const form = $('#' + p + '-form');
    if (!form) return null;
    return {
      form,
      field: $('#' + p + '-field'),
      trap: $('#' + p + '-hp'),
      label: $('#' + p + '-label'),
      ctaLabel: $('#' + p + '-cta-label'),
      stepText: $('#' + p + '-step'),
      status: $('#' + p + '-status'),
      privacy: $('#' + p + '-privacy'),
      edit: $('#' + p + '-edit'),
      iconSite: $('#' + p + '-icon-site'),
      iconMail: $('#' + p + '-icon-mail'),
      wrap: $('#' + p + '-form-wrap'),
      done: $('#' + p + '-done'),
      doneMail: $('#' + p + '-done-mail'),
      restart: $('#' + p + '-restart'),
      toggle: $('#' + p + '-toggle'),
      toggleHide: $('#' + p + '-toggle-item') || $('#' + p + '-toggle'),
      card: form.closest('.final-card'),
      announceTimer: 0
    };
  }
  const views = [makeView('lp'), makeView('fin')].filter(Boolean);
  const heroView = views[0];
  const endpoint = (heroView.form.dataset.endpoint || '').trim();

  const state = { step: 1, site: '', email: '', noSite: false, nudge: false, error: '', sending: false, warping: false, boing: 0, active: heroView, originView: heroView, scrollY: 0 };
  const sentKeys = new Set();

  // Identifiant de la visite (en mémoire seulement) : relie l’adresse enregistrée à l’étape 1 et l’e-mail de l’étape 2.
  function newVisitRef() {
    const bytes = new Uint8Array(12);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  let visitRef = newVisitRef();
  let sitePending = null;
  let nudgeTimer = 0;

  function announce(view, message) {
    clearTimeout(view.announceTimer);
    view.status.textContent = '';
    view.announceTimer = setTimeout(() => { view.status.textContent = message; }, 60);
  }

  const slugify = (text) => text.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 20);

  function shownName() {
    const t = state.site.trim();
    let shown;
    if (state.noSite) {
      const slug = slugify(t);
      shown = slug ? slug + '.fr' : '';
    } else {
      shown = t.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '');
    }
    return shown.length > 24 ? shown.slice(0, 23) + '…' : shown;
  }

  function noteText(len, lit) {
    if (state.step === 3) return 'c’est noté' + NNB + '! maquette en préparation';
    if (state.warping) return 'la bulle prépare votre aperçu…';
    if (state.nudge && state.active === heroView) {
      if (state.step === 2) return 'il manque une adresse e-mail valide';
      return state.noSite ? 'd’abord quelques mots' + NNB + '!' : 'd’abord l’adresse de votre site';
    }
    if (state.step === 2) return 'plus qu’une étape' + NB + ': votre e-mail';
    if (lit >= 4) return 'votre futur site se dessine' + NNB + '!';
    if (len > 0) return 'votre maquette prend forme…';
    return state.noSite ? 'la bulle attend votre activité' : 'la bulle attend votre adresse';
  }

  function renderView(v) {
    const isDone = state.step === 3;
    const mine = state.active === v;
    if (v === heroView) v.label.closest('.field-head').classList.remove('is-quiet'); // libellé « Votre site actuel » toujours visible
    setHidden(v.wrap, isDone);
    setHidden(v.done, !isDone);
    if (v.card) {
      setHidden(v.card.querySelector('.field-head'), isDone);
      setHidden(v.card.querySelector('.eta'), isDone);
    } else {
      v.label.style.visibility = isDone ? 'hidden' : '';
    }
    setText(v.doneMail, state.email.trim() || 'votre adresse');
    setHidden(v.toggleHide, state.step !== 1);
    setText(v.toggle, state.noSite ? 'J’ai déjà un site' : 'Pas encore de site' + NNB + '?');
    // L’e-mail se saisit désormais sur le second écran : ces éléments de l’ancienne étape 2 restent masqués.
    setHidden(v.edit, true);
    setHidden(v.privacy, true);
    v.iconSite.removeAttribute('hidden');
    v.iconMail.setAttribute('hidden', '');
    v.field.setAttribute('aria-describedby', v.stepText.id);

    const f = v.field;
    setText(v.label, state.noSite ? 'Votre activité en quelques mots' : 'Votre site actuel');
    if (f.type !== 'text') f.type = 'text';
    f.name = state.noSite ? 'activite' : 'site';
    f.autocomplete = state.noSite ? 'off' : 'url';
    f.inputMode = state.noSite ? 'text' : 'url';
    f.placeholder = state.noSite ? 'Fleuriste, coach, boulangerie…' : 'www.votre-site.fr';
    setText(v.ctaLabel, 'Découvrir mon futur site');
    f.readOnly = state.warping && mine;
    const err = mine && state.step === 1 ? state.error : '';
    setText(v.stepText, err);
    v.stepText.classList.toggle('is-error', Boolean(err));
    if (err) f.setAttribute('aria-invalid', 'true');
    else f.removeAttribute('aria-invalid');
    v.form.classList.toggle('is-sending', state.warping && mine); // passage animé vers l’étape 2 en cours
    if (!mine) v.form.classList.remove('is-nudge');
    if (f.value !== state.site) f.value = state.site;
  }

  function render() {
    const len = state.site.trim().length;
    const lit = state.step > 1 || state.warping ? 4 : (len === 0 ? 0 : Math.min(4, Math.ceil(len / 3)));
    const asleep = state.step === 1 && len === 0 && !state.warping;
    const isDone = state.step === 3;

    hero.style.setProperty('--lit', String(isDone || state.warping ? 4.6 : lit));
    schedulePalette(asleep ? '' : shownName());
    tags.forEach((tag, i) => tag.classList.toggle('is-on', lit > i));
    miniBlocks.forEach((el) => el.classList.toggle('is-on', lit >= Number(el.dataset.mini)));
    setHidden(sleep, !asleep);
    setHidden(mini, asleep);
    setHidden(miniBadge, !(isDone || state.warping));
    if (miniBadgeText) setText(miniBadgeText, isDone ? 'demandée' : (state.noSite ? 'activité reçue' : 'adresse reçue'));
    setText(miniUrl, shownName() || (state.noSite ? 'votre-activite.fr' : 'votre-site.fr'));
    setText(note, noteText(len, lit));
    views.forEach(renderView);
    renderStep2();
  }

  function bounce() {
    state.boing += 1;
    stage.classList.remove('boing-a', 'boing-b');
    void stage.offsetWidth;
    stage.classList.add(state.boing % 2 ? 'boing-a' : 'boing-b');
  }

  function fail(v, message) {
    clearTimeout(nudgeTimer);
    state.active = v;
    state.nudge = true;
    state.error = message;
    v.form.classList.remove('is-nudge');
    void v.form.offsetWidth;
    v.form.classList.add('is-nudge');
    const hadFocus = document.activeElement === v.field;
    render();
    if (hadFocus) announce(v, message);
    v.field.focus();
    nudgeTimer = setTimeout(() => {
      state.nudge = false;
      v.form.classList.remove('is-nudge');
      render();
    }, 1800);
  }

  function focusField(v, delay = 40) {
    setTimeout(() => {
      const f = v.field;
      if (f.offsetParent === null) return;
      try { f.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'center' }); } catch (e) { f.scrollIntoView(); }
      try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); }
    }, delay);
  }

  function siteOk(raw) {
    const host = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[\/?#\s]/)[0];
    return /^(?:[a-z0-9\u00a1-\uffff](?:[a-z0-9\u00a1-\uffff-]*[a-z0-9\u00a1-\uffff])?\.)+[a-z\u00a1-\uffff]{2,}$/.test(host);
  }

  // Étape 1 : l’adresse du site est enregistrée dès sa validation (demande « e-mail en attente » dans le Studio).
  // L’envoi se fait en arrière-plan : la suite du parcours n’attend pas la réponse.
  function saveSite(v) {
    const trapValue = [...views, step2].map((x) => (x.trap ? x.trap.value : '')).find(Boolean) || '';
    if (trapValue || !endpoint) { sitePending = null; return; }
    const payload = {
      etape: 'site',
      ref: visitRef,
      type: state.noSite ? 'activite' : 'site',
      site: state.site.trim(),
      origine: v === heroView ? 'hero' : 'final',
      page: window.location.href,
      lp_hp: ''
    };
    const ctrl = 'AbortController' in window ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : 0;
    sitePending = fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl ? ctrl.signal : undefined
    }).then((r) => (r.ok ? r.json().catch(() => null) : null)).then((d) => Boolean(d && d.ok === true))
      .catch(() => false).finally(() => clearTimeout(timer));
  }

  async function sendRequest() {
    const trapValue = [...views, step2].map((x) => (x.trap ? x.trap.value : '')).find(Boolean) || '';
    if (trapValue) {
      // Robot : faux succès. Si l’adresse est déjà partie à l’étape 1, le serveur la retire.
      if (sitePending && endpoint) {
        fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ etape: 'email', ref: visitRef, lp_hp: trapValue }) }).catch(() => {});
      }
      return true;
    }
    if (!endpoint) {
      // Sans adresse d’envoi, rien ne peut être enregistré : on le traite comme un échec.
      console.error('La P’tite Bulle : attribut data-endpoint manquant sur #lp-form, demande non enregistrée.');
      return false;
    }
    // L’adresse de l’étape 1 part en premier : on laisse à son envoi le temps d’aboutir (4 s au plus).
    if (sitePending) await Promise.race([sitePending, new Promise((resolve) => setTimeout(resolve, 4000))]);
    const payload = {
      etape: 'email',
      ref: visitRef,
      type: state.noSite ? 'activite' : 'site',
      site: state.site.trim(),
      email: state.email.trim(),
      origine: state.originView === heroView ? 'hero' : 'final',
      page: window.location.href,
      lp_hp: trapValue,
      date: new Date().toISOString()
    };
    const ctrl = 'AbortController' in window ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 10000) : 0;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl ? ctrl.signal : undefined
      });
      if (!response.ok) return false;
      // Enregistrement confirmé seulement si le serveur répond explicitement { ok: true }.
      const data = await response.json().catch(() => null);
      return Boolean(data && data.ok === true);
    } catch (e) {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  function reset(v) {
    visitRef = newVisitRef(); // nouvelle demande : nouvelle visite
    sitePending = null;
    Object.assign(state, { step: 1, site: '', email: '', nudge: false, error: '', active: v });
    render();
  }

  views.forEach((v) => {
    v.field.addEventListener('input', () => {
      if (state.sending) return;
      state.active = v;
      state.site = v.field.value;
      if (state.nudge || state.error) {
        state.nudge = false;
        state.error = '';
        v.form.classList.remove('is-nudge');
      }
      render();
    });

    v.form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (state.sending || state.warping) return;
      state.active = v;
      if (state.step === 1) {
        if (!state.site.trim()) {
          fail(v, state.noSite ? 'Décrivez d’abord votre activité en quelques mots.' : 'Indiquez d’abord l’adresse de votre site.');
          return;
        }
        if (!state.noSite && !siteOk(state.site)) {
          fail(v, 'Cette adresse semble incomplète. Exemple' + NB + ': monsite.fr');
          return;
        }
        saveSite(v);
        goToStep2(v);
      }
    });

    v.restart.addEventListener('click', () => { reset(v); focusField(v, 20); });
    v.toggle.addEventListener('click', () => {
      state.active = v;
      state.noSite = !state.noSite;
      state.site = '';
      state.error = '';
      render();
      focusField(v, 20);
    });
  });

  /* ---------- Second écran : l’e-mail (étape 2 sur 2) ---------- */

  const step2 = {
    screen: $('#etape-2'),
    form: $('#e2-form'),
    box: $('#e2-box'),
    field: $('#e2-field'),
    trap: $('#e2-hp'),
    ctaLabel: $('#e2-cta-label'),
    msg: $('#e2-msg'),
    status: $('#e2-status'),
    site: $('#e2-site'),
    edit: $('#e2-edit'),
    bubble: $('#e2-bubble'),
    miniUrl: $('#e2-mini-url'),
    announceTimer: 0
  };
  let step2Nudge = 0;
  let step2Palette = null;

  function shownSite() {
    const t = state.site.trim();
    return state.noSite ? t : t.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/[\/?#].*$/, '');
  }

  function renderStep2() {
    if (!step2.screen) return;
    if (step2.site) setText(step2.site, shownSite() || 'votre-site.fr');
    if (step2.miniUrl) setText(step2.miniUrl, shownName() || 'votre-site.fr');
    const key = shownName().toLowerCase();
    if (step2.bubble && key && key !== step2Palette) {
      step2Palette = key;
      paletteFor(key).forEach((c, i) => step2.bubble.style.setProperty('--c' + (i + 1), c));
    }
    step2.field.readOnly = state.sending;
    step2.edit.disabled = state.sending;
    setText(step2.ctaLabel, state.sending ? 'Enregistrement…' : 'Recevoir mon aperçu gratuit');
    const err = state.step === 2 ? state.error : '';
    setText(step2.msg, err);
    setHidden(step2.msg, !err);
    if (err) step2.field.setAttribute('aria-invalid', 'true');
    else step2.field.removeAttribute('aria-invalid');
    step2.box.classList.toggle('is-sending', state.sending);
    // E-mail complet : la bulle s’illumine et une enveloppe apparaît, prête à partir.
    const ready = /^[^\s@,;]+@(?:[^\s@.,;]+\.)+[^\s@.,;]{2,}$/.test(state.email.trim());
    if (step2.bubble) {
      step2.bubble.classList.toggle('is-ready', ready);
      step2.bubble.classList.toggle('is-sending', state.sending);
    }
    // La coche verte n’apparaît pas tant qu’une faute de frappe probable est détectée.
    step2.box.classList.toggle('is-valid', ready && !state.sending && !suggestEmail(state.email));
    if (step2.field.value !== state.email) step2.field.value = state.email;
  }

  function failStep2(message) {
    clearTimeout(step2Nudge);
    state.error = message;
    step2.box.classList.remove('is-nudge');
    void step2.box.offsetWidth;
    step2.box.classList.add('is-nudge');
    const hadFocus = document.activeElement === step2.field;
    render();
    if (hadFocus) announce(step2, message);
    step2.field.focus();
    step2Nudge = setTimeout(() => step2.box.classList.remove('is-nudge'), 1800);
  }

  // Défilement immédiat (la page a un défilement doux par défaut).
  const jumpTo = (y) => { try { window.scrollTo({ top: y, left: 0, behavior: 'instant' }); } catch (e) { window.scrollTo(0, y); } };

  function setScreen(isStep2) {
    document.documentElement.classList.toggle('is-step2', isStep2);
    setHidden(step2.screen, !isStep2);
  }

  // Ouvert par le formulaire du haut comme par celui du bas, une fois l’adresse validée.
  function showStep2(v) {
    state.originView = v;
    state.active = v;
    state.step = 2;
    state.error = '';
    state.scrollY = window.scrollY;
    $$('dialog.panel[open]').forEach((d) => d.close());
    try { history.pushState({ lpbStep: 2 }, ''); } catch (e) { /* historique indisponible */ }
    setScreen(true);
    render();
    jumpTo(0);
    requestAnimationFrame(() => { try { step2.field.focus({ preventScroll: true }); } catch (e) { step2.field.focus(); } });
    announce(step2, 'Merci' + NNB + '! Votre site entre dans la bulle. Nous commençons dès maintenant la maquette de votre nouveau site. Dernière étape, 2 sur 2.');
  }

  // Formulaire du haut : une jauge se remplit, la bulle gonfle et dessine l’aperçu, puis elle éclate et l’étape 2 s’ouvre.
  // Formulaire du bas, animations réduites ou en pause : passage direct, comme avant.
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const gauge = $('#bubble-gauge');
  const gaugeLabel = $('#gauge-label');
  const gaugePct = $('#gauge-pct');
  const gaugeFill = $('#gauge-fill');
  const GAUGE_STEPS = [[0.3, 'La bulle se remplit…'], [0.62, 'Elle prend des couleurs…'], [0.93, 'L’aperçu se dessine…'], [1.01, 'Prête à éclater' + NNB + '!']];

  // Remplissage de la jauge : rapide au début, puis plus posé avant l’éclatement.
  function runGauge(ms) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const ease = (t) => (t < 0.55 ? 0.7 * (1 - Math.pow(1 - t / 0.55, 3)) : 0.7 + 0.3 * (1 - Math.pow(1 - (t - 0.55) / 0.45, 2)));
      function step(now) {
        const t = Math.min(1, (now - t0) / ms);
        const p = t >= 1 ? 1 : ease(t);
        gaugeFill.style.setProperty('--p', p.toFixed(3));
        setText(gaugePct, Math.round(p * 100) + NNB + '%');
        setText(gaugeLabel, GAUGE_STEPS.find((g) => p < g[0])[1]);
        hero.style.setProperty('--swell', p.toFixed(3));
        hero.classList.toggle('is-tense', p > 0.9 && t < 1);
        if (t < 1) requestAnimationFrame(step); else resolve();
      }
      requestAnimationFrame(step);
    });
  }

  // Éclatement : flash, onde et gouttelettes irisées autour de la bulle.
  function burst(target = stage, spread = 1) {
    const colors = ['#7FD4EA', '#C3B1F7', '#EF7AA4', '#F3CF7A', '#A8EEDB', '#F9D7E4'];
    const el = document.createElement('div');
    el.className = 'burst';
    el.setAttribute('aria-hidden', 'true');
    let html = '<span class="burst-flash"></span><span class="burst-ring"></span>';
    const n = 26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const d = (55 + Math.random() * 55) * spread;
      const size = i % 3 === 0 ? 6 + Math.random() * 5 : 11 + Math.random() * 12;
      html += '<span class="drop" style="--dx:' + (Math.cos(a) * d).toFixed(1) + 'cqw;--dy:' + (Math.sin(a) * d).toFixed(1) + 'cqw;--s:' + size.toFixed(1) + 'px;--c:' + colors[i % colors.length] + ';--dl:' + Math.round(Math.random() * 70) + 'ms"></span>';
    }
    el.innerHTML = html;
    target.appendChild(el);
    return el;
  }

  function resetLoading() {
    hero.classList.remove('is-prep', 'is-loading', 'is-tense', 'is-popping');
    hero.style.removeProperty('--swell');
    if (gauge) setHidden(gauge, true);
    $$('.burst', stage).forEach((b) => b.remove());
    document.documentElement.classList.remove('is-leaving');
  }

  async function goToStep2(v) {
    const bubbleEl = stage ? $('.bubble', stage) : null;
    if (v !== heroView || motionOff() || !bubbleEl || !gauge) { showStep2(v); return; }
    state.warping = true;
    state.active = v;
    hero.classList.add('is-prep'); // aperçu vide tant que la bulle n’est pas à l’écran
    v.field.blur(); // referme le clavier sur mobile
    render();
    announce(v, 'La bulle prépare votre aperçu…');
    try {
      // Sur mobile, la bulle est sous le formulaire : la page glisse jusqu’à elle.
      await wait(60);
      const r = stage.getBoundingClientRect();
      const top = barPx || 0;
      const room = r.height + 110; // bulle + jauge
      if (r.top < top + 8 || r.top + room > window.innerHeight - 8) {
        const y = window.scrollY + r.top + room / 2 - (top + window.innerHeight) / 2;
        try { window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' }); } catch (e) { window.scrollTo(0, Math.max(0, y)); }
        await wait(560);
      }
      // La jauge se remplit, la bulle gonfle et l’aperçu se construit bloc par bloc.
      gaugeFill.style.setProperty('--p', '0');
      setText(gaugePct, '0' + NNB + '%');
      setText(gaugeLabel, GAUGE_STEPS[0][1]);
      setHidden(gauge, false);
      void stage.offsetWidth;
      hero.classList.remove('is-prep');
      hero.classList.add('is-loading');
      await runGauge(1650);
      // La bulle éclate.
      hero.classList.remove('is-tense');
      hero.classList.add('is-popping');
      burst();
      await wait(420);
      document.documentElement.classList.add('is-leaving');
      await wait(160);
      state.warping = false;
      clearTimeout(v.announceTimer);
      v.status.textContent = '';
      resetLoading();
      showStep2(v);
    } catch (e) {
      // En cas d’imprévu, on passe simplement à l’étape 2.
      state.warping = false;
      resetLoading();
      showStep2(v);
    }
  }

  // « Modifier » ou retour arrière du navigateur : retour à l’adresse, rien n’est effacé.
  function backToStep1() {
    state.step = 1;
    state.error = '';
    setScreen(false);
    render();
    const v = state.originView || heroView;
    jumpTo(state.scrollY || 0);
    requestAnimationFrame(() => { try { v.field.focus({ preventScroll: true }); } catch (e) { v.field.focus(); } });
  }

  // Fautes de frappe courantes dans l’e-mail (gmial.com, hotmial.fr, orange.fe…) : une correction est proposée, jamais imposée.
  const MAIL_DOMAINS = ['gmail.com', 'hotmail.com', 'hotmail.fr', 'outlook.com', 'outlook.fr', 'live.fr', 'live.com', 'msn.com', 'yahoo.com', 'yahoo.fr', 'icloud.com', 'me.com', 'mac.com', 'mail.com', 'orange.fr', 'wanadoo.fr', 'free.fr', 'sfr.fr', 'neuf.fr', 'laposte.net', 'bbox.fr', 'aol.com', 'gmx.fr', 'gmx.com', 'protonmail.com', 'proton.me', 'numericable.fr'];
  const MAIL_FIX = { 'gmail.fr': 'gmail.com', 'icloud.fr': 'icloud.com', 'googlemail.fr': 'googlemail.com' };
  const TLD_FIX = { con: 'com', cpm: 'com', vom: 'com', xom: 'com', comm: 'com', fe: 'fr', ft: 'fr', frr: 'fr', rf: 'fr', nte: 'net', ner: 'net' };
  // Noms reconnus tels quels (jamais « corrigés »), et noms assez longs pour qu’une faute soit détectée sans risque.
  const MAIL_NAMES = MAIL_DOMAINS.map((d) => d.slice(0, d.lastIndexOf('.'))).concat(['ymail', 'email', 'googlemail', 'aliceadsl', 'club-internet', 'voila', 'skynet', 'bluewin', 'videotron', 'sympatico', 'libero', 'web', 'yandex', 'zoho', 'tutanota', 'posteo']);
  const MAIL_FUZZY = ['gmail', 'hotmail', 'outlook', 'yahoo', 'icloud', 'orange', 'wanadoo', 'laposte', 'protonmail', 'numericable'];
  // Distance d’édition avec inversion de deux lettres (gmial → gmail compte pour une seule faute).
  function editDistance(a, b) {
    const d = [];
    for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (let j = 0; j <= b.length; j++) { d[0][j] = j; }
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[a.length][b.length];
  }
  function suggestEmail(raw) {
    const v = String(raw || '').trim();
    if (!/^[^\s@,;]+@(?:[^\s@.,;]+\.)+[^\s@.,;]{2,}$/.test(v)) return '';
    const at = v.lastIndexOf('@');
    const user = v.slice(0, at);
    const dom = v.slice(at + 1).toLowerCase();
    if (MAIL_DOMAINS.includes(dom)) return '';
    let fixed = MAIL_FIX[dom] || '';
    const m = dom.match(/^(.+)\.([a-z]+)$/);
    if (!fixed && m) {
      let name = m[1];
      let tld = TLD_FIX[m[2]] || m[2];
      if (!MAIL_NAMES.includes(name) && name.length >= 4) {
        let best = '';
        let bestD = 9;
        MAIL_FUZZY.forEach((n) => { const k = editDistance(name, n); if (k < bestD) { bestD = k; best = n; } });
        if (best && bestD <= (best.length >= 7 ? 2 : 1)) name = best;
      }
      if (MAIL_NAMES.includes(name) && !MAIL_DOMAINS.includes(name + '.' + tld) && !MAIL_FIX[name + '.' + tld]) {
        // Messagerie connue avec une extension mal tapée (gmail.om, hotmail.cm) : extension la plus proche, à une lettre près.
        const near = MAIL_DOMAINS.filter((d) => d.slice(0, d.lastIndexOf('.')) === name && editDistance(d.slice(d.lastIndexOf('.') + 1), tld) <= 1);
        if (near.length) tld = near[0].slice(near[0].lastIndexOf('.') + 1);
      }
      let cand = name + '.' + tld;
      cand = MAIL_FIX[cand] || cand;
      if (cand !== dom && (MAIL_DOMAINS.includes(cand) || (name === m[1] && tld !== m[2]))) fixed = cand;
    }
    return fixed && fixed !== dom ? user + '@' + fixed : '';
  }
  const suggestBox = $('#e2-suggest-in');
  const suggestBtn = $('#e2-suggest-btn');
  const suggestSlot = $('#e2-after');
  let suggestTimer = 0;
  function showSuggestion(email) {
    if (!suggestBox) return;
    if (email) setText(suggestBtn, email);
    setHidden(suggestBox, !email);
    if (suggestSlot) suggestSlot.classList.toggle('has-suggest', !!email);
  }

  if (step2.screen) {
    step2.field.addEventListener('input', () => {
      if (state.sending) return;
      state.email = step2.field.value;
      if (state.error) { state.error = ''; step2.box.classList.remove('is-nudge'); }
      render();
      clearTimeout(suggestTimer);
      showSuggestion('');
      suggestTimer = setTimeout(() => showSuggestion(suggestEmail(state.email)), 550);
    });
    step2.field.addEventListener('blur', () => { clearTimeout(suggestTimer); if (!state.sending) showSuggestion(suggestEmail(state.email)); });
    if (suggestBtn) suggestBtn.addEventListener('click', () => {
      state.email = suggestBtn.textContent;
      state.error = '';
      showSuggestion('');
      render();
      try { step2.field.focus({ preventScroll: true }); } catch (e) { step2.field.focus(); }
      announce(step2, 'Adresse corrigée' + NB + ': ' + state.email);
    });
    step2.edit.addEventListener('click', () => {
      if (state.sending) return;
      if (history.state && history.state.lpbStep === 2) history.back();
      else backToStep1();
    });
    window.addEventListener('popstate', () => { if (state.step === 2 && !state.sending) backToStep1(); });
    // Rechargement sur le second écran : on repart proprement de la page.
    if (history.state && history.state.lpbStep === 2) { try { history.replaceState(null, ''); } catch (e) { /* rien */ } }

    step2.form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (state.sending || state.step !== 2) return;
      if (!state.email.trim()) {
        failStep2('Indiquez votre adresse e-mail.');
        return;
      }
      if (!/^[^\s@,;]+@(?:[^\s@.,;]+\.)+[^\s@.,;]{2,}$/.test(state.email.trim())) {
        failStep2('Cette adresse e-mail semble incomplète. Exemple' + NB + ': vous@exemple.fr');
        return;
      }
      state.sending = true;
      state.error = '';
      clearTimeout(suggestTimer);
      showSuggestion('');
      render();
      // Une même demande déjà enregistrée dans cette page n’est pas renvoyée (le serveur ignore aussi les doublons).
      const key = [state.noSite ? 'activite' : 'site', state.site.trim().toLowerCase(), state.email.trim().toLowerCase()].join('|');
      const pause = new Promise((resolve) => setTimeout(resolve, motionOff() ? 0 : 700));
      const ok = sentKeys.has(key) ? (await pause, true) : (await Promise.all([sendRequest(), pause]))[0];
      state.sending = false;
      if (!ok) {
        failStep2('L’envoi n’a pas abouti. Réessayez dans un instant.');
        return;
      }
      sentKeys.add(key);
      state.step = 3;
      try { if (history.state && history.state.lpbStep === 2) history.replaceState(null, ''); } catch (e) { /* rien */ }
      setScreen(false);
      render();
      jumpTo(state.scrollY || 0);
      bounce();
      openMerci(state.originView || heroView);
    });
  }

  // Clavier mobile : quand il s’ouvre et réduit la zone visible, le champ actif reste à l’écran.
  if (window.visualViewport) {
    let vvTimer = 0;
    window.visualViewport.addEventListener('resize', () => {
      clearTimeout(vvTimer);
      vvTimer = setTimeout(() => {
        const el = document.activeElement;
        if (!el || !/^(lp|fin|e2)-field$/.test(el.id)) return;
        const vv = window.visualViewport;
        const r = el.getBoundingClientRect();
        if (r.top < vv.offsetTop + 8 || r.bottom > vv.offsetTop + vv.height - 8) {
          try { el.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) { el.scrollIntoView(); }
        }
      }, 120);
    });
  }

  const bounceBtn = $('#bubble-bounce');
  if (bounceBtn) bounceBtn.addEventListener('click', bounce);

  $$('[data-goto-field]').forEach((btn) => btn.addEventListener('click', () => {
    const dialog = btn.closest('dialog');
    if (dialog) dialog.close();
    if (state.step === 3) reset(heroView);
    const mid = window.innerHeight / 2;
    const target = views.reduce((best, v) => {
      const r = v.form.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      return d < best.d ? { v, d } : best;
    }, { v: heroView, d: Infinity }).v;
    state.active = target;
    focusField(target, dialog ? 80 : 40);
  }));

  /* ---------- Offre limitée : compte à rebours réel ---------- */

  const offerBar = $('#offer');
  const offerEnd = offerBar && offerBar.dataset.end ? Date.parse(offerBar.dataset.end) : NaN;
  const hasEnd = Number.isFinite(offerEnd);
  const timeParts = { h: $$('[data-t="h"]'), m: $$('[data-t="m"]'), s: $$('[data-t="s"]') };
  const secBubble = $('.cd-sec');
  let offerTimer = 0;
  const pad = (n) => String(n).padStart(2, '0');

  let barPx = 0;
  function syncBarHeight() {
    const sticky = offerBar && !document.documentElement.classList.contains('offer-ended');
    barPx = sticky ? offerBar.offsetHeight : 0;
    document.documentElement.style.setProperty('--bar-h', barPx + 'px');
  }

  function offerTick() {
    if (!hasEnd) return;
    const left = offerEnd - Date.now();
    if (!(left > 0)) {
      document.documentElement.classList.add('offer-ended');
      document.documentElement.classList.remove('offer-last-hour');
      clearInterval(offerTimer);
      syncBarHeight();
      return;
    }
    const total = Math.floor(left / 1000);
    const values = { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
    Object.keys(values).forEach((key) => timeParts[key].forEach((el) => setText(el, pad(values[key]))));
    document.documentElement.classList.toggle('offer-last-hour', left < 3600000);
    if (secBubble && !reduceMotion.matches) {
      secBubble.classList.remove('tick');
      void secBubble.offsetWidth;
      secBubble.classList.add('tick');
    }
  }

  offerTick();
  syncBarHeight();
  if (hasEnd && !document.documentElement.classList.contains('offer-ended')) offerTimer = setInterval(offerTick, 1000);
  window.addEventListener('resize', syncBarHeight);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) offerTick(); });

  /* ---------- La bulle : ouverture, palette et réactions à la souris ---------- */

  function paletteFor(text) {
    let h = 2166136261;
    for (const ch of text) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
    const hue = (h >>> 0) % 360;
    const c = (dh, s, l) => 'hsl(' + ((hue + dh) % 360) + ' ' + s + '% ' + l + '%)';
    return [c(0, 82, 72), c(38, 76, 76), c(172, 66, 72), c(205, 62, 80), c(18, 86, 86)];
  }

  let paletteKey = null;
  let paletteTimer = 0;
  function applyPalette(key) {
    if (key === paletteKey) return;
    paletteKey = key;
    const list = key ? paletteFor(key) : null;
    for (let i = 0; i < 5; i++) {
      if (list) stage.style.setProperty('--c' + (i + 1), list[i]);
      else stage.style.removeProperty('--c' + (i + 1));
    }
  }
  function schedulePalette(text) {
    const key = text ? text.toLowerCase() : '';
    clearTimeout(paletteTimer);
    if (!key) { applyPalette(''); return; }
    paletteTimer = setTimeout(() => applyPalette(key), 220);
  }

  setTimeout(() => hero.classList.remove('is-intro'), reduceMotion.matches ? 0 : 2400);

  const frees = $$('.free', stage).map((el) => ({ el, ox: 0, oy: 0, tx: 0, ty: 0 }));
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  let pointer = null;
  let tiltFrame = 0;

  function tiltLoop() {
    tiltFrame = 0;
    tilt.x += (tilt.tx - tilt.x) * 0.12;
    tilt.y += (tilt.ty - tilt.y) * 0.12;
    let busy = Math.abs(tilt.tx - tilt.x) > 0.01 || Math.abs(tilt.ty - tilt.y) > 0.01;
    const rects = pointer ? frees.map((f) => f.el.getBoundingClientRect()) : null;
    frees.forEach((f, i) => {
      f.tx = 0;
      f.ty = 0;
      if (rects) {
        const r = rects[i];
        const dx = r.left + r.width / 2 - f.ox - pointer.x;
        const dy = r.top + r.height / 2 - f.oy - pointer.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 150) {
          const k = (1 - d / 150) * 48;
          f.tx = dx / d * k;
          f.ty = dy / d * k;
        }
      }
      f.ox += (f.tx - f.ox) * 0.16;
      f.oy += (f.ty - f.oy) * 0.16;
      if (Math.abs(f.tx - f.ox) > 0.1 || Math.abs(f.ty - f.oy) > 0.1) busy = true;
    });
    stage.style.setProperty('--tx', tilt.x.toFixed(3));
    stage.style.setProperty('--ty', tilt.y.toFixed(3));
    frees.forEach((f) => {
      f.el.style.setProperty('--fx', f.ox.toFixed(1) + 'px');
      f.el.style.setProperty('--fy', f.oy.toFixed(1) + 'px');
    });
    if (busy) tiltFrame = requestAnimationFrame(tiltLoop);
  }
  const kickTilt = () => { if (!tiltFrame) tiltFrame = requestAnimationFrame(tiltLoop); };

  hero.addEventListener('pointermove', (event) => {
    if (!finePointer.matches || motionOff()) return;
    const r = stage.getBoundingClientRect();
    tilt.tx = Math.max(-1, Math.min(1, (event.clientX - (r.left + r.width / 2)) / r.width)) * 10;
    tilt.ty = Math.max(-1, Math.min(1, (event.clientY - (r.top + r.height / 2)) / r.height)) * 10;
    pointer = { x: event.clientX, y: event.clientY };
    kickTilt();
  });
  hero.addEventListener('pointerleave', () => {
    tilt.tx = 0;
    tilt.ty = 0;
    pointer = null;
    kickTilt();
  });

  $$('[data-magnet]').forEach((btn) => {
    let ox = 0;
    let oy = 0;
    btn.addEventListener('pointermove', (event) => {
      if (!finePointer.matches || motionOff()) return;
      const r = btn.getBoundingClientRect();
      const cx = r.left - ox + r.width / 2;
      const cy = r.top - oy + r.height / 2;
      ox = (event.clientX - cx) * 0.18;
      oy = (event.clientY - cy) * 0.3;
      btn.style.translate = ox.toFixed(1) + 'px ' + oy.toFixed(1) + 'px';
    });
    btn.addEventListener('pointerleave', () => { ox = 0; oy = 0; btn.style.translate = ''; });
  });

  /* ---------- Écran 2 : le rouleau piloté par le défilement ---------- */

  const s2 = $('#avant-apres');
  const pin = $('.s2-pin', s2);
  const frameEl = $('.frame', s2);
  const fresh = $('.fresh', s2);
  const wet = $('.wet', s2);
  const roller = $('.roller-wrap', s2);
  const dripA = $('.drip-a', s2);
  const dripB = $('.drip-b', s2);
  const progressBar = $('.mini-progress span', s2);
  const stepsLine = $('.steps-line span', s2);
  const splatBox = $('.splats', s2);
  const steps = $$('.step', s2);
  const pinnedQuery = window.matchMedia('(min-width: 1080px) and (min-height: 640px)');
  const thresholds = [0.02, 0.45, 0.9];

  const BANDS = 6;
  const BW = 100 / BANDS;
  const STROKE = 0.84;
  const SCREEN_H = 66.667 - 6.4;
  const EMPTY = 'polygon(0% 0%,0% 0%,0% 0%)';
  const FULL = 'polygon(0% 0%,100% 0%,100% 100%,0% 100%)';

  const noise = (i, seed) => {
    const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
    return x - Math.floor(x) - 0.5;
  };
  const jitter = (t, seed, step, amp) => {
    const a = Math.floor(t / step);
    const f = t / step - a;
    return amp * (noise(a, seed) * (1 - f) + noise(a + 1, seed) * f);
  };
  const keep = (v) => Math.max(0, Math.min(100, v));
  const fmt = (v) => Math.round(v * 100) / 100;

  function samples(from, to, step) {
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    const list = [];
    for (let j = Math.ceil(lo / step); j <= Math.floor(hi / step); j++) {
      const v = j * step;
      if (v > lo && v < hi) list.push(v);
    }
    if (to < from) list.reverse();
    return [from, ...list, to];
  }

  function verticalEdge(pts, x, y0, y1, seed) {
    samples(y0, y1, 3.2).forEach((y) => pts.push([keep(x + jitter(y, seed, 3.2, 0.6)), y]));
  }

  function leadingEdge(pts, y, x0, x1, seed) {
    const step = BW / 9;
    samples(x0, x1, step).forEach((x) => {
      const bristle = noise(Math.round(x * 7), seed + 9) > 0.32 ? 1.1 : 0;
      pts.push([x, keep(y + jitter(x, seed, step, 2) + (y < 50 ? bristle : -bristle))]);
    });
  }

  function paintShape(k, g, down) {
    if (k >= BANDS) return FULL;
    if (k === 0 && g <= 0.001) return EMPTY;
    const x1 = k === 0 ? -2 : k * BW;
    const x2 = k === BANDS - 1 ? 104 : (k + 1) * BW;
    const finished = g >= 0.999;
    const lead = finished ? (down ? 104 : -4) : (down ? g * 100 : 100 - g * 100);
    const pts = [[0, 0]];
    if (g <= 0.001) {
      verticalEdge(pts, x1, 0, 100, k);
    } else if (down) {
      verticalEdge(pts, x2, 0, lead, k + 1);
      leadingEdge(pts, lead, x2, x1, 50 + k);
      verticalEdge(pts, x1, lead, 100, k);
    } else {
      verticalEdge(pts, x1, 0, lead, k);
      leadingEdge(pts, lead, x1, x2, 50 + k);
      verticalEdge(pts, x2, lead, 100, k + 1);
    }
    pts.push([0, 100]);
    return 'polygon(' + pts.map(([x, y]) => fmt(x) + '% ' + fmt(y) + '%').join(',') + ')';
  }

  const splats = [];
  for (let b = 0; b < BANDS - 1; b++) {
    for (let i = 0; i < 3; i++) {
      const y = 10 + (noise(i, b + 20) + 0.5) * 80;
      const down = b % 2 === 0;
      const el = document.createElement('span');
      el.className = 'splat';
      const size = 0.45 + (noise(i, b + 40) + 0.5) * 0.75;
      el.style.left = ((b + 1) * BW + 0.8 + (noise(i, b + 30) + 0.5) * 3) + '%';
      el.style.top = y + '%';
      el.style.width = size + 'cqw';
      el.style.height = (size * 0.85) + 'cqw';
      splatBox.appendChild(el);
      splats.push({ el, band: b, at: down ? y / 100 : 1 - y / 100, on: false });
    }
  }

  let target = 0;
  let current = 0;
  let tween = null;
  let hold = null;
  let frame = 0;
  let lastShape = '';
  const flags = { painted: null, finished: null, steps: [null, null, null] };

  function measure() {
    const vh = window.innerHeight || 800;
    let p;
    if (pinnedQuery.matches) {
      const r = s2.getBoundingClientRect();
      const dist = Math.max(1, r.height - pin.offsetHeight);
      p = (barPx - r.top + 60) / dist;
    } else {
      const fr = frameEl.getBoundingClientRect();
      const start = vh * 0.92;
      const end = vh * 0.5 - fr.height * 0.5;
      p = (start - fr.top) / Math.max(1, start - end);
    }
    return clamp(p);
  }

  function apply(p) {
    const s = p * BANDS;
    let k = Math.floor(s);
    let sb = s - k;
    if (k >= BANDS) { k = BANDS; sb = 0; }
    const down = k % 2 === 0;
    let g = 1;
    let shift = 0;
    if (k < BANDS) {
      if (sb < STROKE) g = sb / STROKE;
      else shift = (sb - STROKE) / (1 - STROKE);
    }
    const lead = down ? g * 100 : 100 - g * 100;
    const leadCqw = lead / 100 * SCREEN_H;
    const glide = shift < 0.5 ? 2 * shift * shift : 1 - Math.pow(-2 * shift + 2, 2) / 2;
    const grow = Math.min(1, g * 2.5);

    const shape = paintShape(k, g, down);
    if (shape !== lastShape) {
      fresh.style.clipPath = shape;
      wet.style.clipPath = shape;
      lastShape = shape;
    }
    wet.style.setProperty('--x1', (Math.min(k, BANDS - 1) * BW).toFixed(3));
    wet.style.opacity = k >= BANDS ? '0' : (shift > 0 ? (1 - shift).toFixed(3) : '1');
    wet.style.setProperty('--lead', leadCqw.toFixed(3) + 'cqw');

    const rx = k * BW + BW / 2 + glide * BW;
    roller.style.translate = 'calc(' + rx.toFixed(3) + 'cqw - 50%) calc(' + leadCqw.toFixed(3) + 'cqw - 12.94%)';
    roller.style.rotate = (Math.sin(g * Math.PI * 2) * 1.4 + (down ? 1.2 : -1.2) * (1 - shift)).toFixed(2) + 'deg';
    roller.style.setProperty('--roll', ((lead * 2.6) % 8).toFixed(2) + 'px');

    const dripOn = down && k < BANDS && g > 0.06 && shift === 0;
    dripA.style.opacity = dripOn ? '1' : '0';
    dripB.style.opacity = dripOn ? '1' : '0';
    if (dripOn) {
      dripA.style.translate = 'calc(' + (k * BW + BW * 0.3).toFixed(2) + 'cqw - 50%) ' + (leadCqw - 0.2).toFixed(2) + 'cqw';
      dripB.style.translate = 'calc(' + (k * BW + BW * 0.72).toFixed(2) + 'cqw - 50%) ' + (leadCqw - 0.2).toFixed(2) + 'cqw';
      dripA.style.height = (1.4 + 3.2 * grow).toFixed(2) + 'cqw';
      dripB.style.height = (1 + 2 * grow).toFixed(2) + 'cqw';
    }

    progressBar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    stepsLine.style.transform = 'scaleY(' + p.toFixed(4) + ')';

    splats.forEach((sp) => {
      const on = k > sp.band || (k === sp.band && g > sp.at);
      if (on !== sp.on) { sp.on = on; sp.el.classList.toggle('on', on); }
    });
    const painted = p >= 0.985;
    const finished = p >= 0.995;
    if (painted !== flags.painted) { flags.painted = painted; s2.classList.toggle('is-painted', painted); }
    if (finished !== flags.finished) { flags.finished = finished; s2.classList.toggle('is-finished', finished); }
    steps.forEach((step, i) => {
      const on = p > thresholds[i];
      if (on !== flags.steps[i]) { flags.steps[i] = on; step.classList.toggle('is-on', on); }
    });
  }

  const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

  function loop(now) {
    frame = 0;
    if (tween) {
      const k = Math.min(1, (now - tween.t0) / tween.ms);
      current = tween.from + (tween.to - tween.from) * easeInOut(k);
      if (k >= 1) { tween = null; target = current; hold = measure(); }
    } else {
      const diff = target - current;
      current = (reduceMotion.matches || Math.abs(diff) < 0.0006) ? target : current + diff * 0.14;
    }
    apply(current);
    if (tween || Math.abs(target - current) > 0.0006) frame = requestAnimationFrame(loop);
  }

  function kick() { if (!frame) frame = requestAnimationFrame(loop); }

  function onScroll() {
    if (document.documentElement.classList.contains('is-step2')) return; // page masquée pendant l’étape 2
    const p = measure();
    if (tween) {
      if (Math.abs(p - tween.startP) <= 0.02) return;
      tween = null;
    }
    if (hold !== null) {
      if (Math.abs(p - hold) < 0.04) return;
      hold = null;
    }
    if (Math.abs(p - target) < 0.0002 && Math.abs(current - target) < 0.0006) return;
    target = p;
    kick();
  }

  const replayBtn = $('#replay');
  if (replayBtn) replayBtn.addEventListener('click', () => {
    hold = null;
    tween = { from: 0, to: 1, t0: performance.now(), ms: reduceMotion.matches ? 1 : 4200, startP: measure() };
    kick();
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  current = target = measure();
  apply(current);

  /* ---------- Section finale : bulle géante et bulles à éclater ---------- */

  const finalSection = $('#final');
  const finalBg = $('.final-bg', finalSection);
  let finalTick = false;
  function updateFinal() {
    finalTick = false;
    if (motionOff()) { finalBg.style.setProperty('--fp', '1'); return; }
    const r = finalSection.getBoundingClientRect();
    const vh = window.innerHeight || 800;
    if (r.top > vh * 1.2 || r.bottom < -100) return;
    const fp = clamp((vh - r.top) / (vh * 0.85));
    finalBg.style.setProperty('--fp', fp.toFixed(3));
  }
  const kickFinal = () => { if (document.documentElement.classList.contains('is-step2')) return; if (!finalTick) { finalTick = true; requestAnimationFrame(updateFinal); } };
  window.addEventListener('scroll', kickFinal, { passive: true });
  window.addEventListener('resize', kickFinal);
  updateFinal();

  $$('.pop', finalSection).forEach((pop) => {
    pop.addEventListener('click', () => pop.classList.add('is-popped'), { once: true });
  });

  if ('IntersectionObserver' in window) {
    const revealer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { finalSection.classList.add('is-in'); revealer.unobserve(entry.target); }
      });
    }, { threshold: 0.25 });
    revealer.observe($('.timeline', finalSection) || finalSection);
  } else {
    finalSection.classList.add('is-in');
  }

  /* ---------- Animations : pause hors écran et bouton pause ---------- */

  if ('IntersectionObserver' in window) {
    const watcher = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.target.classList.toggle('is-off', !entry.isIntersecting));
    }, { rootMargin: '80px 0px' });
    watcher.observe(hero);
    watcher.observe(s2);
    watcher.observe(finalSection);
  }

  const motionBtn = $('#motion-toggle');
  const motionLabel = $('#motion-label');
  function setPaused(on, save) {
    document.documentElement.classList.toggle('is-paused', on);
    motionLabel.textContent = on ? 'Relancer' : 'Pause';
    motionBtn.setAttribute('aria-label', on ? 'Relancer les animations' : 'Mettre en pause les animations');
    if (on) { tilt.tx = 0; tilt.ty = 0; pointer = null; kickTilt(); }
    kickFinal();
    if (save) { try { localStorage.setItem('lpb-paused', on ? '1' : '0'); } catch (e) { /* stockage indisponible */ } }
  }
  motionBtn.addEventListener('click', () => setPaused(!document.documentElement.classList.contains('is-paused'), true));
  let storedPause = false;
  try { storedPause = localStorage.getItem('lpb-paused') === '1'; } catch (e) { storedPause = false; }
  setPaused(storedPause, false);

  /* ---------- Remerciement plein écran, puis P’tit Kiwi ---------- */
  // Ouvert uniquement après un enregistrement confirmé (voir l’envoi du formulaire).
  // Destination fixe, sans aucune donnée ajoutée à l’adresse.

  const MERCI_URL = 'https://www.ptit-kiwi.fr/';
  const MERCI_SECONDS = 15;
  const merci = $('#merci');
  const merciTitle = $('#merci-title');
  const merciCount = $('#merci-count');
  const merciStay = $('#merci-stay');
  const merciGo = $('#merci-go');
  const merciStatus = $('#merci-status');
  const merciClose = $('#merci-close');
  const merciDest = $('#merci-dest');
  const merciNum = $('#merci-num');
  const merciRing = $('#merci .merci-ring-fg');
  const merciOrb = $('#merci-orb');
  const merciMiniUrl = $('#merci-mini-url');
  const merciFor = $('#merci-for');
  const merciSite = $('#merci-site');
  const merciBurst = $('#merci-burst');
  const merciPops = $('#merci-pops');
  let popTimers = [];

  // Écran personnalisé : la bulle reprend l’aperçu du site, et la phrase principale cite son adresse.
  function merciPersonalize() {
    const name = shownName();
    if (merciMiniUrl) setText(merciMiniUrl, name || (state.noSite ? 'votre-activite.fr' : 'votre-site.fr'));
    if (merciFor) setHidden(merciFor, state.noSite || !name);
    if (merciSite && name) setText(merciSite, name);
    if (merciOrb && name) paletteFor(name.toLowerCase()).forEach((c, i) => merciOrb.style.setProperty('--c' + (i + 1), c));
  }

  // Célébration : la bulle éclate en gouttelettes autour de la coche.
  function merciCelebrate() {
    if (!merciBurst || motionOff()) return;
    merciBurst.textContent = '';
    setTimeout(() => { if (merci.open) burst(merciBurst, 1.7); }, 380);
  }

  // Bulles à éclater sur les côtés pendant le décompte (grands écrans seulement, jamais sur le texte).
  const POP_COLORS = ['239,122,164', '127,212,234', '195,177,247', '243,207,122', '168,238,219'];
  function spawnPop() {
    if (!merci.open || !merciPops) return;
    const w = window.innerWidth, h = window.innerHeight;
    const half = Math.min(400, w / 2 - 40);
    const right = Math.random() < 0.5;
    const x0 = right ? w / 2 + half : 36, x1 = right ? w - 36 : w / 2 - half;
    if (x1 - x0 < 60) return;
    const el = document.createElement('span');
    el.className = 'merci-pop';
    el.style.left = Math.round(x0 + Math.random() * (x1 - x0)) + 'px';
    el.style.top = Math.round(h * (0.14 + Math.random() * 0.7)) + 'px';
    el.style.setProperty('--s', Math.round(36 + Math.random() * 42) + 'px');
    el.style.setProperty('--c', POP_COLORS[Math.floor(Math.random() * POP_COLORS.length)]);
    el.style.setProperty('--d', (5 + Math.random() * 3).toFixed(1) + 's');
    el.innerHTML = '<b></b><i></i><i></i><i></i><i></i><i></i><i></i>';
    el.addEventListener('pointerdown', () => {
      el.classList.add('is-popped');
      setTimeout(() => el.remove(), 700);
      popTimers.push(setTimeout(spawnPop, 1500));
    }, { once: true });
    merciPops.appendChild(el);
  }
  function stopPops() {
    popTimers.forEach(clearTimeout);
    popTimers = [];
    if (merciPops) merciPops.textContent = '';
  }
  function startPops() {
    stopPops();
    if (!merciPops || motionOff() || window.innerWidth < 1100) return;
    for (let i = 0; i < 6; i++) popTimers.push(setTimeout(spawnPop, 700 + i * 220));
  }
  let merciTimer = 0;
  let merciStartTimer = 0;
  let merciLeft = 0;
  let merciLast = 0;
  let merciStopped = false;
  let merciLeaving = false;
  let merciClosing = false;
  let merciView = heroView;

  const merciText = (n) => 'Redirection automatique dans ' + n + NB + 'seconde' + (n > 1 ? 's' : '') + '.';

  // Chiffre et anneau du décompte (l’anneau se vide jusqu’à la redirection).
  function merciShow(ms) {
    const n = Math.max(1, Math.ceil(ms / 1000));
    setText(merciCount, merciText(n));
    if (merciNum) setText(merciNum, String(n));
    if (merciRing) merciRing.style.strokeDashoffset = (100 - Math.max(0, Math.min(1, ms / (MERCI_SECONDS * 1000))) * 100).toFixed(2);
  }

  function merciStopTimer() {
    clearInterval(merciTimer);
    clearTimeout(merciStartTimer);
    merciTimer = 0;
    merciStartTimer = 0;
  }

  function merciLeave() {
    if (merciLeaving) return;
    merciLeaving = true;
    merciStopTimer();
    window.location.assign(MERCI_URL);
  }

  function merciTick() {
    const now = performance.now();
    if (!document.hidden) merciLeft -= now - merciLast;
    merciLast = now;
    if (merciLeft <= 0) { merciLeave(); return; }
    merciShow(merciLeft);
  }

  function merciRun() {
    if (merciTimer || merciStopped || merciLeaving || !merci.open || document.hidden) return;
    merciLast = performance.now();
    merciTimer = setInterval(merciTick, 200);
  }

  function openMerci(v) {
    if (!merci) return;
    merciView = v;
    merciStopTimer();
    merciStopped = false;
    merciLeaving = false;
    merciLeft = MERCI_SECONDS * 1000;
    if (merciDest) merciDest.classList.remove('is-stopped');
    merciShow(merciLeft);
    merciStay.hidden = false;
    merciStatus.textContent = '';
    $$('dialog[open]').forEach((d) => { if (d !== merci) d.close(); });
    merciPersonalize();
    if (!merci.open) merci.showModal();
    merci.scrollTop = 0;
    merciCelebrate();
    startPops();
    try { merciTitle.focus({ preventScroll: true }); } catch (e) { merciTitle.focus(); }
    // Le décompte démarre une fois l’écran affiché (après son apparition).
    merciStartTimer = setTimeout(merciRun, motionOff() ? 0 : 450);
  }

  function closeMerciQuietly() {
    merciStopTimer();
    stopPops();
    merciStopped = true;
    if (merci.open) { merciClosing = true; merci.close(); }
    merciLeaving = false;
    const doneText = merciView.done.querySelector('.done-text');
    if (!merciView.done.hidden) { try { doneText.focus({ preventScroll: true }); } catch (e) { doneText.focus(); } }
  }

  if (merci) {
    merciGo.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      merciLeave();
    });
    merciClose.addEventListener('click', merciLeave);
    // Échap : la fermeture mène aussi vers P’tit Kiwi.
    merci.addEventListener('cancel', (event) => { event.preventDefault(); merciLeave(); });
    // L’évènement « close » arrive après coup : on distingue la fermeture voulue (retour arrière) d’une fermeture par Échap.
    merci.addEventListener('close', () => { if (merciClosing) { merciClosing = false; return; } merciLeave(); });
    merciStay.addEventListener('click', () => {
      merciStopped = true;
      merciStopTimer();
      setText(merciCount, 'Prenez votre temps. Cliquez sur le bouton lorsque vous souhaitez découvrir P’tit Kiwi.');
      if (merciDest) merciDest.classList.add('is-stopped');
      merciStay.hidden = true;
      try { merciGo.focus({ preventScroll: true }); } catch (e) { merciGo.focus(); }
      merciStatus.textContent = 'Redirection automatique annulée.';
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInterval(merciTimer); merciTimer = 0; } else merciRun(); });
    // Retour arrière depuis P’tit Kiwi (page restaurée telle quelle) : on n’affiche plus l’écran, sans relancer de redirection.
    window.addEventListener('pageshow', (event) => { if (event.persisted && merci.open) closeMerciQuietly(); });
  }

  /* ---------- Panneaux Avis et FAQ ---------- */

  $$('[data-open]').forEach((btn) => btn.addEventListener('click', () => {
    const dialog = document.getElementById(btn.dataset.open);
    if (dialog && !dialog.open) dialog.showModal();
    // Lien « Que comprend l’offre ? » : ouvre directement la bonne réponse de la FAQ.
    const item = btn.dataset.faq ? document.getElementById(btn.dataset.faq) : null;
    if (dialog && item && dialog.contains(item)) {
      item.open = true;
      const summary = item.querySelector('summary');
      requestAnimationFrame(() => {
        const r = item.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) {
          try { item.scrollIntoView({ block: 'start' }); } catch (e) { item.scrollIntoView(); }
        }
        try { summary.focus({ preventScroll: true }); } catch (e) { summary.focus(); }
      });
    }
  }));
  $$('dialog.panel').forEach((dialog) => {
    let downOnBackdrop = false;
    dialog.addEventListener('pointerdown', (event) => { downOnBackdrop = event.target === dialog; });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog && downOnBackdrop) dialog.close();
      downOnBackdrop = false;
    });
    $$('[data-close]', dialog).forEach((btn) => btn.addEventListener('click', () => dialog.close()));
  });

  render();
})();
